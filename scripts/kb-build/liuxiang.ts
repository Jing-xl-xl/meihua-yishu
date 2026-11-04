/**
 * 解析《梅花易数知识库.md》§4.2 八卦万物属类（全类目）→ liuxiang 结构。
 * 仅 §4.2；标题行不入库；确定性规则（禁 LLM）。
 */
import type { Gua } from '@meihua/shared';

export type LiuXiangGua = Record<string, string[]>;
export type LiuXiangFile = {
  version: 1;
  gua: Record<Gua, LiuXiangGua>;
};

export const CORE_CATEGORIES = [
  '天时',
  '地理',
  '人物',
  '身体',
  '静物',
] as const;

/** 源文可能缺（如坎无「动物」条）→ 仅警告 */
export const OPTIONAL_CATEGORIES = ['动物'] as const;

const GUA_BY_CN: Record<string, Gua> = {
  乾: 'qian',
  兑: 'dui',
  离: 'li',
  震: 'zhen',
  巽: 'xun',
  坎: 'kan',
  艮: 'gen',
  坤: 'kun',
};

function splitWords(raw: string): string[] {
  return raw
    .split(/[、，,；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 从 md 抽出 §4.2 正文（到 §4.3 或下一章） */
export function extractSection42(md: string): string {
  const start = md.indexOf('## 4.2 ');
  if (start < 0) throw new Error('section 4.2 not found');
  const rest = md.slice(start);
  const endM = rest.search(/\n## 4\.3 |\n# 第五部分/);
  return endM > 0 ? rest.slice(0, endM) : rest;
}

export function parseLiuXiang(
  md: string,
  opts?: { requireAll?: boolean },
): LiuXiangFile {
  const requireAll = opts?.requireAll !== false;
  const section = extractSection42(md);
  const lines = section.split('\n');
  const gua: Partial<Record<Gua, LiuXiangGua>> = {};
  let current: Gua | null = null;

  for (const line of lines) {
    const head = line.match(/^###\s*([乾坤坎离震巽艮兑])卦/);
    if (head) {
      current = GUA_BY_CN[head[1]!];
      if (current) gua[current] = {};
      continue;
    }
    // 跳过标题行 / 非列表
    const item = line.match(/^-\s*([^：:]+)[：:]\s*(.*)$/);
    if (!item || !current) continue;
    const cat = item[1]!.trim();
    const words = splitWords(item[2]!.replace(/[。．.]$/, ''));
    if (!cat || words.length === 0) continue;
    const bag = gua[current]!;
    bag[cat] = [...(bag[cat] ?? []), ...words];
  }

  const out = {} as LiuXiangFile['gua'];
  const ids: Gua[] = ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'];
  for (const id of ids) {
    if (!gua[id]) {
      if (requireAll) throw new Error(`liuxiang missing gua ${id}`);
      continue;
    }
    out[id] = gua[id]!;
  }
  return { version: 1, gua: out };
}

export function liuXiangStats(file: LiuXiangFile): Array<{
  gua: Gua;
  categories: number;
  words: number;
  coreOk: boolean;
}> {
  return (Object.keys(file.gua) as Gua[]).map((g) => {
    const bag = file.gua[g];
    const words = Object.values(bag).reduce((n, a) => n + a.length, 0);
    const coreOk = CORE_CATEGORIES.every((c) => (bag[c]?.length ?? 0) > 0);
    return { gua: g, categories: Object.keys(bag).length, words, coreOk };
  });
}
