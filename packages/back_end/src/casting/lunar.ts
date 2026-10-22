import { Lunar, Solar } from 'lunar-javascript';

import type { JieqiMonthKey, LunarMoment, Zhi, ZhiNum } from '@meihua/shared';
import { zhiNum } from '@meihua/shared';

/**
 * 时支：23:00–00:59 子=1，01:00–02:59 丑=2 … 21:00–22:59 亥=12。
 */
export function hourZhiNum(hour: number): ZhiNum {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be 0..23, got ${hour}`);
  }
  if (hour === 23 || hour === 0) return 1;
  return (Math.floor((hour + 1) / 2) + 1) as ZhiNum;
}

/** 晚子时：23:00–23:59，日历字段归次日 */
export function isLateZiHour(d: Date): boolean {
  return d.getHours() === 23;
}

/** 早子时：00:00–00:59，日历字段仍当日 */
export function isEarlyZiHour(d: Date): boolean {
  return d.getHours() === 0;
}

function assertValidDate(d: Date): void {
  if (Number.isNaN(d.getTime())) {
    throw new RangeError('invalid date');
  }
}

/** 本机时区 ISO 8601 含偏移；禁止 UTC Z 形态 */
export function formatLocalIso(d: Date): string {
  assertValidDate(d);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}:${s}${sign}${hh}:${mm}`;
}

function ganZhiToZhi(ganZhi: string): Zhi {
  const z = ganZhi.slice(-1) as Zhi;
  // 校验十二支
  zhiNum(z);
  return z;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

function toDateFromLocalIso(dateLocal: string): Date {
  const d = new Date(dateLocal);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`invalid dateLocal: ${dateLocal}`);
  }
  return d;
}

/**
 * 公历时刻 → LunarMoment。
 * 晚子时（23:00–23:59）：日历字段（农历日月、年支、月建）按**次日**计算；
 * hourZhi 仍由原时刻钟点定为子。
 */
export function toLunarMomentFromDate(input: Date): LunarMoment {
  assertValidDate(input);
  const hourZhi = hourZhiNum(input.getHours());
  // 级联顺序：先归次日，再算全部日历字段
  const calDate = isLateZiHour(input) ? addDays(input, 1) : input;

  const solar = Solar.fromYmdHms(
    calDate.getFullYear(),
    calDate.getMonth() + 1,
    calDate.getDate(),
    // 用中午避免节气边界瞬间（仅用于取日历日）
    12,
    0,
    0,
  );
  const lunar = Lunar.fromSolar(solar);

  const monthRaw = lunar.getMonth();
  const isLeapMonth = monthRaw < 0;
  const lunarMonth = Math.abs(monthRaw);
  const lunarDay = lunar.getDay();

  const yearZhi = zhiNum(ganZhiToZhi(lunar.getYearInGanZhiByLiChun()));
  const jieqiMonthKey = ganZhiToZhi(lunar.getMonthInGanZhi());

  return {
    solar: formatLocalIso(input),
    lunarMonth,
    lunarDay,
    isLeapMonth,
    yearZhi,
    hourZhi,
    jieqiMonthKey: jieqiMonthKey as JieqiMonthKey,
  };
}

/** 契约入口：本地 ISO 或带偏移 ISO */
export function toLunarMoment(dateLocal: string): LunarMoment {
  return toLunarMomentFromDate(toDateFromLocalIso(dateLocal));
}
