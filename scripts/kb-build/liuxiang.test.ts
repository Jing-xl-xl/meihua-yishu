import { describe, expect, it } from 'vitest';

import { extractSection42, parseAttrSegments, parseLiuXiang } from './liuxiang';

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

describe('parseAttrSegments（§4.11b 多属性段契约）', () => {
  it('先。后：拆段，粘连键剥离归位', () => {
    const out = parseAttrSegments(
      '方道',
      '西北。五色：大赤色、玄色。姓字：带金旁者、商音、行位一四九。数目：一、四、九。五味：辛辣',
    );
    expect(out['方道']).toEqual(['西北']);
    expect(out['五色']).toEqual(['大赤色', '玄色']);
    expect(out['姓字']).toEqual(['带金旁者', '商音']);
    expect(out['行位']).toEqual(['一四九']);
    expect(out['数目']).toEqual(['一', '四', '九']);
    expect(out['五味']).toEqual(['辛辣']);
  });

  it('无键段落继承主类目；行位粘连在值内亦剥离', () => {
    const out = parseAttrSegments(
      '姓字',
      '商音、带口带金字旁姓氏、行位四二九。数目：四、二、九。方道：西方',
    );
    expect(out['姓字']).toEqual(['商音', '带口带金字旁姓氏']);
    expect(out['行位']).toEqual(['四二九']);
    expect(out['数目']).toEqual(['四', '二', '九']);
    expect(out['方道']).toEqual(['西方']);
  });

  it('单属性行与旧版一致', () => {
    const out = parseAttrSegments('天时', '天、冰、雹、霰');
    expect(out['天时']).toEqual(['天', '冰', '雹', '霰']);
  });
});
