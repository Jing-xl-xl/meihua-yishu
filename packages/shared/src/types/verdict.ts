import type { StepId } from './step';

export type VerdictGrade =
  | 'great'
  | 'good'
  | 'neutral'
  | 'bad'
  | 'terrible';

export type Verdict = {
  grade: VerdictGrade;
  summary: string;
  points: { q: string; a: string }[];
  advice: string[];
  timing: string;
  risks: string[];
  /** 主断依据 stepId；不含 skipped_by_method / need_key */
  basedOnSteps: StepId[];
};
