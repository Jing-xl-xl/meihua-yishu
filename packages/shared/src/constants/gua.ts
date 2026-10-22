export const GUA_IDS = [
  'qian',
  'dui',
  'li',
  'zhen',
  'xun',
  'kan',
  'gen',
  'kun',
] as const;

export const GUA_NUM = {
  qian: 1,
  dui: 2,
  li: 3,
  zhen: 4,
  xun: 5,
  kan: 6,
  gen: 7,
  kun: 8,
} as const;

/** 八宫所属五行（规格 1.3） */
export const GUA_WUXING = {
  qian: 'metal',
  dui: 'metal',
  li: 'fire',
  zhen: 'wood',
  xun: 'wood',
  kan: 'water',
  gen: 'earth',
  kun: 'earth',
} as const;

export const GUA_NAME_ZH = {
  qian: '乾',
  dui: '兑',
  li: '离',
  zhen: '震',
  xun: '巽',
  kan: '坎',
  gen: '艮',
  kun: '坤',
} as const;

/** 自然象（64 卦全名用） */
export const GUA_NATURE_ZH = {
  qian: '天',
  dui: '泽',
  li: '火',
  zhen: '雷',
  xun: '风',
  kan: '水',
  gen: '山',
  kun: '地',
} as const;
