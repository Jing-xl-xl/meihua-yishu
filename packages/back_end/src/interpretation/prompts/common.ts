/** 文风与输出 schema（字段名与 shared StepState 一致：reasoningNote） */
export const STYLE_RULES = [
  '使用现代白话，忌绝对化与恐吓（禁止：必死、定凶灾、死定了等）',
  'conclusion 1～3 句；reasoningNote 不超过 2～3 句',
  '结论紧扣用户问题，可引用知识依据',
  '只输出 JSON（含 conclusion / evidence / reasoningNote / sources）',
  '不要输出 status；status 由系统写入',
  '正文只用纯文本：禁止 **、#、-、•、` 等 Markdown 符号',
].join('\n');

export const FORBIDDEN_WORDS = [
  '必死',
  '定死',
  '死定了',
  '凶灾',
  '家破人亡',
  '绝对',
  '百分之百',
];

export const STEP_JSON_SCHEMA_NOTE = `输出 JSON：
{
  "conclusion": "本步白话结论",
  "evidence": "可选依据摘要",
  "reasoningNote": "≤3 句推理备注",
  "sources": [{ "id": "锚点", "title": "标题" }]
}`;

export function truncateReasoning(
  note: string | undefined,
  max = 120,
): string | undefined {
  if (!note) return undefined;
  const s = note.trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function stripForbidden(text: string): string {
  let out = text;
  for (const w of FORBIDDEN_WORDS) {
    out = out.split(w).join('（措辞已软化）');
  }
  return out;
}

/** W8 R-3：去 Markdown 符号 */
export function plainText(text: string): string {
  return String(text ?? '')
    .replace(/\*\*|__|`|#+\s*/g, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanAssistantText(text: string): string {
  return plainText(stripForbidden(text));
}

/** 步 → 知识源注入 */
export const STEP_KNOWLEDGE_MAP: Record<number, string> = {
  1: '排盘摘要（系统给定）',
  2: 'fullName、gloss、卦名',
  3: '体用、问题',
  4: '五行关系、duanyu',
  5: 'wangshuai（月建）',
  6: 'guaCi、动爻爻辞（仅后天）',
  7: 'liuXiang + shibazhan + duanyu',
  8: 'hu / bian 名',
  9: 'yingqi / dongjing（可标待补）',
};

export const PARAMS = {
  step: { temperature: 0.5, maxTokens: 400 },
  background: { temperature: 0.7, maxTokens: 120 },
  verdict: { temperature: 0.5, maxTokens: 500 },
  ping: { temperature: 0, maxTokens: 16 },
} as const;
