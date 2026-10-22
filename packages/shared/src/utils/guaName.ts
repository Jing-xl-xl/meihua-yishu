import type { Gua, HexagramMeta } from '../types/base';
import { GUA_IDS } from '../constants/gua';
import { GUA_NAME_ZH, GUA_NATURE_ZH } from '../constants/gua';
import { HEXAGRAM_TABLE } from '../constants/hexagrams';

export function isGua(v: unknown): v is Gua {
  return typeof v === 'string' && (GUA_IDS as readonly string[]).includes(v);
}

export function guaNameZh(g: Gua): string {
  return GUA_NAME_ZH[g];
}

export function guaNatureZh(g: Gua): string {
  return GUA_NATURE_ZH[g];
}

export function hexMeta(upper: Gua, lower: Gua): HexagramMeta {
  const hit = HEXAGRAM_TABLE.find(
    (h) => h.upper === upper && h.lower === lower,
  );
  if (!hit) {
    throw new RangeError(`no hexagram for ${upper}/${lower}`);
  }
  return hit;
}

export function hexName(upper: Gua, lower: Gua): string {
  return hexMeta(upper, lower).name;
}

export function hexByKingwen(kingwen: number): HexagramMeta {
  if (!Number.isInteger(kingwen) || kingwen < 1 || kingwen > 64) {
    throw new RangeError(`kingwen must be 1..64, got ${kingwen}`);
  }
  return HEXAGRAM_TABLE[kingwen - 1]!;
}
