/**
 * huashu-clip 画法要用的全局：window.CLIPS（画法登记表）和 window.CLIP（几个画图辅助函数）。
 * 必须在画法文件之前执行（load.ts 第一个 import 它）。
 * 对应上游 clip.js 里「helpers for grammar files」那一段，只保留画法实际用到的：fit / sub / beats / rid / mark。
 * mark 在上游给工作台登记可点选区域，本工程不用，记一个空函数。
 */

const w = window as unknown as Record<string, any>;

w.CLIPS = w.CLIPS || {};
const C = (w.CLIP = w.CLIP || {});

C.fit = (iw: number, ih: number, bx: number, by: number, bw: number, bh: number) => {
  const s = Math.min(bw / iw, bh / ih);
  const width = iw * s;
  const height = ih * s;
  return { x: bx + (bw - width) / 2, y: by + (bh - height) / 2, w: width, h: height, s };
};
C.sub = (r: number[], box: { x: number; y: number; w: number; h: number }) => ({ x: box.x + r[0] * box.w, y: box.y + r[1] * box.h, w: r[2] * box.w, h: r[3] * box.h });
C.beats = (cues: { at: number }[], name: (q: any) => string | null) => {
  const n: Record<string, number> = {};
  return cues
    .map((q) => {
      const b = name(q);
      if (!b) return null;
      n[b] = (n[b] || 0) + 1;
      return { id: b === 'title' && n[b] === 1 ? 'title' : `${b}-${n[b]}`, at: q.at };
    })
    .filter(Boolean);
};
C.rid = (base: string, i: number) => `${base}-${i}`;
C.mark = () => undefined;

export {};
