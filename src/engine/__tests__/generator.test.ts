import { describe, expect, it } from 'vitest';
import { growRegions, isRegionConnected, randomSolution, validateSolution } from '../board';
import { PRESETS, profileForScore } from '../difficulty';
import { generateLevel, generatePuzzle, repairToUnique } from '../generator';
import { mulberry32 } from '../rng';
import { countSolutions, runLadder } from '../solver';

const SHOW = process.env.SHOW_DIST === '1';

describe('生成器', () => {
  it('产出的关卡永远满足：每行每列一头、互不相邻、颜色区域连通、每个区域一头牛', () => {
    for (const preset of PRESETS) {
      const p = generateLevel({ level: 1, difficulty: preset.score, size: preset.n });
      expect(validateSolution(p.n, p.solution)).toBe(true);
      for (let k = 0; k < p.n; k++) expect(isRegionConnected(p.n, p.colors, k)).toBe(true);
      for (let r = 0; r < p.n; r++) {
        for (let c = 0; c < p.n; c++) {
          const k = p.colors[r][c];
          const cows = p.solution.filter((cc, rr) => p.colors[rr][cc] === k).length;
          expect(cows).toBe(1);
        }
      }
    }
  });

  it('产出的关卡解唯一（用回溯验证）', () => {
    for (const preset of PRESETS) {
      for (let level = 1; level <= 2; level++) {
        const p = generateLevel({ level, difficulty: preset.score, size: preset.n });
        const res = countSolutions({ n: p.n, colors: p.colors }, 2, 300_000);
        expect(res.count).toBe(1);
        expect(res.firstSolution).toEqual(p.solution);
      }
    }
  });

  it('同一 (关卡号, 难度, 尺寸) 可复现', () => {
    for (const req of [
      { level: 42, difficulty: 5, size: 9 },
      { level: 7, difficulty: 8, size: 12 },
      { level: 3, difficulty: 2, size: 6 },
    ]) {
      const a = generateLevel(req);
      const b = generateLevel(req);
      expect(a.colors).toEqual(b.colors);
      expect(a.solution).toEqual(b.solution);
    }
  });

  it('难度分整体上随目标上升，且尺寸不主导难度', () => {
    const avg = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const at = (difficulty: number, size: number) => {
      const scores: number[] = [];
      for (let level = 1; level <= 3; level++) scores.push(generateLevel({ level, difficulty, size }).meta.score);
      return avg(scores);
    };
    const easy = at(2, 10);
    const hard = at(7, 10);
    const bigEasy = at(2, 12);
    if (SHOW) console.log(`\n10x10 易 ${easy.toFixed(2)} / 10x10 难 ${hard.toFixed(2)} / 12x12 易 ${bigEasy.toFixed(2)}`);
    expect(hard).toBeGreaterThan(easy + 1);
    expect(bigEasy).toBeLessThan(hard);
  });

  it('性能：生成 8x8 / 10x10 关卡在预算内完成', () => {
    const t0 = Date.now();
    generatePuzzle({ n: 8, style: profileForScore(3.4, 8).style, seed: 111, target: { score: 3.5, minTier: 2 } });
    const t1 = Date.now();
    generatePuzzle({ n: 10, style: profileForScore(5.5, 10).style, seed: 222, target: { score: 5.5, minTier: 2 } });
    const t2 = Date.now();
    if (SHOW) console.log(`\n8x8 ${t1 - t0}ms, 10x10 ${t2 - t1}ms`);
    expect(t1 - t0).toBeLessThan(3000);
    expect(t2 - t1).toBeLessThan(5000);
  });

  it('修复成功率：小颜色越多，越容易修成唯一解', () => {
    const rate = (n: number, small: number) => {
      const style = { small, segments: 0.25, crosses: 0.1, compactness: 0.7 };
      let ok = 0;
      const total = 20;
      for (let seed = 1; seed <= total; seed++) {
        const rng = mulberry32(seed * 6661 + n);
        const solution = randomSolution(n, rng);
        const colors = growRegions(n, solution, style, rng);
        const repaired = repairToUnique(n, solution, colors, rng, { nodeLimit: 40_000, maxRepairs: 20 });
        if (repaired.unique && countSolutions({ n, colors: repaired.colors }, 2, 120_000).count === 1) ok++;
      }
      return ok / total;
    };
    const manySmall = rate(8, 0.85);
    const equalSizes = rate(8, 0);
    if (SHOW) console.log(`\n修复成功率：小颜色多 ${(manySmall * 100).toFixed(0)}% / 大小均匀 ${(equalSizes * 100).toFixed(0)}%`);
    expect(manySmall).toBeGreaterThan(equalSizes);
    expect(manySmall).toBeGreaterThanOrEqual(0.2);
  });

  it('关卡必须有入手点：纯逻辑阶梯应该能推进（不需要一上来就猜）', () => {
    for (const preset of PRESETS.slice(0, 4)) {
      let progressed = 0;
      const samples = 4;
      for (let level = 1; level <= samples; level++) {
        const p = generateLevel({ level, difficulty: preset.score, size: preset.n });
        const ladder = runLadder({ n: p.n, colors: p.colors });
        if (ladder.state.placed >= Math.max(1, Math.floor(p.n * 0.5))) progressed++;
      }
      if (SHOW) console.log(`\n${preset.name}: 逻辑推进 ≥50% 的关卡 ${progressed}/${samples}`);
      expect(progressed).toBeGreaterThan(0);
    }
  });
});
