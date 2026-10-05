import { useMemo, useState } from 'react';
import { classicDifficulty, unlockChallenge } from '../game/levels';
import type { LevelRecord } from '../game/storage';
import { Icon, Stars } from './Icon';

interface Props {
  unlocked: number;
  records: Record<string, LevelRecord>;
  onPick: (level: number) => void;
  onChallenge: (level: number) => void;
  onBack: () => void;
  /** 从分享链接进来时，直接弹出某一关的解锁挑战 */
  initialPending?: number | null;
}

const PAGE = 60;

/** 经典闯关的关卡选择：显示进度、星级、最好成绩 */
export function LevelSelect({ unlocked, records, onPick, onChallenge, onBack, initialPending }: Props) {
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<number | null>(initialPending ?? null);
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
          <Icon name="back" /> 返回
        </button>
      </div>
      <p className="footnote">
        已解锁的关卡可以直接玩；想跳到后面的关卡，需要通过一次「解锁挑战」：在规定时间内解出，并且错误不超过限定次数。
      </p>
      <div className="levelgrid">
        {rows.map(({ level, rec }) => {
          const locked = level > unlocked;
          return (
            <button
              key={level}
              className={'levelcell' + (locked ? ' locked' : '') + (rec?.cleared ? ' cleared' : '')}
              title={`难度 ${classicDifficulty(level).toFixed(1)}${rec ? ` · 最好 ${(rec.timeMs / 1000).toFixed(0)}s` : ''}`}
              onClick={() => (locked ? setPending(level) : onPick(level))}
            >
              <span className="lv-num">{level}</span>
              <span className="lv-stars">{rec?.cleared ? <Stars value={rec.stars} /> : locked ? <Icon name="lock" /> : '—'}</span>
              <span className="lv-sub">{rec?.cleared ? `${(rec.timeMs / 1000).toFixed(0)}s` : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="pager">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
          <Icon name="prev" /> 上一页
        </button>
        <span>
          {page + 1} / {pages} 页
        </span>
        <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>
          下一页 <Icon name="next" />
        </button>
      </div>

      {pending !== null && (
        <div className="modal-backdrop" onClick={() => setPending(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <Icon name="lock" /> 解锁第 {pending} 关
            </h3>
            <div className="sub">
              跳关需要通过一次挑战：在限定时间内解出这一关，并且错误不超过限定次数。通过后，第 {pending}{' '}
              关及之前的所有关卡都会解锁。
            </div>
            <div className="challengerules">
              <div>
                <Icon name="clock" /> 限时 <b>{Math.round(unlockChallenge(pending).timeLimitMs / 1000)} 秒</b>
              </div>
              <div>
                <Icon name="bullseye" /> 错误上限 <b>{unlockChallenge(pending).mistakeLimit} 次</b>
              </div>
              <div>
                <Icon name="progress" /> 预计难度 <b>{classicDifficulty(pending).toFixed(1)}</b>
              </div>
            </div>
            <div className="footnote">计时从你第一次点击棋盘开始；提示可以用，但错误次数用尽或超时即挑战失败。</div>
            <div className="modalbtns">
              <button onClick={() => setPending(null)}>再想想</button>
              <button
                className="primary"
                onClick={() => {
                  const level = pending;
                  setPending(null);
                  onChallenge(level);
                }}
              >
                开始挑战
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
