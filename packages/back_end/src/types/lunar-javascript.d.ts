/**
 * lunar-javascript 最小类型声明（库未自带 .d.ts）。
 * 仅覆盖本项目用到的 API。
 */
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmdHms(
      y: number,
      m: number,
      d: number,
      h: number,
      mi: number,
      s: number,
    ): Solar;
    static fromDate(d: Date): Solar;
    toYmd(): string;
    toDate(): Date;
  }

  export class Lunar {
    static fromSolar(solar: Solar): Lunar;
    /** 农历月；闰月为负 */
    getMonth(): number;
    getDay(): number;
    getHour(): number;
    /** 如「丙午」 */
    getYearInGanZhi(): string;
    getYearInGanZhiByLiChun(): string;
    /** 如「戊戌」，支为月建 */
    getMonthInGanZhi(): string;
  }
}
