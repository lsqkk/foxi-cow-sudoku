import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generatePuzzle, type Puzzle } from './engine';
import { profileForScore, type Preset } from './engine/difficulty';
import { useGame, type GameReport } from './game/useGame';
import {
  clearSessions,
  loadProgress,
  loadSessions,
  loadSettings,
  saveProgress,
  saveSettings,
  upsertSession,
  type Progress,
  type SessionRecord,
  type Settings,
} from './game/storage';
import { CALIBRATION_PACK } from './game/calibration';
import { PlayView, type LevelConfig } from './components/PlayView';
import { CalibrationPanel, RatingDialog, RulesPanel, StatsPanel } from './components/Panels';

type Tab = 'play' | 'calibration' | 'stats' | 'rules';

/** 生成一关（纯函数，便于在初次渲染时同步生成第一关） */
function makePuzzle(mode: 'endless' | 'calibration', level: number, config: LevelConfig, packIndex: number | null): Puzzle {
  if (mode === 'calibration' && packIndex !== null) {
    const pack = CALIBRATION_PACK[packIndex];
    const profile = profileForScore(pack.difficulty, pack.n);
    return generatePuzzle({
      n: pack.n,
      style: profile.style,
      seed: pack.seed,
      target: profile.target,
      nodeLimit: 120_000,
    });
  }
  const profile = profileForScore(config.difficulty, config.size ?? undefined);
  const seed = (Math.floor(config.difficulty * 100) * 7919 + level * 104729 + (config.size ?? 0) * 31) >>> 0;
  return generatePuzzle({
    n: profile.n,
    style: profile.style,
    seed,
    target: profile.target,
    nodeLimit: 120_000,
  });
}

export default function App() {
  const initialProgress = useMemo(() => loadProgress(), []);
  const [tab, setTab] = useState<Tab>('play');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [sessions, setSessions] = useState<SessionRecord[]>(() => loadSessions());
  const [config, setConfig] = useState<LevelConfig>({ difficulty: progress.difficulty, size: progress.size });
  const [mode, setMode] = useState<'endless' | 'calibration'>('endless');
  const [packIndex, setPackIndex] = useState<number | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle>(() =>
    makePuzzle('endless', initialProgress.level, { difficulty: initialProgress.difficulty, size: initialProgress.size }, null),
  );
  const [generating, setGenerating] = useState(false);
  const [lastReport, setLastReport] = useState<GameReport | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const genToken = useRef(0);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveProgress({ ...progress, difficulty: config.difficulty, size: config.size }), [config, progress]);

  const buildPuzzle = useCallback(
    (opts: { mode: 'endless' | 'calibration'; level: number; config: LevelConfig; packIndex: number | null }) => {
      const token = ++genToken.current;
      setGenerating(true);
      setLastReport(null);
      window.setTimeout(() => {
        const next = makePuzzle(opts.mode, opts.level, opts.config, opts.packIndex);
        if (genToken.current !== token) return;
        setPuzzle(next);
        setGenerating(false);
      }, 30);
    },
    [],
  );

  // 记录：关卡结束或离开时落库
  const snapshot = useRef<{ puzzle: Puzzle; report: GameReport; config: LevelConfig; mode: 'endless' | 'calibration'; packIndex: number | null } | null>(null);

  const flushSession = useCallback((force = false) => {
    const snap = snapshot.current;
    if (!snap) return;
    const { puzzle: p, report, mode: m, packIndex: pi } = snap;
    const activity = report.timeMs > 1200 || report.mistakes > 0 || report.hints > 0;
    if (!force && !activity) return;
    const packId = m === 'calibration' && pi !== null ? CALIBRATION_PACK[pi].id : undefined;
    const id = `${m}:${packId ?? `L${progress.level}`}:${p.meta.seed}:${p.n}`;
    const existing = loadSessions().find((r) => r.id === id);
    const record: SessionRecord = {
      id,
      mode: m,
      packId,
      level: progress.level,
      n: p.n,
      seed: p.meta.seed,
      score: p.meta.score,
      label: p.meta.label,
      features: p.meta.features,
      metrics: {
        solvableByLogic: p.meta.metrics.solvableByLogic,
        needsRefutation: p.meta.metrics.needsRefutation,
        highestTier: p.meta.metrics.highestTier,
        steps: p.meta.metrics.steps,
        techniqueCounts: p.meta.metrics.techniqueCounts as Record<string, number>,
        logicProgress: p.meta.metrics.logicProgress,
      },
      timeMs: report.timeMs,
      finishTimeMs: report.finished ? report.timeMs : existing?.finishTimeMs,
      mistakes: report.mistakes,
      hints: report.hints,
      undos: report.undos,
      clears: report.clears,
      finished: report.finished,
      rating: existing?.rating,
      ratingTags: existing?.ratingTags,
      ratingNote: existing?.ratingNote,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    setSessions(upsertSession(record));
  }, [progress.level]);

  const onFinish = (report: GameReport) => {
    setLastReport(report);
    snapshot.current = snapshot.current ? { ...snapshot.current, report } : null;
    window.setTimeout(() => flushSession(true), 0);
    if (mode === 'calibration') window.setTimeout(() => setRatingOpen(true), 400);
  };

  const api = useGame(puzzle, { strictMistakes: settings.strictMistakes, onFinish });

  // 开发期脚本钩子（方便自动化测试/复现关卡，不影响正式构建）
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__foxi = { puzzle, api, solution: puzzle.solution };
    }
  });

  // 每次渲染刷新快照（供离开时落库）
  snapshot.current = {
    puzzle,
    report: {
      timeMs: api.elapsedMs,
      mistakes: api.mistakes,
      hints: api.hints,
      undos: api.undos,
      clears: api.clears,
      finished: api.finished,
    },
    config,
    mode,
    packIndex,
  };

  const gotoLevel = (opts: { mode: 'endless' | 'calibration'; level?: number; packIndex?: number | null; config?: LevelConfig }) => {
    flushSession(false);
    const nextMode = opts.mode;
    const nextPack = opts.packIndex ?? (nextMode === 'calibration' ? (packIndex ?? 0) : null);
    const nextConfig = opts.config ?? config;
    setMode(nextMode);
    setPackIndex(nextPack);
    setConfig(nextConfig);
    setTab('play');
    buildPuzzle({ mode: nextMode, level: opts.level ?? progress.level, config: nextConfig, packIndex: nextPack });
  };

  const onNewLevel = () => {
    const nextLevel = progress.level + 1;
    setProgress((p) => ({ ...p, level: nextLevel }));
    gotoLevel({ mode: 'endless', level: nextLevel, packIndex: null });
  };

  const submitRating = (rating: number, tags: string[], note: string) => {
    const packId = mode === 'calibration' && packIndex !== null ? CALIBRATION_PACK[packIndex].id : undefined;
    const id = `${mode}:${packId ?? `L${progress.level}`}:${puzzle.meta.seed}:${puzzle.n}`;
    const existing = loadSessions().find((r) => r.id === id);
    const base: SessionRecord =
      existing ??
      ({
        id,
        mode,
        packId,
        level: progress.level,
        n: puzzle.n,
        seed: puzzle.meta.seed,
        score: puzzle.meta.score,
        label: puzzle.meta.label,
        features: puzzle.meta.features,
        metrics: {
          solvableByLogic: puzzle.meta.metrics.solvableByLogic,
          needsRefutation: puzzle.meta.metrics.needsRefutation,
          highestTier: puzzle.meta.metrics.highestTier,
          steps: puzzle.meta.metrics.steps,
          techniqueCounts: puzzle.meta.metrics.techniqueCounts as Record<string, number>,
          logicProgress: puzzle.meta.metrics.logicProgress,
        },
        timeMs: api.elapsedMs,
        mistakes: api.mistakes,
        hints: api.hints,
        undos: api.undos,
        clears: api.clears,
        finished: api.finished,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as SessionRecord);
    const next: SessionRecord = {
      ...base,
      rating,
      ratingTags: tags,
      ratingNote: note,
      timeMs: Math.max(base.timeMs, api.elapsedMs),
      finished: base.finished || api.finished,
      updatedAt: Date.now(),
    };
    setSessions(upsertSession(next));
    setRatingOpen(false);
  };

  const currentRecord = useMemo(() => {
    const packId = mode === 'calibration' && packIndex !== null ? CALIBRATION_PACK[packIndex].id : undefined;
    const id = `${mode}:${packId ?? `L${progress.level}`}:${puzzle.meta.seed}:${puzzle.n}`;
    return sessions.find((r) => r.id === id);
  }, [sessions, mode, packIndex, progress.level, puzzle.meta.seed, puzzle.n]);

  return (
    <div className="app">
      <nav className="tabs">
        <button className={tab === 'play' ? 'tab active' : 'tab'} onClick={() => setTab('play')}>
          游戏
        </button>
        <button
          className={tab === 'calibration' ? 'tab active' : 'tab'}
          onClick={() => {
            flushSession(false);
            setTab('calibration');
          }}
        >
          标定
        </button>
        <button className={tab === 'stats' ? 'tab active' : 'tab'} onClick={() => setTab('stats')}>
          数据
        </button>
        <button className={tab === 'rules' ? 'tab active' : 'tab'} onClick={() => setTab('rules')}>
          规则
        </button>
        <span className="brand">佛系消消消 · 纯净版</span>
      </nav>

      {tab === 'play' && (
        <PlayView
          puzzle={puzzle}
          api={api}
          settings={settings}
          level={progress.level}
          mode={mode}
          packId={mode === 'calibration' && packIndex !== null ? CALIBRATION_PACK[packIndex].id : undefined}
          packHint={mode === 'calibration' && packIndex !== null ? CALIBRATION_PACK[packIndex].hint : undefined}
          packIndex={packIndex ?? undefined}
          packTotal={CALIBRATION_PACK.length}
          config={config}
          generating={generating}
          lastReport={lastReport}
          rated={currentRecord?.rating}
          onConfigChange={(c) => {
            setConfig(c);
            setProgress((p) => ({ ...p, difficulty: c.difficulty, size: c.size }));
          }}
          onPreset={(p: Preset) => gotoLevel({ mode: 'endless', packIndex: null, config: { difficulty: p.score, size: p.n } })}
          onNewLevel={mode === 'endless' ? onNewLevel : () => gotoLevel({ mode: 'endless', packIndex: null })}
          onReplay={() => gotoLevel({ mode, packIndex, config })}
          onRate={() => setRatingOpen(true)}
          onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          onPrevPack={mode === 'calibration' && packIndex !== null && packIndex > 0 ? () => gotoLevel({ mode: 'calibration', packIndex: packIndex - 1 }) : undefined}
          onNextPack={
            mode === 'calibration' && packIndex !== null && packIndex + 1 < CALIBRATION_PACK.length
              ? () => gotoLevel({ mode: 'calibration', packIndex: packIndex + 1 })
              : undefined
          }
        />
      )}

      {tab === 'calibration' && (
        <CalibrationPanel
          records={sessions}
          currentIndex={mode === 'calibration' ? packIndex : null}
          onPick={(i) => gotoLevel({ mode: 'calibration', packIndex: i })}
          onBack={() => setTab('play')}
        />
      )}

      {tab === 'stats' && (
        <StatsPanel
          records={sessions}
          onClear={() => {
            clearSessions();
            setSessions([]);
          }}
        />
      )}

      {tab === 'rules' && <RulesPanel onBack={() => setTab('play')} />}

      {ratingOpen && (
        <RatingDialog
          title={mode === 'calibration' && packIndex !== null ? `给标定关卡 ${CALIBRATION_PACK[packIndex].id} 打分` : `给第 ${progress.level} 关打分`}
          subtitle={`尺寸 ${puzzle.n}×${puzzle.n} · 生成难度 ${puzzle.meta.score.toFixed(1)}（${puzzle.meta.label}） · 用时 ${(api.elapsedMs / 1000).toFixed(0)}s · 错误 ${api.mistakes} 次 · 提示 ${api.hints} 次`}
          existing={currentRecord ? { rating: currentRecord.rating, tags: currentRecord.ratingTags, note: currentRecord.ratingNote } : undefined}
          onSubmit={submitRating}
          onClose={() => setRatingOpen(false)}
        />
      )}

      <footer className="footer">
        <span>
          关卡码：n{puzzle.n}-{puzzle.meta.seed.toString(36)} · 生成耗时 {puzzle.meta.generateMs.toFixed(0)}ms · 尝试{' '}
          {puzzle.meta.attempts} 次
        </span>
        <span className="tip">无限畅玩 · 无体力无广告 · 提示不限次数</span>
      </footer>
    </div>
  );
}
