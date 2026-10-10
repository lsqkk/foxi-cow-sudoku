import { Icon } from './Icon';

type Cell = number;
type Pos = [number, number];

interface Tech {
  title: string;
  text: string;
  /** 5×5 示意图：每个格子一种颜色 id（-1 = 与推理无关 / 背景） */
  grid: Cell[][];
  /** 原因格（蓝色框） */
  reason?: Pos[];
  /** 被排除的格（×） */
  cross?: Pos[];
  /** 确定下牛（🐮） */
  cow?: Pos[];
}

const G = (rows: number[][]): Cell[][] => rows;

/** 每种推理方法配一张小示意图（颜色块 + 蓝框 + ×/牛） */
const TECHS: Tech[] = [
  {
    title: '① 唯一候选：某行 / 列 / 颜色只剩一格',
    text: '一行、一列或一种颜色如果只剩一个还能放的位置，这里必定是小牛，直接落下即可。',
    grid: G([
      [-1, -1, -1, -1, -1],
      [-1, -1, -1, -1, -1],
      [2, 2, 2, 2, 0],
      [-1, -1, -1, -1, -1],
      [-1, -1, -1, -1, -1],
    ]),
    reason: [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
    ],
    cross: [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
    cow: [[2, 4]],
  },
  {
    title: '② 颜色被限制在一行 / 列内',
    text: '某种颜色的所有候选格都挤在同一行（或同一列）里，那么这一行（列）就被它占住了，同行的其他格子可以全部排除。',
    grid: G([
      [-1, -1, -1, -1, -1],
      [0, 0, 0, 1, 1],
      [-1, -1, -1, -1, -1],
      [-1, -1, -1, -1, -1],
      [-1, -1, -1, -1, -1],
    ]),
    reason: [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    cross: [
      [1, 3],
      [1, 4],
    ],
  },
  {
    title: '③ 整行 / 整列的候选全是同一种颜色',
    text: '某行（列）剩下的候选格全是同一种颜色，说明这头牛就在这一行（列）里，该颜色在别处的格子都能排除。',
    grid: G([
      [0, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 0, 1],
    ]),
    reason: [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
    ],
    cross: [
      [0, 0],
      [4, 3],
    ],
  },
  {
    title: '④ 行与列被同一种颜色夹住',
    text: '某一行的候选和某一列的候选都属于同一种颜色，那么它们的交会点一定是这头小牛。',
    grid: G([
      [1, 1, 1, 1, 1],
      [0, 0, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 0, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ]),
    reason: [
      [1, 0],
      [3, 1],
    ],
    cross: [
      [0, 1],
      [2, 1],
      [4, 1],
      [1, 2],
      [1, 3],
      [1, 4],
    ],
    cow: [[1, 1]],
  },
  {
    title: '⑤ 同色候选的公共邻格先排除',
    text: '一种颜色只剩相邻的两三格时，无论牛落在哪一格，某些格子都会被它旁边排掉 —— 这些公共格子可以提前打 ×。',
    grid: G([
      [1, 0, 1, 1, 1],
      [0, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ]),
    reason: [
      [0, 1],
      [1, 0],
    ],
    cross: [[1, 1]],
  },
  {
    title: '⑥ 两行 / 两列的候选只落在两种颜色里',
    text: 'k 行（列）的候选格恰好只落在 k 种颜色（或 k 个列 / 行）之内时，这 k 头牛就把这些位置用满了，其余格子可以排除。',
    grid: G([
      [-1, -1, -1, -1, -1],
      [0, 0, 0, 1, 1],
      [1, 1, 1, 1, 1],
      [-1, -1, -1, -1, -1],
      [-1, -1, 1, -1, -1],
    ]),
    reason: [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
    ],
    cross: [[4, 2]],
  },
  {
    title: '⑦ 排除法（反证）',
    text: '假设某格是小牛，顺着推下去会让某种颜色（或某行某列）无处可放 —— 说明这个假设不成立，该格排除。',
    grid: G([
      [1, 1, 1, 1, 1],
      [1, 0, 0, 1, 1],
      [1, 0, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ]),
    reason: [
      [1, 1],
      [1, 2],
      [2, 1],
    ],
    cross: [[1, 1]],
  },
];

function TechDiagram({ tech }: { tech: Tech }) {
  const at = (list: Pos[] | undefined) => new Set((list ?? []).map(([r, c]) => `${r}-${c}`));
  const reason = at(tech.reason);
  const cross = at(tech.cross);
  const cow = at(tech.cow);
  return (
    <div className="diagram" aria-hidden>
      {tech.grid.map((row, r) =>
        row.map((k, c) => {
          const key = `${r}-${c}`;
          const cls = [
            'dcell',
            k >= 0 ? `dc-${k}` : 'dc-none',
            reason.has(key) ? 'd-reason' : '',
            cross.has(key) ? 'd-cross' : '',
            cow.has(key) ? 'd-cow' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={key} className={cls}>
              {cross.has(key) && <span className="dx">×</span>}
              {cow.has(key) && <span className="dcow">🐮</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}

export function RulesPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel">
      <div className="panelhead">
        <h2>规则和常见玩法</h2>
        <button className="ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <h3 className="subhead">规则</h3>
      <ul className="rules">
        <li>棋盘 N×N，共 N 种颜色，每种颜色的方块彼此连通。</li>
        <li>每种颜色只有 1 头小牛；每行每列有且仅有 1 头小牛。</li>
        <li>小牛之间不能相邻（上下左右、斜角都不行）。</li>
        <li>每关都有唯一解，可以放心推理，不需要猜。</li>
      </ul>

      <h3 className="subhead">操作</h3>
      <ul className="rules">
        <li>单击空格：打一个白色 ×（表示这里不可能是小牛）；再单击一下取消。</li>
        <li>按住拖动：连续打 ×（从 × 开始拖就是连续取消）。</li>
        <li>双击格子：放一头小牛。放上就固定了，不用也不能再取消。</li>
        <li>双击了错误的位置：会直接变成一个红色的 ×，同样固定，方便你记住这条路走错过。</li>
        <li>
          放下小牛后，默认会自动把它所在的行、列、同色区域以及周围 8 格打上 ×；
          这个「放下自动排除」可以在对局面板的按钮或设置里关掉，改成纯手动打 ×。
        </li>
        <li>随时可以用「撤销」「清除」重来，或者点「提示」看下一步和理由。</li>
      </ul>

      <h3 className="subhead">常用推理方法</h3>
      <p className="footnote">从最简单的一步开始：提示也会优先给你最基础的那种推理。</p>
      <div className="techlist">
        {TECHS.map((t) => (
          <div className="techcard" key={t.title}>
            <TechDiagram tech={t} />
            <div className="techtext">
              <b>{t.title}</b>
              <p>{t.text}</p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="subhead">关于</h3>
      <ul className="rules">
        <li>复刻自“数独 + 扫雷”玩法的《佛系消消消》，去掉了体力、广告和内购，提示不限次数。</li>
        <li>关卡在本地即时生成（唯一解、纯逻辑可解），难度从入门到地狱可调，可以无限玩下去。</li>
        <li>所有进度与成绩都存在浏览器本地，不上传任何数据。</li>
        <li>
          开源地址：{' '}
          <a className="aboutlink" href="https://github.com/lsqkk/foxi-cow-sudoku" target="_blank" rel="noreferrer">
            <Icon name="link" /> github.com/lsqkk/foxi-cow-sudoku
          </a>
        </li>
      </ul>
    </div>
  );
}
