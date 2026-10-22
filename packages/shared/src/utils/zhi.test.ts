import { describe, expect, it } from 'vitest';

import { ZHI_BY_NUM, ZHI_NUM, zhiName, zhiNum } from '../index';

describe('zhi', () => {
  it('ZHI_NUM sample', () => {
    expect(zhiNum('辰')).toBe(5);
    expect(zhiNum('申')).toBe(9);
    expect(zhiNum('子')).toBe(1);
    expect(zhiNum('亥')).toBe(12);
  });

  it('ZHI_BY_NUM round-trip', () => {
    expect(zhiName(5)).toBe('辰');
    expect(zhiName(9)).toBe('申');
    expect(zhiName(1)).toBe('子');
    expect(ZHI_BY_NUM).toHaveLength(12);
    for (let n = 1 as const; n <= 12; n++) {
      expect(zhiNum(zhiName(n))).toBe(n);
    }
    expect(Object.keys(ZHI_NUM)).toHaveLength(12);
  });

  it('zhiName out of range', () => {
    expect(() => zhiName(0 as never)).toThrow(RangeError);
    expect(() => zhiName(13 as never)).toThrow(RangeError);
  });
});
