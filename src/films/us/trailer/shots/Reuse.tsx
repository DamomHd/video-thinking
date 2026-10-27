import React from 'react';
import { WarpProvider } from '../../../../components/WarpProvider';
import { Reframe } from '../../../../components/Reframe';
import { knotMap, Knot } from '../../../../shared/warp';
import { camOut, clamp01 } from '../../../../shared/anim';
import {
  OpenScene,
  RecordScene,
  RiverScene,
  InsightsScene,
  PrivacyScene,
  FinaleScene,
} from '../../scenes/Scenes';
import { FILM_PLAN } from '../../timeline';
import { TrailerShot } from '../timeline';

/**
 * 复用镜头 (对标 architecture.html §6.5)
 * 把正片的幕原样包进 WarpProvider(knotMap(...))：
 *   外层给的是预告片的镜头内秒，映射出来的是正片幕内秒，
 *   于是"正片第 1.8s 的落版绽放"被钉到"预告片的第 0 拍"。
 * 外面再套一层 Reframe，按真实时间慢推、重新取景 —— 推的是放映时间，不跟着 warp 走。
 *
 * 约定：幕组件只收 t 这个 prop，不自己读时间，所以在外面包一层就够了。
 */

const SCENES: Record<string, React.FC<{ t: number; dur: number }>> = {
  prologue: OpenScene,
  galaxy: RiverScene,
  record: RecordScene,
  insights: InsightsScene,
  privacy: PrivacyScene,
  finale: FinaleScene,
};

export interface ReuseShotProps {
  shot: TrailerShot;
  /** 镜头内秒（0 起，放映时间） */
  t: number;
}

export const ReuseShot: React.FC<ReuseShotProps> = ({ shot, t }) => {
  const Scene = shot.sceneId ? SCENES[shot.sceneId] : undefined;
  if (!Scene || !shot.sceneId) {
    return <div style={{ color: '#fff', padding: 40 }}>未知复用幕: {shot.sceneId}</div>;
  }

  const knots: Knot[] = (shot.knots ?? [[0, 0], [shot.toSec - shot.fromSec, shot.toSec - shot.fromSec]])
    .map(([outer, inner]) => ({ outer, inner }));
  const map = knotMap(knots);

  // Reframe 按放映时间慢推，用对数缓动，收尾不突兀
  const rf = shot.reframe;
  const p = camOut(clamp01(t / Math.max(0.001, shot.toSec - shot.fromSec)));
  const scale = rf ? rf.fromScale + (rf.toScale - rf.fromScale) * p : 1;
  const panX = rf?.panX ? rf.panX * p : 0;
  const panY = rf?.panY ? rf.panY * p : 0;

  const sceneDur = FILM_PLAN.byId[shot.sceneId]?.dur ?? 8;

  return (
    <Reframe scale={scale} panX={panX} panY={panY}>
      <WarpProvider outerTime={t} map={map}>
        {(warped) => <Scene t={warped} dur={sceneDur} />}
      </WarpProvider>
    </Reframe>
  );
};

/** 给声音层用：这个镜头的时间映射函数（预告片镜头内秒 → 正片幕内秒） */
export function shotMap(shot: TrailerShot) {
  const knots: Knot[] = (shot.knots ?? [[0, 0], [shot.toSec - shot.fromSec, shot.toSec - shot.fromSec]])
    .map(([outer, inner]) => ({ outer, inner }));
  return knotMap(knots);
}
