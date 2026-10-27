import { planFlight } from '../shared/flight';

/**
 * 漫游探针的路线（内容中性：一片立柱阵列里穿行）。
 * 给 FlightProbe 和 `vw blender flight --module=src/probe/flightPlan.ts --export=PROBE_FLIGHT` 共用。
 */
export const PROBE_FLIGHT = planFlight(
  [
    { pos: [0, 3, 40], fov: 40 },
    { pos: [-12, 4, 18] },
    { pos: [5, 10, 0], hold: 1.0 },
    { pos: [14, 3, -16] },
    { pos: [4, 9, -38], fov: 30 },
  ],
  { moveSec: 7, start: 0.3 }
);
