import { describe, it } from 'vitest';
import { generatePuzzle, profileForScore } from '../index';
import { TECHNIQUE_TIER, type TechniqueId } from '../types';

const SHOW = process.env.SHOW_DIST === '1';
// 这个文件是“难度诊断”用的重型测试（一次跑 2 分钟），默认跳过
const RUN = process.env.RUN_TUNE === '1';

/** 量一下：现在“最难档”到底有多少步是真正的组合推理 */
describe.skipIf(!RUN)('诊断：最难档的推理构成', () => {
  it('统计各难度的技术层分布', () => {
    for (const [name, difficulty, n] of [
      ['中等', 5, 10],
      ['困难', 6.8, 10],
      ['专家', 8.2, 12],
      ['大师', 9.3, 13],
    ] as [string, number, number][]) {
      const tierCounts = [0, 0, 0, 0, 0, 0];
      let steps = 0;
      let scoreSum = 0;
      let tier3Plus = 0;
      const samples = 8;
      for (let i = 0; i < samples; i++) {
        const profile = profileForScore(difficulty, n);
        const p = generatePuzzle({
          n,
          style: profile.style,
          seed: 4242 + i * 7919 + n,
          target: profile.target,
          nodeLimit: 120_000,
        });
        scoreSum += p.meta.score;
        for (const [id, cnt] of Object.entries(p.meta.metrics.techniqueCounts)) {
          tierCounts[TECHNIQUE_TIER[id as TechniqueId]] += cnt ?? 0;
        }
        steps += p.meta.metrics.steps;
        tier3Plus += Object.entries(p.meta.metrics.techniqueCounts)
          .filter(([id]) => TECHNIQUE_TIER[id as TechniqueId] >= 3)
          .reduce((a, [, c]) => a + (c ?? 0), 0);
      }
      if (SHOW)
        console.log(
          `${name}(目标${difficulty} ${n}×${n}) 平均分 ${(scoreSum / samples).toFixed(2)} | 步数 ${(steps / samples).toFixed(
            1,
          )} | 各层步数 1/2/3/4/5 = ${tierCounts[1]}/${tierCounts[2]}/${tierCounts[3]}/${tierCounts[4]}/${tierCounts[5]} | 组合推理步数 ${(
            tier3Plus / samples
          ).toFixed(1)}`,
        );
    }
  });

  it('若强制要求较多组合推理，能到什么程度', () => {
    // 只接受“tier>=3 的步数 >= k”的关卡，看能生成到什么分数
    for (const k of [1, 3, 5]) {
      let best = 0;
      let found = 0;
      let ms = 0;
      const t0 = Date.now();
      for (let i = 0; i < 60; i++) {
        const profile = profileForScore(9, 12);
        const p = generatePuzzle({
          n: 12,
          style: profile.style,
          seed: 90000 + i * 6151,
          target: { score: 9, minTier: 3 },
          nodeLimit: 120_000,
          maxAttempts: 12,
        });
        const hard = Object.entries(p.meta.metrics.techniqueCounts)
          .filter(([id]) => TECHNIQUE_TIER[id as TechniqueId] >= 3)
          .reduce((a, [, c]) => a + (c ?? 0), 0);
        if (hard >= k) {
          found++;
          best = Math.max(best, p.meta.score);
        }
      }
      ms += Date.now() - t0;
      if (SHOW) console.log(`要求组合推理≥${k} 步：${found}/60 关满足，最高分 ${best.toFixed(2)}，共 ${ms}ms`);
    }
  });
});
