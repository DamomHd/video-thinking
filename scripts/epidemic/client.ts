/**
 * Epidemic Sound 官方 MCP 客户端
 * 对标 architecture.html §15.3 / §16.3：
 *   传输 JSON-RPC over HTTP(S)，用 curl 发（curl 会读代理环境变量）；
 *   握手 initialize(2025-03-26) → notifications/initialized → tools/call；
 *   会话走 Mcp-Session-Id 头，响应兼容 JSON 与 SSE 两种格式；失败退避重试 4 次。
 * 没有凭据时 available() 为 false —— 调用方必须显式改走本地合成 provider，
 * 绝不返回假候选冒充检索结果。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MCP_ENDPOINT = 'https://www.epidemicsound.com/a/mcp-service/mcp';
export const MCP_PROTOCOL_VERSION = '2025-03-26';

export interface McpCallResult {
  ok: boolean;
  data?: any;
  error?: string;
}

/** 从环境变量读密钥；缺省时回退读 .env 里的同名行（.env 已 gitignore） */
export function readApiKey(): string | null {
  if (process.env.EPIDEMIC_SOUND_API_KEY) return process.env.EPIDEMIC_SOUND_API_KEY;
  const envFile = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return null;
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^\s*EPIDEMIC_SOUND_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

export class EpidemicMcpClient {
  private sessionId: string | null;
  private apiKey: string | null;
  private initialized = false;
  private keepAlive: NodeJS.Timeout | null = null;

  constructor(private endpoint = MCP_ENDPOINT) {
    // 工作台常驻一个已握手的会话，起子进程时用 EPIDEMIC_MCP_SESSION 交过去，省掉握手
    this.sessionId = process.env.EPIDEMIC_MCP_SESSION || null;
    this.apiKey = readApiKey();
  }

  /** 是否具备真实调用能力 */
  available(): boolean {
    return Boolean(this.apiKey);
  }

  get session(): string | null {
    return this.sessionId;
  }

  /** 握手。已有会话时直接复用；服务端回 404 时自动重握手 */
  initialize(): boolean {
    if (!this.available()) return false;
    if (this.initialized && this.sessionId) return true;

    const res = this.rpc('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'video-workbench', version: '0.1.0' },
    });
    if (!res.ok) return false;

    this.initialized = true;
    // 通知服务端握手完成
    this.rpc('notifications/initialized', {}, { notification: true });
    return true;
  }

  /** 每 4 分钟 ping 一次保活（工作台服务端常驻时用） */
  startKeepAlive(): void {
    if (this.keepAlive || !this.available()) return;
    this.keepAlive = setInterval(() => {
      this.rpc('ping', {});
    }, 4 * 60 * 1000);
    this.keepAlive.unref?.();
  }

  stopKeepAlive(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  /** 调一个 MCP 工具 */
  callTool(name: string, args: Record<string, unknown>): McpCallResult {
    if (!this.initialize()) {
      return { ok: false, error: '没有 EPIDEMIC_SOUND_API_KEY，无法调用 MCP' };
    }
    const res = this.rpc('tools/call', { name, arguments: args });
    if (!res.ok) return res;

    // MCP 的 content 里一般是一段 JSON 文本
    const content = res.data?.result?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          let payload: unknown;
          try {
            payload = JSON.parse(part.text);
          } catch {
            return { ok: true, data: part.text };
          }
          return liftGraphqlErrors(payload);
        }
      }
    }
    return liftGraphqlErrors(res.data?.result);
  }

  /** 列出服务端暴露的工具（探针用） */
  listTools(): McpCallResult {
    if (!this.initialize()) return { ok: false, error: '未握手' };
    return this.rpc('tools/list', {});
  }

  /** 下载一个 URL 到本地（WAV / 预览 mp3 共用） */
  static download(url: string, destFile: string): boolean {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    const tmp = `${destFile}.part`;
    try {
      execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '180', '-o', tmp, url], {
        stdio: 'pipe',
      });
      if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) return false;
      fs.renameSync(tmp, destFile);
      return true;
    } catch {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      return false;
    }
  }

  /** JSON-RPC 发送（curl，带退避重试与 SSE 兼容） */
  private rpc(
    method: string,
    params: Record<string, unknown>,
    options: { notification?: boolean; attempt?: number } = {}
  ): McpCallResult {
    const attempt = options.attempt ?? 0;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      ...(options.notification ? {} : { id: Date.now() }),
      method,
      params,
    });

    const args = [
      '-sS',
      '-i',
      '--max-time',
      '120',
      '-X',
      'POST',
      this.endpoint,
      '-H',
      'Content-Type: application/json',
      '-H',
      'Accept: application/json, text/event-stream',
      '-H',
      `Authorization: Bearer ${this.apiKey}`,
      '-H',
      `MCP-Protocol-Version: ${MCP_PROTOCOL_VERSION}`,
    ];
    if (this.sessionId) args.push('-H', `Mcp-Session-Id: ${this.sessionId}`);
    args.push('--data-binary', body);

    let raw = '';
    try {
      raw = execFileSync('curl', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e: any) {
      if (attempt < 3) {
        sleepSync(400 * Math.pow(2, attempt));
        return this.rpc(method, params, { ...options, attempt: attempt + 1 });
      }
      return { ok: false, error: `curl 失败: ${e.message}` };
    }

    const { status, headers, bodyText } = splitHttpResponse(raw);

    // 会话过期：重新握手一次
    if (status === 404 && this.sessionId) {
      this.sessionId = null;
      this.initialized = false;
      if (attempt < 3) return this.rpc(method, params, { ...options, attempt: attempt + 1 });
    }
    if (status >= 500 && attempt < 3) {
      sleepSync(400 * Math.pow(2, attempt));
      return this.rpc(method, params, { ...options, attempt: attempt + 1 });
    }
    if (status >= 400) {
      return { ok: false, error: `HTTP ${status}: ${bodyText.slice(0, 300)}` };
    }

    const sid = headers['mcp-session-id'];
    if (sid) this.sessionId = sid;

    if (options.notification) return { ok: true };

    const payload = parseJsonOrSse(bodyText);
    if (!payload) return { ok: false, error: `无法解析响应: ${bodyText.slice(0, 300)}` };
    if (payload.error) {
      return { ok: false, error: `RPC 错误 ${payload.error.code}: ${payload.error.message}` };
    }
    return { ok: true, data: payload };
  }
}

/**
 * GraphQL 层的错误要抬成调用失败。
 *
 * 这一层很容易漏：JSON-RPC 调用本身成功（HTTP 200、没有 rpc error），
 * 但返回体里是 `{errors:[{message, extensions:{code}}], data:null}`。
 * 不识别的话，「没有下载权限」会表现成「成功但是没有 url」，
 * 调用方只能猜是接口变了还是权限不够 —— 实际踩到的就是这个（FORBIDDEN）。
 */
export function liftGraphqlErrors(payload: any): McpCallResult {
  const errs = payload?.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    const detail = errs
      .map((e: any) => {
        const code = e?.extensions?.code ? `${e.extensions.code}: ` : '';
        const where = Array.isArray(e?.path) ? ` @${e.path.join('.')}` : '';
        return `${code}${e?.message ?? '未知错误'}${where}`;
      })
      .join('; ');
    return { ok: false, error: detail, data: payload };
  }
  return { ok: true, data: payload };
}

/** 拆 curl -i 的响应：状态行 + 头 + 体（跟随重定向时取最后一段） */
export function splitHttpResponse(raw: string): {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
} {
  const chunks = raw.split(/\r?\n\r?\n/);
  // 从后往前找最后一个以 HTTP/ 开头的头块
  let headIdx = 0;
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (/^HTTP\/\d/.test(chunks[i])) {
      headIdx = i;
      break;
    }
  }
  const headBlock = chunks[headIdx] ?? '';
  const bodyText = chunks.slice(headIdx + 1).join('\n\n');

  const lines = headBlock.split(/\r?\n/);
  const status = Number(lines[0]?.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/)?.[1] ?? 0);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { status, headers, bodyText };
}

/** 兼容 JSON 与 SSE（data: 行）两种响应格式 */
export function parseJsonOrSse(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* 落到 SSE 解析 */
    }
  }
  const datas = trimmed
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter((l) => l && l !== '[DONE]');
  for (let i = datas.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(datas[i]);
    } catch {
      /* 继续往前找 */
    }
  }
  return null;
}

function sleepSync(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* 退避：脚本是串行的，忙等可接受 */
  }
}
