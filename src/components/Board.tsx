import { useCallback, useRef } from 'react';
import { colorOf } from '../game/theme';
import { isLockedMark, type Mark } from '../game/useGame';

interface BoardProps {
  n: number;
  colors: number[][];
  marks: Mark[];
  colorBlind: boolean;
  disabled?: boolean;
  hintCells: number[];
  hintTargets: number[];
  onBeginStroke: () => void;
  onPaint: (cell: number, value: Mark) => void;
  onEndStroke: () => void;
  onCow: (cell: number) => void;
}

const DOUBLE_TAP_MS = 320;

/**
 * 棋盘：支持原版的操作方式
 * - 单击空格：打 ×；单击 ×：取消
 * - 从空格/×拖动：连续打 × / 连续取消
 * - 双击：放小牛（放上就固定，不能再取消）
 * - 双击放错的位置：直接变成一个固定的红叉
 */
export function Board(props: BoardProps) {
  const { n, colors, marks, colorBlind, disabled, hintCells, hintTargets } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const stroke = useRef<{ mode: 'paint' | 'erase'; moved: boolean; start: number; lastCell: number } | null>(null);
  const lastTap = useRef<{ cell: number; time: number } | null>(null);

  const cellAt = useCallback((clientX: number, clientY: number): number | null => {
    const el = document.elementFromPoint(clientX, clientY);
    const cellEl = el?.closest('[data-cell]') as HTMLElement | null;
    if (!cellEl) return null;
    const v = Number(cellEl.dataset.cell);
    return Number.isFinite(v) ? v : null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (cell === null) return;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* 合成事件/某些浏览器可能不支持，忽略即可（不影响拖动逻辑） */
      }
      e.preventDefault();
      if (isLockedMark(marks[cell])) return; // 小牛 / 红叉已固定，点了也不动
      const mode: 'paint' | 'erase' = marks[cell] === 1 ? 'erase' : 'paint';
      props.onBeginStroke();
      props.onPaint(cell, mode === 'paint' ? 1 : 0);
      stroke.current = { mode, moved: false, start: cell, lastCell: cell };
    },
    [cellAt, disabled, marks, props],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = stroke.current;
      if (!s || disabled) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (cell === null || cell === s.lastCell) return;
      s.lastCell = cell;
      s.moved = true;
      props.onPaint(cell, s.mode === 'paint' ? 1 : 0);
    },
    [cellAt, disabled, props],
  );

  const onPointerUp = useCallback(
    (_e: React.PointerEvent<HTMLDivElement>) => {
      const s = stroke.current;
      stroke.current = null;
      if (!s || disabled) return;
      const now = performance.now();
      const isDouble = lastTap.current !== null && lastTap.current.cell === s.start && now - lastTap.current.time < DOUBLE_TAP_MS;

      props.onEndStroke();

      if (isDouble) {
        // 第二下：先把这一下打上的 × 清掉，再放牛（放上即固定）
        props.onPaint(s.start, 0);
        props.onCow(s.start);
        lastTap.current = null;
      } else if (!s.moved) {
        lastTap.current = { cell: s.start, time: now };
      } else {
        lastTap.current = null;
      }
    },
    [disabled, props],
  );

  const hintSet = new Set(hintCells);
  const targetSet = new Set(hintTargets);
  const cellSize = n >= 12 ? 4 : n >= 10 ? 5 : 6;

  return (
    <div
      ref={wrapRef}
      className="board"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gap: cellSize, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {Array.from({ length: n * n }, (_, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const def = colorOf(colors[r][c]);
        const mark = marks[i];
        const cls = [
          'cell',
          mark === 1 ? 'x' : '',
          mark === 2 ? 'cow' : '',
          hintSet.has(i) ? 'hint-reason' : '',
          targetSet.has(i) ? 'hint-target' : '',
          mark === 3 ? 'wrong' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={i}
            data-cell={i}
            className={cls}
            style={{ background: def.bg, backgroundImage: colorBlind ? def.pattern : undefined }}
          >
            {colorBlind && <span className="cb-letter">{def.letter}</span>}
            {(mark === 1 || mark === 3) && (
              <svg className="xmark" viewBox="0 0 24 24" aria-hidden>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            )}
            {mark === 2 && <span className="cow-emoji">🐮</span>}
          </div>
        );
      })}
    </div>
  );
}
