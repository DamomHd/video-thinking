/**
 * 2D 四角像素点 ↔ CSS 3D 射影矩阵（Homography 单应性变换）
 * 用于将 DOM 手机屏幕贴合到 Blender 预渲染机身的四个角
 */

export type Point2D = [number, number];
export type Quad = [Point2D, Point2D, Point2D, Point2D]; // [TL, TR, BR, BL]

/**
 * 根据源矩形尺寸与目标四边形顶点，计算 CSS matrix3d(a1..a16) 变换字符串
 */
export function quadMatrix3d(srcW: number, srcH: number, quad: Quad): string {
  const [p0, p1, p2, p3] = quad;
  const H = solveHomography(
    [[0, 0], [srcW, 0], [srcW, srcH], [0, srcH]],
    [p0, p1, p2, p3]
  );
  // 提升为 4x4 列主序矩阵
  const m = [
    H[0], H[3], 0, H[6],
    H[1], H[4], 0, H[7],
    0,    0,    1, 0,
    H[2], H[5], 0, H[8]
  ];
  return `matrix3d(${m.map(v => v.toFixed(6)).join(',')})`;
}

/**
 * 解 8 元一次线性方程组求 3x3 单应性矩阵（DLT 算法）
 */
function solveHomography(src: Quad, dst: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const h = gaussianElimination(A, b);
  return [...h, 1.0]; // h33 = 1
}

function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / pivot;
      b[k] -= factor * b[i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * x[j];
    }
    x[i] = (b[i] - sum) / A[i][i];
  }
  return x;
}
