import { describe, expect, it } from 'vitest';

import {
  METHOD_POLARITY,
  STEP_IDS,
  STEP_TITLES,
  WUXING_KE,
  WUXING_SHENG,
} from '../index';
import { elementRelation } from './wuxing';

describe('elementRelation', () => {
  it('sheng / ke / bei / bi_he', () => {
    expect(elementRelation('metal', 'water')).toBe('sheng');
    expect(elementRelation('water', 'wood')).toBe('sheng');
    expect(elementRelation('metal', 'wood')).toBe('ke');
    expect(elementRelation('wood', 'metal')).toBe('bei_ke');
    expect(elementRelation('wood', 'water')).toBe('bei_sheng');
    expect(elementRelation('metal', 'metal')).toBe('bi_he');
    expect(elementRelation('fire', 'earth')).toBe('sheng');
    expect(elementRelation('earth', 'water')).toBe('ke');
  });

  it('WUXING_SHENG cycle', () => {
    expect(WUXING_SHENG.metal).toBe('water');
    expect(WUXING_SHENG.water).toBe('wood');
    expect(WUXING_SHENG.wood).toBe('fire');
    expect(WUXING_SHENG.fire).toBe('earth');
    expect(WUXING_SHENG.earth).toBe('metal');
    expect(WUXING_KE.metal).toBe('wood');
  });
});

describe('METHOD_POLARITY', () => {
  it('xiantian vs houtian', () => {
    expect(METHOD_POLARITY.number3).toBe('xiantian');
    expect(METHOD_POLARITY.datetime).toBe('xiantian');
    expect(METHOD_POLARITY.objectCount).toBe('xiantian');
    expect(METHOD_POLARITY.direction).toBe('houtian');
    expect(Object.keys(METHOD_POLARITY).length).toBeGreaterThanOrEqual(9);
    expect(METHOD_POLARITY.measureZhangChi).toBe('xiantian');
    expect(METHOD_POLARITY.measureChiCun).toBe('xiantian');
  });
});

describe('STEP_TITLES', () => {
  it('nine steps', () => {
    expect(STEP_IDS).toHaveLength(9);
    for (const id of STEP_IDS) {
      expect(STEP_TITLES[id].length).toBeGreaterThan(0);
    }
  });
});
