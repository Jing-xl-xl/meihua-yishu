import type {
  CastResult,
  StepState,
  Verdict,
} from '@meihua/shared';

import type { KnowledgeIndex, KnowledgeQuery } from '../knowledge/query';
import type { LLMProvider } from '../llm/types';
import type { Store } from '../storage/store';
import type { CaseLocks } from '../storage/locks';

export type AppDeps = {
  store: Store;
  knowledge: KnowledgeQuery;
  knowledgeIndex: KnowledgeIndex;
  llm: LLMProvider;
  locks: CaseLocks;
  config: {
    port: number;
    offline: boolean;
    dataDir?: string;
    corsOrigin?: string;
    school?: { movingYao: 'mod' | 'sum'; addHour: boolean };
  };
  /** 测连用工厂；测试可注入假实现 */
  llmFactory?: (cfg: {
    provider: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
  }) => LLMProvider;
  /** PUT 保存后热更新 */
  reloadLlm?: () => void;
  castByNumbers: (o: {
    numbers: number[];
    method: 'number1' | 'number2' | 'number3';
    hourZhi: number;
    school?: { movingYao?: 'mod' | 'sum'; addHour?: boolean };
  }) => CastResult;
  toLunarMoment: (dateLocal: string) => {
    solar: string;
    lunarMonth: number;
    lunarDay: number;
    isLeapMonth: boolean;
    yearZhi: number;
    hourZhi: number;
    jieqiMonthKey: never;
  };
  castByDateTime: (lunar: {
    solar: string;
    lunarMonth: number;
    lunarDay: number;
    isLeapMonth: boolean;
    yearZhi: number;
    hourZhi: number;
    jieqiMonthKey: never;
  }) => CastResult;
  castByDirection: (o: {
    objectGua: never;
    directionGua: never;
    hourZhi: number;
    objectNum?: number;
    directionNum?: number;
  }) => CastResult;
  castByCount: (
    kind: 'objectCount' | 'sound',
    o: { count: number; hourZhi: number },
  ) => CastResult;
  castByText: (o: { text: string; hourZhi?: number }) => CastResult;
  castByMeasureZhangChi: (o: { zhang: number; chi: number }) => CastResult;
  castByMeasureChiCun: (o: {
    chi: number;
    cun: number;
    hourZhi: number;
  }) => CastResult;
  interpret: {
    run: (o: Record<string, unknown>) => Promise<{
      steps: StepState[];
      verdict: Verdict;
      done: boolean;
    }>;
    resume: (o: Record<string, unknown>) => Promise<{
      steps: StepState[];
      verdict: Verdict;
      done: boolean;
    }>;
    revise: (o: Record<string, unknown>) => Promise<{
      steps: StepState[];
      verdict: Verdict;
      done: boolean;
    }>;
    followUp: (o: Record<string, unknown>) => Promise<{ text: string }>;
  };
};
