import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  castByCount,
  castByDateTime,
  castByDirection,
  castByMeasureChiCun,
  castByMeasureZhangChi,
  castByNumbers,
  castByText,
  toLunarMoment,
} from '../casting';
import { loadKnowledge, makeQuery } from '../knowledge/query';
import { MockProvider } from '../llm/mock';
import { CaseLocks } from '../storage/locks';
import { openDb } from '../storage/db';
import { createStore } from '../storage/store';
import {
  runInterpret,
  resumeInterpret,
  reviseInterpret,
  answerFollowUp,
} from '../interpretation/pipeline';
import { createApp } from './server';
import type { AppDeps } from './types';

const DIR = join(process.cwd(), 'knowledge');
const EMPTY_DATA = mkdtempSync(join(tmpdir(), 'meihua-api-test-'));

function makeDeps(offline = true): AppDeps {
  const db = openDb(':memory:');
  const store = createStore(db);
  const knowledgeIndex = loadKnowledge(DIR);
  return {
    store,
    knowledgeIndex,
    knowledge: makeQuery(knowledgeIndex),
    llm: new MockProvider(),
    llmFactory: () => new MockProvider(),
    locks: new CaseLocks(),
    config: { port: 8787, offline, dataDir: EMPTY_DATA },
    castByNumbers,
    toLunarMoment: toLunarMoment as never,
    castByDateTime: castByDateTime as never,
    castByDirection: castByDirection as never,
    castByCount,
    castByText,
    castByMeasureZhangChi,
    castByMeasureChiCun,
    interpret: {
      run: (o) => runInterpret(o as never),
      resume: (o) => resumeInterpret(o as never),
      revise: (o) => reviseInterpret(o as never),
      followUp: (o) => answerFollowUp(o as never),
    },
  };
}

describe('API', () => {
  it('person→session→case→cast→interpret SSE', async () => {
    const app = createApp(makeDeps(true));
    const p = await app.inject({
      method: 'POST',
      url: '/api/persons',
      payload: { name: '测试' },
    });
    const personId = p.json().person.id;

    const s = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { personId },
    });
    const sessionId = s.json().session.id;

    const c = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/cases`,
      payload: {
        personId,
        question: '明日面试是否顺利',
        numbers: [31, 25, 9],
      },
    });
    expect(c.statusCode).toBe(200);
    const caseId = c.json().case.id;

    const c2 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/cases`,
      payload: { personId, question: 'x' },
    });
    expect(c2.statusCode).toBe(409);
    expect(c2.json().code).toBe('CASE_EXISTS');

    const cast = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/cast`,
      payload: { method: 'number3', hourZhi: 1, numbers: [31, 25, 9] },
    });
    expect(cast.statusCode).toBe(200);
    expect(cast.json().cast.ben.name).toBe('山天大畜');

    const noCast = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/cases`,
      payload: { personId, question: 'y' },
    });
    // 一会话一案例 → 第二案已 409，故用新 session
    void noCast;
    const s2 = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { personId },
    });
    const c3 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s2.json().session.id}/cases`,
      payload: { personId, question: 'z' },
    });
    const bare = await app.inject({
      method: 'POST',
      url: `/api/cases/${c3.json().case.id}/interpret`,
      payload: {},
    });
    expect(bare.statusCode).toBe(400);
    expect(bare.json().code).toBe('CAST_INVALID_INPUT');

    const sse = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/interpret`,
      payload: {},
    });
    expect(sse.statusCode).toBe(200);
    const text = sse.body;
    expect(text).toContain('event: step_done');
    expect(text).toContain('event: verdict');
    expect(text).toContain('event: done');
  });

  it('personId required for cases list', async () => {
    const app = createApp(makeDeps(true));
    const r = await app.inject({ method: 'GET', url: '/api/cases' });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('INVALID_REQUEST');
  });

  it('settings hasKey + secret reject', async () => {
    const app = createApp(makeDeps(true));
    const g = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(g.json().hasKey).toBe(false);
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { LLM_API_KEY: 'x' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('SECRET_SETTING_REJECTED');
  });

  it('followup offline → NO_API_KEY', async () => {
    const app = createApp(makeDeps(true));
    const p = await app.inject({
      method: 'POST',
      url: '/api/persons',
      payload: { name: 'a' },
    });
    const personId = p.json().person.id;
    const s = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { personId },
    });
    const c = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s.json().session.id}/cases`,
      payload: { personId, question: 'q', numbers: [1, 2, 3] },
    });
    const caseId = c.json().case.id;
    await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/cast`,
      payload: { method: 'number3', hourZhi: 1, numbers: [1, 2, 3] },
    });
    const fu = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/followup`,
      payload: { question: '细节？' },
    });
    expect(fu.statusCode).toBe(400);
    expect(fu.json().code).toBe('NO_API_KEY');
  });
});

describe('cast methods + knowledge id (bug.xiu B-01/B-02)', () => {
  async function setupCase() {
    const app = createApp(makeDeps(true));
    const p = await app.inject({
      method: 'POST',
      url: '/api/persons',
      payload: { name: 'cast' },
    });
    const personId = p.json().person.id;
    const s = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { personId },
    });
    const c = await app.inject({
      method: 'POST',
      url: `/api/sessions/${s.json().session.id}/cases`,
      payload: { personId, question: 'q' },
    });
    return { app, caseId: c.json().case.id as string };
  }

  it('objectCount / text / measure / datetime cast', async () => {
    const { app, caseId } = await setupCase();
    const oc = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/cast`,
      payload: { method: 'objectCount', count: 12, hourZhi: 3 },
    });
    expect(oc.statusCode).toBe(200);
    expect(oc.json().cast.method).toBe('objectCount');

    const tx = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/cast`,
      payload: { method: 'text', text: '观梅占' },
    });
    expect(tx.statusCode).toBe(200);
    expect(tx.json().cast.method).toBe('text');

    const mz = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/cast`,
      payload: { method: 'measureZhangChi', zhang: 1, chi: 5 },
    });
    expect(mz.statusCode).toBe(200);

    const dt = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/cast`,
      payload: {
        method: 'datetime',
        timeLocal: '2024-03-20T15:30:00',
        hourZhi: 9,
      },
    });
    expect(dt.statusCode).toBe(200);
    expect(dt.json().cast.method).toBe('datetime');
    expect(dt.json().cast.ben.name).toBeTruthy();
  });

  it('hourZhi required for number cast (B-15)', async () => {
    const { app, caseId } = await setupCase();
    const r = await app.inject({
      method: 'POST',
      url: `/api/cases/${caseId}/cast`,
      payload: { method: 'number3', numbers: [1, 2, 3] },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('CAST_INVALID_INPUT');
  });

  it('knowledge hexagram by numeric string id (B-02)', async () => {
    const app = createApp(makeDeps(true));
    const r = await app.inject({
      method: 'GET',
      url: '/api/knowledge/hexagram?id=1',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().kingwen).toBe(1);
  });

  it('llm save empty key keeps; clearApiKey clears (B-03/B-04)', async () => {
    const app = createApp(makeDeps(true));
    const save = await app.inject({
      method: 'PUT',
      url: '/api/settings/llm',
      payload: {
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: 'sk-test-keep',
      },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().hasKey).toBe(true);

    const keep = await app.inject({
      method: 'PUT',
      url: '/api/settings/llm',
      payload: { model: 'deepseek-chat', apiKey: '' },
    });
    expect(keep.json().hasKey).toBe(true);

    const testEmpty = await app.inject({
      method: 'POST',
      url: '/api/settings/test',
      payload: { provider: 'deepseek', model: 'deepseek-chat', apiKey: '' },
    });
    expect(testEmpty.json().code).not.toBe('NO_API_KEY');

    const cleared = await app.inject({
      method: 'PUT',
      url: '/api/settings/llm',
      payload: { clearApiKey: true },
    });
    expect(cleared.json().hasKey).toBe(false);
  });

  it('session route recommend without case (W7)', async () => {
    const app = createApp(makeDeps(true));
    const p = await app.inject({
      method: 'POST',
      url: '/api/persons',
      payload: { name: 'w7' },
    });
    const personId = p.json().person.id;
    const s = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { personId },
    });
    const sid = s.json().session.id;
    const r = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/route`,
      payload: { question: '我想找一个东西', mode: 'method' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.mode).toBe('method');
    expect(body.method).toBeTruthy();
    expect(body.category).toBeTruthy();
    expect(body.routeRounds).toBe(1);
    // 无 case 也应成功
    const r2 = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sid}/route`,
      payload: {
        question: '老人往东南',
        directionNote: '老人往东南',
        mode: 'parseDirection',
      },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().objectGua).toBe('qian');
    expect(r2.json().directionGua).toBe('xun');
  });
});
