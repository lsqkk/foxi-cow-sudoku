import type { DifficultyFeatures } from '../engine/types';

export interface Settings {
  /** 放错牛立刻提示并记错（关闭后可以“摆完再说”，更接近纯粹推理） */
  strictMistakes: boolean;
  colorBlind: boolean;
  showMetrics: boolean;
  autoNext: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  strictMistakes: true,
  colorBlind: false,
  showMetrics: true,
  autoNext: false,
};

export interface Progress {
  level: number;
  difficulty: number;
  /** null = 跟随难度自动选择尺寸 */
  size: number | null;
}

export const DEFAULT_PROGRESS: Progress = { level: 1, difficulty: 4, size: null };

export interface MetricsLite {
  solvableByLogic: boolean;
  needsRefutation: boolean;
  highestTier: number;
  steps: number;
  techniqueCounts: Record<string, number>;
  logicProgress: number;
}

export interface SessionRecord {
  id: string;
  mode: 'endless' | 'calibration';
  /** 关卡包里的编号（无尽模式为空） */
  packId?: string;
  level: number;
  n: number;
  seed: number;
  score: number;
  label: string;
  features: DifficultyFeatures;
  metrics: MetricsLite;
  timeMs: number;
  finishTimeMs?: number;
  mistakes: number;
  hints: number;
  undos: number;
  clears: number;
  finished: boolean;
  rating?: number;
  ratingTags?: string[];
  ratingNote?: string;
  createdAt: number;
  updatedAt: number;
}

const SESSION_KEY = 'foxi.sessions.v1';
const SETTINGS_KEY = 'foxi.settings.v1';
const PROGRESS_KEY = 'foxi.progress.v1';

function read<T>(key: string, fallback: T): T {
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
    /* 忽略：无痕模式等场景 */
  }
}

export function loadSettings(): Settings {
  return read(SETTINGS_KEY, DEFAULT_SETTINGS);
}
export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}
export function loadProgress(): Progress {
  return read(PROGRESS_KEY, DEFAULT_PROGRESS);
}
export function saveProgress(p: Progress): void {
  write(PROGRESS_KEY, p);
}

export function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SessionRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(list: SessionRecord[]): void {
  write(SESSION_KEY, list.slice(-400));
}

export function upsertSession(record: SessionRecord): SessionRecord[] {
  const list = loadSessions();
  const idx = list.findIndex((r) => r.id === record.id);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  saveSessions(list);
  return list;
}

export function clearSessions(): void {
  write(SESSION_KEY, []);
}

export function exportJSON(records: SessionRecord[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: records.length, records }, null, 2);
}

export function exportCSV(records: SessionRecord[]): string {
  const cols = [
    'id',
    'mode',
    'packId',
    'level',
    'n',
    'seed',
    'score',
    'label',
    'timeSec',
    'mistakes',
    'hints',
    'undos',
    'clears',
    'finished',
    'rating',
    'ratingTags',
    'ratingNote',
    'smallColorRatio',
    'sizeGini',
    'winding',
    'tierCost',
    'logicProgress',
    'highestTier',
    'steps',
  ] as const;
  const rows = records.map((r) =>
    [
      r.id,
      r.mode,
      r.packId ?? '',
      r.level,
      r.n,
      r.seed,
      r.score.toFixed(2),
      r.label,
      (r.timeMs / 1000).toFixed(1),
      r.mistakes,
      r.hints,
      r.undos,
      r.clears,
      r.finished ? 1 : 0,
      r.rating ?? '',
      (r.ratingTags ?? []).join('|'),
      (r.ratingNote ?? '').replace(/[\n,]/g, ' '),
      r.features.smallColorRatio.toFixed(3),
      r.features.sizeGini.toFixed(3),
      r.features.winding.toFixed(3),
      r.features.tierCost.toFixed(2),
      r.features.logicProgress.toFixed(3),
      r.features.highestTier,
      r.features.steps,
    ].join(','),
  );
  return [cols.join(','), ...rows].join('\n');
}
