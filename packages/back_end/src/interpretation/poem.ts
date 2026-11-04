import type { Verdict, VerdictGrade, VerdictPoem } from '@meihua/shared';

import type { LLMProvider } from '../llm/types';
import { tryParseJsonText } from '../llm/parse';
import {
  buildPoemPersonaLine,
  validateMainText,
  type PersonaId,
} from './prompts/persona';

/** 规格 §3.5：仅「有 Key 且 LLM 失败」使用；无 Key 禁止出联句 */
export const FALLBACK_POEMS: Record<VerdictGrade, [string, string]> = {
  great: ['风助帆轻自可期', '前程不必更迟疑'],
  good: ['用生体可徐图之', '守正待时事易成'],
  neutral: ['平处徐行休躁进', '心安理得自从容'],
  bad: ['用克体事宜缓行', '守正待时祸不成'],
  terrible: ['外势相凌宜暂守', '强行多咎不如休'],
};

const FORBIDDEN = [
  '必死',
  '定凶灾',
  '死定了',
  '灭门',
  '血光',
  '死期',
  '必败无疑',
];

const JI = /吉|顺|成|助|安|喜|旺|利/;
const XIONG = /凶|败|祸|咎|耗|阻|难|衰/;

export function hanCount(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (/[一-鿿]/.test(ch)) n += 1;
  }
  return n;
}

export function parsePoemLines(raw: {
  lines?: unknown;
  text?: unknown;
}): [string, string] | null {
  if (Array.isArray(raw.lines) && raw.lines.length >= 2) {
    const a = String(raw.lines[0] ?? '').trim();
    const b = String(raw.lines[1] ?? '').trim();
    return [a, b];
  }
  const text = String(raw.text ?? '').trim();
  if (!text) return null;
  const parts = text
    .split(/\n|，|。|；|;/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return [parts[0]!, parts[1]!];
  return null;
}

export function validatePoemLines(
  lines: [string, string],
  grade: VerdictGrade,
): string | null {
  const [a, b] = lines;
  if (hanCount(a) !== 7) return 'upper not 7 han';
  if (hanCount(b) !== 7) return 'lower not 7 han';
  if (/[，。；、！？：,.;!?]/.test(a) || /[，。；、！？：,.;!?]/.test(b)) {
    return 'no punct inside lines';
  }
  const blob = a + b;
  for (const w of FORBIDDEN) {
    if (blob.includes(w)) return `forbidden: ${w}`;
  }
  const good = grade === 'great' || grade === 'good';
  const bad = grade === 'bad' || grade === 'terrible';
  const aJi = JI.test(a) && !XIONG.test(a);
  const aXiong = XIONG.test(a) && !JI.test(a);
  const bJi = JI.test(b) && !XIONG.test(b);
  const bXiong = XIONG.test(b) && !JI.test(b);
  if (good && (aXiong || bXiong)) return 'grade good but xiong imagery';
  if (bad && (aJi || bJi)) return 'grade bad but ji imagery';
  if (aJi && bXiong) return 'mixed up-down';
  if (aXiong && bJi) return 'mixed up-down';
  return null;
}

export function makePoem(
  lines: [string, string],
  source: 'llm' | 'rule',
): VerdictPoem {
  return {
    lines,
    text: `${lines[0]}\n${lines[1]}`,
    source,
  };
}

export function fallbackPoem(grade: VerdictGrade): VerdictPoem {
  return makePoem(FALLBACK_POEMS[grade] ?? FALLBACK_POEMS.neutral, 'rule');
}

const POEM_SYSTEM_BASE = `你是签诗写手，为梅花易数签牌写两句七言。
规则：上句恰7个汉字，下句恰7个汉字；句内不要标点；上下句意脉相连；紧扣所问之事与卦象意象；与吉凶档同向；禁止恐吓与绝对化。
只输出 JSON：{"lines":["上句","下句"]}`;

function poemSystem(persona?: PersonaId): string {
  return `${POEM_SYSTEM_BASE}\n${buildPoemPersonaLine(persona)}`;
}

export function buildPoemUser(opts: {
  question: string;
  benName: string;
  movingYao: number;
  grade: VerdictGrade;
  gradeLabel: string;
  tiYongNote?: string;
  stepBrief?: string;
}): string {
  return [
    `所问之事：${opts.question || '（未填）'}`,
    `本卦：${opts.benName}；动爻：${opts.movingYao}`,
    `吉凶档：${opts.gradeLabel}（${opts.grade}）`,
    opts.tiYongNote ? `体用：${opts.tiYongNote}` : '',
    opts.stepBrief ? `摘要：${opts.stepBrief}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function isKeyErr(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return (
    code === 'NO_API_KEY' ||
    code === 'LLM_UNAUTHORIZED' ||
    code === 'LLM_UNAVAILABLE'
  );
}

/**
 * 有 Key：LLM 两句七言；失败重试 1 次 → §3.5 fallback。
 * 无 Key / offline：返回 undefined（UI「诗签暂缺」）。
 */
export async function generateSignPoem(opts: {
  llm: LLMProvider;
  offline?: boolean;
  question: string;
  benName: string;
  movingYao: number;
  grade: VerdictGrade;
  gradeLabel: string;
  tiYongNote?: string;
  stepBrief?: string;
  persona?: PersonaId;
  /** P1：上句→下句 delta */
  onPoemLine?: (line: 'upper' | 'lower', text: string) => void;
}): Promise<VerdictPoem | undefined> {
  if (opts.offline) return undefined;

  const user = buildPoemUser(opts);
  const sys = poemSystem(opts.persona);
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await opts.llm.streamChat({
        system: sys,
        messages: [
          {
            role: 'user',
            content: i === 0 ? user : `${user}\n\n【上次输出问题】\n${String(lastErr)}`,
          },
        ],
        temperature: 0.8,
        maxTokens: 80,
      });
      const json =
        (r.json as { lines?: unknown; text?: unknown } | undefined) ??
        (tryParseJsonText(r.text) as { lines?: unknown; text?: unknown } | null);
      const lines = parsePoemLines(json ?? {});
      if (!lines) {
        lastErr = 'not json lines';
        continue;
      }
      const err = validatePoemLines(lines, opts.grade);
      if (err) {
        lastErr = err;
        continue;
      }
      const blob = `${lines[0]}${lines[1]}`;
      const ban = validateMainText(blob);
      if (!ban.ok) {
        lastErr = `forbidden: ${ban.hits.join(',')}`;
        continue;
      }
      // 校验通过后再分句 delta（禁半句悬挂）
      opts.onPoemLine?.('upper', lines[0]);
      opts.onPoemLine?.('lower', lines[1]);
      return makePoem(lines, 'llm');
    } catch (e) {
      if (isKeyErr(e)) return undefined;
      lastErr = e;
    }
  }
  // 有 Key 但生成失败 → fallback（禁用于无 Key）
  return fallbackPoem(opts.grade);
}

export async function attachSignPoem(
  verdict: Verdict,
  opts: {
    llm: LLMProvider;
    offline?: boolean;
    question: string;
    benName: string;
    movingYao: number;
    tiYongNote?: string;
    gradeLabel: string;
    stepBrief?: string;
    persona?: PersonaId;
    onPoemLine?: (line: 'upper' | 'lower', text: string) => void;
  },
): Promise<Verdict> {
  if (verdict.poem) return verdict;
  const poem = await generateSignPoem({
    llm: opts.llm,
    offline: opts.offline,
    question: opts.question,
    benName: opts.benName,
    movingYao: opts.movingYao,
    grade: verdict.grade,
    gradeLabel: opts.gradeLabel,
    tiYongNote: opts.tiYongNote,
    stepBrief: opts.stepBrief,
    persona: opts.persona,
    onPoemLine: opts.onPoemLine,
  });
  if (!poem) return verdict;
  return { ...verdict, poem };
}
