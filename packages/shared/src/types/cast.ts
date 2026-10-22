import type {
  DualGua,
  Gua,
  LunarMoment,
  MovingYaoPosition,
  TripleHex,
} from './base';

export type CastMethod =
  | 'number1'
  | 'number2'
  | 'number3'
  | 'datetime'
  | 'objectCount'
  | 'sound'
  | 'text'
  | 'measure'
  | 'measureZhangChi'
  | 'measureChiCun'
  | 'direction';

export type MethodPolarity = 'xiantian' | 'houtian';

/** 动爻流派，非爻位 */
export type MovingYaoSchool = 'mod' | 'sum';

export type CastSchool = {
  movingYao: MovingYaoSchool;
  addHour: boolean;
};

export type FormulaStep = {
  label: string;
  expr: string;
  remainder?: number;
  mapped?: Gua | number;
  note?: string;
};

export type CastResult = {
  method: CastMethod;
  school: CastSchool;
  formula: FormulaStep[];
  lunar?: LunarMoment;
  ben: TripleHex;
  /** 互卦双轨：两经卦 + 附 64 名 */
  hu: DualGua;
  bian: TripleHex;
  movingYao: MovingYaoPosition;
  ti: Gua;
  yong: Gua;
  tiYongNote: string;
};

export type CastOverrides = {
  method?: CastMethod;
  /** 端法物象卦（≠ objectCount 方法） */
  objectGua?: Gua;
  directionGua?: Gua;
  numbers?: number[];
  timeLocal?: string;
};
