import { describe, expect, it } from 'vitest';

import { detectTells, fewshotBlock, startsWithTerm, validateCopy } from './copyCheck';

describe('copyCheck tell tiers', () => {
  it('hard: 综上所述 / 万能建议', () => {
    expect(validateCopy('综上所述，事可成').ok).toBe(false);
    expect(
      validateCopy('先放平心态', { isAdvice: true }).ok,
    ).toBe(false);
  });

  it('summary bans 说明/术语起句', () => {
    const t = '体卦为坎，说明此事难成';
    const h = detectTells(t, { isSummary: true });
    expect(h.some((x) => x.tier === 'hard')).toBe(true);
    expect(startsWithTerm('体卦为坎')).toBe(true);
    expect(startsWithTerm('东西还在家里')).toBe(false);
  });

  it('fewshot has both personas', () => {
    expect(fewshotBlock('feiyu')).toContain('只学语气');
    expect(fewshotBlock('xiansheng')).toContain('多半未离');
  });
});
