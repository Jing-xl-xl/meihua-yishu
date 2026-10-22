import type { MemoryEntry } from '@meihua/shared';

import type { Store } from '../storage/store';
import { writeSummaryRow } from './write';

/** 纯拼接：新插 summary，删除被合并的 round */
export function compactMemories(
  store: Store,
  personId: string,
  opts?: { before?: string },
): { merged: number } {
  const all = store.listMemories(personId).filter((m) => m.type === 'round');
  const cutoff = opts?.before;
  const rounds = cutoff
    ? all.filter((m) => m.createdAt <= cutoff)
    : all;

  if (rounds.length < 2) {
    return { merged: 0 };
  }

  const text = rounds
    .map((m) => {
      const p = m.payload as {
        topic?: string;
        userCorrection?: string;
        conclusionBrief?: string;
      };
      return [p.topic, p.userCorrection, p.conclusionBrief]
        .filter(Boolean)
        .join('｜');
    })
    .join('\n');

  const newest = rounds.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  writeSummaryRow(
    store,
    personId,
    text,
    ['summary'],
    (newest as MemoryEntry).createdAt,
  );

  for (const r of rounds) {
    store.deleteMemory(r.id);
  }
  return { merged: rounds.length };
}
