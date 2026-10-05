import { describe, it } from 'vitest';
import { growRegions, randomSolution, validateColorAssignment } from '../board';
import { countSolutions } from '../solver';
import { mulberry32 } from '../rng';
import { repairToUnique } from '../generator';
import { analyzePuzzle } from '../solver';
import { extractFeatures, scorePuzzle } from '../difficulty';

const SHOW = process.env.SHOW_DIST === '1';

describe('调参：小颜色比例 vs 唯一率/难度', () => {
  it('找出各尺寸下仍然能稳定得到唯一解的最小 small', () => {
    for (const n of [8, 10, 12, 13]) {
      const parts: string[] = [];
      for (const small of [0.3, 0.4, 0.5, 0.6, 0.7]) {
        let unique = 0;
        let scoreSum = 0;
        let ms = 0;
        const samples = 16;
        for (let seed = 1; seed <= samples; seed++) {
          const rng = mulberry32(seed * 7919 + n * 31 + Math.round(small * 100));
          const solution = randomSolution(n, rng);
          const colors = growRegions(n, solution, { small, giant: 0.5, segments: 0.25, crosses: 0.1, compactness: 0.5 }, rng);
          if (!validateColorAssignment(n, colors, solution)) continue;
          const t0 = Date.now();
          const rep = repairToUnique(n, solution, colors, rng, { nodeLimit: 80_000, maxRepairs: 20 });
          ms += Date.now() - t0;
          if (!rep.unique) continue;
          const probe = countSolutions({ n, colors: rep.colors }, 2, 150_000);
          if (probe.count !== 1 || probe.budgetHit) continue;
          unique++;
          const metrics = analyzePuzzle({ n, colors: rep.colors, solution }, { nodeLimit: 150_000 });
          scoreSum += scorePuzzle(extractFeatures(n, rep.colors, metrics), metrics);
        }
        parts.push(
          `small=${small}: 唯一${((unique / samples) * 100).toFixed(0)}% 均分${(scoreSum / Math.max(1, unique)).toFixed(
            1,
          )} ${(ms / samples).toFixed(0)}ms`,
        );
      }
      if (SHOW) console.log(`\nn=${n} ` + parts.join(' | '));
    }
  });
});
