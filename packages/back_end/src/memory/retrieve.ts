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

  const now = Date.now();
  const scoreOf = (m: MemoryEntry): number => {
    let score = 0;
    const body = JSON.stringify(m.payload);
    for (const k of keys) {
      if (m.tags.some((t) => t.includes(k))) score += 3;
      if (body.includes(k)) score += 1;
    }
    // 时间衰减：90 天内线性，越新越高
    const t = Date.parse(m.createdAt);
    if (!Number.isNaN(t)) {
      const days = (now - t) / 86400000;
      score += Math.max(0, 1 - days / 90) * 2;
    }
    // 类型权重：偏好/锚点比流水更值得被想起
    if (m.type === 'preference' || m.type === 'anchor') score += 1;
    return score;
  };

  const hits = all.filter((m) => {
    if (keys.length === 0) return true;
    const tagHit = m.tags.some((t) => keys.some((k) => t.includes(k)));
    const body = JSON.stringify(m.payload);
    return tagHit || keys.some((k) => body.includes(k));
  });

  hits.sort((a, b) => scoreOf(b) - scoreOf(a));
  return hits.slice(0, limit);
}
