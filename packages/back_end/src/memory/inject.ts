import type { MemoryEntry } from '@meihua/shared';

import type { Store } from '../storage/store';
import { retrieve } from './retrieve';

export type ContextBundle = {
  profileCard: string;
  hot: MemoryEntry[];
  related: MemoryEntry[];
  roleCard?: string;
  anchors?: string[];
};

export const MEMORY_PROMISE =
  '以下为同档案历史背景，仅影响解释与措辞，不得改变卦与算式。';

/** W12 默认先天角色（可被 persons.role_card 覆盖） */
export const DEFAULT_ROLE_CARD = [
  '身份：梅花易数占卜师（仅供娱乐与学习）。',
  '口吻：现代白话，克制、具体、不恐吓，不铁口。',
  '术数：以体用、生克、卦象取类为主；先天数起古不取爻辞；应期给倾向不给死期。',
  '边界：不替代医疗/法律/投资；不改卦与算式；可承认不确定。',
].join('\n');

const ROLE_FORBIDDEN = [
  '改卦',
  '改公式',
  '改算式',
  '忽略规则',
  '忽略以上',
  '覆盖禁语',
  '无视系统',
  'ignore previous',
  'ignore all',
];

export function validateRoleCard(text: string): string | null {
  const t = text.toLowerCase();
  for (const w of ROLE_FORBIDDEN) {
    if (t.includes(w.toLowerCase())) return `角色稿含禁用词「${w}」`;
  }
  if (text.length > 2000) return '角色稿过长（≤2000 字）';
  return null;
}

function brief(m: MemoryEntry): string {
  const p = m.payload as Record<string, unknown>;
  const topic = String(p.topic ?? p.text ?? p.actual ?? '').slice(0, 40);
  const corr = p.userCorrection ? `｜纠偏：${String(p.userCorrection).slice(0, 24)}` : '';
  return `- [${m.type}] ${topic}${corr}`;
}

/** I 唯一渲染实现（W12：含角色与经验锚；块序固定） */
export function buildMemoryPrompt(bundle: ContextBundle): string {
  const lines: string[] = [];
  const role = (bundle.roleCard || '').trim();
  if (role) {
    lines.push('【角色】');
    lines.push(role);
    lines.push('');
  }
  lines.push(MEMORY_PROMISE);
  if (bundle.profileCard) {
    lines.push('【画像】');
    lines.push(bundle.profileCard);
  }
  if (bundle.hot.length) {
    lines.push('【近期】');
    for (const m of bundle.hot) lines.push(brief(m));
  }
  if (bundle.related.length) {
    lines.push('【相关】');
    for (const m of bundle.related) lines.push(brief(m));
  }
  if (bundle.anchors?.length) {
    lines.push('【经验】');
    for (const a of bundle.anchors.slice(0, 5)) lines.push(`- ${a}`);
  }
  return lines.join('\n');
}

export function buildContextBundle(opts: {
  profileCard?: string;
  hot?: MemoryEntry[];
  related?: MemoryEntry[];
  roleCard?: string;
  anchors?: string[];
}): ContextBundle {
  return {
    profileCard: opts.profileCard ?? '',
    hot: opts.hot ?? [],
    related: opts.related ?? [],
    roleCard: opts.roleCard ?? '',
    anchors: opts.anchors ?? [],
  };
}

/** W12 N1：角色 + 画像 + 热窗 + 相关 + 锚（user 前缀） */
export function buildPersonMemoryPrompt(
  store: Store,
  personId: string,
  opts?: { question?: string; guaName?: string; category?: string },
): string {
  const person = store.getPerson(personId);
  const roleCard = store.getRoleCard(personId) || DEFAULT_ROLE_CARD;
  const all = store.listMemories(personId).filter((m) => !m.rejected);
  const hot = all
    .filter((m) => m.type === 'round')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);
  const q = (opts?.question ?? '').replace(/\s+/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i < q.length - 1 && bigrams.length < 6; i++) {
    const g = q.slice(i, i + 2);
    if (/[一-鿿]{2}/.test(g)) bigrams.push(g);
  }
  const related = retrieve(store, personId, {
    keywords: bigrams,
    guaName: opts?.guaName,
    category: opts?.category,
    limit: 5,
  });
  const anchors = all
    .filter((m) => m.type === 'anchor')
    .map((m) => String((m.payload as { text?: string }).text ?? ''))
    .filter(Boolean)
    .slice(0, 5);
  return buildMemoryPrompt(
    buildContextBundle({
      roleCard,
      profileCard: person?.profileCard ?? '',
      hot,
      related,
      anchors,
    }),
  );
}
