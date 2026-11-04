import type { StepId } from './step';

export type VerdictGrade =
  | 'great'
  | 'good'
  | 'neutral'
  | 'bad'
  | 'terrible';

/** 签诗：lines[0]=上句，lines[1]=下句（逻辑序；展示右→左仅 CSS） */
export type VerdictPoem = {
  /** 派生：上句 + '\n' + 下句 */
  text: string;
  /** 真源 */
  lines: [string, string];
  source: 'llm' | 'rule';
};

export type Verdict = {
  grade: VerdictGrade;
  summary: string;
  points: { q: string; a: string }[];
  advice: string[];
  timing: string;
  risks: string[];
  /** 主断依据 stepId；不含 skipped_by_method / need_key */
  basedOnSteps: StepId[];
  /** v2 签诗；历史数据可无 */
  poem?: VerdictPoem;
};
