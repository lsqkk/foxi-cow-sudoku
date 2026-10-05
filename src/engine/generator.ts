import {
  growRegions,
  randomSolution,
  validateColorAssignment,
  validateColorAssignmentConnected,
  validateSolution,
} from './board';
import { buildNeighbors4, colOf, idx, rowOf } from './board';
import { difficultyLabel, extractFeatures, profileForScore, scorePuzzle } from './difficulty';
import { hashString, mulberry32 } from './rng';
import { analyzePuzzle, countRefutations, countSolutions, runLadder } from './solver';
import type { GenerateOptions, Puzzle, PuzzleMeta, PuzzleTarget, ShapeStyle } from './types';

/** 该颜色是否“被限制在一行/一列内”（强线索） */
function isLineConfined(n: number, colors: number[][], k: number): boolean {
  let r0 = -1;
  let c0 = -1;
  let sameRow = true;
  let sameCol = true;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (colors[r][c] !== k) continue;
      if (r0 < 0) {
        r0 = r;
        c0 = c;
        continue;
      }
      if (r !== r0) sameRow = false;
      if (c !== c0) sameCol = false;
    }
  }
  return sameRow || sameCol;
}

function regionConnectedWithout(n: number, colors: number[][], k: number, remove: number): boolean {
  const cells: number[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = idx(n, r, c);
      if (colors[r][c] === k && i !== remove) cells.push(i);
    }
  }
  if (cells.length === 0) return false;
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  const nbr4 = buildNeighbors4(n);
  while (stack.length) {
    const i = stack.pop() as number;
    for (const j of nbr4[i]) {
      if (seen.has(j)) continue;
      if (colors[rowOf(n, j)][colOf(n, j)] === k && j !== remove) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
}

interface BoundaryMove {
  cell: number;
  from: number;
  to: number;
  cost: number;
}

/**
 * 候选搬迁：把一个“别的解里用到、但真解里不是牛”的格子从它的颜色挪到相邻颜色。
 * 这样那个解立刻作废（同色会出现两头牛），而真解不受影响。
 */
function boundaryMoves(
  n: number,
  solution: number[],
  colors: number[][],
  alternatives: number[][],
  rng: () => number,
): { strict: BoundaryMove[]; loose: BoundaryMove[] } {
  const nbr4 = buildNeighbors4(n);
  const strict: BoundaryMove[] = [];
  const loose: BoundaryMove[] = [];
  const sizes = new Array<number>(n).fill(0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) sizes[colors[r][c]]++;
  const used = new Set<number>();

  for (const alt of alternatives) {
    for (let r = 0; r < n; r++) {
      if (alt[r] === solution[r]) continue;
      const cell = idx(n, r, alt[r]);
      if (used.has(cell)) continue;
      used.add(cell);
      const from = colors[r][alt[r]];
      for (const j of nbr4[cell]) {
        const to = colors[rowOf(n, j)][colOf(n, j)];
        if (to === from) continue;
        const connected = regionConnectedWithout(n, colors, from, cell);
        let cost = 0;
        if (isLineConfined(n, colors, to)) cost += 4; // 尽量不破坏“强线索颜色”
        if (isLineConfined(n, colors, from)) cost += 1;
        cost += sizes[to] / n; // 优先挑小颜色，避免某个颜色无限膨胀
        cost += rng() * 0.5;
        (connected ? strict : loose).push({ cell, from, to, cost });
      }
    }
  }
  return { strict, loose };
}

function solutionCount(n: number, colors: number[][], nodeLimit: number): { count: number; reliable: boolean } {
  const res = countSolutions({ n, colors }, 4, nodeLimit);
  if (res.count >= 2) return { count: res.count, reliable: true };
  if (res.count === 1) return { count: 1, reliable: !res.budgetHit };
  return { count: 5, reliable: false };
}

/**
 * 唯一性修复（爬山法）：
 * 反复尝试“把某个格子挪给相邻颜色”的改动，选择能让解数量下降的方案，
 * 直到棋盘只剩唯一解。这是把“随机分区几乎必然多解”变成“可玩关卡”的关键一步。
 */
export function repairToUnique(
  n: number,
  solution: number[],
  colorsIn: number[][],
  rng: () => number,
  opts: { nodeLimit: number; maxRepairs: number },
): { colors: number[][]; repairs: number; unique: boolean; trace: string[] } {
  let colors = colorsIn.map((row) => row.slice());
  const trace: string[] = [];
  const evalLimit = Math.max(4000, Math.floor(opts.nodeLimit / 4));
  let current = solutionCount(n, colors, opts.nodeLimit);
  let bestColors = colors.map((row) => row.slice());
  let bestCount = current.count;
  let bestReliable = current.reliable;
  trace.push(`初始解数=${current.count}${current.reliable ? '' : '(预算不足)'}`);
  if (bestCount === 1 && bestReliable) return { colors, repairs: 0, unique: true, trace };

  const seen = new Set<string>([colors.map((row) => row.join('')).join('|')]);
  let stall = 0;

  for (let step = 1; step <= opts.maxRepairs; step++) {
    const search = countSolutions({ n, colors }, 6, opts.nodeLimit);
    const alts = search.solutions.filter((s) => s.some((c, r) => c !== solution[r]));
    if (alts.length === 0) {
      trace.push(`步${step}: 找不到其他解，停止`);
      break;
    }
    // 只用“保持颜色区域连通”的搬迁，这样生成出来的颜色块仍然是一整块（观感更好）
    const { strict } = boundaryMoves(n, solution, colors, alts, rng);
    const pool = strict.slice();
    if (pool.length === 0) {
      trace.push(`步${step}: 没有可用的搬迁方案，停止`);
      break;
    }
    pool.sort((a, b) => a.cost - b.cost);
    const shortlist = pool.slice(0, Math.min(28, pool.length));

    let chosen: { move: BoundaryMove; count: number; reliable: boolean } | null = null;
    for (const move of shortlist) {
      const trial = colors.map((row) => row.slice());
      trial[rowOf(n, move.cell)][colOf(n, move.cell)] = move.to;
      if (!validateColorAssignment(n, trial, solution)) continue;
      const { count, reliable } = solutionCount(n, trial, evalLimit);
      if (!chosen || count < chosen.count) chosen = { move, count, reliable };
      if (count === 1 && reliable) break;
    }
    if (!chosen) {
      trace.push(`步${step}: 所有搬迁都非法，停止`);
      break;
    }

    colors = colors.map((row, i) => row.map((v, j) => (i === rowOf(n, chosen!.move.cell) && j === colOf(n, chosen!.move.cell) ? chosen!.move.to : v)));
    const key = colors.map((row) => row.join('')).join('|');
    trace.push(`步${step}: 搬 (${rowOf(n, chosen.move.cell) + 1},${colOf(n, chosen.move.cell) + 1}) ${chosen.move.from}->${chosen.move.to} 解数=${chosen.count}`);

    if (chosen.count < bestCount) {
      bestCount = chosen.count;
      bestReliable = chosen.reliable;
      bestColors = colors.map((row) => row.slice());
      stall = 0;
    } else {
      stall++;
      if (stall > 6) {
        trace.push(`步${step}: 连续无改善，改用最优结果`);
        break;
      }
    }
    if (seen.has(key)) {
      trace.push(`步${step}: 状态重复，停止`);
      break;
    }
    seen.add(key);
    if (bestCount === 1 && bestReliable) break;
  }

  if (bestCount !== 1 || !bestReliable) {
    const verify = solutionCount(n, bestColors, opts.nodeLimit);
    bestReliable = verify.count === 1 && verify.reliable;
    bestCount = verify.count;
  }
  return { colors: bestColors, repairs: trace.length, unique: bestCount === 1 && bestReliable, trace };
}

/** 与目标难度/约束的距离，越小越好（完全确定，因此生成过程可复现） */
function targetPenalty(meta: PuzzleMeta, target: PuzzleTarget | undefined): number {
  if (!target) return 0;
  let penalty = 0;
  if (target.score !== undefined) penalty += Math.abs(meta.score - target.score);
  if (target.minTier !== undefined && meta.metrics.highestTier < target.minTier) {
    penalty += 1.6 * (target.minTier - meta.metrics.highestTier);
  }
  if (target.maxTier !== undefined && meta.metrics.highestTier > target.maxTier) {
    penalty += 1.6 * (meta.metrics.highestTier - target.maxTier);
  }
  if (target.requireLogic && !meta.metrics.solvableByLogic) penalty += 2.5;
  if (target.requireRefutation && !meta.metrics.needsRefutation) penalty += 2.5;
  if (target.minHardSteps !== undefined && meta.metrics.hardSteps < target.minHardSteps) {
    penalty += 1.6 * (target.minHardSteps - meta.metrics.hardSteps);
  }
  if (target.minRefutationSteps !== undefined && meta.metrics.refutationSteps < target.minRefutationSteps) {
    penalty += 3 * (target.minRefutationSteps - meta.metrics.refutationSteps);
  }
  if (target.minScore !== undefined && meta.score < target.minScore) {
    penalty += 2.5 * (target.minScore - meta.score);
  }
  return penalty;
}

function constraintsMet(meta: PuzzleMeta, target: PuzzleTarget | undefined): boolean {
  if (!target) return true;
  if (target.requireLogic && !meta.metrics.solvableByLogic) return false;
  if (target.requireRefutation && !meta.metrics.needsRefutation) return false;
  if (target.minHardSteps !== undefined && meta.metrics.hardSteps < target.minHardSteps) return false;
  if (target.minRefutationSteps !== undefined && meta.metrics.refutationSteps < target.minRefutationSteps) return false;
  if (target.minScore !== undefined && meta.score < target.minScore) return false;
  if (target.minTier !== undefined && meta.metrics.highestTier < target.minTier) return false;
  if (target.maxTier !== undefined && meta.metrics.highestTier > target.maxTier) return false;
  return true;
}

interface AttemptOutcome {
  puzzle: Puzzle;
  penalty: number;
  ok: boolean;
}

function defaultAttempts(n: number): number {
  if (n <= 6) return 90;
  if (n <= 8) return 70;
  if (n <= 10) return 50;
  return 18;
}

/** 高难度需要更多尝试次数（“真难”的关卡在随机分区里是少数） */
function attemptsFor(opts: GenerateOptions): number {
  let attempts = opts.maxAttempts ?? defaultAttempts(opts.n);
  const t = opts.target;
  if (t?.minScore !== undefined) attempts = Math.round(attempts * 1.8);
  if (t?.minHardSteps !== undefined) attempts = Math.round(attempts * 1.4);
  if (t?.minRefutationSteps !== undefined) attempts = Math.round(attempts * 1.5);
  return Math.min(240, attempts);
}

/**
 * 一批生成尝试（完全确定，不依赖时钟）：
 * 每轮随机一个合法布局 -> 按风格划分颜色 -> 用逻辑阶梯体检 -> 只接受解唯一的关卡。
 */
function attemptBatch(opts: GenerateOptions, attempts: number, bestSoFar: AttemptOutcome | null): AttemptOutcome | null {
  const n = opts.n;
  const style = opts.style;
  const nodeLimit = opts.nodeLimit ?? 60_000;
  let best = bestSoFar;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const attemptSeed = (opts.seed ^ Math.imul(attempt, 0x9e3779b9)) >>> 0;
    const rng = mulberry32(attemptSeed);
    const solution = randomSolution(n, rng);
    if (!validateSolution(n, solution)) continue;
    const raw = growRegions(n, solution, style, rng);
    if (!validateColorAssignmentConnected(n, raw, solution)) continue;
    const repaired = repairToUnique(n, solution, raw, rng, { nodeLimit, maxRepairs: 24 });
    if (!repaired.unique) continue;
    if (!validateColorAssignmentConnected(n, repaired.colors, solution)) continue;
    const colors = repaired.colors;
    const metrics = analyzePuzzle({ n, colors, solution }, { nodeLimit });
    if (!metrics.unique) continue; // 只接受唯一解的关卡
    // 只有最高难度档才需要精确统计“反证次数”（这一步比较贵）
    if (opts.target?.minRefutationSteps !== undefined) {
      const ref = countRefutations({ n, colors, solution }, { refuteNodeLimit: 6000, maxSteps: 400 });
      metrics.refutationSteps = ref.refutationSteps;
      metrics.needsRefutation = ref.refutationSteps > 0 || metrics.needsRefutation;
      if (ref.refutationSteps < (opts.target.minRefutationSteps ?? 0)) continue;
    }

    const features = extractFeatures(n, colors, metrics);
    const score = scorePuzzle(features, metrics);
    const meta: PuzzleMeta = {
      seed: opts.seed,
      style,
      attempts: attempt,
      generateMs: 0,
      score,
      label: difficultyLabel(score),
      features,
      metrics,
      target: opts.target,
    };
    const outcome: AttemptOutcome = {
      puzzle: { id: `${n}x${n}#${opts.seed.toString(36)}`, n, colors, solution, meta },
      penalty: targetPenalty(meta, opts.target),
      ok: constraintsMet(meta, opts.target),
    };
    if (!best || outcome.penalty < best.penalty) best = outcome;
    if (outcome.ok && outcome.penalty <= 0.3) break;
  }
  return best;
}

/**
 * 生成关卡：只接受“解唯一”的棋盘，在满足约束的候选中挑最接近目标难度的那张。
 * 随机性完全由 seed 决定，因此同一 seed 一定能复现同一关。
 */
export function generatePuzzle(opts: GenerateOptions): Puzzle {
  const started = Date.now();
  const attempts = attemptsFor(opts);
  let best = attemptBatch(opts, attempts, null);

  // 已经有“足够接近目标”的候选时就别再折腾了（极端高难度常常无法完全满足约束，
  // 无脑重试会白白拖慢生成速度）
  const goodEnough = (b: AttemptOutcome | null) => !!b && b.penalty <= 1.2;
  if (!best || (!best.ok && !goodEnough(best))) {
    // 换一批随机起点再试（颜色形状的随机性很强）
    best = attemptBatch({ ...opts, seed: (opts.seed + 0x9e3779b9) >>> 0 }, attempts, best);
  }
  if (!best || (!best.ok && !goodEnough(best))) {
    // 最后兜底：让形状更“规整”（线段/整线更多，更容易唯一）
    const tighter: ShapeStyle = {
      small: Math.min(1, opts.style.small + 0.15),
      giant: Math.max(0.2, opts.style.giant - 0.3),
      segments: Math.min(1, opts.style.segments + 0.18),
      crosses: Math.min(1, opts.style.crosses + 0.12),
      compactness: Math.min(1, opts.style.compactness + 0.25),
    };
    best = attemptBatch(
      { ...opts, style: tighter, seed: (opts.seed ^ 0x5bf03635) >>> 0 },
      Math.ceil(attempts / 2),
      best,
    );
  }
  if (!best) {
    // 再兜底：大量小颜色（约束最强，几乎总能得到唯一解），只求可玩
    const tinyStyle: ShapeStyle = { small: 0.95, giant: 0.3, segments: 0.5, crosses: 0.3, compactness: 0.9 };
    best = attemptBatch(
      { ...opts, style: tinyStyle, seed: (opts.seed ^ 0x27d4eb2f) >>> 0 },
      attempts * 2,
      best,
    );
  }

  if (best) {
    best.puzzle.meta.generateMs = Date.now() - started;
    if (!best.puzzle.meta.metrics.unique) best.puzzle.meta.metrics.unproven = true;
    return best.puzzle;
  }

  // 理论上不会走到这里。构造一个“可证明唯一解”的兜底棋盘：
  // 前 n-1 个颜色各只有 1 格（就是它们的牛格，直接强制），最后一个颜色吃掉其余所有格子。
  const n = opts.n;
  const rng = mulberry32(opts.seed);
  const solution = randomSolution(n, rng);
  const colors: number[][] = [];
  for (let r = 0; r < n; r++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) row.push(r === n - 1 || c === solution[r] ? r : n - 1);
    colors.push(row);
  }
  const metrics = analyzePuzzle({ n, colors, solution }, { nodeLimit: 200_000 });
  const features = extractFeatures(n, colors, metrics);
  const score = scorePuzzle(features, metrics);
  return {
    id: `${n}x${n}#fallback`,
    n,
    colors,
    solution,
    meta: {
      seed: opts.seed,
      style: opts.style,
      attempts: 0,
      generateMs: Date.now() - started,
      score,
      label: difficultyLabel(score),
      features,
      metrics,
      target: opts.target,
    },
  };
}

export interface LevelRequest {
  /** 玩家可读的关卡号（无尽模式会一直增长） */
  level: number;
  /** 连续难度 1..10 */
  difficulty: number;
  /** 可选：指定棋盘尺寸（尺寸与难度相互独立） */
  size?: number;
  /** 可选：固定种子，用于复现/分享 */
  seed?: number;
}

/**
 * 无尽模式的关卡生成：
 * 同一个 (关卡号, 难度, 尺寸) 一定得到同一张地图，方便反复挑战与分享。
 * 难度在目标值附近有轻微波动，避免每关都一模一样。
 */
export function generateLevel(req: LevelRequest): Puzzle {
  const wobble = ((Math.sin(req.level * 12.9898) * 43758.5453) % 1) - 0.5;
  const difficulty = Math.max(1, Math.min(10, req.difficulty + wobble * 0.3));
  const profile = profileForScore(difficulty, req.size);
  const seed =
    req.seed ??
    hashString(`foxi-cow:v1:${profile.n}:${difficulty.toFixed(2)}:${req.size ?? 'auto'}:${req.level}`);
  return generatePuzzle({
    n: profile.n,
    style: profile.style,
    seed,
    target: profile.target,
  });
}

/** 诊断用：这次生成用了多少步逻辑推理（供标定页展示） */
export function describePuzzle(p: Puzzle) {
  const ladder = runLadder({ n: p.n, colors: p.colors });
  return {
    n: p.n,
    score: p.meta.score,
    label: p.meta.label,
    logicSteps: ladder.steps,
    highestTier: ladder.highestTier,
    techniqueCounts: ladder.techniqueCounts,
    solvableByLogic: ladder.solved,
    needsRefutation: p.meta.metrics.needsRefutation,
  };
}
