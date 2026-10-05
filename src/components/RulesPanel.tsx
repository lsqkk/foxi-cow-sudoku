export function RulesPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="panel">
      <div className="panelhead">
        <h2>玩法说明</h2>
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
        <li>单击空格：打一个白色 ×（表示这里不可能是小牛）。</li>
        <li>单击 ×：取消它。</li>
        <li>按住拖动：连续打 ×（从 × 开始拖就是连续取消）。</li>
        <li>双击格子：放一头小牛；单击已放的小牛：把它拿走。</li>
        <li>放下一头牛后，它所在的行、列、同色区域以及周围 8 格都会被自动排除。</li>
      </ul>
      <h3 className="subhead">常用推理方法</h3>
      <ol className="rules">
        <li>某行/列只剩一个候选格，或某颜色只剩一个候选格 → 直接放牛。</li>
        <li>某颜色的所有候选都在同一行/列内 → 该行/列其余格子排除。</li>
        <li>某行/列的候选都属于同一种颜色 → 该颜色在其它位置的格子排除。</li>
        <li>某行与某列的候选属于同一种颜色 → 交会点必是小牛。</li>
        <li>某颜色的候选只有相邻两三格 → 无论放哪都会被排除的公共格子先排除。</li>
        <li>k 个行/列的候选恰好落在 k 种颜色（或 k 个列/行）里 → 这些位置被用满，其余排除。</li>
        <li>排除法：假设某格是小牛会走到矛盾 → 该格排除（提示功能会用中文讲清楚每一步）。</li>
      </ol>
      <h3 className="subhead">关于本作</h3>
      <ul className="rules">
        <li>复刻自“数独 + 扫雷”玩法的《佛系消消消》，去掉了体力、广告和内购，提示不限次数。</li>
        <li>关卡在本地即时生成（唯一解、纯逻辑可解），难度从入门到地狱可调，可以无限玩下去。</li>
        <li>所有进度与成绩都存在浏览器本地，不上传任何数据。</li>
      </ul>
    </div>
  );
}
