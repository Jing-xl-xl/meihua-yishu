import { describe, expect, it } from 'vitest';

import type { CastResult, SSEEvent, StepState } from '@meihua/shared';
import { buildTripleHex, flipAndBuildBian, computeHu, tiYongOf, toMovingPos } from '../casting/build';
import { openDb } from '../storage/db';
import { createStore } from '../storage/store';
import { loadKnowledge, makeQuery } from '../knowledge/query';
import { MockProvider } from '../llm/mock';
import { join } from 'node:path';

import { locks, runInterpret, reviseInterpret, resumeInterpret, answerFollowUp } from './pipeline';
import { composeVerdict } from './verdict';

const DIR = join(process.cwd(), 'knowledge');
const knowledge = makeQuery(loadKnowledge(DIR));

function makeCast(method: CastResult['method'] = 'number3'): CastResult {
  const ben = buildTripleHex('qian', 'gen'); // 山天大畜? wait gen upper qian lower
  // 山天大畜 = gen upper, qian lower
  const movingYao = toMovingPos(3);
  const bian = flipAndBuildBian(ben, movingYao);
  const hu = computeHu(ben.lines, bian.lines);
  const { ti, yong, tiYongNote } = tiYongOf(movingYao, ben.upper, ben.lower);
  return {
    method,
    school: { movingYao: 'mod', addHour: false },
    formula: [{ label: '上卦', expr: 'x' }],
    ben,
    hu,
    bian,
    movingYao,
    ti,
    yong,
    tiYongNote,
  };
}

function setup() {
  const db = openDb(':memory:');
  const store = createStore(db);
  const person = store.createPerson('我');
  const session = store.createSession(person.id);
  const c = store.createCase(session.id, person.id, {
    question: '明天面试是否顺利',
    category: '求职',
  });
  const events: SSEEvent[] = [];
  return {
    store,
    case: c,
    emit: (e: SSEEvent) => events.push(e),
    events,
  };
}

describe('step6 分流', () => {
  it('number3 → skipped_by_method；direction → 经文', async () => {
    const s1 = setup();
    const llm = new MockProvider();
    const r1 = await runInterpret({
      case: s1.case,
      cast: makeCast('number3'),
      store: s1.store,
      knowledge,
      llm,
      emit: s1.emit,
      offline: true,
    });
    const st6 = r1.steps.find((s) => s.stepId === 6)!;
    expect(st6.status).toBe('skipped_by_method');
    expect(r1.verdict.basedOnSteps).not.toContain(6);

    const s2 = setup();
    const r2 = await runInterpret({
      case: s2.case,
      cast: makeCast('direction'),
      store: s2.store,
      knowledge,
      llm: new MockProvider(),
      emit: s2.emit,
      offline: true,
    });
    // 后天 offline → need_key 而非 skip
    expect(r2.steps.find((s) => s.stepId === 6)!.status).toBe('need_key');
  });
});

describe('步 4/5 规则 + grade 映射', () => {
  it('offline 也可出 4/5；grade 来自步4', async () => {
    const s = setup();
    const r = await runInterpret({
      case: s.case,
      cast: makeCast('number3'),
      store: s.store,
      knowledge,
      llm: new MockProvider(),
      emit: s.emit,
      offline: true,
    });
    expect(r.steps.find((x) => x.stepId === 4)!.status).toBe('confirmed');
    expect(r.steps.find((x) => x.stepId === 5)!.status).toBe('confirmed');
    expect(['good', 'neutral', 'bad', 'great', 'terrible']).toContain(
      r.verdict.grade,
    );
  });

  it('gradeFromYongTiWangShuai（经 composeVerdict）', () => {
    // 用生体+平 → great；体生用+平 → bad；用克体+衰 → terrible
    expect(
      composeVerdict({ steps: [], relation: 'sheng', wangShuai: '平' }).grade,
    ).toBe('great');
    expect(
      composeVerdict({ steps: [], relation: 'xie', wangShuai: '平' }).grade,
    ).toBe('bad');
    expect(
      composeVerdict({ steps: [], relation: 'yong_ke', wangShuai: '衰' }).grade,
    ).toBe('terrible');
  });
});

describe('need_input 立即返回 + 锁释放', () => {
  it('done:false and lock free', async () => {
    const s = setup();
    const llm = new MockProvider();
    const r = await runInterpret({
      case: s.case,
      cast: makeCast('number3'),
      store: s.store,
      knowledge,
      llm,
      emit: s.emit,
      offline: false,
    });
    // Mock 会在步3 发 need_input（B3：槽位化 payload）
    expect(r.done).toBe(false);
    expect(locks.isBusy(s.case.id)).toBe(false);
    const firstNeed = s.events.find((e) => e.type === 'need_input') as
      | {
          data: {
            stepId?: number;
            slot?: string;
            why?: string;
            suggested?: string[];
            examples?: string[];
          };
        }
      | undefined;
    expect(firstNeed?.data.stepId).toBe(3);
    expect(firstNeed?.data.slot).toBeTruthy();
    expect(firstNeed?.data.why).toBeTruthy();
    expect(firstNeed?.data.suggested?.length ?? 0).toBeGreaterThan(1);
    expect(firstNeed?.data.examples?.length ?? 0).toBeGreaterThan(0);

    // 步 3 回答后，续跑会补问步 7（补上后才有第二次 need）
    const r2 = await resumeInterpret({
      case: s.case,
      cast: makeCast('number3'),
      store: s.store,
      knowledge,
      llm,
      emit: s.emit,
      answers: [{ stepId: 3, text: '' }],
    });
    expect(r2.done).toBe(false);
    expect(
      s.events.some(
        (e) =>
          e.type === 'need_input' &&
          (e.data as { stepId?: number }).stepId === 7,
      ),
    ).toBe(true);

    // 回答步 7 后完成，且不会再次重复问
    const r3 = await resumeInterpret({
      case: s.case,
      cast: makeCast('number3'),
      store: s.store,
      knowledge,
      llm,
      emit: s.emit,
      answers: [{ stepId: 7, text: '' }],
    });
    expect(r3.done).toBe(true);
  });
});

describe('客户端断开（AbortSignal）', () => {
  it('已 abort → 抛 LLM_ABORT 且释放锁，不写步骤', async () => {
    const s = setup();
    const ac = new AbortController();
    ac.abort();
    await expect(
      runInterpret({
        case: s.case,
        cast: makeCast('number3'),
        store: s.store,
        knowledge,
        llm: new MockProvider(),
        emit: s.emit,
        offline: false,
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ code: 'LLM_ABORT' });
    expect(locks.isBusy(s.case.id)).toBe(false);
    expect(s.store.getSteps(s.case.id).length).toBe(0);
  });
});

describe('revise 落库 + 重跑', () => {
  it('appendMessage user then revise', async () => {
    const s = setup();
    const llm = new MockProvider();
    await runInterpret({
      case: s.case,
      cast: makeCast('number3'),
      store: s.store,
      knowledge,
      llm,
      emit: s.emit,
      offline: true,
    });
    const r = await reviseInterpret({
      case: s.case,
      cast: makeCast('number3'),
      store: s.store,
      knowledge,
      llm,
      emit: s.emit,
      stepId: 4,
      message: '体应为本人',
      offline: true,
    });
    const msgs = s.store.listMessages(s.case.sessionId);
    expect(msgs.some((m) => m.content === '体应为本人' && m.role === 'user')).toBe(
      true,
    );
    const st4 = r.steps.find((x) => x.stepId === 4)!;
    expect(st4.status).toBe('revised');
  });
});

describe('离线 / followUp', () => {
  it('offline 2/7/8/9 need_key；followUp 抛 NO_API_KEY', async () => {
    const s = setup();
    const r = await runInterpret({
      case: s.case,
      cast: makeCast('number3'),
      store: s.store,
      knowledge,
      llm: new MockProvider(),
      emit: s.emit,
      offline: true,
    });
    for (const id of [2, 7, 8, 9] as const) {
      expect(r.steps.find((x) => x.stepId === id)!.status).toBe('need_key');
    }
    await expect(
      answerFollowUp({
        case: s.case as never,
        cast: makeCast(),
        steps: r.steps,
        question: 'q',
        knowledge,
        llm: new MockProvider(),
        offline: true,
      }),
    ).rejects.toMatchObject({ code: 'NO_API_KEY' });
  });
});

describe('composeVerdict', () => {
  it('filters skipped', () => {
    const steps: StepState[] = [
      {
        stepId: 6,
        status: 'skipped_by_method',
        conclusion: '',
        sources: [],
        updatedAt: '',
      },
      {
        stepId: 4,
        status: 'confirmed',
        conclusion: '用生体',
        sources: [],
        updatedAt: '',
      },
    ];
    const v = composeVerdict({ steps, relation: 'sheng' });
    expect(v.basedOnSteps).toEqual([4]);
    // 用生体 + 旺衰缺省平 → 大吉（规格 §5.2）
    expect(v.grade).toBe('great');
  });
});
