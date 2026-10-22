import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { HEXAGRAM_TABLE } from '@meihua/shared';

import { loadKnowledge, makeQuery } from './query';

const DIR = join(process.cwd(), 'knowledge');
const index = loadKnowledge(DIR);
const q = makeQuery(index);

describe('knowledge loader', () => {
  it('loads D-1 domains', () => {
    expect(index.meta.version).toBeTruthy();
    expect(index.hexagrams).toHaveLength(64);
  });

  it('fullName aligns with HEXAGRAM_TABLE', () => {
    const names = new Set(index.hexagrams.map((h) => h.fullName));
    for (const t of HEXAGRAM_TABLE) {
      expect(names.has(t.name)).toBe(true);
    }
  });

  it('hexagram 26 / 大畜 / 山天大畜', () => {
    expect(q.hexagram(26).fullName).toBe('山天大畜');
    expect(q.hexagram('大畜').kingwen).toBe(26);
    expect(q.hexagram('山天大畜').kingwen).toBe(26);
    // 数字字符串按文王序（B-02）
    expect(q.hexagram('26').kingwen).toBe(26);
  });

  it('gloss and guaCi non-empty', () => {
    for (const h of index.hexagrams) {
      expect(h.gloss.length).toBeGreaterThan(0);
      expect(h.guaCi.length).toBeGreaterThan(0);
    }
    expect(q.guaCi(26)).toContain('利贞');
  });

  it('yongYao on qian/kun only', () => {
    expect(q.hexagram(1).yongYao).toBeTruthy();
    expect(q.hexagram(2).yongYao).toBeTruthy();
    expect(q.hexagram(26).yongYao).toBeNull();
  });

  it('lineText', () => {
    const t = q.lineText(1, 3);
    expect(t).toContain('乾乾');
  });

  it('wangshuai 12 keys; 未列入=平', () => {
    const w = q.wangShuai('寅');
    expect(w.strong).toContain('zhen');
    expect(w.strong).toContain('xun');
    const all = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'] as const;
    for (const z of all) {
      expect(() => q.wangShuai(z)).not.toThrow();
    }
  });

  it('duanyu / tiyong', () => {
    expect(q.shengTiDuanYu('qian')).toBeTruthy();
    expect(q.keTiDuanYu('kun')).toBeTruthy();
    expect(q.tiyongDuan('sheng')).toBeTruthy();
    expect(q.tiyongDuan('xie')).toBeTruthy();
  });
});
