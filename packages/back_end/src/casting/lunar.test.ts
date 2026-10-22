import { describe, expect, it } from 'vitest';

import { zhiNum } from '@meihua/shared';

import {
  formatLocalIso,
  hourZhiNum,
  isEarlyZiHour,
  isLateZiHour,
  toLunarMoment,
  toLunarMomentFromDate,
} from './lunar';

describe('hourZhiNum / zi hour flags', () => {
  it('hour branches', () => {
    expect(hourZhiNum(23)).toBe(1);
    expect(hourZhiNum(0)).toBe(1);
    expect(hourZhiNum(1)).toBe(2);
    expect(hourZhiNum(2)).toBe(2);
    expect(hourZhiNum(21)).toBe(12);
    expect(hourZhiNum(22)).toBe(12);
  });

  it('late vs early zi', () => {
    expect(isLateZiHour(new Date(2026, 9, 18, 23, 30))).toBe(true);
    expect(isLateZiHour(new Date(2026, 9, 18, 22, 59))).toBe(false);
    expect(isEarlyZiHour(new Date(2026, 9, 18, 0, 30))).toBe(true);
  });
});

describe('formatLocalIso', () => {
  it('has offset, not Z', () => {
    const s = formatLocalIso(new Date(2026, 9, 18, 21, 31, 0));
    expect(s).not.toMatch(/Z$/);
    expect(s).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(s.startsWith('2026-10-18T21:31:00')).toBe(true);
  });
});

describe('toLunarMomentFromDate', () => {
  it('late zi 23:30 uses next day calendar', () => {
    const late = new Date(2026, 9, 18, 23, 30, 0);
    const earlyNext = new Date(2026, 9, 19, 0, 10, 0);
    const a = toLunarMomentFromDate(late);
    const b = toLunarMomentFromDate(earlyNext);
    expect(a.hourZhi).toBe(1);
    expect(b.hourZhi).toBe(1);
    // 日历字段与次日一致
    expect(a.lunarDay).toBe(b.lunarDay);
    expect(a.lunarMonth).toBe(b.lunarMonth);
    expect(a.yearZhi).toBe(b.yearZhi);
    expect(a.jieqiMonthKey).toBe(b.jieqiMonthKey);
    expect(a.solar).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(a.solar).not.toMatch(/Z$/);
  });

  it('early zi 00:30 keeps same day', () => {
    const t = new Date(2026, 9, 18, 0, 30, 0);
    const m = toLunarMomentFromDate(t);
    const day = toLunarMomentFromDate(new Date(2026, 9, 18, 12, 0, 0));
    expect(m.hourZhi).toBe(1);
    expect(m.lunarDay).toBe(day.lunarDay);
    expect(m.lunarMonth).toBe(day.lunarMonth);
  });

  it('22:30 is hai, no day shift vs noon', () => {
    const t = new Date(2026, 9, 18, 22, 30, 0);
    const m = toLunarMomentFromDate(t);
    const noon = toLunarMomentFromDate(new Date(2026, 9, 18, 12, 0, 0));
    expect(m.hourZhi).toBe(12);
    expect(m.lunarDay).toBe(noon.lunarDay);
    expect(m.yearZhi).toBe(noon.yearZhi);
  });

  it('01:30 is chou', () => {
    expect(toLunarMomentFromDate(new Date(2026, 9, 18, 1, 30)).hourZhi).toBe(2);
  });

  it('rejects invalid date string', () => {
    expect(() => toLunarMoment('not-a-date')).toThrow(RangeError);
    expect(() => toLunarMomentFromDate(new Date('nope'))).toThrow(RangeError);
  });

  it('around li chun 2026-02-04: year zhi / month key flip', () => {
    // 立春约 2026-02-04；取前后中午，避免换日瞬间
    const before = toLunarMomentFromDate(new Date(2026, 1, 3, 12, 0, 0));
    const after = toLunarMomentFromDate(new Date(2026, 1, 5, 12, 0, 0));
    // 2026 丙午年，立春前属乙巳
    expect(before.jieqiMonthKey).toBe('丑');
    expect(after.jieqiMonthKey).toBe('寅');
    expect(before.yearZhi).not.toBe(after.yearZhi);
    expect(after.yearZhi).toBe(7); // 午=7
  });

  it('li chun day 23:30 follows next-day year/month', () => {
    // 立春日晚子时 → 字段应与立春后次日中午一致
    const late = toLunarMomentFromDate(new Date(2026, 1, 4, 23, 30, 0));
    const nextNoon = toLunarMomentFromDate(new Date(2026, 1, 5, 12, 0, 0));
    expect(late.hourZhi).toBe(1);
    expect(late.yearZhi).toBe(nextNoon.yearZhi);
    expect(late.jieqiMonthKey).toBe(nextNoon.jieqiMonthKey);
    expect(late.lunarDay).toBe(nextNoon.lunarDay);
    expect(late.lunarMonth).toBe(nextNoon.lunarMonth);
  });

  it('month-end late zi rolls lunar day to 1 when month advances', () => {
    // 找一个会跨农历月的晚子时：用连续日对比
    const d = new Date(2026, 0, 15, 23, 30, 0);
    const next = new Date(2026, 0, 16, 12, 0, 0);
    const a = toLunarMomentFromDate(d);
    const b = toLunarMomentFromDate(next);
    expect(a.lunarDay).toBe(b.lunarDay);
    expect(a.lunarMonth).toBe(b.lunarMonth);
  });

  it('leap month flag via negative month (library contract)', () => {
    // 2023-03-22 落在农历闰二月
    const m = toLunarMomentFromDate(new Date(2023, 2, 22, 12, 0, 0));
    expect(m.isLeapMonth).toBe(true);
    expect(m.lunarMonth).toBe(2);
    const normal = toLunarMomentFromDate(new Date(2026, 9, 18, 12, 0, 0));
    expect(normal.isLeapMonth).toBe(false);
  });

  it('观梅/牡丹支数口径：辰=5 申=9 巳=6 卯=4', () => {
    expect(zhiNum('辰')).toBe(5);
    expect(zhiNum('申')).toBe(9);
    expect(zhiNum('巳')).toBe(6);
    expect(zhiNum('卯')).toBe(4);
  });
});
