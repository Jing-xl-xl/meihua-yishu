import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openDb } from '../storage/db';
import { createStore } from '../storage/store';

import { buildExportBundle } from './serialize';

describe('buildExportBundle', () => {
  it('includes formula/hex/steps/verdict; no secrets; skip rejected memory', () => {
    const db = openDb(':memory:');
    const store = createStore(db);
    const p = store.createPerson('我');
    const s = store.createSession(p.id);
    const c = store.createCase(s.id, p.id, {
      question: '明日面试是否顺利',
      numbers: [31, 25, 9],
      category: '求职',
    });
    store.updateCaseCast(c.id, {
      method: 'number3',
      cast: {
        method: 'number3',
        school: { movingYao: 'mod', addHour: false },
        formula: [{ label: '上卦', expr: '31÷8…7' }],
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
        sources: [{ id: 'x', title: 'T' }],
        updatedAt: new Date().toISOString(),
      },
    ]);
    store.updateCaseVerdict(c.id, {
      grade: 'good',
      summary: '尚可',
      points: [],
      advice: [],
      timing: '快',
      risks: [],
      basedOnSteps: [1],
    });
    store.saveFeedback(c.id, {
      actual: '顺利',
      accuracy: 'yes',
      deviationSteps: [7],
    });
    store.insertMemory({
      id: 'm-ok',
      personId: p.id,
      type: 'round',
      payload: { text: 'keep' },
      tags: [],
      createdAt: new Date().toISOString(),
    });
    store.insertMemory({
      id: 'm-no',
      personId: p.id,
      type: 'round',
      payload: { text: 'drop' },
      tags: [],
      rejected: true,
      createdAt: new Date().toISOString(),
    });

    const bundle = buildExportBundle(store, p.id);
    expect(bundle.version).toBe(1);
    expect(bundle.cases).toHaveLength(1);
    const rec = bundle.cases[0]!;
    expect(rec.formula).toHaveLength(1);
    expect(rec.hex.ben).toBe('山天大畜');
    expect(rec.hex.bian).toBe('山泽损');
    expect(rec.hex.movingYao).toBe(3);
    expect(rec.hex.ti).toBe('qian');
    expect(rec.hex.yong).toBe('gen');
    expect(rec.steps[0]!.conclusion).toBe('大畜之损');
    expect(rec.actual).toBe('顺利');
    expect(bundle.memories.map((m) => m.id)).toEqual(['m-ok']);
    const text = JSON.stringify(bundle);
    expect(text).not.toContain('LLM_API_KEY');
    expect(text).not.toContain('apiKey');
    // steps export 无 sources
    expect(rec.steps[0]).not.toHaveProperty('sources');
  });
});

describe('stats + sample', () => {
  it('byDeviationStep from feedback', () => {
    const db = openDb(':memory:');
    const store = createStore(db);
    const p = store.createPerson('a');
    const s = store.createSession(p.id);
    const c = store.createCase(s.id, p.id, { question: 'q', category: '求职' });
    store.saveFeedback(c.id, { accuracy: 'partial', deviationSteps: [7, 9] });
    const st = store.getStats(p.id);
    expect(st.byDeviationStep['7']).toBe(1);
    expect(st.byDeviationStep['9']).toBe(1);
    expect(st.byCategory['求职']).toBe(1);
    expect(st.composite).toBeCloseTo(0.5);
  });

  it('sample file 7 cases desensitized + derivation', () => {
    const path = join(process.cwd(), 'examples/cases.sample.json');
    const data = JSON.parse(readFileSync(path, 'utf-8')) as {
      cases: {
        question: string;
        person: string;
        hex: {
          ben: string;
          bian: string;
          movingYao: number;
          ti: string;
          yong: string;
        };
      }[];
    };
    expect(data.cases).toHaveLength(7);
    const text = JSON.stringify(data);
    expect(text).not.toContain('byk');
    for (const c of data.cases) {
      expect(c.hex.ben).toBeTruthy();
      expect(c.hex.bian).toBeTruthy();
      expect(c.hex.movingYao).toBeGreaterThanOrEqual(1);
      expect(c.hex.movingYao).toBeLessThanOrEqual(6);
      expect(c.hex.ti).toBeTruthy();
      expect(c.hex.yong).toBeTruthy();
    }
    // 31/25/9 例：大畜之损动3
    const hit = data.cases.find((c) => c.hex.ben.includes('大畜'));
    if (hit) {
      expect(hit.hex.bian).toContain('损');
      expect(hit.hex.movingYao).toBe(3);
    }
  });
});
