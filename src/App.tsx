import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Puzzle } from './engine';
import { useGame, type GameReport } from './game/useGame';
import { generateAsync } from './game/generateAsync';
import {
  MODE_INFO,
  TIME_ATTACK_LEVELS,
  buildPuzzle,
  decodeLevelCode,
  encodeLevelCode,
  specForClassic,
  specForCustom,
  specForDaily,
  specForTimeAttack,
  specForZen,
  type LevelSpec,
} from './game/levels';
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

type Screen = 'play' | 'modes' | 'levels' | 'records' | 'settings' | 'rules';

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [meta, setMeta] = useState<MetaState>(() => loadMeta());
  const [records, setRecords] = useState<Record<string, LevelRecord>>(() => loadRecords());
  const [screen, setScreen] = useState<Screen>('play');
  const [spec, setSpec] = useState<LevelSpec>(() => specForClassic(loadProgress().classicLevel));
  const [puzzle, setPuzzle] = useState<Puzzle>(() => buildPuzzle(specForClassic(loadProgress().classicLevel)));
  const [generating, setGenerating] = useState(false);
  const [lastReport, setLastReport] = useState<GameReport | null>(null);
  const [taRunSeed, setTaRunSeed] = useState(() => Date.now() >>> 0);
  const [splits, setSplits] = useState<number[]>([]);
  const [taTotalMs, setTaTotalMs] = useState(0);
  const genToken = useRef(0);
  const pendingSpec = useRef<LevelSpec | null>(null);

  // 持久化
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveMeta(meta), [meta]);
  useEffect(() => saveRecords(records), [records]);

  // 主题
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

  const loadSpec = useCallback((next: LevelSpec, opts: { keepTime?: boolean } = {}) => {
    const token = ++genToken.current;
    setSpec(next);
    setGenerating(true);
    setLastReport(null);
    if (!opts.keepTime) {
      setSplits([]);
      setTaTotalMs(0);
    }
    void generateAsync(next).then((p) => {
      if (genToken.current !== token) return;
      setPuzzle(p);
      setGenerating(false);
    });
  }, []);

  const currentKey = recordIdFor(spec.mode, spec.level, spec.seed, puzzle.n);
  const recordKey = spec.mode === 'classic' ? `classic:${spec.level}` : currentKey;
  const record = records[recordKey];

  const onFinish = useCallback(
    (report: GameReport) => {
      setLastReport(report);

      // 限时挑战：累计分关时间
      if (spec.mode === 'timeattack') {
        const nextSplits = [...splits, report.timeMs];
        setSplits(nextSplits);
        setTaTotalMs((t) => t + report.timeMs);
      }

      const stars = starsFor(report.mistakes, report.hints);
      const rec: LevelRecord = {
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
      };
      setRecords((prev) => mergeRecord(prev, rec));
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
      // 经典模式推进解锁
      if (spec.mode === 'classic' && spec.level >= progress.classicLevel) {
        setProgress((p) => ({ ...p, classicLevel: p.classicLevel + 1 }));
      }
    },
    [spec, splits, recordKey, puzzle.n, puzzle.meta.score, progress.classicLevel],
  );

  const api = useGame(puzzle, { strictMistakes: settings.strictMistakes, sound: settings.sound, onFinish });

  // 开发期脚本钩子（正式构建不包含）
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__foxi = { puzzle, api, spec, solution: puzzle.solution };
    }
  });

  const startMode = (mode: GameMode) => {
    setProgress((p) => ({ ...p, mode }));
    pendingSpec.current = null;
    if (mode === 'classic') loadSpec(specForClassic(progress.classicLevel));
    else if (mode === 'daily') loadSpec(specForDaily());
    else if (mode === 'timeattack') {
      const seed = Date.now() >>> 0;
      setTaRunSeed(seed);
      loadSpec(specForTimeAttack(0, seed));
    } else if (mode === 'zen') loadSpec(specForZen(progress.customDifficulty, progress.customSize, Date.now()));
    else loadSpec(specForCustom(progress.customDifficulty, progress.customSize, (Date.now() >>> 0) % 0xffffff));
    setScreen('play');
  };

  const nextLevel = () => {
    if (spec.mode === 'classic') {
      const next = Math.max(progress.classicLevel, spec.level + 1);
      loadSpec(specForClassic(next));
    } else if (spec.mode === 'timeattack') {
      const idx = spec.level;
      if (idx >= TIME_ATTACK_LEVELS) {
        // 一轮结束：结算
        const total = splits.reduce((a, b) => a + b, 0);
        setMeta((prev) => {
          const better = prev.bestTimeAttackMs === null || total < prev.bestTimeAttackMs;
          return better ? { ...prev, bestTimeAttackMs: total, bestTimeAttackSplits: splits } : prev;
        });
        alert(`5 连闯完成！总用时 ${(total / 1000).toFixed(1)} 秒`);
        setScreen('modes');
      } else {
        loadSpec(specForTimeAttack(idx, taRunSeed), { keepTime: true });
      }
    } else if (spec.mode === 'daily') {
      setScreen('modes');
    } else if (spec.mode === 'zen') {
      loadSpec(specForZen(spec.difficulty, spec.size, Date.now()));
    } else {
      loadSpec(specForCustom(spec.difficulty, spec.size, (Date.now() >>> 0) % 0xffffff));
    }
  };

  const isRecord = useMemo(() => {
    if (!lastReport || !record) return false;
    return lastReport.timeMs < record.timeMs && record.cleared;
  }, [lastReport, record]);

  const stars = lastReport ? starsFor(lastReport.mistakes, lastReport.hints) : 0;

  const codeFor = (s: LevelSpec) => encodeLevelCode({ size: s.size, difficulty: s.difficulty, seed: s.seed });

  return (
    <div className="app">
      <nav className="tabs">
        <button className={screen === 'play' ? 'tab active' : 'tab'} onClick={() => setScreen('play')}>
          {MODE_INFO[spec.mode].icon} {MODE_INFO[spec.mode].name}
        </button>
        <button className={screen === 'modes' ? 'tab active' : 'tab'} onClick={() => setScreen('modes')}>
          模式
        </button>
        <button className={screen === 'levels' ? 'tab active' : 'tab'} onClick={() => setScreen('levels')}>
          关卡
        </button>
        <button className={screen === 'records' ? 'tab active' : 'tab'} onClick={() => setScreen('records')}>
          成绩
        </button>
        <button className={screen === 'settings' ? 'tab active' : 'tab'} onClick={() => setScreen('settings')}>
          设置
        </button>
        <button className={screen === 'rules' ? 'tab active' : 'tab'} onClick={() => setScreen('rules')}>
          规则
        </button>
        <span className="brand">佛系消消消 · 纯净版</span>
      </nav>

      {screen === 'play' && (
        <PlayView
          puzzle={puzzle}
          api={api}
          settings={settings}
          spec={spec}
          generating={generating}
          stars={stars}
          isRecord={isRecord}
          streak={meta.streak}
          bestMs={record?.cleared ? record.timeMs : null}
          splits={splits}
          taTotalMs={taTotalMs}
          onNext={nextLevel}
          onReplay={() => loadSpec(spec)}
          onExit={() => setScreen('modes')}
          onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          onZenChange={(difficulty, size) => {
            setProgress((p) => ({ ...p, customDifficulty: difficulty, customSize: size }));
            loadSpec(specForZen(difficulty, size, Date.now()));
          }}
          onImportCode={(code) => {
            const decoded = decodeLevelCode(code);
            if (!decoded) {
              alert('关卡码无法识别，检查一下是不是复制完整了');
              return;
            }
            setProgress((p) => ({ ...p, customDifficulty: decoded.difficulty, customSize: decoded.size }));
            loadSpec(specForCustom(decoded.difficulty, decoded.size, decoded.seed));
          }}
        />
      )}

      {screen === 'modes' && (
        <div className="panel">
          <div className="panelhead">
            <h2>选择模式</h2>
            <span className="muted">进度与成绩都会自动保存在本地</span>
          </div>
          <div className="modegrid">
            {(Object.keys(MODE_INFO) as GameMode[]).map((m) => (
              <button key={m} className={'modecard' + (spec.mode === m ? ' current' : '')} onClick={() => startMode(m)}>
                <div className="modetop">
                  <span className="modeicon">{MODE_INFO[m].icon}</span>
                  <b>{MODE_INFO[m].name}</b>
                  {m === 'classic' && <span className="pill soft">第 {progress.classicLevel} 关</span>}
                  {m === 'daily' && (
                    <span className="pill soft">
                      {meta.dailyDone[specForDaily().code ?? ''] ? '今日已完成' : '今日未完成'}
                    </span>
                  )}
                </div>
                <div className="modecarddesc">{MODE_INFO[m].desc}</div>
                {m === 'timeattack' && meta.bestTimeAttackMs && (
                  <div className="modecarddesc">最好成绩 {(meta.bestTimeAttackMs / 1000).toFixed(1)} 秒</div>
                )}
              </button>
            ))}
          </div>
          <div className="footnote">经典闯关会一关关解锁；禅模式与自定义可以随时调难度和尺寸。</div>
        </div>
      )}

      {screen === 'levels' && (
        <LevelSelect
          unlocked={progress.classicLevel}
          records={records}
          onPick={(level) => {
            loadSpec(specForClassic(level));
            setScreen('play');
          }}
          onBack={() => setScreen('play')}
        />
      )}

      {screen === 'records' && (
        <RecordsPanel
          records={records}
          meta={meta}
          onBack={() => setScreen('play')}
          onClear={() => {
            clearAll();
            setRecords({});
            setMeta(DEFAULT_META);
            setProgress(DEFAULT_PROGRESS);
            setScreen('modes');
          }}
        />
      )}
      {screen === 'settings' && (
        <SettingsPanel settings={settings} onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))} onBack={() => setScreen('play')} />
      )}
      {screen === 'rules' && <RulesPanel onBack={() => setScreen('play')} />}

      <footer className="footer">
        <span>
          关卡码 <code className="mono">{codeFor(spec)}</code> · {puzzle.n}×{puzzle.n} · 设计难度 {puzzle.meta.score.toFixed(1)}（
          {puzzle.meta.label}）
        </span>
        <span className="tip">无限畅玩 · 无体力无广告 · 提示不限次数</span>
      </footer>
    </div>
  );
}
