import { useMemo } from 'react';
import { formatTime } from '../game/useGame';
import { MODE_INFO } from '../game/levels';
import type { GameMode, LevelRecord, MetaState } from '../game/storage';

interface Props {
  records: Record<string, LevelRecord>;
  meta: MetaState;
  onBack: () => void;
  onClear: () => void;
}

export function RecordsPanel({ records, meta, onBack, onClear }: Props) {
  const list = useMemo(
    () => Object.values(records).filter((r) => r.cleared).sort((a, b) => b.updatedAt - a.updatedAt),
    [records],
  );
  const byMode = useMemo(() => {
    const out: Partial<Record<GameMode, number>> = {};
    for (const r of list) out[r.mode] = (out[r.mode] ?? 0) + 1;
    return out;
  }, [list]);

  return (
    <div className="panel">
      <div className="panelhead">
        <h2>成绩与记录</h2>
        <button className="ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <div className="cards">
        <div className="statcard">
          <div className="sc-label">累计通关</div>
          <div className="sc-value">{meta.totalCleared}</div>
          <div className="sc-hint">无错通关 {meta.noMistakeClears} 次</div>
        </div>
        <div className="statcard">
          <div className="sc-label">累计星数</div>
          <div className="sc-value">{meta.totalStars}</div>
          <div className="sc-hint">每关最多 3 星</div>
        </div>
        <div className="statcard">
          <div className="sc-label">当前连胜 / 最高</div>
          <div className="sc-value small">
            {meta.streak} / {meta.bestStreak}
          </div>
          <div className="sc-hint">连续通关（不重玩）</div>
        </div>
        <div className="statcard">
          <div className="sc-label">限时挑战最好成绩</div>
          <div className="sc-value small">{meta.bestTimeAttackMs ? formatTime(meta.bestTimeAttackMs) : '—'}</div>
          <div className="sc-hint">
            {meta.bestTimeAttackSplits?.length
              ? meta.bestTimeAttackSplits.map((t) => formatTime(t)).join(' / ')
              : '完成一次挑战赛就会出现'}
          </div>
        </div>
      </div>
      <h3 className="subhead">各模式通关数</h3>
      <div className="calibstat">
        {(Object.keys(MODE_INFO) as GameMode[]).map((m) => (
          <span key={m}>
            {MODE_INFO[m].icon} {MODE_INFO[m].name} <b>{byMode[m] ?? 0}</b>
          </span>
        ))}
        <span>
          累计用时 <b>{formatTime(meta.totalTimeMs)}</b>
        </span>
      </div>
      <h3 className="subhead">最近成绩</h3>
      <div className="tablewrap">
        <table className="datatable">
          <thead>
            <tr>
              <th>模式</th>
              <th>关卡</th>
              <th>尺寸</th>
              <th>难度</th>
              <th>星级</th>
              <th>用时</th>
              <th>错误</th>
              <th>提示</th>
              <th>尝试</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 60).map((r) => (
              <tr key={r.key}>
                <td>{MODE_INFO[r.mode]?.name ?? r.mode}</td>
                <td>{r.mode === 'classic' ? `第 ${r.level} 关` : r.mode === 'daily' ? '每日' : r.level}</td>
                <td>
                  {r.n}×{r.n}
                </td>
                <td>{r.difficulty.toFixed(1)}</td>
                <td>
                  {'★'.repeat(r.stars)}
                  {'☆'.repeat(3 - r.stars)}
                </td>
                <td>{formatTime(r.timeMs)}</td>
                <td>{r.mistakes}</td>
                <td>{r.hints}</td>
                <td>{r.attempts}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  还没有通关记录，去玩一关吧
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="rowbtns">
        <button
          className="danger"
          onClick={() => {
            if (confirm('确定清空所有本地进度与成绩？')) onClear();
          }}
        >
          清空所有数据
        </button>
      </div>
    </div>
  );
}
