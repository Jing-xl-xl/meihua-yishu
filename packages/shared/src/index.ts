// 易学基础
export type {
  Gua,
  GuaId,
  Element,
  Yao,
  YinYangLine,
  SixLines,
  HexLines,
  MovingYaoPosition,
  Confidence,
  DualGua,
  TripleHex,
  Zhi,
  ZhiNum,
  JieqiMonthKey,
  LunarMoment,
  HexagramMeta,
} from './types/base';

// 起卦
export type {
  CastMethod,
  MethodPolarity,
  MovingYaoSchool,
  CastSchool,
  FormulaStep,
  CastResult,
  CastOverrides,
} from './types/cast';

// 九步
export type {
  StepId,
  StepStatus,
  SourceRef,
  StepState,
} from './types/step';

// 档案 / 会话 / 案例
export type {
  Person,
  CaseInput,
  SessionStatus,
  CaseStatus,
  Session,
  Case,
  Message,
} from './types/session';

export type { Verdict, VerdictGrade } from './types/verdict';

export type {
  MemoryType,
  RoundMemory,
  ResultMemory,
  AnchorMemory,
  MemoryEntry,
} from './types/memory';

export type { CaseRecord } from './types/case';

export type { SSEEvent, ObjectGuaCandidate } from './types/sse';

// 常量
export {
  GUA_IDS,
  GUA_NUM,
  GUA_WUXING,
  GUA_NAME_ZH,
  GUA_NATURE_ZH,
} from './constants/gua';
export { YAO_VALUES } from './constants/yao';
export { HEXAGRAM_TABLE } from './constants/hexagrams';
export { ELEMENTS, WUXING_SHENG, WUXING_KE } from './constants/wuxing';
export { ZHI_NUM, ZHI_BY_NUM } from './constants/zhi';
export {
  PERSON_TO_GUA,
  FANGWEI_TO_GUA,
  GUA_ENUM,
  isGuaId,
} from './constants/personGua';
export type { PersonMapKey } from './constants/personGua';
export { STEP_IDS, STEP_TITLES, STEP_STATUSES } from './constants/steps';
export { CAST_METHODS, METHOD_POLARITY } from './constants/methods';
export { SCHOOL_DEFAULTS } from './constants/school';

// 工具
export {
  isYangYao,
  isMovingYao,
  yaoToYang,
  yaoLabel,
} from './utils/yao';
export {
  isGua,
  guaNameZh,
  guaNatureZh,
  hexMeta,
  hexName,
  hexByKingwen,
} from './utils/guaName';
export { elementRelation } from './utils/wuxing';
export type { ElementRelation } from './utils/wuxing';
export {
  tiYongFromMovingYao,
  qiFromDual,
  qiSegment,
  qiSegments,
  qiTrendPlain,
  mapRelation,
} from './utils/tiYongQi';
export type { QiSegment, QiRelation, QiFlow } from './utils/tiYongQi';
export {
  guaFromLines,
  linesFromHex,
  nameFromDual,
  labelDual,
  huFromBen,
  huWithSpecial,
  cuoGua,
  zongGua,
  linesFromKingwen,
  dualLabel,
} from './utils/hexRel';
export { zhiNum, zhiName } from './utils/zhi';
export { newId } from './utils/id';
export { isStepId } from './utils/stepId';

// 知识词条
export type {
  HexLineData,
  HexagramData,
  WangShuaiEntry,
  WangShuaiMap,
  TiYongRelation,
  KnowledgeMeta,
  AnchorRef,
} from './types/knowledge';

// 全局错误
export { AppError, LlmError, isAppError } from './errors';
export type { ErrorCode } from './errors';
