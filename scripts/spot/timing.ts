/**
 * 分步耗时打印 (对标 architecture.html 附录 B 的 SFX_TIMING)
 * 平台的几条链路都是多步串行（检索 → 拉预览 → 打分 → 下载 → 量包络 → 生成计划），
 * 卡住时需要知道卡在哪一步；全程静默只能靠猜。
 * 开关走 VW_TIMING=1，和原版的 SFX_TIMING 同义。
 */

export const timingOn = (): boolean => process.env.VW_TIMING === '1' || process.env.SFX_TIMING === '1';

export interface Timer {
  /** 记一步；返回这一步的毫秒数 */
  step(label: string): number;
  /** 打印汇总 */
  done(title?: string): void;
}

export function startTimer(scope: string): Timer {
  const on = timingOn();
  const t0 = Date.now();
  let last = t0;
  const steps: { label: string; ms: number }[] = [];

  return {
    step(label: string): number {
      const now = Date.now();
      const ms = now - last;
      last = now;
      steps.push({ label, ms });
      if (on) console.log(`  [timing] ${scope} · ${label}: ${ms}ms`);
      return ms;
    },
    done(title?: string) {
      if (!on) return;
      const total = Date.now() - t0;
      console.log(`  [timing] ${title ?? scope} 合计 ${total}ms`);
      const sorted = [...steps].sort((a, b) => b.ms - a.ms).slice(0, 5);
      sorted.forEach((s) =>
        console.log(`    ${String(Math.round((s.ms / Math.max(1, total)) * 100)).padStart(3)}%  ${s.label}  ${s.ms}ms`)
      );
    },
  };
}
