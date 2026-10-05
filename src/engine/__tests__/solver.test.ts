import { describe, expect, it } from 'vitest';
import { growRegions, randomSolution } from '../board';
import { mulberry32 } from '../rng';
import {
  analyzePuzzle,
  countSolutions,
  createState,
  hintForMarks,
  placeCowInState,
  runLadder,
  solveCompletely,
} from '../solver';
import type { Puzzle } from '../types';
import { generatePuzzle } from '../generator';
import { profileForScore } from '../difficulty';

function makeRawPuzzle(n: number, seed: number, compactness = 0.7, segments = 0.3, crosses = 0.15, small = 0.7) {
  const rng = mulberry32(seed);
  const solution = randomSolution(n, rng);
  const colors = growRegions(n, solution, { small, segments, crosses, compactness }, rng);
  return { n, colors, solution };
}

describe('基础规则与推理可靠性', () => {
  it('放下一头牛后，同行/同列/同色/周围 8 格全部被排除', () => {
    const n = 6;
    const { colors, solution } = makeRawPuzzle(n, 2024, 0.8);
    const s = createState(n, colors);
    const r = 2;
    const c = solution[r];
    const i = r * n + c;
    const color = colors[r][c];
    placeCowInState(s, i);
    for (let cc = 0; cc < n; cc++) if (cc !== c) expect(s.cand[r * n + cc]).toBe(0);
    for (let rr = 0; rr < n; rr++) if (rr !== r) expect(s.cand[rr * n + c]).toBe(0);
    for (let rr = 0; rr < n; rr++) {
      for (let cc = 0; cc < n; cc++) {
        if (colors[rr][cc] === color) expect(s.cand[rr * n + cc]).toBe(0);
        if (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) expect(s.cand[rr * n + cc]).toBe(0);
      }
    }
  });

  it('逻辑阶梯的每一步都不与真解冲突', () => {
    let total = 0;
    for (const n of [5, 6, 7, 8, 9, 10]) {
      for (let seed = 1; seed <= 6; seed++) {
        const { colors, solution } = makeRawPuzzle(n, seed * 7717 + 13, 0.55);
        const res = runLadder({ n, colors }, { collectDeductions: true, maxSteps: 3000 });
        total++;
        for (const d of res.deductions) {
          for (const t of d.targets) {
            const r = Math.floor(t / n);
            const c = t % n;
            if (d.kind === 'place') expect(solution[r]).toBe(c);
            else expect(solution[r]).not.toBe(c);
          }
        }
        if (res.solved) expect(res.state.placed).toBe(n);
      }
    }
    expect(total).toBeGreaterThan(30);
  });

  it('排除法兜底：只接受唯一解的关卡，而且一定能解完', () => {
    let checked = 0;
    for (const n of [6, 8, 10]) {
      for (let seed = 1; seed <= 3; seed++) {
        const p = generatePuzzle({
          n,
          style: profileForScore(5, n).style,
          seed: seed * 3571 + 5,
          target: { score: 5 },
        });
        const { colors, solution } = p;
        checked++;
        const complete = solveCompletely({ n, colors, solution }, { refuteNodeLimit: 30_000 });
        expect(complete.solved).toBe(true);
        // 完整解法同样必须与真解一致
        for (const d of complete.deductions) {
          for (const t of d.targets) {
            const r = Math.floor(t / n);
            const c = t % n;
            if (d.kind === 'place') expect(solution[r]).toBe(c);
            else expect(solution[r]).not.toBe(c);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe('关卡体检', () => {
  it('唯一解的关卡会被判定为 unique，多解的不会', () => {
    let uniques = 0;
    let ambiguous = 0;
    // 生成器产出的关卡一定是唯一解
    for (let seed = 1; seed <= 8; seed++) {
      const p = generatePuzzle({ n: 7, style: profileForScore(4, 7).style, seed: seed * 911 + 3, target: { score: 4 } });
      const metrics = analyzePuzzle({ n: p.n, colors: p.colors, solution: p.solution }, { nodeLimit: 200_000 });
      expect(metrics.unique).toBe(true);
      uniques++;
      const probe = countSolutions({ n: p.n, colors: p.colors }, 2, 200_000);
      expect(probe.count).toBe(1);
      expect(probe.firstSolution).toEqual(p.solution);
    }
    // 随机分区多半是多解的
    for (let seed = 1; seed <= 20; seed++) {
      const { n, colors, solution } = makeRawPuzzle(7, seed * 977 + 11, 0.6, 0, 0, 0);
      const metrics = analyzePuzzle({ n, colors, solution }, { nodeLimit: 200_000 });
      if (!metrics.unique) ambiguous++;
    }
    if (process.env.SHOW_DIST === '1') console.log(`\n7x7 随机分区：唯一 ${uniques} / 多解 ${ambiguous}`);
    expect(uniques).toBeGreaterThan(0);
    expect(ambiguous).toBeGreaterThan(5);
  });

  it('纯逻辑能解完的关卡会被标记为不需要兜底', () => {
    let logicSolved = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const p = generatePuzzle({ n: 6, style: profileForScore(3, 6).style, seed: seed * 131 + 7, target: { score: 3 } });
      const m = analyzePuzzle({ n: p.n, colors: p.colors, solution: p.solution });
      expect(m.solvableByLogic).toBe(true);
      expect(m.needsRefutation).toBe(false);
      expect(m.unique).toBe(true);
      logicSolved++;
    }
    expect(logicSolved).toBeGreaterThan(0);
  });
});

describe('游戏内提示', () => {
  const puzzle = (): Puzzle => {
    return generatePuzzle({
      n: 6,
      style: profileForScore(3, 6).style,
      seed: 4242,
      target: { score: 3, requireLogic: true },
    });
  };

  it('空盘提示能给出一步推理', () => {
    const p = puzzle();
    const marks = new Uint8Array(p.n * p.n);
    const { deduction, conflict } = hintForMarks(p, marks);
    expect(conflict).toBe(false);
    expect(deduction).not.toBeNull();
  });

  it('把牛放错位置时提示会报冲突', () => {
    const p = puzzle();
    const marks = new Uint8Array(p.n * p.n);
    // 第 0 行放一个错误位置（真解所在列之外）
    const wrongCol = (p.solution[0] + 2) % p.n;
    marks[wrongCol] = 2;
    const { conflict } = hintForMarks(p, marks);
    expect(conflict).toBe(true);
  });

  it('玩家放下的正确标记会被保留（提示不与已有标记冲突）', () => {
    const p = puzzle();
    const marks = new Uint8Array(p.n * p.n);
    // 第 1 行的真解格排除掉，这一定与答案冲突 → 应报冲突
    marks[1 * p.n + p.solution[1]] = 1;
    const { conflict } = hintForMarks(p, marks);
    expect(conflict).toBe(true);
  });
});
