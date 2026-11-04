import type { Element } from '../types/base';
import { WUXING_KE, WUXING_SHENG } from '../constants/wuxing';

/** 五行中文显示（W8-0；禁 metal/wood 直出） */
export const ELEMENT_ZH: Record<Element, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

export function elementZh(e: string | undefined): string {
  if (!e) return '';
  return ELEMENT_ZH[e as Element] ?? e;
}

export type ElementRelation =
  | 'sheng'
  | 'ke'
  | 'bei_sheng'
  | 'bei_ke'
  | 'bi_he';

/** a 对 b 的关系：sheng=我生他；ke=我克他；bei_sheng=他生我；bei_ke=他克我 */
export function elementRelation(a: Element, b: Element): ElementRelation {
  if (a === b) return 'bi_he';
  if (WUXING_SHENG[a] === b) return 'sheng';
  if (WUXING_KE[a] === b) return 'ke';
  if (WUXING_SHENG[b] === a) return 'bei_sheng';
  return 'bei_ke';
}
