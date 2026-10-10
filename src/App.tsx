import { useCallback, useEffect, useRef, useState } from 'react';
import type { Puzzle } from './engine';
import { formatTime, useGame, type GameReport } from './game/useGame';
import { generateAsync } from './game/generateAsync';
import {
  MODE_INFO,
  TIME_ATTACK_LEVELS,
  specForClassic,
  specForCustom,
  specForDaily,
  specForTimeAttack,
  specForZen,
  unlockChallenge,
  type LevelSpec,
} from './game/levels';
import { buildUrl, parseLevelInput, specFromUrl } from './game/urlState';
import { encodeLevelCode } from './game/levels';
import {
  DEFAULT_META,
  DEFAULT_PROGRESS,
  clearAll,
  loadMeta,
  loadProgress,
  loadRecords,
  loadSettings,
  mergeRecord,
  recordIdFor,
  saveMeta,
  saveProgress,
  saveRecords,
  saveSettings,
  starsFor,
  type GameMode,
  type LevelRecord,
  type MetaState,
  type Progress,
  type Settings,
} from './game/storage';
import { PlayView } from './components/PlayView';
import { LevelSelect } from './components/LevelSelect';
import { RecordsPanel } from './components/RecordsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { RulesPanel } from './components/RulesPanel';
import { Home } from './components/Home';
import { Icon } from './components/Icon';

type Screen = 'home' | 'play' | 'modes' | 'levels' | 'records' | 'settings' | 'rules';

interface ChallengeState {
  level: number;
  timeLimitMs: number;
  mistakeLimit: number;
  unlocked: boolean;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [meta, setMeta] = useState<MetaState>(() => loadMeta());
  const [records, setRecords] = useState<Record<string, LevelRecord>>(() => loadRecords());
  const [screen, setScreen] = useState<Screen>('home');
  const [spec, setSpec] = useState<LevelSpec | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastReport, setLastReport] = useState<GameReport | null>(null);
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [taRunSeed, setTaRunSeed] = useState(() => Date.now() >>> 0);
  const [splits, setSplits] = useState<number[]>([]);
  const [taTotalMs, setTaTotalMs] = useState(0);
  const [taSummary, setTaSummary] = useState<{ totalMs: number; splits: number[]; isBest: boolean } | null>(null);
  const [pendingChallengeLevel, setPendingChallengeLevel] = useState<number | null>(null);
  const genToken = useRef(0);
  /** 限时挑战的累计分段：用 ref 同步累加，避免 state 时序问题 */
  const splitsRef = useRef<number[]>([]);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveMeta(meta), [meta]);
  useEffect(() => saveRecords(records), [records]);

  // 主题（跟随系统 / 浅色 / 深色）
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [settings.theme]);

  const loadSpec = useCallback(
    (next: LevelSpec, opts: { keepSplits?: boolean; challenge?: ChallengeState | null } = {}) => {
      const token = ++genToken.current;
      setSpec(next);
      setScreen('play');
      setGenerating(true);
      setLastReport(null);
      setChallenge(opts.challenge ?? null);
      if (!opts.keepSplits) {
        setSplits([]);
        setTaTotalMs(0);
        if (next.mode === 'timeattack') splitsRef.current = [];
      }
      void generateAsync(next).then((p) => {
        if (genToken.current !== token) return;
        setPuzzle(p);
        setGenerating(false);
      });
    },
    [],
  );

  // 启动时读取 URL 参数：分享链接可以直接打开对应关卡
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const parsed = specFromUrl(window.location.search);
    if (!parsed) return;
    // 从分享链接进来：直接打开对应关卡，不再拦截“解锁挑战”
    loadSpec(parsed.spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL 跟随当前关卡，随时可以一键复制分享
  useEffect(() => {
    if (!spec || screen !== 'play') return;
    window.history.replaceState(null, '', buildUrl(spec));
  }, [spec, screen]);

  const recordKey = spec && puzzle ? (spec.mode === 'classic' ? `classic:${spec.level}` : recordIdFor(spec.mode, spec.level, spec.seed, puzzle.n)) : '';
  const record = recordKey ? records[recordKey] : undefined;

  const onFinish = useCallback(
    (report: GameReport) => {
      if (!spec || !puzzle) return;
      setLastReport(report);
      if (spec.mode === 'timeattack') {
        splitsRef.current = [...splitsRef.current, report.timeMs];
        setSplits(splitsRef.current);
        setTaTotalMs(splitsRef.current.reduce((a, b) => a + b, 0));
        // 第 5 关一完成就地结算并存档（不等用户点按钮，避免“没保存”）
        if (spec.level >= TIME_ATTACK_LEVELS) {
          const done = splitsRef.current;
          const total = done.reduce((a, b) => a + b, 0);
          const isBest = meta.bestTimeAttackMs === null || total < meta.bestTimeAttackMs;
          setMeta((prev) => {
            const history = [{ totalMs: total, splits: done, at: Date.now() }, ...(prev.timeAttackHistory ?? [])].slice(0, 5);
            return {
              ...prev,
              timeAttackHistory: history,
              bestTimeAttackMs: prev.bestTimeAttackMs === null || total < prev.bestTimeAttackMs ? total : prev.bestTimeAttackMs,
              bestTimeAttackSplits:
                prev.bestTimeAttackMs === null || total < prev.bestTimeAttackMs ? done : prev.bestTimeAttackSplits,
            };
          });
          setTaSummary({ totalMs: total, splits: done, isBest });
        }
      }
      const stars = starsFor(report.mistakes, report.hints);
      setRecords((prev) =>
        mergeRecord(prev, {
          key: recordKey,
          mode: spec.mode,
          level: spec.level,
          n: puzzle.n,
          seed: spec.seed,
          difficulty: spec.difficulty,
          score: puzzle.meta.score,
          cleared: true,
          stars,
          timeMs: report.timeMs,
          mistakes: report.mistakes,
          hints: report.hints,
          attempts: 1,
          updatedAt: Date.now(),
        }),
      );
      setMeta((prev) => {
        const next: MetaState = {
          ...prev,
          totalCleared: prev.totalCleared + 1,
          totalStars: prev.totalStars + stars,
          streak: prev.streak + 1,
          bestStreak: Math.max(prev.bestStreak, prev.streak + 1),
          noMistakeClears: prev.noMistakeClears + (report.mistakes === 0 ? 1 : 0),
          totalTimeMs: prev.totalTimeMs + report.timeMs,
        };
        if (spec.mode === 'daily') {
          const dayKey = spec.code ?? String(spec.level);
          next.dailyDone = { ...prev.dailyDone, [dayKey]: stars };
        }
        return next;
      });
      if (spec.mode === 'classic') {
        if (challenge && challenge.level === spec.level) {
          setChallenge((c) => (c ? { ...c, unlocked: true } : c));
          setProgress((p) => (spec.level >= p.classicLevel ? { ...p, classicLevel: spec.level + 1 } : p));
        } else {
          setProgress((p) => (spec.level >= p.classicLevel ? { ...p, classicLevel: p.classicLevel + 1 } : p));
        }
      }
    },
    [spec, puzzle, recordKey, challenge, meta.bestTimeAttackMs],
  );

  const startMode = (mode: GameMode) => {
    setProgress((p) => ({ ...p, mode }));
    setChallenge(null);
    if (mode === 'classic') loadSpec(specForClassic(progress.classicLevel));
    else if (mode === 'daily') loadSpec(specForDaily());
    else if (mode === 'timeattack') {
      const seed = Date.now() >>> 0;
      setTaRunSeed(seed);
      splitsRef.current = [];
      setTaSummary(null);
      loadSpec(specForTimeAttack(0, seed));
    } else if (mode === 'zen') loadSpec(specForZen(progress.customDifficulty, progress.customSize, Date.now()));
    else loadSpec(specForCustom(progress.customDifficulty, progress.customSize, (Date.now() >>> 0) % 0xffffff));
  };

  const nextLevel = () => {
    if (!spec) return;
    if (spec.mode === 'classic') {
      if (challenge) {
        setChallenge(null);
        setScreen('levels');
        return;
      }
      loadSpec(specForClassic(Math.max(progress.classicLevel, spec.level + 1)));
    } else if (spec.mode === 'timeattack') {
      if (spec.level >= TIME_ATTACK_LEVELS) {
        // 已经结算过了，直接回首页（成绩在 onFinish 里就存好了）
        setTaSummary(null);
        setScreen('home');
      } else {
        loadSpec(specForTimeAttack(spec.level, taRunSeed), { keepSplits: true });
      }
    } else if (spec.mode === 'daily') setScreen('home');
    else if (spec.mode === 'zen') loadSpec(specForZen(spec.difficulty, spec.size, Date.now()));
    else loadSpec(specForCustom(spec.difficulty, spec.size, (Date.now() >>> 0) % 0xffffff));
  };

  const inGame = spec !== null && puzzle !== null;
  /** 还没打完的一局（用于「继续对局」入口） */
  const inProgress = inGame && lastReport === null;
  const playing = screen === 'play' && inGame;
  const stars = lastReport ? starsFor(lastReport.mistakes, lastReport.hints) : 0;
  const isRecord = !!(lastReport && record?.cleared && lastReport.timeMs < record.timeMs);

  // 打完一局后离开对局页 = 这局结束了，不用再挂着「继续对局」
  useEffect(() => {
    if (screen !== 'play' && lastReport) {
      setSpec(null);
      setPuzzle(null);
      setLastReport(null);
    }
  }, [screen, lastReport]);

  return (
    <div className="app">
      <nav className="tabs">
        <button className={screen === 'home' ? 'tab active' : 'tab'} onClick={() => setScreen('home')}>
          <Icon name="home" /> 首页
        </button>
        <button className={screen === 'modes' ? 'tab active' : 'tab'} onClick={() => setScreen('modes')}>
          <Icon name="grid" /> 模式
        </button>
        <button className={screen === 'levels' ? 'tab active' : 'tab'} onClick={() => setScreen('levels')}>
          <Icon name="trophy" /> 关卡
        </button>
        <button className={screen === 'records' ? 'tab active' : 'tab'} onClick={() => setScreen('records')}>
          <Icon name="chart" /> 成绩
        </button>
        <button className={screen === 'settings' ? 'tab active' : 'tab'} onClick={() => setScreen('settings')}>
          <Icon name="gear" /> 设置
        </button>
        <button className={screen === 'rules' ? 'tab active' : 'tab'} onClick={() => setScreen('rules')}>
          <Icon name="info" /> 规则玩法
        </button>
        {inProgress && !playing && (
          <button className="tab resume" onClick={() => setScreen('play')}>
            <Icon name="play" /> 继续对局
          </button>
        )}
        <span className="brand">佛系消消消 · 纯净版</span>
      </nav>

      {screen === 'home' && (
        <Home
          progress={progress}
          meta={meta}
          dailyStars={meta.dailyDone[specForDaily().code ?? '']}
          onContinue={() => startMode('classic')}
          onMode={startMode}
          onLevels={() => setScreen('levels')}
          onRecords={() => setScreen('records')}
          onSettings={() => setScreen('settings')}
          onRules={() => setScreen('rules')}
          inGame={inProgress}
          onResume={() => setScreen('play')}
        />
      )}

      {inGame && (
        <div className="playscreen" style={{ display: screen === 'play' ? undefined : 'none' }}>
        <GameScreen
          active={screen === 'play'}
          key={`${spec!.mode}:${spec!.level}:${spec!.seed}:${challenge ? 'c' : 'n'}`}
          spec={spec!}
          puzzle={puzzle!}
          settings={settings}
          generating={generating}
          stars={stars}
          isRecord={isRecord}
          streak={meta.streak}
          bestMs={record?.cleared ? record.timeMs : null}
          splits={splits}
          taTotalMs={taTotalMs}
          challenge={challenge}
          onFinish={onFinish}
          onNext={nextLevel}
          onReplay={() => {
            if (spec!.mode === 'timeattack') {
              if (splitsRef.current.length > 0 && !confirm('放弃本轮限时挑战？本轮成绩不会记录。')) return;
              splitsRef.current = [];
              setSplits([]);
              setTaTotalMs(0);
              const seed = Date.now() >>> 0;
              setTaRunSeed(seed);
              loadSpec(specForTimeAttack(0, seed));
              return;
            }
            loadSpec(spec!, { challenge });
          }}
          onExit={() => {
            if (spec!.mode === 'timeattack' && splitsRef.current.length > 0) {
              if (!confirm('离开将放弃本轮限时挑战，确定吗？')) return;
              splitsRef.current = [];
              setSplits([]);
              setTaTotalMs(0);
            }
            // 退出即结束本局（否则“继续对局”会一直挂着）
            setSpec(null);
            setPuzzle(null);
            setScreen(challenge ? 'levels' : 'home');
          }}
          onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          onZenChange={(difficulty, size) => {
            setProgress((p) => ({ ...p, customDifficulty: difficulty, customSize: size }));
            loadSpec(specForZen(difficulty, size, Date.now()));
          }}
          onImportCode={(code) => {
            const parsed = parseLevelInput(code);
            if (!parsed) {
              alert('认不出这个关卡码 / 链接，检查一下是不是复制完整了');
              return;
            }
            if (parsed.mode === 'custom' || parsed.mode === 'zen') {
              setProgress((p) => ({ ...p, customDifficulty: parsed.difficulty, customSize: parsed.size }));
            }
            loadSpec(parsed);
          }}
        />
        </div>
      )}

      {screen === 'modes' && (
        <div className="panel">
          <div className="panelhead">
            <h2>选择模式</h2>
            <span className="muted">进度与成绩都会自动保存在本地</span>
          </div>
          <div className="modegrid">
            {(Object.keys(MODE_INFO) as GameMode[]).map((m) => (
              <button key={m} className={'modecard' + (progress.mode === m ? ' current' : '')} onClick={() => startMode(m)}>
                <div className="modetop">
                  <span className="modeicon">
                    <Icon
                      name={
                        m === 'classic'
                          ? 'trophy'
                          : m === 'daily'
                            ? 'calendar'
                            : m === 'timeattack'
                              ? 'stopwatch'
                              : m === 'zen'
                                ? 'leaf'
                                : 'sliders'
                      }
                      size="lg"
                    />
                  </span>
                  <b>{MODE_INFO[m].name}</b>
                  {m === 'classic' && <span className="pill soft">第 {progress.classicLevel} 关</span>}
                  {m === 'daily' && (
                    <span className="pill soft">{meta.dailyDone[specForDaily().code ?? ''] ? '今日已完成' : '今日未完成'}</span>
                  )}
                </div>
                <div className="modecarddesc">{MODE_INFO[m].desc}</div>
                {m === 'timeattack' && meta.bestTimeAttackMs !== null && (
                  <div className="modecarddesc">最好成绩 {(meta.bestTimeAttackMs / 1000).toFixed(1)} 秒</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === 'levels' && (
        <LevelSelect
          unlocked={progress.classicLevel}
          records={records}
          initialPending={pendingChallengeLevel}
          onPick={(level) => loadSpec(specForClassic(level))}
          onChallenge={(level) => {
            setPendingChallengeLevel(null);
            const c = unlockChallenge(level);
            loadSpec(specForClassic(level), { challenge: { level, ...c, unlocked: false } });
          }}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'records' && (
        <RecordsPanel
          records={records}
          meta={meta}
          onBack={() => setScreen('home')}
          onClear={() => {
            clearAll();
            setRecords({});
            setMeta(DEFAULT_META);
            setProgress(DEFAULT_PROGRESS);
            setScreen('home');
          }}
        />
      )}
      {screen === 'settings' && (
        <SettingsPanel settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} onBack={() => setScreen('home')} />
      )}
      {screen === 'rules' && <RulesPanel onBack={() => setScreen('home')} />}

      {taSummary && (
        <div className="modal-backdrop" onClick={() => setTaSummary(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <Icon name="stopwatch" /> {TIME_ATTACK_LEVELS} 连闯完成
            </h3>
            <div className="sub">
              成绩已自动保存。{taSummary.isBest ? '这是你的新纪录！' : '继续加油，可以再挑战一轮。'}
            </div>
            <div className="talist">
              {taSummary.splits.map((t, i) => (
                <div key={i} className="tarow">
                  <span>
                    第 {i + 1} 关
                  </span>
                  <b>{formatTime(t)}</b>
                </div>
              ))}
              <div className="tarow total">
                <span>总用时</span>
                <b>{formatTime(taSummary.totalMs)}</b>
              </div>
            </div>
            {meta.bestTimeAttackMs !== null && (
              <div className="footnote">
                历史最佳 {formatTime(meta.bestTimeAttackMs)}
                {meta.bestTimeAttackSplits?.length ? `（${meta.bestTimeAttackSplits.map((t) => formatTime(t)).join(' / ')}）` : ''}
              </div>
            )}
            <div className="modalbtns">
              <button onClick={() => setScreen('records')}>
                <Icon name="chart" /> 查看成绩
              </button>
              <button onClick={() => setTaSummary(null)}>关闭</button>
              <button
                className="primary"
                onClick={() => {
                  setTaSummary(null);
                  startMode('timeattack');
                }}
              >
                <Icon name="restart" /> 再挑战一轮
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        {spec && puzzle ? (
          <span>
            关卡码 <code className="mono">{encodeLevelCode({ size: spec.size, difficulty: spec.difficulty, seed: spec.seed })}</code> ·{' '}
            {puzzle.n}×{puzzle.n} · 设计难度{' '}
            {puzzle.meta.score.toFixed(1)}（{puzzle.meta.label}）
          </span>
        ) : (
          <span>关卡由浏览器本地生成 · 不需要联网</span>
        )}
        <span className="tip">无限畅玩 · 无体力无广告 · 提示不限次数</span>
      </footer>
    </div>
  );
}

/**
 * 游戏层：只有真正在玩的时候才挂载，
 * 这样首页/面板不会带着计时和棋盘状态。
 */
function GameScreen(props: {
  /** 是否正停留在对局页（切到规则/首页时置 false，会自动暂停计时） */
  active: boolean;
  spec: LevelSpec;
  puzzle: Puzzle;
  settings: Settings;
  generating: boolean;
  stars: number;
  isRecord: boolean;
  streak: number;
  bestMs: number | null;
  splits: number[];
  taTotalMs: number;
  challenge: ChallengeState | null;
  onFinish: (report: GameReport) => void;
  onNext: () => void;
  onReplay: () => void;
  onExit: () => void;
  onSettings: (patch: Partial<Settings>) => void;
  onZenChange: (difficulty: number, size: number | null) => void;
  onImportCode: (code: string) => void;
}) {
  const api = useGame(props.puzzle, {
    strictMistakes: props.settings.strictMistakes,
    sound: props.settings.sound,
    autoExclude: props.settings.autoExclude,
    timeLimitMs: props.challenge?.timeLimitMs,
    mistakeLimit: props.challenge?.mistakeLimit,
    onFinish: props.onFinish,
  });

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__foxi = {
        puzzle: props.puzzle,
        api,
        spec: props.spec,
        challenge: props.challenge,
        solution: props.puzzle.solution,
      };
    }
  });

  // 离开对局页（例如去看规则）时自动暂停，回来点“继续”即可接着玩
  useEffect(() => {
    if (!props.active) api.setPaused(true);
  }, [props.active, api.setPaused]);

  return (
    <PlayView
      puzzle={props.puzzle}
      api={api}
      settings={props.settings}
      spec={props.spec}
      generating={props.generating}
      stars={props.stars}
      isRecord={props.isRecord}
      streak={props.streak}
      bestMs={props.bestMs}
      splits={props.splits}
      taTotalMs={props.taTotalMs}
      challenge={props.challenge}
      challengedUnlocked={!!props.challenge?.unlocked}
      onChallengeRetry={props.onReplay}
      onChallengeExit={props.onExit}
      onNext={props.onNext}
      onReplay={props.onReplay}
      onExit={props.onExit}
      onSettings={props.onSettings}
      onZenChange={props.onZenChange}
      onImportCode={props.onImportCode}
    />
  );
}
