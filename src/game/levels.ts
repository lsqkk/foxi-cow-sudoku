import { generatePuzzle, profileForScore, type Puzzle, type PuzzleTarget } from '../engine';
import { hashString } from '../engine/rng';
import type { GameMode } from './storage';

/** 经典闯关的难度曲线：前期升得快，后期变缓（1 → 9.6 封顶） */
export function classicDifficulty(level: number): number {
  const d = 1.8 + 7.8 * (1 - Math.exp(-(Math.max(1, level) - 1) / 70));
  return Math.min(9.6, Math.round(d * 20) / 20);
}

export interface LevelSpec {
  mode: GameMode;
  /** 关卡号（经典/限时用；每日/自定义也用同一个字段承载） */
  level: number;
  difficulty: number;
  size: number | null;
  seed: number;
  code?: string;
}

export function specForClassic(level: number): LevelSpec {
  const difficulty = classicDifficulty(level);
  return {
    mode: 'classic',
    level,
    difficulty,
    size: null,
    seed: hashString(`foxi-classic:v2:${level}:${difficulty.toFixed(2)}`),
  };
}

export function specForDaily(date = new Date()): LevelSpec {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const difficulty = 6.2;
  return {
    mode: 'daily',
    level: date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate(),
    difficulty,
    size: 10,
    seed: hashString(`foxi-daily:v2:${key}`),
    code: key,
  };
}

/** 限时挑战：连续 N 关，难度固定在中上 */
export const TIME_ATTACK_LEVELS = 5;
export const TIME_ATTACK_DIFFICULTY = 5.6;
export const TIME_ATTACK_SIZE = 10;

export function specForTimeAttack(index: number, runSeed: number): LevelSpec {
  return {
    mode: 'timeattack',
    level: index + 1,
    difficulty: TIME_ATTACK_DIFFICULTY + index * 0.35,
    size: TIME_ATTACK_SIZE,
    seed: hashString(`foxi-ta:v2:${runSeed}:${index}`),
  };
}

export function specForZen(difficulty: number, size: number | null, nonce: number): LevelSpec {
  return {
    mode: 'zen',
    level: nonce,
    difficulty,
    size,
    seed: hashString(`foxi-zen:v2:${nonce}:${difficulty.toFixed(2)}:${size ?? 'auto'}`),
  };
}

export function specForCustom(difficulty: number, size: number | null, seed: number): LevelSpec {
  return { mode: 'custom', level: seed, difficulty, size, seed };
}

/**
 * “从任意关开始”的解锁挑战：限时 + 错误次数上限。
 * 通过了就把进度推到这个关卡（后面的关卡随之解锁）。
 */
export function unlockChallenge(level: number): { timeLimitMs: number; mistakeLimit: number } {
  const difficulty = classicDifficulty(level);
  const n = profileForScore(difficulty, undefined).n;
  const seconds = Math.min(600, Math.max(60, Math.round(40 + n * difficulty * 2.2)));
  const mistakeLimit = difficulty < 3.5 ? 1 : difficulty < 6.5 ? 2 : 3;
  return { timeLimitMs: seconds * 1000, mistakeLimit };
}

/** 关卡码：把 尺寸 / 难度 / 种子 编码成可复制的一串 */
export function encodeLevelCode(spec: Pick<LevelSpec, 'size' | 'difficulty' | 'seed'>): string {
  const size = spec.size ?? 0;
  return `FOXI1-${size.toString(36)}-${Math.round(spec.difficulty * 10).toString(36)}-${(spec.seed >>> 0).toString(36)}`;
}

export function decodeLevelCode(code: string): { size: number | null; difficulty: number; seed: number } | null {
  const m = /^FOXI1-([0-9a-z]+)-([0-9a-z]+)-([0-9a-z]+)$/i.exec(code.trim());
  if (!m) return null;
  const size = parseInt(m[1], 36);
  const difficulty = parseInt(m[2], 36) / 10;
  const seed = parseInt(m[3], 36) >>> 0;
  if (!Number.isFinite(size) || !Number.isFinite(difficulty) || !Number.isFinite(seed)) return null;
  if (difficulty < 1 || difficulty > 10) return null;
  if (size !== 0 && (size < 5 || size > 13)) return null;
  return { size: size === 0 ? null : size, difficulty, seed };
}

/** 生成一关（同步版；正式流程走 Worker，见 generateAsync） */
export function buildPuzzle(spec: LevelSpec): Puzzle {
  const profile = profileForScore(spec.difficulty, spec.size ?? undefined);
  return generatePuzzle({
    n: profile.n,
    style: profile.style,
    seed: spec.seed >>> 0,
    target: applyRefutationDice(profile.target, spec.difficulty, spec.seed),
    nodeLimit: 150_000,
  });
}

/**
 * 最高难度档的“反证骰子”：完全由种子决定，所以同一关卡码结果稳定。
 * 掷中时，这一关会被要求必须出现若干步“反证 / 试错”（第 4 层推理），
 * 也就是必须靠“假设这里放牛会矛盾”才能继续推进，比纯组合推理更耗脑。
 */
export function applyRefutationDice(target: PuzzleTarget, difficulty: number, seed: number): PuzzleTarget {
  if (difficulty < 8.5) return target;
  const roll = ((hashString(`foxi-refute:v1:${seed >>> 0}`) >>> 0) % 1000) / 1000;
  const chance = difficulty >= 9.4 ? 0.55 : difficulty >= 9 ? 0.35 : 0.2;
  if (roll >= chance) return target;
  const extraRefute = difficulty >= 9.4 ? 13 : difficulty >= 9 ? 11 : 9;
  return {
    ...target,
    minTier: Math.max(target.minTier ?? 0, 4),
    minRefuteishSteps: Math.max(target.minRefuteishSteps ?? 0, extraRefute),
    // 反证关整体也再抬一点组合推理量
    minHardSteps: Math.max(target.minHardSteps ?? 0, (target.minHardSteps ?? 0) + 3),
  };
}

export const MODE_INFO: Record<GameMode, { name: string; desc: string; icon: string }> = {
  classic: { name: '经典闯关', desc: '像原版一样一关关往下走，难度缓慢爬升，进度自动保存', icon: '🏆' },
  daily: { name: '每日挑战', desc: '每天一张固定地图，全球同图，可分享关卡码', icon: '📅' },
  timeattack: { name: '限时挑战', desc: `连续 ${TIME_ATTACK_LEVELS} 关计时赛，比总用时`, icon: '⏱' },
  zen: { name: '禅模式', desc: '没有倒计时压力，随时调难度和尺寸，放松推理', icon: '🍃' },
  custom: { name: '自定义', desc: '指定尺寸/难度，或用关卡码导入一张地图', icon: '🎛' },
};
