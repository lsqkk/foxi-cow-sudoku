import { describe, expect, it } from 'vitest';
import { growRegions, isRegionConnected, randomSolution, validateSolution } from '../board';
import { mulberry32 } from '../rng';

describe('board', () => {
  it('生成的小牛布局满足每行每列一头且互不相邻', () => {
    for (let n = 5; n <= 12; n++) {
      for (let seed = 1; seed <= 25; seed++) {
        const sol = randomSolution(n, mulberry32(seed * 7919 + n));
        expect(validateSolution(n, sol)).toBe(true);
      }
    }
  });

  it('颜色划分：全部覆盖、区域连通、每个区域恰好一头牛', () => {
    for (let n = 5; n <= 11; n++) {
      for (const style of [
        { small: 0.6, giant: 0.5, segments: 0.5, crosses: 0.25, compactness: 0.9 },
        { small: 0.6, giant: 0.5, segments: 0.32, crosses: 0.15, compactness: 0.65 },
        { small: 0.6, giant: 0.5, segments: 0.15, crosses: 0.08, compactness: 0.35 },
        { small: 0.6, giant: 0.5, segments: 0, crosses: 0, compactness: 0.2 },
      ]) {
        for (let seed = 1; seed <= 6; seed++) {
          const rng = mulberry32(seed * 104729 + n * 31 + Math.round(style.compactness * 100));
          const sol = randomSolution(n, rng);
          const colors = growRegions(n, sol, style, rng);
          const counts = new Array(n).fill(0);
          for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
              const k = colors[r][c];
              expect(k).toBeGreaterThanOrEqual(0);
              expect(k).toBeLessThan(n);
              counts[k]++;
            }
          }
          for (let k = 0; k < n; k++) {
            expect(counts[k]).toBeGreaterThan(0);
            expect(isRegionConnected(n, colors, k)).toBe(true);
            // 该区域恰好包含一头牛
            const cowsInRegion = sol.filter((c, r) => colors[r][c] === k).length;
            expect(cowsInRegion).toBe(1);
          }
        }
      }
    }
  });
});
