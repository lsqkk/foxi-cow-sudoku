import { describe, expect, it } from 'vitest';
import { countSolutions } from '../../engine/solver';
import { analyzePuzzle } from '../../engine/solver';
import {
  TIME_ATTACK_LEVELS,
  applyRefutationDice,
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
import { profileForScore } from '../../engine/difficulty';
import { DEFAULT_META, mergeRecord, starsFor, type LevelRecord } from '../storage';
import { buildParams, specFromUrl } from '../urlState';
import { parseLevelInput } from '../urlState';
import { unlockChallenge } from '../levels';

const SHOW = process.env.SHOW_DIST === '1';
const base9 = profileForScore(9.6, 13).target;

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

  it('URL 参数能带着地图往返（分享链接）', () => {
    const cases = [
      specForClassic(37),
      specForDaily(new Date('2026-10-05')),
      specForTimeAttack(2, 987654),
      specForZen(7.5, 11, 555),
      specForCustom(9.2, 13, 424242),
    ];
    for (const spec of cases) {
      const parsed = specFromUrl('?' + buildParams(spec));
      expect(parsed).not.toBeNull();
      expect(parsed!.spec.mode).toBe(spec.mode);
      expect(parsed!.spec.seed).toBe(spec.seed >>> 0);
      if (spec.mode === 'classic' || spec.mode === 'timeattack') expect(parsed!.spec.level).toBe(spec.level);
      if (spec.size !== null) expect(parsed!.spec.size).toBe(spec.size);
    }
    expect(specFromUrl('?m=classic&lv=12')!.spec.level).toBe(12);
    expect(specFromUrl('')!).toBeNull();
  });

  it('粘贴导入同时支持关卡码和分享链接 / 网址', () => {
    const custom = specForCustom(8.5, 11, 4242);
    const code = encodeLevelCode(custom);
    expect(parseLevelInput(code)?.seed).toBe(custom.seed >>> 0);

    const url = `https://example.com/foxi-cow-sudoku/?m=custom&code=${code}`;
    expect(parseLevelInput(url)?.seed).toBe(custom.seed >>> 0);

    const classic = specForClassic(30);
    const classicUrl = `https://example.com/foxi-cow-sudoku/?${buildParams(classic)}`;
    const parsed = parseLevelInput(classicUrl);
    expect(parsed?.mode).toBe('classic');
    expect(parsed?.level).toBe(30);
    expect(parsed?.seed).toBe(classic.seed >>> 0);

    expect(parseLevelInput('乱写的东西')).toBeNull();
    expect(parseLevelInput('')).toBeNull();
  });

  it('解锁挑战的限时与错误上限随难度递增', () => {
    const l1 = unlockChallenge(1);
    const l400 = unlockChallenge(400);
    expect(l1.timeLimitMs).toBeGreaterThanOrEqual(60_000);
    expect(l400.timeLimitMs).toBeLessThanOrEqual(600_000);
    expect(l400.timeLimitMs).toBeGreaterThan(l1.timeLimitMs);
    expect(l400.mistakeLimit).toBeGreaterThanOrEqual(l1.mistakeLimit);
  });

  it('最高难度档的“反证骰子”：同种子结果固定，且按概率命中', () => {
    // 确定性：同一 (难度, 种子) 永远得到同一结果
    expect(applyRefutationDice(base9, 9.6, 12345)).toEqual(applyRefutationDice(base9, 9.6, 12345));
    // 低难度不掷骰子
    expect(applyRefutationDice({ score: 4 }, 4, 1)).toEqual({ score: 4 });
    // 命中率大致符合设定（用不同种子统计）
    let hits = 0;
    const total = 400;
    for (let i = 0; i < total; i++) {
      const t = applyRefutationDice(base9, 9.6, 90000 + i * 7817);
      if ((t.minRefuteishSteps ?? 0) > (base9.minRefuteishSteps ?? 0)) hits++;
    }
    expect(hits).toBeGreaterThan(total * 0.35);
    expect(hits).toBeLessThan(total * 0.75);
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
