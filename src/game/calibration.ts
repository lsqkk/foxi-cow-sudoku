/**
 * 标定关卡包：固定种子，难度从“很入门”到“很绕”，尺寸从 6 到 13。
 * 目的是让你真实体验一批关卡并打分，从而把“生成难度”和“体感难度”对上。
 */
export interface PackLevel {
  id: string;
  n: number;
  difficulty: number;
  seed: number;
  hint: string;
}

export const CALIBRATION_PACK: PackLevel[] = [
  { id: 'A1', n: 6, difficulty: 1.5, seed: 101, hint: '最简单的形态：小颜色很多，基本靠“唯一候选”' },
  { id: 'A2', n: 6, difficulty: 2.5, seed: 202, hint: '6×6，但形状不那么规整' },
  { id: 'B1', n: 7, difficulty: 3, seed: 303, hint: '7×7 入门' },
  { id: 'B2', n: 7, difficulty: 4, seed: 404, hint: '7×7 稍难' },
  { id: 'C1', n: 8, difficulty: 3, seed: 505, hint: '尺寸更大但线索明显 —— 用来验证“尺寸 ≠ 难度”' },
  { id: 'C2', n: 8, difficulty: 5, seed: 606, hint: '8×8 中等' },
  { id: 'C3', n: 8, difficulty: 6.5, seed: 707, hint: '8×8 较绕' },
  { id: 'D1', n: 9, difficulty: 4, seed: 808, hint: '9×9 但设计友好' },
  { id: 'D2', n: 9, difficulty: 6, seed: 909, hint: '9×9 中等偏难' },
  { id: 'E1', n: 10, difficulty: 3.5, seed: 111, hint: '10×10 简单（像截图那种关卡的感觉）' },
  { id: 'E2', n: 10, difficulty: 5.5, seed: 222, hint: '10×10 中等' },
  { id: 'E3', n: 10, difficulty: 7.5, seed: 333, hint: '10×10 困难' },
  { id: 'F1', n: 11, difficulty: 5, seed: 444, hint: '11×11 中等' },
  { id: 'F2', n: 11, difficulty: 7, seed: 555, hint: '11×11 困难' },
  { id: 'G1', n: 12, difficulty: 4.5, seed: 666, hint: '12×12 但线索充足' },
  { id: 'G2', n: 12, difficulty: 7.5, seed: 777, hint: '12×12 困难' },
  { id: 'H1', n: 13, difficulty: 6, seed: 888, hint: '13×13 中等（体会大棋盘未必难）' },
  { id: 'H2', n: 13, difficulty: 8.5, seed: 999, hint: '13×13 最难的一档' },
];

export const RATING_TAGS = [
  '颜色很绕',
  '入手点很少',
  '需要反证/试错',
  '观察很累',
  '时间不够',
  '挺顺手',
  '一眼就看出关键',
];
