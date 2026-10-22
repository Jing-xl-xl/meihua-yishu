import type {
  CastResult,
  StepId,
  StepState,
  TiYongRelation,
} from '@meihua/shared';
import {
  METHOD_POLARITY,
  STEP_TITLES,
  elementRelation,
  GUA_WUXING,
  GUA_NAME_ZH,
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
  // elementRelation(yong, ti)：用对体
  // sheng=用生体, ke=用克体, bei_sheng=体生用, bei_ke=体克用
  const relYongTi = elementRelation(yongEl, tiEl);
  let relation: TiYongRelation;
  let text: string;
  if (relYongTi === 'sheng') {
    relation = 'sheng';
    text = k.tiyongDuan('sheng');
  } else if (relYongTi === 'ke') {
    relation = 'ke';
    text = k.tiyongDuan('ke');
  } else if (relYongTi === 'bi_he') {
    relation = 'bi_he';
    text = k.tiyongDuan('bi_he');
  } else if (relYongTi === 'bei_sheng') {
    relation = 'xie';
    text = k.tiyongDuan('xie');
  } else {
    // bei_ke：体克用
    relation = 'bei_ke';
    text = k.tiyongDuan('bei_ke');
  }
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
