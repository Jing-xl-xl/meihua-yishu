import type {
  Case,
  CaseInput,
  CastMethod,
  DualGua,
  FormulaStep,
  Gua,
  MemoryEntry,
  MovingYaoPosition,
  Session,
  StepId,
  StepState,
  Verdict,
} from '@meihua/shared';

import type { Store } from '../storage/store';

export type ExportCase = {
  id: string;
  sessionId: string;
  personId: string;
  input: CaseInput;
  method?: CastMethod;
  methodReason?: string;
  methodOverridden?: boolean;
  formula: FormulaStep[];
  hex: {
    ben: string;
    hu: DualGua;
    bian: string;
    movingYao: MovingYaoPosition;
    ti: Gua;
    yong: Gua;
  };
  /** 不含 sources（溯源回查库） */
  steps: Pick<
    StepState,
    'stepId' | 'status' | 'conclusion' | 'evidence' | 'reasoningNote'
  >[];
  verdict?: Verdict;
  actual?: string;
  accuracy?: 'yes' | 'partial' | 'no';
  deviationNotes?: string;
  deviationSteps?: StepId[];
  feedbackAt?: string;
  createdAt: string;
};

export type ExportBundle = {
  version: 1;
  exportedAt: string;
  person: { id: string; name: string; profileCard?: string };
  sessions: Session[];
  cases: ExportCase[];
  /** 排除 rejected */
  memories: MemoryEntry[];
};

/** 唯一真源：H /api/export 只调用本函数 */
export function buildExportBundle(
  store: Store,
  personId: string,
): ExportBundle {
  const person = store.getPerson(personId);
  if (!person) {
    throw new Error(`person not found: ${personId}`);
  }
  const sessions = store.listSessions(personId);
  const rawCases = store.listCases(personId);

  const cases: ExportCase[] = rawCases.map((c: Case) => {
    const bundle = store.getCaseBundle(c.id);
    const fb = bundle?.feedback ?? null;
    const cast = c.cast;
    return {
      id: c.id,
      sessionId: c.sessionId,
      personId: c.personId,
      input: c.input,
      method: c.method,
      methodReason: c.methodReason,
      methodOverridden: c.methodOverridden,
      formula: cast?.formula ?? [],
      hex: {
        ben: cast?.ben.name ?? '',
        hu: cast?.hu ?? { upper: 'qian', lower: 'qian' },
        bian: cast?.bian.name ?? '',
        movingYao: cast?.movingYao ?? 1,
        ti: cast?.ti ?? 'qian',
        yong: cast?.yong ?? 'gen',
      },
      steps: (bundle?.steps ?? []).map((s) => ({
        stepId: s.stepId,
        status: s.status,
        conclusion: s.conclusion,
        evidence: s.evidence,
        reasoningNote: s.reasoningNote,
      })),
      verdict: c.verdict,
      actual: fb?.actual ?? undefined,
      accuracy: (fb?.accuracy as ExportCase['accuracy']) ?? undefined,
      deviationNotes: fb?.deviation_notes ?? undefined,
      deviationSteps: fb?.deviation_steps_json
        ? (JSON.parse(fb.deviation_steps_json) as StepId[])
        : undefined,
      feedbackAt: fb?.feedback_at ?? undefined,
      createdAt: c.createdAt,
    };
  });

  const memories = store
    .listMemories(personId)
    .filter((m) => !m.rejected);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    person: {
      id: person.id,
      name: person.name,
      profileCard: person.profileCard,
    },
    sessions,
    cases,
    memories,
  };
}
