import type { StepId } from './step';

export type MemoryType = 'round' | 'result' | 'summary' | 'preference' | 'anchor';

export type AnchorMemory = {
  text: string;
  source?: 'manual' | 'llm' | 'feedback';
  caseId?: string;
};

export type RoundMemory = {
  sessionId: string;
  caseId: string;
  topic: string;
  castBrief: string;
  userCorrection?: string;
  modelAdoption?: string;
  conclusionBrief: string;
  personalityHints: string[];
};

export type ResultMemory = {
  sessionId: string;
  caseId: string;
  actual: string;
  accuracy: 'yes' | 'partial' | 'no';
  deviationSteps: StepId[];
  lessons: string[];
};

export type MemoryEntry = {
  id: string;
  personId: string;
  sessionId?: string;
  caseId?: string;
  type: MemoryType;
  payload: RoundMemory | ResultMemory | AnchorMemory | { text: string };
  tags: string[];
  rejected?: boolean;
  createdAt: string;
};
