import type {
  Case,
  CastResult,
  MemoryEntry,
  SSEEvent,
  StepId,
  StepState,
  Verdict,
} from '@meihua/shared';

import type { KnowledgeQuery } from '../knowledge/query';
import type { LLMProvider } from '../llm/types';
import type { Store } from '../storage/store';

export type Emit = (e: SSEEvent) => void;

export type StepContext = {
  case: Case;
  cast: CastResult;
  prior: StepState[];
  backgroundNotes: string[];
  personMemories: MemoryEntry[];
  knowledge: KnowledgeQuery;
  offline: boolean;
  category?: string;
  step6Skipped: boolean;
};

export type RunResult = {
  steps: StepState[];
  verdict: Verdict;
  /** need_input 后立即返回 false 并释放锁 */
  done: boolean;
};

export type RunDeps = {
  case: Case;
  cast: CastResult;
  store: Store;
  knowledge: KnowledgeQuery;
  llm: LLMProvider;
  personMemories?: MemoryEntry[];
  /** 优先；由 I 渲染后经 H 传入 */
  memoryPrompt?: string;
  offline?: boolean;
  emit: Emit;
  signal?: AbortSignal;
  now?: () => string;
};

export type StepRunner = {
  id: StepId;
  title: string;
  run(ctx: StepContext, deps: RunDeps): Promise<StepState>;
};

export type BackgroundAnswer = {
  stepId?: StepId;
  text: string;
  remember?: boolean;
};
