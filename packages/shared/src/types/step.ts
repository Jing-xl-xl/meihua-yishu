export type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type StepStatus =
  | 'pending'
  | 'running'
  | 'confirmed'
  | 'revised'
  | 'failed'
  | 'skipped_by_method'
  | 'need_key';

export type SourceRef = {
  id: string;
  title: string;
  quote?: string;
};

export type StepState = {
  stepId: StepId;
  status: StepStatus;
  conclusion: string;
  evidence?: string;
  sources: SourceRef[];
  reasoningNote?: string;
  updatedAt: string;
};
