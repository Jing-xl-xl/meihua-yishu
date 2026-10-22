import type { Store } from '../storage/store';

export function updateProfileCard(store: Store, personId: string): string {
  const cases = store.listCases(personId);
  const mems = store.listMemories(personId).filter((m) => !m.rejected);

  const methods: Record<string, number> = {};
  for (const c of cases) {
    const m = c.method ?? 'unknown';
    methods[m] = (methods[m] ?? 0) + 1;
  }

  const hints: string[] = [];
  for (const m of mems) {
    const p = m.payload as { personalityHints?: string[] };
    for (const h of p.personalityHints ?? []) hints.push(h);
  }

  const lines: string[] = [];
  lines.push(
    `常用起卦：${Object.entries(methods)
      .map(([k, v]) => `${k}×${v}`)
      .join('，') || '暂无'}`,
  );
  if (hints.length) {
    lines.push(`线索：${hints.slice(0, 5).join('；')}`);
  }

  const card = lines.join('\n');
  store.updateProfileCard(personId, card);
  return card;
}
