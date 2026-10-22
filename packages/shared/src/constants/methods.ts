import type { CastMethod, MethodPolarity } from '../types/cast';

export const CAST_METHODS: readonly CastMethod[] = [
  'number1',
  'number2',
  'number3',
  'datetime',
  'objectCount',
  'sound',
  'text',
  'measure',
  'measureZhangChi',
  'measureChiCun',
  'direction',
];

/**
 * 步 6 分流唯一依据：数起/时起为先天（古不取爻辞）；端法等为后天。
 */
export const METHOD_POLARITY: Record<CastMethod, MethodPolarity> = {
  number1: 'xiantian',
  number2: 'xiantian',
  number3: 'xiantian',
  datetime: 'xiantian',
  objectCount: 'xiantian',
  sound: 'xiantian',
  text: 'xiantian',
  measure: 'xiantian',
  measureZhangChi: 'xiantian',
  measureChiCun: 'xiantian',
  direction: 'houtian',
};
