import type {
  StepState,
  TiYongRelation,
  Verdict,
  VerdictGrade,
  StepId,
} from '@meihua/shared';

import { withSensitiveNotice } from './prompts/step7';

/** 步 4 关系 → grade；LLM 不判 grade */
export function gradeFromShengKe(relation: TiYongRelation): VerdictGrade {
  if (relation === 'xie') return 'neutral';
  if (relation === 'bei_ke') return 'bad';
  return 'good';
}

export function composeVerdict(opts: {
  steps: StepState[];
  relation?: TiYongRelation;
  category?: string;
  question?: string;
  summaryFromSteps?: string;
}): Verdict {
  const skip = new Set(['skipped_by_method', 'need_key', 'failed']);
  const basedOnSteps = opts.steps
    .filter((s) => !skip.has(s.status))
    .map((s) => s.stepId as StepId);

  const grade = opts.relation ? gradeFromShengKe(opts.relation) : 'neutral';

  const conclusions = opts.steps
    .filter((s) => s.conclusion)
    .map((s) => s.conclusion);

  const summary = opts.summaryFromSteps
    ? opts.summaryFromSteps
    : conclusions.slice(0, 3).join('；');

  return {
    grade,
    summary: withSensitiveNotice(summary, opts.category, opts.question),
    points: [],
    advice: [],
    timing: '见步骤九',
    risks: conclusions.filter((c) => /克|耗|衰|凶|阻/.test(c)).slice(0, 3),
    basedOnSteps,
  };
}
