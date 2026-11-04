import type {
  StepState,
  TiYongRelation,
  Verdict,
  VerdictGrade,
  StepId,
  WangShuaiLevel,
} from '@meihua/shared';
import { gradeFromYongTiWangShuai } from '@meihua/shared';

import type { LLMProvider } from '../llm/types';
import { tryParseJsonText } from '../llm/parse';
import { withSensitiveNotice } from './prompts/step7';
import { buildPersonaSystem, type PersonaId } from './prompts/persona';
import {
  buildRewritePrompt,
  fewshotBlock,
  validateCopy,
} from './copyCheck';

/** @deprecated 使用 gradeFromYongTiWangShuai（需旺衰） */
export function gradeFromShengKe(relation: TiYongRelation): VerdictGrade {
  return gradeFromYongTiWangShuai(relation, '平');
}

export function composeVerdict(opts: {
  steps: StepState[];
  relation?: TiYongRelation;
  /** 体卦旺衰；缺省=平（无节气月） */
  wangShuai?: WangShuaiLevel;
  category?: string;
  question?: string;
  summaryFromSteps?: string;
}): Verdict {
  const skip = new Set(['skipped_by_method', 'need_key', 'failed']);
  const basedOnSteps = opts.steps
    .filter((s) => !skip.has(s.status))
    .map((s) => s.stepId as StepId);

  const grade = opts.relation
    ? gradeFromYongTiWangShuai(opts.relation, opts.wangShuai ?? '平')
    : 'neutral';

  const conclusions = opts.steps
    .filter((s) => s.conclusion)
    .map((s) => s.conclusion);

  const summary = opts.summaryFromSteps
    ? opts.summaryFromSteps
    : conclusions.slice(0, 3).join('；');

  return {
    grade,
    summary: withSensitiveNotice(summary, opts.category, opts.question),
    points: [],
    advice: [],
    timing: '见步骤九',
    risks: conclusions.filter((c) => /克|耗|衰|凶|阻/.test(c)).slice(0, 3),
    basedOnSteps,
  };
}

type VerdictJson = {
  summary?: string;
  points?: { q: string; a: string }[];
  advice?: string[];
  timing?: string;
  risks?: string[];
};

const VERDICT_OUT = `只输出 JSON：{"summary":"","points":[{"q":"","a":""}],"advice":[],"timing":"","risks":[]}`;

/**
 * 占断人话化（G-03）：LLM 重写 summary/advice；失败保留骨架。
 * grade 永不来自 LLM。
 */
export async function enrichVerdictCopy(opts: {
  verdict: Verdict;
  llm: LLMProvider;
  offline?: boolean;
  persona?: PersonaId;
  question: string;
  stepConclusions: string[];
  /** W3：summary 散文流式 */
  onSummaryDelta?: (text: string) => void;
}): Promise<Verdict> {
  const v = opts.verdict;
  if (opts.offline) return v;

  const system = [
    buildPersonaSystem({ persona: opts.persona }),
    '你负责把九步结论合成给人读的占断说明。不要输出 grade。不要起新卦。',
    'summary 用 2～3 句话，第一句扣住所问；advice 2～3 条，动词开头、因问而异。',
    '禁止空话建议。' + VERDICT_OUT,
    fewshotBlock(opts.persona ?? 'feiyu'),
  ].join('\n');

  const user = [
    `所问：${opts.question}`,
    `吉凶档位（系统已定，勿改）：${v.grade}`,
    `步骤摘要：${opts.stepConclusions.slice(0, 9).join(' / ')}`,
  ].join('\n');

  const parseOut = (text: string): VerdictJson | null => {
    const j = (tryParseJsonText(text) ?? undefined) as VerdictJson | undefined;
    return j && typeof j === 'object' ? j : null;
  };

  const sanitize = (t: string): string =>
    (t ?? '').replace(/\s+/g, ' ').trim();

  try {
    // P0：summary 散文流（不流整包 JSON）
    const summarySys = [
      buildPersonaSystem({ persona: opts.persona }),
      '只写 2～3 句占断总说（人话），第一句扣住所问。不要 JSON，不要 grade，不要标题。',
      fewshotBlock(opts.persona ?? 'feiyu'),
    ].join('\n');
    const summaryUser = [
      `所问：${opts.question}`,
      `吉凶档位（勿改）：${v.grade}`,
      `步骤摘要：${opts.stepConclusions.slice(0, 9).join(' / ')}`,
    ].join('\n');
    const sumR = await opts.llm.streamChat({
      system: summarySys,
      messages: [{ role: 'user', content: summaryUser }],
      temperature: 0.55,
      maxTokens: 280,
      onDelta: opts.onSummaryDelta,
    });
    const summaryText = sanitize(sumR.text);

    // 次要字段 JSON（可不流）
    const r = await opts.llm.streamChat({
      system,
      messages: [
        {
          role: 'user',
          content: `${user}\n【总说已定，勿改】\n${summaryText}`,
        },
      ],
      temperature: 0.55,
      maxTokens: 500,
    });
    let out = parseOut(r.text);
    if (!out) {
      return {
        ...v,
        summary: summaryText || v.summary,
      };
    }
    const summary = summaryText || sanitize(out.summary ?? '') || v.summary;
    {
      const check = validateCopy(summary, {
        isSummary: true,
        where: 'summary',
      });
      let adviceList = (out.advice ?? []).map(sanitize).filter(Boolean).slice(0, 3);
      const adviceHits = adviceList.flatMap((a) =>
        validateCopy(a, { isAdvice: true, where: 'advice' }).hits,
      );
      if (!check.ok || adviceHits.length) {
        const hits = [...check.hits, ...adviceHits];
        const rr = await opts.llm.streamChat({
          system: '去 AI 腔改写，保持原意与长度约束，不要恐吓。',
          messages: [
            {
              role: 'user',
              content: buildRewritePrompt(
                JSON.stringify({ summary, advice: adviceList }),
                hits,
              ),
            },
          ],
          temperature: 0.5,
          maxTokens: 400,
        });
        const fixed = parseOut(rr.text);
        if (
          fixed?.summary &&
          validateCopy(fixed.summary, { isSummary: true }).ok
        ) {
          out = fixed;
          adviceList = (fixed.advice ?? adviceList)
            .map(sanitize)
            .filter(Boolean)
            .slice(0, 3);
          return {
            ...v,
            summary: sanitize(fixed.summary) || summary,
            advice: adviceList,
            points: (fixed.points ?? v.points).slice(0, 5),
            timing: sanitize(fixed.timing ?? '') || v.timing,
            risks: (fixed.risks ?? v.risks)
              .map((x) => sanitize(x ?? ''))
              .filter(Boolean)
              .slice(0, 3),
          };
        }
        return {
          ...v,
          summary: check.ok ? summary : v.summary,
          advice: adviceHits.length ? v.advice : adviceList,
        };
      }
      return {
        ...v,
        summary,
        advice: adviceList,
        points: (out.points ?? v.points).slice(0, 5),
        timing: sanitize(out.timing ?? '') || v.timing,
        risks: (out.risks ?? v.risks)
          .map((x) => sanitize(x ?? ''))
          .filter(Boolean)
          .slice(0, 3),
      };
    }
  } catch {
    return v;
  }
}
