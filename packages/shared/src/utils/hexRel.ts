import type { DualGua, Gua, HexLines } from '../types/base';
import { HEXAGRAM_TABLE } from '../constants/hexagrams';
import { GUA_NAME_ZH } from '../constants/gua';

const TRIGRAM_LINES: Record<Gua, [number, number, number]> = {
  qian: [7, 7, 7],
  dui: [7, 7, 8],
  li: [7, 8, 7],
  zhen: [7, 8, 8],
  xun: [8, 7, 7],
  kan: [8, 7, 8],
  gen: [8, 8, 7],
  kun: [8, 8, 8],
};

const LINE_TO_GUA = new Map<string, Gua>(
  Object.entries(TRIGRAM_LINES).map(([g, t]) => [t.join(''), g as Gua]),
);

export function guaFromLines(lines: readonly number[]): { upper: Gua; lower: Gua } {
  const lo = [lines[0]!, lines[1]!, lines[2]!].map((v) => (v === 7 || v === 9 ? 7 : 8));
  const up = [lines[3]!, lines[4]!, lines[5]!].map((v) => (v === 7 || v === 9 ? 7 : 8));
  const lower = LINE_TO_GUA.get(lo.join('')) ?? 'qian';
  const upper = LINE_TO_GUA.get(up.join('')) ?? 'qian';
  return { upper, lower };
}

export function linesFromHex(upper: Gua, lower: Gua): HexLines {
  return [...TRIGRAM_LINES[lower], ...TRIGRAM_LINES[upper]] as HexLines;
}

export function nameFromDual(upper: Gua, lower: Gua): string | undefined {
  return HEXAGRAM_TABLE.find((h) => h.upper === upper && h.lower === lower)?.name;
}

export function labelDual(upper: Gua, lower: Gua, name?: string): string {
  return name ?? `上${GUA_NAME_ZH[upper] ?? upper}下${GUA_NAME_ZH[lower] ?? lower}`;
}

/** 互：二三四 / 三四五（与 casting buildHuFromLines 同构） */
export function huFromBen(benLines: readonly number[]): DualGua {
  const lo = [benLines[1]!, benLines[2]!, benLines[3]!].map((v) =>
    v === 7 || v === 9 ? 7 : 8,
  );
  const up = [benLines[2]!, benLines[3]!, benLines[4]!].map((v) =>
    v === 7 || v === 9 ? 7 : 8,
  );
  const lower = LINE_TO_GUA.get(lo.join('')) ?? 'qian';
  const upper = LINE_TO_GUA.get(up.join('')) ?? 'qian';
  return { upper, lower, name: nameFromDual(upper, lower) };
}

export function isPureHex(lines: readonly number[]): boolean {
  const yang = lines.every((v) => v === 7 || v === 9);
  const yin = lines.every((v) => v === 8 || v === 6);
  return yang || yin;
}

/** 乾坤无互，互其变卦一层 */
export function huWithSpecial(
  benLines: readonly number[],
  bianLines: readonly number[],
): { dual: DualGua; note?: string } {
  if (!isPureHex(benLines)) {
    return { dual: huFromBen(benLines) };
  }
  if (isPureHex(bianLines)) {
    const { upper, lower } = guaFromLines(bianLines);
    return {
      dual: { upper, lower, name: nameFromDual(upper, lower) },
      note: '乾坤无互，互其变卦（变仍纯则直书）',
    };
  }
  return { dual: huFromBen(bianLines), note: '乾坤无互，互其变卦' };
}

export function cuoGua(lines: readonly number[]): DualGua {
  const flipped = lines.map((v) => (v === 7 || v === 9 ? 8 : 7)) as HexLines;
  const { upper, lower } = guaFromLines(flipped);
  return { upper, lower, name: nameFromDual(upper, lower) };
}

export function zongGua(lines: readonly number[]): DualGua {
  const rev = [...lines].reverse() as HexLines;
  const { upper, lower } = guaFromLines(rev);
  return { upper, lower, name: nameFromDual(upper, lower) };
}

/** 权王序卦名 → lines（从 shared HEXAGRAM_TABLE 上下卦拼） */
export function linesFromKingwen(kingwen: number): HexLines | null {
  const h = HEXAGRAM_TABLE.find((x) => x.kingwen === kingwen);
  if (!h) return null;
  return linesFromHex(h.upper, h.lower);
}

export function dualLabel(d: DualGua): string {
  return labelDual(d.upper, d.lower, d.name);
}
