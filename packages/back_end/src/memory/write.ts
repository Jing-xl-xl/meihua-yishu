import type { MemoryEntry, MemoryType, StepId } from '@meihua/shared';
import { newId } from '@meihua/shared';

import type { Store } from '../storage/store';

/** 中文 2-gram + 兜底词 */
export function autoTags(parts: {
  question?: string;
  fullName?: string;
  category?: string;
  method?: string;
  deviationSteps?: StepId[];
  extra?: string[];
}): string[] {
  const tags = new Set<string>();
  if (parts.fullName) tags.add(parts.fullName);
  if (parts.category) tags.add(parts.category);
  if (parts.method) tags.add(parts.method);
  for (const s of parts.deviationSteps ?? []) tags.add(`step${s}`);
  const q = (parts.question ?? '').replace(/\s+/g, '');
  for (let i = 0; i < q.length - 1; i++) {
    const bigram = q.slice(i, i + 2);
    if (/[一-鿿]{2}/.test(bigram)) tags.add(bigram);
  }
  for (const e of parts.extra ?? []) tags.add(e);
  return [...tags];
}

export function writeRound(
  store: Store,
  ctx: {
    personId: string;
    sessionId: string;
    caseId: string;
    topic: string;
    castBrief: string;
    userCorrection?: string;
    modelAdoption?: string;
    conclusionBrief: string;
    personalityHints?: string[];
    tags?: string[];
  },
): MemoryEntry {
  const entry: MemoryEntry = {
    id: newId(),
    personId: ctx.personId,
    sessionId: ctx.sessionId,
    caseId: ctx.caseId,
    type: 'round',
    payload: {
      sessionId: ctx.sessionId,
      caseId: ctx.caseId,
      topic: ctx.topic.slice(0, 40),
      castBrief: ctx.castBrief,
      userCorrection: ctx.userCorrection,
      modelAdoption: ctx.modelAdoption,
      conclusionBrief: ctx.conclusionBrief,
      personalityHints: ctx.personalityHints ?? [],
    },
    tags: ctx.tags ?? autoTags({ question: ctx.topic }),
    createdAt: new Date().toISOString(),
  };
  store.insertMemory(entry);
  return entry;
}

export function writeResult(
  store: Store,
  ctx: {
    personId: string;
    sessionId: string;
    caseId: string;
    actual: string;
    accuracy: 'yes' | 'partial' | 'no';
    deviationSteps: StepId[];
    lessons?: string[];
  },
): MemoryEntry {
  const entry: MemoryEntry = {
    id: newId(),
    personId: ctx.personId,
    sessionId: ctx.sessionId,
    caseId: ctx.caseId,
    type: 'result',
    payload: {
      sessionId: ctx.sessionId,
      caseId: ctx.caseId,
      actual: ctx.actual,
      accuracy: ctx.accuracy,
      deviationSteps: ctx.deviationSteps,
      lessons: ctx.lessons ?? [],
    },
    tags: autoTags({ deviationSteps: ctx.deviationSteps }),
    createdAt: new Date().toISOString(),
  };
  store.insertMemory(entry);
  return entry;
}

export function writePreference(
  store: Store,
  personId: string,
  text: string,
): MemoryEntry {
  const entry: MemoryEntry = {
    id: newId(),
    personId,
    type: 'preference',
    payload: { text },
    tags: autoTags({ question: text }),
    createdAt: new Date().toISOString(),
  };
  store.insertMemory(entry);
  return entry;
}

/** W12 经验锚 */
export function writeAnchor(
  store: Store,
  ctx: {
    personId: string;
    text: string;
    caseId?: string;
    source?: 'manual' | 'llm' | 'feedback';
  },
): MemoryEntry {
  const entry: MemoryEntry = {
    id: newId(),
    personId: ctx.personId,
    caseId: ctx.caseId,
    type: 'anchor',
    payload: {
      text: ctx.text.slice(0, 80),
      source: ctx.source ?? 'manual',
      caseId: ctx.caseId,
    },
    tags: autoTags({ question: ctx.text }),
    createdAt: new Date().toISOString(),
  };
  store.insertMemory(entry);
  return entry;
}

/** 仅 compact 使用 */
export function writeSummaryRow(
  store: Store,
  personId: string,
  text: string,
  tags: string[],
  createdAt: string,
): MemoryEntry {
  const entry: MemoryEntry = {
    id: newId(),
    personId,
    type: 'summary' as MemoryType,
    payload: { text },
    tags,
    createdAt,
  };
  store.insertMemory(entry);
  return entry;
}
