import type { ShapeStyle } from './board';
import { clamp } from './util';
import type { Deduction, DifficultyFeatures, PuzzleTarget, SolveMetrics, TechniqueId } from './types';

export { clamp };

/**
 * 每种技术的“人类思考成本”。
 * 难度主要来自“要用什么技术”，而不是棋盘大小 —— 大小只在最后做轻微修正。
 */
export const TECHNIQUE_COST: Record<TechniqueId, number> = {
  'naked-single': 1,
  'color-single': 1,
  'line-confined-to-color': 3.5,
  'color-confined-to-line': 3.5,
  'line-intersection': 4,
  'pair-containment': 7,
  'triple-containment': 9,
  'color-neighborhood': 8,
  'color-wipeout': 12,
  lookahead: 14,
  refutation: 12,
  'search-hint': 18,
};

export const TECHNIQUE_LABEL: Record<TechniqueId, string> = {
  'naked-single': '行列唯一候选',
  'color-single': '颜色唯一候选',
  'line-confined-to-color': '整行/列同色',
  'color-confined-to-line': '颜色被限制在一行/列',
  'line-intersection': '行列同色交会',
  'pair-containment': '两单元包含排除',
  'triple-containment': '三单元包含排除',
  'color-neighborhood': '同色候选邻域覆盖',
  'color-wipeout': '反证：颜色无处可放',
  lookahead: '一步反证（试错）',
  refutation: '排除法（反证）',
  'search-hint': '唯一解推演',
};

/** 棋盘形状特征：与“用什么技术”无关的地图设计部分 */
export function extractFeatures(n: number, colors: number[][], metrics: SolveMetrics): DifficultyFeatures {
  const sizes = new Array<number>(n).fill(0);
  const rowsOfColor: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const colsOfColor: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = colors[r][c];
      sizes[k]++;
      rowsOfColor[k].add(r);
      colsOfColor[k].add(c);
    }
  }

  const mean = sizes.reduce((a, b) => a + b, 0) / n;
  const variance = sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sizeStdDev = Math.sqrt(variance) / n;
  // 基尼系数：0 = 完全等大，1 = 极不均匀
  const sorted = sizes.slice().sort((a, b) => a - b);
  let giniNum = 0;
  for (let i = 0; i < n; i++) giniNum += (2 * (i + 1) - n - 1) * sorted[i];
  const totalCells = sizes.reduce((a, b) => a + b, 0) || 1;
  const sizeGini = Math.max(0, giniNum / (n * totalCells));

  let internalPairs = 0;
  let totalPairs = 0;
  const perRegionPerimeter = new Array<number>(n).fill(0);
  let monoLines = 0;
  for (let r = 0; r < n; r++) {
    let mono = true;
    for (let c = 1; c < n; c++) if (colors[r][c] !== colors[r][0]) mono = false;
    if (mono) monoLines++;
  }
  for (let c = 0; c < n; c++) {
    let mono = true;
    for (let r = 1; r < n; r++) if (colors[r][c] !== colors[0][c]) mono = false;
    if (mono) monoLines++;
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = colors[r][c];
      if (r + 1 < n) {
        totalPairs++;
        if (colors[r + 1][c] === k) internalPairs++;
      }
      if (c + 1 < n) {
        totalPairs++;
        if (colors[r][c + 1] === k) internalPairs++;
      }
      if (r === 0 || colors[r - 1][c] !== k) perRegionPerimeter[k]++;
      if (r === n - 1 || colors[r + 1][c] !== k) perRegionPerimeter[k]++;
      if (c === 0 || colors[r][c - 1] !== k) perRegionPerimeter[k]++;
      if (c === n - 1 || colors[r][c + 1] !== k) perRegionPerimeter[k]++;
    }
  }

  // 缠绕度：区域周长相对“等面积正方形”的超出程度
  let windingSum = 0;
  let windingWeight = 0;
  for (let k = 0; k < n; k++) {
    const area = sizes[k];
    if (area <= 0) continue;
    const ideal = 4 * Math.sqrt(area);
    const w = clamp((perRegionPerimeter[k] / ideal - 1) / 1.6, 0, 1);
    windingSum += w * area;
    windingWeight += area;
  }
  const winding = windingWeight > 0 ? windingSum / windingWeight : 0;

  // 被限制在一行/一列内的颜色（强线索）
  let lineConfined = 0;
  for (let k = 0; k < n; k++) if (rowsOfColor[k].size === 1 || colsOfColor[k].size === 1) lineConfined++;

  let tierCost = 0;
  for (const [id, count] of Object.entries(metrics.techniqueCounts)) {
    tierCost += (TECHNIQUE_COST[id as TechniqueId] ?? 0) * (count ?? 0);
  }

  return {
    n,
    winding,
    sizeStdDev,
    sizeGini,
    smallColorRatio: sizes.filter((s) => s <= 2).length / n,
    dominoRatio: totalPairs > 0 ? internalPairs / totalPairs : 0,
    tierCost,
    highestTier: metrics.highestTier,
    steps: metrics.steps,
    guessDepth: metrics.guessDepth,
    needsRefutation: metrics.needsRefutation,
    refutationSteps: metrics.refutationSteps,
    logicProgress: metrics.logicProgress,
    lineConfinedColors: lineConfined / n,
    monoLineRatio: monoLines / (2 * n),
  };
}

/**
 * 生成难度分（1..10，约等于“平均每头牛要花多少思考量”）。
 *
 * 设计原则：
 * - 主要看关卡设计：用了哪些技巧、要不要反证/排除法、颜色是否缠绕。
 * - 棋盘大小只做 ±10% 的轻微修正：10×10 也可以很简单，12/13 也可能只是中等。
 */
export function scorePuzzle(features: DifficultyFeatures, metrics: SolveMetrics): number {
  const sizeFactor = 1 + 0.02 * (features.n - 8); // n=5 -> 0.94, n=13 -> 1.10
  const windingFactor = 1 + 0.35 * features.winding;
  const perCowCost = features.tierCost / features.n;
  const relief = 1 - 0.12 * features.lineConfinedColors; // 有明确入手点 -> 更好读
  const base = perCowCost * sizeFactor * windingFactor * relief;
  // 简单逻辑越早卡住，越依赖“排除法/反证”，关卡就越难
  const deficit = clamp(1 - metrics.logicProgress, 0, 1);
  const refutationPenalty = metrics.needsRefutation ? 1.4 + 4.6 * deficit : 0;
  const searchPenalty = 0.45 * Math.min(metrics.guessDepth, 4);
  return clamp(1 + base + refutationPenalty + searchPenalty, 1, 10);
}

export function difficultyLabel(score: number): string {
  if (score < 2.5) return '入门';
  if (score < 4) return '简单';
  if (score < 5.8) return '中等';
  if (score < 7.5) return '困难';
  return '大师';
}

export interface GenerationProfile {
  n: number;
  style: ShapeStyle;
  target: PuzzleTarget;
}

interface LadderRow {
  score: number;
  n: number;
  small: number;
  segments: number;
  crosses: number;
  compactness: number;
  minTier: number;
  refute?: boolean;
}

/** 难度刻度：分数 -> 生成参数（尺寸只是默认值，可被玩家单独指定） */
const LADDER: LadderRow[] = [
  { score: 1, n: 5, small: 0.85, segments: 0.35, crosses: 0.2, compactness: 0.9, minTier: 0 },
  { score: 2, n: 6, small: 0.8, segments: 0.33, crosses: 0.18, compactness: 0.85, minTier: 1 },
  { score: 3, n: 7, small: 0.72, segments: 0.3, crosses: 0.16, compactness: 0.78, minTier: 2 },
  { score: 4, n: 8, small: 0.64, segments: 0.28, crosses: 0.14, compactness: 0.7, minTier: 2 },
  { score: 5, n: 9, small: 0.56, segments: 0.26, crosses: 0.13, compactness: 0.62, minTier: 2 },
  { score: 6, n: 10, small: 0.5, segments: 0.24, crosses: 0.12, compactness: 0.55, minTier: 3 },
  { score: 7, n: 10, small: 0.44, segments: 0.2, crosses: 0.1, compactness: 0.47, minTier: 3 },
  { score: 8, n: 11, small: 0.4, segments: 0.16, crosses: 0.08, compactness: 0.4, minTier: 3 },
  { score: 9, n: 12, small: 0.36, segments: 0.12, crosses: 0.06, compactness: 0.32, minTier: 4, refute: true },
  { score: 10, n: 13, small: 0.32, segments: 0.1, crosses: 0.05, compactness: 0.26, minTier: 4, refute: true },
];

export function profileForScore(score: number, sizeOverride?: number): GenerationProfile {
  const s = clamp(score, 1, 10);
  let lo = LADDER[0];
  let hi = LADDER[LADDER.length - 1];
  for (let i = 0; i + 1 < LADDER.length; i++) {
    if (s >= LADDER[i].score && s <= LADDER[i + 1].score) {
      lo = LADDER[i];
      hi = LADDER[i + 1];
      break;
    }
  }
  const t = hi.score === lo.score ? 0 : (s - lo.score) / (hi.score - lo.score);
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const minTier = Math.round(lerp(lo.minTier, hi.minTier));
  const requireRefutation = (lo.refute ?? false) || (hi.refute ?? false);
  return {
    n: sizeOverride ?? Math.round(lerp(lo.n, hi.n)),
    style: {
      small: lerp(lo.small, hi.small),
      segments: lerp(lo.segments, hi.segments),
      crosses: lerp(lo.crosses, hi.crosses),
      compactness: lerp(lo.compactness, hi.compactness),
    },
    target: {
      score: s,
      minTier: minTier > 0 ? minTier : undefined,
      requireRefutation: requireRefutation || undefined,
      requireLogic: s < 9,
    },
  };
}

/** 预设难度：名字 + 默认尺寸 + 目标分数 + 造型风格 */
export interface Preset {
  id: string;
  name: string;
  desc: string;
  n: number;
  score: number;
  style: ShapeStyle;
}

export const PRESETS: Preset[] = [
  {
    id: 'starter',
    name: '入门',
    desc: '6×6，大量“单色线段”线索，基本只需唯一候选与整行同色',
    n: 6,
    score: 2,
    style: { small: 0.8, segments: 0.33, crosses: 0.18, compactness: 0.85 },
  },
  {
    id: 'easy',
    name: '简单',
    desc: '8×8，色块规整，颜色被限制在一行/列这类线索很多',
    n: 8,
    score: 3.4,
    style: { small: 0.7, segments: 0.29, crosses: 0.15, compactness: 0.75 },
  },
  {
    id: 'normal',
    name: '中等',
    desc: '10×10，色块开始弯曲，需要包含关系等组合推理',
    n: 10,
    score: 5,
    style: { small: 0.56, segments: 0.26, crosses: 0.13, compactness: 0.62 },
  },
  {
    id: 'hard',
    name: '困难',
    desc: '10×10，缠绕色块，多步组合推理，入手点较少',
    n: 10,
    score: 6.8,
    style: { small: 0.45, segments: 0.2, crosses: 0.1, compactness: 0.47 },
  },
  {
    id: 'expert',
    name: '专家',
    desc: '12×12，需要邻域覆盖或一步反证',
    n: 12,
    score: 8.2,
    style: { small: 0.38, segments: 0.14, crosses: 0.07, compactness: 0.35 },
  },
  {
    id: 'master',
    name: '大师',
    desc: '13×13，强缠绕，通常必须动用排除法/反证',
    n: 13,
    score: 9.3,
    style: { small: 0.33, segments: 0.1, crosses: 0.05, compactness: 0.26 },
  },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[2];
}

/** 把提示里的 颜色#k 换成可读颜色名（由 UI 提供调色板） */
export function formatDeduction(d: Deduction, colorNames: string[]): string {
  return d.text.replace(/颜色#(\d+)/g, (_, k) => colorNames[Number(k) - 1] ?? `颜色${k}`);
}
