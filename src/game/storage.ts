/** 本地存档：设置、进度、每关成绩、各模式记录 */

export type ThemeMode = 'light' | 'dark' | 'auto';
export type GameMode = 'classic' | 'daily' | 'timeattack' | 'zen' | 'custom';

export interface Settings {
  /** 放错牛立刻提示并记错（关掉可以“摆完再说”，更接近纯粹推理） */
  strictMistakes: boolean;
  colorBlind: boolean;
  /** 显示计时（禅模式/不想有压力时可以关） */
  showTimer: boolean;
  sound: boolean;
  theme: ThemeMode;
  /** 放下小牛后自动排除同行 / 同列 / 同色区域 / 周围 8 格 */
  autoExclude: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  strictMistakes: true,
  colorBlind: false,
  showTimer: true,
  sound: true,
  theme: 'auto',
  autoExclude: true,
};

export interface Progress {
  /** 经典闯关：当前解锁到第几关 */
  classicLevel: number;
  /** 自定义/禅模式上次使用的设置 */
  customDifficulty: number;
  customSize: number | null;
  mode: GameMode;
}

export const DEFAULT_PROGRESS: Progress = {
  classicLevel: 1,
  customDifficulty: 5,
  customSize: null,
  mode: 'classic',
};

export interface LevelRecord {
  /** 例如 classic:12 / daily:2026-10-05 / custom:n9-2k3 */
  key: string;
  mode: GameMode;
  level: number;
  n: number;
  seed: number;
  difficulty: number;
  score: number;
  cleared: boolean;
  /** 0~3 星 */
  stars: number;
  timeMs: number;
  mistakes: number;
  hints: number;
  attempts: number;
  updatedAt: number;
}

const SETTINGS_KEY = 'foxi.settings.v2';
const PROGRESS_KEY = 'foxi.progress.v2';
const RECORDS_KEY = 'foxi.records.v2';
const META_KEY = 'foxi.meta.v2';

export interface MetaState {
  totalCleared: number;
  totalStars: number;
  streak: number;
  bestStreak: number;
  noMistakeClears: number;
  totalTimeMs: number;
  /** 限时挑战最好总用时 */
  bestTimeAttackMs: number | null;
  /** 限时挑战最好成绩的分段（每关用时） */
  bestTimeAttackSplits?: number[];
  /** 限时挑战最近几次完整成绩（最新在前，最多 5 条） */
  timeAttackHistory?: { totalMs: number; splits: number[]; at: number }[];
  dailyDone: Record<string, number>;
}

export const DEFAULT_META: MetaState = {
  totalCleared: 0,
  totalStars: 0,
  streak: 0,
  bestStreak: 0,
  noMistakeClears: 0,
  totalTimeMs: 0,
  bestTimeAttackMs: null,
  timeAttackHistory: [],
  dailyDone: {},
};

function read<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 无痕模式等场景直接忽略 */
  }
}

export const loadSettings = (): Settings => read(SETTINGS_KEY, DEFAULT_SETTINGS);
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);
export const loadProgress = (): Progress => read(PROGRESS_KEY, DEFAULT_PROGRESS);
export const saveProgress = (p: Progress): void => write(PROGRESS_KEY, p);
export const loadMeta = (): MetaState => read(META_KEY, DEFAULT_META);
export const saveMeta = (m: MetaState): void => write(META_KEY, m);

export function loadRecords(): Record<string, LevelRecord> {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LevelRecord>) : {};
  } catch {
    return {};
  }
}

export function saveRecords(records: Record<string, LevelRecord>): void {
  write(RECORDS_KEY, records);
}

export function clearAll(): void {
  write(RECORDS_KEY, {});
  write(META_KEY, DEFAULT_META);
  write(PROGRESS_KEY, DEFAULT_PROGRESS);
}

/** 星级：无错无提示 3 星；各 ≤2 次 2 星；否则 1 星 */
export function starsFor(mistakes: number, hints: number): number {
  if (mistakes === 0 && hints === 0) return 3;
  if (mistakes <= 2 && hints <= 2) return 2;
  return 1;
}

export function recordIdFor(mode: GameMode, level: number, seed: number, n: number): string {
  return `${mode}:${level}:${n}:${seed.toString(36)}`;
}

/** 合并一条成绩（保留最好成绩） */
export function mergeRecord(records: Record<string, LevelRecord>, rec: LevelRecord): Record<string, LevelRecord> {
  const prev = records[rec.key];
  const better =
    !prev ||
    rec.stars > prev.stars ||
    (rec.stars === prev.stars && rec.cleared && (!prev.cleared || rec.timeMs < prev.timeMs));
  const merged: LevelRecord = prev
    ? {
        ...prev,
        cleared: prev.cleared || rec.cleared,
        attempts: prev.attempts + 1,
        updatedAt: rec.updatedAt,
        ...(better ? { stars: rec.stars, timeMs: rec.timeMs, mistakes: rec.mistakes, hints: rec.hints } : {}),
      }
    : rec;
  return { ...records, [rec.key]: merged };
}
