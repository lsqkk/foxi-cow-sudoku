import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hintForMarks, type Deduction, type Puzzle } from '../engine';

/** 0 空 / 1 排除× / 2 小牛（放下即固定）/ 3 放错位置的红叉（固定） */
export type Mark = 0 | 1 | 2 | 3;

/** 固定的标记：小牛与红叉都不能再改 */
export const isLockedMark = (m: Mark): boolean => m === 2 || m === 3;

interface Change {
  cell: number;
  from: Mark;
  to: Mark;
}

export interface HintState {
  deduction: Deduction | null;
  conflict: boolean;
  cells: number[];
  targets: number[];
  text: string;
}

export interface GameApi {
  marks: Mark[];
  cows: number;
  remaining: number;
  elapsedMs: number;
  /** 计时是否已经开始（第一次点击棋盘后才开始计时） */
  timerStarted: boolean;
  mistakes: number;
  hints: number;
  undos: number;
  clears: number;
  finished: boolean;
  hint: HintState | null;
  hintLoading: boolean;
  paused: boolean;
  canUndo: boolean;
  /** 挑战模式：失败的关卡（超时或错误次数用尽） */
  failed: 'time' | 'mistakes' | null;
  /** 挑战模式的剩余时间（未设置时限时为 null） */
  remainingMs: number | null;
  /** 手势：开始一次涂抹（拖动连续操作只算一步） */
  beginStroke: () => void;
  paint: (cell: number, value: Mark) => void;
  endStroke: () => void;
  /** 单击/双击语义 */
  placeCow: (cell: number) => void;
  undo: () => void;
  clearAll: () => void;
  requestHint: () => void;
  clearHint: () => void;
  setPaused: (p: boolean) => void;
  reset: () => void;
}

export interface GameReport {
  timeMs: number;
  mistakes: number;
  hints: number;
  undos: number;
  clears: number;
  finished: boolean;
}

/**
 * 一局游戏的完整状态：标记、计时、错误、撤销、提示。
 * 手势相关的涂抹会被合并成一次撤销记录。
 */
export function useGame(
  puzzle: Puzzle,
  opts: {
    strictMistakes: boolean;
    sound?: boolean;
    /** 挑战：限时（毫秒） */
    timeLimitMs?: number;
    /** 挑战：最多允许的错误次数 */
    mistakeLimit?: number;
    /** 放下小牛后是否自动排除同行/同列/同色/周围 8 格（默认开） */
    autoExclude?: boolean;
    onFinish?: (report: GameReport) => void;
    onFail?: (reason: 'time' | 'mistakes', report: GameReport) => void;
  },
): GameApi {
  const n = puzzle.n;
  const [marks, setMarks] = useState<Mark[]>(() => new Array(n * n).fill(0) as Mark[]);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [undos, setUndos] = useState(0);
  const [clears, setClears] = useState(0);
  const [finished, setFinished] = useState(false);
  const [hint, setHint] = useState<HintState | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [failed, setFailed] = useState<'time' | 'mistakes' | null>(null);

  const history = useRef<Change[][]>([]);
  const pending = useRef<Change[]>([]);
  const strokeActive = useRef(false);
  const startRef = useRef<number>(Date.now());
  const accumulated = useRef<number>(0);
  const pausedRef = useRef(false);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  const failedRef = useRef<'time' | 'mistakes' | null>(null);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  pausedRef.current = paused;
  finishedRef.current = finished;
  failedRef.current = failed;

  // 换关卡时重置
  useEffect(() => {
    setMarks(new Array(n * n).fill(0) as Mark[]);
    setMistakes(0);
    setHintsUsed(0);
    setUndos(0);
    setClears(0);
    setFinished(false);
    setHint(null);
    history.current = [];
    pending.current = [];
    strokeActive.current = false;
    accumulated.current = 0;
    startRef.current = Date.now();
    startedRef.current = false;
    failedRef.current = null;
    setFailed(null);
    setTimerStarted(false);
    setElapsedMs(0);
    setPaused(false);
  }, [puzzle.id, n]);

  /** 第一次点击棋盘时才开始计时 */
  const ensureTimerRunning = useCallback(() => {
    if (startedRef.current || finishedRef.current || failedRef.current) return;
    startedRef.current = true;
    startRef.current = Date.now();
    accumulated.current = 0;
    setTimerStarted(true);
    setPaused(false);
  }, []);

  // 计时（页面隐藏时暂停）
  useEffect(() => {
    const tick = () => {
      if (finishedRef.current || pausedRef.current || !startedRef.current) return;
      const now = accumulated.current + (Date.now() - startRef.current);
      setElapsedMs(now);
      const limit = opts.timeLimitMs;
      if (limit !== undefined && now >= limit && !failedRef.current) {
        failedRef.current = 'time';
        accumulated.current = limit;
        setFailed('time');
        setPaused(true);
        setElapsedMs(limit);
        opts.onFail?.('time', {
          timeMs: limit,
          mistakes: mistakesRef.current,
          hints: hintsUsedRef.current,
          undos: undosRef.current,
          clears: clearsRef.current,
          finished: false,
        });
      }
    };
    const timer = window.setInterval(tick, 200);
    const onVisibility = () => {
      if (document.hidden) {
        if (!pausedRef.current && !finishedRef.current && startedRef.current) {
          accumulated.current += Date.now() - startRef.current;
          setPaused(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [puzzle.id, opts.timeLimitMs, opts.onFail]);

  const pauseToggle = useCallback((p: boolean) => {
    if (!startedRef.current) return; // 还没开始计时就不用暂停
    if (p === pausedRef.current) return;
    if (p) {
      accumulated.current += Date.now() - startRef.current;
    } else {
      startRef.current = Date.now();
    }
    setPaused(p);
  }, []);

  const pushHistory = useCallback((changes: Change[]) => {
    if (changes.length === 0) return;
    history.current.push(changes);
    if (history.current.length > 400) history.current.shift();
  }, []);

  const applyChanges = useCallback((changes: Change[]) => {
    if (changes.length === 0) return;
    setMarks((prev) => {
      const next = prev.slice() as Mark[];
      for (const ch of changes) next[ch.cell] = ch.to;
      return next;
    });
  }, []);

  const beginStroke = useCallback(() => {
    strokeActive.current = true;
    pending.current = [];
  }, []);

  const paint = useCallback(
    (cell: number, value: Mark) => {
      const cur = marksRef.current[cell];
      if (cur === value || finishedRef.current || failedRef.current) return;
      if (isLockedMark(cur)) return; // 小牛 / 红叉已经固定，涂抹不会改动它们
      if (value !== 0 && value !== 1) return; // 涂抹只负责打 × / 取消
      const change: Change = { cell, from: cur, to: value };
      ensureTimerRunning();
      marksRef.current = marksRef.current.slice();
      marksRef.current[cell] = value;
      applyChanges([change]);
      if (strokeActive.current) pending.current.push(change);
      else pushHistory([change]);
      setHint(null);
      if (value === 1) beep('x', opts.sound ?? false);
    },
    [applyChanges, opts.sound, ensureTimerRunning, pushHistory],
  );

  const endStroke = useCallback(() => {
    const changes = pending.current;
    pending.current = [];
    strokeActive.current = false;
    pushHistory(changes);
  }, [pushHistory]);

  const checkWin = useCallback(
    (nextMarks: Mark[]) => {
      const placed: number[] = [];
      for (let r = 0; r < n; r++) {
        let col = -1;
        for (let c = 0; c < n; c++) if (nextMarks[r * n + c] === 2) col = c;
        if (col >= 0) placed.push(col);
      }
      if (placed.length < n) return false;
      // 每行一头已满足；再看列 / 颜色 / 相邻
      if (new Set(placed).size !== n) return false;
      for (let r = 0; r + 1 < n; r++) if (Math.abs(placed[r] - placed[r + 1]) < 2) return false;
      const seenColor = new Set<number>();
      for (let r = 0; r < n; r++) {
        const k = puzzle.colors[r][placed[r]];
        if (seenColor.has(k)) return false;
        seenColor.add(k);
      }
      return true;
    },
    [n, puzzle.colors],
  );

  const finishNow = useCallback(() => {
    if (finishedRef.current) return;
    if (!pausedRef.current) accumulated.current += Date.now() - startRef.current;
    setElapsedMs(accumulated.current);
    setFinished(true);
    finishedRef.current = true;
    setPaused(true);
    beep('win', opts.sound ?? false);
    opts.onFinish?.({
      timeMs: accumulated.current,
      mistakes: mistakesRef.current,
      hints: hintsUsedRef.current,
      undos: undosRef.current,
      clears: clearsRef.current,
      finished: true,
    });
  }, [opts, hintsUsed, mistakes, undos, clears]);

  // 用 ref 保存最新统计，避免 finishNow 里的闭包过期
  const mistakesRef = useRef(0);
  const hintsUsedRef = useRef(0);
  const undosRef = useRef(0);
  const clearsRef = useRef(0);
  mistakesRef.current = mistakes;
  hintsUsedRef.current = hintsUsed;
  undosRef.current = undos;
  clearsRef.current = clears;

  /** 一次写入多个标记（放牛 + 自动排除），只记一次撤销 */
  const commitChanges = useCallback(
    (changes: Change[]) => {
      if (changes.length === 0) return;
      const next = marksRef.current.slice();
      for (const ch of changes) next[ch.cell] = ch.to;
      marksRef.current = next;
      applyChanges(changes);
      pushHistory(changes);
      setHint(null);
    },
    [applyChanges, pushHistory],
  );

  /** 放牛后自动排除：同行、同列、同色区域、周围 8 格 */
  const autoEliminate = useCallback(
    (cell: number, next: Mark[], changes: Change[]) => {
      const r0 = Math.floor(cell / n);
      const c0 = cell % n;
      const k = puzzle.colors[r0][c0];
      for (let i = 0; i < next.length; i++) {
        if (i === cell || next[i] !== 0) continue;
        const r = Math.floor(i / n);
        const c = i % n;
        if (r === r0 || c === c0 || puzzle.colors[r][c] === k || (Math.abs(r - r0) <= 1 && Math.abs(c - c0) <= 1)) {
          changes.push({ cell: i, from: 0, to: 1 });
          next[i] = 1;
        }
      }
    },
    [n, puzzle.colors],
  );

  const placeCow = useCallback(
    (cell: number) => {
      if (finishedRef.current || failedRef.current) return;
      const cur = marksRef.current[cell];
      if (isLockedMark(cur)) return; // 已经固定（牛 / 红叉）就不能再改
      const r = Math.floor(cell / n);
      const c = cell % n;
      const correct = puzzle.solution[r] === c;
      ensureTimerRunning();

      if (!correct) {
        setMistakes((m) => {
          const next = m + 1;
          if (opts.mistakeLimit !== undefined && next > opts.mistakeLimit && !failedRef.current) {
            failedRef.current = 'mistakes';
            accumulated.current += Date.now() - startRef.current;
            setFailed('mistakes');
            setPaused(true);
            opts.onFail?.('mistakes', {
              timeMs: accumulated.current,
              mistakes: next,
              hints: hintsUsedRef.current,
              undos: undosRef.current,
              clears: clearsRef.current,
              finished: false,
            });
          }
          return next;
        });
        beep('error', opts.sound ?? false);
        if (opts.strictMistakes) {
          // 放错 → 直接留下一个固定的红叉（相当于“这里确定不是牛”）
          if (marksRef.current[cell] !== 3) {
            commitChanges([{ cell, from: marksRef.current[cell], to: 3 }]);
          }
          return;
        }
        // 非严格模式：错误的牛留在盘上（固定），照样自动排除，靠自己发现矛盾
      }

      beep('place', opts.sound ?? false);
      const next = marksRef.current.slice();
      const changes: Change[] = [{ cell, from: next[cell], to: 2 }];
      next[cell] = 2;
      if (opts.autoExclude !== false) autoEliminate(cell, next, changes);
      commitChanges(changes);
      if (checkWin(next)) {
        window.setTimeout(() => {
          setHint(null);
          finishNow();
        }, 260);
      }
    },
    [
      n,
      puzzle.solution,
      opts.strictMistakes,
      opts.autoExclude,
      opts.sound,
      opts.mistakeLimit,
      opts.onFail,
      ensureTimerRunning,
      autoEliminate,
      commitChanges,
      checkWin,
      finishNow,
    ],
  );

  const undo = useCallback(() => {
    const changes = history.current.pop();
    if (!changes) return;
    applyChanges(changes.map((ch) => ({ cell: ch.cell, from: ch.to, to: ch.from })));
    setUndos((u) => u + 1);
    setHint(null);
  }, [applyChanges]);

  const clearAll = useCallback(() => {
    setMarks((prev) => {
      const next = new Array(n * n).fill(0) as Mark[];
      const changes: Change[] = [];
      for (let i = 0; i < prev.length; i++) if (prev[i] !== 0) changes.push({ cell: i, from: prev[i], to: 0 });
      pushHistory(changes);
      return next;
    });
    setClears((c) => c + 1);
    setHint(null);
  }, [n, pushHistory]);

  const requestHint = useCallback(() => {
    if (finishedRef.current) return;
    setHintLoading(true);
    window.setTimeout(() => {
      try {
        const marksArr = new Uint8Array(marksRef.current);
        const res = hintForMarks({ n, colors: puzzle.colors, solution: puzzle.solution }, marksArr);
        if (res.conflict) {
          setHint({ deduction: null, conflict: true, cells: [], targets: [], text: '当前标记已经互相矛盾了，检查一下放下的牛或排除的格子。' });
        } else if (res.deduction) {
          setHint({
            deduction: res.deduction,
            conflict: false,
            cells: res.deduction.cells,
            targets: res.deduction.targets,
            text: res.deduction.text,
          });
          setHintsUsed((h) => h + 1);
        } else {
          setHint({
            deduction: null,
            conflict: false,
            cells: [],
            targets: [],
            text: '盘面已经推完了，剩下的牛都可以直接落下。',
          });
        }
      } finally {
        setHintLoading(false);
      }
    }, 20);
  }, [n, puzzle.colors, puzzle.solution]);

  const reset = useCallback(() => {
    setMarks(new Array(n * n).fill(0) as Mark[]);
    setFinished(false);
    setHint(null);
    history.current = [];
    pending.current = [];
    strokeActive.current = false;
    accumulated.current = 0;
    startRef.current = Date.now();
    startedRef.current = false;
    failedRef.current = null;
    setFailed(null);
    setTimerStarted(false);
    setElapsedMs(0);
    setPaused(false);
  }, [n]);

  const cows = useMemo(() => marks.filter((m) => m === 2).length, [marks]);

  return {
    marks,
    cows,
    remaining: n - cows,
    elapsedMs,
    timerStarted,
    mistakes,
    hints: hintsUsed,
    undos,
    clears,
    finished,
    hint,
    hintLoading,
    paused,
    canUndo: history.current.length > 0,
    failed,
    remainingMs: opts.timeLimitMs === undefined ? null : Math.max(0, opts.timeLimitMs - elapsedMs),
    beginStroke,
    paint,
    endStroke,
    placeCow,
    undo,
    clearAll,
    requestHint,
    clearHint: () => setHint(null),
    setPaused: pauseToggle,
    reset,
  };
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let audioCtx: AudioContext | null = null;

/** 极简音效（不引入任何音频资源） */
function beep(kind: 'place' | 'x' | 'error' | 'win', enabled: boolean): void {
  if (!enabled) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const table: Record<typeof kind, [number, number]> = {
      place: [660, 0.09],
      x: [420, 0.05],
      error: [200, 0.14],
      win: [880, 0.22],
    };
    const [freq, dur] = table[kind];
    osc.type = kind === 'error' ? 'square' : 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch {
    /* 静默失败 */
  }
}
