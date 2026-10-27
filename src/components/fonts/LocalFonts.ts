/**
 * 加载本地字体（vw font fetch 取到 public/fonts/<slug>/ 的）：useLocalFonts(['cormorant-garamond', 'noto-serif-sc--<片>'])
 *
 * 读每个目录的 faces.json，逐个 new FontFace 加进 document.fonts；全部就绪前挂渲染锁，渲出来的第一帧就是对的字体。
 * 之后 CSS 里按 family 名字用（"Cormorant Garamond"、"Noto Serif SC"）。同一个 slug 整页只加载一次。
 */
import { useEffect, useState } from 'react';
import { continueRender, delayRender, cancelRender, staticFile } from 'remotion';

interface FaceEntry {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  file: string;
}

const loaded = new Map<string, Promise<void>>();

export function loadLocalFont(slug: string): Promise<void> {
  let p = loaded.get(slug);
  if (!p) {
    p = (async () => {
      const res = await fetch(staticFile(`fonts/${slug}/faces.json`));
      if (!res.ok) throw new Error(`没有本地字体 public/fonts/${slug}/（先 vw font fetch）`);
      const faces = (await res.json()) as FaceEntry[];
      await Promise.all(
        faces.map(async (f) => {
          const face = new FontFace(f.family, `url(${staticFile(`fonts/${slug}/${f.file}`)})`, {
            weight: f.weight,
            style: f.style,
            ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
          });
          document.fonts.add(await face.load());
        })
      );
    })();
    loaded.set(slug, p);
  }
  return p;
}

/** 片子世界组件里调用：字体全部就绪前挂渲染锁；返回是否就绪 */
export function useLocalFonts(slugs: string[]): boolean {
  const key = slugs.join('|');
  const [handle] = useState(() => delayRender(`本地字体 ${key}`));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all(slugs.map(loadLocalFont))
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handle]);
  return ready;
}
