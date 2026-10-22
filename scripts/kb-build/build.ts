/**
 * kb-build：从《梅花易数知识库.md》生成 knowledge JSON（D-1）。
 * 结构字段（kingwen/fullName/upper/lower）只认 shared HEXAGRAM_TABLE。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HEXAGRAM_TABLE, GUA_NAME_ZH } from '@meihua/shared';
import type { Gua, HexagramData, HexLineData, JieqiMonthKey } from '@meihua/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, '../..');
const KB_MD = resolve(APP_ROOT, '../梅花易数知识库.md');
const OUT = resolve(APP_ROOT, 'knowledge');

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17, 十八: 18,
  十九: 19, 二十: 20, 二十一: 21, 二十二: 22, 二十三: 23, 二十四: 24, 二十五: 25,
  二十六: 26, 二十七: 27, 二十八: 28, 二十九: 29, 三十: 30, 三十一: 31, 三十二: 32,
  三十三: 33, 三十四: 34, 三十五: 35, 三十六: 36, 三十七: 37, 三十八: 38, 三十九: 39,
  四十: 40, 四十一: 41, 四十二: 42, 四十三: 43, 四十四: 44, 四十五: 45, 四十六: 46,
  四十七: 47, 四十八: 48, 四十九: 49, 五十: 50, 五十一: 51, 五十二: 52, 五十三: 53,
  五十四: 54, 五十五: 55, 五十六: 56, 五十七: 57, 五十八: 58, 五十九: 59, 六十: 60,
  六十一: 61, 六十二: 62, 六十三: 63, 六十四: 64,
};

const NATURE_TO_GUA: Record<string, Gua> = {};
for (const [g, n] of Object.entries(GUA_NAME_ZH)) {
  NATURE_TO_GUA[n] = g as Gua;
}

const YAO_LABEL_POS: Record<string, number> = {
  初九: 1, 初六: 1, 九二: 2, 六二: 2, 九三: 3, 六三: 3,
  九四: 4, 六四: 4, 九五: 5, 六五: 5, 上九: 6, 上六: 6,
};

function parseGlossTable(md: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const a = m[1]!.trim();
    const b = m[2]!.trim();
    if (a === '卦名' || a.includes('---')) continue;
    if (a.length >= 2 && b.length > 0 && !a.includes('卦')) {
      map[a] = b;
    } else if (a.includes('为') || a.length >= 3) {
      map[a] = b;
    }
  }
  return map;
}

function parseHexagrams(md: string, gloss: Record<string, string>): HexagramData[] {
  const section = md.slice(md.indexOf('# 第五部分'));
  const blocks = section.split(/^## /m).slice(1);
  const out: HexagramData[] = [];

  for (const block of blocks) {
    const title = block.split('\n', 1)[0]!;
    // ## 卦一 乾（乾下乾上）
    const tm = title.match(/^卦([一二三四五六七八九十]+)\s+(\S+?)（(\S+)下(\S+)上）\s*$/);
    if (!tm) {
      throw new Error(`hex title format mismatch: ${title}`);
    }
    const kingwen = CN_NUM[tm[1]!];
    if (!kingwen) throw new Error(`unknown cn num ${tm[1]}`);
    const single = tm[2]!;
    const lower = NATURE_TO_GUA[tm[3]!];
    const upper = NATURE_TO_GUA[tm[4]!];
    if (!lower || !upper) {
      throw new Error(`unknown trigram nature in title: ${title}`);
    }
    const meta = HEXAGRAM_TABLE.find(
      (h) => h.kingwen === kingwen && h.lower === lower && h.upper === upper,
    );
    if (!meta) {
      throw new Error(
        `md structure disagrees with HEXAGRAM_TABLE: ${title} → ${lower}/${upper}`,
      );
    }

    let guaCi = '';
    const lines: HexLineData[] = [];
    let yongYao: string | null = null;

    for (const line of block.split('\n')) {
      const g = line.match(/^\*\*卦辞\*\*：(.+)$/);
      if (g) {
        guaCi = g[1]!.trim();
        continue;
      }
      const y = line.match(/^-\s+\*\*(.+?)\*\*：(.+)$/);
      if (y) {
        const label = y[1]!.trim();
        const text = y[2]!.trim();
        if (label === '用九' || label === '用六') {
          yongYao = text;
          continue;
        }
        const pos = YAO_LABEL_POS[label];
        if (!pos) throw new Error(`unknown yao label ${label} in ${title}`);
        lines.push({
          pos: pos as HexLineData['pos'],
          yang: label.startsWith('九') || label === '初九' || label === '上九',
          label,
          text,
        });
      }
    }
    if (!guaCi) throw new Error(`missing guaCi in ${title}`);
    if (lines.length !== 6) {
      throw new Error(`expected 6 lines in ${title}, got ${lines.length}`);
    }
    lines.sort((a, b) => a.pos - b.pos);

    const g = gloss[meta.name] ?? gloss[single] ?? '';
    out.push({
      kingwen: meta.kingwen,
      name: single,
      fullName: meta.name,
      upper: meta.upper,
      lower: meta.lower,
      gloss: g,
      guaCi,
      lines,
      yongYao,
    });
  }

  if (out.length !== 64) {
    throw new Error(`expected 64 hexagrams, got ${out.length}`);
  }
  out.sort((a, b) => a.kingwen - b.kingwen);
  return out;
}

function writeJson(rel: string, data: unknown): void {
  const path = join(OUT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log('wrote', path);
}

function main(): void {
  const md = readFileSync(KB_MD, 'utf-8');
  const sourceHash = createHash('sha256').update(md).digest('hex');

  const gloss = parseGlossTable(md);
  const hexagrams = parseHexagrams(md, gloss);

  const emptyGloss = hexagrams.filter((h) => !h.gloss);
  if (emptyGloss.length > 0) {
    console.warn(
      'warn: empty gloss (must fill before M2 gate):',
      emptyGloss.map((h) => h.fullName).join(', '),
    );
  }

  writeJson('structured/hexagrams.json', { version: 1, hexagrams });

  writeJson('structured/duanyu.json', {
    version: 1,
    shengTi: {
      qian: '公门中有喜益、功名上有喜、因官有财',
      kun: '田土之喜、田土进财、得乡人之益',
      zhen: '山林之益、因动中有喜',
      xun: '山林之益、东南得财',
      kan: '北方之喜、水边人进利',
      li: '南方之财、文书之喜',
      gen: '东北方之财、山田之喜',
      dui: '西方之财、喜悦事',
    },
    keTi: {
      qian: '公事之忧、门户之忧',
      kun: '田土之忧、阴人之侵',
      zhen: '虚惊、常多恐惧',
      xun: '草木姓人相害',
      kan: '险陷之事、寇盗之忧',
      li: '文书之忧、失火之惊',
      gen: '诸事多违、百谋中阻',
      dui: '口舌纷争、毁折之患',
    },
  });

  writeJson('structured/tiyong.json', {
    version: 1,
    sheng: '用生体：有进益之喜',
    ke: '体克用：诸事可成（成迟）',
    bi_he: '体用比和：百事顺遂',
    xie: '体生用：有耗失之患、泄气',
    bei_ke: '用克体：诸事不成',
  });

  writeJson('structured/wangshuai.json', {
    version: 1,
    entries: {
      寅: { strong: ['zhen', 'xun'], weak: ['kun', 'gen'] },
      卯: { strong: ['zhen', 'xun'], weak: ['kun', 'gen'] },
      辰: { strong: ['kun', 'gen'], weak: ['kan'] },
      巳: { strong: ['li'], weak: ['qian', 'dui'] },
      午: { strong: ['li'], weak: ['qian', 'dui'] },
      未: { strong: ['kun', 'gen'], weak: ['kan'] },
      申: { strong: ['qian', 'dui'], weak: ['zhen', 'xun'] },
      酉: { strong: ['qian', 'dui'], weak: ['zhen', 'xun'] },
      戌: { strong: ['kun', 'gen'], weak: ['kan'] },
      亥: { strong: ['kan'], weak: ['li'] },
      子: { strong: ['kan'], weak: ['li'] },
      丑: { strong: ['kun', 'gen'], weak: ['kan'] },
    } as Record<JieqiMonthKey, { strong: Gua[]; weak: Gua[] }>,
  });

  writeJson('structured/shibazhan.json', {
    version: 1,
    categories: [
      '天时', '人事', '家宅', '屋舍', '婚姻', '生产', '饮食', '求谋', '求名',
      '求财', '交易', '出行', '行人', '谒见', '失物', '疾病', '官讼', '坟墓',
    ],
  });

  const meta = {
    version: `1.0.0-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    builtAt: new Date().toISOString(),
    sourceHash,
  };
  writeJson('meta.json', meta);
  console.log('kb-build done', meta.version);
}

main();
