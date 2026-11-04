import { describe, expect, it } from 'vitest';

import {
  buildPersonaSystem,
  buildPoemPersonaLine,
  countExplainWords,
  DEFAULT_PERSONA,
  findForbidden,
  personaToneCompatible,
  validateMainText,
} from './persona';

describe('persona', () => {
  it('default is feiyu and includes humor budget', () => {
    expect(DEFAULT_PERSONA).toBe('feiyu');
    const s = buildPersonaSystem({ persona: 'feiyu' });
    expect(s).toContain('大肥鱼');
    expect(s).toContain('3 处');
  });

  it('feiyu degrades elegant to standard', () => {
    expect(personaToneCompatible('feiyu', 'elegant')).toEqual({
      tone: 'standard',
      degraded: true,
    });
    expect(personaToneCompatible('xiansheng', 'elegant').degraded).toBe(false);
  });

  it('poem line differs by persona', () => {
    expect(buildPoemPersonaLine('xiansheng')).toContain('雅正');
    expect(buildPoemPersonaLine('feiyu')).toContain('禁止网络梗');
  });
});

describe('forbidden words', () => {
  it('catches AI tell and 万能建议 on advice', () => {
    expect(findForbidden('综上所述，此事可成')).toContain('综上所述');
    expect(validateMainText('先放平心态再说', { isAdvice: true }).ok).toBe(false);
    expect(validateMainText('先放平心态再说').ok).toBe(true);
  });

  it('countExplainWords', () => {
    expect(countExplainWords('这说明了问题')).toBe(1);
    expect(countExplainWords('说明表明意味着')).toBe(3);
  });
});
