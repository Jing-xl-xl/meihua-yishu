/**
 * 解卦文案机检（规格 §7.1b 甲/乙/丙）+ few-shot + 占断 LLM 草稿
 */
import type { PersonaId } from './prompts/persona';

export type TellTier = 'hard' | 'limit' | 'usage';

export type TellHit = {
  tier: TellTier;
  token: string;
  where: string;
};

/** 甲 硬禁 */
export const HARD_TELLS: readonly string[] = [
  '综上所述',
  '总而言之',
  '总的来说',
  '简言之',
  '简单来说',
  '由此可见',
  '众所周知',
  '不难发现',
  '显而易见',
  '毋庸置疑',
  '值得注意的是',
  '需要指出的是',
  '具有重要意义',
  '我完全理解',
  '很好的问题',
  '一起探讨',
  '希望这对你有帮助',
  '作为AI',
  '作为ai',
  '作为助手',
  '让我来看看',
  '接下来我将',
  '同学们',
  '大家可以',
  '必定',
  '绝对',
  '百分之百',
  '命中注定',
  '必死',
  '死劫',
  '定凶灾',
  '灭门',
  '血光之灾',
  '死定了',
  '注定失败',
];

export const HARD_ADVICE_TELLS: readonly string[] = [
  '放平心态',
  '顺其自然',
  '保持良好心态',
  '一切都会好起来的',
  '相信自己',
];

/** 乙 限频：说明腔（主读禁 / note≤1） */
export const EXPLAIN_TELLS: readonly string[] = [
  '说明',
  '表明',
  '意味着',
  '反映出',
  '体现了',
  '揭示了',
];

/** 乙 限频：术语（单步 conclusion ≤1 且禁起句） */
export const TERM_TELLS: readonly string[] = ['体卦', '用卦', '体用', '生克'];

/** 乙 列举腔：≥2 连用禁 */
export const LIST_TELLS: readonly string[] = [
  '首先',
  '其次',
  '再次',
  '最后',
  '第一',
  '第二',
  '第三',
];

export function startsWithTerm(text: string): boolean {
  const t = (text ?? '').trim();
  for (const w of TERM_TELLS) {
    if (t.startsWith(w)) return true;
  }
  return LIST_TELLS.some((w) => t.startsWith(w));
}

export function countHits(text: string, words: readonly string[]): number {
  const src = text ?? '';
  let n = 0;
  for (const w of words) {
    let i = 0;
    for (;;) {
      const j = src.indexOf(w, i);
      if (j < 0) break;
      n += 1;
      i = j + w.length;
    }
  }
  return n;
}

export function detectTells(
  text: string,
  opts?: {
    where?: string;
    isAdvice?: boolean;
    isReasoningNote?: boolean;
    isSummary?: boolean;
  },
): TellHit[] {
  const where = opts?.where ?? 'text';
  const src = text ?? '';
  const hits: TellHit[] = [];
  for (const w of HARD_TELLS) {
    if (src.includes(w)) hits.push({ tier: 'hard', token: w, where });
  }
  if (opts?.isAdvice) {
    for (const w of HARD_ADVICE_TELLS) {
      if (src.includes(w)) hits.push({ tier: 'hard', token: w, where });
    }
  }
  // 乙
  const explainN = countHits(src, EXPLAIN_TELLS);
  if (opts?.isReasoningNote) {
    if (explainN > 1) {
      hits.push({ tier: 'limit', token: '说明腔>1', where });
    }
  } else if (explainN > 0) {
    hits.push({ tier: 'hard', token: '说明腔', where });
  }
  const termN = countHits(src, TERM_TELLS);
  if (!opts?.isSummary && termN > 1) {
    hits.push({ tier: 'limit', token: '术语>1', where });
  }
  if (opts?.isSummary && termN > 0) {
    hits.push({ tier: 'limit', token: '术语入summary', where });
  }
  if (startsWithTerm(src)) {
    hits.push({ tier: 'hard', token: '术语/列举起句', where });
  }
  // 丙
  const notBut = (src.match(/不是[^。！？]{1,20}，?而是/g) ?? []).length;
  if (notBut > 1) {
    hits.push({ tier: 'usage', token: '不是而是×2', where });
  }
  const bangs = (src.match(/！/g) ?? []).length;
  if (bangs > 1) {
    hits.push({ tier: 'usage', token: '感叹号>1', where });
  }
  return hits;
}

export function validateCopy(
  text: string,
  opts?: Parameters<typeof detectTells>[1],
): { ok: boolean; hits: TellHit[] } {
  const hits = detectTells(text, opts);
  return { ok: hits.length === 0, hits };
}

/** few-shot：只学语气（规格 §7.4） */
export const FEWSHOT_FEIYU: readonly string[] = [
  '你问的这东西多半没跑远，像是压在常待的地方或夹层里。我赌还在——说不准啊哈哈。先别乱翻，按最近顺手放的那几处掏一圈。',
  '面试这条线是顺的，就是慢热，更像走流程等回音。你把材料理顺，比临场加戏管用；要是问时候，先看有没有人正式找你。',
];

export const FEWSHOT_XIANSHENG: readonly string[] = [
  '你问的这件物，多半未离身边，像伏在常所。宜静寻不宜躁动；自近日顺手放置处逐一检视，或可见。',
  '此事有进益之势，然成迟，恐须过一重手续或候一音。当下宜备其分内，不宜强争；音至则易就。',
];

export function fewshotBlock(persona: PersonaId): string {
  const list = persona === 'xiansheng' ? FEWSHOT_XIANSHENG : FEWSHOT_FEIYU;
  return [
    '【口吻示例（只学语气与句式，禁止照抄示例里的具体事项）】',
    ...list.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
}

export function buildRewritePrompt(
  text: string,
  hits: TellHit[],
): string {
  const list = hits.map((h) => h.token).join('、');
  return [
    '请把下面这段解卦文字改得像人在就事论事，去掉 AI 腔。',
    `禁止再出现：${list}`,
    '不要新增卦理事实，不要恐吓；保持原意。',
    '原文：',
    text,
  ].join('\n');
}
