import { useMemo, useState } from 'react';
import { TECHNIQUE_LABEL, type DifficultyFeatures, type Puzzle } from '../engine';
import { formatHintText } from '../game/theme';
import { formatTime, type GameApi, type GameReport, type Mark } from '../game/useGame';
import type { Settings } from '../game/storage';
import { PRESETS, type Preset } from '../engine/difficulty';
import { Board } from './Board';

export interface LevelConfig {
  difficulty: number;
  size: number | null;
}

interface Props {
  puzzle: Puzzle;
  api: GameApi;
  settings: Settings;
  level: number;
  mode: 'endless' | 'calibration';
  packId?: string;
  packHint?: string;
  packIndex?: number;
  packTotal?: number;
  config: LevelConfig;
  generating: boolean;
  lastReport: GameReport | null;
  onConfigChange: (c: LevelConfig) => void;
  onPreset: (p: Preset) => void;
  onNewLevel: () => void;
  onReplay: () => void;
  onRate: () => void;
  onSettings: (patch: Partial<Settings>) => void;
  onPrevPack?: () => void;
  onNextPack?: () => void;
  rated?: number;
}

export function PlayView(props: Props) {
  const { puzzle, api, settings, level, mode, config, generating } = props;
  const [showInfo, setShowInfo] = useState(false);
  const meta = puzzle.meta;

  const techniques = useMemo(() => {
    const entries = Object.entries(meta.metrics.techniqueCounts) as [keyof typeof TECHNIQUE_LABEL, number][];
    return entries.sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [meta.metrics.techniqueCounts]);

  const features = meta.features as DifficultyFeatures;

  return (
    <div className="play">
      {mode === 'calibration' && (
        <div className="packbar">
          <button className="ghost" onClick={props.onPrevPack} disabled={!props.onPrevPack}>
            ← 上一关
          </button>
          <div className="packtitle">
            标定关卡 <b>{props.packId}</b>（{props.packIndex! + 1}/{props.packTotal}）
            {props.rated ? <span className="rated-badge">已评 {props.rated}★</span> : null}
          </div>
          <button className="ghost" onClick={props.onNextPack} disabled={!props.onNextPack}>
            下一关 →
          </button>
        </div>
      )}
      {mode === 'calibration' && props.packHint && <div className="packhint">{props.packHint}</div>}

      <div className="hud">
        <div className="hud-left">
          {mode === 'endless' ? <span className="levelname">第 {level} 关</span> : <span className="levelname">标定 {props.packId}</span>}
          <span className="pill">{puzzle.n}×{puzzle.n}</span>
          <span className="pill soft">{meta.label} · {meta.score.toFixed(1)}</span>
        </div>
        <div className="hud-right">
          <span className="pill">🐮 剩余 {api.remaining}</span>
          <span className="pill">⏱ {formatTime(api.elapsedMs)}</span>
          <span className={'pill' + (api.mistakes > 0 ? ' warn' : '')}>❌ {api.mistakes}</span>
          <span className="pill soft">💡 {api.hints}</span>
        </div>
      </div>

      <div className="rulebar">
        <div className="rule">
          <div className="ruleicon">
            <b>×</b><b>×</b><b>×</b>
            <b>×</b><i>🐮</i><b>×</b>
            <b>×</b><b>×</b><b>×</b>
          </div>
          <span>每种颜色<br />只有 1 头小牛</span>
        </div>
        <div className="rule">
          <div className="ruleicon">
            <b>×</b><i>🐮</i><b>×</b>
            <b>×</b><b>×</b><b>×</b>
            <b>×</b><b>×</b><b>×</b>
          </div>
          <span>每行每列<br />有且仅有 1 头</span>
        </div>
        <div className="rule">
          <div className="ruleicon">
            <b>×</b><b>×</b><b>×</b>
            <b>×</b><i>🐮</i><b>×</b>
            <b>×</b><b>×</b><b>×</b>
          </div>
          <span>小牛不能<br />相邻（含斜角）</span>
        </div>
      </div>

      <div className="boardwrap">
        <Board
          n={puzzle.n}
          colors={puzzle.colors}
          marks={api.marks as Mark[]}
          colorBlind={settings.colorBlind}
          disabled={api.finished || generating}
          hintCells={api.hint?.cells ?? []}
          hintTargets={api.hint?.targets ?? []}
          wrongCells={api.wrongCells}
          onBeginStroke={api.beginStroke}
          onPaint={api.paint}
          onEndStroke={api.endStroke}
          onTapX={api.tapX}
          onCow={api.placeCow}
          onRemoveCow={api.removeCow}
        />
        {generating && <div className="boardmask">生成关卡中…</div>}
        {api.paused && !api.finished && <div className="boardmask">已暂停（点“继续”恢复计时）</div>}
        {api.finished && (
          <div className="winmask">
            <div className="winbox">
              <div className="wintitle">🎉 完成！</div>
              <div className="winrow">用时 <b>{formatTime(api.elapsedMs)}</b></div>
              <div className="winrow">错误 <b>{api.mistakes}</b> 次 · 提示 <b>{api.hints}</b> 次</div>
              <div className="winrow soft">本关生成难度 {meta.score.toFixed(1)}（{meta.label}）</div>
              <div className="winbtns">
                <button className="primary" onClick={props.onRate}>
                  给这关打分
                </button>
                <button onClick={props.onReplay}>重玩</button>
                {mode === 'endless' ? <button onClick={props.onNewLevel}>下一关</button> : null}
                {mode === 'calibration' && props.onNextPack ? <button onClick={props.onNextPack}>下一关</button> : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {api.hint && (
        <div className={'hintpanel' + (api.hint.conflict ? ' bad' : '')}>
          <div className="hinthead">
            {api.hint.conflict ? '⚠ 标记矛盾' : api.hint.deduction ? TECHNIQUE_LABEL[api.hint.deduction.technique] : '提示'}
            <button className="xbtn" onClick={api.clearHint}>✕</button>
          </div>
          <div className="hinttext">{formatHintText(api.hint.text)}</div>
        </div>
      )}

      <div className="controls">
        <button onClick={api.clearAll} title="清空所有标记">
          🗑 清除
        </button>
        <button onClick={api.undo} disabled={!api.canUndo}>
          ↩ 撤销
        </button>
        <button onClick={api.requestHint} disabled={api.hintLoading || api.finished}>
          💡 {api.hintLoading ? '思考中…' : '提示'}
        </button>
        <button className={settings.colorBlind ? 'active' : ''} onClick={() => props.onSettings({ colorBlind: !settings.colorBlind })}>
          👁 色盲
        </button>
        <button onClick={() => api.setPaused(!api.paused)} disabled={api.finished}>
          {api.paused ? '▶ 继续' : '⏸ 暂停'}
        </button>
        <button onClick={props.onReplay}>⟳ 重玩</button>
      </div>

      <div className="info-toggle">
        <button className="ghost" onClick={() => setShowInfo((v) => !v)}>
          {showInfo ? '收起关卡信息 ▲' : '查看关卡信息（生成难度指标） ▼'}
        </button>
      </div>
      {showInfo && (
        <div className="infocard">
          <div className="inforow">
            <span>尺寸</span>
            <b>{puzzle.n}×{puzzle.n}</b>
          </div>
          <div className="inforow">
            <span>生成难度分</span>
            <b>{meta.score.toFixed(2)} / 10（{meta.label}）</b>
          </div>
          {meta.target?.score !== undefined && (
            <div className="inforow">
              <span>本次生成目标</span>
              <b>
                {meta.target.score.toFixed(1)}
                {Math.abs(meta.target.score - meta.score) > 1.5
                  ? '（该尺寸下达不到，已给出最接近的关卡）'
                  : '（已贴近目标）'}
              </b>
            </div>
          )}
          <div className="inforow">
            <span>纯逻辑可解</span>
            <b>{meta.metrics.solvableByLogic ? '是（不需要试错）' : meta.metrics.needsRefutation ? '需要排除法/反证' : '否'}</b>
          </div>
          <div className="inforow">
            <span>逻辑推进 / 步数</span>
            <b>{(meta.metrics.logicProgress * 100).toFixed(0)}% / {meta.metrics.steps}</b>
          </div>
          <div className="inforow">
            <span>区域大小不均（基尼）</span>
            <b>{features.sizeGini.toFixed(2)}（越大线索越强）</b>
          </div>
          <div className="inforow">
            <span>小颜色占比（≤2 格）</span>
            <b>{(features.smallColorRatio * 100).toFixed(0)}%</b>
          </div>
          <div className="inforow">
            <span>颜色缠绕度</span>
            <b>{(features.winding * 100).toFixed(0)}%</b>
          </div>
          <div className="inforow">
            <span>被限制在一行/列的颜色</span>
            <b>{(features.lineConfinedColors * 100).toFixed(0)}%</b>
          </div>
          <div className="inforow">
            <span>用到的技术</span>
            <b>
              {techniques.length === 0
                ? '—'
                : techniques.map(([id, cnt]) => `${TECHNIQUE_LABEL[id]}×${cnt}`).join('，')}
            </b>
          </div>
          <div className="inforow">
            <span>关卡码（可复现）</span>
            <b className="mono">
              n{puzzle.n}-{puzzle.meta.seed.toString(36)}
            </b>
          </div>
        </div>
      )}

      <div className="difficultybar">
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={'preset' + (Math.abs(p.score - config.difficulty) < 0.35 && (config.size === null || config.size === p.n) ? ' active' : '')}
              title={p.desc}
              onClick={() => props.onPreset(p)}
            >
              {p.name}
              <small>{p.n}×{p.n}</small>
            </button>
          ))}
        </div>
        <div className="sliders">
          <label>
            目标难度 <b>{config.difficulty.toFixed(1)}</b>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={config.difficulty}
              onChange={(e) => props.onConfigChange({ ...config, difficulty: Number(e.target.value) })}
            />
          </label>
          <label>
            棋盘尺寸
            <select
              value={config.size ?? 'auto'}
              onChange={(e) => props.onConfigChange({ ...config, size: e.target.value === 'auto' ? null : Number(e.target.value) })}
            >
              <option value="auto">自动（跟难度）</option>
              {[5, 6, 7, 8, 9, 10, 11, 12, 13].map((v) => (
                <option key={v} value={v}>
                  {v}×{v}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={props.onNewLevel} disabled={generating}>
            换一关
          </button>
        </div>
      </div>

      <div className="setrow">
        <label className="chk">
          <input
            type="checkbox"
            checked={settings.strictMistakes}
            onChange={(e) => props.onSettings({ strictMistakes: e.target.checked })}
          />
          放错牛立刻提示并记错
        </label>
        <label className="chk">
          <input type="checkbox" checked={settings.showMetrics} onChange={(e) => props.onSettings({ showMetrics: e.target.checked })} />
          显示生成指标
        </label>
        <span className="tip">
          操作：单击打 ×／再单击取消；从格子拖动可连续打 ×；双击放小牛；单击小牛拿走。
        </span>
      </div>
    </div>
  );
}
