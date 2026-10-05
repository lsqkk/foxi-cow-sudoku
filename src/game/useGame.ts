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
  opts: { strictMistakes: boolean; onFinish?: (report: GameReport) => void },
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

  const history = useRef<Change[][]>([]);
  const pending = useRef<Change[]>([]);
  const startRef = useRef<number>(Date.now());
  const accumulated = useRef<number>(0);
  const pausedRef = useRef(false);
  const finishedRef = useRef(false);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  pausedRef.current = paused;
  finishedRef.current = finished;

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
    setElapsedMs(0);
    setPaused(false);
  }, [puzzle.id, n]);

  // 计时（页面隐藏时暂停）
  useEffect(() => {
    const tick = () => {
      if (finishedRef.current || pausedRef.current) return;
      setElapsedMs(accumulated.current + (Date.now() - startRef.current));
    };
    const timer = window.setInterval(tick, 200);
    const onVisibility = () => {
      if (document.hidden) {
        if (!pausedRef.current && !finishedRef.current) {
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
  }, [puzzle.id]);

  const pauseToggle = useCallback((p: boolean) => {
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
      pending.current.push(change);
      marksRef.current = marksRef.current.slice();
      marksRef.current[cell] = value;
      applyChanges([change]);
      setHint(null);
    },
    [applyChanges],
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
        setMistakes((m) => m + 1);
        setWrongCells([cell]);
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
      if (!correct && !opts.strictMistakes) setMistakes((m) => m + 1);
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
    [n, puzzle.solution, opts.strictMistakes, beginStroke, paint, endStroke, checkWin, finishNow],
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
    setElapsedMs(0);
    setPaused(false);
  }, [n]);

  const cows = useMemo(() => marks.filter((m) => m === 2).length, [marks]);

  return {
    marks,
    cows,
    remaining: n - cows,
    elapsedMs,
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
