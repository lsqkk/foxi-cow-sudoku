import { describe, it } from 'vitest';
import { growRegions, randomSolution, validateColorAssignment } from '../board';
import { mulberry32 } from '../rng';
import { countSolutions, runLadder } from '../solver';
import { repairToUnique } from '../generator';
import { analyzePuzzle } from '../solver';
import { designHardness, extractFeatures, PRESETS, profileForScore } from '../difficulty';
import { generatePuzzle } from '../generator';

const SHOW = process.env.SHOW_DIST === '1';
const RUN = process.env.RUN_TUNE === '1';

describe.skipIf(!RUN)('调参：巨型色块与小颜色的组合', () => {
  it('各档位的设计难度 H 实测范围（用于标定分数映射）', () => {
    const rows: string[] = [];
    for (const preset of PRESETS) {
      const hs: number[] = [];
      const scores: number[] = [];
      for (let i = 0; i < 5; i++) {
        const profile = profileForScore(preset.score, preset.n);
        const p = generatePuzzle({
          n: preset.n,
          style: profile.style,
          seed: 777 + i * 4021 + preset.n,
          target: profile.target,
          nodeLimit: 150_000,
        });
        const m = analyzePuzzle({ n: p.n, colors: p.colors, solution: p.solution }, { nodeLimit: 150_000 });
        const f = extractFeatures(p.n, p.colors, m);
        hs.push(designHardness(f, m));
        scores.push(p.meta.score);
      }
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      rows.push(
        `${preset.name}(目标${preset.score}) H=${avg(hs).toFixed(3)} [${Math.min(...hs).toFixed(2)}~${Math.max(...hs).toFixed(
          2,
        )}] 实际分 ${avg(scores).toFixed(2)}`,
      );
    }
    if (SHOW) console.log('\n' + rows.join('\n'));
  });

  it('“硬关卡”的供给量：唯一解里有多少真的需要多步组合推理', () => {
    for (const n of [10, 12, 13]) {
      const hist = new Map<number, number>();
      let unique = 0;
      let total = 0;
      const samples = 60;
      for (let seed = 1; seed <= samples; seed++) {
        const rng = mulberry32(seed * 4021 + n * 13);
        const solution = randomSolution(n, rng);
        const colors = growRegions(
          n,
          solution,
          { small: 0.42, giant: 0.55, segments: 0, crosses: 0, compactness: 0.3 },
          rng,
        );
        if (!validateColorAssignment(n, colors, solution)) continue;
        total++;
        const rep = repairToUnique(n, solution, colors, rng, { nodeLimit: 80_000, maxRepairs: 20 });
        if (!rep.unique) continue;
        if (countSolutions({ n, colors: rep.colors }, 2, 150_000).count !== 1) continue;
        unique++;
        const h = runLadder({ n, colors: rep.colors }).hardSteps;
        hist.set(h, (hist.get(h) ?? 0) + 1);
      }
      const buckets = [0, 1, 2, 3, 4, 6, 100];
      const dist = buckets
        .slice(0, -1)
        .map((b, i) => `${b}~${buckets[i + 1] - 1}:${Array.from(hist.entries()).filter(([k]) => k >= b && k < buckets[i + 1]).reduce((a, [, v]) => a + v, 0)}`)
        .join(' ');
      if (SHOW) console.log(`\nn=${n} 唯一 ${unique}/${total} 组合步分布 ${dist}`);
    }
  });

  it('关掉线段/整线（它们会白送线索）后能有多难', () => {
    const n = 12;
    for (const small of [0.4, 0.5, 0.6]) {
      const parts: string[] = [];
      for (const giant of [0.4, 0.7, 1]) {
        let unique = 0;
        let total = 0;
        let hardSum = 0;
        let candSum = 0;
        let scoreSum = 0;
        for (let seed = 1; seed <= 16; seed++) {
          const rng = mulberry32(seed * 6151 + n * 17 + Math.round(small * 100) + Math.round(giant * 9));
          const solution = randomSolution(n, rng);
          const colors = growRegions(n, solution, { small, giant, segments: 0, crosses: 0, compactness: 0.3 }, rng);
          if (!validateColorAssignment(n, colors, solution)) continue;
          total++;
          const rep = repairToUnique(n, solution, colors, rng, { nodeLimit: 80_000, maxRepairs: 20 });
          if (!rep.unique) continue;
          if (countSolutions({ n, colors: rep.colors }, 2, 150_000).count !== 1) continue;
          unique++;
          const ladder = runLadder({ n, colors: rep.colors });
          hardSum += ladder.hardSteps;
          candSum += ladder.avgCandidates;
          scoreSum += ladder.steps;
        }
        parts.push(
          `giant=${giant}: 唯一${((unique / total) * 100).toFixed(0)}% 组合步${(hardSum / Math.max(1, unique)).toFixed(
            1,
          )} 平均候选${(candSum / Math.max(1, unique)).toFixed(1)} 步数${(scoreSum / Math.max(1, unique)).toFixed(1)}`,
        );
      }
      if (SHOW) console.log(`\nn=12 无线段 small=${small} ` + parts.join(' | '));
    }
  });

  it('唯一率 / 组合推理步数 随 giant 与 small 的变化（n=12）', () => {
    const n = 12;
    for (const small of [0.35, 0.42, 0.5]) {
      const parts: string[] = [];
      for (const giant of [0.2, 0.6, 1]) {
        let unique = 0;
        let hardSum = 0;
        let giantShareSum = 0;
        let total = 0;
        const samples = 20;
        for (let seed = 1; seed <= samples; seed++) {
          const rng = mulberry32(seed * 7919 + n * 31 + Math.round(small * 100) + Math.round(giant * 7));
          const solution = randomSolution(n, rng);
          const colors = growRegions(n, solution, { small, giant, segments: 0.16, crosses: 0.06, compactness: 0.35 }, rng);
          if (!validateColorAssignment(n, colors, solution)) continue;
          total++;
          let maxSize = 0;
          const sizes = new Array(n).fill(0);
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) sizes[colors[r][c]]++;
          maxSize = Math.max(...sizes);
          giantShareSum += maxSize / (n * n);
          const rep = repairToUnique(n, solution, colors, rng, { nodeLimit: 80_000, maxRepairs: 20 });
          if (!rep.unique) continue;
          if (countSolutions({ n, colors: rep.colors }, 2, 150_000).count !== 1) continue;
          unique++;
          hardSum += runLadder({ n, colors: rep.colors }).hardSteps;
        }
        parts.push(
          `giant=${giant}: 唯一${((unique / total) * 100).toFixed(0)}% 组合步${(hardSum / Math.max(1, unique)).toFixed(1)} 巨型占比${(
            (giantShareSum / total) * 100
          ).toFixed(0)}%`,
        );
      }
      if (SHOW) console.log(`\nn=12 small=${small} ` + parts.join(' | '));
    }
  });
});
