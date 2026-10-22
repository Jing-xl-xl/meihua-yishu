import type {
  CastResult,
  FormulaStep,
  Gua,
  MovingYaoPosition,
} from '@meihua/shared';
import { GUA_NUM, SCHOOL_DEFAULTS } from '@meihua/shared';

import {
  assertHourZhi,
  assertNat,
  buildHuFromLines,
  buildTripleHex,
  computeHu,
  flipAndBuildBian,
  tiYongOf,
  toGuaNum,
  toMovingPos,
} from './build';

export type NumberMethod = 'number1' | 'number2' | 'number3';

export type CastNumbersOpts = {
  numbers: number[];
  method: NumberMethod;
  hourZhi: number;
  school?: { movingYao?: 'mod' | 'sum'; addHour?: boolean };
};

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

function exprMod(n: number, m: number, mapped: number): string {
  const r = ((n % m) + m) % m;
  return `${n} ÷ ${m} = ${Math.floor(n / m)} … ${r}${mapped !== r ? ` → ${mapped}` : ''}`;
}

export function castByNumbers(opts: CastNumbersOpts): CastResult {
  const hourZhi = assertHourZhi(opts.hourZhi);
  const school = {
    movingYao: opts.school?.movingYao ?? SCHOOL_DEFAULTS.movingYao,
    addHour: opts.school?.addHour ?? SCHOOL_DEFAULTS.addHour,
  };
  const numbers = opts.numbers;
  for (const n of numbers) {
    assertNat(n, 'number');
  }

  let upperN: number;
  let lowerN: number;
  let moveN: number;

  if (opts.method === 'number1') {
    if (numbers.length !== 1) {
      throw new RangeError('number1 requires exactly 1 number');
    }
    const n = numbers[0]!;
    upperN = n;
    lowerN = n + hourZhi;
    moveN = n + hourZhi;
  } else if (opts.method === 'number2') {
    if (numbers.length !== 2) {
      throw new RangeError('number2 requires exactly 2 numbers');
    }
    const [n1, n2] = numbers as [number, number];
    upperN = n1;
    lowerN = n2;
    moveN = school.addHour ? n1 + n2 + hourZhi : n1 + n2;
  } else if (opts.method === 'number3') {
    if (numbers.length !== 3) {
      throw new RangeError('number3 requires exactly 3 numbers');
    }
    const [n1, n2, n3] = numbers as [number, number, number];
    upperN = n1;
    lowerN = n2;
    if (school.movingYao === 'sum') {
      moveN = school.addHour ? n1 + n2 + n3 + hourZhi : n1 + n2 + n3;
    } else {
      moveN = school.addHour ? n3 + hourZhi : n3;
    }
  } else {
    throw new RangeError(`unsupported method ${opts.method}`);
  }

  const upper = toGuaNum(upperN);
  const lower = toGuaNum(lowerN);
  const movingYao = toMovingPos(moveN);

  const ben = buildTripleHex(upper, lower);
  const bian = flipAndBuildBian(ben, movingYao);
  const hu = computeHu(ben.lines, bian.lines);
  const { ti, yong, tiYongNote } = tiYongOf(movingYao, ben.upper, ben.lower);

  const formula: FormulaStep[] = [];
  formula.push({
    label: '上卦',
    expr: exprMod(upperN, 8, GUA_NUM[upper]),
    remainder: ((upperN % 8) + 8) % 8,
    mapped: upper,
    note: `→ ${guaShort(upper)}`,
  });
  formula.push({
    label: '下卦',
    expr: exprMod(lowerN, 8, GUA_NUM[lower]),
    remainder: ((lowerN % 8) + 8) % 8,
    mapped: lower,
    note: `→ ${guaShort(lower)}`,
  });
  const schoolNote = school.movingYao === 'sum' ? '总和派' : '取模派';
  const hourNote = school.addHour ? '含时' : '不含时';
  formula.push({
    label: `动爻（${schoolNote}·${hourNote}）`,
    expr: exprMod(moveN, 6, toMovingPos(moveN)),
    remainder: ((moveN % 6) + 6) % 6,
    mapped: movingYao,
    note: `→ ${movingYao}爻动`,
  });
  formula.push({ label: '本卦', expr: ben.name });
  formula.push({
    label: '互卦',
    expr: `${hu.name ?? ''}（互见${guaShort(hu.upper)}、${guaShort(hu.lower)}）`,
  });
  formula.push({ label: '变卦', expr: bian.name });
  formula.push({ label: '体用', expr: tiYongNote });

  return {
    method: opts.method,
    school: {
      movingYao: school.movingYao,
      addHour: school.addHour,
    },
    formula,
    ben,
    hu,
    bian,
    movingYao: movingYao as MovingYaoPosition,
    ti,
    yong,
    tiYongNote,
  };
}

export { buildHuFromLines };
