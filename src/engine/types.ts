/** 核心技术（用于难度归因与提示讲解），按人类解题的“思考成本”分层 */
export type TechniqueId =
  | 'naked-single' // 行/列只剩一个候选格
  | 'color-single' // 某颜色只剩一个候选格
  | 'line-confined-to-color' // 某行/列的候选全是同一颜色 -> 该颜色别的格子排除
  | 'color-confined-to-line' // 某颜色的候选全在同一行/列 -> 该行/列其它颜色排除
  | 'line-intersection' // 某行与某列的候选同为一种颜色，交会点必为牛
  | 'pair-containment' // 2 行/列的候选恰好落在 2 种颜色(或 2 列)内
  | 'triple-containment' // 3 单元的包含关系
  | 'color-neighborhood' // 某颜色候选的两两邻域覆盖 -> 排除公共邻格
  | 'color-wipeout' // 放置后会导致某颜色无处可放（反证）
  | 'lookahead' // 一步反证/试错
  | 'refutation' // 排除法：假设放牛会走到无解 -> 排除
  | 'search-hint'; // 兜底：直接推演唯一解

export const TECHNIQUE_TIER: Record<TechniqueId, number> = {
  'naked-single': 1,
  'color-single': 1,
  'line-confined-to-color': 2,
  'color-confined-to-line': 2,
  'line-intersection': 2,
  'pair-containment': 3,
  'triple-containment': 3,
  'color-neighborhood': 3,
  'color-wipeout': 4,
  lookahead: 4,
  refutation: 5,
  'search-hint': 5,
};

export interface Deduction {
  technique: TechniqueId;
  tier: number;
  kind: 'place' | 'eliminate';
  /** 参与推理的格子（提示时高亮为“原因”） */
  cells: number[];
  /** 被影响的格子（放置格或排除格） */
  targets: number[];
  /** 中文讲解 */
  text: string;
}

export interface SolveMetrics {
  /** 能否只用人类技术（1-4 层）解完，无需试错 */
  solvableByLogic: boolean;
  /** 用到的最高技术层 0-4 */
  highestTier: number;
  /** 推理步数 */
  steps: number;
  /** 各技术使用次数 */
  techniqueCounts: Partial<Record<TechniqueId, number>>;
  /** 试错深度（0 = 完全不需要试错） */
  guessDepth: number;
  /** 搜索节点数（纯逻辑解出时为 0） */
  searchNodes: number;
  /** 解是否唯一 */
  unique: boolean;
  placeCount: number;
  eliminateCount: number;
  /** 逻辑推理到底时已完成的比例 0..1 */
  logicProgress: number;
  /** 组合推理步数（第 3 层及以上的技术）—— 最贴近“人觉得难不难”的指标 */
  hardSteps: number;
  /** 是否必须动用“排除法/反证”兜底才能推进 */
  needsRefutation: boolean;
  /** 完整解法里用了多少次排除法（反证） */
  refutationSteps: number;
  /** 推理过程中平均剩余候选数（阅读负担：棋盘越绕，这个数越大） */
  avgCandidates: number;
  /** 唯一性未被证实（预算不足） */
  unproven?: boolean;
}

export interface DifficultyFeatures {
  n: number;
  /** 颜色区域的“缠绕度” 0..1（越小越紧凑） */
  winding: number;
  /** 区域大小的标准差（越小越均匀） */
  sizeStdDev: number;
  /** 区域大小的基尼系数（越大越不均匀） */
  sizeGini: number;
  /** 只有 1-2 格的“小颜色”占比（小颜色往往提供强线索） */
  smallColorRatio: number;
  /** 相邻同色数对占比（domino 线索多） */
  dominoRatio: number;
  /** 技术成本加权和 */
  tierCost: number;
  highestTier: number;
  steps: number;
  guessDepth: number;
  needsRefutation: boolean;
  refutationSteps: number;
  logicProgress: number;
  /** 被限制在一行/一列内的颜色占比（强线索） */
  lineConfinedColors: number;
  /** 整行/整列同色的比例 */
  monoLineRatio: number;
  /** 组合推理步数（第 3 层及以上） */
  hardSteps: number;
  /** 平均每头牛需要多少步组合推理 */
  hardPerCow: number;
  /** 反证 / 试错类步数（一步反证、反证：颜色无处可放、排除法） */
  refuteishSteps: number;
  /** 小颜色（≤3 格）占的格子比例 —— 越大越简单 */
  tinyShare: number;
  /** 小颜色（≤3 格）的个数 —— 原版一般不超过 3 个，太多会让关卡变简单 */
  tinyColors: number;
  /** 最大颜色块占的格子比例 —— 越大越难（需要长距离推理） */
  giantShare: number;
  /** 平均剩余候选数（阅读负担） */
  avgCandidates: number;
}

export interface PuzzleMeta {
  seed: number;
  style: ShapeStyle;
  attempts: number;
  generateMs: number;
  score: number;
  label: string;
  features: DifficultyFeatures;
  metrics: SolveMetrics;
  /** 生成时的目标（用于关卡包/实验复现） */
  target?: PuzzleTarget;
}

export interface Puzzle {
  id: string;
  n: number;
  /** colors[r][c] = 颜色 id，取值 0..n-1，同色格子构成连通区域 */
  colors: number[][];
  /** solution[r] = 第 r 行小牛所在列 */
  solution: number[];
  meta: PuzzleMeta;
}

export interface PuzzleTarget {
  /** 目标难度分 1..10 */
  score?: number;
  /** 至少需要用到某层技术（用于生成“必须有挑战”的关卡） */
  minTier?: number;
  /** 最高允许技术层（null/undefined 表示不限） */
  maxTier?: number;
  /** 必须纯逻辑可解（不依赖试错） */
  requireLogic?: boolean;
  /** 必须用到排除法/反证兜底（更高难度） */
  requireRefutation?: boolean;
  /** 至少要多少步组合推理（第 3 层及以上） */
  minHardSteps?: number;
  /** 至少要多少步“反证 / 试错”类推理（第 4 层及以上） */
  minRefuteishSteps?: number;
  /** 至少要用几次排除法（反证） */
  minRefutationSteps?: number;
  /** 最多允许几个“小颜色”（≤3 格）—— 高难度档用它贴近原版手感 */
  maxTinyColors?: number;
  /** 最大颜色块占比的上限 —— 高难度档不让单个色块吃掉半张棋盘 */
  maxGiantShare?: number;
  /** 硬性最低难度分（最高档次用它保证“真的难”，不允许悄悄降级） */
  minScore?: number;
}

export interface GenerateOptions {
  n: number;
  style: ShapeStyle;
  seed: number;
  target?: PuzzleTarget;
  /** 最多尝试次数 */
  maxAttempts?: number;
  /** 生成预算（毫秒），超时返回当前最优 */
  budgetMs?: number;
  /** 唯一性搜索节点上限 */
  nodeLimit?: number;
}

export interface CellRef {
  r: number;
  c: number;
}

/**
 * 颜色区域的“造型风格”，决定关卡的设计难度（比棋盘大小重要得多）：
 * - segments：线段型颜色（整个颜色被限制在一行/列内）占比 —— 最强最基础的线索
 * - crosses：整行/整列型颜色占比（占满一线再长出尾巴）—— 对应“整线同色”“行列同色交会”
 * - compactness：其余颜色的生长方式，1 = 紧凑色块，0 = 随机缠绕
 */
export interface ShapeStyle {
  /** 颜色大小的不均匀程度：0 = 每种颜色一样大（约束很弱，几乎必然多解），1 = 大量 1-3 格的小颜色 */
  small: number;
  /** 是否允许出现特别大的色块（0~1，越大越容易出现“巨型色块”，难度更高） */
  giant: number;
  segments: number;
  crosses: number;
  compactness: number;
}
