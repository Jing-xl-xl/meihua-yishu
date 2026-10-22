import type { MemoryEntry } from '@meihua/shared';

import type { Store } from '../storage/store';

export type RetrieveQuery = {
  keywords?: string[];
  guaName?: string;
  category?: string;
  limit?: number;
};

/** 关键词/标签；排除 rejected；中文子串 */
export function retrieve(
  store: Store,
  personId: string,
  query: RetrieveQuery = {},
): MemoryEntry[] {
  const limit = query.limit ?? 5;
  const all = store
    .listMemories(personId)
    .filter((m) => !m.rejected);

  const keys = [
    ...(query.keywords ?? []),
    query.guaName,
    query.category,
  ].filter((x): x is string => Boolean(x));

  const hits = all.filter((m) => {
    if (keys.length === 0) return true;
    const tagHit = m.tags.some((t) => keys.some((k) => t.includes(k)));
    const body = JSON.stringify(m.payload);
    const bodyHit = keys.some((k) => body.includes(k));
    return tagHit || bodyHit;
  });

  hits.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return hits.slice(0, limit);
}
