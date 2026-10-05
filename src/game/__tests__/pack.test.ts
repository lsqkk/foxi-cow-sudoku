import { describe, expect, it } from 'vitest';
import { generatePuzzle, profileForScore } from '../../engine';
import { countSolutions, analyzePuzzle } from '../../engine/solver';
import { CALIBRATION_PACK } from '../calibration';

const SHOW = process.env.SHOW_DIST === '1';

describe('标定关卡包', () => {
  it('18 关都能生成、都唯一、都纯逻辑可解，并且不会卡住界面', () => {
    let totalMs = 0;
    const rows: string[] = [];
    for (const level of CALIBRATION_PACK) {
      const profile = profileForScore(level.difficulty, level.n);
      const t0 = Date.now();
      const p = generatePuzzle({
        n: level.n,
        style: profile.style,
        seed: level.seed,
        target: profile.target,
        nodeLimit: 120_000,
      });
      const ms = Date.now() - t0;
      totalMs += ms;

      expect(p.n).toBe(level.n);
      // 生成器保证唯一解
      const probe = countSolutions({ n: p.n, colors: p.colors }, 2, 400_000);
      expect(probe.count).toBe(1);
      expect(probe.firstSolution).toEqual(p.solution);
      // 保证纯逻辑能解完（不需要猜）
      const metrics = analyzePuzzle({ n: p.n, colors: p.colors, solution: p.solution }, { nodeLimit: 200_000 });
      expect(metrics.solvableByLogic).toBe(true);

      rows.push(`${level.id} ${level.n}×${level.n} 目标${level.difficulty} → 实际 ${p.meta.score.toFixed(2)}(${p.meta.label}) ${ms}ms`);
      expect(ms).toBeLessThan(9000);
    }
    if (SHOW) console.log('\n' + rows.join('\n') + `\n合计 ${totalMs}ms`);
    expect(totalMs).toBeLessThan(60_000);
  });
});
