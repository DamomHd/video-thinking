/**
 * 异步子进程作业 (对标 architecture.html §18.1 的第 ③ 级执行)
 *
 * 工作台的后端是单线程的 node http server。
 * 像「同步编舞」这种操作要做：比对 spots → 补素材（可能下载）→ 重跑计划（逐条 ffmpeg 量包络）
 * → 重新解码整首配乐做分析 → 求解 —— 在 200 秒的长片上是几十秒到几分钟。
 * 如果在请求里 await 它，这段时间整个服务都不响应：
 * 连 <video> 要的 Range 请求都拿不到，界面像死了一样。
 *
 * 原版踩过同一个坑（"原来用 execSync，改编那 1–3 分钟会冻住整个 Vite"），
 * 解法也一样：丢给子进程，请求立刻返回作业 id，前端轮询进度。
 */

import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';

export type JobState = 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  label: string;
  state: JobState;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  /** 子进程输出的最后若干行，给前端显示进度 */
  tail: string[];
  /** 从输出里解析出的一句话进度 */
  progress?: string;
}

const MAX_TAIL = 60;
const jobs = new Map<string, Job>();
const procs = new Map<string, ChildProcess>();

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** 同一个 label 已经在跑就不要重复起（避免双击按钮起两个） */
export function findRunning(label: string): Job | undefined {
  return [...jobs.values()].find((j) => j.label === label && j.state === 'running');
}

/**
 * 起一个 `vw <args…>` 子进程。
 * 走 CLI 而不是直接 import，是为了让后端和命令行走**同一条代码路径** ——
 * 工作台里点出来的结果和手敲命令出来的结果不会有第二套逻辑。
 */
export function startJob(label: string, args: string[], env: Record<string, string> = {}): Job {
  const existing = findRunning(label);
  if (existing) return existing;

  const id = `${label.replace(/[^\w-]+/g, '_')}-${Date.now().toString(36)}`;
  const job: Job = {
    id,
    label,
    state: 'running',
    startedAt: new Date().toISOString(),
    tail: [],
  };
  jobs.set(id, job);

  const child = spawn('npx', ['tsx', path.join(process.cwd(), 'bin', 'vw.ts'), ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.set(id, child);

  const push = (chunk: Buffer) => {
    for (const raw of chunk.toString().split('\n')) {
      const line = raw.replace(/\r/g, '').trimEnd();
      if (!line) continue;
      job.tail.push(line);
      if (job.tail.length > MAX_TAIL) job.tail.shift();
      // 带 ① ② ③ ④ 或 ✓ 的行当作进度
      if (/[①②③④✓✗⚠]/.test(line)) job.progress = line.trim();
    }
  };

  child.stdout?.on('data', push);
  child.stderr?.on('data', push);

  child.on('close', (code) => {
    job.state = code === 0 ? 'done' : 'failed';
    job.exitCode = code ?? -1;
    job.finishedAt = new Date().toISOString();
    procs.delete(id);
  });

  child.on('error', (e) => {
    job.state = 'failed';
    job.tail.push(`[spawn error] ${e.message}`);
    job.finishedAt = new Date().toISOString();
    procs.delete(id);
  });

  return job;
}

/* ------------------------------------------------------------------ */
/* 第 ④ 级：预改编队列                                                  */
/* ------------------------------------------------------------------ */

/**
 * 预改编是后台批量活：一段一次接口闭环，1–3 分钟一个。
 * 并发开太大会把 MCP 会话打爆，也会让 ffmpeg 抢光 CPU（解码分析是 CPU 密集的），
 * 所以照 §18.1 限到同时 2 个，其余排队。
 */
const MAX_CONCURRENT_PREPARE = 2;

interface QueuedJob {
  label: string;
  args: string[];
  env: Record<string, string>;
}

const queue: QueuedJob[] = [];
const queuedLabels = new Set<string>();
let runningPrepare = 0;

export interface QueueStatus {
  running: number;
  waiting: number;
  labels: string[];
}

export function queueStatus(): QueueStatus {
  return { running: runningPrepare, waiting: queue.length, labels: [...queuedLabels] };
}

function pump(): void {
  while (runningPrepare < MAX_CONCURRENT_PREPARE && queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    queuedLabels.delete(next.label);
    runningPrepare++;
    const job = startJob(next.label, next.args, next.env);
    const watch = setInterval(() => {
      const j = jobs.get(job.id);
      if (!j || j.state === 'running') return;
      clearInterval(watch);
      runningPrepare--;
      pump();
    }, 500);
    // 别让这个定时器把进程吊住
    if (typeof watch.unref === 'function') watch.unref();
  }
}

/** 排队跑一个作业；同名的已在跑或已在队里就不重复入队 */
export function enqueueJob(
  label: string,
  args: string[],
  env: Record<string, string> = {}
): { queued: boolean; status: QueueStatus } {
  if (findRunning(label) || queuedLabels.has(label)) {
    return { queued: false, status: queueStatus() };
  }
  queue.push({ label, args, env });
  queuedLabels.add(label);
  pump();
  return { queued: true, status: queueStatus() };
}

/** 关服务时把还在跑的子进程收掉 */
export function killAllJobs(): void {
  queue.length = 0;
  queuedLabels.clear();
  for (const [, child] of procs) {
    try {
      child.kill();
    } catch {
      /* 已经退了 */
    }
  }
  procs.clear();
}
