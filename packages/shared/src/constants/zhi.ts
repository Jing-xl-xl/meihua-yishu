import type { Zhi, ZhiNum } from '../types/base';

/** 名 → 数：子=1 … 亥=12 */
export const ZHI_NUM: Record<Zhi, ZhiNum> = {
  子: 1,
  丑: 2,
  寅: 3,
  卯: 4,
  辰: 5,
  巳: 6,
  午: 7,
  未: 8,
  申: 9,
  酉: 10,
  戌: 11,
  亥: 12,
};

/** 数 → 名：下标 = 数 − 1 */
export const ZHI_BY_NUM: readonly Zhi[] = [
  '子',
  '丑',
  '寅',
  '卯',
  '辰',
  '巳',
  '午',
  '未',
  '申',
  '酉',
  '戌',
  '亥',
];
