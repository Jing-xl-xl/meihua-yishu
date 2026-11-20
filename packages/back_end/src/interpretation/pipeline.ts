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
  tiWangShuai,
} from './rules';
import { composeVerdict, enrichVerdictCopy } from './verdict';
import { attachSignPoem } from './poem';
import { validateCopy } from './copyCheck';
import { truncateReasoning, plainText, cleanAssistantText, PARAMS, STEP_KNOWLEDGE_MAP } from './prompts/common';
import {
  buildLiuXiangExcerpt,
  isLiuXiangEmpty,
} from './liuxiangBrief';
import {
  buildCharacterSystem,
  normalizeTone,
  validateFeiyuVoice,
  type PersonaId,
} from './prompts/persona';
import {
  fallbackAsk,
  pickBackgroundAsk,
  type AskSpec,
} from './background';
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

const MAX_BACKGROUND = 2;
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
  onDelta?: (text: string) => void,
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
        onDelta,
        signal: deps.signal,
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

/** verdict 定稿后：占断人话化 + 后台实时写签诗 */
async function withSignPoem(
  verdict: Awaited<ReturnType<typeof composeVerdict>>,
  opts: {
    case: { id: string; input: { question?: string } };
    cast: import('@meihua/shared').CastResult;
    llm: import('../llm/types').LLMProvider;
    offline?: boolean;
    emit?: import('./types').Emit;
    signal?: AbortSignal;
    tone?: string;
    memoryPrompt?: string;
  },
  steps: StepState[],
) {
  const persona = (opts as { persona?: PersonaId }).persona ?? 'feiyu';
  const enriched = await enrichVerdictCopy({
    verdict,
    llm: opts.llm,
    offline: opts.offline,
    persona,
    question: opts.case.input.question ?? '',
    stepConclusions: steps
      .filter((s) => s.conclusion)
      .map((s) => s.conclusion),
    signal: opts.signal,
    tone: opts.tone,
    memoryPrompt: opts.memoryPrompt,
    steps,
    onSummaryDelta: (t) => {
      opts.emit?.({
        type: 'verdict_delta',
        caseId: opts.case.id,
        data: { field: 'summary', text: t, append: true },
      });
    },
  });
  return attachSignPoem(enriched, {
    llm: opts.llm,
    offline: opts.offline,
    signal: opts.signal,
    question: opts.case.input.question ?? '',
    benName: opts.cast.ben.name,
    movingYao: opts.cast.movingYao,
    tiYongNote: opts.cast.tiYongNote,
    gradeLabel: verdict.grade,
    persona,
    onPoemLine: (kind, text) => {
      opts.emit?.({
        type: 'verdict_delta',
        caseId: opts.case.id,
        data: {
          field: 'poem',
          text: JSON.stringify({ line: kind, text }),
          append: true,
        },
      });
    },
    stepBrief: steps
      .filter((s) => s.conclusion)
      .slice(-3)
      .map((s) => s.conclusion)
      .join('；'),
  });
}

async function runOneStep(
  stepId: StepId,
  ctx: StepContext,
  deps: RunDeps,
): Promise<StepState> {
  ensureAlive(deps);
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
  const liuxiangBlock =
    stepId === 7
      ? buildLiuXiangExcerpt({
          ti: cast.ti,
          yong: cast.yong,
          tiBag: k.liuXiang(cast.ti as never),
          yongBag: k.liuXiang(cast.yong as never),
          category: ctx.category,
          question: ctx.case.input.question,
        })
      : '';
  const userPrompt = [
    `问题：${ctx.case.input.question}`,
    `占类：${ctx.category ?? '未定'}`,
    `本卦：${cast.ben.name}；变：${cast.bian.name}；动爻：${cast.movingYao}`,
    `体用：${cast.tiYongNote}`,
    `【知识依据】${knowledgeLine}`,
    ...(liuxiangBlock ? [liuxiangBlock] : []),
    `卦辞摘要：${k.guaCi(cast.ben.kingwen).slice(0, 80)}`,
    ...(isXiantian(cast.method)
      ? []
      : [`动爻爻辞：${k.lineText(cast.ben.kingwen, cast.movingYao)}`]),
    ...(stepId === 8
      ? [
          `互卦：${cast.hu?.name ?? '—'}；变卦：${cast.bian.name}`,
          '互看过程、变看结果；请给出可复核的依据（互/变与体的生克走向），不要只给形容词。',
        ]
      : []),
    ...ctx.prior.map((p) => `步骤${p.stepId}：${p.conclusion}`),
    ...(ctx.backgroundNotes.length
      ? [`背景：${ctx.backgroundNotes.join('；')}`]
      : []),
    ...((deps as { memoryPrompt?: string }).memoryPrompt
      ? [(deps as { memoryPrompt?: string }).memoryPrompt!]
      : []),
  ].join('\n');

  const tone = normalizeTone((deps as { tone?: string }).tone);
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
    let stepDelta = '';
    let stepDeltaShown = 0;
    const out = await llmStep(
      deps,
      [
        buildCharacterSystem({ stage: 'interpret', tone }),
        systems[stepId] ?? STEP7_SYSTEM,
        REFUSAL_SOFTENER,
      ].join('\n'),
      userPrompt,
      (chunk) => {
        stepDelta += chunk;
        // P1：只流 conclusion 可见增量（粗提取）
        const m = stepDelta.match(/"conclusion"\s*:\s*"([^"]*)/);
        const visible = m?.[1] ?? '';
        if (visible) {
          deps.emit?.({
            type: 'step_delta',
            caseId: ctx.case.id,
            data: {
              stepId,
              field: 'conclusion',
              text: visible.slice(stepDeltaShown),
            },
          });
          stepDeltaShown = visible.length;
        }
      },
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
    // P0 机检：命中只做记录（不把内部提示渲染给用户；完整重写留给占断层）
    const copy = validateCopy(state.conclusion, { where: `step${stepId}` });
    const voice = validateFeiyuVoice(state.conclusion);
    if (!voice.ok && process.env.NODE_ENV !== 'test') {
      console.warn(
        `[feiyuVoice] step${stepId} 命中：${voice.hits.join('/')}`,
      );
    }
    if (!copy.ok && process.env.NODE_ENV !== 'test') {
      console.warn(
        `[copyCheck] step${stepId} 命中：${copy.hits.map((h) => h.token).join('/')}`,
      );
    }
    // D-2 降级标注（W7：缺文件返回空 bag）
    if (stepId === 7) {
      if (isLiuXiangEmpty(k.liuXiang(cast.ti as never))) {
        state.conclusion += '（类目库待补）';
      }
    }
    // 步 9：不动静细则数据时，由 prompt 内约束“按卦气与动爻给粗应期”，不再硬拼待补句

    return state;
  } catch (e) {
    if (deps.signal?.aborted) {
      throw new AppError('LLM_ABORT', 'client aborted');
    }
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

/** 客户端已断开：立即中止并释放锁（避免幽灵跑与重复写库） */
function ensureAlive(deps: { signal?: AbortSignal }): void {
  if (deps.signal?.aborted) {
    throw new AppError('LLM_ABORT', 'client aborted');
  }
}

/** 起卦前已问过（precast）：步 3 不再重复问 */
function precastAsked(deps: RunDeps): boolean {
  try {
    const msgs = deps.store.listMessages(deps.case.sessionId, deps.case.id);
    return msgs.some(
      (m) => m.role === 'system' && m.content.startsWith('__bg_asked__:precast'),
    );
  } catch {
    return false;
  }
}

/** 是否该在此步问背景（幂等 + 次数上限 + 槽位） */
function shouldAsk(
  deps: RunDeps,
  stepId: 3 | 7,
  asked: number,
  ctx: { question: string; category?: string },
): AskSpec | null {
  if (deps.offline) return null;
  if (asked >= MAX_BACKGROUND) return null;
  if (askedBefore(deps, stepId)) return null;
  if (stepId === 3 && precastAsked(deps)) return null;
  return pickBackgroundAsk(stepId, ctx, []) ?? fallbackAsk(stepId);
}

const BG_MARK = '__bg_asked__:';

function bgMarker(stepId: StepId): string {
  return `${BG_MARK}${stepId}`;
}

/** 该案例是否已问过某步的背景（持久化在 messages，跨 run / resume 幂等） */
function askedBefore(deps: RunDeps, stepId: StepId): boolean {
  try {
    const msgs = deps.store.listMessages(deps.case.sessionId, deps.case.id);
    return msgs.some(
      (m) => m.role === 'system' && m.content.startsWith(bgMarker(stepId)),
    );
  } catch {
    return false;
  }
}

function markAsked(deps: RunDeps, stepId: StepId): void {
  try {
    deps.store.appendMessage({
      sessionId: deps.case.sessionId,
      caseId: deps.case.id,
      role: 'system',
      content: bgMarker(stepId),
    });
  } catch {
    /* 标记失败不阻断主流程 */
  }
}

function askBackground(
  spec: AskSpec,
  deps: RunDeps,
  asked: number,
): boolean {
  if (asked >= MAX_BACKGROUND) return false;
  markAsked(deps, spec.stepId);
  deps.emit({
    type: 'need_input',
    caseId: deps.case.id,
    data: {
      stepId: spec.stepId,
      slot: spec.slot,
      question: plainText(spec.question),
      why: plainText(spec.why),
      examples: spec.examples.map((x) => plainText(x)),
      suggested: spec.suggested.map((x) => plainText(x)),
      options: [...spec.suggested, '跳过'].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
      canSkip: true,
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
  const offline = opts.offline ?? false;
  const skip6 = isXiantian(opts.cast.method);

  try {
    const from = opts.fromStep ?? 1;
    const ctx: StepContext = {
      case: opts.case,
      cast: opts.cast,
      prior: [],
      backgroundNotes: [
        ...(opts.case.input.contextNote ? [opts.case.input.contextNote] : []),
        ...backgroundNotes,
      ],
      personMemories: opts.personMemories ?? [],
      knowledge: opts.knowledge,
      offline,
      category: opts.case.input.category,
      step6Skipped: skip6,
    };

    let asked = 0;
    // 规格 §5.5：revise 从 n>4 起跑也必须补算 relation
    let relation: TiYongRelation = ruleStep4(opts.cast, opts.knowledge).relation;
    const wang = tiWangShuai(opts.cast, opts.knowledge);

    for (const id of STEP_IDS) {
      ensureAlive(opts);
      if (id < from) continue;
      ctx.prior = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);

      // 背景提问：步 3 / 7（M3：发 need_input 后立即返回）；每案例每步只问一次
      if ((id === 3 || id === 7) && !opts.fromStep) {
        const ask = shouldAsk(opts, id, asked, {
          question: opts.case.input.question ?? '',
          category: opts.case.input.category,
        });
        if (ask && askBackground(ask, opts, asked)) {
          asked++;
          // 立即返回，锁由 finally 释放
          const partial: StepState[] = [...stepMap.values()].sort(
            (a, b) => a.stepId - b.stepId,
          );
          const verdict = composeVerdict({
            steps: partial,
            relation,
            wangShuai: wang,
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
    const verdict = await withSignPoem(
      composeVerdict({
        steps,
        relation,
        wangShuai: wang,
        category: ctx.category,
      }),
      opts,
      steps,
    );
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
      backgroundNotes: [
        ...(opts.case.input.contextNote ? [opts.case.input.contextNote] : []),
        ...notes,
      ],
      personMemories: opts.personMemories ?? [],
      knowledge: opts.knowledge,
      offline,
      category: opts.case.input.category,
      step6Skipped: isXiantian(opts.cast.method),
    };
    // 规格 §5.5：revise 从 n>4 起跑也必须补算 relation
    let relation: TiYongRelation = ruleStep4(opts.cast, opts.knowledge).relation;
    const wang = tiWangShuai(opts.cast, opts.knowledge);

    let asked = 0;
    for (const id of STEP_IDS) {
      ensureAlive(opts);
      if (id < from) continue;
      ctx.prior = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);

      // 步 7 的背景问在续跑路径补上；步 3 已问过（marker 幂等，不会重复问）
      if (id === 3 || id === 7) {
        const ask = shouldAsk(opts, id, asked, {
          question: opts.case.input.question ?? '',
          category: opts.case.input.category,
        });
        if (ask && askBackground(ask, opts, asked)) {
          asked++;
          const partial: StepState[] = [...stepMap.values()].sort(
            (a, b) => a.stepId - b.stepId,
          );
          const partialVerdict = composeVerdict({
            steps: partial,
            relation,
            wangShuai: wang,
            category: ctx.category,
          });
          return { steps: partial, verdict: partialVerdict, done: false };
        }
      }

      const state = await runOneStep(id, ctx, opts);
      saveAndEmitStep(state, opts, stepMap);
      if (id === 4) {
        relation = ruleStep4(opts.cast, opts.knowledge).relation;
      }
    }
    const steps = [...stepMap.values()].sort((a, b) => a.stepId - b.stepId);
    const verdict = await withSignPoem(
      composeVerdict({
        steps,
        relation,
        wangShuai: wang,
        category: ctx.category,
      }),
      opts,
      steps,
    );
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
      backgroundNotes: [
        ...(opts.case.input.contextNote ? [opts.case.input.contextNote] : []),
        opts.message,
      ],
      personMemories: opts.personMemories ?? [],
      knowledge: opts.knowledge,
      offline,
      category: opts.case.input.category,
      step6Skipped: isXiantian(opts.cast.method),
    };
    // 规格 §5.5：revise 从 n>4 起跑也必须补算 relation
    let relation: TiYongRelation = ruleStep4(opts.cast, opts.knowledge).relation;
    const wang = tiWangShuai(opts.cast, opts.knowledge);

    for (const id of STEP_IDS) {
      ensureAlive(opts);
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
    const verdict = await withSignPoem(
      composeVerdict({
        steps,
        relation,
        wangShuai: wang,
        category: ctx.category,
      }),
      opts,
      steps,
    );
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
  persona?: PersonaId;
  emit?: import('./types').Emit;
  signal?: AbortSignal;
}): Promise<{ text: string }> {
  if (opts.offline) {
    throw new AppError('NO_API_KEY', 'follow-up requires api key');
  }
  try {
    const caseId = opts.case.id;
    const stepBrief = (opts.steps ?? [])
      .filter((s) => s.conclusion)
      .map((s) => `步骤${s.stepId}：${s.conclusion}`)
      .slice(0, 4)
      .join('\n');
    const tone = normalizeTone((opts as { tone?: string }).tone);
    const user = [
      `问题：${opts.question}`,
      `本卦：${opts.cast.ben.name}之${opts.cast.bian?.name ?? ''}，动${opts.cast.movingYao}`,
      stepBrief ? `已断九步（只作依据，勿复述）：\n${stepBrief}` : '',
      opts.memoryPrompt ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    let deltas = 0;
    const r = await opts.llm.streamChat({
      system: [
        buildCharacterSystem({ stage: 'followup', tone }),
        '同一卦补充解读，不重起卦、不改九步结论。只用纯文本，禁止 Markdown 符号。',
      ].join('\n'),
      messages: [{ role: 'user', content: user }],
      signal: opts.signal,
      onDelta: (t) => {
        deltas += 1;
        opts.emit?.({
          type: 'message_delta',
          caseId,
          data: { text: t, channel: 'followup' },
        });
      },
    });
    // §8.6：未流式时补发全文，防前端静默无回复
    if (deltas === 0 && r.text) {
      opts.emit?.({
        type: 'message_delta',
        caseId,
        data: { text: r.text, channel: 'followup' },
      });
    }
    return { text: r.text };
  } catch (e) {
    if (isKeyError(e)) throw e;
    const msg = e instanceof Error ? e.message : 'follow-up failed';
    throw new AppError('STEP_FAILED', `follow-up failed: ${msg}`);
  }
}

type CaseLike = { id: string; sessionId: string; input: { question: string } };

export type { RunResult };
