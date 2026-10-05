import { mulberry32, randInt, shuffle } from './rng';
import type { ShapeStyle } from './types';

export type { ShapeStyle };

export const idx = (n: number, r: number, c: number): number => r * n + c;
export const rowOf = (n: number, i: number): number => (i / n) | 0;
export const colOf = (n: number, i: number): number => i % n;

/** 8 邻域（含斜角）：小牛不能相邻 */
export function buildNeighbors(n: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const list: number[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < n && nc >= 0 && nc < n) list.push(idx(n, nr, nc));
        }
      }
      out.push(list);
    }
  }
  return out;
}

/** 4 邻域：颜色区域的连通性 */
export function buildNeighbors4(n: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const list: number[] = [];
      if (r > 0) list.push(idx(n, r - 1, c));
      if (r < n - 1) list.push(idx(n, r + 1, c));
      if (c > 0) list.push(idx(n, r, c - 1));
      if (c < n - 1) list.push(idx(n, r, c + 1));
      out.push(list);
    }
  }
  return out;
}

/**
 * 生成一个合法的小牛布局：每行每列恰好一头，且任意两头不相邻（含斜角）。
 * 逐行回溯：相邻两行的列差必须 >= 2（列不重复由排列保证）。
 */
export function randomSolution(n: number, rng: () => number): number[] {
  const cols = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);

  const place = (r: number): boolean => {
    if (r === n) return true;
    for (const c of shuffle(rng, Array.from({ length: n }, (_, i) => i))) {
      if (used[c]) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) < 2) continue;
      cols[r] = c;
      used[c] = true;
      if (place(r + 1)) return true;
      used[c] = false;
      cols[r] = -1;
    }
    return false;
  };

  if (!place(0)) return shuffle(rng, Array.from({ length: n }, (_, i) => i));
  return cols;
}

export const DEFAULT_STYLE: ShapeStyle = { small: 0.6, segments: 0.3, crosses: 0.15, compactness: 0.7 };

function segmentCells(n: number, r: number, c: number, maxLen: number, rng: () => number): number[] | null {
  // 长度 2..n-1：铺满整行会失去线索作用，所以最多留一个缺口
  maxLen = Math.min(maxLen, Math.max(2, n - 1));
  if (maxLen < 2) return null;
  const len = 2 + randInt(rng, maxLen - 1);
  const axis = rng() < 0.5 ? 'row' : 'col';
  if (axis === 'row') {
    const lo = Math.max(0, c - len + 1);
    const hi = Math.min(c, n - len);
    if (hi < lo) return null;
    const start = lo + randInt(rng, hi - lo + 1);
    return Array.from({ length: len }, (_, t) => idx(n, r, start + t));
  }
  const lo = Math.max(0, r - len + 1);
  const hi = Math.min(r, n - len);
  if (hi < lo) return null;
  const start = lo + randInt(rng, hi - lo + 1);
  return Array.from({ length: len }, (_, t) => idx(n, start + t, c));
}

function crossCells(n: number, r: number, c: number, rng: () => number): number[] {
  if (rng() < 0.5) return Array.from({ length: n }, (_, t) => idx(n, r, t));
  return Array.from({ length: n }, (_, t) => idx(n, t, c));
}

/**
 * 目标尺寸：每个颜色至少 1 格，其余格子按重尾分布分配。
 * small 越大，越容易出现 1-3 格的小颜色 —— 这是“约束变强 / 关卡变简单且唯一”的关键。
 */
export function drawTargetSizes(n: number, small: number, rng: () => number): number[] {
  const total = n * n;
  const sizes = new Array<number>(n).fill(1);
  const maxSize = Math.max(4, Math.round(total * 0.3));

  // 1) 一部分颜色做成很小的区域（1-3 格）：最直接的线索
  const tinyCount = Math.round(clamp01(small) * n);
  let left = total - n;
  for (let k = 0; k < tinyCount && left > 0; k++) {
    const extra = Math.min(left, randInt(rng, 3));
    sizes[k] += extra;
    left -= extra;
  }

  // 2) 其余格子分给剩下的颜色（带随机偏差，避免完全等大）
  const rest = Array.from({ length: n - tinyCount }, (_, i) => tinyCount + i);
  const weights = rest.map(() => 0.6 + rng() * 0.8);
  const wsum = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rest.length; i++) {
    const share = Math.round((left * weights[i]) / wsum);
    sizes[rest[i]] += Math.min(share, maxSize - sizes[rest[i]]);
  }
  // 3) 因上限剩下的格子，补给当前最小的颜色（会自然形成一小批偏大的区域）
  let remain = total - sizes.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (remain > 0 && guard++ < total * 4) {
    let k = 0;
    for (let i = 1; i < n; i++) if (sizes[i] < sizes[k]) k = i;
    if (sizes[k] >= maxSize) break;
    sizes[k]++;
    remain--;
  }
  return sizes;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * 把棋盘划分成 n 个连通颜色区域，每个区域恰好包含一头牛。
 *
 * 1) 先给每种颜色抽一个目标尺寸（重尾分布 -> 大小不均 -> 约束强、容易唯一）
 * 2) 大颜色塑造成“整线+尾巴”或“线段”，小颜色保持 1-3 格
 * 3) 剩下的格子按目标缺口生长补齐（compactness 控制紧凑/缠绕）
 */
export function growRegions(n: number, solution: number[], style: ShapeStyle, rng: () => number): number[][] {
  const total = n * n;
  const owner = new Int16Array(total).fill(-1);
  const nbr4 = buildNeighbors4(n);
  const frozen = new Set<number>();
  const regionCells: number[][] = Array.from({ length: n }, () => []);
  const target = drawTargetSizes(n, style.small, rng);

  // 每个颜色的“牛格”是它的种子，必须先预留出来，避免被别的颜色抢先占用
  const seedOf = (k: number) => idx(n, k, solution[k]);
  const reserved = new Map<number, number>(); // cell -> 该格属于哪个颜色
  for (let k = 0; k < n; k++) reserved.set(seedOf(k), k);

  const usable = (i: number, k: number) => owner[i] === -1 && (!reserved.has(i) || reserved.get(i) === k);
  const allFree = (cells: number[], k: number) => cells.every((i) => usable(i, k));
  const take = (k: number, cells: number[]) => {
    for (const i of cells) owner[i] = k;
    regionCells[k].push(...cells);
  };

  const order = shuffle(rng, Array.from({ length: n }, (_, i) => i));
  // 大颜色优先去做“整线/线段”，小颜色保持小块
  const bySize = order.slice().sort((a, b) => target[b] - target[a]);
  let segLeft = Math.round(clamp01(style.segments) * n);
  let crossLeft = Math.round(clamp01(style.crosses) * n);

  for (const k of bySize) {
    // 区域 k 的牛在第 k 行、第 solution[k] 列
    const r = k;
    const c = solution[k];
    const seed = seedOf(k);
    if (owner[seed] !== -1) continue;

    if (crossLeft > 0 && target[k] >= n + 1) {
      const line = crossCells(n, r, c, rng);
      if (allFree(line, k)) {
        take(k, line);
        // 尾巴长度 ≈ 目标尺寸 - 整线
        let tail = Math.min(target[k] - n, Math.max(0, n * 2));
        while (tail > 0) {
          const cands: number[] = [];
          for (const i of regionCells[k]) for (const j of nbr4[i]) if (usable(j, k)) cands.push(j);
          if (cands.length === 0) break;
          take(k, [cands[randInt(rng, cands.length)]]);
          tail--;
        }
        frozen.add(k);
        crossLeft--;
        continue;
      }
    }
    if (segLeft > 0 && target[k] >= 3) {
      const seg = segmentCells(n, r, c, target[k], rng);
      if (seg && allFree(seg, k)) {
        take(k, seg);
        frozen.add(k);
        segLeft--;
        continue;
      }
    }
    take(k, [seed]);
  }

  // 其余格子：由未定型的区域按 compactness 生长补齐
  const frontier: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const refresh = (k: number) => {
    frontier[k].clear();
    for (const i of regionCells[k]) for (const j of nbr4[i]) if (owner[j] === -1) frontier[k].add(j);
  };
  for (let k = 0; k < n; k++) refresh(k);

  const growable = () => {
    const free: number[] = [];
    for (let k = 0; k < n; k++) if (!frozen.has(k) && frontier[k].size > 0) free.push(k);
    if (free.length > 0) return free;
    // 只有当“未定型的区域”都无处可长时才让定型区域继续吃，
    // 否则被线段/整线围住的空格会没人认领，导致区域断开。
    const all: number[] = [];
    for (let k = 0; k < n; k++) if (frontier[k].size > 0) all.push(k);
    return all;
  };

  let assigned = owner.reduce((acc, v) => acc + (v === -1 ? 0 : 1), 0);
  const compactness = Math.max(0, Math.min(1, style.compactness));
  while (assigned < total) {
    const all = growable();
    if (all.length === 0) break;
    // 优先补“还差得最多”的颜色，这样大小分布才符合目标
    const under = all.filter((k) => regionCells[k].length < target[k]);
    let region: number;
    if (under.length > 0) {
      // 缺口加权随机：缺口越大越可能被选中，但保留随机性
      const weights = under.map((k) => Math.pow(target[k] - regionCells[k].length + 1, 2));
      const sum = weights.reduce((a, b) => a + b, 0);
      let r = rng() * sum;
      region = under[under.length - 1];
      for (let i = 0; i < under.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          region = under[i];
          break;
        }
      }
    } else {
      region = all[randInt(rng, all.length)];
    }
    const cells = Array.from(frontier[region]);
    let pickedCell: number;
    if (rng() < compactness * 0.85) {
      let best = cells[0];
      let bestScore = -1;
      for (const j of cells) {
        let score = 0;
        for (const t of nbr4[j]) if (owner[t] === region) score++;
        score += rng() * (1 - compactness) * 4;
        if (score > bestScore) {
          bestScore = score;
          best = j;
        }
      }
      pickedCell = best;
    } else {
      pickedCell = cells[randInt(rng, cells.length)];
    }
    owner[pickedCell] = region;
    regionCells[region].push(pickedCell);
    assigned++;
    for (let k = 0; k < n; k++) frontier[k].delete(pickedCell);
    refresh(region);
  }

  // 兜底：极少见的情况下把剩余格子并入任一相邻区域
  if (assigned < total) {
    for (let i = 0; i < total; i++) {
      if (owner[i] !== -1) continue;
      const nbr = nbr4[i].find((j) => owner[j] !== -1);
      owner[i] = nbr === undefined ? 0 : owner[nbr];
    }
  }

  const colors: number[][] = [];
  for (let r = 0; r < n; r++) {
    const row: number[] = [];
    for (let c = 0; c < n; c++) row.push(owner[idx(n, r, c)]);
    colors.push(row);
  }
  return colors;
}

/** 颜色区域是否连通（4 邻域） */
export function isRegionConnected(n: number, colors: number[][], color: number): boolean {
  const cells: number[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (colors[r][c] === color) cells.push(idx(n, r, c));
  if (cells.length === 0) return false;
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop() as number;
    const r = rowOf(n, i);
    const c = colOf(n, i);
    const adj: number[] = [];
    if (r > 0) adj.push(idx(n, r - 1, c));
    if (r < n - 1) adj.push(idx(n, r + 1, c));
    if (c > 0) adj.push(idx(n, r, c - 1));
    if (c < n - 1) adj.push(idx(n, r, c + 1));
    for (const j of adj) {
      if (!seen.has(j) && colors[rowOf(n, j)][colOf(n, j)] === color) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
}

/** 小牛布局是否满足“每行每列各一头 + 两两不相邻” */
export function validateSolution(n: number, solution: number[]): boolean {
  if (solution.length !== n) return false;
  if (new Set(solution).size !== n) return false;
  for (const c of solution) if (c < 0 || c >= n) return false;
  for (let r = 0; r + 1 < n; r++) if (Math.abs(solution[r] - solution[r + 1]) < 2) return false;
  return true;
}

/**
 * 颜色划分是否合法：覆盖整个棋盘，且每个颜色恰好包含一头牛。
 */
export function validateColorAssignment(n: number, colors: number[][], solution: number[]): boolean {
  if (colors.length !== n) return false;
  const cowsPerColor = new Array<number>(n).fill(0);
  for (let r = 0; r < n; r++) {
    if (colors[r].length !== n) return false;
    for (let c = 0; c < n; c++) {
      const k = colors[r][c];
      if (!Number.isInteger(k) || k < 0 || k >= n) return false;
      if (solution[r] === c) cowsPerColor[k]++;
    }
  }
  for (let k = 0; k < n; k++) if (cowsPerColor[k] !== 1) return false;
  return true;
}

/** 更严格：还要求每个颜色区域连通（游戏观感更好） */
export function validateColorAssignmentConnected(n: number, colors: number[][], solution: number[]): boolean {
  if (!validateColorAssignment(n, colors, solution)) return false;
  for (let k = 0; k < n; k++) if (!isRegionConnected(n, colors, k)) return false;
  return true;
}

export function makeColorsFromSolution(
  n: number,
  solution: number[],
  style: ShapeStyle,
  seed: number,
): number[][] {
  return growRegions(n, solution, style, mulberry32(seed));
}
