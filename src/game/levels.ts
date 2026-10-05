import { generatePuzzle, profileForScore, type Puzzle } from '../engine';
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
    target: profile.target,
    nodeLimit: 150_000,
  });
}

export const MODE_INFO: Record<GameMode, { name: string; desc: string; icon: string }> = {
  classic: { name: '经典闯关', desc: '像原版一样一关关往下走，难度缓慢爬升，进度自动保存', icon: '🏆' },
  daily: { name: '每日挑战', desc: '每天一张固定地图，全球同图，可分享关卡码', icon: '📅' },
  timeattack: { name: '限时挑战', desc: `连续 ${TIME_ATTACK_LEVELS} 关计时赛，比总用时`, icon: '⏱' },
  zen: { name: '禅模式', desc: '没有倒计时压力，随时调难度和尺寸，放松推理', icon: '🍃' },
  custom: { name: '自定义', desc: '指定尺寸/难度，或用关卡码导入一张地图', icon: '🎛' },
};
