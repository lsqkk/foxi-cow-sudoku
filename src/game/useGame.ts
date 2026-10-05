import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hintForMarks, type Deduction, type Puzzle } from '../engine';

export type Mark = 0 | 1 | 2; // 0 空, 1 排除×, 2 小牛

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
  wrongCells: number[];
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
  tapX: (cell: number) => void;
  placeCow: (cell: number) => void;
  removeCow: (cell: number) => void;
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
  const [wrongCells, setWrongCells] = useState<number[]>([]);
  const [hint, setHint] = useState<HintState | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [failed, setFailed] = useState<'time' | 'mistakes' | null>(null);

  const history = useRef<Change[][]>([]);
  const pending = useRef<Change[]>([]);
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
    setWrongCells([]);
    setHint(null);
    history.current = [];
    pending.current = [];
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
    pending.current = [];
  }, []);

  const paint = useCallback(
    (cell: number, value: Mark) => {
      const cur = marksRef.current[cell];
      if (cur === value || finishedRef.current) return;
      if (cur === 2 && value !== 0) return; // 不要用涂抹覆盖小牛
      const change: Change = { cell, from: cur, to: value };
      ensureTimerRunning();
      pending.current.push(change);
      marksRef.current = marksRef.current.slice();
      marksRef.current[cell] = value;
      applyChanges([change]);
      setHint(null);
      if (value === 1) beep('x', opts.sound ?? false);
    },
    [applyChanges, opts.sound, ensureTimerRunning],
  );

  const endStroke = useCallback(() => {
    const changes = pending.current;
    pending.current = [];
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

  const tapX = useCallback(
    (cell: number) => {
      beginStroke();
      paint(cell, marksRef.current[cell] === 1 ? 0 : 1);
      endStroke();
    },
    [beginStroke, paint, endStroke],
  );

  const removeCow = useCallback(
    (cell: number) => {
      if (marksRef.current[cell] !== 2) return;
      beginStroke();
      paint(cell, 0);
      endStroke();
    },
    [beginStroke, paint, endStroke],
  );

  const placeCow = useCallback(
    (cell: number) => {
      if (finishedRef.current) return;
      const r = Math.floor(cell / n);
      const c = cell % n;
      const correct = puzzle.solution[r] === c;
      if (!correct && opts.strictMistakes) {
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
        setWrongCells([cell]);
        beep('error', opts.sound ?? false);
        window.setTimeout(() => setWrongCells([]), 700);
        // 放错的牛会被自动拿掉（不扣血、不打断，只记一次错误）
        if (marksRef.current[cell] !== 2) {
          beginStroke();
          paint(cell, 2);
          endStroke();
        }
        window.setTimeout(() => {
          beginStroke();
          paint(cell, 0);
          endStroke();
        }, 650);
        return;
      }
      if (!correct && !opts.strictMistakes) {
        setMistakes((m) => {
          const next = m + 1;
          if (opts.mistakeLimit !== undefined && next > opts.mistakeLimit && !failedRef.current) {
            failedRef.current = 'mistakes';
            setFailed('mistakes');
            setPaused(true);
            opts.onFail?.('mistakes', {
              timeMs: accumulated.current + (Date.now() - startRef.current),
              mistakes: next,
              hints: hintsUsedRef.current,
              undos: undosRef.current,
              clears: clearsRef.current,
              finished: false,
            });
          }
          return next;
        });
      }
      beep('place', opts.sound ?? false);
      beginStroke();
      paint(cell, 2);
      endStroke();
      const next = marksRef.current.slice();
      if (checkWin(next)) {
        window.setTimeout(() => {
          setHint(null);
          finishNow();
        }, 260);
      }
    },
    [n, puzzle.solution, opts.strictMistakes, opts.sound, opts.mistakeLimit, opts.onFail, beginStroke, paint, endStroke, checkWin, finishNow],
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
          setHint({ deduction: null, conflict: false, cells: [], targets: [], text: '这一步没有可用的推理，先检查一下已有标记吧。' });
        }
      } finally {
        setHintLoading(false);
      }
    }, 20);
  }, [n, puzzle.colors, puzzle.solution]);

  const reset = useCallback(() => {
    setMarks(new Array(n * n).fill(0) as Mark[]);
    setFinished(false);
    setWrongCells([]);
    setHint(null);
    history.current = [];
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
    wrongCells,
    hint,
    hintLoading,
    paused,
    canUndo: history.current.length > 0,
    failed,
    remainingMs: opts.timeLimitMs === undefined ? null : Math.max(0, opts.timeLimitMs - elapsedMs),
    beginStroke,
    paint,
    endStroke,
    tapX,
    placeCow,
    removeCow,
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
