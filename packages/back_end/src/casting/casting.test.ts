import { describe, expect, it } from 'vitest';

import type { LunarMoment } from '@meihua/shared';

import { castByDateTime } from './datetime';
import { castByDirection } from './direction';
import { castByNumbers } from './numbers';
import {
  computeHu,
  toGuaNum,
  toMovingPos,
  buildTripleHex,
  flipAndBuildBian,
} from './build';
import { isPureKun } from './trigrams';

describe('余数规则', () => {
  it('0 % 8 → 坤；0 % 6 → 上爻', () => {
    expect(toGuaNum(0)).toBe('kun');
    expect(toGuaNum(8)).toBe('kun');
    expect(toGuaNum(16)).toBe('kun');
    expect(toMovingPos(0)).toBe(6);
    expect(toMovingPos(6)).toBe(6);
    expect(toMovingPos(3)).toBe(3);
  });
});

describe('金样例 number3', () => {
  it('(31,25,9) 取模 → 大畜之损 动3', () => {
    const r = castByNumbers({
      numbers: [31, 25, 9],
      method: 'number3',
      hourZhi: 1,
    });
    expect(r.ben.name).toBe('山天大畜');
    expect(r.bian.name).toBe('山泽损');
    expect(r.movingYao).toBe(3);
    expect(r.formula.length).toBeGreaterThanOrEqual(3);
  });

  it('(55,66,78) 取模 → 损之临 动6；互地雷复', () => {
    const r = castByNumbers({
      numbers: [55, 66, 78],
      method: 'number3',
      hourZhi: 1,
    });
    expect(r.ben.name).toBe('山泽损');
    expect(r.bian.name).toBe('地泽临');
    expect(r.movingYao).toBe(6);
    expect(r.hu.name).toBe('地雷复');
  });

  it('(55,66,78) 总和 → 损之蒙 动1', () => {
    const r = castByNumbers({
      numbers: [55, 66, 78],
      method: 'number3',
      hourZhi: 1,
      school: { movingYao: 'sum' },
    });
    expect(r.ben.name).toBe('山泽损');
    expect(r.bian.name).toBe('山水蒙');
    expect(r.movingYao).toBe(1);
    expect(r.hu.name).toBe('地雷复');
  });

  it('同输入两次一致', () => {
    const a = castByNumbers({ numbers: [31, 25, 9], method: 'number3', hourZhi: 4 });
    const b = castByNumbers({ numbers: [31, 25, 9], method: 'number3', hourZhi: 4 });
    expect(a).toEqual(b);
  });
});

describe('金样例 datetime 观梅/牡丹', () => {
  const guanmei: LunarMoment = {
    solar: '2026-10-18T12:00:00+08:00',
    lunarMonth: 12,
    lunarDay: 17,
    isLeapMonth: false,
    yearZhi: 5,
    hourZhi: 9,
    jieqiMonthKey: '戌',
  };
  const mudan: LunarMoment = {
    solar: '2026-10-18T12:00:00+08:00',
    lunarMonth: 3,
    lunarDay: 16,
    isLeapMonth: false,
    yearZhi: 6,
    hourZhi: 4,
    jieqiMonthKey: '辰',
  };

  it('观梅 辰年十二月十七申时 → 革之泽山咸', () => {
    const r = castByDateTime(guanmei);
    expect(r.ben.name).toBe('泽火革');
    expect(r.bian.name).toBe('泽山咸');
    expect(r.movingYao).toBe(1);
    expect(r.hu.upper).toBe('qian');
    expect(r.hu.lower).toBe('xun');
  });

  it('牡丹 巳年三月十六卯时 → 姤之火风鼎 动5', () => {
    const r = castByDateTime(mudan);
    expect(r.ben.name).toBe('天风姤');
    expect(r.bian.name).toBe('火风鼎');
    expect(r.movingYao).toBe(5);
  });
});

describe('金样例 端法', () => {
  it('老人乾往巽方卯时 → 天风姤 动4', () => {
    const r = castByDirection({
      objectGua: 'qian',
      directionGua: 'xun',
      hourZhi: 4,
    });
    expect(r.ben.name).toBe('天风姤');
    expect(r.movingYao).toBe(4);
    // 姤九四动 → 巽为风（规格仅锁动爻 4 + 本卦天风姤）
    expect(r.bian.name).toBe('巽为风');
  });
});

describe('乾坤无互', () => {
  it('乾三爻动 → 履；互风火家人', () => {
    const ben = buildTripleHex('qian', 'qian');
    const bian = flipAndBuildBian(ben, 3);
    expect(bian.name).toBe('天泽履');
    const hu = computeHu(ben.lines, bian.lines);
    expect(hu.upper).toBe('xun');
    expect(hu.lower).toBe('li');
    expect(hu.name).toBe('风火家人');
  });

  it('坤初爻动 → 复；复之互纯坤 终止', () => {
    const ben = buildTripleHex('kun', 'kun');
    const bian = flipAndBuildBian(ben, 1);
    expect(bian.name).toBe('地雷复');
    const hu = computeHu(ben.lines, bian.lines);
    expect(hu.upper).toBe('kun');
    expect(hu.lower).toBe('kun');
    expect(isPureKun([8, 8, 8, 8, 8, 8])).toBe(true);
    // 不递归：再 computeHu 不爆炸
    const hu2 = computeHu(bian.lines, bian.lines);
    expect(hu2.name).toBe('坤为地');
  });
});

describe('流派与加时', () => {
  it('number1 必加时', () => {
    const a = castByNumbers({ numbers: [5], method: 'number1', hourZhi: 1 });
    const b = castByNumbers({ numbers: [5], method: 'number1', hourZhi: 2 });
    expect(a.ben).not.toEqual(b.ben);
  });

  it('number2 addHour 仅动爻', () => {
    const noHour = castByNumbers({
      numbers: [2, 3],
      method: 'number2',
      hourZhi: 1,
    });
    const withHour = castByNumbers({
      numbers: [2, 3],
      method: 'number2',
      hourZhi: 1,
      school: { addHour: true },
    });
    expect(noHour.ben).toEqual(withHour.ben);
    // 动爻可能不同：(2+3)=5 vs (2+3+1)=6
    expect(noHour.movingYao).toBe(5);
    expect(withHour.movingYao).toBe(6);
  });
});

describe('校验', () => {
  it('number1 数量错 / 负数 / 非法时支', () => {
    expect(() =>
      castByNumbers({ numbers: [1, 2], method: 'number1', hourZhi: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      castByNumbers({ numbers: [-1], method: 'number1', hourZhi: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      castByNumbers({ numbers: [1], method: 'number1', hourZhi: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      castByNumbers({ numbers: [1], method: 'number1', hourZhi: 13 }),
    ).toThrow(RangeError);
  });
});
