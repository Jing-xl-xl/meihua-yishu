import { describe, expect, it } from 'vitest';

import { fallbackAsk, pickBackgroundAsk } from './background';

describe('背景澄清槽位（B3）', () => {
  it('步 3 按占类选槽：求职→stage，失物→object，默认→relation', () => {
    expect(pickBackgroundAsk(3, { question: '明天面试能不能过' }, [])?.slot).toBe(
      'stage',
    );
    expect(pickBackgroundAsk(3, { question: '钥匙丢了' }, [])?.slot).toBe(
      'object',
    );
    expect(pickBackgroundAsk(3, { question: '最近心里不踏实' }, [])?.slot).toBe(
      'relation',
    );
  });

  it('步 7 按占类选槽：求职→expectation，失物→urgency', () => {
    expect(
      pickBackgroundAsk(7, { question: '明天面试能不能过' }, [])?.slot,
    ).toBe('expectation');
    expect(pickBackgroundAsk(7, { question: '钥匙丢了' }, [])?.slot).toBe(
      'urgency',
    );
  });

  it('payload 带 why / suggested / examples，且一次只问一个槽', () => {
    const a = pickBackgroundAsk(3, { question: '丢钥匙' }, []);
    expect(a?.why).toBeTruthy();
    expect(a?.suggested.length).toBeGreaterThanOrEqual(2);
    expect(a?.examples.length).toBeGreaterThanOrEqual(1);
    expect(a?.stepId).toBe(3);
  });

  it('已问过的槽位不再重复；兜底可跳过', () => {
    expect(pickBackgroundAsk(3, { question: '丢钥匙' }, ['object'])).toBeNull();
    expect(fallbackAsk(3).suggested.length).toBeGreaterThanOrEqual(2);
  });
});
