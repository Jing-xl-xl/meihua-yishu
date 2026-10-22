import type { Element } from '../types/base';

export const ELEMENTS: readonly Element[] = [
  'metal',
  'wood',
  'water',
  'fire',
  'earth',
];

/** 相生环：金→水→木→火→土→金 */
export const WUXING_SHENG: Record<Element, Element> = {
  metal: 'water',
  water: 'wood',
  wood: 'fire',
  fire: 'earth',
  earth: 'metal',
};

/** 相克：金克木、木克土、土克水、水克火、火克金 */
export const WUXING_KE: Record<Element, Element> = {
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
};
