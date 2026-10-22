import { describe, expect, it } from 'vitest';

import {
  PARAMS,
  STEP_JSON_SCHEMA_NOTE,
  STEP_KNOWLEDGE_MAP,
  STYLE_RULES,
} from './common';
import {
  REFUSAL_SOFTENER,
  STEP2_SYSTEM,
  STEP7_SYSTEM,
  STEP9_SYSTEM,
  isSensitiveCategory,
  withSensitiveNotice,
} from './step7';

describe('W4 prompts', () => {
  it('JSON schema uses reasoningNote not status', () => {
    expect(STEP_JSON_SCHEMA_NOTE).toContain('reasoningNote');
    expect(STEP_JSON_SCHEMA_NOTE).not.toContain('"status"');
    expect(STYLE_RULES).toContain('reasoningNote');
    expect(STYLE_RULES).toContain('不要输出 status');
  });

  it('step knowledge map', () => {
    expect(STEP_KNOWLEDGE_MAP[2]).toContain('gloss');
    expect(STEP_KNOWLEDGE_MAP[7]).toContain('liuXiang');
    expect(STEP_KNOWLEDGE_MAP[6]).toContain('后天');
  });

  it('params tiers', () => {
    expect(PARAMS.step.temperature).toBeLessThanOrEqual(0.6);
    expect(PARAMS.background.maxTokens).toBeLessThan(PARAMS.step.maxTokens);
  });

  it('refusal softener + sensitive fallback', () => {
    expect(REFUSAL_SOFTENER).toContain('研究');
    expect(isSensitiveCategory(undefined, '明天治病如何')).toBe(true);
    expect(isSensitiveCategory('求职', '面试')).toBe(false);
    expect(withSensitiveNotice('吉', '疾病')).toContain('不构成医疗');
    expect(STEP2_SYSTEM).toContain('gloss');
    expect(STEP9_SYSTEM).toContain('绝对');
    expect(STEP7_SYSTEM).toContain('类目库待补');
  });
});
