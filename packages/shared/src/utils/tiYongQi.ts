import type { Element, Gua, MovingYaoPosition } from '../types/base';
import { GUA_WUXING } from '../constants/gua';
import { elementRelation, type ElementRelation } from './wuxing';

export type QiRelation = 'sheng' | 'ke' | 'bi_he' | 'xie' | 'bei_ke';
export type QiFlow = 'yong_to_ti' | 'ti_to_yong' | 'equal';

export type QiSegment = {
  stage: 'ben' | 'hu' | 'bian';
  ti: Gua;
  yong: Gua;
  tiEl: Element;
  yongEl: Element;
  raw: ElementRelation;
  relation: QiRelation;
  flow: QiFlow;
  label: string;
  plain: string;
};

/** 铁律：动爻所在为用，不动为体 */
export function tiYongFromMovingYao(
  movingYao: MovingYaoPosition | number,
  upper: Gua,
  lower: Gua,
): { ti: Gua; yong: Gua; tiSide: 'upper' | 'lower' } {
  const pos = Number(movingYao);
  if (pos <= 3) {
    return { ti: upper, yong: lower, tiSide: 'upper' };
  }
  return { ti: lower, yong: upper, tiSide: 'lower' };
}

/**
 * movingYao 仅判定「哪一半为用」（1–3 下侧为用 / 4–6 上侧为用）。
 * 与互卦是否包含该爻无关（互由 2–5 爻构成，动爻可在 1 或 6）。
 */
export function qiFromDual(
  _stage: 'hu' | 'bian',
  dual: { upper: Gua; lower: Gua },
  movingYao: MovingYaoPosition | number,
): { ti: Gua; yong: Gua } {
  const r = tiYongFromMovingYao(movingYao, dual.upper, dual.lower);
  return { ti: r.ti, yong: r.yong };
}

const RELATION_META: Record<
  QiRelation,
  { label: string; plain: string; flow: QiFlow }
> = {
  sheng: { label: '用生体', plain: '得助力', flow: 'yong_to_ti' },
  ke: { label: '用克体', plain: '被外压', flow: 'yong_to_ti' },
  bi_he: { label: '比和', plain: '相合', flow: 'equal' },
  xie: { label: '体生用', plain: '耗散', flow: 'ti_to_yong' },
  bei_ke: { label: '体克用', plain: '我主导', flow: 'ti_to_yong' },
};

export function mapRelation(raw: ElementRelation): QiRelation {
  switch (raw) {
    case 'sheng':
      return 'sheng';
    case 'ke':
      return 'ke';
    case 'bi_he':
      return 'bi_he';
    case 'bei_sheng':
      return 'xie';
    case 'bei_ke':
    default:
      return 'bei_ke';
  }
}

export function qiSegment(
  stage: QiSegment['stage'],
  ti: Gua,
  yong: Gua,
): QiSegment {
  const tiEl = GUA_WUXING[ti];
  const yongEl = GUA_WUXING[yong];
  const raw = elementRelation(yongEl, tiEl);
  const relation = mapRelation(raw);
  const meta = RELATION_META[relation];
  return {
    stage,
    ti,
    yong,
    tiEl,
    yongEl,
    raw,
    relation,
    flow: meta.flow,
    label: meta.label,
    plain: meta.plain,
  };
}

export function qiSegments(opts: {
  ben: { upper: Gua; lower: Gua };
  hu?: { upper: Gua; lower: Gua };
  bian?: { upper: Gua; lower: Gua };
  movingYao: MovingYaoPosition | number;
}): QiSegment[] {
  const out: QiSegment[] = [];
  const ben = tiYongFromMovingYao(opts.movingYao, opts.ben.upper, opts.ben.lower);
  out.push(qiSegment('ben', ben.ti, ben.yong));
  if (opts.hu) {
    const hu = qiFromDual('hu', opts.hu, opts.movingYao);
    out.push(qiSegment('hu', hu.ti, hu.yong));
  }
  if (opts.bian) {
    const bian = qiFromDual('bian', opts.bian, opts.movingYao);
    out.push(qiSegment('bian', bian.ti, bian.yong));
  }
  return out;
}

export function qiTrendPlain(segments: QiSegment[]): string {
  if (!segments.length) return '';
  if (segments.every((s) => s.relation === 'bi_he')) return '全程平顺相合';
  return segments.map((s) => s.plain).join(' → ');
}
