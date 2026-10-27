/**
 * CC0 素材 provider：Freesound（只取 CC0）+ Kenney 音效包（全部 CC0）
 *
 * 与 EpidemicProvider / LocalSynthProvider 同一个接口（检索 → 打分 → 取回），候选上带
 * source / license / url / author，落定时写进 manifest，`vw review` 据此核对许可证。
 *
 *   Freesound：REST API（https://freesound.org/apiv2），凭据 FREESOUND_API_KEY 放 .env。
 *     key 通过标准输入交给 curl 的请求头（-H @-），不进命令行参数、不进日志。
 *     只用 API key 时取的是 HQ 预览（ogg ≈ 192kbps）；做过一次 OAuth2 授权（vw sfx freesound auth）后取原始文件，
 *     令牌存 .env.freesound-oauth.json（被 .env.* 忽略，权限 600），访问令牌过期自动用刷新令牌续期。
 *   Kenney：先 `vw sfx kenney sync` 把音效包下到 out/kenney/<包>/ 并建索引（out/kenney/index.json），
 *     检索在本地索引里按文件名词元匹配。下载链接带哈希，同步时现抓资产页取当前链接，不写死。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PaletteSpec } from '../../src/shared/types.js';
import { Candidate, rankCandidates } from './scoring.js';
import { extractFeatures } from '../audio/features.js';
import type { SfxProvider } from './provider.js';

export const CC0_URL = 'http://creativecommons.org/publicdomain/zero/1.0/';

/* ------------------------------------------------------------------ */
/* 检索词                                                               */
/* ------------------------------------------------------------------ */

/** 分层音色的角色词 → 素材库里的自然检索词 */
const ROLE_QUERY: Record<string, string> = {
  'card-land': 'soft click tap',
  'count-tick': 'tick mechanical',
  'reveal-swell': 'swell rise',
  'focus-air': 'air whoosh short',
  'morph-slide': 'slide swish',
  stamp: 'stamp thud',
  'hero-hit': 'cinematic impact boom',
  'pre-hit': 'reverse swell',
  'room-tone': 'room tone',
};

/** 采购单 tags → 外部素材库的检索词：去掉 layered，角色词换成自然词，逗号与连字符变空格 */
export function naturalQuery(spec: Pick<PaletteSpec, 'tags' | 'alt'>): string {
  const parts = spec.tags
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== 'layered')
    .map((s) => ROLE_QUERY[s.toLowerCase()] ?? s);
  if (spec.alt) parts.push(spec.alt);
  return parts.join(' ').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 不参与匹配的泛词（包名里的 sounds / audio 会让所有文件都「命中」） */
const STOP = new Set(['sounds', 'sound', 'audio', 'sfx', 'fx']);

/** 文件名 / 包名 → 词元（impactMetal_heavy_000 → impact metal heavy） */
export function tokensOf(name: string): string[] {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z]+/)
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 1 && !STOP.has(s));
}

/** 采购单常用词 → Kenney 文件名里的叫法（它的词表很窄：impact / click / switch / select …） */
const KENNEY_SYN: Record<string, string[]> = {
  thud: ['impact', 'heavy'],
  stamp: ['impact', 'punch', 'heavy'],
  boom: ['impact', 'heavy'],
  hit: ['impact'],
  cinematic: ['impact', 'heavy'],
  tap: ['click', 'soft'],
  button: ['click', 'select'],
  tick: ['tick', 'click'],
  mechanical: ['switch'],
  swell: ['up', 'power'],
  rise: ['up', 'power'],
  slide: ['scroll'],
  swish: ['scroll'],
  confirm: ['confirmation'],
  notification: ['confirmation', 'bell'],
};

export function kenneyWords(query: string): string[] {
  const base = tokensOf(query.replace(/\s+/g, '_'));
  return [...new Set(base.flatMap((w) => [w, ...(KENNEY_SYN[w] ?? [])]))];
}

/** 取回：任意音频 → public/sfx-lib/<源>/<槽>[-n].wav（48k 立体声） */
function toWav(src: string, source: string, spec: PaletteSpec, variantIndex: number): string | null {
  const rel = spec.variants > 1 ? `sfx-lib/${source}/${spec.slot}-${variantIndex + 1}.wav` : `sfx-lib/${source}/${spec.slot}.wav`;
  const dest = path.join(process.cwd(), 'public', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', src, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', dest], { stdio: 'pipe' });
    return rel;
  } catch {
    return null;
  }
}

function probeDuration(file: string): number {
  try {
    return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf-8' }).trim()) || 0;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Freesound                                                           */
/* ------------------------------------------------------------------ */

function envVar(name: string): string | null {
  if (process.env[name]) return process.env[name]!;
  const env = path.join(process.cwd(), '.env');
  if (!fs.existsSync(env)) return null;
  const m = fs.readFileSync(env, 'utf-8').match(new RegExp(`^${name}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

export function freesoundKey(): string | null {
  return envVar('FREESOUND_API_KEY');
}

/* ---- OAuth2（取原始文件） ---- */

interface FreesoundOAuth {
  access_token: string;
  refresh_token: string;
  /** 访问令牌过期时刻（毫秒时间戳） */
  expiresAt: number;
}

const OAUTH_FILE = () => path.join(process.cwd(), '.env.freesound-oauth.json');

/** 授权页地址：用户在浏览器里打开、点授权，页面上会显示授权码（10 分钟内有效） */
export function freesoundAuthUrl(): string {
  const id = envVar('FREESOUND_CLIENT_ID');
  if (!id) throw new Error('没有 FREESOUND_CLIENT_ID（.env）');
  return `https://freesound.org/apiv2/oauth2/authorize/?client_id=${encodeURIComponent(id)}&response_type=code`;
}

/** 换令牌：表单整体从标准输入交给 curl，client_secret / code / 令牌都不进命令行参数 */
function tokenRequest(form: Record<string, string>): FreesoundOAuth {
  const id = envVar('FREESOUND_CLIENT_ID');
  const secret = freesoundKey();
  if (!id || !secret) throw new Error('没有 FREESOUND_CLIENT_ID / FREESOUND_API_KEY（.env）');
  const body = new URLSearchParams({ client_id: id, client_secret: secret, ...form }).toString();
  let out: string;
  try {
    out = execFileSync('curl', ['-sS', '--max-time', '60', '-X', 'POST', '--data-binary', '@-', 'https://freesound.org/apiv2/oauth2/access_token/'], { input: body, encoding: 'utf-8' });
  } catch (e) {
    throw new Error(`换令牌请求失败：${(e as Error).message.split('\n')[0]}`);
  }
  const j = JSON.parse(out);
  if (!j.access_token) throw new Error(`Freesound 拒绝：${j.error ?? ''} ${j.error_description ?? j.detail ?? ''}`.trim());
  const tok: FreesoundOAuth = { access_token: j.access_token, refresh_token: j.refresh_token, expiresAt: Date.now() + (Number(j.expires_in) || 86400) * 1000 };
  fs.writeFileSync(OAUTH_FILE(), JSON.stringify(tok), { mode: 0o600 });
  fs.chmodSync(OAUTH_FILE(), 0o600);
  return tok;
}

/** 用授权码换令牌并保存 */
export function freesoundAuthorize(code: string): { expiresAt: number } {
  const t = tokenRequest({ grant_type: 'authorization_code', code: code.trim() });
  return { expiresAt: t.expiresAt };
}

/** 当前可用的访问令牌：过期前 5 分钟自动刷新；没授权过返回 null */
export function freesoundAccessToken(): string | null {
  if (!fs.existsSync(OAUTH_FILE())) return null;
  const t: FreesoundOAuth = JSON.parse(fs.readFileSync(OAUTH_FILE(), 'utf-8'));
  if (t.expiresAt - Date.now() > 5 * 60 * 1000) return t.access_token;
  try {
    return tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token }).access_token;
  } catch (e) {
    console.warn(`[freesound] 令牌续期失败（${(e as Error).message}）—— 重新跑 vw sfx freesound auth；这次先用预览`);
    return null;
  }
}

/** 授权状态（不含任何令牌内容） */
export function freesoundAuthStatus(): string {
  if (!fs.existsSync(OAUTH_FILE())) return '未授权：取的是 HQ 预览';
  const t: FreesoundOAuth = JSON.parse(fs.readFileSync(OAUTH_FILE(), 'utf-8'));
  const min = Math.round((t.expiresAt - Date.now()) / 60000);
  return min > 0 ? `已授权：访问令牌还有 ${min} 分钟，过期自动续期` : '已授权：访问令牌已过期，下次取素材时自动续期';
}

const FS_CACHE = () => path.join(process.cwd(), 'out', 'freesound');

export class FreesoundProvider implements SfxProvider {
  readonly name = 'freesound' as const;
  readonly label = 'Freesound（只取 CC0，HQ 预览）';

  constructor(private key = freesoundKey()) {}

  available(): boolean {
    return Boolean(this.key);
  }

  private get(endpoint: string, params: Record<string, string>): any {
    const args = ['-sS', '--fail', '--max-time', '60', '-G', '-H', '@-', `https://freesound.org/apiv2/${endpoint}`];
    for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
    const out = execFileSync('curl', args, { input: `Authorization: Token ${this.key}\n`, encoding: 'utf-8', maxBuffer: 1 << 24 });
    return JSON.parse(out);
  }

  searchSfx(spec: PaletteSpec, options: { keep?: number; preview?: number } = {}): Candidate[] {
    if (!this.key) return [];
    const keep = options.keep ?? 8;
    const previewN = options.preview ?? 6;
    const query = naturalQuery(spec);
    const lo = Math.max(0.02, spec.dur[0] * 0.6);
    const hi = spec.dur[1] * 1.6;
    const collected = new Map<string, Candidate>();
    for (const sort of ['score', 'downloads_desc'] as const) {
      let res: any;
      try {
        res = this.get('search/text/', {
          query,
          filter: `license:"Creative Commons 0" duration:[${lo.toFixed(2)} TO ${hi.toFixed(2)}]`,
          sort,
          fields: 'id,name,tags,duration,license,username,url,previews,type',
          page_size: String(keep * 2),
        });
      } catch (e) {
        console.warn(`[freesound] 检索失败（${query} / ${sort}）: ${(e as Error).message.split('\n')[0]}`);
        continue;
      }
      for (const [i, r] of (res?.results ?? []).entries()) {
        // 双保险：过滤参数之外再核一遍许可证
        if (!String(r.license).includes('publicdomain/zero')) continue;
        const id = `fs:${r.id}`;
        const prev = collected.get(id);
        collected.set(id, {
          id,
          title: `${r.name} — ${r.username}`,
          tags: r.tags ?? [],
          slugs: [],
          durationSec: Number(r.duration) || 0,
          previewUrl: r.previews?.['preview-hq-ogg'] ?? r.previews?.['preview-hq-mp3'],
          rank: {
            relevance: sort === 'score' ? i + 1 : prev?.rank.relevance ?? 999,
            popularity: sort === 'downloads_desc' ? i + 1 : prev?.rank.popularity ?? 999,
          },
          source: 'freesound',
          license: CC0_URL,
          url: r.url,
          author: r.username,
          fileType: r.type,
        });
      }
    }
    const cands = [...collected.values()];
    for (const c of cands.slice(0, previewN)) {
      const f = this.cachePreview(c);
      const feat = f ? extractFeatures(f) : null;
      if (feat) c.feat = feat;
    }
    if (!cands.length) console.warn(`[freesound] 「${query}」在 CC0 + 时长 [${lo.toFixed(2)}, ${hi.toFixed(2)}]s 里没有结果 —— 改采购单 tags / alt 或放宽时长`);
    return rankCandidates(spec, cands);
  }

  /** HQ 预览缓存到 out/freesound/（音效与配乐共用） */
  cachePreview(c: Candidate): string | null {
    if (!c.previewUrl) return null;
    const file = path.join(FS_CACHE(), `${c.id.slice(3)}${path.extname(new URL(c.previewUrl).pathname)}`);
    if (fs.existsSync(file)) return file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '120', '-o', `${file}.part`, c.previewUrl], { stdio: 'pipe' });
      fs.renameSync(`${file}.part`, file);
      return file;
    } catch {
      if (fs.existsSync(`${file}.part`)) fs.unlinkSync(`${file}.part`);
      return null;
    }
  }

  /** 授权过就取原始文件（无损），否则退回 HQ 预览，并明说 */
  fetchWav(spec: PaletteSpec, cand: Candidate, variantIndex: number): string | null {
    const orig = this.cacheOriginal(cand);
    if (orig) return toWav(orig, 'freesound', spec, variantIndex);
    console.warn(`[freesound] ${cand.title}：没取到原始文件，用 HQ 预览（${freesoundAuthStatus()}）`);
    const f = this.cachePreview(cand);
    return f ? toWav(f, 'freesound', spec, variantIndex) : null;
  }

  /** 原始文件缓存到 out/freesound/original/（要授权；没授权返回 null） */
  cacheOriginal(cand: Candidate): string | null {
    const id = cand.id.slice(3);
    const dir = path.join(FS_CACHE(), 'original');
    const hit = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.startsWith(`${id}.`)) : undefined;
    if (hit) return path.join(dir, hit);
    const token = freesoundAccessToken();
    if (!token) return null;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}.${(cand.fileType ?? 'wav').replace(/[^a-z0-9]/gi, '') || 'wav'}`);
    try {
      execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '300', '-H', '@-', '-o', `${file}.part`, `https://freesound.org/apiv2/sounds/${id}/download/`], {
        input: `Authorization: Bearer ${token}\n`,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      fs.renameSync(`${file}.part`, file);
      return file;
    } catch {
      if (fs.existsSync(`${file}.part`)) fs.unlinkSync(`${file}.part`);
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Kenney                                                              */
/* ------------------------------------------------------------------ */

/** 缺省同步的音效包（kenney.nl/assets/<名>） */
export const KENNEY_PACKS = ['interface-sounds', 'ui-audio', 'impact-sounds', 'digital-audio'];

export interface KenneyEntry {
  pack: string;
  /** 相对 out/kenney/ */
  file: string;
  tokens: string[];
  durationSec: number;
  license: string;
  page: string;
}

const KENNEY_DIR = () => path.join(process.cwd(), 'out', 'kenney');

export function readKenneyIndex(): KenneyEntry[] {
  const p = path.join(KENNEY_DIR(), 'index.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : [];
}

/** 下载音效包并重建索引；只认 Audio 下的 ogg / wav 与包里的 License.txt（必须写明 CC0，否则整包不收） */
export function syncKenney(packs: string[] = KENNEY_PACKS): { packs: string[]; files: number; skipped: string[] } {
  const root = KENNEY_DIR();
  const skipped: string[] = [];
  for (const pack of packs) {
    const dir = path.join(root, pack);
    if (fs.existsSync(path.join(dir, 'License.txt'))) continue;
    const page = `https://kenney.nl/assets/${pack}`;
    let html = '';
    try {
      html = execFileSync('curl', ['-sSL', '--fail', '--max-time', '60', page], { encoding: 'utf-8', maxBuffer: 1 << 24 });
    } catch {
      skipped.push(`${pack}（资产页打不开）`);
      continue;
    }
    const zip = html.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"']+\.zip/)?.[0];
    if (!zip) {
      skipped.push(`${pack}（页面上没有 zip 链接）`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    const zf = path.join(root, `${pack}.zip`);
    try {
      execFileSync('curl', ['-sSL', '--fail', '--max-time', '300', '-o', zf, zip], { stdio: 'pipe' });
      // Info-ZIP 默认拒绝绝对路径与 ../ 条目
      execFileSync('unzip', ['-q', '-o', zf, '-d', dir], { stdio: 'pipe' });
    } catch {
      skipped.push(`${pack}（下载或解压失败）`);
      continue;
    } finally {
      if (fs.existsSync(zf)) fs.unlinkSync(zf);
    }
  }

  const index: KenneyEntry[] = [];
  for (const pack of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const dir = path.join(root, pack);
    if (!fs.statSync(dir).isDirectory()) continue;
    const lic = path.join(dir, 'License.txt');
    if (!fs.existsSync(lic) || !/publicdomain\/zero|CC0/i.test(fs.readFileSync(lic, 'utf-8'))) {
      skipped.push(`${pack}（License.txt 不是 CC0，不收）`);
      continue;
    }
    for (const f of walkAudio(dir)) {
      const rel = path.relative(root, f);
      index.push({ pack, file: rel, tokens: [...new Set([...tokensOf(path.basename(f)), ...tokensOf(pack)])], durationSec: probeDuration(f), license: CC0_URL, page: `https://kenney.nl/assets/${pack}` });
    }
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(index, null, 1));
  return { packs: [...new Set(index.map((e) => e.pack))], files: index.length, skipped };
}

function walkAudio(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAudio(p, out);
    else if (/\.(ogg|wav)$/i.test(e.name)) out.push(p);
  }
  return out;
}

export class KenneyProvider implements SfxProvider {
  readonly name = 'kenney' as const;
  readonly label = 'Kenney 音效包（CC0，本地索引）';

  available(): boolean {
    return readKenneyIndex().length > 0;
  }

  searchSfx(spec: PaletteSpec, options: { keep?: number; preview?: number } = {}): Candidate[] {
    const keep = options.keep ?? 8;
    const words = kenneyWords(naturalQuery(spec));
    const hits = readKenneyIndex()
      .map((e) => ({ e, n: words.filter((w) => e.tokens.includes(w)).length }))
      .filter((h) => h.n > 0)
      .sort((a, b) => b.n - a.n || a.e.file.localeCompare(b.e.file))
      .slice(0, keep * 2);
    if (!hits.length) console.warn(`[kenney] 「${words.join(' ')}」没有命中任何文件名 —— 先 vw sfx kenney sync，或换 tags`);
    const cands: Candidate[] = hits.map(({ e }, i) => {
      const abs = path.join(KENNEY_DIR(), e.file);
      return {
        id: `kenney:${e.file}`,
        title: `${path.basename(e.file)}（Kenney · ${e.pack}）`,
        tags: e.tokens,
        slugs: [],
        durationSec: e.durationSec,
        rank: { relevance: i + 1, popularity: i + 1 },
        feat: extractFeatures(abs) ?? undefined,
        source: 'kenney',
        license: e.license,
        url: e.page,
        author: 'Kenney',
      };
    });
    return rankCandidates(spec, cands);
  }

  fetchWav(spec: PaletteSpec, cand: Candidate, variantIndex: number): string | null {
    const abs = path.join(KENNEY_DIR(), cand.id.replace(/^kenney:/, ''));
    return fs.existsSync(abs) ? toWav(abs, 'kenney', spec, variantIndex) : null;
  }
}
