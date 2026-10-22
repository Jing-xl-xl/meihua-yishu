import type {
  Case,
  CaseInput,
  CaseStatus,
  CastMethod,
  CastResult,
  MemoryEntry,
  Message,
  Person,
  Session,
  SessionStatus,
  StepState,
  Verdict,
} from '@meihua/shared';
import { AppError, newId } from '@meihua/shared';

import type { Db } from './db';
import { nowIso } from './db';
import { computeStats, type Accuracy, type StatsResult } from './stats';

export class CaseExistsError extends AppError {
  constructor(sessionId: string) {
    super('CASE_EXISTS', `case already exists for session: ${sessionId}`);
    this.name = 'CaseExistsError';
  }
}

export class PersonNotFoundError extends AppError {
  constructor(id: string) {
    super('PERSON_NOT_FOUND', `person not found: ${id}`);
    this.name = 'PersonNotFoundError';
  }
}

export class SecretSettingError extends AppError {
  constructor(key: string) {
    super('SECRET_SETTING_REJECTED', `refusing to store secret-like setting: ${key}`);
    this.name = 'SecretSettingError';
  }
}

type PersonRow = {
  id: string;
  name: string;
  profile_card: string | null;
  settings_json: string | null;
  created_at: string;
};

type CaseRow = {
  id: string;
  session_id: string;
  person_id: string;
  question: string;
  numbers_json: string | null;
  time_local: string | null;
  direction: string | null;
  object_note: string | null;
  context_note: string | null;
  category: string | null;
  cast_method: string | null;
  method_reason: string | null;
  method_overridden: number;
  route_rounds: number;
  cast_json: string | null;
  verdict_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(s: string | null): T | undefined {
  if (s == null) return undefined;
  return JSON.parse(s) as T;
}

function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    profileCard: r.profile_card ?? undefined,
    roleCard: (r as { role_card?: string | null }).role_card ?? undefined,
  };
}

function caseFromRow(r: CaseRow): Case {
  return {
    id: r.id,
    sessionId: r.session_id,
    personId: r.person_id,
    input: {
      question: r.question,
      numbers: parseJson(r.numbers_json),
      timeLocal: r.time_local ?? undefined,
      direction: r.direction ?? undefined,
      objectNote: r.object_note ?? undefined,
      contextNote: r.context_note ?? undefined,
      category: r.category ?? undefined,
    },
    method: (r.cast_method as CastMethod) ?? undefined,
    methodReason: r.method_reason ?? undefined,
    methodOverridden: r.method_overridden === 1,
    routeRounds: r.route_rounds,
    cast: parseJson<CastResult>(r.cast_json),
    steps: [],
    status: r.status as CaseStatus,
    verdict: parseJson<Verdict>(r.verdict_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type FeedbackInput = {
  verdict?: Verdict;
  actual?: string;
  accuracy?: Accuracy;
  deviationNotes?: string;
  deviationSteps?: number[];
  feedbackAt?: string;
};

export type FeedbackRow = {
  case_id: string;
  verdict_json: string | null;
  actual: string | null;
  accuracy: string | null;
  deviation_notes: string | null;
  deviation_steps_json: string | null;
  feedback_at: string | null;
  created_at: string;
};

export function createStore(db: Db) {
  return {
    // ── persons ──────────────────────────
    createPerson(name: string): Person {
      const id = newId();
      const created_at = nowIso();
      db.prepare(
        'INSERT INTO persons (id, name, created_at) VALUES (?, ?, ?)',
      ).run(id, name, created_at);
      return { id, name, createdAt: created_at };
    },

    listPersons(): Person[] {
      const rows = db
        .prepare('SELECT * FROM persons ORDER BY created_at')
        .all() as PersonRow[];
      return rows.map(personFromRow);
    },

    /** W11：一次拿全案例数，避免 N+1 */
    listPersonsWithCaseCount(): Array<Person & { caseCount: number }> {
      const rows = db
        .prepare(
          `SELECT p.*, (SELECT COUNT(*) FROM cases c WHERE c.person_id = p.id) AS case_count
           FROM persons p ORDER BY p.created_at`,
        )
        .all() as Array<PersonRow & { case_count: number }>;
      return rows.map((r) => ({
        ...personFromRow(r),
        caseCount: Number(r.case_count ?? 0),
      }));
    },

    getPerson(id: string): Person | null {
      const r = db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as
        | PersonRow
        | undefined;
      return r ? personFromRow(r) : null;
    },

    renamePerson(id: string, name: string): void {
      db.prepare('UPDATE persons SET name = ? WHERE id = ?').run(name, id);
    },

    setPersonProfile(id: string, profileCard: string): void {
      db.prepare('UPDATE persons SET profile_card = ? WHERE id = ?').run(
        profileCard,
        id,
      );
    },

    setProfileCard(id: string, card: string): void {
      db.prepare('UPDATE persons SET profile_card = ? WHERE id = ?').run(card, id);
    },

    /** W12：先天角色（persons.role_card） */
    getRoleCard(id: string): string | null {
      const r = db.prepare('SELECT role_card FROM persons WHERE id = ?').get(id) as
        | { role_card: string | null }
        | undefined;
      return r?.role_card ?? null;
    },

    setRoleCard(id: string, text: string | null): void {
      db.prepare('UPDATE persons SET role_card = ? WHERE id = ?').run(text, id);
    },

    /** 硬删档案 + 级联 */
    deletePerson(id: string): void {
      const run = db.transaction(() => {
        db.prepare('DELETE FROM persons WHERE id = ?').run(id);
      });
      run();
    },

    // ── sessions ─────────────────────────
    createSession(personId: string, title?: string): Session {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO sessions (id, person_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, 'open', ?, ?)`,
      ).run(id, personId, title ?? null, ts, ts);
      return {
        id,
        personId,
        title,
        status: 'open',
        routeRounds: 0,
        createdAt: ts,
        updatedAt: ts,
      };
    },

    getSession(id: string): Session | null {
      const r = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
        | {
            id: string;
            person_id: string;
            title: string | null;
            status: string;
            route_rounds?: number | null;
            created_at: string;
            updated_at: string;
          }
        | undefined;
      if (!r) return null;
      return {
        id: r.id,
        personId: r.person_id,
        title: r.title ?? undefined,
        status: r.status as SessionStatus,
        routeRounds: r.route_rounds ?? 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    },

    /** W7：route 轮次 +1 并落库 */
    bumpSessionRouteRounds(sessionId: string): number {
      const cur = this.getSession(sessionId);
      if (!cur) throw new PersonNotFoundError(sessionId);
      const next = (cur.routeRounds ?? 0) + 1;
      db.prepare(
        'UPDATE sessions SET route_rounds = ?, updated_at = ? WHERE id = ?',
      ).run(next, nowIso(), sessionId);
      return next;
    },

    /** W7：起卦时同步最新问题/占类 */
    updateCaseQuestion(
      id: string,
      patch: { question?: string; category?: string },
    ): void {
      const cur = db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as
        | { question: string; category: string | null }
        | undefined;
      if (!cur) throw new Error(`case not found: ${id}`);
      db.prepare(
        'UPDATE cases SET question = ?, category = ?, updated_at = ? WHERE id = ?',
      ).run(
        patch.question ?? cur.question,
        patch.category ?? cur.category,
        nowIso(),
        id,
      );
    },

    listSessions(personId: string): Session[] {
      const rows = db
        .prepare(
          'SELECT * FROM sessions WHERE person_id = ? ORDER BY created_at',
        )
        .all(personId) as Array<{
        id: string;
        person_id: string;
        title: string | null;
        status: string;
        route_rounds?: number | null;
        created_at: string;
        updated_at: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        personId: r.person_id,
        title: r.title ?? undefined,
        status: r.status as SessionStatus,
        routeRounds: r.route_rounds ?? 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },

    updateSessionStatus(id: string, status: SessionStatus): void {
      db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(
        status,
        nowIso(),
        id,
      );
    },

    // ── cases ────────────────────────────
    createCase(sessionId: string, personId: string, input: CaseInput): Case {
      const exists = db
        .prepare('SELECT id FROM cases WHERE session_id = ?')
        .get(sessionId);
      if (exists) throw new CaseExistsError(sessionId);
      const id = newId();
      const ts = nowIso();
      const sess = this.getSession(sessionId);
      db.prepare(
        `INSERT INTO cases (
          id, session_id, person_id, question, numbers_json, time_local, direction,
          object_note, context_note, category, route_rounds, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      ).run(
        id,
        sessionId,
        personId,
        input.question,
        input.numbers ? JSON.stringify(input.numbers) : null,
        input.timeLocal ?? null,
        input.direction ?? null,
        input.objectNote ?? null,
        input.contextNote ?? null,
        input.category ?? null,
        sess?.routeRounds ?? 0,
        ts,
        ts,
      );
      return {
        id,
        sessionId,
        personId,
        input,
        steps: [],
        status: 'draft',
        createdAt: ts,
        updatedAt: ts,
      };
    },

    getCase(id: string): Case | null {
      const r = db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as
        | CaseRow
        | undefined;
      return r ? caseFromRow(r) : null;
    },

    listCases(personId: string): Case[] {
      const rows = db
        .prepare(
          'SELECT * FROM cases WHERE person_id = ? ORDER BY created_at',
        )
        .all(personId) as CaseRow[];
      return rows.map(caseFromRow);
    },

    updateCaseCast(
      id: string,
      patch: {
        method?: CastMethod;
        reason?: string;
        overridden?: boolean;
        cast?: CastResult;
        status?: CaseStatus;
      },
    ): void {
      const cur = db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as
        | CaseRow
        | undefined;
      if (!cur) throw new Error(`case not found: ${id}`);
      db.prepare(
        `UPDATE cases SET
          cast_method = ?, method_reason = ?, method_overridden = ?,
          cast_json = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        patch.method ?? cur.cast_method,
        patch.reason ?? cur.method_reason,
        patch.overridden === undefined ? cur.method_overridden : patch.overridden ? 1 : 0,
        patch.cast ? JSON.stringify(patch.cast) : cur.cast_json,
        patch.status ?? cur.status,
        nowIso(),
        id,
      );
    },

    /** G 生成占断书即写主存 */
    updateCaseVerdict(id: string, verdict: Verdict): void {
      db.prepare(
        'UPDATE cases SET verdict_json = ?, updated_at = ? WHERE id = ?',
      ).run(JSON.stringify(verdict), nowIso(), id);
    },

    saveSteps(caseId: string, steps: StepState[]): void {
      const upsert = db.prepare(
        `INSERT INTO steps (case_id, step_id, status, conclusion, evidence, sources_json, reasoning_note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(case_id, step_id) DO UPDATE SET
           status = excluded.status,
           conclusion = excluded.conclusion,
           evidence = excluded.evidence,
           sources_json = excluded.sources_json,
           reasoning_note = excluded.reasoning_note,
           updated_at = excluded.updated_at`,
      );
      const run = db.transaction(() => {
        for (const s of steps) {
          upsert.run(
            caseId,
            s.stepId,
            s.status,
            s.conclusion,
            s.evidence ?? null,
            JSON.stringify(s.sources),
            s.reasoningNote ?? null,
            s.updatedAt,
          );
        }
      });
      run();
    },

    getSteps(caseId: string): StepState[] {
      const rows = db
        .prepare('SELECT * FROM steps WHERE case_id = ? ORDER BY step_id')
        .all(caseId) as Array<{
        step_id: number;
        status: string;
        conclusion: string | null;
        evidence: string | null;
        sources_json: string | null;
        reasoning_note: string | null;
        updated_at: string;
      }>;
      return rows.map((r) => ({
        stepId: r.step_id as StepState['stepId'],
        status: r.status as StepState['status'],
        conclusion: r.conclusion ?? '',
        evidence: r.evidence ?? undefined,
        sources: parseJson(r.sources_json) ?? [],
        reasoningNote: r.reasoning_note ?? undefined,
        updatedAt: r.updated_at,
      }));
    },

    saveFeedback(caseId: string, fb: FeedbackInput): void {
      const cur = db.prepare('SELECT verdict_json FROM cases WHERE id = ?').get(caseId) as
        | { verdict_json: string | null }
        | undefined;
      const snapshot =
        fb.verdict != null
          ? JSON.stringify(fb.verdict)
          : (cur?.verdict_json ?? null);
      db.prepare(
        `INSERT INTO cases_feedback (
          case_id, verdict_json, actual, accuracy, deviation_notes,
          deviation_steps_json, feedback_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(case_id) DO UPDATE SET
          verdict_json = excluded.verdict_json,
          actual = excluded.actual,
          accuracy = excluded.accuracy,
          deviation_notes = excluded.deviation_notes,
          deviation_steps_json = excluded.deviation_steps_json,
          feedback_at = excluded.feedback_at`,
      ).run(
        caseId,
        snapshot,
        fb.actual ?? null,
        fb.accuracy ?? null,
        fb.deviationNotes ?? null,
        fb.deviationSteps ? JSON.stringify(fb.deviationSteps) : null,
        fb.feedbackAt ?? nowIso(),
        nowIso(),
      );
    },

    getFeedback(caseId: string): FeedbackRow | null {
      return (
        (db
          .prepare('SELECT * FROM cases_feedback WHERE case_id = ?')
          .get(caseId) as FeedbackRow | undefined) ?? null
      );
    },

    getCaseBundle(id: string): {
      case: Case;
      steps: StepState[];
      feedback: FeedbackRow | null;
    } | null {
      const c = this.getCase(id);
      if (!c) return null;
      return {
        case: c,
        steps: this.getSteps(id),
        feedback: this.getFeedback(id),
      };
    },

    getStats(personId: string): StatsResult {
      const rows = db
        .prepare(
          `SELECT f.accuracy, c.cast_method, c.category, f.deviation_steps_json
           FROM cases c
           LEFT JOIN cases_feedback f ON f.case_id = c.id
           WHERE c.person_id = ?`,
        )
        .all(personId) as Array<{
        accuracy: string | null;
        cast_method: string | null;
        category: string | null;
        deviation_steps_json: string | null;
      }>;
      return computeStats(
        rows.map((r) => ({
          accuracy: r.accuracy as Accuracy | null,
          cast_method: r.cast_method,
          category: r.category,
          deviation_steps: r.deviation_steps_json
            ? (JSON.parse(r.deviation_steps_json) as number[])
            : null,
        })),
      );
    },

    // ── messages ─────────────────────────
    appendMessage(m: Omit<Message, 'id' | 'createdAt'> & { id?: string }): Message {
      const id = m.id ?? newId();
      const created_at = nowIso();
      db.prepare(
        `INSERT INTO messages (id, session_id, case_id, role, step_id, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        m.sessionId,
        m.caseId ?? null,
        m.role,
        m.stepId ?? null,
        m.content,
        created_at,
      );
      return { ...m, id, createdAt: created_at };
    },

    listMessages(sessionId: string, caseId?: string): Message[] {
      const rows = (
        caseId
          ? db
              .prepare(
                'SELECT * FROM messages WHERE session_id = ? AND case_id = ? ORDER BY created_at',
              )
              .all(sessionId, caseId)
          : db
              .prepare(
                'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at',
              )
              .all(sessionId)
      ) as Array<{
        id: string;
        session_id: string;
        case_id: string | null;
        role: string;
        step_id: number | null;
        content: string;
        created_at: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        caseId: r.case_id ?? undefined,
        role: r.role as Message['role'],
        stepId: r.step_id ?? undefined,
        content: r.content,
        createdAt: r.created_at,
      }));
    },

    // ── memories ─────────────────────────
    insertMemory(m: MemoryEntry): void {
      db.prepare(
        `INSERT INTO memories (id, person_id, session_id, case_id, type, content_json, tags_json, rejected, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        m.id,
        m.personId,
        m.sessionId ?? null,
        m.caseId ?? null,
        m.type,
        JSON.stringify(m.payload),
        JSON.stringify(m.tags),
        m.rejected ? 1 : 0,
        m.createdAt,
      );
    },

    listMemories(personId: string): MemoryEntry[] {
      const rows = db
        .prepare(
          'SELECT * FROM memories WHERE person_id = ? ORDER BY created_at',
        )
        .all(personId) as Array<{
        id: string;
        person_id: string;
        session_id: string | null;
        case_id: string | null;
        type: string;
        content_json: string;
        tags_json: string | null;
        rejected: number;
        created_at: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        personId: r.person_id,
        sessionId: r.session_id ?? undefined,
        caseId: r.case_id ?? undefined,
        type: r.type as MemoryEntry['type'],
        payload: parseJson(r.content_json)!,
        tags: parseJson(r.tags_json) ?? [],
        rejected: r.rejected === 1,
        createdAt: r.created_at,
      }));
    },

    getMemory(id: string): { id: string; rejected: number } | null {
      return (
        (db
          .prepare('SELECT id, rejected FROM memories WHERE id = ?')
          .get(id) as { id: string; rejected: number } | undefined) ?? null
      );
    },

    setMemoryRejected(id: string, rejected: boolean): void {
      db.prepare('UPDATE memories SET rejected = ? WHERE id = ?').run(
        rejected ? 1 : 0,
        id,
      );
    },

    deleteMemory(id: string): void {
      db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    },

    updateProfileCard(id: string, card: string): void {
      db.prepare('UPDATE persons SET profile_card = ? WHERE id = ?').run(card, id);
    },

    // ── settings（仅展示/配置，不存密钥）──
    setSetting(key: string, value: string): void {
      if (/key|secret|token/i.test(key)) {
        throw new SecretSettingError(key);
      }
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(key, value);
    },

    getSetting(key: string): string | null {
      const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      return r?.value ?? null;
    },
  };
}

export type Store = ReturnType<typeof createStore>;
