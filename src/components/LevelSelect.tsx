import { useMemo, useState } from 'react';
import { classicDifficulty } from '../game/levels';
import type { LevelRecord } from '../game/storage';

interface Props {
  unlocked: number;
  records: Record<string, LevelRecord>;
  onPick: (level: number) => void;
  onBack: () => void;
}

const PAGE = 60;

/** 经典闯关的关卡选择：显示进度、星级、最好成绩 */
export function LevelSelect({ unlocked, records, onPick, onBack }: Props) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil((unlocked + 20) / PAGE));

  const rows = useMemo(() => {
    const out: { level: number; rec?: LevelRecord }[] = [];
    for (let i = 0; i < PAGE; i++) {
      const level = page * PAGE + i + 1;
      out.push({ level, rec: records[`classic:${level}`] });
    }
    return out;
  }, [page, records]);

  const starsTotal = useMemo(
    () => Object.values(records).filter((r) => r.mode === 'classic').reduce((a, r) => a + r.stars, 0),
    [records],
  );

  return (
    <div className="panel">
      <div className="panelhead">
        <h2>经典闯关</h2>
        <div className="calibstat">
          <span>
            已解锁 <b>{unlocked}</b> 关
          </span>
          <span>
            星数 <b>{starsTotal}</b>
          </span>
        </div>
        <button className="ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <div className="levelgrid">
        {rows.map(({ level, rec }) => {
          const locked = level > unlocked;
          return (
            <button
              key={level}
              className={'levelcell' + (locked ? ' locked' : '') + (rec?.cleared ? ' cleared' : '')}
              disabled={locked}
              title={`难度 ${classicDifficulty(level).toFixed(1)}${rec ? ` · 最好 ${(rec.timeMs / 1000).toFixed(0)}s` : ''}`}
              onClick={() => onPick(level)}
            >
              <span className="lv-num">{level}</span>
              <span className="lv-stars">
                {rec?.cleared ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : locked ? '🔒' : '—'}
              </span>
              <span className="lv-sub">{rec?.cleared ? `${(rec.timeMs / 1000).toFixed(0)}s` : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="pager">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
          ← 上一页
        </button>
        <span>
          {page + 1} / {pages} 页
        </span>
        <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
          下一页 →
        </button>
      </div>
    </div>
  );
}
