import type {
  DualGua,
  Gua,
  HexLines,
  MovingYaoPosition,
  TripleHex,
} from '@meihua/shared';
import { hexName, hexMeta, GUA_NUM } from '@meihua/shared';

import {
  flipYao,
  guaFromLines,
  isPureHex,
  linesFromHex,
} from './trigrams';

export function toGuaNum(n: number): Gua {
  const r = ((n % 8) + 8) % 8;
  const idx = r === 0 ? 8 : r;
  const entry = Object.entries(GUA_NUM).find(([, v]) => v === idx);
  if (!entry) {
    throw new RangeError(`cannot map ${n} to gua`);
  }
  return entry[0] as Gua;
}

export function toMovingPos(n: number): MovingYaoPosition {
  const r = ((n % 6) + 6) % 6;
  return (r === 0 ? 6 : r) as MovingYaoPosition;
}

export function assertHourZhi(hourZhi: number): number {
  if (!Number.isInteger(hourZhi) || hourZhi < 1 || hourZhi > 12) {
    throw new RangeError(`hourZhi must be integer 1..12, got ${hourZhi}`);
  }
  return hourZhi;
}

export function assertNat(n: number, label: string): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`${label} must be non-negative integer, got ${n}`);
  }
  return n;
}

export function buildTripleHex(upper: Gua, lower: Gua): TripleHex {
  const meta = hexMeta(upper, lower);
  return {
    lines: linesFromHex(upper, lower),
    upper,
    lower,
    name: meta.name,
    kingwen: meta.kingwen,
  };
}

function dualFromTriplet(
  lo: readonly number[],
  up: readonly number[],
): DualGua {
  const fake = [lo[0], lo[1], lo[2], up[0], up[1], up[2]] as HexLines;
  const { upper, lower } = guaFromLines(fake);
  return { upper, lower, name: hexName(upper, lower) };
}

/** 互：二三四 / 三四五 */
export function buildHuFromLines(lines: HexLines): DualGua {
  return dualFromTriplet(
    [lines[1], lines[2], lines[3]],
    [lines[2], lines[3], lines[4]],
  );
}

/**
 * 乾坤无互，互其变卦；只求一层，不递归。
 * 本卦纯 → 取变卦之互；若变卦之互仍纯 → 直书该纯卦。
 */
export function computeHu(benLines: HexLines, bianLines: HexLines): DualGua {
  if (isPureHex(benLines)) {
    if (isPureHex(bianLines)) {
      const { upper, lower } = guaFromLines(bianLines);
      return { upper, lower, name: hexName(upper, lower) };
    }
    return buildHuFromLines(bianLines);
  }
  return buildHuFromLines(benLines);
}

export function flipAndBuildBian(
  ben: TripleHex,
  movingYao: MovingYaoPosition,
): TripleHex {
  const lines = flipYao(ben.lines, movingYao);
  const { upper, lower } = guaFromLines(lines);
  const meta = hexMeta(upper, lower);
  return {
    lines,
    upper,
    lower,
    name: meta.name,
    kingwen: meta.kingwen,
  };
}

export function tiYongOf(
  movingYao: MovingYaoPosition,
  upper: Gua,
  lower: Gua,
): { ti: Gua; yong: Gua; tiYongNote: string } {
  // 铁律（邵雍体用诀）：动爻所在为用，不动为体
  if (movingYao <= 3) {
    return {
      ti: upper,
      yong: lower,
      tiYongNote: '动爻在下，下卦为用，上卦为体',
    };
  }
  return {
    ti: lower,
    yong: upper,
    tiYongNote: '动爻在上，上卦为用，下卦为体',
  };
}
