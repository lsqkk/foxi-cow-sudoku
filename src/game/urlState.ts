import {
  decodeLevelCode,
  encodeLevelCode,
  specForClassic,
  specForCustom,
  specForDaily,
  specForTimeAttack,
  type LevelSpec,
} from './levels';
import type { GameMode } from './storage';

const MODES: GameMode[] = ['classic', 'daily', 'timeattack', 'zen', 'custom'];

/** 只生成查询串（纯函数，方便测试） */
export function buildParams(spec: LevelSpec): string {
  const params = new URLSearchParams();
  params.set('m', spec.mode);
  if (spec.mode === 'classic' || spec.mode === 'timeattack') params.set('lv', String(spec.level));
  if (spec.mode === 'daily' && spec.code) params.set('day', spec.code);
  params.set('code', encodeLevelCode({ size: spec.size, difficulty: spec.difficulty, seed: spec.seed }));
  return params.toString();
}

/** 把当前关卡编码进 URL，方便“一键复制链接”分享同一张地图 */
export function buildUrl(spec: LevelSpec): string {
  return `${window.location.origin}${window.location.pathname}?${buildParams(spec)}`;
}

/** 解析 URL 参数：code 优先（保证拿到同一张地图），其次 m/lv 等 */
export function specFromUrl(search: string): { spec: LevelSpec; challenge: boolean } | null {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const decoded = code ? decodeLevelCode(code) : null;
  const modeParam = params.get('m');
  const mode = MODES.includes(modeParam as GameMode) ? (modeParam as GameMode) : null;
  const lv = Number(params.get('lv'));
  const day = params.get('day');

  if (mode === 'classic' && Number.isFinite(lv) && lv >= 1) {
    const base = specForClassic(Math.floor(lv));
    return {
      spec: decoded ? { ...base, size: decoded.size, difficulty: base.difficulty, seed: decoded.seed } : base,
      // 经典模式的链接仍然要遵守“解锁挑战”规则，交给上层判断是否已解锁
      challenge: true,
    };
  }
  if (mode === 'daily') {
    const target = day ? new Date(`${day}T12:00:00`) : new Date();
    const base = specForDaily(Number.isNaN(target.getTime()) ? new Date() : target);
    return { spec: decoded ? { ...base, seed: decoded.seed, size: decoded.size ?? base.size } : base, challenge: false };
  }
  if (mode === 'timeattack') {
    const idx = Number.isFinite(lv) ? Math.max(0, Math.floor(lv) - 1) : 0;
    const base = specForTimeAttack(idx, params.get('run') ? Number(params.get('run')) >>> 0 : 1);
    return { spec: decoded ? { ...base, seed: decoded.seed } : base, challenge: false };
  }
  if (mode === 'zen') {
    // 注意：禅模式的 seed 必须原样使用，不能再喂给 specForZen 重新派生一次
    const dParam = Number(params.get('d'));
    const d = decoded?.difficulty ?? (Number.isFinite(dParam) && dParam > 0 ? dParam : 5);
    const size = decoded?.size ?? (params.get('n') ? Number(params.get('n')) : null);
    const sParam = Number(params.get('seed'));
    const seed = decoded?.seed ?? (Number.isFinite(sParam) && sParam > 0 ? sParam >>> 0 : 1);
    return { spec: { mode: 'zen', level: seed, difficulty: d, size, seed }, challenge: false };
  }
  if (decoded) {
    const spec = specForCustom(decoded.difficulty, decoded.size, decoded.seed);
    return { spec, challenge: mode === 'classic' };
  }
  return null;
}

/** 复制当前链接到剪贴板 */
export async function copyLink(spec: LevelSpec): Promise<string> {
  const url = buildUrl(spec);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    try {
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      /* 无法复制时至少把链接返回给调用方 */
    }
  }
  return url;
}

/**
 * 粘贴导入：既接受“关卡码”（FOXI1-…），也接受分享链接 / 网址
 * （例如 https://…/?m=classic&lv=30&code=FOXI1-9-a-1y4y1）。
 */
export function parseLevelInput(input: string): LevelSpec | null {
  const text = input.trim();
  if (!text) return null;

  // 1) 看起来像网址 / 带查询参数的分享串
  if (/^https?:\/\//i.test(text) || /[?&]?(code|m|day|lv)=/i.test(text) || text.startsWith('?')) {
    let search = '';
    try {
      search = new URL(text).search;
    } catch {
      const q = text.indexOf('?');
      search = q >= 0 ? text.slice(q) : text;
      if (!search.startsWith('?')) search = `?${search}`;
    }
    const parsed = specFromUrl(search);
    if (parsed) return parsed.spec;
  }

  // 2) 纯关卡码
  const decoded = decodeLevelCode(text);
  if (!decoded) return null;
  return specForCustom(decoded.difficulty, decoded.size, decoded.seed);
}
