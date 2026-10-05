import { useMemo, useRef, useState } from 'react';
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
  const [jump, setJump] = useState('');
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // 允许一直往后翻（后面全是未解锁关卡，点进去就是“解锁挑战”），
  // 至少给 6 页（360 关），所以没解锁也能左右翻页看后面的关卡。
  const MAX_LEVELS = 3000;
  const pages = Math.max(6, Math.ceil(Math.max(unlocked + 20, PAGE) / PAGE));

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

  const goPage = (next: number) => setPage(Math.max(0, Math.min(pages - 1, next)));

  const doJump = () => {
    const n = Number(jump);
    if (!Number.isFinite(n) || n < 1) return;
    const target = Math.min(MAX_LEVELS, Math.floor(n));
    setPage(Math.floor((target - 1) / PAGE));
    setJump('');
    if (target <= unlocked) onPick(target);
    else setPending(target);
  };

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
        已解锁的关卡可以直接玩（点击即开始）。后面的关卡可以直接往后翻页 / 输入关号跳过去，
        点击会发起「解锁挑战」：在规定时间内解出，并且错误不超过限定次数，通过后就解锁了。
        <br />
        手机上也可以在这一页左右滑动翻页。
      </p>
      <div className="jumprow">
        <label>
          跳到第
          <input
            className="jumpinput"
            inputMode="numeric"
            placeholder="关号"
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doJump();
            }}
          />
          关
        </label>
        <button onClick={doJump} disabled={!jump}>
          前往
        </button>
      </div>
      <div
        className="levelgrid"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goPage(page + (dx < 0 ? 1 : -1));
        }}
      >
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
        <button onClick={() => goPage(page - 1)} disabled={page === 0}>
          <Icon name="prev" /> 上一页
        </button>
        <span>
          {page + 1} / {pages} 页
        </span>
        <button onClick={() => goPage(page + 1)} disabled={page >= pages - 1}>
          下一页 <Icon name="next" />
        </button>
      </div>

      {pending !== null && (
        <div className="modal-backdrop" onClick={() => setPending(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <Icon name={pending > unlocked ? 'lock' : 'play'} /> {pending > unlocked ? `解锁第 ${pending} 关` : `开始第 ${pending} 关`}
            </h3>
            {pending > unlocked ? (
              <div className="sub">
                跳关需要通过一次挑战：在限定时间内解出这一关，并且错误不超过限定次数。通过后，第 {pending}{' '}
                关及之前的所有关卡都会解锁。
              </div>
            ) : (
              <div className="sub">
                这一关已经解锁，可以直接开始。
                {records[`classic:${pending}`]?.cleared
                  ? ` 你之前的最好成绩：${(records[`classic:${pending}`].timeMs / 1000).toFixed(0)} 秒、${records[`classic:${pending}`].stars} 星。`
                  : ''}
              </div>
            )}
            <div className="challengerules">
              <div>
                <Icon name="clock" /> {pending > unlocked ? '限时' : '往期最好'}{' '}
                <b>
                  {pending > unlocked
                    ? `${Math.round(unlockChallenge(pending).timeLimitMs / 1000)} 秒`
                    : records[`classic:${pending}`]?.cleared
                      ? `${(records[`classic:${pending}`].timeMs / 1000).toFixed(0)} 秒`
                      : '—'}
                </b>
              </div>
              <div>
                <Icon name="bullseye" /> {pending > unlocked ? '错误上限' : '历史错误'}{' '}
                <b>{pending > unlocked ? `${unlockChallenge(pending).mistakeLimit} 次` : (records[`classic:${pending}`]?.attempts ?? '—')}</b>
              </div>
              <div>
                <Icon name="progress" /> 预计难度 <b>{classicDifficulty(pending).toFixed(1)}</b>
              </div>
            </div>
            <div className="footnote">
              {pending > unlocked
                ? '计时从你第一次点击棋盘开始；提示可以用，但错误次数用尽或超时即挑战失败。'
                : '计时从你第一次点击棋盘开始。'}
            </div>
            <div className="modalbtns">
              <button onClick={() => setPending(null)}>再想想</button>
              <button
                className="primary"
                onClick={() => {
                  const level = pending;
                  setPending(null);
                  if (level > unlocked) onChallenge(level);
                  else onPick(level);
                }}
              >
                {pending > unlocked ? '开始挑战' : '开始游戏'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
