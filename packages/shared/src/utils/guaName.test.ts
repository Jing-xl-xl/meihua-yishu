import { describe, expect, it } from 'vitest';

import {
  GUA_NUM,
  GUA_WUXING,
  GUA_IDS,
  HEXAGRAM_TABLE,
} from '../index';
import { hexByKingwen, hexName, hexMeta } from './guaName';
import { isGua } from './guaName';
import { isStepId } from './stepId';

describe('GUA constants', () => {
  it('GUA_NUM has 8 distinct numbers', () => {
    const nums = GUA_IDS.map((g) => GUA_NUM[g]);
    expect(new Set(nums).size).toBe(8);
    expect(GUA_NUM.qian).toBe(1);
    expect(GUA_NUM.kun).toBe(8);
  });

  it('GUA_WUXING sample', () => {
    expect(GUA_WUXING.qian).toBe('metal');
    expect(GUA_WUXING.li).toBe('fire');
    expect(GUA_WUXING.gen).toBe('earth');
    expect(GUA_WUXING.dui).toBe('metal');
    expect(GUA_WUXING.zhen).toBe('wood');
    expect(GUA_WUXING.kan).toBe('water');
  });
});

describe('HEXAGRAM_TABLE', () => {
  it('has exactly 64 unique upper/lower pairs', () => {
    expect(HEXAGRAM_TABLE).toHaveLength(64);
    const pairs = HEXAGRAM_TABLE.map((h) => `${h.upper}/${h.lower}`);
    expect(new Set(pairs).size).toBe(64);
  });

  it('hexName gen/qian = 山天大畜 kingwen 26', () => {
    expect(hexName('gen', 'qian')).toBe('山天大畜');
    const meta = hexMeta('gen', 'qian');
    expect(meta.kingwen).toBe(26);
    expect(hexByKingwen(26)).toEqual(meta);
    expect(hexByKingwen(26).name).toBe('山天大畜');
  });

  it('kingwen 1–64 names non-empty and round-trip', () => {
    for (let n = 1; n <= 64; n++) {
      const meta = hexByKingwen(n);
      expect(meta.kingwen).toBe(n);
      expect(meta.name.length).toBeGreaterThan(1);
      expect(hexName(meta.upper, meta.lower)).toBe(meta.name);
    }
  });
});

describe('guards', () => {
  it('isGua / isStepId', () => {
    expect(isGua('qian')).toBe(true);
    expect(isGua('nope')).toBe(false);
    expect(isStepId(9)).toBe(true);
    expect(isStepId(0)).toBe(false);
    expect(isStepId(10)).toBe(false);
    expect(isStepId(3.5)).toBe(false);
  });
});
