import type { Gua } from '../types/base';

/** W7 为人/物象 → 卦（唯一权威；前端禁止另持副本） */
export type PersonMapKey =
  | '老人'
  | '少女'
  | '长男'
  | '中男'
  | '少男'
  | '长女'
  | '中女'
  | '母'
  | '头动'
  | '足动'
  | '目动'
  | '青衣'
  | '赤衣'
  | '圆物'
  | '方物'
  | '见水'
  | '见火';

export const PERSON_TO_GUA: Record<PersonMapKey, Gua> = {
  老人: 'qian',
  少女: 'dui',
  长男: 'zhen',
  中男: 'kan',
  少男: 'gen',
  长女: 'xun',
  中女: 'li',
  母: 'kun',
  头动: 'qian',
  足动: 'zhen',
  目动: 'li',
  青衣: 'zhen',
  赤衣: 'li',
  圆物: 'qian',
  方物: 'kun',
  见水: 'kan',
  见火: 'li',
};

/** 八方 → 卦（端法） */
export const FANGWEI_TO_GUA: Record<string, Gua> = {
  南: 'li',
  北: 'kan',
  东: 'zhen',
  西: 'dui',
  东南: 'xun',
  西北: 'qian',
  东北: 'gen',
  西南: 'kun',
  前: 'qian',
  后: 'kun',
  左: 'xun',
  右: 'dui',
};

export const GUA_ENUM = [
  'qian',
  'dui',
  'li',
  'zhen',
  'xun',
  'kan',
  'gen',
  'kun',
] as const;

export function isGuaId(v: unknown): v is Gua {
  return typeof v === 'string' && (GUA_ENUM as readonly string[]).includes(v);
}
