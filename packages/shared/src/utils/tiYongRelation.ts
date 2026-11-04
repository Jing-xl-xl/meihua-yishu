import type { Element } from '../types/base';
import type { VerdictGrade } from '../types/verdict';
import { elementRelation } from './wuxing';

/** v2 生克关系码（唯一对外；规格 §5.1） */
export type TiYongRelationV2 =
  | 'sheng' // 用生体
  | 'bi_he' // 体用比和
  | 'xie' // 体生用
  | 'yong_ke' // 用克体（旧码 ke）
  | 'ti_ke'; // 体克用（旧码 bei_ke）

export type WangShuaiLevel = '旺' | '平' | '衰';

/** 旧码 → v2（仅兼容；W2 后业务勿用旧码） */
export function legacyRelationToV2(
  legacy: string,
): TiYongRelationV2 | undefined {
  switch (legacy) {
    case 'sheng':
    case 'bi_he':
    case 'xie':
    case 'yong_ke':
    case 'ti_ke':
      return legacy;
    case 'ke':
      return 'yong_ke';
    case 'bei_ke':
      return 'ti_ke';
    default:
      return undefined;
  }
}

/**
 * 唯一生产入口：用对体（规格 §5.1）。
 * elementRelation(yong, ti)：sheng=用生体, ke=用克体, bei_sheng=体生用, bei_ke=体克用
 */
export function relationFromYongTi(
  yongEl: Element,
  tiEl: Element,
): TiYongRelationV2 {
  const raw = elementRelation(yongEl, tiEl);
  switch (raw) {
    case 'sheng':
      return 'sheng';
    case 'ke':
      return 'yong_ke';
    case 'bei_sheng':
      return 'xie';
    case 'bei_ke':
      return 'ti_ke';
    case 'bi_he':
    default:
      return 'bi_he';
  }
}

/** 五档：生克 × 体旺衰（规格 §5.2） */
export function gradeFromYongTiWangShuai(
  relation: TiYongRelationV2,
  wangShuai: WangShuaiLevel,
): VerdictGrade {
  switch (relation) {
    case 'sheng':
      return wangShuai === '衰' ? 'good' : 'great';
    case 'bi_he':
      if (wangShuai === '旺') return 'great';
      if (wangShuai === '衰') return 'neutral';
      return 'good';
    case 'ti_ke':
      return wangShuai === '衰' ? 'neutral' : 'good';
    case 'xie':
      return wangShuai === '旺' ? 'neutral' : 'bad';
    case 'yong_ke':
      return wangShuai === '衰' ? 'terrible' : 'bad';
    default:
      return 'neutral';
  }
}

export type { VerdictGrade };
