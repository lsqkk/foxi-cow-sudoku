import { buildNeighbors, colOf, idx, rowOf } from './board';
import { TECHNIQUE_TIER, type Deduction, type SolveMetrics, type TechniqueId } from './types';

export interface SolverState {
  n: number;
  colors: number[][];
  color: Uint8Array;
  cand: Uint8Array;
  cow: Uint8Array;
  rowCount: Int32Array;
  colCount: Int32Array;
  colorCount: Int32Array;
  placed: number;
  rowCells: number[][];
  colCells: number[][];
  colorCells: number[][];
  neighbors: number[][];
}

export type UnitKind = 'row' | 'col' | 'color';

export function createState(n: number, colors: number[][]): SolverState {
  const total = n * n;
  const color = new Uint8Array(total);
  const rowCells: number[][] = [];
  const colCells: number[][] = [];
  const colorCells: number[][] = [];
  for (let k = 0; k < n; k++) colorCells.push([]);
  for (let r = 0; r < n; r++) {
    const rc: number[] = [];
    for (let c = 0; c < n; c++) {
      const i = idx(n, r, c);
      const k = colors[r][c];
      color[i] = k;
      rc.push(i);
      colorCells[k].push(i);
    }
    rowCells.push(rc);
  }
  for (let c = 0; c < n; c++) {
    const cc: number[] = [];
    for (let r = 0; r < n; r++) cc.push(idx(n, r, c));
    colCells.push(cc);
  }
  const colorCount = new Int32Array(n);
  for (let k = 0; k < n; k++) colorCount[k] = colorCells[k].length;
  return {
    n,
    colors,
    color,
    cand: new Uint8Array(total).fill(1),
    cow: new Uint8Array(total),
    rowCount: new Int32Array(n).fill(n),
    colCount: new Int32Array(n).fill(n),
    colorCount,
    placed: 0,
    rowCells,
    colCells,
    colorCells,
    neighbors: buildNeighbors(n),
  };
}

export function cloneState(s: SolverState): SolverState {
  return {
    n: s.n,
    colors: s.colors,
    color: s.color,
    cand: s.cand.slice(),
    cow: s.cow.slice(),
    rowCount: s.rowCount.slice(),
    colCount: s.colCount.slice(),
    colorCount: s.colorCount.slice(),
    placed: s.placed,
    rowCells: s.rowCells,
    colCells: s.colCells,
    colorCells: s.colorCells,
    neighbors: s.neighbors,
  };
}

/** 排除一个格子（相当于放一个 ×） */
export function eliminateInState(s: SolverState, i: number): boolean {
  if (!s.cand[i]) return false;
  s.cand[i] = 0;
  s.rowCount[rowOf(s.n, i)]--;
  s.colCount[colOf(s.n, i)]--;
  s.colorCount[s.color[i]]--;
  return true;
}

/**
 * 最基础也最常用的一条：放下一头牛后，把它所在的行、列、同色区域，
 * 以及周围 8 格全部排除。
 */
export function placeCowInState(s: SolverState, i: number): void {
  if (!s.cand[i]) return;
  s.cand[i] = 0;
  const r = rowOf(s.n, i);
  const c = colOf(s.n, i);
  const k = s.color[i];
  s.rowCount[r]--;
  s.colCount[c]--;
  s.colorCount[k]--;
  s.cow[i] = 1;
  s.placed++;
  for (const j of s.rowCells[r]) if (j !== i) eliminateInState(s, j);
  for (const j of s.colCells[c]) if (j !== i) eliminateInState(s, j);
  for (const j of s.colorCells[k]) if (j !== i) eliminateInState(s, j);
  for (const j of s.neighbors[i]) eliminateInState(s, j);
}

export function candidateCells(s: SolverState, cells: number[]): number[] {
  const out: number[] = [];
  for (const i of cells) if (s.cand[i]) out.push(i);
  return out;
}

function hasCowIn(cells: number[], s: SolverState): boolean {
  for (const i of cells) if (s.cow[i]) return true;
  return false;
}

export function hasContradiction(s: SolverState): boolean {
  for (let r = 0; r < s.n; r++) if (s.rowCount[r] === 0 && !hasCowIn(s.rowCells[r], s)) return true;
  for (let c = 0; c < s.n; c++) if (s.colCount[c] === 0 && !hasCowIn(s.colCells[c], s)) return true;
  for (let k = 0; k < s.n; k++) if (s.colorCount[k] === 0 && !hasCowIn(s.colorCells[k], s)) return true;
  return false;
}

function unitCells(s: SolverState, kind: UnitKind, k: number): number[] {
  if (kind === 'row') return s.rowCells[k];
  if (kind === 'col') return s.colCells[k];
  return s.colorCells[k];
}

function unitCount(s: SolverState, kind: UnitKind, k: number): number {
  if (kind === 'row') return s.rowCount[k];
  if (kind === 'col') return s.colCount[k];
  return s.colorCount[k];
}

function unitName(kind: UnitKind, k: number): string {
  if (kind === 'row') return `第 ${k + 1} 行`;
  if (kind === 'col') return `第 ${k + 1} 列`;
  return `颜色#${k + 1}`;
}

function label(i: number, n: number): string {
  return `(${rowOf(n, i) + 1},${colOf(n, i) + 1})`;
}

/** 基础传播：反复放置“唯一候选”，返回 false 表示出现矛盾 */
export function propagateBasic(s: SolverState): boolean {
  for (;;) {
    if (hasContradiction(s)) return false;
    let placedAny = false;
    for (let r = 0; r < s.n; r++) {
      if (s.rowCount[r] === 1) {
        placeCowInState(s, candidateCells(s, s.rowCells[r])[0]);
        placedAny = true;
      }
    }
    for (let c = 0; c < s.n; c++) {
      if (s.colCount[c] === 1) {
        placeCowInState(s, candidateCells(s, s.colCells[c])[0]);
        placedAny = true;
      }
    }
    for (let k = 0; k < s.n; k++) {
      if (s.colorCount[k] === 1) {
        placeCowInState(s, candidateCells(s, s.colorCells[k])[0]);
        placedAny = true;
      }
    }
    if (hasContradiction(s)) return false;
    if (!placedAny) return true;
  }
}

// ---------------------------------------------------------------------------
// 人类技术阶梯（1-4 层）
// ---------------------------------------------------------------------------

/** 1 层：某行/列只剩一个候选格 */
function nakedSingle(s: SolverState): Deduction | null {
  for (let r = 0; r < s.n; r++) {
    if (s.rowCount[r] === 1) {
      const i = candidateCells(s, s.rowCells[r])[0];
      return {
        technique: 'naked-single',
        tier: 1,
        kind: 'place',
        cells: [i],
        targets: [i],
        text: `第 ${r + 1} 行只剩 ${label(i, s.n)} 一个候选格，这里必是小牛。`,
      };
    }
  }
  for (let c = 0; c < s.n; c++) {
    if (s.colCount[c] === 1) {
      const i = candidateCells(s, s.colCells[c])[0];
      return {
        technique: 'naked-single',
        tier: 1,
        kind: 'place',
        cells: [i],
        targets: [i],
        text: `第 ${c + 1} 列只剩 ${label(i, s.n)} 一个候选格，这里必是小牛。`,
      };
    }
  }
  return null;
}

/** 1 层：某颜色只剩一个候选格 */
function colorSingle(s: SolverState): Deduction | null {
  for (let k = 0; k < s.n; k++) {
    if (s.colorCount[k] === 1) {
      const i = candidateCells(s, s.colorCells[k])[0];
      return {
        technique: 'color-single',
        tier: 1,
        kind: 'place',
        cells: [i],
        targets: [i],
        text: `颜色#${k + 1} 只剩 ${label(i, s.n)} 一个候选格，这里必是小牛。`,
      };
    }
  }
  return null;
}

/** 2 层：某行/列的候选全是同一颜色 -> 该颜色在别处排除 */
function lineConfinedToColor(s: SolverState): Deduction | null {
  for (const kind of ['row', 'col'] as const) {
    for (let k = 0; k < s.n; k++) {
      if (unitCount(s, kind, k) < 2) continue;
      const line = unitCells(s, kind, k);
      const cells = candidateCells(s, line);
      if (new Set(cells.map((i) => s.color[i])).size !== 1) continue;
      const color = s.color[cells[0]];
      const inLine = new Set(line);
      const targets = candidateCells(s, s.colorCells[color]).filter((i) => !inLine.has(i));
      if (targets.length === 0) continue;
      return {
        technique: 'line-confined-to-color',
        tier: 2,
        kind: 'eliminate',
        cells,
        targets,
        text: `${unitName(kind, k)} 剩下的候选全属于颜色#${color + 1}，这头牛占住该${
          kind === 'row' ? '行' : '列'
        } → 颜色#${color + 1} 在其它位置的格子排除。`,
      };
    }
  }
  return null;
}

/** 2 层：某颜色的候选全在同一行/列 -> 该行/列其它颜色排除 */
function colorConfinedToLine(s: SolverState): Deduction | null {
  for (let k = 0; k < s.n; k++) {
    if (s.colorCount[k] < 2) continue;
    const cells = candidateCells(s, s.colorCells[k]);
    const rows = new Set(cells.map((i) => rowOf(s.n, i)));
    const cols = new Set(cells.map((i) => colOf(s.n, i)));
    if (rows.size === 1) {
      const r = rowOf(s.n, cells[0]);
      const targets = candidateCells(s, s.rowCells[r]).filter((i) => s.color[i] !== k);
      if (targets.length === 0) continue;
      return {
        technique: 'color-confined-to-line',
        tier: 2,
        kind: 'eliminate',
        cells,
        targets,
        text: `颜色#${k + 1} 只可能落在第 ${r + 1} 行，这头牛占住该行 → 第 ${r + 1} 行其它颜色的格子排除。`,
      };
    }
    if (cols.size === 1) {
      const c = colOf(s.n, cells[0]);
      const targets = candidateCells(s, s.colCells[c]).filter((i) => s.color[i] !== k);
      if (targets.length === 0) continue;
      return {
        technique: 'color-confined-to-line',
        tier: 2,
        kind: 'eliminate',
        cells,
        targets,
        text: `颜色#${k + 1} 只可能落在第 ${c + 1} 列，这头牛占住该列 → 第 ${c + 1} 列其它颜色的格子排除。`,
      };
    }
  }
  return null;
}

/** 2 层：某行与某列的候选属于同一颜色，交会点必为牛 */
function lineIntersection(s: SolverState): Deduction | null {
  const rowColor = new Int32Array(s.n).fill(-1);
  const colColor = new Int32Array(s.n).fill(-1);
  for (let r = 0; r < s.n; r++) {
    if (s.rowCount[r] < 2) continue;
    const cells = candidateCells(s, s.rowCells[r]);
    if (new Set(cells.map((i) => s.color[i])).size === 1) rowColor[r] = s.color[cells[0]];
  }
  for (let c = 0; c < s.n; c++) {
    if (s.colCount[c] < 2) continue;
    const cells = candidateCells(s, s.colCells[c]);
    if (new Set(cells.map((i) => s.color[i])).size === 1) colColor[c] = s.color[cells[0]];
  }
  for (let r = 0; r < s.n; r++) {
    if (rowColor[r] < 0) continue;
    for (let c = 0; c < s.n; c++) {
      if (colColor[c] !== rowColor[r]) continue;
      const i = idx(s.n, r, c);
      if (!s.cand[i]) continue;
      return {
        technique: 'line-intersection',
        tier: 2,
        kind: 'place',
        cells: Array.from(new Set([...candidateCells(s, s.rowCells[r]), ...candidateCells(s, s.colCells[c])])),
        targets: [i],
        text: `第 ${r + 1} 行与第 ${c + 1} 列的候选都属于颜色#${rowColor[r] + 1}，两者在该颜色的交会点 ${label(
          i,
          s.n,
        )} 必是小牛。`,
      };
    }
  }
  return null;
}

/**
 * 3-4 层：k 个单元的候选恰好落在 k 个另一类单元内（包含关系）
 * 例：2 行的候选只落在 2 种颜色里 → 这 2 种颜色的牛必在这 2 行 → 它们在别处排除。
 */
function containment(s: SolverState, k: number): Deduction | null {
  const kinds: UnitKind[] = ['row', 'col', 'color'];
  const n = s.n;
  for (const xk of kinds) {
    for (const yk of kinds) {
      if (xk === yk) continue;
      const masks = new Int32Array(n);
      let anyMask = 0;
      for (let u = 0; u < n; u++) {
        let mask = 0;
        for (const i of unitCells(s, xk, u)) {
          if (!s.cand[i]) continue;
          const y = yk === 'color' ? s.color[i] : yk === 'row' ? rowOf(n, i) : colOf(n, i);
          mask |= 1 << y;
        }
        masks[u] = mask;
        anyMask |= mask;
        if (popcount(mask) === 1) masks[u] = mask; // 单色单元是最有价值的线索
      }
      if (popcount(anyMask) < k) continue;
      const eligible: number[] = [];
      for (let u = 0; u < n; u++) {
        if (unitCount(s, xk, u) === 0) continue;
        if (popcount(masks[u]) <= k) eligible.push(u);
      }
      if (eligible.length < k) continue;
      const subsets = k === 2 ? pairs(eligible) : triples(eligible);
      for (const set of subsets) {
        let union = 0;
        let candidateCount = 0;
        let empty = false;
        for (const u of set) {
          union |= masks[u];
          const cnt = unitCount(s, xk, u);
          if (cnt === 0) {
            empty = true;
            break;
          }
          candidateCount += cnt;
        }
        if (empty || candidateCount <= 1) continue;
        if (popcount(union) > k) continue;
        const cellsS = new Set<number>();
        for (const u of set) for (const i of unitCells(s, xk, u)) cellsS.add(i);
        const targets: number[] = [];
        const yNames: string[] = [];
        for (let y = 0; y < n; y++) {
          if (!(union & (1 << y))) continue;
          yNames.push(unitName(yk, y));
          for (const i of unitCells(s, yk, y)) {
            if (s.cand[i] && !cellsS.has(i)) targets.push(i);
          }
        }
        if (targets.length === 0) continue;
        const technique: TechniqueId = k <= 2 ? 'pair-containment' : 'triple-containment';
        const xNames = set.map((u) => unitName(xk, u)).join('、');
        return {
          technique,
          tier: TECHNIQUE_TIER[technique],
          kind: 'eliminate',
          cells: Array.from(cellsS).filter((i) => s.cand[i]),
          targets,
          text: `${xNames} 的候选全部落在 ${yNames.join('、')} 之内，这 ${k} 头牛恰好用满这些位置 → ${yNames.join(
            '、',
          )} 中其余的格子排除。`,
        };
      }
    }
  }
  return null;
}

/** 3 层：某颜色的候选无论落在哪一格，都会排除某个公共格子 */
function colorNeighborhood(s: SolverState): Deduction | null {
  for (let k = 0; k < s.n; k++) {
    if (s.colorCount[k] < 2) continue;
    const cands = candidateCells(s, s.colorCells[k]);
    if (cands.length > 6) continue; // 候选过多时人类不会这样算
    const eliminators: Set<number>[] = cands.map((p) => {
      const set = new Set<number>([
        ...s.rowCells[rowOf(s.n, p)],
        ...s.colCells[colOf(s.n, p)],
        ...s.colorCells[s.color[p]],
        ...s.neighbors[p],
      ]);
      set.delete(p);
      return set;
    });
    const targets: number[] = [];
    for (let i = 0; i < s.cand.length; i++) {
      if (!s.cand[i] || s.color[i] === k) continue;
      if (eliminators.every((set) => set.has(i))) targets.push(i);
    }
    if (targets.length === 0) continue;
    return {
      technique: 'color-neighborhood',
      tier: TECHNIQUE_TIER['color-neighborhood'],
      kind: 'eliminate',
      cells: cands,
      targets,
      text: `颜色#${k + 1} 的候选只可能在 ${cands
        .map((i) => label(i, s.n))
        .join('、')}，无论落在哪一格，都会排除 ${targets.map((i) => label(i, s.n)).join('、')}。`,
    };
  }
  return null;
}

/** 4 层：一步反证（如果放牛会立刻产生矛盾，则该格排除） */
function lookahead(s: SolverState): Deduction | null {
  for (let i = 0; i < s.cand.length; i++) {
    if (!s.cand[i]) continue;
    const trial = cloneState(s);
    placeCowInState(trial, i);
    if (propagateBasic(trial)) continue;
    let wipedColor = -1;
    for (let k = 0; k < s.n; k++) {
      if (trial.colorCount[k] === 0 && !hasCowIn(trial.colorCells[k], trial)) {
        wipedColor = k;
        break;
      }
    }
    const technique: TechniqueId = wipedColor >= 0 ? 'color-wipeout' : 'lookahead';
    return {
      technique,
      tier: TECHNIQUE_TIER[technique],
      kind: 'eliminate',
      cells: [i],
      targets: [i],
      text:
        wipedColor >= 0
          ? `反证：若在 ${label(i, s.n)} 放牛，颜色#${wipedColor + 1} 就无处可放了 → 该格排除。`
          : `反证：若在 ${label(i, s.n)} 放牛会立刻产生矛盾 → 该格排除。`,
    };
  }
  return null;
}

export function popcount(x: number): number {
  let v = x - ((x >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  v = (v + (v >> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >> 24;
}

function pairs(xs: number[]): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) out.push([xs[a], xs[b]]);
  return out;
}

function triples(xs: number[]): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < xs.length; a++)
    for (let b = a + 1; b < xs.length; b++)
      for (let c = b + 1; c < xs.length; c++) out.push([xs[a], xs[b], xs[c]]);
  return out;
}

/** 依次尝试一层到四层的技术，返回下一个可用推理 */
function nextLadderStep(s: SolverState): Deduction | null {
  return (
    nakedSingle(s) ??
    colorSingle(s) ??
    lineConfinedToColor(s) ??
    colorConfinedToLine(s) ??
    lineIntersection(s) ??
    containment(s, 2) ??
    containment(s, 3) ??
    colorNeighborhood(s) ??
    lookahead(s)
  );
}

/** 诊断入口（仅用于测试/调参） */
/**
 * 搜索用的“强传播”：基础传播 + 便宜的组合排除规则（不含试错）。
 * 用于唯一性验证时大幅剪枝 —— 否则大棋盘的唯一性证明会撑爆节点预算，
 * 结果就是只有“特别简单”的关卡能通过校验（这正是难度调不上去的根因）。
 */
function propagateStrong(s: SolverState): boolean {
  for (;;) {
    if (!propagateBasic(s)) return false;
    const d =
      lineConfinedToColor(s) ??
      colorConfinedToLine(s) ??
      lineIntersection(s) ??
      containment(s, 2) ??
      colorNeighborhood(s) ??
      containment(s, 3);
    if (!d) return true;
    applyDeduction(s, d);
  }
}

/** 诊断入口（仅用于测试/调参） */
export const __debug = {
  techniques: {
    nakedSingle,
    colorSingle,
    lineConfinedToColor,
    colorConfinedToLine,
    lineIntersection,
    containment2: (s: SolverState) => containment(s, 2),
    containment3: (s: SolverState) => containment(s, 3),
    colorNeighborhood,
    lookahead,
    nextLadderStep,
  },
};

function applyDeduction(s: SolverState, d: Deduction): void {
  if (d.kind === 'place') placeCowInState(s, d.targets[0]);
  else for (const i of d.targets) eliminateInState(s, i);
}

export function applyDeductionInState(s: SolverState, d: Deduction): void {
  applyDeduction(s, d);
}

export interface LadderResult {
  solved: boolean;
  state: SolverState;
  deductions: Deduction[];
  techniqueCounts: Partial<Record<TechniqueId, number>>;
  highestTier: number;
  steps: number;
  placeCount: number;
  eliminateCount: number;
}

export interface LadderOptions {
  collectDeductions?: boolean;
  maxSteps?: number;
}

/** 只用 1-4 层技术解题（纯逻辑阶梯） */
export function runLadder(puzzle: { n: number; colors: number[][] }, opts: LadderOptions = {}): LadderResult {
  const s = createState(puzzle.n, puzzle.colors);
  const deductions: Deduction[] = [];
  const techniqueCounts: Partial<Record<TechniqueId, number>> = {};
  const maxSteps = opts.maxSteps ?? 2000;
  let steps = 0;
  let placeCount = 0;
  let eliminateCount = 0;
  let highestTier = 0;

  propagateBasic(s);

  while (s.placed < s.n && steps < maxSteps) {
    if (hasContradiction(s)) break;
    const d = nextLadderStep(s);
    if (!d) break;
    applyDeduction(s, d);
    techniqueCounts[d.technique] = (techniqueCounts[d.technique] ?? 0) + 1;
    highestTier = Math.max(highestTier, d.tier);
    steps++;
    if (d.kind === 'place') placeCount++;
    else eliminateCount += d.targets.length;
    if (opts.collectDeductions) deductions.push(d);
  }

  return { solved: s.placed === s.n, state: s, deductions, techniqueCounts, highestTier, steps, placeCount, eliminateCount };
}

// ---------------------------------------------------------------------------
// 兜底：反证排除 / 唯一解推演（保证唯一解关卡一定能玩到底）
// ---------------------------------------------------------------------------

export interface SearchResult {
  count: number;
  nodes: number;
  firstSolution: number[] | null;
  /** 搜到的解（最多 limit 个），用于唯一性修复 */
  solutions: number[][];
  guessDepth: number;
  /** 因节点预算耗尽而提前退出（此时“无解”结论不可信） */
  budgetHit: boolean;
}

/** 在候选状态上回溯搜索（唯一性验证 + 反证） */
export function searchState(s: SolverState, limit = 2, nodeLimit = 200_000): SearchResult {
  let nodes = 0;
  let found = 0;
  let firstSolution: number[] | null = null;
  const solutions: number[][] = [];
  let guessDepth = 0;
  let budgetHit = false;

  const dfs = (state: SolverState, depth: number): void => {
    if (found >= limit || budgetHit) return;
    nodes++;
    if (nodes > nodeLimit) {
      budgetHit = true;
      return;
    }
    if (!propagateBasic(state)) return;
    if (state.placed === state.n) {
      found++;
      const solved: number[] = [];
      for (let r = 0; r < state.n; r++) {
        let col = -1;
        for (let c = 0; c < state.n; c++) if (state.cow[idx(state.n, r, c)]) col = c;
        solved.push(col);
      }
      solutions.push(solved);
      if (firstSolution === null) {
        firstSolution = solved;
        guessDepth = depth;
      }
      return;
    }
    let bestKind: UnitKind = 'row';
    let bestIndex = -1;
    let bestCount = Infinity;
    for (const kind of ['row', 'col', 'color'] as const) {
      for (let k = 0; k < state.n; k++) {
        const cnt = unitCount(state, kind, k);
        if (cnt >= 2 && cnt < bestCount) {
          bestCount = cnt;
          bestKind = kind;
          bestIndex = k;
        }
      }
    }
    if (bestIndex < 0) return;
    for (const i of candidateCells(state, unitCells(state, bestKind, bestIndex))) {
      if (found >= limit || budgetHit) return;
      const child = cloneState(state);
      placeCowInState(child, i);
      dfs(child, depth + 1);
    }
  };

  dfs(cloneState(s), 0);
  return { count: found, nodes, firstSolution, solutions, guessDepth, budgetHit };
}

export function countSolutions(
  puzzle: { n: number; colors: number[][] },
  limit = 2,
  nodeLimit = 200_000,
): SearchResult {
  // 先用便宜的强规则做一次“预传播”再回溯：解集不变，但搜索空间小很多。
  // 否则大棋盘的唯一性证明会浪费预算，导致只有特别简单的关卡能通过校验。
  const s = createState(puzzle.n, puzzle.colors);
  propagateStrong(s);
  return searchState(s, limit, nodeLimit);
}

export type Feasibility = 'sat' | 'unsat' | 'unknown';

/** 判断“当前状态还能不能补完” */
export function feasibility(s: SolverState, nodeLimit = 20_000): Feasibility {
  const probe = searchState(s, 1, nodeLimit);
  if (probe.count >= 1) return 'sat';
  return probe.budgetHit ? 'unknown' : 'unsat';
}

/**
 * 排除法（反证）：找一个“放了牛就无解”的格子。
 * 这是兜底手段：只要关卡有唯一解，反复做这件事一定能推进。
 */
export function refutationDeduction(s: SolverState, nodeLimit = 20_000, maxChecks = 24): Deduction | null {
  const order: number[] = [];
  for (let i = 0; i < s.cand.length; i++) if (s.cand[i]) order.push(i);
  const score = (i: number) =>
    Math.min(s.rowCount[rowOf(s.n, i)], s.colCount[colOf(s.n, i)], s.colorCount[s.color[i]]);
  order.sort((a, b) => score(a) - score(b));

  let checks = 0;
  for (const i of order) {
    if (!s.cand[i]) continue;
    if (checks >= maxChecks) break;
    checks++;
    const trial = cloneState(s);
    placeCowInState(trial, i);
    if (feasibility(trial, nodeLimit) === 'unsat') {
      return {
        technique: 'refutation',
        tier: TECHNIQUE_TIER.refutation,
        kind: 'eliminate',
        cells: [i],
        targets: [i],
        text: `排除法：假设 ${label(i, s.n)} 是小牛，继续推理会走到矛盾（有颜色/行列无处可放）→ 该格排除。`,
      };
    }
  }
  return null;
}

/** 最后的兜底：推演唯一解，直接给出一个必定正确的落子 */
export function solutionHint(s: SolverState, solution: number[] | null, nodeLimit = 60_000): Deduction | null {
  const found = solution ?? searchState(s, 1, nodeLimit).firstSolution;
  if (!found) return null;
  for (let r = 0; r < s.n; r++) {
    const i = idx(s.n, r, found[r]);
    if (s.cand[i] && !s.cow[i]) {
      return {
        technique: 'search-hint',
        tier: TECHNIQUE_TIER['search-hint'],
        kind: 'place',
        cells: [i],
        targets: [i],
        text: `唯一解推演：${label(i, s.n)} 是小牛（把所有约束一起考虑，只有它站得住）。`,
      };
    }
  }
  return null;
}

export interface CompleteResult {
  solved: boolean;
  state: SolverState;
  deductions: Deduction[];
  techniqueCounts: Partial<Record<TechniqueId, number>>;
  highestTier: number;
  steps: number;
  refutationSteps: number;
  searchHintSteps: number;
}

/** 阶梯 + 兜底（唯一解的关卡一定能解完） */
export function solveCompletely(
  puzzle: { n: number; colors: number[][]; solution?: number[] },
  opts: { collectDeductions?: boolean; maxSteps?: number; refuteNodeLimit?: number } = {},
): CompleteResult {
  const s = createState(puzzle.n, puzzle.colors);
  const deductions: Deduction[] = [];
  const techniqueCounts: Partial<Record<TechniqueId, number>> = {};
  const maxSteps = opts.maxSteps ?? 4000;
  let steps = 0;
  let highestTier = 0;
  let refutationSteps = 0;
  let searchHintSteps = 0;

  propagateBasic(s);
  while (s.placed < s.n && steps < maxSteps) {
    if (hasContradiction(s)) break;
    let d = nextLadderStep(s);
    if (!d) {
      d = refutationDeduction(s, opts.refuteNodeLimit ?? 20_000);
      if (d) refutationSteps++;
    }
    if (!d) {
      d = solutionHint(s, puzzle.solution ?? null);
      if (d) searchHintSteps++;
    }
    if (!d) break;
    applyDeduction(s, d);
    techniqueCounts[d.technique] = (techniqueCounts[d.technique] ?? 0) + 1;
    highestTier = Math.max(highestTier, d.tier);
    steps++;
    if (opts.collectDeductions) deductions.push(d);
  }

  return {
    solved: s.placed === s.n,
    state: s,
    deductions,
    techniqueCounts,
    highestTier,
    steps,
    refutationSteps,
    searchHintSteps,
  };
}

// ---------------------------------------------------------------------------
// 关卡体检
// ---------------------------------------------------------------------------

export interface AnalyzeOptions {
  /** 唯一性搜索的节点上限 */
  nodeLimit?: number;
}

/**
 * 关卡体检：
 * 1. 纯逻辑阶梯能否解完（solvableByLogic）
 * 2. 是否必须动用排除法兜底（needsRefutation）
 * 3. 解是否唯一
 */
export function analyzePuzzle(
  puzzle: { n: number; colors: number[][]; solution?: number[] },
  opts: AnalyzeOptions = {},
): SolveMetrics {
  const ladder = runLadder(puzzle, { maxSteps: 2000 });
  const metrics: SolveMetrics = {
    solvableByLogic: ladder.solved,
    highestTier: ladder.highestTier,
    steps: ladder.steps,
    techniqueCounts: ladder.techniqueCounts,
    guessDepth: 0,
    searchNodes: 0,
    unique: ladder.solved,
    placeCount: ladder.placeCount,
    eliminateCount: ladder.eliminateCount,
    logicProgress: ladder.state.placed / puzzle.n,
    needsRefutation: !ladder.solved,
    refutationSteps: 0,
    unproven: false,
  };
  if (ladder.solved) {
    // 推理阶梯是可靠的：能纯逻辑解完，解必然唯一
    return metrics;
  }

  const search = countSolutions(puzzle, 2, opts.nodeLimit ?? 60_000);
  metrics.searchNodes = search.nodes;
  metrics.guessDepth = search.count >= 1 ? search.guessDepth : 0;
  if (search.count >= 1) {
    metrics.unique = search.count === 1 && !search.budgetHit;
    if (metrics.unique && puzzle.solution) {
      // 双保险：搜索出来的唯一解应该就是生成解
      const same = search.firstSolution!.every((c, r) => c === puzzle.solution![r]);
      metrics.unique = same;
    }
    if (search.count === 1 && search.budgetHit) metrics.unproven = true;
    return metrics;
  }
  metrics.unique = false;
  metrics.unproven = search.budgetHit;
  return metrics;
}

/** 游戏内提示：结合玩家当前标记给出下一步（含兜底） */
export function hintForMarks(
  puzzle: { n: number; colors: number[][]; solution?: number[] },
  marks: Uint8Array,
  opts: { refuteNodeLimit?: number; feasibilityNodeLimit?: number } = {},
): { deduction: Deduction | null; conflict: boolean } {
  const s = createState(puzzle.n, puzzle.colors);
  for (let i = 0; i < marks.length; i++) if (marks[i] === 1) eliminateInState(s, i);
  for (let i = 0; i < marks.length; i++) {
    if (marks[i] === 2) {
      if (!s.cand[i]) return { deduction: null, conflict: true };
      placeCowInState(s, i);
    }
  }
  if (!propagateBasic(s)) return { deduction: null, conflict: true };
  if (s.placed === s.n) return { deduction: null, conflict: false };

  // 先判断玩家现有的标记是不是已经把局面带进死路（例如把真解格排除了）
  if (feasibility(s, opts.feasibilityNodeLimit ?? 20_000) === 'unsat') {
    return { deduction: null, conflict: true };
  }
  const ladderStep = nextLadderStep(s);
  if (ladderStep) return { deduction: ladderStep, conflict: false };
  const refutation = refutationDeduction(s, opts.refuteNodeLimit ?? 20_000);
  if (refutation) return { deduction: refutation, conflict: false };
  const fallback = solutionHint(s, puzzle.solution ?? null);
  return { deduction: fallback, conflict: false };
}
