import type { StepId, StepState } from '@meihua/shared';
import { STEP_IDS, AppError, LlmError } from '@meihua/shared';

import { CaseLocks } from '../storage/locks';
import { tryParseJsonText } from '../llm/parse';
import type { BackgroundAnswer, RunDeps, RunResult, StepContext } from './types';
import {
  isXiantian,
  ruleStep1,
  ruleStep3,
  ruleStep4,
  ruleStep5,
  ruleStep6Houtian,
  ruleStep6Skip,
} from './rules';
import { composeVerdict } from './verdict';
import { truncateReasoning, plainText, cleanAssistantText, PARAMS, STEP_KNOWLEDGE_MAP } from './prompts/common';
import {
  STEP2_SYSTEM,
  STEP3_SYSTEM,
  STEP4_SYSTEM,
  STEP5_SYSTEM,
  STEP6_SYSTEM,
  STEP7_SYSTEM,
  STEP8_SYSTEM,
  STEP9_SYSTEM,
  REFUSAL_SOFTENER,
} from './prompts/steps';
import type { TiYongRelation } from '@meihua/shared';

export const locks = new CaseLocks();

const MAX_BACKGROUND = 3;
const MAX_LLM_RETRY = 2;

type JsonStepOut = {
  conclusion?: string;
  evidence?: string;
  reasoningNote?: string;
  sources?: { id: string; title: string; quote?: string }[];
};

async function llmStep(
  deps: RunDeps,
  system: string,
  user: string,
): Promise<JsonStepOut> {
  let lastErr: unknown;
  let echo = '';
  for (let i = 0; i < MAX_LLM_RETRY; i++) {
    try {
      const r = await deps.llm.streamChat({
        system,
        messages: [
          { role: 'user', content: user + (echo ? `\n\n【上次输出问题】\n${echo}` : '') },
        ],
        temperature: PARAMS.step.temperature,
        maxTokens: PARAMS.step.maxTokens,
      });
      const json = r.json ?? tryParseJsonText(r.text);
      if (json && typeof json === 'object') {
        return json as JsonStepOut;
      }
      echo = `上次输出不是 JSON：${String(r.text).slice(0, 120)}`;
      throw new LlmError('LLM_BAD_JSON', 'step output not json');
    } catch (e) {
      lastErr = e;
      const code = e instanceof AppError ? e.code : 'INTERNAL';
      if (
        code === 'NO_API_KEY' ||
        code === 'LLM_UNAUTHORIZED' ||
        code === 'LLM_UNAVAILABLE'
      ) {
        throw e;
      }
      if (e instanceof LlmError) {
        echo = e.message;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new LlmError('STEP_FAILED', 'step failed after retry');
}

function isKeyError(e: unknown): boolean {
  return (
    e instanceof AppError &&
    (e.code === 'NO_API_KEY' ||
      e.code === 'LLM_UNAUTHORIZED' ||
      e.code === 'LLM_UNAVAILABLE')
  );
}

function markNeedKey(stepId: StepId, reason: string): StepState {
  return {
    stepId,
    status: 'need_key',
    conclusion: reason,
    sources: [],
    updatedAt: new Date().toISOString(),
  };
}

function markFailed(stepId: StepId, reason: string): StepState {
  return {
    stepId,
    status: 'failed',
    conclusion: reason,
    sources: [],
    updatedAt: new Date().toISOString(),
  };
}

async function runOneStep(
  stepId: StepId,
  ctx: StepContext,
  deps: RunDeps,
): Promise<StepState> {
  const { cast, knowledge: k, offline } = ctx;

  // 规则步
  if (stepId === 1) return ruleStep1(cast);
  if (stepId === 3 && offline) return ruleStep3(cast);
  if (stepId === 4) return ruleStep4(cast, k).state;
  if (stepId === 5) return ruleStep5(cast, k);
  if (stepId === 6) {
    if (isXiantian(cast.method)) return ruleStep6Skip();
    if (offline) return markNeedKey(6, '需配置 API Key 后解读');
    return ruleStep6Houtian(cast, k);
  }

  if (offline) {
    // 2/7/8/9 需 Key（3/4/5 规则已覆盖；6 见上）
    return markNeedKey(stepId, '需配置 API Key 后解读');
  }

  const knowledgeLine = STEP_KNOWLEDGE_MAP[stepId] ?? '';
  const userPrompt = [
    `问题：${ctx.case.input.question}`,
    `占类：${ctx.category ?? '未定'}`,
    `本卦：${cast.ben.name}；变：${cast.bian.name}；动爻：${cast.movingYao}`,
    `体用：${cast.tiYongNote}`,
    `【知识依据】${knowledgeLine}`,
    `卦辞摘要：${k.guaCi(cast.ben.kingwen).slice(0, 80)}`,
    ...ctx.prior.map((p) => `步骤${p.stepId}：${p.conclusion}`),
    ...(ctx.backgroundNotes.length
      ? [`背景：${ctx.backgroundNotes.join('；')}`]
      : []),
    ...((deps as { memoryPrompt?: string }).memoryPrompt
      ? [(deps as { memoryPrompt?: string }).memoryPrompt!]
      : []),
  ].join('\n');

  const systems: Record<number, string> = {
    2: STEP2_SYSTEM,
    3: STEP3_SYSTEM,
    4: STEP4_SYSTEM,
    5: STEP5_SYSTEM,
    6: STEP6_SYSTEM,
    7: STEP7_SYSTEM,
    8: STEP8_SYSTEM,
    9: STEP9_SYSTEM,
  };

  try {
    const out = await llmStep(
      deps,
      (systems[stepId] ?? STEP7_SYSTEM) + '\n' + REFUSAL_SOFTENER,
      userPrompt,
    );
    const state: StepState = {
      stepId,
      status: 'confirmed',
      conclusion: cleanAssistantText(String(out.conclusion ?? '')),
      evidence: out.evidence != null ? plainText(String(out.evidence)) : undefined,
      sources: out.sources ?? [],
      reasoningNote: truncateReasoning(plainText(String(out.reasoningNote ?? ''))),
      updatedAt: new Date().toISOString(),
    };
    // D-2 降级标注
    if (stepId === 7) {
      try {
        k.liuXiang(cast.ti);
      } catch {
        state.conclusion += '（类目库待补）';
      }
    }
    if (stepId === 9) {
      try {
        void (k as { dongJingChiSu?: unknown }).dongJingChiSu;
      } catch {
        /* noop */
      }
      if (state.conclusion && !state.conclusion.includes('待补')) {
        // 若无 dongjing 查询 API，标注细则待补（M3）
        state.conclusion += '（动静应期细则待补）';
      }
    }
    return state;
  } catch (e) {
    if (isKeyError(e)) {
      return markNeedKey(stepId, 'API Key 不可用');
    }
    // 规则兜底：4/5 已规则；其它 failed
    return markFailed(stepId, e instanceof Error ? e.message : 'step failed');
  }
}

function saveAndEmitStep(
  state: StepState,
  deps: RunDeps,
  stepMap: Map<number, StepState>,
): void {
  stepMap.set(state.stepId, state);
  const list = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);
  deps.store.saveSteps(deps.case.id, list);
  if (state.status === 'revised') {
    deps.emit({
      type: 'step_revised',
      caseId: deps.case.id,
      data: state,
    });
  } else {
    deps.emit({
      type: 'step_done',
      caseId: deps.case.id,
      data: state,
    });
  }
}

/** W8 U4：按 category/问题选背景问（MAX_BACKGROUND 仍=3，G 定案） */
function pickBackgroundQuestion(
  stepId: number,
  ctx: { question: string; category?: string },
  askedQs: string[],
): { question: string; options: string[] } | null {
  const q = ctx.question || '';
  const cat = ctx.category ?? '';
  const hit = (s: string) => cat.includes(s) || q.includes(s);
  const table: Array<{
    keys: string[];
    s3: { question: string; options: string[] };
    s7: { question: string; options: string[] };
  }> = [
    {
      keys: ['面试', '工作', '事业', '升职', '跳槽', '财'],
      s3: {
        question: '目前准备到什么程度？最担心哪一环？',
        options: ['准备充分', '一般', '还没开始'],
      },
      s7: {
        question: '你更在意过程表现还是最终结果？',
        options: ['结果', '过程', '都在意'],
      },
    },
    {
      keys: ['找', '寻', '丢', '失'],
      s3: {
        question: '大约何时不见？是常用物还是偶然带的？',
        options: ['今日', '近日', '很久了'],
      },
      s7: {
        question: '更急找回，还是想知大概去向？',
        options: ['找回', '去向', '随缘'],
      },
    },
    {
      keys: ['婚', '恋', '爱', '对象', '复合'],
      s3: {
        question: '是想问发展，还是想问要不要继续？',
        options: ['发展', '是否继续', '对方态度'],
      },
      s7: {
        question: '此事你最想确认哪一点？',
        options: ['态度', '时机', '结果'],
      },
    },
    {
      keys: ['病', '健康', '不适', '心惊', '身体', '睡眠'],
      s3: {
        question: '是偶发还是已持续几日？近日睡眠或压力如何？',
        options: ['偶发', '已持续', '说不清'],
      },
      s7: {
        question: '更担心原因，还是何时缓解？',
        options: ['原因', '何时好', '都关心'],
      },
    },
    {
      keys: ['行', '出行', '旅', '迁', '搬家'],
      s3: {
        question: '是问该不该去，还是问是否顺利？',
        options: ['该不该去', '是否顺利', '都有'],
      },
      s7: {
        question: '目前最顾虑什么？',
        options: ['安全', '花费', '时机'],
      },
    },
  ];
  let pack = table.find((t) => t.keys.some(hit));
  if (!pack) {
    pack = {
      keys: [],
      s3: {
        question: '你与所问之事的关系是？（可跳过）',
        options: ['当事者', '替人问', '旁观关心'],
      },
      s7: {
        question: '此事更关心结果还是过程？',
        options: ['结果', '过程', '都关心'],
      },
    };
  }
  const picked = stepId === 3 ? pack.s3 : pack.s7;
  if (askedQs.includes(picked.question)) {
    const alt = stepId === 3 ? pack.s7 : pack.s3;
    if (!askedQs.includes(alt.question)) return alt;
    return null;
  }
  return picked;
}

function askBackground(
  stepId: StepId,
  question: string,
  deps: RunDeps,
  asked: number,
  options?: string[],
): boolean {
  if (asked >= MAX_BACKGROUND) return false;
  deps.emit({
    type: 'need_input',
    caseId: deps.case.id,
    data: {
      stepId,
      question: plainText(question),
      options: [...(options ?? []), '跳过'].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
    },
  });
  return true;
}

export async function runInterpret(
  opts: RunDeps & { fromStep?: StepId },
): Promise<RunResult> {
  const caseId = opts.case.id;
  locks.acquire(caseId);
  const stepMap = new Map<number, StepState>();
  const backgroundNotes: string[] = [];
  const askedQs: string[] = [];
  const offline = opts.offline ?? false;
  const skip6 = isXiantian(opts.cast.method);

  try {
    const from = opts.fromStep ?? 1;
    const ctx: StepContext = {
      case: opts.case,
      cast: opts.cast,
      prior: [],
      backgroundNotes,
      personMemories: opts.personMemories ?? [],
      knowledge: opts.knowledge,
      offline,
      category: opts.case.input.category,
      step6Skipped: skip6,
    };

    let asked = 0;
    let relation: TiYongRelation | undefined;

    for (const id of STEP_IDS) {
      if (id < from) continue;
      ctx.prior = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);

      // 背景提问：步 3 / 7（M3：发 need_input 后立即返回）
      if ((id === 3 || id === 7) && !offline && asked < MAX_BACKGROUND) {
        const bg = pickBackgroundQuestion(
          id,
          {
            question: opts.case.input.question ?? '',
            category: opts.case.input.category,
          },
          askedQs,
        );
        const q =
          bg?.question ??
          (id === 3
            ? '求卦人与所问之事的关系是？（可跳过）'
            : '此事更关心结果还是过程？（可跳过）');
        if (bg) askedQs.push(bg.question);
        if (askBackground(id, q, opts, asked, bg?.options)) {
          asked++;
          // 立即返回，锁由 finally 释放
          const partial: StepState[] = [...stepMap.values()].sort(
            (a, b) => a.stepId - b.stepId,
          );
          const verdict = composeVerdict({
            steps: partial,
            relation,
            category: ctx.category,
          });
          return { steps: partial, verdict, done: false };
        }
      }

      const state = await runOneStep(id, ctx, opts);
      saveAndEmitStep(state, opts, stepMap);
      if (id === 4) {
        relation = ruleStep4(opts.cast, opts.knowledge).relation;
      }
    }

    const steps = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);
    const verdict = composeVerdict({
      steps,
      relation,
      category: ctx.category,
    });
    opts.store.updateCaseVerdict(caseId, verdict);
    opts.emit({ type: 'verdict', caseId, data: verdict });
    opts.emit({ type: 'done', caseId, data: { caseId, sessionId: opts.case.sessionId } });
    return { steps, verdict, done: true };
  } finally {
    locks.release(caseId);
  }
}

export async function resumeInterpret(
  opts: RunDeps & { answers: BackgroundAnswer[]; fromStep?: StepId },
): Promise<RunResult> {
  const caseId = opts.case.id;
  for (const a of opts.answers) {
    if (!a.text || a.text === '跳过') continue;
    opts.store.appendMessage({
      sessionId: opts.case.sessionId,
      caseId,
      role: 'user',
      content: a.text,
    });
  }
  const notes = opts.answers
    .filter((a) => a.text && a.text !== '跳过')
    .map((a) => a.text);

  // 从被问的步继续
  const askedStep = opts.answers[0]?.stepId;
  const from: StepId = askedStep ?? opts.fromStep ?? 1;

  locks.acquire(caseId);
  const stepMap = new Map<number, StepState>();
  const offline = opts.offline ?? false;
  try {
    const ctx: StepContext = {
      case: opts.case,
      cast: opts.cast,
      prior: [],
      backgroundNotes: notes,
      personMemories: opts.personMemories ?? [],
      knowledge: opts.knowledge,
      offline,
      category: opts.case.input.category,
      step6Skipped: isXiantian(opts.cast.method),
    };
    let relation: TiYongRelation | undefined;

    for (const id of STEP_IDS) {
      if (id < from) continue;
      ctx.prior = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);
      // resume 后不再对同一轮重复 need_input（已过提问点）
      const state = await runOneStep(id, ctx, opts);
      saveAndEmitStep(state, opts, stepMap);
      if (id === 4) {
        relation = ruleStep4(opts.cast, opts.knowledge).relation;
      }
    }
    const steps = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);
    const verdict = composeVerdict({
      steps,
      relation,
      category: ctx.category,
    });
    opts.store.updateCaseVerdict(caseId, verdict);
    opts.emit({ type: 'verdict', caseId, data: verdict });
    opts.emit({ type: 'done', caseId, data: { caseId, sessionId: opts.case.sessionId } });
    return { steps, verdict, done: true };
  } finally {
    locks.release(caseId);
  }
}

export async function reviseInterpret(
  opts: RunDeps & { stepId: StepId; message: string },
): Promise<RunResult> {
  const caseId = opts.case.id;
  // 插话先落库
  opts.store.appendMessage({
    sessionId: opts.case.sessionId,
    caseId,
    role: 'user',
    content: opts.message,
  });

  locks.acquire(caseId);
  const stepMap = new Map<number, StepState>();
  const offline = opts.offline ?? false;
  try {
    const ctx: StepContext = {
      case: opts.case,
      cast: opts.cast,
      prior: [],
      backgroundNotes: [opts.message],
      personMemories: opts.personMemories ?? [],
      knowledge: opts.knowledge,
      offline,
      category: opts.case.input.category,
      step6Skipped: isXiantian(opts.cast.method),
    };
    let relation: TiYongRelation | undefined;

    for (const id of STEP_IDS) {
      if (id < opts.stepId) continue;
      ctx.prior = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);
      const base = await runOneStep(id, ctx, opts);
      const state: StepState =
        id === opts.stepId ? { ...base, status: 'revised' } : base;
      saveAndEmitStep(state, opts, stepMap);
      if (id === 4) {
        relation = ruleStep4(opts.cast, opts.knowledge).relation;
      }
    }
    const steps = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);
    const verdict = composeVerdict({
      steps,
      relation,
      category: ctx.category,
    });
    opts.store.updateCaseVerdict(caseId, verdict);
    opts.emit({ type: 'verdict', caseId, data: verdict });
    opts.emit({ type: 'done', caseId, data: { caseId, sessionId: opts.case.sessionId } });
    return { steps, verdict, done: true };
  } finally {
    locks.release(caseId);
  }
}

export async function answerFollowUp(opts: {
  case: CaseLike;
  cast: import('@meihua/shared').CastResult;
  steps: StepState[];
  question: string;
  knowledge: import('../knowledge/query').KnowledgeQuery;
  llm: import('../llm/types').LLMProvider;
  offline?: boolean;
  memoryPrompt?: string;
  emit?: import('./types').Emit;
}): Promise<{ text: string }> {
  if (opts.offline) {
    throw new AppError('NO_API_KEY', 'follow-up requires api key');
  }
  try {
    const user = [
      `问题：${opts.question}`,
      `本卦：${opts.cast.ben.name}之${opts.cast.bian.name}，动${opts.cast.movingYao}`,
      opts.memoryPrompt ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    const r = await opts.llm.streamChat({
      system: '同一卦补充解读，不重起卦。只用纯文本，禁止 Markdown 符号。',
      messages: [{ role: 'user', content: user }],
    });
    return { text: r.text };
  } catch (e) {
    if (isKeyError(e)) throw e;
    throw new AppError('STEP_FAILED', 'follow-up failed');
  }
}

type CaseLike = { id: string; sessionId: string; input: { question: string } };

export type { RunResult };
