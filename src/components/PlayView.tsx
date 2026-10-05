import { useEffect, useState } from 'react';
import type { Puzzle } from '../engine';
import { difficultyLabel } from '../engine/difficulty';
import { formatHintText } from '../game/theme';
import { TECHNIQUE_LABEL } from '../engine/difficulty';
import { formatTime, type GameApi, type Mark } from '../game/useGame';
import { MODE_INFO, TIME_ATTACK_LEVELS, encodeLevelCode, unlockChallenge, type LevelSpec } from '../game/levels';
import type { Settings } from '../game/storage';
import { Board } from './Board';
import { Icon, Stars } from './Icon';
import { copyLink } from '../game/urlState';

interface Props {
  puzzle: Puzzle;
  api: GameApi;
  settings: Settings;
  spec: LevelSpec;
  generating: boolean;
  stars: number;
  isRecord: boolean;
  streak: number;
  bestMs: number | null;
  /** 限时挑战：已经完成的分关用时 */
  splits: number[];
  taTotalMs: number;
  onNext: () => void;
  onReplay: () => void;
  onExit: () => void;
  onSettings: (patch: Partial<Settings>) => void;
  onZenChange: (difficulty: number, size: number | null) => void;
  onImportCode: (code: string) => void;
  /** 解锁挑战：挑战成功后是否已解锁 */
  challenge: { level: number } | null;
  onChallengeRetry: () => void;
  onChallengeExit: () => void;
  challengedUnlocked: boolean;
}

export function PlayView(props: Props) {
  const { puzzle, api, settings, spec, generating, stars, isRecord, streak, bestMs, splits, taTotalMs } = props;
  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const meta = puzzle.meta;
  const info = MODE_INFO[spec.mode];

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const levelLabel =
    spec.mode === 'classic'
      ? `第 ${spec.level} 关`
      : spec.mode === 'timeattack'
        ? `限时挑战 ${spec.level}/${TIME_ATTACK_LEVELS}`
        : spec.mode === 'daily'
          ? `每日挑战`
          : spec.mode === 'zen'
            ? '禅模式'
            : '自定义关卡';

  const code = encodeLevelCode({ size: spec.size, difficulty: spec.difficulty, seed: spec.seed });

  const copy = async () => {
    const url = await copyLink(spec);
    void code;
    void url;
    setCopied(true);
    setLinkCopied(true);
  };

  const limits = props.challenge ? unlockChallenge(props.challenge.level) : null;
  const mistakesLeft = limits ? Math.max(0, limits.mistakeLimit - api.mistakes) : null;

  return (
    <div className="play">
      <div className="hud">
        <div className="hud-left">
          <span className="levelname">{levelLabel}</span>
          <span className="pill">
            {puzzle.n}×{puzzle.n}
          </span>
          <span className="pill soft">{difficultyLabel(meta.score)}</span>
          {streak > 1 && (
            <span className="pill soft">
              <Icon name="fire" /> 连胜 {streak}
            </span>
          )}
        </div>
        <div className="hud-right">
          <span className="pill">
            <span className="cow-emoji small">🐮</span> 剩余 {api.remaining}
          </span>
          {settings.showTimer && (
            <span className={'pill' + (api.remainingMs !== null && api.remainingMs < 30_000 ? ' warn' : '')}>
              <Icon name={api.remainingMs !== null ? 'hourglass' : 'clock'} />{' '}
              {api.remainingMs !== null ? formatTime(api.remainingMs) : formatTime(api.elapsedMs)}
              {!api.timerStarted && api.remainingMs === null ? '(待点击)' : ''}
            </span>
          )}
          <span className={'pill' + (api.mistakes > 0 ? ' warn' : '')}>
            <Icon name="close" /> {api.mistakes}
            {mistakesLeft !== null ? `/${limits!.mistakeLimit}` : ''}
          </span>
          <span className="pill soft">
            <Icon name="hint" /> {api.hints}
          </span>
          {spec.mode === 'timeattack' && (
            <span className="pill soft">
              总 {formatTime(taTotalMs)}
            </span>
          )}
        </div>
      </div>

      {props.challenge && (
        <div className="challengebar">
          <Icon name="lock" /> 解锁挑战：第 {props.challenge.level} 关 · 限时{' '}
          {Math.round((limits?.timeLimitMs ?? 0) / 1000)} 秒 · 错误上限 {limits?.mistakeLimit} 次
        </div>
      )}

      <div className="rulebar">
        <div className="rule">
          <div className="ruleicon">
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <i>🐮</i>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
          </div>
          <span>
            每种颜色
            <br />
            只有 1 头小牛
          </span>
        </div>
        <div className="rule">
          <div className="ruleicon">
            <b>×</b>
            <i>🐮</i>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
          </div>
          <span>
            每行每列
            <br />
            有且仅有 1 头
          </span>
        </div>
        <div className="rule">
          <div className="ruleicon">
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <i>🐮</i>
            <b>×</b>
            <b>×</b>
            <b>×</b>
            <b>×</b>
          </div>
          <span>
            小牛不能
            <br />
            相邻（含斜角）
          </span>
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
        {generating && (
          <div className="boardmask">
            <Icon name="hourglass" spin /> 正在生成关卡…
          </div>
        )}
        {api.paused && !api.finished && !api.failed && <div className="boardmask">已暂停</div>}
        {api.failed && (
          <div className="winmask">
            <div className="winbox">
              <div className="wintitle">
                <Icon name="close" /> 挑战失败
              </div>
              <div className="winrow">
                {api.failed === 'time' ? '时间用完了' : `错误次数超过了 ${limits?.mistakeLimit ?? ''} 次上限`}
              </div>
              <div className="winrow soft">通过的关卡不会解锁，可以再试一次</div>
              <div className="winbtns">
                <button className="primary" onClick={props.onChallengeRetry}>
                  <Icon name="restart" /> 再挑战一次
                </button>
                <button onClick={props.onChallengeExit}>返回关卡列表</button>
              </div>
            </div>
          </div>
        )}
        {api.finished && (
          <div className="winmask">
            <div className="winbox">
              <div className="wintitle">🎉 完成！</div>
              <div className="stars big">
                <Stars value={stars} />
              </div>
              {isRecord && <div className="recordbadge">新纪录！</div>}
              {props.challenge && props.challengedUnlocked && (
                <div className="recordbadge">
                  <Icon name="lock" /> 已解锁第 {props.challenge.level} 关
                </div>
              )}
              <div className="winrow">
                用时 <b>{formatTime(api.elapsedMs)}</b>
                {bestMs !== null && <span className="muted">（最好 {formatTime(bestMs)}）</span>}
              </div>
              <div className="winrow">
                错误 <b>{api.mistakes}</b> 次 · 提示 <b>{api.hints}</b> 次
              </div>
              <div className="winrow soft">
                本关设计难度 {meta.score.toFixed(1)}（{meta.label}）
              </div>
              <div className="winbtns">
                <button className="primary" onClick={props.onNext}>
                  {spec.mode === 'classic' ? '下一关' : spec.mode === 'timeattack' ? '继续挑战' : '再来一张'}
                </button>
                <button onClick={props.onReplay}>
                  <Icon name="restart" /> 重玩本关
                </button>
                <button onClick={props.onExit}>返回</button>
              </div>
              <div className="shareline">
                <Icon name="link" /> 关卡码 <code>{code}</code>
                <button className="ghost" onClick={copy}>
                  <Icon name={copied ? 'check' : 'share'} /> {copied ? '链接已复制' : '复制分享链接'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {api.hint && (
        <div className={'hintpanel' + (api.hint.conflict ? ' bad' : '')}>
          <div className="hinthead">
            {api.hint.conflict
              ? '⚠ 标记矛盾'
              : api.hint.deduction
                ? TECHNIQUE_LABEL[api.hint.deduction.technique]
                : '提示'}
            <button className="xbtn" onClick={api.clearHint}>
              <Icon name="close" />
            </button>
          </div>
          <div className="hinttext">{formatHintText(api.hint.text)}</div>
        </div>
      )}

      <div className="controls">
        <button onClick={api.clearAll} title="清空所有标记">
          <Icon name="clear" /> 清除
        </button>
        <button onClick={api.undo} disabled={!api.canUndo}>
          <Icon name="undo" /> 撤销
        </button>
        <button onClick={api.requestHint} disabled={api.hintLoading || api.finished}>
          <Icon name="hint" /> {api.hintLoading ? '思考中…' : '提示'}
        </button>
        <button className={settings.colorBlind ? 'active' : ''} onClick={() => props.onSettings({ colorBlind: !settings.colorBlind })}>
          <Icon name="eye" /> 色盲
        </button>
        <button onClick={() => api.setPaused(!api.paused)} disabled={api.finished}>
          <Icon name={api.paused ? 'resume' : 'pause'} /> {api.paused ? '继续' : '暂停'}
        </button>
        <button onClick={props.onReplay}>
          <Icon name="restart" /> 重玩
        </button>
        <button onClick={copy}>
          <Icon name={linkCopied ? 'check' : 'share'} /> {linkCopied ? '已复制' : '分享'}
        </button>
      </div>

      <div className="setrow">
        <span className="tip">
          单击打 ×／再单击取消 · 按住拖动可连续打 × · 双击放小牛 · 单击小牛拿走
        </span>
      </div>

      {spec.mode === 'zen' && (
        <div className="difficultybar">
          <div className="sliders">
            <label>
              难度 <b>{spec.difficulty.toFixed(1)}</b>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={spec.difficulty}
                onChange={(e) => props.onZenChange(Number(e.target.value), spec.size)}
              />
            </label>
            <label>
              棋盘
              <select
                value={spec.size ?? 'auto'}
                onChange={(e) => props.onZenChange(spec.difficulty, e.target.value === 'auto' ? null : Number(e.target.value))}
              >
                <option value="auto">自动</option>
                {[5, 6, 7, 8, 9, 10, 11, 12, 13].map((v) => (
                  <option key={v} value={v}>
                    {v}×{v}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" onClick={props.onNext} disabled={generating}>
              <Icon name="restart" /> 换一张
            </button>
          </div>
        </div>
      )}

      {spec.mode === 'custom' && (
        <div className="difficultybar">
          <div className="shareline">
            本关代码 <code>{code}</code>
            <button className="ghost" onClick={copy}>
              {copied ? '已复制 ✓' : '复制'}
            </button>
          </div>
          <div className="sliders">
            <input
              className="codeinput"
              placeholder="粘贴关卡码，例如 FOXI1-9-a-1y4y1"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
            />
            <button onClick={() => props.onImportCode(codeInput)} disabled={!codeInput.trim()}>
              导入
            </button>
          </div>
        </div>
      )}

      {spec.mode === 'timeattack' && splits.length > 0 && (
        <div className="splits">
          {splits.map((t, i) => (
            <span key={i} className="pill soft">
              第{i + 1}关 {formatTime(t)}
            </span>
          ))}
        </div>
      )}

      <div className="setrow">
        <span className="tip">
          {info.icon} {info.name}：{info.desc}
        </span>
      </div>
    </div>
  );
}
