import { describe, expect, it } from 'vitest';
import {
  mapRelation,
  qiFromDual,
  qiSegment,
  qiSegments,
  qiTrendPlain,
  tiYongFromMovingYao,
} from './tiYongQi';

describe('tiYongFromMovingYao 铁律：动爻所在为用', () => {
  it('动 1–3 → 下为用、上为体', () => {
    const r = tiYongFromMovingYao(3, 'li', 'dui');
    expect(r.yong).toBe('dui');
    expect(r.ti).toBe('li');
    expect(r.tiSide).toBe('upper');
  });

  it('动 4–6 → 上为用、下为体（观梅式）', () => {
    // 睽动4：上离为用，下兑为体
    const r = tiYongFromMovingYao(4, 'li', 'dui');
    expect(r.yong).toBe('li');
    expect(r.ti).toBe('dui');
    expect(r.tiSide).toBe('lower');
  });
});

describe('qiSegments / 用克体', () => {
  it('睽动4：用离火克体兑金', () => {
    const segs = qiSegments({
      ben: { upper: 'li', lower: 'dui' },
      hu: { upper: 'kan', lower: 'li' },
      bian: { upper: 'gen', lower: 'dui' },
      movingYao: 4,
    });
    expect(segs[0]!.yong).toBe('li');
    expect(segs[0]!.ti).toBe('dui');
    expect(segs[0]!.relation).toBe('ke');
    expect(segs[0]!.label).toBe('用克体');
    expect(segs[0]!.plain).toBe('被外压');
  });

  it('qiFromDual 动爻 1/6 不要求在互卦内', () => {
    const hu = qiFromDual('hu', { upper: 'qian', lower: 'qian' }, 1);
    expect(hu.yong).toBe('qian');
    expect(hu.ti).toBe('qian');
  });
});

describe('mapRelation / 趋势', () => {
  it('用对体映射', () => {
    expect(mapRelation('sheng')).toBe('sheng');
    expect(mapRelation('ke')).toBe('ke');
    expect(mapRelation('bei_sheng')).toBe('xie');
    expect(mapRelation('bei_ke')).toBe('bei_ke');
  });

  it('qiTrendPlain', () => {
    const a = qiSegment('ben', 'dui', 'li'); // 用克体
    const b = qiSegment('hu', 'qian', 'qian'); // 比和
    const c = qiSegment('bian', 'dui', 'gen'); // 体兑金，用艮土 → 土生金 = 用生体
    expect(qiTrendPlain([a, b, c])).toContain('被外压');
  });
});
