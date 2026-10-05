import { describe, expect, it } from 'vitest';
import { countSolutions } from '../../engine/solver';
import { analyzePuzzle } from '../../engine/solver';
import {
  TIME_ATTACK_LEVELS,
  buildPuzzle,
  classicDifficulty,
  decodeLevelCode,
  encodeLevelCode,
  specForClassic,
  specForCustom,
  specForDaily,
  specForTimeAttack,
  specForZen,
} from '../levels';
import { DEFAULT_META, mergeRecord, starsFor, type LevelRecord } from '../storage';

const SHOW = process.env.SHOW_DIST === '1';

function checkPuzzle(spec: Parameters<typeof buildPuzzle>[0]): ReturnType<typeof buildPuzzle> {
  const p = buildPuzzle(spec);
  const res = countSolutions({ n: p.n, colors: p.colors }, 2, 400_000);
  expect(res.count).toBe(1);
  expect(res.firstSolution).toEqual(p.solution);
  const m = analyzePuzzle({ n: p.n, colors: p.colors, solution: p.solution }, { nodeLimit: 200_000 });
  expect(m.solvableByLogic).toBe(true);
  return p;
}

describe('关卡与模式', () => {
  it('经典难度曲线单调上升且有上限', () => {
    let prev = 0;
    for (const lv of [1, 2, 5, 20, 50, 100, 200, 500]) {
      const d = classicDifficulty(lv);
      expect(d).toBeGreaterThanOrEqual(prev);
      expect(d).toBeLessThanOrEqual(9.6);
      prev = d;
    }
    expect(classicDifficulty(1)).toBeLessThan(2.2);
    expect(classicDifficulty(400)).toBeGreaterThan(9);
  });

  it('各模式的关卡都能生成、唯一解、纯逻辑可解', () => {
    const specs = [
      specForClassic(1),
      specForClassic(40),
      specForDaily(new Date('2026-10-05')),
      specForTimeAttack(0, 12345),
      specForTimeAttack(TIME_ATTACK_LEVELS - 1, 12345),
      specForZen(7.5, 11, 999),
      specForCustom(9, 12, 4242),
    ];
    for (const spec of specs) {
      const t0 = Date.now();
      const p = checkPuzzle(spec);
      if (SHOW) console.log(`${spec.mode} 关卡 ${spec.level}: ${p.n}×${p.n} 难度 ${p.meta.score.toFixed(2)} ${Date.now() - t0}ms`);
    }
  });

  it('每日挑战按日期固定', () => {
    const a = specForDaily(new Date('2026-10-05'));
    const b = specForDaily(new Date('2026-10-05'));
    const c = specForDaily(new Date('2026-10-06'));
    expect(a.seed).toBe(b.seed);
    expect(a.seed).not.toBe(c.seed);
  });

  it('关卡码能往返解析', () => {
    for (const spec of [specForCustom(6.5, 10, 123456), specForCustom(9, null, 0xabcdef), specForZen(3.5, 7, 42)]) {
      const code = encodeLevelCode({ size: spec.size, difficulty: spec.difficulty, seed: spec.seed });
      const back = decodeLevelCode(code);
      expect(back).not.toBeNull();
      expect(back!.size).toBe(spec.size);
      expect(back!.seed).toBe(spec.seed >>> 0);
      expect(Math.abs(back!.difficulty - spec.difficulty)).toBeLessThan(0.06);
    }
    expect(decodeLevelCode('乱写的')).toBeNull();
    expect(decodeLevelCode('FOXI1-9-a-zzz!!')).toBeNull();
  });

  it('星级与成绩合并规则正确', () => {
    expect(starsFor(0, 0)).toBe(3);
    expect(starsFor(1, 1)).toBe(2);
    expect(starsFor(0, 3)).toBe(1);
    const base: LevelRecord = {
      key: 'classic:1',
      mode: 'classic',
      level: 1,
      n: 6,
      seed: 1,
      difficulty: 2,
      score: 2,
      cleared: true,
      stars: 1,
      timeMs: 90_000,
      mistakes: 4,
      hints: 3,
      attempts: 1,
      updatedAt: 1,
    };
    const better: LevelRecord = { ...base, stars: 3, timeMs: 40_000, mistakes: 0, hints: 0, updatedAt: 2 };
    const r1 = mergeRecord({ 'classic:1': base }, better);
    expect(r1['classic:1'].stars).toBe(3);
    expect(r1['classic:1'].timeMs).toBe(40_000);
    expect(r1['classic:1'].attempts).toBe(2);
    const worse: LevelRecord = { ...base, stars: 1, timeMs: 120_000, updatedAt: 3 };
    const r2 = mergeRecord(r1, worse);
    expect(r2['classic:1'].stars).toBe(3);
    expect(r2['classic:1'].timeMs).toBe(40_000);
    expect(DEFAULT_META.totalCleared).toBe(0);
  });
});
