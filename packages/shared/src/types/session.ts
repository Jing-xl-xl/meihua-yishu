import type { Verdict } from './verdict';
import type { CastMethod, CastResult } from './cast';
import type { StepState } from './step';

export type Person = {
  id: string;
  name: string;
  createdAt: string;
  profileCard?: string;
  /** W12 先天角色稿 */
  roleCard?: string;
};

/** 案例输入快照（一会话一案例；Message 支持追问） */
export type CaseInput = {
  question: string;
  numbers?: number[];
  timeLocal?: string;
  direction?: string;
  objectNote?: string;
  contextNote?: string;
  category?: string;
};

export type SessionStatus = 'open' | 'done';

export type CaseStatus =
  | 'draft'
  | 'routed'
  | 'casted'
  | 'interpreting'
  | 'awaiting_user'
  | 'done';

/** 会话 = 线程；卦/九步/占断挂在 Case（一会话一案例） */
export type Session = {
  id: string;
  personId: string;
  title?: string;
  status: SessionStatus;
  /** route 往返轮次（≤2）；W7 session 级持久化 */
  routeRounds?: number;
  createdAt: string;
  updatedAt: string;
};

export type Case = {
  id: string;
  sessionId: string;
  personId: string;
  input: CaseInput;
  method?: CastMethod;
  methodReason?: string;
  methodOverridden?: boolean;
  /** 路由追问轮次，≤2 */
  routeRounds?: number;
  cast?: CastResult;
  steps: StepState[];
  status: CaseStatus;
  verdict?: Verdict;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  sessionId: string;
  caseId?: string;
  role: 'user' | 'assistant' | 'system';
  stepId?: number;
  content: string;
  createdAt: string;
};
