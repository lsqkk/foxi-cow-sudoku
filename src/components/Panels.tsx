import { useMemo, useState } from 'react';
import { TECHNIQUE_LABEL, type TechniqueId } from '../engine';
import { CALIBRATION_PACK, RATING_TAGS } from '../game/calibration';
import { exportCSV, exportJSON, type SessionRecord } from '../game/storage';

// ---------------------------------------------------------------------------
// 评分对话框
// ---------------------------------------------------------------------------

interface RatingProps {
  title: string;
  subtitle?: string;
  existing?: { rating?: number; tags?: string[]; note?: string };
  onSubmit: (rating: number, tags: string[], note: string) => void;
  onClose: () => void;
}

export function RatingDialog({ title, subtitle, existing, onSubmit, onClose }: RatingProps) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [note, setNote] = useState(existing?.note ?? '');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {subtitle && <div className="sub">{subtitle}</div>}
        <div className="stars">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} className={s <= rating ? 'star on' : 'star'} onClick={() => setRating(s)}>
              ★
            </button>
          ))}
          <span className="starlabel">
            {rating === 0
              ? '点星星打分'
              : ['', '非常简单', '简单', '中等', '困难', '非常难'][rating]}
          </span>
        </div>
        <div className="tagrow">
          {RATING_TAGS.map((t) => (
            <button
              key={t}
              className={tags.includes(t) ? 'tag on' : 'tag'}
              onClick={() => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          placeholder="想补充点什么？（哪一步卡住了、哪里最好玩、技术用到了哪些…）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <div className="modalbtns">
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={rating === 0} onClick={() => onSubmit(rating, tags, note)}>
            保存评分
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 标定关卡包
// ---------------------------------------------------------------------------

interface CalibProps {
  records: SessionRecord[];
  currentIndex: number | null;
  onPick: (index: number) => void;
  onBack: () => void;
}

export function CalibrationPanel({ records, currentIndex, onPick, onBack }: CalibProps) {
  const byPack = new Map<string, SessionRecord>();
  for (const r of records) if (r.packId && r.mode === 'calibration') byPack.set(r.packId, r);

  const rated = CALIBRATION_PACK.filter((p) => byPack.get(p.id)?.rating).length;
  const done = CALIBRATION_PACK.filter((p) => byPack.get(p.id)?.finished).length;

  return (
    <div className="panel">
      <div className="panelhead">
        <h2>真实难度标定</h2>
        <button className="ghost" onClick={onBack}>
          返回游戏
        </button>
      </div>
      <p className="lead">
        这 18 关是精心挑选的“难度光谱”：尺寸 6~13、设计从极其规整到非常缠绕。请你按顺序（或随便挑）实际玩一遍，
        完成后给每关打 1~5 星并进行标注。玩完之后去“数据”页，就能看到你的体感难度和“生成难度”的对应关系，
        以及哪些设计特征最能预测真实难度。
      </p>
      <div className="calibstat">
        <span>已完成 <b>{done}</b>/{CALIBRATION_PACK.length}</span>
        <span>已评分 <b>{rated}</b>/{CALIBRATION_PACK.length}</span>
        <span>建议：先玩 A/B 组热身，再跳到 E/H 组感受尺寸与难度的关系</span>
      </div>
      <div className="packgrid">
        {CALIBRATION_PACK.map((p, i) => {
          const rec = byPack.get(p.id);
          return (
            <button
              key={p.id}
              className={'packcard' + (currentIndex === i ? ' current' : '')}
              onClick={() => onPick(i)}
            >
              <div className="packcard-top">
                <b>{p.id}</b>
                <span className="pill soft">{p.n}×{p.n}</span>
                {rec?.rating ? <span className="rated-badge">{rec.rating}★</span> : null}
              </div>
              <div className="packcard-mid">{p.hint}</div>
              <div className="packcard-bot">
                {rec?.finished ? (
                  <span>
                    ✓ 用时 {(rec.timeMs / 1000).toFixed(0)}s · 错误 {rec.mistakes} · 提示 {rec.hints}
                  </span>
                ) : rec ? (
                  <span>进行中…</span>
                ) : (
                  <span>未开始</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

interface StatsProps {
  records: SessionRecord[];
  onClear: () => void;
}

interface FeatureDef {
  key: string;
  label: string;
  get: (r: SessionRecord) => number;
}

const FEATURES: FeatureDef[] = [
  { key: 'score', label: '生成难度分', get: (r) => r.score },
  { key: 'n', label: '棋盘尺寸 n', get: (r) => r.n },
  { key: 'sizeGini', label: '区域大小不均（基尼）', get: (r) => r.features.sizeGini },
  { key: 'smallColorRatio', label: '小颜色占比（≤2格）', get: (r) => r.features.smallColorRatio },
  { key: 'winding', label: '颜色缠绕度', get: (r) => r.features.winding },
  { key: 'lineConfined', label: '整行/列颜色占比', get: (r) => r.features.lineConfinedColors },
  { key: 'tierCost', label: '技术成本总和', get: (r) => r.features.tierCost },
  { key: 'steps', label: '逻辑步数', get: (r) => r.features.steps },
  { key: 'highestTier', label: '最高技术层', get: (r) => r.features.highestTier },
  { key: 'logicProgress', label: '纯逻辑推进率', get: (r) => r.features.logicProgress },
  { key: 'needsRefutation', label: '需要反证/排除法', get: (r) => (r.metrics.needsRefutation ? 1 : 0) },
  { key: 'timeSec', label: '用时（秒）', get: (r) => r.timeMs / 1000 },
  { key: 'mistakes', label: '错误次数', get: (r) => r.mistakes },
  { key: 'hints', label: '提示次数', get: (r) => r.hints },
];

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function pearson(xs: number[], ys: number[]): number {
  if (xs.length < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return NaN;
  return num / Math.sqrt(dx * dy);
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k].i] = r;
    i = j + 1;
  }
  return out;
}

function spearman(xs: number[], ys: number[]): number {
  if (xs.length < 3) return NaN;
  return pearson(ranks(xs), ranks(ys));
}

function linreg(xs: number[], ys: number[]): { a: number; b: number; r2: number } {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const a = den === 0 ? 0 : num / den;
  const b = my - a * mx;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < xs.length; i++) {
    ssTot += (ys[i] - my) ** 2;
    ssRes += (ys[i] - (a * xs[i] + b)) ** 2;
  }
  return { a, b, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

export function StatsPanel({ records, onClear }: StatsProps) {
  const [xKey, setXKey] = useState('score');
  const rated = useMemo(() => records.filter((r) => r.rating && r.finished), [records]);
  const xDef = FEATURES.find((f) => f.key === xKey) ?? FEATURES[0];
  const xs = rated.map(xDef.get);
  const ys = rated.map((r) => r.rating as number);
  const r = pearson(xs, ys);
  const rho = spearman(xs, ys);
  const reg = linreg(xs, ys);

  const corrRows = useMemo(() => {
    return FEATURES.map((f) => {
      const x = rated.map(f.get);
      const y = ys;
      return { f, r: pearson(x, y), rho: spearman(x, y) };
    }).sort((a, b) => Math.abs(b.r || 0) - Math.abs(a.r || 0));
  }, [rated, ys]);

  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel">
      <div className="panelhead">
        <h2>难度标定数据</h2>
        <div className="rowbtns">
          <button onClick={() => download('foxi-sessions.json', exportJSON(records), 'application/json')}>
            导出 JSON
          </button>
          <button onClick={() => download('foxi-sessions.csv', exportCSV(records), 'text/csv')}>导出 CSV</button>
          <button
            className="danger"
            onClick={() => {
              if (confirm('确定清空所有本地记录？')) onClear();
            }}
          >
            清空数据
          </button>
        </div>
      </div>

      <div className="calibstat">
        <span>记录 <b>{records.length}</b> 条</span>
        <span>已完成 <b>{records.filter((x) => x.finished).length}</b></span>
        <span>已评分 <b>{rated.length}</b></span>
        {rated.length >= 2 && (
          <span>
            平均体感分 <b>{mean(ys).toFixed(2)}</b>
          </span>
        )}
      </div>

      {rated.length < 3 ? (
        <p className="lead">
          先到“标定”页玩几关并打分（至少 3 关，建议 8 关以上），这里就会自动算出
          “生成难度 ↔ 你的体感难度”的相关性与拟合直线。
        </p>
      ) : (
        <>
          <div className="cards">
            <div className="statcard">
              <div className="sc-label">相关系数 r（{xDef.label} vs 体感分）</div>
              <div className="sc-value">{isNaN(r) ? '—' : r.toFixed(3)}</div>
              <div className="sc-hint">
                {isNaN(r) ? '数据不足' : Math.abs(r) > 0.7 ? '关系很强' : Math.abs(r) > 0.4 ? '关系中等' : '关系较弱'}
              </div>
            </div>
            <div className="statcard">
              <div className="sc-label">秩相关 ρ（更耐极端值）</div>
              <div className="sc-value">{isNaN(rho) ? '—' : rho.toFixed(3)}</div>
            </div>
            <div className="statcard">
              <div className="sc-label">拟合：体感分 ≈ a×({xDef.label}) + b</div>
              <div className="sc-value small">
                {reg.a.toFixed(3)} × x {reg.b >= 0 ? '+' : '−'} {Math.abs(reg.b).toFixed(2)}
              </div>
              <div className="sc-hint">R² = {reg.r2.toFixed(3)}</div>
            </div>
          </div>

          <Scatter xs={xs} ys={ys} reg={reg} xLabel={xDef.label} />

          <div className="pickerline">
            横轴换成：
            <select value={xKey} onChange={(e) => setXKey(e.target.value)}>
              {FEATURES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <p className="footnote">
            哪些特征最能预测你的真实难度？按 |r| 排序（r 越接近 ±1 越相关；正相关表示数值越大你觉得越难）：
          </p>
          <table className="datatable">
            <thead>
              <tr>
                <th>特征</th>
                <th>Pearson r</th>
                <th>Spearman ρ</th>
                <th>解读</th>
              </tr>
            </thead>
            <tbody>
              {corrRows.map(({ f, r: rr, rho: rrk }) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>{isNaN(rr) ? '—' : rr.toFixed(3)}</td>
                  <td>{isNaN(rrk) ? '—' : rrk.toFixed(3)}</td>
                  <td>{isNaN(rr) ? '' : Math.abs(rr) > 0.7 ? '很强' : Math.abs(rr) > 0.4 ? '中等' : '较弱'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 className="subhead">全部记录</h3>
      <div className="tablewrap">
        <table className="datatable">
          <thead>
            <tr>
              <th>模式</th>
              <th>关卡</th>
              <th>尺寸</th>
              <th>生成分</th>
              <th>设计特征</th>
              <th>用时</th>
              <th>错误</th>
              <th>提示</th>
              <th>体感</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {records
              .slice()
              .reverse()
              .slice(0, 60)
              .map((rec) => (
                <tr key={rec.id}>
                  <td>{rec.mode === 'calibration' ? `标定 ${rec.packId}` : '无尽'}</td>
                  <td>{rec.mode === 'endless' ? `第 ${rec.level} 关` : rec.packId}</td>
                  <td>{rec.n}</td>
                  <td>
                    {rec.score.toFixed(1)} <span className="muted">{rec.label}</span>
                  </td>
                  <td className="muted">
                    小色 {(rec.features.smallColorRatio * 100).toFixed(0)}% · 不均 {rec.features.sizeGini.toFixed(2)} · 缠绕{' '}
                    {(rec.features.winding * 100).toFixed(0)}%
                  </td>
                  <td>{(rec.timeMs / 1000).toFixed(0)}s</td>
                  <td>{rec.mistakes}</td>
                  <td>{rec.hints}</td>
                  <td>{rec.rating ? `${'★'.repeat(rec.rating)}` : rec.finished ? '未评' : '—'}</td>
                  <td className="muted">{(rec.ratingTags ?? []).join('、') || rec.ratingNote || ''}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Scatter({
  xs,
  ys,
  reg,
  xLabel,
}: {
  xs: number[];
  ys: number[];
  reg: { a: number; b: number };
  xLabel: string;
}) {
  const W = 420;
  const H = 260;
  const pad = { l: 46, r: 12, t: 12, b: 34 };
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = 1;
  const yMax = 5;
  const sx = (v: number) => pad.l + ((v - xMin) / Math.max(1e-9, xMax - xMin)) * (W - pad.l - pad.r);
  const sy = (v: number) => H - pad.b - ((v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

  return (
    <svg className="scatter" viewBox={`0 0 ${W} ${H}`} role="img">
      {[1, 2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} className="gridline" />
          <text x={pad.l - 8} y={sy(v) + 4} className="axistext" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <text x={pad.l - 30} y={pad.t} className="axistext">
        体感分
      </text>
      <text x={(W + pad.l) / 2} y={H - 6} className="axistext" textAnchor="middle">
        {xLabel}
      </text>
      <line x1={pad.l} x2={W - pad.r} y1={sy(1)} y2={sy(5)} className="axis" />
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} className="axis" />
      {xs.map((x, i) => (
        <circle key={i} cx={sx(x)} cy={sy(ys[i])} r={5} className="dot" />
      ))}
      {xMax > xMin && (
        <line x1={sx(xMin)} y1={sy(reg.a * xMin + reg.b)} x2={sx(xMax)} y2={sy(reg.a * xMax + reg.b)} className="regline" />
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 规则说明
// ---------------------------------------------------------------------------

export function RulesPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel">
      <div className="panelhead">
        <h2>玩法与难度说明</h2>
        <button className="ghost" onClick={onBack}>
          返回游戏
        </button>
      </div>

      <h3 className="subhead">基本规则</h3>
      <ul className="rules">
        <li>棋盘 N×N，共有 N 种颜色；每种颜色的方块内部连通，且每种颜色只有 1 头小牛。</li>
        <li>每一行、每一列都有且仅有 1 头小牛。</li>
        <li>小牛之间不能相邻（上下左右和斜角都不行）。</li>
        <li>解唯一：每关都存在唯一答案，可以放心推理。</li>
      </ul>

      <h3 className="subhead">操作</h3>
      <ul className="rules">
        <li>单击空格子：打一个白色 ×（表示这个位置不可能是小牛）。</li>
        <li>单击 ×：取消它。</li>
        <li>从格子上按住滑动：连续打 ×（从 × 开始滑则连续取消）。</li>
        <li>双击格子：放一头小牛；单击已放的小牛：把它拿走。</li>
        <li>放下一头牛之后，它所在的行、列、同色区域，以及周围 8 格都会被自动排除——这是最常用的规则。</li>
      </ul>

      <h3 className="subhead">逻辑规则（引擎会按这些规则给提示）</h3>
      <ol className="rules">
        <li>某行/列只剩一个候选格 → 一定是小牛；某颜色只剩一个候选格 → 同理。</li>
        <li>某颜色的所有候选都在同一行/列内 → 该行/列其余格子排除。</li>
        <li>某行/列的候选都属于同一种颜色 → 这种颜色在其它行/列的格子排除。</li>
        <li>某行与某列的候选属于同一种颜色，交会点必是小牛。</li>
        <li>某颜色的候选只有相邻两格/三格（或任意几格）→ 无论放哪一格都会排除的公共格子可以排除。</li>
        <li>k 个行/列的候选恰好落在 k 种颜色（或 k 个列）里 → 这些颜色/行列的牛被“用满”，其余位置排除。</li>
        <li>反证（排除法）：假设某格是小牛会导致某种颜色（或某行某列）无处可放 → 该格排除。这也是兜底手段，保证唯一解的关卡一定能做到底。</li>
      </ol>

      <h3 className="subhead">难度是怎么算的</h3>
      <p className="lead">
        生成难度分（1~10）主要由<b>关卡设计</b>决定，而不是棋盘大小：引擎用上面的规则阶梯把每一关从头解一遍，
        统计用到哪些技巧、需要多少步、纯逻辑能推进到多少（推不动就只能靠反证/排除法）。
        再加上颜色形状的“缠绕度”、区域大小是否悬殊等指标，合成一个分数。
        <br />
        棋盘尺寸只做 ±10% 的轻微修正 —— 因为 10×10 也可能很简单，12×13 也可能只是中等。
      </p>
      <p className="lead">
        “标定”页会让你真实体验一批关卡并打分。等数据攒够了，“数据”页会给出体感难度与各生成指标的相关系数，
        以及“体感分 ≈ a×生成分 + b”的拟合式子，用来检查生成难度是否贴合人的感受。
      </p>

      <h3 className="subhead">本作相对原版的差别</h3>
      <ul className="rules">
        <li>没有体力/hearts、没有广告、没有内购；提示不限次数。</li>
        <li>关卡由前端即时生成，可以无限玩下去，难度与尺寸都能自己调。</li>
        <li>额外提供：撤销、计时、错误统计、生成指标展示、难度标定与数据导出。</li>
      </ul>

      <h3 className="subhead">引擎实现的技术清单</h3>
      <table className="datatable">
        <thead>
          <tr>
            <th>层</th>
            <th>技术</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(TECHNIQUE_LABEL) as TechniqueId[]).map((id) => (
            <tr key={id}>
              <td>{id}</td>
              <td>{TECHNIQUE_LABEL[id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="footnote">
        提示时高亮：浅蓝底 = 参与推理的格子，金色边 = 被影响/可以排除的格子，绿色边 = 可以直接放小牛的位置。
      </p>
    </div>
  );
}
