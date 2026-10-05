/** 调色板：尽量贴近原版截图里的糖果色 */
export interface ColorDef {
  name: string;
  bg: string;
  /** 色盲模式下叠加的花纹 */
  pattern: string;
  letter: string;
}

export const PALETTE: ColorDef[] = [
  { name: '玫红', bg: '#C64A79', pattern: 'none', letter: 'A' },
  { name: '金黄', bg: '#D9A521', pattern: 'repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0 6px, transparent 6px 12px)', letter: 'B' },
  { name: '紫罗兰', bg: '#7B5BB6', pattern: 'repeating-linear-gradient(-45deg, rgba(255,255,255,.25) 0 6px, transparent 6px 12px)', letter: 'C' },
  { name: '青绿', bg: '#2E9C8C', pattern: 'radial-gradient(circle, rgba(255,255,255,.35) 2px, transparent 3px)', letter: 'D' },
  { name: '天蓝', bg: '#6D9ED8', pattern: 'repeating-linear-gradient(0deg, rgba(255,255,255,.28) 0 4px, transparent 4px 10px)', letter: 'E' },
  { name: '橙色', bg: '#E8834A', pattern: 'repeating-linear-gradient(90deg, rgba(255,255,255,.28) 0 4px, transparent 4px 10px)', letter: 'F' },
  { name: '粉色', bg: '#E5A0C0', pattern: 'radial-gradient(circle, rgba(255,255,255,.4) 2px, transparent 3px)', letter: 'G' },
  { name: '靛蓝', bg: '#5B7BB4', pattern: 'repeating-linear-gradient(45deg, rgba(0,0,0,.12) 0 5px, transparent 5px 10px)', letter: 'H' },
  { name: '草绿', bg: '#8CC06A', pattern: 'repeating-linear-gradient(-45deg, rgba(0,0,0,.1) 0 5px, transparent 5px 10px)', letter: 'I' },
  { name: '浅蓝', bg: '#7EC8E3', pattern: 'radial-gradient(circle, rgba(0,0,0,.12) 2px, transparent 3px)', letter: 'J' },
  { name: '薄荷', bg: '#4FB3A5', pattern: 'repeating-linear-gradient(0deg, rgba(0,0,0,.12) 0 4px, transparent 4px 9px)', letter: 'K' },
  { name: '珊瑚', bg: '#E2705A', pattern: 'repeating-linear-gradient(90deg, rgba(0,0,0,.12) 0 4px, transparent 4px 9px)', letter: 'L' },
  { name: '卡其', bg: '#C9B458', pattern: 'repeating-linear-gradient(45deg, rgba(0,0,0,.1) 0 6px, transparent 6px 12px)', letter: 'M' },
  { name: '青灰', bg: '#6FA3A0', pattern: 'radial-gradient(circle, rgba(255,255,255,.35) 2px, transparent 3px)', letter: 'N' },
  { name: '酒红', bg: '#9C3B54', pattern: 'repeating-linear-gradient(-45deg, rgba(255,255,255,.2) 0 6px, transparent 6px 12px)', letter: 'O' },
];

export function colorOf(id: number): ColorDef {
  return PALETTE[((id % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

export function colorName(id: number): string {
  return colorOf(id).name;
}

/** 把提示文本里的 颜色#k 换成中文颜色名 */
export function formatHintText(text: string): string {
  return text.replace(/颜色#(\d+)/g, (_, k) => colorName(Number(k) - 1));
}
