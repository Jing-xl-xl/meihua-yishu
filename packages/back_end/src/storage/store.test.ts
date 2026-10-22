import { describe, expect, it } from 'vitest';

import { migrate, openDb } from './db';
import { CaseLocks, CaseInFlightError } from './locks';
import { CaseExistsError, createStore, SecretSettingError } from './store';
import { computeStats } from './stats';

function setup() {
  const db = openDb(':memory:');
  return { db, store: createStore(db) };
}

describe('migrations', () => {
  it('idempotent open twice', () => {
    const db = openDb(':memory:');
    expect(() => migrate(db)).not.toThrow();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of [
      'persons',
      'sessions',
      'cases',
      'steps',
      'messages',
      'cases_feedback',
      'memories',
      'settings',
      'schema_migrations',
    ]) {
      expect(tables).toContain(t);
    }
  });
});

describe('CRUD + 一会话一案例', () => {
  it('person/session/case/steps/feedback roundtrip', () => {
    const { store } = setup();
    const p = store.createPerson('我');
    const s = store.createSession(p.id, '面试');
    const c = store.createCase(s.id, p.id, {
      question: '明天面试是否顺利',
      numbers: [31, 25, 9],
    });
    store.updateCaseCast(c.id, {
      method: 'number3',
      reason: '报数',
      overridden: true,
      cast: {
        method: 'number3',
        school: { movingYao: 'mod', addHour: false },
        formula: [{ label: '上卦', expr: '31÷8' }],
        ben: {
          lines: [7, 7, 7, 8, 8, 7],
          upper: 'gen',
          lower: 'qian',
          name: '山天大畜',
          kingwen: 26,
        },
        hu: { upper: 'zhen', lower: 'dui', name: '雷泽归妹' },
        bian: {
          lines: [7, 7, 8, 8, 8, 7],
          upper: 'gen',
          lower: 'dui',
          name: '山泽损',
          kingwen: 41,
        },
        movingYao: 3,
        ti: 'qian',
        yong: 'gen',
        tiYongNote: '动爻在下，下卦为体，上卦为用',
      },
      status: 'casted',
    });
    store.saveSteps(c.id, [
      {
        stepId: 1,
        status: 'confirmed',
        conclusion: '大畜之损',
        sources: [{ id: 't', title: 'T' }],
        updatedAt: new Date().toISOString(),
      },
    ]);
    store.updateCaseVerdict(c.id, {
      grade: 'good',
      summary: '尚可',
      points: [],
      advice: ['准备充分'],
      timing: '快',
      risks: [],
      basedOnSteps: [1],
    });
    store.saveFeedback(c.id, { actual: '顺利', accuracy: 'yes' });

    const bundle = store.getCaseBundle(c.id);
    expect(bundle).not.toBeNull();
    expect(bundle!.case.input.question).toBe('明天面试是否顺利');
    expect(bundle!.case.cast?.ben.name).toBe('山天大畜');
    expect(bundle!.case.methodOverridden).toBe(true);
    expect(bundle!.steps).toHaveLength(1);
    expect(bundle!.feedback?.accuracy).toBe('yes');
    // verdict 主存可读（含未依赖 feedback）
    expect(bundle!.case.verdict?.summary).toBe('尚可');
  });

  it('CASE_EXISTS on second case in same session', () => {
    const { store } = setup();
    const p = store.createPerson('a');
    const s = store.createSession(p.id);
    store.createCase(s.id, p.id, { question: 'q1' });
    expect(() => store.createCase(s.id, p.id, { question: 'q2' })).toThrow(
      CaseExistsError,
    );
  });

  it('updateCaseCast + getCaseBundle', () => {
    const { store } = setup();
    const p = store.createPerson('a');
    const s = store.createSession(p.id);
    const c = store.createCase(s.id, p.id, { question: 'q' });
    store.updateCaseCast(c.id, { method: 'datetime', status: 'casted' });
    const b = store.getCaseBundle(c.id);
    expect(b!.case.method).toBe('datetime');
    expect(b!.case.status).toBe('casted');
    expect(b!.feedback).toBeNull();
  });
});

describe('deletePerson 硬删级联', () => {
  it('no residue', () => {
    const { db, store } = setup();
    const p = store.createPerson('x');
    const s = store.createSession(p.id);
    const c = store.createCase(s.id, p.id, { question: 'q' });
    store.appendMessage({
      sessionId: s.id,
      caseId: c.id,
      role: 'user',
      content: 'hi',
    });
    store.saveSteps(c.id, [
      {
        stepId: 1,
        status: 'pending',
        conclusion: '',
        sources: [],
        updatedAt: new Date().toISOString(),
      },
    ]);
    store.saveFeedback(c.id, { accuracy: 'no' });
    store.insertMemory({
      id: 'm1',
      personId: p.id,
      sessionId: s.id,
      caseId: c.id,
      type: 'round',
      payload: { text: 't' },
      tags: [],
      createdAt: new Date().toISOString(),
    });

    store.deletePerson(p.id);

    const count = (sql: string) =>
      (db.prepare(sql).get() as { n: number }).n;
    expect(count('SELECT COUNT(*) n FROM persons')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM sessions')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM cases')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM steps')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM messages')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM cases_feedback')).toBe(0);
    expect(count('SELECT COUNT(*) n FROM memories')).toBe(0);
  });
});

describe('locks', () => {
  it('CASE_IN_FLIGHT', () => {
    const locks = new CaseLocks();
    locks.acquire('c1');
    expect(locks.isBusy('c1')).toBe(true);
    expect(() => locks.acquire('c1')).toThrow(CaseInFlightError);
    locks.release('c1');
    expect(() => locks.acquire('c1')).not.toThrow();
  });
});

describe('getStats', () => {
  it('partial=0.5 and filled=0', () => {
    const rows = [
      { accuracy: 'yes' as const, cast_method: 'number3' },
      { accuracy: 'yes' as const, cast_method: 'number3' },
      { accuracy: 'yes' as const, cast_method: 'datetime' },
      { accuracy: 'partial' as const, cast_method: 'number3' },
      { accuracy: 'partial' as const, cast_method: 'direction' },
      { accuracy: 'no' as const, cast_method: 'number3' },
    ];
    const s = computeStats(rows);
    expect(s.filled).toBe(6);
    expect(s.composite).toBeCloseTo((3 + 1) / 6);
    expect(computeStats([]).composite).toBeNull();
  });
});

describe('settings', () => {
  it('rejects secret-like keys', () => {
    const { store } = setup();
    expect(() => store.setSetting('LLM_API_KEY', 'x')).toThrow(
      SecretSettingError,
    );
    store.setSetting('school.movingYao', 'mod');
    expect(store.getSetting('school.movingYao')).toBe('mod');
  });
});
