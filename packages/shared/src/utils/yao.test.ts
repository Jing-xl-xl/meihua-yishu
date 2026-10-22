import { describe, expect, it } from 'vitest';

import {
  isMovingYao,
  isYangYao,
  yaoLabel,
  yaoToYang,
} from './yao';

describe('yaoLabel', () => {
  it('阳爻 labels', () => {
    expect(yaoLabel(1, true)).toBe('初九');
    expect(yaoLabel(3, true)).toBe('九三');
    expect(yaoLabel(6, true)).toBe('上九');
  });

  it('阴爻 labels', () => {
    expect(yaoLabel(1, false)).toBe('初六');
    expect(yaoLabel(2, false)).toBe('六二');
    expect(yaoLabel(6, false)).toBe('上六');
  });

  it('rejects out-of-range pos', () => {
    expect(() => yaoLabel(0, true)).toThrow(RangeError);
    expect(() => yaoLabel(7, true)).toThrow(RangeError);
  });
});

describe('yao 6789 semantics', () => {
  it('isYangYao', () => {
    expect(isYangYao(7)).toBe(true);
    expect(isYangYao(9)).toBe(true);
    expect(isYangYao(6)).toBe(false);
    expect(isYangYao(8)).toBe(false);
    expect(yaoToYang(9)).toBe(true);
    expect(yaoToYang(8)).toBe(false);
  });

  it('isMovingYao — 老阴/老阳', () => {
    expect(isMovingYao(6)).toBe(true);
    expect(isMovingYao(9)).toBe(true);
    expect(isMovingYao(7)).toBe(false);
    expect(isMovingYao(8)).toBe(false);
  });
});
