import type {
  Gua,
  HexLines,
  YinYangLine,
} from '@meihua/shared';

/** 八卦爻型（下 → 上三爻，7=阳 8=阴） */
export const TRIGRAM_LINES: Record<Gua, readonly [YinYangLine, YinYangLine, YinYangLine]> = {
  qian: [7, 7, 7],
  dui: [7, 7, 8],
  li: [7, 8, 7],
  zhen: [7, 8, 8],
  xun: [8, 7, 7],
  kan: [8, 7, 8],
  gen: [8, 8, 7],
  kun: [8, 8, 8],
};

const LINES_TO_GUA: Record<string, Gua> = {
  '7,7,7': 'qian',
  '7,7,8': 'dui',
  '7,8,7': 'li',
  '7,8,8': 'zhen',
  '8,7,7': 'xun',
  '8,7,8': 'kan',
  '8,8,7': 'gen',
  '8,8,8': 'kun',
};

function assertLine(v: number): YinYangLine {
  if (v !== 7 && v !== 8) {
    throw new RangeError(`YinYangLine must be 7|8, got ${v}`);
  }
  return v;
}

export function linesFromHex(upper: Gua, lower: Gua): HexLines {
  const lo = TRIGRAM_LINES[lower];
  const up = TRIGRAM_LINES[upper];
  return [lo[0], lo[1], lo[2], up[0], up[1], up[2]];
}

export function guaFromLines(lines: readonly number[]): { upper: Gua; lower: Gua } {
  if (lines.length !== 6) {
    throw new RangeError('lines length must be 6');
  }
  const lowerKey = [lines[0], lines[1], lines[2]].map(assertLine).join(',');
  const upperKey = [lines[3], lines[4], lines[5]].map(assertLine).join(',');
  const lower = LINES_TO_GUA[lowerKey];
  const upper = LINES_TO_GUA[upperKey];
  if (!lower || !upper) {
    throw new RangeError(`unknown trigram lines: ${lowerKey} / ${upperKey}`);
  }
  return { upper, lower };
}

/** 动爻位 1–6，7↔8 */
export function flipYao(lines: HexLines, pos: number): HexLines {
  if (!Number.isInteger(pos) || pos < 1 || pos > 6) {
    throw new RangeError(`moving yao pos must be 1..6, got ${pos}`);
  }
  const out = [...lines] as number[];
  const cur = assertLine(out[pos - 1]!);
  out[pos - 1] = cur === 7 ? 8 : 7;
  return out.map(assertLine) as HexLines;
}

export function isPureQian(lines: readonly number[]): boolean {
  return lines.every((v) => v === 7);
}

export function isPureKun(lines: readonly number[]): boolean {
  return lines.every((v) => v === 8);
}

export function isPureHex(lines: readonly number[]): boolean {
  return isPureQian(lines) || isPureKun(lines);
}
