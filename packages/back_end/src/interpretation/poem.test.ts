import { describe, expect, it } from 'vitest';

import {
  FALLBACK_POEMS,
  fallbackPoem,
  hanCount,
  parsePoemLines,
  validatePoemLines,
} from './poem';

describe('poem', () => {
  it('hanCount 7', () => {
    expect(hanCount('用生体可徐图之')).toBe(7);
    expect(hanCount('守正待时事易成')).toBe(7);
  });

  it('fallback poems are 7+7 and direction-safe', () => {
    for (const [g, lines] of Object.entries(FALLBACK_POEMS)) {
      expect(hanCount(lines[0])).toBe(7);
      expect(hanCount(lines[1])).toBe(7);
      expect(
        validatePoemLines(lines, g as keyof typeof FALLBACK_POEMS),
      ).toBeNull();
    }
  });

  it('reject mixed direction', () => {
    expect(
      validatePoemLines(['大吉大利福临门', '祸从天降不可当'], 'good'),
    ).toBeTruthy();
  });

  it('parse lines from text', () => {
    expect(parsePoemLines({ text: '云开月朗\n待时而行' })).toEqual([
      '云开月朗',
      '待时而行',
    ]);
  });

  it('fallbackPoem source rule', () => {
    const p = fallbackPoem('bad');
    expect(p.source).toBe('rule');
    expect(p.lines[0]).toBe(FALLBACK_POEMS.bad[0]);
  });
});
