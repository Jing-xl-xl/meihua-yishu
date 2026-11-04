import { describe, expect, it } from 'vitest';

import {
  gradeFromYongTiWangShuai,
  legacyRelationToV2,
  relationFromYongTi,
  type TiYongRelationV2,
  type WangShuaiLevel,
} from './tiYongRelation';
import type { Element } from '../types/base';

/** 规格 §5.4 金样例 J1–J8 */
const J: Array<{
  id: string;
  relation: TiYongRelationV2;
  wang: WangShuaiLevel;
  grade: string;
}> = [
  { id: 'J1', relation: 'sheng', wang: '旺', grade: 'great' },
  { id: 'J2', relation: 'sheng', wang: '衰', grade: 'good' },
  { id: 'J3', relation: 'bi_he', wang: '平', grade: 'good' },
  { id: 'J4', relation: 'ti_ke', wang: '平', grade: 'good' },
  { id: 'J5', relation: 'ti_ke', wang: '衰', grade: 'neutral' },
  { id: 'J6', relation: 'xie', wang: '平', grade: 'bad' },
  { id: 'J7', relation: 'yong_ke', wang: '衰', grade: 'terrible' },
  { id: 'J8', relation: 'yong_ke', wang: '旺', grade: 'bad' },
];

describe('gradeFromYongTiWangShuai 金样例 J1–J8', () => {
  for (const row of J) {
    it(`${row.id} ${row.relation}+${row.wang} → ${row.grade}`, () => {
      expect(gradeFromYongTiWangShuai(row.relation, row.wang)).toBe(row.grade);
    });
  }
});

describe('relationFromYongTi 码位（G-01）', () => {
  it('用金克体木 = yong_ke（用克体）', () => {
    // 金克木：yong=metal, ti=wood
    expect(relationFromYongTi('metal', 'wood')).toBe('yong_ke');
  });
  it('体金克用木 = ti_ke（体克用）', () => {
    expect(relationFromYongTi('wood', 'metal')).toBe('ti_ke');
  });
  it('用生体 = sheng', () => {
    // 水生木：yong=water, ti=wood
    expect(relationFromYongTi('water', 'wood')).toBe('sheng');
  });
  it('体生用 = xie', () => {
    expect(relationFromYongTi('wood', 'water')).toBe('xie');
  });
  it('比和 = bi_he', () => {
    expect(relationFromYongTi('fire', 'fire')).toBe('bi_he');
  });
});

describe('旧码锚定', () => {
  it('legacy ke → yong_ke，grade 同 J7/J8 规则', () => {
    const rel = legacyRelationToV2('ke');
    expect(rel).toBe('yong_ke');
    expect(gradeFromYongTiWangShuai(rel!, '衰')).toBe('terrible');
    expect(gradeFromYongTiWangShuai(rel!, '旺')).toBe('bad');
  });
  it('legacy bei_ke → ti_ke，grade 同 J4/J5 规则', () => {
    const rel = legacyRelationToV2('bei_ke');
    expect(rel).toBe('ti_ke');
    expect(gradeFromYongTiWangShuai(rel!, '平')).toBe('good');
    expect(gradeFromYongTiWangShuai(rel!, '衰')).toBe('neutral');
  });
});

describe('元素关系与领域义', () => {
  it('金属克木 = 用克体 yong_ke（不得映射为 ti_ke）', () => {
    const r = relationFromYongTi('metal' as Element, 'wood' as Element);
    expect(r).not.toBe('ti_ke');
    expect(r).toBe('yong_ke');
  });
});
