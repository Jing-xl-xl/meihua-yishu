import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AppError,
  newId,
  type CastResult,
  type SSEEvent,
} from '@meihua/shared';

import { sendAppError } from './errors';
import {
  describePresets,
  resolveLlmConfig,
  saveLocalLlmConfig,
} from '../config/llmConfig';
import { createProvider } from '../llm/router';

function isAllowedBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' ||
      (u.protocol === 'http:' &&
        (u.hostname === '127.0.0.1' || u.hostname === 'localhost'))
    );
  } catch {
    return false;
  }
}
import { writeAnchor, writePreference, writeResult, writeRound } from '../memory/write';
import { updateProfileCard } from '../memory/profile';
import {
  buildPersonMemoryPrompt,
  DEFAULT_ROLE_CARD,
  validateRoleCard,
} from '../memory/inject';
import { buildExportBundle } from '../export/serialize';
import {
  parseDirectionNote,
  recommendMethod,
} from '../route/recommend';
import type { AppDeps } from './types';

function parseOr400<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError('INVALID_REQUEST', r.error.message);
  }
  return r.data;
}

export function createApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _req, reply) => {
    sendAppError(reply, err);
  });

  // ── persons ─────────────────────────────
  app.get('/api/persons', async () => {
    return { persons: deps.store.listPersonsWithCaseCount() };
  });

  app.post('/api/persons', async (req) => {
    const body = parseOr400(z.object({ name: z.string().min(1) }), req.body);
    return { person: deps.store.createPerson(body.name) };
  });

  app.patch('/api/persons/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = parseOr400(z.object({ name: z.string().min(1) }), req.body);
    if (!deps.store.getPerson(id)) {
      throw new AppError('PERSON_NOT_FOUND', id);
    }
    deps.store.renamePerson(id, body.name);
    return { ok: true };
  });

  app.delete('/api/persons/:id', async (req) => {
    const { id } = req.params as { id: string };
    deps.store.deletePerson(id);
    return { ok: true };
  });

  // ── sessions ────────────────────────────
  app.get('/api/sessions', async (req) => {
    const q = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.query,
    );
    return { sessions: deps.store.listSessions(q.personId) };
  });

  app.post('/api/sessions', async (req) => {
    const body = parseOr400(
      z.object({ personId: z.string().min(1), title: z.string().optional() }),
      req.body,
    );
    return { session: deps.store.createSession(body.personId, body.title) };
  });

  app.get('/api/sessions/:id', async (req) => {
    const { id } = req.params as { id: string };
    const s = deps.store.getSession(id);
    if (!s) throw new AppError('PERSON_NOT_FOUND', 'session not found');
    return {
      session: s,
      messages: deps.store.listMessages(id),
      cases: deps.store.listCases(s.personId).filter((c) => c.sessionId === id),
    };
  });

  // ── cases ───────────────────────────────
  app.get('/api/cases', async (req) => {
    const q = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.query,
    );
    const cases = deps.store.listCases(q.personId).map((c) => {
      const fb = deps.store.getFeedback(c.id);
      return {
        ...c,
        accuracy: fb?.accuracy ?? undefined,
        feedbackAt: fb?.feedback_at ?? undefined,
        actual: fb?.actual ?? undefined,
      };
    });
    return { cases };
  });

  app.get('/api/cases/stats', async (req) => {
    const q = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.query,
    );
    return deps.store.getStats(q.personId);
  });

  app.post('/api/sessions/:id/cases', async (req) => {
    const { id: sessionId } = req.params as { id: string };
    const body = parseOr400(
      z.object({
        personId: z.string().min(1),
        question: z.string().min(1),
        numbers: z.array(z.number()).optional(),
        timeLocal: z.string().optional(),
        direction: z.string().optional(),
        objectNote: z.string().optional(),
        contextNote: z.string().optional(),
        category: z.string().optional(),
      }),
      req.body,
    );
    const c = deps.store.createCase(sessionId, body.personId, body);
    // W7：建案时快照 session 轮次
    const sess = deps.store.getSession(sessionId);
    if (sess?.routeRounds != null && c.id) {
      try {
        deps.store.updateCaseQuestion(c.id, {
          question: body.question,
          category: body.category,
        });
      } catch {
        /* optional */
      }
    }
    return { case: c };
  });

  app.get('/api/cases/:id', async (req) => {
    const { id } = req.params as { id: string };
    const bundle = deps.store.getCaseBundle(id);
    if (!bundle) throw new AppError('INVALID_REQUEST', 'case not found');
    return bundle;
  });

  // ── cast ────────────────────────────────
  app.post('/api/cases/:id/cast', async (req) => {
    const { id } = req.params as { id: string };
    const bundle = deps.store.getCaseBundle(id);
    if (!bundle) throw new AppError('INVALID_REQUEST', 'case not found');
    const body = parseOr400(
      z.object({
        method: z
          .enum([
            'number1',
            'number2',
            'number3',
            'datetime',
            'objectCount',
            'sound',
            'text',
            'measureZhangChi',
            'measureChiCun',
            'direction',
          ])
          .optional(),
        hourZhi: z.number().int().min(1).max(12).optional(),
        numbers: z.array(z.number()).optional(),
        count: z.number().optional(),
        text: z.string().optional(),
        zhang: z.number().optional(),
        chi: z.number().optional(),
        cun: z.number().optional(),
        timeLocal: z.string().optional(),
        question: z.string().optional(),
        category: z.string().optional(),
        school: z
          .object({ movingYao: z.enum(['mod', 'sum']), addHour: z.boolean() })
          .optional(),
        overrides: z
          .object({
            method: z.string().optional(),
            objectGua: z.string().optional(),
            directionGua: z.string().optional(),
            numbers: z.array(z.number()).optional(),
            timeLocal: z.string().optional(),
          })
          .optional(),
      }),
      req.body ?? {},
    );

    // W7 L-1/L-14：起卦瞬间同步最新问题/占类
    if (body.question || body.category) {
      deps.store.updateCaseQuestion(id, {
        question: body.question,
        category: body.category,
      });
    }

    const input = bundle.case.input;
    const numbers = body.numbers ?? body.overrides?.numbers ?? input.numbers;
    const timeLocal = body.timeLocal ?? body.overrides?.timeLocal ?? input.timeLocal;
    const method = (body.method ??
      body.overrides?.method ??
      (numbers?.length === 3
        ? 'number3'
        : numbers?.length === 2
          ? 'number2'
          : numbers?.length === 1
            ? 'number1'
            : timeLocal
              ? 'datetime'
              : 'datetime')) as
      | 'number1'
      | 'number2'
      | 'number3'
      | 'datetime'
      | 'objectCount'
      | 'sound'
      | 'text'
      | 'measureZhangChi'
      | 'measureChiCun'
      | 'direction';

    const needHour = method !== 'measureZhangChi' && method !== 'text';
    if (needHour && body.hourZhi == null) {
      throw new AppError('CAST_INVALID_INPUT', 'hourZhi required');
    }

    try {
      let cast: CastResult;
      if (method === 'number1' || method === 'number2' || method === 'number3') {
        if (!numbers || numbers.length === 0) {
          throw new AppError('CAST_INVALID_INPUT', 'numbers required');
        }
        cast = deps.castByNumbers({
          numbers,
          method,
          hourZhi: body.hourZhi ?? 1,
          school: body.school,
        });
      } else if (method === 'datetime') {
        if (!timeLocal) {
          throw new AppError('CAST_INVALID_INPUT', 'timeLocal required');
        }
        let lunar: never;
        try {
          lunar = deps.toLunarMoment(timeLocal) as never;
        } catch {
          throw new AppError('CAST_INVALID_INPUT', 'invalid timeLocal');
        }
        cast = deps.castByDateTime(lunar);
      } else if (method === 'objectCount' || method === 'sound') {
        const count = body.count;
        if (count == null || !(count > 0)) {
          throw new AppError('CAST_INVALID_INPUT', 'count required');
        }
        cast = deps.castByCount(method, {
          count,
          hourZhi: body.hourZhi ?? 1,
        });
      } else if (method === 'text') {
        const text = body.text ?? '';
        if (!text.trim()) {
          throw new AppError('CAST_INVALID_INPUT', 'text required');
        }
        cast = deps.castByText({ text, hourZhi: body.hourZhi });
      } else if (method === 'measureZhangChi') {
        cast = deps.castByMeasureZhangChi({
          zhang: body.zhang ?? 0,
          chi: body.chi ?? 0,
        });
      } else if (method === 'measureChiCun') {
        cast = deps.castByMeasureChiCun({
          chi: body.chi ?? 0,
          cun: body.cun ?? 0,
          hourZhi: body.hourZhi ?? 1,
        });
      } else if (method === 'direction') {
        const og = body.overrides?.objectGua as never;
        const dg = body.overrides?.directionGua as never;
        if (!og || !dg) {
          throw new AppError('CAST_INVALID_INPUT', 'objectGua/directionGua required');
        }
        cast = deps.castByDirection({
          objectGua: og,
          directionGua: dg,
          hourZhi: body.hourZhi ?? 1,
        });
      } else {
        throw new AppError('CAST_INVALID_INPUT', `unsupported method: ${method}`);
      }

      deps.store.updateCaseCast(id, {
        method,
        cast,
        status: 'casted',
      });
      return { cast };
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof RangeError || e instanceof TypeError) {
        throw new AppError('CAST_INVALID_INPUT', e.message);
      }
      throw e;
    }
  });

  // ── SSE helpers ─────────────────────────
  async function runSse(
    req: { raw: { on: (ev: string, cb: () => void) => void } },
    res: { raw: { writeHead: (n: number, h: Record<string, string>) => void; write: (s: string) => void; end: () => void } },
    fn: (emit: (e: SSEEvent) => void, signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    res.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.raw.write(': ping\n\n');
    const ac = new AbortController();
    req.raw.on('close', () => ac.abort());
    const timer = setInterval(() => {
      res.raw.write(': ping\n\n');
    }, 15_000);
    const emit = (e: SSEEvent) => {
      res.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };
    try {
      await fn(emit, ac.signal);
    } catch (e) {
      const code = e instanceof AppError ? e.code : 'INTERNAL';
      const message = e instanceof Error ? e.message : 'error';
      res.raw.write(
        `event: error\ndata: ${JSON.stringify({ code, message })}\n\n`,
      );
    } finally {
      clearInterval(timer);
      res.raw.end();
    }
  }

  function requireCast(id: string) {
    const bundle = deps.store.getCaseBundle(id);
    if (!bundle) throw new AppError('INVALID_REQUEST', 'case not found');
    if (!bundle.case.cast) {
      throw new AppError('CAST_INVALID_INPUT', 'cast required before interpret');
    }
    return bundle;
  }

  function emitFromStore(
    emit: (e: SSEEvent) => void,
  ): (e: SSEEvent) => void {
    return emit;
  }

  // ── interpret / resume / revise ─────────
  app.post('/api/cases/:id/interpret', async (req, res) => {
    const { id } = req.params as { id: string };
    const bundle = requireCast(id);
    const body = parseOr400(
      z.object({ fromStep: z.number().int().min(1).max(9).optional() }),
      req.body ?? {},
    );
    await runSse(req as never, res as never, async (emit) => {
      const memoryPrompt = buildPersonMemoryPrompt(
        deps.store,
        bundle.case.personId,
        {
          question: bundle.case.input.question,
          category: bundle.case.input.category,
          guaName: bundle.case.cast?.ben?.name,
        },
      );
      const result = await deps.interpret.run({
        case: bundle.case,
        cast: bundle.case.cast,
        store: deps.store,
        knowledge: deps.knowledge,
        llm: deps.llm,
        offline: deps.config.offline,
        emit: emitFromStore(emit),
        fromStep: body.fromStep,
        memoryPrompt,
      });
      if (result.done && result.verdict) {
        const m = writeRound(deps.store, {
          personId: bundle.case.personId,
          sessionId: bundle.case.sessionId,
          caseId: id,
          topic: bundle.case.input.question,
          castBrief: bundle.case.cast
            ? `${bundle.case.cast.ben.name}之${bundle.case.cast.bian.name}，动${bundle.case.cast.movingYao}`
            : '',
          conclusionBrief: result.verdict.summary.slice(0, 80),
        });
        emit({
          type: 'memory_written',
          caseId: id,
          data: { memoryIds: [m.id] },
        });
      }
    });
  });

  app.post('/api/cases/:id/resume', async (req, res) => {
    const { id } = req.params as { id: string };
    const bundle = requireCast(id);
    const body = parseOr400(
      z.object({
        answers: z.array(
          z.object({
            stepId: z.number().int().min(1).max(9).optional(),
            text: z.string(),
            remember: z.boolean().optional(),
          }),
        ),
      }),
      req.body ?? {},
    );
    await runSse(req as never, res as never, async (emit) => {
      const memoryPrompt = buildPersonMemoryPrompt(
        deps.store,
        bundle.case.personId,
        {
          question: bundle.case.input.question,
          category: bundle.case.input.category,
          guaName: bundle.case.cast?.ben?.name,
        },
      );
      await deps.interpret.resume({
        case: bundle.case,
        cast: bundle.case.cast,
        store: deps.store,
        knowledge: deps.knowledge,
        llm: deps.llm,
        offline: deps.config.offline,
        emit: emitFromStore(emit),
        answers: body.answers,
        memoryPrompt,
      });
    });
  });

  app.post('/api/cases/:id/revise', async (req, res) => {
    const { id } = req.params as { id: string };
    const bundle = requireCast(id);
    const body = parseOr400(
      z.object({
        stepId: z.number().int().min(1).max(9),
        message: z.string().min(1),
      }),
      req.body,
    );
    await runSse(req as never, res as never, async (emit) => {
      const memoryPrompt = buildPersonMemoryPrompt(
        deps.store,
        bundle.case.personId,
        {
          question: bundle.case.input.question,
          category: bundle.case.input.category,
          guaName: bundle.case.cast?.ben?.name,
        },
      );
      await deps.interpret.revise({
        case: bundle.case,
        cast: bundle.case.cast,
        store: deps.store,
        knowledge: deps.knowledge,
        llm: deps.llm,
        offline: deps.config.offline,
        emit: emitFromStore(emit),
        stepId: body.stepId as never,
        message: body.message,
        memoryPrompt,
      });
    });
  });

  app.post('/api/cases/:id/followup', async (req) => {
    const { id } = req.params as { id: string };
    const bundle = requireCast(id);
    const body = parseOr400(
      z.object({ question: z.string().min(1) }),
      req.body,
    );
    if (deps.config.offline) {
      throw new AppError('NO_API_KEY', 'follow-up requires api key');
    }
    const memoryPrompt = buildPersonMemoryPrompt(deps.store, bundle.case.personId, {
      question: bundle.case.input.question,
      category: bundle.case.input.category,
      guaName: bundle.case.cast?.ben?.name,
    });
    const r = await deps.interpret.followUp({
      case: bundle.case,
      cast: bundle.case.cast,
      steps: bundle.steps,
      question: body.question,
      knowledge: deps.knowledge,
      llm: deps.llm,
      memoryPrompt,
    });
    deps.store.appendMessage({
      sessionId: bundle.case.sessionId,
      caseId: id,
      role: 'user',
      content: body.question,
    });
    deps.store.appendMessage({
      sessionId: bundle.case.sessionId,
      caseId: id,
      role: 'assistant',
      content: r.text,
    });
    return r;
  });

  app.post('/api/cases/:id/feedback', async (req) => {
    const { id } = req.params as { id: string };
    const existing = deps.store.getCaseBundle(id);
    if (!existing) {
      throw new AppError('INVALID_REQUEST', 'case not found');
    }
    const body = parseOr400(
      z.object({
        actual: z.string().optional(),
        accuracy: z.enum(['yes', 'partial', 'no']).optional(),
        deviationNotes: z.string().optional(),
        deviationSteps: z.array(z.number()).optional(),
        verdict: z.unknown().optional(),
      }),
      req.body ?? {},
    );
    deps.store.saveFeedback(id, body as never);
    const fbBundle = deps.store.getCaseBundle(id);
    if (body.accuracy && fbBundle) {
      writeResult(deps.store, {
        personId: fbBundle.case.personId,
        sessionId: fbBundle.case.sessionId,
        caseId: id,
        actual: body.actual ?? '',
        accuracy: body.accuracy,
        deviationSteps: (body.deviationSteps as never) ?? [],
      });
      updateProfileCard(deps.store, fbBundle.case.personId);
    }
    return { ok: true };
  });

  // ── route（W7 session 级；推荐不建 case）──
  app.post('/api/sessions/:id/route', async (req) => {
    const { id: sessionId } = req.params as { id: string };
    const session = deps.store.getSession(sessionId);
    if (!session) throw new AppError('PERSON_NOT_FOUND', 'session not found');
    const body = parseOr400(
      z.object({
        question: z.string().min(1),
        contextNote: z.string().optional(),
        directionNote: z.string().optional(),
        answer: z.string().optional(),
        currentMethod: z.string().optional(),
        mode: z.enum(['method', 'parseDirection']).optional(),
        numbers: z.array(z.number()).optional(),
        timeLocal: z.string().optional(),
        text: z.string().optional(),
        count: z.number().optional(),
      }),
      req.body ?? {},
    );
    const mode = body.mode ?? 'method';
    const offline = deps.config.offline;

    if (mode === 'parseDirection') {
      const note = body.directionNote ?? body.question;
      const r = await parseDirectionNote({
        llm: offline ? undefined : deps.llm,
        offline,
        directionNote: note,
      });
      return { mode: 'parseDirection', ...r };
    }

    const rounds = deps.store.bumpSessionRouteRounds(sessionId);
    const r = await recommendMethod({
      llm: offline ? undefined : deps.llm,
      offline,
      routeRounds: rounds,
      question: body.question,
      contextNote: body.contextNote,
      directionNote: body.directionNote,
      answer: body.answer,
      currentMethod: body.currentMethod,
      numbers: body.numbers,
      timeLocal: body.timeLocal,
      text: body.text,
      count: body.count,
    });
    return { mode: 'method', ...r, routeRounds: rounds };
  });

  // ── route（旧路径，兼容；新 UI 用 session 级）──
  app.post('/api/cases/:id/route', async (req) => {
    const { id } = req.params as { id: string };
    const bundle = deps.store.getCaseBundle(id);
    if (!bundle) throw new AppError('INVALID_REQUEST', 'case not found');
    const body = parseOr400(
      z.object({
        method: z.string().optional(),
        answer: z.string().optional(),
      }),
      req.body ?? {},
    );
    const rounds = (bundle.case.routeRounds ?? 0) + 1;
    const numbers = bundle.case.input.numbers;
    let method = body.method;
    if (!method) {
      if (numbers?.length === 3) method = 'number3';
      else if (numbers?.length === 2) method = 'number2';
      else if (numbers?.length === 1) method = 'number1';
      else if (bundle.case.input.direction) method = 'direction';
      else method = 'datetime';
    }
    if (rounds > 2 && !body.method) {
      method = method ?? 'datetime';
    }
    return {
      method,
      reason: deps.config.offline
        ? '无 Key：按输入字段推断'
        : '按输入字段推断',
      confidence: 'mid',
      routeRounds: rounds,
      missing: [],
    };
  });

  // ── memory（M3：无 POST） ─────────────────
  app.get('/api/memory/role', async (req) => {
    const q = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.query,
    );
    const text = deps.store.getRoleCard(q.personId) ?? DEFAULT_ROLE_CARD;
    return { text, isDefault: !deps.store.getRoleCard(q.personId) };
  });

  app.put('/api/memory/role', async (req) => {
    const body = parseOr400(
      z.object({
        personId: z.string().min(1),
        text: z.string().max(2000),
      }),
      req.body ?? {},
    );
    const err = validateRoleCard(body.text);
    if (err) throw new AppError('INVALID_REQUEST', err);
    deps.store.setRoleCard(body.personId, body.text);
    return { ok: true };
  });

  app.post('/api/memory/role/reset', async (req) => {
    const body = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.body ?? {},
    );
    deps.store.setRoleCard(body.personId, null);
    return { ok: true, text: DEFAULT_ROLE_CARD };
  });

  app.post('/api/memory/anchor', async (req) => {
    const body = parseOr400(
      z.object({
        personId: z.string().min(1),
        text: z.string().min(1).max(80),
        caseId: z.string().optional(),
        source: z.enum(['manual', 'llm', 'feedback']).optional(),
      }),
      req.body ?? {},
    );
    const entry = writeAnchor(deps.store, {
      personId: body.personId,
      text: body.text,
      caseId: body.caseId,
      source: body.source ?? 'manual',
    });
    return { memory: entry };
  });

  app.get('/api/memory', async (req) => {
    const q = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.query,
    );
    return { memories: deps.store.listMemories(q.personId) };
  });

  app.post('/api/memory', async (req) => {
    const body = parseOr400(
      z.object({
        personId: z.string().min(1),
        text: z.string().min(1),
        type: z.enum(['preference', 'anchor']).optional(),
        caseId: z.string().optional(),
      }),
      req.body,
    );
    if (body.type === 'anchor') {
      return {
        memory: writeAnchor(deps.store, {
          personId: body.personId,
          text: body.text,
          caseId: body.caseId,
          source: 'manual',
        }),
      };
    }
    return { memory: writePreference(deps.store, body.personId, body.text) };
  });

  app.delete('/api/memory/:id', async (req) => {
    const { id } = req.params as { id: string };
    deps.store.deleteMemory(id);
    return { ok: true };
  });

  app.post('/api/memory/compact', async (req) => {
    const body = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.body,
    );
    const { compactMemories } = await import('../memory/compact');
    const r = compactMemories(deps.store, body.personId);
    return r;
  });

  app.post('/api/memory/:id/reject', async (req) => {
    const { id } = req.params as { id: string };
    const current = deps.store.getMemory(id);
    const next = !current?.rejected;
    deps.store.setMemoryRejected(id, next);
    return { ok: true, rejected: next };
  });

  // ── knowledge ───────────────────────────
  app.get('/api/knowledge/meta', async () => {
    return deps.knowledge.meta();
  });

  app.get('/api/knowledge/hexagram', async (req) => {
    const q = parseOr400(
      z.object({ id: z.union([z.string(), z.number()]) }),
      req.query,
    );
    return deps.knowledge.hexagram(q.id);
  });

  // ── export ──────────────────────────────
  app.post('/api/export', async (req, reply) => {
    const body = parseOr400(
      z.object({ personId: z.string().min(1) }),
      req.body,
    );
    const person = deps.store.getPerson(body.personId);
    if (!person) throw new AppError('PERSON_NOT_FOUND', body.personId);
    const bundle = buildExportBundle(deps.store, body.personId);
    reply.header(
      'content-disposition',
      `attachment; filename="export-${body.personId}.json"`,
    );
    return bundle;
  });

  // ── settings（Key 只在 config.local，不回显） ──
  function loadRuntime() {
    return resolveLlmConfig(
      process.env,
      deps.config.dataDir ?? './data-dev',
    );
  }

  app.get('/api/settings', async () => {
    const llm = loadRuntime();
    return {
      hasKey: !llm.offline,
      provider: llm.provider,
      baseUrl: llm.baseUrl,
      model: llm.model,
      school: deps.store.getSetting('school.movingYao') ?? 'mod',
      kbVersion: deps.knowledge.meta().version,
      presets: describePresets(),
      // W10 S-19
      lastTestAt: deps.store.getSetting('llm.lastTestAt') ?? null,
      lastTestOk: deps.store.getSetting('llm.lastTestOk') ?? null,
      lastTestMsg: deps.store.getSetting('llm.lastTestMsg') ?? null,
      llmSource: process.env.LLM_API_KEY ? 'env' : llm.apiKey ? 'file' : 'none',
    };
  });

  app.put('/api/settings', async (req) => {
    const body = parseOr400(z.record(z.string(), z.string()), req.body);
    for (const [k, v] of Object.entries(body)) {
      if (/key|secret|token/i.test(k)) {
        throw new AppError('SECRET_SETTING_REJECTED', k);
      }
      if (k.startsWith('llm.')) {
        throw new AppError('INVALID_REQUEST', 'use /api/settings/llm');
      }
      deps.store.setSetting(k, v);
    }
    return { ok: true };
  });

  app.put('/api/settings/llm', async (req) => {
    const body = parseOr400(
      z.object({
        provider: z
          .enum(['deepseek', 'kimi', 'custom', 'openai-compat', 'mock', 'anthropic'])
          .optional(),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
        apiKey: z.string().nullable().optional(),
        clearApiKey: z.boolean().optional(),
      }),
      req.body ?? {},
    );
    const baseUrl = body.baseUrl ?? '';
    if (body.provider === 'custom' && !baseUrl) {
      throw new AppError('INVALID_REQUEST', 'custom requires baseUrl');
    }
    if (baseUrl && !isAllowedBaseUrl(baseUrl)) {
      throw new AppError('INVALID_REQUEST', 'baseUrl must be https or localhost');
    }
    saveLocalLlmConfig(deps.config.dataDir ?? './data-dev', {
      provider: body.provider,
      baseUrl: body.baseUrl,
      model: body.model,
      // 空串/缺省 = 不覆盖已存 Key
      apiKey: body.apiKey === '' || body.apiKey == null ? undefined : body.apiKey,
      clearApiKey: body.clearApiKey === true,
    });
    deps.reloadLlm?.();
    return { ok: true, hasKey: !loadRuntime().offline };
  });

  app.post('/api/settings/test', async (req) => {
    const body = parseOr400(
      z.object({
        provider: z.string().optional(),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
        apiKey: z.string().optional(),
      }),
      req.body ?? {},
    );
    const base = loadRuntime();
    const cfg = {
      provider: body.provider ?? base.provider,
      baseUrl: body.baseUrl ?? base.baseUrl,
      // 空串/缺省 = 不覆盖已存 Key（B-04）
      apiKey: (body.apiKey && body.apiKey.trim()) || base.apiKey,
      model: body.model ?? base.model,
    };
    if (!cfg.apiKey) throw new AppError('NO_API_KEY', 'missing key');
    if (cfg.baseUrl && !isAllowedBaseUrl(cfg.baseUrl)) {
      throw new AppError('INVALID_REQUEST', 'baseUrl must be https or localhost');
    }
    const llm = deps.llmFactory
      ? deps.llmFactory({ ...cfg, timeoutMs: 10_000 })
      : createProvider({
          provider: (
            cfg.provider === 'anthropic' || cfg.provider === 'mock'
              ? cfg.provider
              : 'openai-compat'
          ) as 'openai-compat' | 'mock' | 'anthropic',
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model,
          timeoutMs: 10_000,
        });
    try {
      const r = await llm.streamChat({
        system: 'ping',
        messages: [{ role: 'user', content: 'ping' }],
        timeoutMs: 10_000,
      });
      // W10 S-19：测连结果持久化
      deps.store.setSetting('llm.lastTestAt', new Date().toISOString());
      deps.store.setSetting('llm.lastTestOk', '1');
      deps.store.setSetting('llm.lastTestMsg', '');
      return { ok: true, model: cfg.model, text: String(r.text).slice(0, 40) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      deps.store.setSetting('llm.lastTestAt', new Date().toISOString());
      deps.store.setSetting('llm.lastTestOk', '0');
      deps.store.setSetting('llm.lastTestMsg', msg.slice(0, 120));
      throw e;
    }
  });

  return app;
}

export { newId };
