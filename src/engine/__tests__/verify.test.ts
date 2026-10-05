import { describe, expect, it } from 'vitest';
import { growRegions, randomSolution } from '../board';
import { mulberry32 } from '../rng';
import { countSolutions } from '../solver';
import type { ShapeStyle } from '../types';

/** 独立校验：这个 placement 是否真的是一个合法解 */
function isRealSolution(n: number, colors: number[][], placement: number[]): string | null {
  if (placement.length !== n) return '长度不对';
  const cols = new Set(placement);
  if (cols.size !== n) return '列重复';
  for (const c of placement) if (c < 0 || c >= n) return '列越界';
  for (let r = 0; r + 1 < n; r++) if (Math.abs(placement[r] - placement[r + 1]) < 2) return `第${r}/${r + 1}行小牛相邻`;
  const cowsPerColor = new Array(n).fill(0);
  for (let r = 0; r < n; r++) cowsPerColor[colors[r][placement[r]]]++;
  for (let k = 0; k < n; k++) if (cowsPerColor[k] !== 1) return `颜色${k}有${cowsPerColor[k]}头牛`;
  return null;
}

describe('搜索出的“其他解”是否真的合法', () => {
  it('检查 countSolutions 返回的解', () => {
    const styles: ShapeStyle[] = [
      { small: 0.6, segments: 0.5, crosses: 0.25, compactness: 0.9 },
      { small: 0.6, segments: 0.32, crosses: 0.15, compactness: 0.65 },
      { small: 0.6, segments: 0, crosses: 0, compactness: 0.5 },
    ];
    let bad = 0;
    let ambiguous = 0;
    let checked = 0;
    for (let n = 6; n <= 9; n++) {
      for (const style of styles) {
        for (let seed = 1; seed <= 8; seed++) {
          const rng = mulberry32(seed * 7919 + n * 31);
          const sol = randomSolution(n, rng);
          const colors = growRegions(n, sol, style, rng);
          const res = countSolutions({ n, colors }, 4, 60_000);
          checked++;
          expect(isRealSolution(n, colors, sol)).toBeNull();
          if (res.count > 1) ambiguous++;
          for (const s of res.solutions) {
            const err = isRealSolution(n, colors, s);
            if (err) {
              bad++;
              if (bad <= 5) {
                console.log(
                  `\nn=${n} seed=${seed} 搜索结果非法：${err}\n  真解 ${sol.join(',')}\n  搜索 ${s.join(',')}\n` +
                    colors.map((row) => row.join(' ')).join('\n'),
                );
              }
            }
          }
        }
      }
    }
    console.log(`\n检查 ${checked} 个棋盘：多解 ${ambiguous}，非法解 ${bad}`);
    expect(bad).toBe(0);
  });
});
