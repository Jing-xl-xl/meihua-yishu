import type { Confidence, Gua } from './base';
import type { CastMethod, CastResult } from './cast';
import type { StepId, StepState, SourceRef } from './step';
import type { Verdict } from './verdict';

export type ObjectGuaCandidate = {
  gua: Gua;
  reason: string;
  confidence: Confidence;
};

export type SSEEvent =
  | {
      type: 'route';
      caseId: string;
      data: {
        method: CastMethod;
        reason: string;
        confidence: Confidence;
        missing?: string[];
        objectGuaCandidates?: ObjectGuaCandidate[];
      };
    }
  | { type: 'cast'; caseId: string; data: CastResult }
  | {
      type: 'step_start';
      caseId: string;
      data: { stepId: StepId; title: string };
    }
  | {
      type: 'step_delta';
      caseId: string;
      data: {
        stepId: StepId;
        field: 'conclusion' | 'evidence' | 'reasoningNote';
        text: string;
      };
    }
  | {
      type: 'step_sources';
      caseId: string;
      data: { stepId: StepId; sources: SourceRef[] };
    }
  | { type: 'step_done'; caseId: string; data: StepState }
  | {
      type: 'need_input';
      caseId: string;
      data: { stepId?: StepId; question: string; options?: string[] };
    }
  | { type: 'step_revised'; caseId: string; data: StepState }
  | { type: 'verdict'; caseId: string; data: Verdict }
  | {
      type: 'memory_written';
      caseId: string;
      data: { memoryIds: string[] };
    }
  | {
      type: 'error';
      caseId: string;
      data: { code: string; message: string; stepId?: StepId };
    }
  | {
      type: 'done';
      caseId: string;
      data: { caseId: string; sessionId: string };
    };
