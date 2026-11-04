import type {
  CastResult,
  StepId,
  StepState,
  TiYongRelation,
  WangShuaiLevel,
} from '@meihua/shared';
import {
  METHOD_POLARITY,
  STEP_TITLES,
  GUA_WUXING,
  GUA_NAME_ZH,
  relationFromYongTi,
} from '@meihua/shared';

import type { KnowledgeQuery } from '../knowledge/query';

export function isStep6Skipped(method: CastResult['method']): boolean {
  return METHOD_POLARITY[method] === 'xiantian';
}

function nowIso(): string {
  return new Date().toISOString();
}

export function ruleStep1(cast: CastResult): StepState {
  return {
    stepId: 1,
    status: 'confirmed',
    conclusion: `本卦${cast.ben.name}，互${cast.hu.name ?? '—'}，变${cast.bian.name}，动爻${cast.movingYao}`,
    evidence: cast.tiYongNote,
    sources: [],
    updatedAt: nowIso(),
  };
}

export function ruleStep3(cast: CastResult): StepState {
  const zh = (g: string) => GUA_NAME_ZH[g as keyof typeof GUA_NAME_ZH] ?? g;
  return {
    stepId: 3,
    status: 'confirmed',
    conclusion: `${cast.tiYongNote}；体${zh(cast.ti)}，用${zh(cast.yong)}`,
    sources: [],
    updatedAt: nowIso(),
  };
}

export function ruleStep4(
  cast: CastResult,
  k: KnowledgeQuery,
): { state: StepState; relation: TiYongRelation } {
  const yongEl = GUA_WUXING[cast.yong];
  const tiEl = GUA_WUXING[cast.ti];
  // v2 唯一入口：yong_ke=用克体，ti_ke=体克用（规格 §5.1）
  const relation = relationFromYongTi(yongEl, tiEl);
  const text = k.tiyongDuan(relation);
  return {
    relation,
    state: {
      stepId: 4,
      status: 'confirmed',
      conclusion: text,
      evidence: `用${cast.yong}对体${cast.ti}`,
      sources: [],
      updatedAt: nowIso(),
    },
  };
}

/** 体卦旺衰（规格 §5.6）；无节气月=平 */
export function tiWangShuai(
  cast: CastResult,
  k: KnowledgeQuery,
): WangShuaiLevel {
  const key = cast.lunar?.jieqiMonthKey;
  if (!key) return '平';
  try {
    const ws = k.wangShuai(key);
    if (ws.strong.includes(cast.ti)) return '旺';
    if (ws.weak.includes(cast.ti)) return '衰';
    return '平';
  } catch {
    return '平';
  }
}

export function ruleStep5(cast: CastResult, k: KnowledgeQuery): StepState {
  const key = cast.lunar?.jieqiMonthKey;
  if (!key) {
    return {
      stepId: 5,
      status: 'confirmed',
      conclusion: '未提供节气月，暂不作旺衰加减',
      sources: [],
      updatedAt: nowIso(),
    };
  }
  const ws = k.wangShuai(key);
  const tiInStrong = ws.strong.includes(cast.ti);
  const tiInWeak = ws.weak.includes(cast.ti);
  const note = tiInStrong
    ? '体卦当令旺'
    : tiInWeak
      ? '体卦当令衰'
      : '体卦平（未列入旺衰）';
  return {
    stepId: 5,
    status: 'confirmed',
    conclusion: `${key}月：${note}`,
    evidence: `strong=${ws.strong.join(',')} weak=${ws.weak.join(',')}`,
    sources: [],
    updatedAt: nowIso(),
  };
}

export function ruleStep6Skip(): StepState {
  return {
    stepId: 6,
    status: 'skipped_by_method',
    conclusion: '先天法古不取爻辞，本步仅供参考',
    sources: [],
    updatedAt: nowIso(),
  };
}

export function ruleStep6Houtian(cast: CastResult, k: KnowledgeQuery): StepState {
  const ci = k.guaCi(cast.ben.kingwen);
  const line = k.lineText(cast.ben.kingwen, cast.movingYao);
  return {
    stepId: 6,
    status: 'confirmed',
    conclusion: `卦辞：${ci}；动爻：${line}`,
    sources: [{ id: `kw.${cast.ben.kingwen}`, title: cast.ben.name }],
    updatedAt: nowIso(),
  };
}

export function offlineStep(id: StepId): StepState {
  return {
    stepId: id,
    status: 'need_key',
    conclusion: '需配置 API Key 后解读',
    sources: [],
    updatedAt: nowIso(),
  };
}

export function stepTitle(id: StepId): string {
  return STEP_TITLES[id];
}

export { isStep6Skipped as isXiantian };
