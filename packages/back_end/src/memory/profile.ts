import type { Case, Person, Verdict } from '@meihua/shared';
import {
  buildProfileCopy,
  computeProfileAxes,
  type ProfileAxes,
} from '@meihua/shared';

import type { LLMProvider } from '../llm/types';
import { tryParseJsonText } from '../llm/parse';
import type { Store } from '../storage/store';

export type { ProfileAxes };

export type ProfileCard = {
  version: 1;
  caseCount: number;
  /** 性格特质 */
  nature: string;
  /** 所求所念 */
  desire: string;
  /** 处事风格 */
  style: string;
  /** 相处之道 */
  with: string;
  /** 素描 ≤30 字 */
  sketch: string;
  updatedAt: string;
  generatedBy: 'llm' | 'rule';
  axes?: ProfileAxes;
  /** 兼容旧字段 */
  domains?: string;
  verification?: string;
  communication?: string;
};

export const PROFILE_THRESHOLD = 5;

const METHOD_ZH: Record<string, string> = {
  number1: '一数报数',
  number2: '二数报数',
  number3: '三数报数',
  datetime: '年月日时',
  direction: '端法',
  objectCount: '物数',
  text: '字占',
  measure: '丈尺',
  zhangchi: '丈尺',
  chicun: '尺寸',
};

function methodZh(m: string | undefined): string {
  if (!m) return '';
  return METHOD_ZH[m] ?? m;
}

/** 稍文白话 · 由六维句库拼装（§6.2）→ shared buildProfileCopy */
function buildNature(axes: ProfileAxes): string {
  return buildProfileCopy(axes).nature;
}

function buildDesire(axes: ProfileAxes, domains: string): string {
  const c = buildProfileCopy(axes);
  if (axes.explore < 55 && axes.home < 55 && axes.social < 55 && domains && domains !== '样本不足') {
    return `常问${domains.split('·')[0]?.trim() ?? '日常诸事'}，求心中有数。`;
  }
  return c.desire;
}

function buildStyle(axes: ProfileAxes): string {
  return buildProfileCopy(axes).style;
}

function buildWith(axes: ProfileAxes): string {
  return buildProfileCopy(axes).with;
}

function buildSketch(axes: ProfileAxes): string {
  return buildProfileCopy(axes).sketch;
}

export function parseProfileCard(raw: string | null | undefined): ProfileCard | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  try {
    const j = JSON.parse(t) as ProfileCard;
    return j?.version === 1 ? j : null;
  } catch {
    return null;
  }
}

export function ruleProfileCard(store: Store, personId: string): ProfileCard {
  const cases = store.listCases(personId);
  const done = cases.filter((c) => c.verdict) as Array<
    Case & { verdict?: Verdict }
  >;
  const caseCount = store.countCompletedCases(personId);

  const cat: Record<string, number> = {};
  for (const c of done) {
    const k = c.input.category || '未分类';
    cat[k] = (cat[k] ?? 0) + 1;
  }
  const domains =
    Object.keys(cat).length === 0
      ? '样本不足'
      : Object.entries(cat)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([k, v]) => `${k} ${v}`)
          .join(' · ');

  const methods: Record<string, number> = {};
  for (const c of done) {
    const m = methodZh(c.method);
    if (m) methods[m] = (methods[m] ?? 0) + 1;
  }
  const methodLine = Object.entries(methods)
    .map(([k, v]) => `${k}×${v}`)
    .join('，');

  const styleBits: string[] = [];
  const qs = done.map((c) => c.input.question ?? '').filter(Boolean);
  if (qs.length >= 3) {
    const avg = Math.round(qs.reduce((n, s) => n + s.length, 0) / qs.length);
    styleBits.push(`问题多为${avg}字上下`);
  } else {
    styleBits.push('样本不足');
  }
  if (methodLine) styleBits.push(`常用：${methodLine}`);

  const mems = store.listMemories(personId).filter((m) => !m.rejected);
  let yes = 0;
  let no = 0;
  let partial = 0;
  for (const m of mems) {
    const p = m.payload as { accuracy?: string };
    if (m.type !== 'result') continue;
    if (p.accuracy === 'yes') yes += 1;
    else if (p.accuracy === 'no') no += 1;
    else if (p.accuracy === 'partial') partial += 1;
  }
  const verification =
    yes + no + partial === 0
      ? '暂无回填'
      : `回填应验 ${yes} · 部分 ${partial} · 未验 ${no}`;

  const feedbackIds = new Set<string>();
  for (const m of mems) {
    if (m.type !== 'result') continue;
    const cid = (m as { caseId?: string }).caseId;
    if (cid) feedbackIds.add(cid);
  }
  // 兜底：result 无 caseId 时用条数（规格 §6.2b）
  const axes = computeProfileAxes(
    done as never,
    feedbackIds.size > 0
      ? feedbackIds
      : new Set(Array.from({ length: yes + no + partial }, (_, i) => `r${i}`)),
  );

  return {
    version: 1,
    caseCount,
    nature: buildNature(axes),
    desire: buildDesire(axes, domains),
    style: buildStyle(axes),
    with: buildWith(axes),
    sketch: buildSketch(axes),
    updatedAt: new Date().toISOString(),
    generatedBy: 'rule',
    axes,
    domains,
    verification,
    communication: '按当前语气就事说事；建议条具体、可执行。',
  };
}

const LLM_SYSTEM = `你是画像润色者。只润色给定骨架，禁止新增性格断言、禁止命理判词（注定/必…之命）、禁止恐吓。
风格：稍文白话，如「其人持重…」。
输出 JSON：{"nature":"","desire":"","style":"","with":"","sketch":""}
sketch 不超过 30 字。语料不足写「样本尚浅」。`;

export async function llmProfileCard(
  store: Store,
  personId: string,
  llm: LLMProvider,
  offline?: boolean,
): Promise<ProfileCard> {
  const base = ruleProfileCard(store, personId);
  if (offline) return base;
  const cases = store
    .listCases(personId)
    .filter((c) => c.verdict)
    .slice(-12);
  const lines = cases.map(
    (c) =>
      `- ${c.input.question ?? ''}｜${c.input.category ?? ''}｜${c.method ?? ''}`,
  );
  const mems = store
    .listMemories(personId)
    .filter((m) => !m.rejected && m.type === 'result')
    .slice(-8)
    .map((m) => {
      const p = m.payload as { actual?: string; accuracy?: string };
      return `- 回填：${p.accuracy ?? ''} ${String(p.actual ?? '').slice(0, 40)}`;
    });
  const user = [
    `完成求卦 ${base.caseCount} 次`,
    '【问题样本】',
    ...lines,
    '【回填样本】',
    ...(mems.length ? mems : ['（无）']),
  ].join('\n');
  try {
    const r = await llm.streamChat({
      system: LLM_SYSTEM,
      messages: [{ role: 'user', content: user }],
      temperature: 0.3,
      maxTokens: 400,
    });
    const j = (tryParseJsonText(r.text) ?? null) as Partial<ProfileCard> | null;
    if (!j) return base;
    const pick = (s: unknown, fallback: string) => {
      const t = String(s ?? '').trim();
      return t && t !== '样本不足' ? t.slice(0, 80) : fallback;
    };
    return {
      version: 1,
      caseCount: base.caseCount,
      nature: pick(j.nature, base.nature),
      desire: pick(j.desire, base.desire),
      style: pick(j.style, base.style),
      with: pick(j.with, base.with),
      sketch: pick(j.sketch, base.sketch),
      updatedAt: new Date().toISOString(),
      generatedBy: 'llm',
      axes: base.axes,
      domains: base.domains,
      verification: base.verification,
    };
  } catch {
    return base;
  }
}

export function serializeProfileCard(card: ProfileCard): string {
  return JSON.stringify(card);
}

/** 门槛满足才写库；返回卡片或 null（未达标） */
export async function refreshProfileCard(opts: {
  store: Store;
  personId: string;
  llm?: LLMProvider;
  offline?: boolean;
  force?: boolean;
}): Promise<ProfileCard | null> {
  const { store, personId } = opts;
  const n = store.countCompletedCases(personId);
  if (n < PROFILE_THRESHOLD) return null;
  const card = opts.llm
    ? await llmProfileCard(store, personId, opts.llm, opts.offline)
    : ruleProfileCard(store, personId);
  store.updateProfileCard(personId, serializeProfileCard(card));
  return card;
}

/** 兼容旧调用：规则刷新 */
export function updateProfileCard(store: Store, personId: string): string {
  const n = store.countCompletedCases(personId);
  if (n < PROFILE_THRESHOLD) {
    return `求卦满 ${PROFILE_THRESHOLD} 次后生成画像（当前 ${n}）`;
  }
  const card = ruleProfileCard(store, personId);
  const s = serializeProfileCard(card);
  store.updateProfileCard(personId, s);
  return s;
}

export type { Person };
