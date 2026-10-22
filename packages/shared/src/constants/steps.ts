import type { StepId, StepStatus } from '../types/step';

export const STEP_IDS: readonly StepId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const STEP_TITLES: Record<StepId, string> = {
  1: '排盘',
  2: '观卦名',
  3: '定体用',
  4: '五行生克',
  5: '衰旺',
  6: '卦辞爻辞',
  7: '类象落地',
  8: '互变参断',
  9: '定应期',
};

export const STEP_STATUSES: readonly StepStatus[] = [
  'pending',
  'running',
  'confirmed',
  'revised',
  'failed',
  'skipped_by_method',
  'need_key',
];
