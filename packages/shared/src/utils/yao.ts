import type { Yao } from '../types/base';

const YANG_LABELS = [
  '初九',
  '九二',
  '九三',
  '九四',
  '九五',
  '上九',
] as const;
const YIN_LABELS = [
  '初六',
  '六二',
  '六三',
  '六四',
  '六五',
  '上六',
] as const;

export function isYangYao(y: Yao): boolean {
  return y === 7 || y === 9;
}

export function isMovingYao(y: Yao): boolean {
  return y === 6 || y === 9;
}

export function yaoToYang(y: Yao): boolean {
  return isYangYao(y);
}

/** 爻位 1–6 → 爻名（初九 / 六二 / 上九 …） */
export function yaoLabel(pos: number, yang: boolean): string {
  if (!Number.isInteger(pos) || pos < 1 || pos > 6) {
    throw new RangeError(`yao pos must be integer 1..6, got ${pos}`);
  }
  return yang ? YANG_LABELS[pos - 1]! : YIN_LABELS[pos - 1]!;
}
