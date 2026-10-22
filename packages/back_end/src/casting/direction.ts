import type { CastResult, FormulaStep, Gua } from '@meihua/shared';
import { GUA_NUM, zhiName } from '@meihua/shared';

import {
  assertHourZhi,
  assertNat,
  buildTripleHex,
  computeHu,
  flipAndBuildBian,
  tiYongOf,
  toMovingPos,
} from './build';

function guaShort(g: Gua): string {
  const zh: Record<Gua, string> = {
    qian: '乾',
    dui: '兑',
    li: '离',
    zhen: '震',
    xun: '巽',
    kan: '坎',
    gen: '艮',
    kun: '坤',
  };
  return `${zh[g]}(${GUA_NUM[g]})`;
}

export type CastDirectionOpts = {
  objectGua: Gua;
  directionGua: Gua;
  hourZhi: number;
  objectNum?: number;
  directionNum?: number;
};

/** 端法：物象+方位+时；物数/方数默认 GUA_NUM */
export function castByDirection(opts: CastDirectionOpts): CastResult {
  const hourZhi = assertHourZhi(opts.hourZhi);
  const objectNum = opts.objectNum ?? GUA_NUM[opts.objectGua];
  const directionNum = opts.directionNum ?? GUA_NUM[opts.directionGua];
  assertNat(objectNum, 'objectNum');
  assertNat(directionNum, 'directionNum');

  const moveN = objectNum + directionNum + hourZhi;
  const movingYao = toMovingPos(moveN);
  const ben = buildTripleHex(opts.objectGua, opts.directionGua);
  const bian = flipAndBuildBian(ben, movingYao);
  const hu = computeHu(ben.lines, bian.lines);
  const { ti, yong, tiYongNote } = tiYongOf(
    movingYao,
    ben.upper,
    ben.lower,
  );

  const formula: FormulaStep[] = [];
  formula.push({
    label: '上卦（物象）',
    expr: `物 → ${guaShort(opts.objectGua)}`,
    mapped: opts.objectGua,
  });
  formula.push({
    label: '下卦（方位）',
    expr: `方 → ${guaShort(opts.directionGua)}`,
    mapped: opts.directionGua,
  });
  formula.push({
    label: '动爻',
    expr: `(物数${objectNum}+方数${directionNum}+${zhiName(hourZhi as Parameters<typeof zhiName>[0])}时${hourZhi})=${moveN} ÷ 6 = ${Math.floor(moveN / 6)} … ${moveN % 6} → ${movingYao}爻动`,
    remainder: moveN % 6,
    mapped: movingYao,
    note: opts.objectNum !== undefined || opts.directionNum !== undefined
      ? '物数/方数已覆盖'
      : '物数/方数默认卦数',
  });
  formula.push({ label: '本卦', expr: ben.name });
  formula.push({
    label: '互卦',
    expr: `${hu.name ?? ''}（互见${guaShort(hu.upper)}、${guaShort(hu.lower)}）`,
  });
  formula.push({ label: '变卦', expr: bian.name });
  formula.push({ label: '体用', expr: tiYongNote });

  return {
    method: 'direction',
    school: { movingYao: 'mod', addHour: true },
    formula,
    ben,
    hu,
    bian,
    movingYao,
    ti,
    yong,
    tiYongNote,
  };
}
