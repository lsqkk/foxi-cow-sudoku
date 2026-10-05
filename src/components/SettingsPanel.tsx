import type { Settings, ThemeMode } from '../game/storage';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settingrow">
      <div>
        <b>{title}</b>
        <div className="muted">{desc}</div>
      </div>
      {children}
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onBack }: Props) {
  return (
    <div className="panel">
      <div className="panelhead">
        <h2>设置</h2>
        <button className="ghost" onClick={onBack}>
          返回
        </button>
      </div>
      <Row title="放错立刻提示" desc="关掉后放错的牛会留在棋盘上，更接近“自己发现矛盾”的玩法">
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.strictMistakes}
            onChange={(e) => onChange({ strictMistakes: e.target.checked })}
          />
          <span />
        </label>
      </Row>
      <Row title="色盲友好" desc="在颜色上叠加不同花纹和字母">
        <label className="switch">
          <input type="checkbox" checked={settings.colorBlind} onChange={(e) => onChange({ colorBlind: e.target.checked })} />
          <span />
        </label>
      </Row>
      <Row title="显示计时" desc="禅模式下可以关掉，完全没有压力">
        <label className="switch">
          <input type="checkbox" checked={settings.showTimer} onChange={(e) => onChange({ showTimer: e.target.checked })} />
          <span />
        </label>
      </Row>
      <Row title="音效" desc="放置、排除、通关的轻微提示音">
        <label className="switch">
          <input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ sound: e.target.checked })} />
          <span />
        </label>
      </Row>
      <Row title="主题" desc="跟随系统 / 浅色 / 深色">
        <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value as ThemeMode })} className="themesel">
          <option value="auto">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
      </Row>
    </div>
  );
}
