import type { Zhi, ZhiNum } from '../types/base';
import { ZHI_BY_NUM, ZHI_NUM } from '../constants/zhi';

export function zhiNum(z: Zhi): ZhiNum {
  return ZHI_NUM[z];
}

export function zhiName(n: ZhiNum): Zhi {
  const z = ZHI_BY_NUM[n - 1];
  if (!z) {
    throw new RangeError(`zhi num must be 1..12, got ${n}`);
  }
  return z;
}
