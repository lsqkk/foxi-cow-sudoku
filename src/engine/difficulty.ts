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

  const cellsTotal = n * n;
  let tinyCells = 0;
  for (let k = 0; k < n; k++) if (sizes[k] <= 3) tinyCells += sizes[k];
  const giantShare = Math.max(...sizes) / cellsTotal;
  const tinyShare = tinyCells / cellsTotal;

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
    hardSteps: metrics.hardSteps,
    hardPerCow: metrics.hardSteps / n,
    tinyShare,
    giantShare,
    avgCandidates: metrics.avgCandidates,
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
  const sizeFactor = 1 + 0.02 * (features.n - 8);
  const H = designHardness(features, metrics);
  // 标定：让“最规整的入门关”落在 ~2 分，“能做出来的最难关”落在 ~9.5 分
  const score = 0.9 + 18.5 * H * sizeFactor;
  return clamp(score, 1, 10);
}

/**
 * 设计难度（0~1）：只由“地图设计 + 解题过程”决定，与棋盘大小无关。
 * 加分项 = 需要动脑的地方；减分项 = 白送信息的地方。
 */
export function designHardness(features: DifficultyFeatures, metrics: SolveMetrics): number {
  const norm = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);
  const H =
    0.3 * norm(features.hardPerCow, 0, 0.5) +
    0.22 * norm(features.giantShare, 0.2, 0.6) +
    0.16 * norm(features.winding, 0.1, 0.9) +
    0.18 * norm(features.avgCandidates / features.n, 0.7, 1.8) +
    (metrics.needsRefutation ? 0.22 + 0.07 * Math.min(metrics.refutationSteps, 4) : 0) -
    0.3 * norm(features.tinyShare, 0, 0.25) -
    0.18 * norm(features.lineConfinedColors, 0, 0.6) -
    0.12 * norm(features.monoLineRatio, 0, 0.3);

  return clamp(H, 0, 1);
}

export function difficultyLabel(score: number): string {
  if (score < 3) return '入门';
  if (score < 4.5) return '简单';
  if (score < 6.2) return '中等';
  if (score < 8) return '困难';
  if (score < 9.1) return '大师';
  return '地狱';
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
  giant: number;
  segments: number;
  crosses: number;
  compactness: number;
  minTier: number;
  minHard: number;
  refute?: boolean;
}

/** 难度刻度：分数 -> 生成参数（尺寸只是默认值，可被玩家单独指定） */
const LADDER: LadderRow[] = [
  { score: 1, n: 5, small: 0.85, giant: 0.2, segments: 0.35, crosses: 0.2, compactness: 0.9, minTier: 0, minHard: 0 },
  { score: 2, n: 6, small: 0.8, giant: 0.25, segments: 0.33, crosses: 0.18, compactness: 0.85, minTier: 1, minHard: 0 },
  { score: 3, n: 7, small: 0.72, giant: 0.3, segments: 0.3, crosses: 0.16, compactness: 0.78, minTier: 2, minHard: 0 },
  { score: 4, n: 8, small: 0.64, giant: 0.4, segments: 0.28, crosses: 0.14, compactness: 0.7, minTier: 2, minHard: 1 },
  { score: 5, n: 9, small: 0.56, giant: 0.5, segments: 0.26, crosses: 0.13, compactness: 0.62, minTier: 2, minHard: 1 },
  { score: 6, n: 10, small: 0.5, giant: 0.55, segments: 0.18, crosses: 0.08, compactness: 0.5, minTier: 3, minHard: 2 },
  { score: 7, n: 10, small: 0.46, giant: 0.62, segments: 0.06, crosses: 0.02, compactness: 0.42, minTier: 3, minHard: 3 },
  { score: 8, n: 11, small: 0.42, giant: 0.68, segments: 0, crosses: 0, compactness: 0.34, minTier: 3, minHard: 4 },
  { score: 9, n: 12, small: 0.38, giant: 0.72, segments: 0, crosses: 0, compactness: 0.28, minTier: 3, minHard: 5 },
  { score: 10, n: 13, small: 0.36, giant: 0.78, segments: 0, crosses: 0, compactness: 0.22, minTier: 3, minHard: 5 },
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
  const minHard = Math.round(lerp(lo.minHard, hi.minHard));
  const n = sizeOverride ?? Math.round(lerp(lo.n, hi.n));
  const giant = lerp(lo.giant, hi.giant);
  // 实测：唯一解既依赖“小颜色”，也依赖“巨型色块”（两者都能提供强约束）。
  // giant 越高，允许的小颜色越少 —— 这正是把最高难度做硬的关键。
  const minSmall = clamp(0.42 + Math.max(0, n - 8) * 0.035 - 0.15 * giant, 0.32, 0.7);
  const small = Math.max(minSmall, lerp(lo.small, hi.small));
  return {
    n,
    style: {
      small,
      giant,
      segments: lerp(lo.segments, hi.segments),
      crosses: lerp(lo.crosses, hi.crosses),
      compactness: lerp(lo.compactness, hi.compactness),
    },
    target: {
      score: s,
      minTier: minTier > 0 ? minTier : undefined,
      minHardSteps: minHard > 0 ? minHard : undefined,
      // 高难度档不允许“悄悄降级”成简单关卡：给一个硬性最低分
      minScore: s >= 7 ? s - 0.8 : undefined,
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
    style: { small: 0.8, giant: 0.25, segments: 0.33, crosses: 0.18, compactness: 0.85 },
  },
  {
    id: 'easy',
    name: '简单',
    desc: '8×8，色块规整，颜色被限制在一行/列这类线索很多',
    n: 8,
    score: 3.4,
    style: { small: 0.7, giant: 0.32, segments: 0.29, crosses: 0.15, compactness: 0.75 },
  },
  {
    id: 'normal',
    name: '中等',
    desc: '10×10，色块开始弯曲，需要包含关系等组合推理',
    n: 10,
    score: 5,
    style: { small: 0.56, giant: 0.5, segments: 0.26, crosses: 0.13, compactness: 0.62 },
  },
  {
    id: 'hard',
    name: '困难',
    desc: '10×10，缠绕色块，多步组合推理，入手点较少',
    n: 10,
    score: 6.8,
    style: { small: 0.46, giant: 0.7, segments: 0.2, crosses: 0.1, compactness: 0.47 },
  },
  {
    id: 'expert',
    name: '专家',
    desc: '12×12，需要邻域覆盖或一步反证',
    n: 12,
    score: 8.2,
    style: { small: 0.4, giant: 0.82, segments: 0.14, crosses: 0.07, compactness: 0.35 },
  },
  {
    id: 'master',
    name: '大师',
    desc: '13×13，强缠绕 + 巨型色块，多步组合推理',
    n: 13,
    score: 9,
    style: { small: 0.37, giant: 0.72, segments: 0, crosses: 0, compactness: 0.28 },
  },
  {
    id: 'hell',
    name: '地狱',
    desc: '13×13，必须动用排除法（反证）才能推进',
    n: 13,
    score: 9.6,
    style: { small: 0.36, giant: 0.75, segments: 0, crosses: 0, compactness: 0.24 },
  },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[2];
}

/** 把提示里的 颜色#k 换成可读颜色名（由 UI 提供调色板） */
export function formatDeduction(d: Deduction, colorNames: string[]): string {
  return d.text.replace(/颜色#(\d+)/g, (_, k) => colorNames[Number(k) - 1] ?? `颜色${k}`);
}
