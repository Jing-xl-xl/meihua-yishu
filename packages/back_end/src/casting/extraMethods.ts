import type { CastResult, FormulaStep, Gua, MovingYaoPosition } from '@meihua/shared';
import { GUA_NUM, zhiName, PERSON_TO_GUA as SHARED_PERSON_TO_GUA } from '@meihua/shared';

import {
  assertHourZhi,
  assertNat,
  buildTripleHex,
  computeHu,
  flipAndBuildBian,
  tiYongOf,
  toGuaNum,
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

function exprMod(n: number, m: number, mapped: number): string {
  const r = ((n % m) + m) % m;
  return `${n} ÷ ${m} = ${Math.floor(n / m)} … ${r}${mapped !== r ? ` → ${mapped}` : ''}`;
}

/** 汉字/字母/数字；忽略标点空白 */
export function countChars(text: string): number {
  const hits = text.match(/[一-鿿A-Za-z0-9]/g);
  return hits ? hits.length : 0;
}

/** 字占 2–11 字特表：上=⌊n/2⌋，不匀则上少下多 */
export function textSplit(n: number): { up: number; lo: number } {
  if (n < 2) throw new RangeError('text length must be >= 2');
  if (n >= 12) {
    const up = Math.floor(n / 2);
    return { up, lo: n - up };
  }
  // 2:1+1, 3:1+2, 4:2+2, 5:2+3, 6:3+3, 7:3+4, 8:4+4, 9:4+5, 10:5+5, 11:5+6
  const up = Math.floor(n / 2);
  return { up, lo: n - up };
}

function finish(
  method: CastResult['method'],
  school: CastResult['school'],
  formula: FormulaStep[],
  upperN: number,
  lowerN: number,
  moveN: number,
  lunar?: CastResult['lunar'],
): CastResult {
  const upper = toGuaNum(upperN);
  const lower = toGuaNum(lowerN);
  const movingYao = toMovingPos(moveN);
  const ben = buildTripleHex(upper, lower);
  const bian = flipAndBuildBian(ben, movingYao);
  const hu = computeHu(ben.lines, bian.lines);
  const { ti, yong, tiYongNote } = tiYongOf(movingYao, ben.upper, ben.lower);
  formula.push({ label: '本卦', expr: ben.name });
  formula.push({
    label: '互卦',
    expr: `${hu.name ?? ''}（互见${guaShort(hu.upper)}、${guaShort(hu.lower)}）`,
  });
  formula.push({ label: '变卦', expr: bian.name });
  formula.push({ label: '体用', expr: tiYongNote });
  return {
    method,
    school,
    formula,
    lunar,
    ben,
    hu,
    bian,
    movingYao: movingYao as MovingYaoPosition,
    ti,
    yong,
    tiYongNote,
  };
}

export function castByCount(
  kind: 'objectCount' | 'sound',
  opts: { count: number; hourZhi: number },
): CastResult {
  assertNat(opts.count, 'count');
  if (opts.count < 1) throw new RangeError('count must be >= 1');
  const hour = assertHourZhi(opts.hourZhi);
  const upperN = opts.count;
  const lowerN = opts.count + hour;
  const moveN = opts.count + hour;
  const formula: FormulaStep[] = [
    {
      label: '上卦',
      expr: exprMod(upperN, 8, GUA_NUM[toGuaNum(upperN)]),
      remainder: upperN % 8,
    },
    {
      label: '下卦',
      expr: `(${opts.count}+${zhiName(hour as never)}时${hour}) ${exprMod(lowerN, 8, GUA_NUM[toGuaNum(lowerN)])}`,
      remainder: lowerN % 8,
    },
    {
      label: '动爻',
      expr: exprMod(moveN, 6, toMovingPos(moveN)),
      remainder: moveN % 6,
    },
  ];
  return finish(kind, { movingYao: 'mod', addHour: true }, formula, upperN, lowerN, moveN);
}

export function castByText(opts: {
  text: string;
  hourZhi?: number;
}): CastResult {
  const n = countChars(opts.text);
  if (n < 2) throw new RangeError('text char count must be >= 2');
  const { up, lo } = textSplit(n);
  const upperN = up;
  const lowerN = lo;
  const moveN = n; // 总字数 %6
  const formula: FormulaStep[] = [
    {
      label: '上卦',
      expr: `上 ${up} 字 ${exprMod(up, 8, GUA_NUM[toGuaNum(up)])}`,
      remainder: up % 8,
    },
    {
      label: '下卦',
      expr: `下 ${lo} 字 ${exprMod(lo, 8, GUA_NUM[toGuaNum(lo)])}`,
      remainder: lo % 8,
    },
    {
      label: '动爻',
      expr: `${n} ÷ 6 … ${n % 6} → ${toMovingPos(n)}爻动`,
      remainder: n % 6,
      note: '总字数，不加时',
    },
  ];
  return finish(
    'text',
    { movingYao: 'mod', addHour: false },
    formula,
    upperN,
    lowerN,
    moveN,
  );
}

export function castByMeasureZhangChi(opts: {
  zhang: number;
  chi: number;
}): CastResult {
  assertNat(opts.zhang, 'zhang');
  assertNat(opts.chi, 'chi');
  if (opts.zhang + opts.chi < 1) {
    throw new RangeError('zhang+chi must be >= 1');
  }
  const upperN = opts.zhang;
  const lowerN = opts.chi;
  const moveN = opts.zhang + opts.chi;
  const formula: FormulaStep[] = [
    { label: '上卦（丈）', expr: exprMod(upperN, 8, GUA_NUM[toGuaNum(upperN)]) },
    { label: '下卦（尺）', expr: exprMod(lowerN, 8, GUA_NUM[toGuaNum(lowerN)]) },
    {
      label: '动爻',
      expr: `(丈${opts.zhang}+尺${opts.chi}) ${exprMod(moveN, 6, toMovingPos(moveN))}`,
      note: '不加时；寸不用',
    },
  ];
  return finish(
    'measureZhangChi',
    { movingYao: 'mod', addHour: false },
    formula,
    upperN,
    lowerN,
    moveN,
  );
}

export function castByMeasureChiCun(opts: {
  chi: number;
  cun: number;
  hourZhi: number;
}): CastResult {
  assertNat(opts.chi, 'chi');
  assertNat(opts.cun, 'cun');
  if (opts.chi + opts.cun < 1) {
    throw new RangeError('chi+cun must be >= 1');
  }
  const hour = assertHourZhi(opts.hourZhi);
  const upperN = opts.chi;
  const lowerN = opts.cun;
  const moveN = opts.chi + opts.cun + hour;
  const formula: FormulaStep[] = [
    { label: '上卦（尺）', expr: exprMod(upperN, 8, GUA_NUM[toGuaNum(upperN)]) },
    { label: '下卦（寸）', expr: exprMod(lowerN, 8, GUA_NUM[toGuaNum(lowerN)]) },
    {
      label: '动爻',
      expr: `(尺${opts.chi}+寸${opts.cun}+${zhiName(hour as never)}${hour}) ${exprMod(moveN, 6, toMovingPos(moveN))}`,
      note: '加分不用',
    },
  ];
  return finish(
    'measureChiCun',
    { movingYao: 'mod', addHour: true },
    formula,
    upperN,
    lowerN,
    moveN,
  );
}

export type PersonMapKey = keyof typeof SHARED_PERSON_TO_GUA;

/** @deprecated 使用 `@meihua/shared` 的 PERSON_TO_GUA；此处仅兼容再导出 */
export const PERSON_TO_GUA = SHARED_PERSON_TO_GUA;
