import { describe, expect, it } from 'vitest';

import { extractSection42, parseLiuXiang } from './liuxiang';

const FIXTURE = `
# 第四部分

## 4.1 简表
- 乾：忽略我。

## 4.2 八卦万物属类（全类目）

### 乾卦（一 金；乾为天、天风姤）
- 天时：天、冰、雹。
- 人物：君、父、大人。
- 身体：首、骨、肺。

### 兑卦（二 金）
- 天时：泽。
- 人物：少女、巫。
- 身体：舌、口、肺。

## 4.3 卦应
- 不进库
`;

describe('parseLiuXiang', () => {
  it('only section 4.2, no title junk', () => {
    const file = parseLiuXiang(FIXTURE, { requireAll: false });
    expect(file.gua.qian['天时']).toEqual(['天', '冰', '雹']);
    expect(file.gua.qian['人物']).toEqual(['君', '父', '大人']);
    expect(file.gua.dui['人物']).toEqual(['少女', '巫']);
    // 4.1 / 4.3 不入库
    expect(JSON.stringify(file)).not.toContain('忽略我');
    expect(JSON.stringify(file)).not.toContain('不进库');
  });

  it('extractSection42 stops at 4.3', () => {
    const s = extractSection42(FIXTURE);
    expect(s).toContain('## 4.2');
    expect(s).not.toContain('## 4.3');
  });
});
