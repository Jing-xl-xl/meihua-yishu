import type { CastResult, FormulaStep, LunarMoment } from '@meihua/shared';
import { GUA_NUM, zhiName } from '@meihua/shared';

import {
  buildTripleHex,
  computeHu,
  flipAndBuildBian,
  tiYongOf,
  toGuaNum,
  toMovingPos,
} from './build';

function guaShort(g: string): string {
  const zh: Record<string, string> = {
    qian: '乾',
    dui: '兑',
    li: '离',
    zhen: '震',
    xun: '巽',
    kan: '坎',
    gen: '艮',
    kun: '坤',
  };
  return `${zh[g] ?? g}`;
}

/**
 * 年月日时起卦：只吃 LunarMoment，不再转农历。
 * 上 = (年支+月+日)%8；下 = +时 %8；动 = +时 %6。
 */
export function castByDateTime(lunar: LunarMoment): CastResult {
  const base = lunar.yearZhi + lunar.lunarMonth + lunar.lunarDay;
  const withHour = base + lunar.hourZhi;
  const upper = toGuaNum(base);
  const lower = toGuaNum(withHour);
  const movingYao = toMovingPos(withHour);

  const ben = buildTripleHex(upper, lower);
  const bian = flipAndBuildBian(ben, movingYao);
  const hu = computeHu(ben.lines, bian.lines);
  const { ti, yong, tiYongNote } = tiYongOf(movingYao, ben.upper, ben.lower);

  const zhi = (n: number) => zhiName(n as Parameters<typeof zhiName>[0]);
  const formula: FormulaStep[] = [];
  formula.push({
    label: '上卦',
    expr: `(${zhi(lunar.yearZhi)}年${lunar.lunarMonth}月${lunar.lunarDay}日)=${base} ÷ 8 … ${base % 8} → ${guaShort(upper)}(${GUA_NUM[upper]})`,
    remainder: base % 8,
    mapped: upper,
    note: lunar.isLeapMonth ? `闰${lunar.lunarMonth}月` : undefined,
  });
  formula.push({
    label: '下卦',
    expr: `(${base}+${zhi(lunar.hourZhi)}时${lunar.hourZhi})=${withHour} ÷ 8 … ${withHour % 8} → ${guaShort(lower)}(${GUA_NUM[lower]})`,
    remainder: withHour % 8,
    mapped: lower,
  });
  formula.push({
    label: '动爻',
    expr: `${withHour} ÷ 6 = ${Math.floor(withHour / 6)} … ${withHour % 6} → ${movingYao}爻动`,
    remainder: withHour % 6,
    mapped: movingYao,
    note: `时支${zhi(lunar.hourZhi)}`,
  });
  formula.push({ label: '本卦', expr: ben.name });
  formula.push({
    label: '互卦',
    expr: `${hu.name ?? ''}（互见${guaShort(hu.upper)}、${guaShort(hu.lower)}）`,
  });
  formula.push({ label: '变卦', expr: bian.name });
  formula.push({ label: '体用', expr: tiYongNote });

  return {
    method: 'datetime',
    school: { movingYao: 'mod', addHour: true },
    formula,
    lunar,
    ben,
    hu,
    bian,
    movingYao,
    ti,
    yong,
    tiYongNote,
  };
}
