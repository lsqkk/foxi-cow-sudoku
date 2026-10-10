import { Icon, Stars } from './Icon';
import { MODE_INFO, TIME_ATTACK_LEVELS } from '../game/levels';
import { formatTime } from '../game/useGame';
import type { GameMode, MetaState, Progress } from '../game/storage';

interface Props {
  progress: Progress;
  meta: MetaState;
  dailyStars: number | undefined;
  onContinue: () => void;
  onMode: (mode: GameMode) => void;
  onLevels: () => void;
  onRecords: () => void;
  onSettings: () => void;
  onRules: () => void;
  /** 是否有一局还没打完（切到别的页面后还能回来接着玩） */
  inGame: boolean;
  onResume: () => void;
}

/** 首页：进来先看到进度、模式入口和战绩，而不是直接开局 */
export function Home(props: Props) {
  const { progress, meta, dailyStars } = props;
  const cleared = Math.max(0, progress.classicLevel - 1);
  const nextLevel = progress.classicLevel;

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-icon">
          <span className="cow-emoji big">🐮</span>
        </div>
        <div className="hero-text">
          <h1>佛系消消消 · 纯净版</h1>
          <p>数独 × 扫雷 · 无体力 · 无广告 · 关卡本地即时生成（唯一解、纯逻辑可解）</p>
          <p className="hero-tip">
            <Icon name="info" /> 不会玩？顶栏的「<button className="linkbtn" onClick={props.onRules}>规则玩法</button>
            」里有规则、操作说明和每种推理方法的图示。
          </p>
        </div>
      </section>

      {props.inGame && (
        <button className="resumecard" onClick={props.onResume}>
          <Icon name="play" />
          <span>
            <b>对局进行中</b>
            <small>回到棋盘接着玩（已自动暂停计时）</small>
          </span>
          <Icon name="next" className="mc-arrow" />
        </button>
      )}

      <section className="homemain">
        <div className="continuecard">
          <div className="cc-left">
            <div className="cc-label">经典闯关进度</div>
            <div className="cc-level">第 {nextLevel} 关</div>
            <div className="cc-sub">
              已通关 <b>{cleared}</b> 关 · 星数 <b>{meta.totalStars}</b>
              {meta.streak > 1 && (
                <>
                  {' '}
                  · 连胜 <b>{meta.streak}</b>
                </>
              )}
            </div>
            <progress className="cc-bar" value={cleared % 50} max={50} />
            <div className="cc-hint">当前进度：第 {cleared % 50 === 0 && cleared > 0 ? 50 : cleared % 50} / 50（每 50 关一个阶段）</div>
          </div>
          <button className="primary big" onClick={props.onContinue}>
            <Icon name="play" /> 继续第 {nextLevel} 关
          </button>
        </div>

        <div className="dailypanel">
          <div className="dp-head">
            <Icon name="calendar" /> 每日挑战
          </div>
          <div className="dp-body">
            <div>
              每天一张固定地图，和所有人同图。
              <div className="muted">
                {dailyStars ? (
                  <>
                    今日已完成 <Stars value={dailyStars} />
                  </>
                ) : (
                  '今日还没完成'
                )}
              </div>
            </div>
            <button onClick={() => props.onMode('daily')}>{dailyStars ? '再玩一次' : '开始'}</button>
          </div>
        </div>
      </section>

      <section className="modeshort">
        {(Object.keys(MODE_INFO) as GameMode[]).map((m) => (
          <button key={m} className="modechip" onClick={() => props.onMode(m)}>
            <span className="mc-icon">
              <Icon name={m === 'classic' ? 'trophy' : m === 'daily' ? 'calendar' : m === 'timeattack' ? 'stopwatch' : m === 'zen' ? 'leaf' : 'sliders'} />
            </span>
            <span className="mc-text">
              <b>{MODE_INFO[m].name}</b>
              <small>
                {m === 'classic'
                  ? `继续第 ${nextLevel} 关`
                  : m === 'timeattack'
                    ? `${TIME_ATTACK_LEVELS} 关计时赛`
                    : m === 'daily'
                      ? '每日同图'
                      : m === 'zen'
                        ? '无压力随便玩'
                        : '自己定难度'}
              </small>
            </span>
            <Icon name="next" className="mc-arrow" />
          </button>
        ))}
      </section>

      <section className="statstrip">
        <div>
          <Icon name="bullseye" />
          <b>{meta.totalCleared}</b>
          <small>累计通关</small>
        </div>
        <div>
          <Icon name="star" />
          <b>{meta.totalStars}</b>
          <small>累计星数</small>
        </div>
        <div>
          <Icon name="fire" />
          <b>{meta.bestStreak}</b>
          <small>最高连胜</small>
        </div>
        <div>
          <Icon name="hourglass" />
          <b>{meta.bestTimeAttackMs ? formatTime(meta.bestTimeAttackMs) : '—'}</b>
          <small>{TIME_ATTACK_LEVELS} 连闯最佳</small>
        </div>
      </section>

      <section className="quicklinks">
        <button onClick={props.onLevels}>
          <Icon name="grid" /> 关卡选择
        </button>
        <button onClick={props.onRecords}>
          <Icon name="chart" /> 成绩记录
        </button>
        <button onClick={props.onSettings}>
          <Icon name="gear" /> 设置
        </button>
        <button onClick={props.onRules}>
          <Icon name="info" /> 玩法说明
        </button>
      </section>

      <p className="homefoot">
        所有进度与成绩都保存在本机浏览器里，不上传任何数据。关卡由浏览器即时生成，每关都有唯一解。
      </p>
    </div>
  );
}
