import { describe, expect, it } from 'vitest';

import {
  buildCharacterSystem,
  buildPersonaSystem,
  buildPoemPersonaLine,
  countExplainWords,
  DEFAULT_PERSONA,
  countMemoryCallbacks,
  findForbidden,
  normalizeTone,
  personaToneCompatible,
  validateFeiyuVoice,
  validateMainText,
} from './persona';

describe('persona', () => {
  it('default is feiyu and includes humor budget', () => {
    expect(DEFAULT_PERSONA).toBe('feiyu');
    const s = buildPersonaSystem({ persona: 'feiyu' });
    expect(s).toContain('大肥鱼');
    expect(s).toContain('3 处');
  });

  it('legacy elegant normalizes to standard', () => {
    expect(normalizeTone('elegant')).toBe('standard');
    expect(personaToneCompatible('feiyu', 'elegant')).toEqual({
      tone: 'standard',
      degraded: true,
    });
    expect(personaToneCompatible('feiyu', 'warm').tone).toBe('warm');
  });

  it('character card is single feiyu with stage notes', () => {
    const s = buildCharacterSystem({ stage: 'clarify', tone: 'brief' });
    expect(s).toContain('大肥鱼');
    expect(s).toContain('只问一个缺的关键信息');
    expect(s).toContain('短句');
    expect(s).toContain('最多主动引用 1 次');
  });

  it('poem line is feiyu only', () => {
    expect(buildPoemPersonaLine()).toContain('禁止网络梗');
  });

  it('feiyu voice catches alien tone', () => {
    expect(validateFeiyuVoice('阁下此卦甚吉').ok).toBe(false);
    expect(validateFeiyuVoice('我看这事能成，先别急。').ok).toBe(true);
  });

  it('memory callbacks capped at 1 per answer', () => {
    expect(countMemoryCallbacks('上次你问过面试，这次还是它')).toBe(1);
    expect(
      validateFeiyuVoice('上次你问过面试，上次你说要准备。').ok,
    ).toBe(false);
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
