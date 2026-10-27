/**
 * 工业级资源就绪守门 Hook (Deterministic Resource Ready Guard)
 * 严格遵循 LoomCare §7 规范第 4 条：
 * "资源加载一律挂 delayRender：字体、贴图、glb 都是；等资源就位才画画面"
 */

import { useEffect, useRef, useState } from 'react';
import { delayRender, continueRender } from 'remotion';

export interface UseReadyOptions {
  label?: string;
  timeoutMs?: number;
}

/**
 * 挂载 Remotion delayRender 锁，直到所有 Promise 或条件完全就绪
 */
export function useReady(
  isReady: boolean | (() => Promise<unknown>),
  options: UseReadyOptions = {}
): boolean {
  const { label = 'ResourceReadyGuard', timeoutMs = 30000 } = options;
  const [ready, setReady] = useState(typeof isReady === 'boolean' ? isReady : false);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    // 立即挂上 Remotion 渲染锁
    const handle = delayRender(label, { timeoutInMilliseconds: timeoutMs });
    handleRef.current = handle;

    let isMounted = true;

    const release = () => {
      if (handleRef.current !== null) {
        continueRender(handleRef.current);
        handleRef.current = null;
      }
    };

    if (typeof isReady === 'boolean') {
      if (isReady) {
        setReady(true);
        release();
      }
    } else {
      isReady()
        .then(() => {
          if (isMounted) {
            setReady(true);
            release();
          }
        })
        .catch((err) => {
          console.error(`[useReady] Error loading resources for ${label}:`, err);
          if (isMounted) {
            release();
          }
        });
    }

    return () => {
      isMounted = false;
      release();
    };
  }, [isReady, label, timeoutMs]);

  return ready;
}
