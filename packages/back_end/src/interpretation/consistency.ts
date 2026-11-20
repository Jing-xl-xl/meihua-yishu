/**
 * 九步 ↔ 占断一致性检查（B：质量层）
 * 只做可机检的“形”与“依据”：
 * - 总断长度合理、建议 2–3 条
 * - 主断依据步骤必须真实存在于已出结论的步骤中，且不得引用未出的步骤
 * - 记忆引用 ≤1（引用计数在 persona 声纹里，这里只做结构校验）
 * 不判断“语义是否矛盾”（那需要更强的评判器，暂不做）。
 */

import type { StepState, Verdict } from '@meihua/shared';

export type ConsistencyResult = { ok: boolean; hits: string[] };

const HAN = /[\u4e00-\u9fff]/g;

function hanCount(s: string): number {
  return (s.match(HAN) ?? []).length;
}

export function checkVerdictAgainstSteps(
  verdict: Verdict,
  steps: StepState[],
): ConsistencyResult {
  const hits: string[] = [];
  const confirmed = steps.filter(
    (s) =>
      s.status === 'confirmed' ||
      s.status === 'revised',
  );
  const ids = new Set(confirmed.map((s) => s.stepId));

  const summary = (verdict.summary ?? '').trim();
  const n = hanCount(summary);
  if (n < 16) hits.push('总断过短');
  if (n > 220) hits.push('总断过长');

  const advice = (verdict.advice ?? []).filter((a) => a && a.trim());
  if (advice.length < 2) hits.push('建议不足 2 条');
  if (advice.length > 3) hits.push('建议超过 3 条');

  const based = verdict.basedOnSteps ?? [];
  if (based.length === 0) {
    hits.push('缺主断依据步骤');
  } else {
    const unknown = based.filter((id) => !ids.has(id as never));
    if (unknown.length) hits.push(`依据步骤未出：${unknown.join(',')}`);
  }

  return { ok: hits.length === 0, hits };
}
