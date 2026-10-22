import { describe, expect, it } from 'vitest';

import {
  PERSON_TO_GUA,
  castByCount,
  castByMeasureChiCun,
  castByMeasureZhangChi,
  castByText,
  countChars,
  textSplit,
} from './extraMethods';

describe('objectCount / sound 钉死金样例 A/E', () => {
  it('物 12 时 3 → 雷山小过之雷地豫 动3', () => {
    const r = castByCount('objectCount', { count: 12, hourZhi: 3 });
    expect(r.ben.name).toBe('雷山小过');
    expect(r.bian.name).toBe('雷地豫');
    expect(r.movingYao).toBe(3);
    const r2 = castByCount('sound', { count: 12, hourZhi: 3 });
    expect(r2.ben.name).toBe('雷山小过');
    expect(r2.bian.name).toBe('雷地豫');
  });

  it('API 语义 count>=1；engine 可测 0→坤另测', () => {
    expect(() => castByCount('objectCount', { count: 0, hourZhi: 1 })).toThrow();
  });
});

describe('text 字占 B', () => {
  it('countChars 忽略标点', () => {
    expect(countChars('一、二。三')).toBe(3);
    expect(countChars('abc!')).toBe(3);
  });

  it('5 字 → 上2下3；动5', () => {
    const r = castByText({ text: '一二三四五' });
    expect(r.movingYao).toBe(5);
    // 上2%8=兑 下3%8=离 → 泽火革
    expect(r.ben.name).toBe('泽火革');
  });

  it('n=1 抛错', () => {
    expect(() => castByText({ text: '一' })).toThrow();
  });

  it('textSplit 特表', () => {
    expect(textSplit(3)).toEqual({ up: 1, lo: 2 });
    expect(textSplit(5)).toEqual({ up: 2, lo: 3 });
    expect(textSplit(11)).toEqual({ up: 5, lo: 6 });
  });
});

describe('measure C/D', () => {
  it('丈1尺5 → 天风姤 动6', () => {
    const r = castByMeasureZhangChi({ zhang: 1, chi: 5 });
    expect(r.ben.name).toBe('天风姤');
    expect(r.movingYao).toBe(6);
  });

  it('尺2寸3时4 → 动3', () => {
    const r = castByMeasureChiCun({ chi: 2, cun: 3, hourZhi: 4 });
    expect(r.movingYao).toBe(3);
    expect(r.ben.name).toBeTruthy();
  });

  it('全 0 抛错', () => {
    expect(() => castByMeasureZhangChi({ zhang: 0, chi: 0 })).toThrow();
    expect(() => castByMeasureChiCun({ chi: 0, cun: 0, hourZhi: 1 })).toThrow();
  });
});

describe('为人占映射', () => {
  it('老人→乾', () => {
    expect(PERSON_TO_GUA.老人).toBe('qian');
    expect(PERSON_TO_GUA.见水).toBe('kan');
  });
});
