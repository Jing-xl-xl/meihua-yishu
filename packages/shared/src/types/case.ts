import type { DualGua, MovingYaoPosition, Gua } from './base';
import type { CastMethod, FormulaStep } from './cast';
import type { StepState } from './step';
import type { CaseInput } from './session';
import type { Verdict } from './verdict';
import type { StepId } from './step';

export type CaseRecord = {
  id: string;
  sessionId: string;
  personId: string;
  input: CaseInput;
  method: CastMethod;
  methodReason?: string;
  methodOverridden?: boolean;
  /** 算式步骤串 */
  formula: FormulaStep[];
  hex: {
    ben: string;
    hu: DualGua;
    bian: string;
    movingYao: MovingYaoPosition;
    ti: Gua;
    yong: Gua;
  };
  steps: Pick<
    StepState,
    'stepId' | 'status' | 'conclusion' | 'evidence' | 'reasoningNote'
  >[];
  verdict: Verdict;
  actual?: string;
  accuracy?: 'yes' | 'partial' | 'no';
  deviationNotes?: string;
  deviationSteps?: StepId[];
  feedbackAt?: string;
  createdAt: string;
};
