import type { StepId } from '../types/step';
import { STEP_IDS } from '../constants/steps';

export function isStepId(v: unknown): v is StepId {
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    (STEP_IDS as readonly number[]).includes(v)
  );
}
