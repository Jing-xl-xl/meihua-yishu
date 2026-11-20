import { describe, expect, it } from 'vitest';

import type { StepState, Verdict } from '@meihua/shared';

import { checkVerdictAgainstSteps } from './consistency';

const step = (id: number): StepState => ({
  stepId: id as never,
  status: 'confirmed',
  conclusion: '结论。',
  sources: [],
  updatedAt: new Date().toISOString(),
});

const base: Verdict = {
  grade: 'good',
  summary: '整体有助力，但成迟；先把材料理顺，别抢话，等对方先动。',
  advice: ['整理材料', '等对方先递台阶'],
  points: [],
  risks: [],
  timing: '戌亥月',
  basedOnSteps: [3, 4, 5],
};

describe('九步↔占断一致性', () => {
  it('正常占断通过', () => {
    expect(checkVerdictAgainstSteps(base, [step(3), step(4), step(5)]).ok).toBe(
      true,
    );
  });

  it('总断过短 / 建议不足 / 依据缺失会被拦', () => {
    const r = checkVerdictAgainstSteps(
      { ...base, summary: '能成。', advice: ['做准备'], basedOnSteps: [] },
      [step(3)],
    );
    expect(r.ok).toBe(false);
    expect(r.hits.join('/')).toContain('总断过短');
    expect(r.hits.join('/')).toContain('建议不足 2 条');
    expect(r.hits.join('/')).toContain('缺主断依据步骤');
  });

  it('引用未出的步骤会被拦', () => {
    const r = checkVerdictAgainstSteps(
      { ...base, basedOnSteps: [3, 8] },
      [step(3), step(4)],
    );
    expect(r.ok).toBe(false);
    expect(r.hits.join('/')).toContain('依据步骤未出：8');
  });
});
