export type Gua =
  | 'qian'
  | 'dui'
  | 'li'
  | 'zhen'
  | 'xun'
  | 'kan'
  | 'gen'
  | 'kun';

/** 兼容别名 */
export type GuaId = Gua;

export type Element = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

/** 6 老阴 · 7 少阳 · 8 少阴 · 9 老阳 */
export type Yao = 6 | 7 | 8 | 9;

/** 排盘/起卦用（方案 A）；6/9 留给将来六爻 */
export type YinYangLine = 7 | 8;

/** 六爻（广义，含老爻）；排盘请用 HexLines */
export type SixLines = [Yao, Yao, Yao, Yao, Yao, Yao];

/** 起卦排盘六爻：下 → 上，仅 7/8 */
export type HexLines = [
  YinYangLine,
  YinYangLine,
  YinYangLine,
  YinYangLine,
  YinYangLine,
  YinYangLine,
];

/** 动爻爻位 1–6（勿与流派 MovingYaoSchool 混淆） */
export type MovingYaoPosition = 1 | 2 | 3 | 4 | 5 | 6;

export type Confidence = 'high' | 'mid' | 'low';

/**
 * 互卦双轨：两经卦为主 + 可选 64 名。
 * 任意两经卦组合在 64 卦中恒存在；可选仅宽容中间态/部分构造。
 */
export type DualGua = {
  upper: Gua;
  lower: Gua;
  name?: string;
};

/** 单卦（本卦/变卦）；name/kingwen 来自 HEXAGRAM_TABLE */
export type TripleHex = {
  lines: HexLines;
  upper: Gua;
  lower: Gua;
  /** 如「山天大畜」 */
  name: string;
  /** 文王序 1–64 */
  kingwen: number;
};

export type Zhi =
  | '子'
  | '丑'
  | '寅'
  | '卯'
  | '辰'
  | '巳'
  | '午'
  | '未'
  | '申'
  | '酉'
  | '戌'
  | '亥';

export type ZhiNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * 月建 = 地支。立春起寅月，依次卯…丑。
 * 与 wangshuai.json 键契约一致（模块 D）。
 */
export type JieqiMonthKey = Zhi;

export type LunarMoment = {
  /** 本机时区 ISO 8601 含偏移，例 2026-10-18T11:00:00+08:00 */
  solar: string;
  lunarMonth: number;
  lunarDay: number;
  isLeapMonth: boolean;
  /** 1–12，子=1 */
  yearZhi: number;
  /** 1–12，子=1 */
  hourZhi: number;
  jieqiMonthKey: JieqiMonthKey;
};

export type HexagramMeta = {
  kingwen: number;
  upper: Gua;
  lower: Gua;
  name: string;
};
