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

/** 粘连键剥离（§4.11b 数据契约）：「行位一四九」→ 行位: 一四九 */
const GLUE_KEY = /^(行位)([一二三四五六七八九十百零]+)$/;

/**
 * 解析行内多属性段（§4.11b 数据契约）：
 * 先按「。」拆段 → 段内「键：值」拆键值 → 值按「、」拆词 → 粘连键剥离归位。
 * 无键段落继承本行主类目。基础行为：单属性行结果与旧版一致。
 */
export function parseAttrSegments(
  primary: string,
  rest: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const push = (k: string, v: string) => {
    const t = v.trim();
    if (!t) return;
    (out[k] ??= []).push(t);
  };
  for (const seg of rest.split(/[。．.]/)) {
    const s = seg.trim();
    if (!s) continue;
    const m = s.match(/^([^：:]+)[：:](.*)$/);
    const key = m ? m[1]!.trim() : primary;
    const values = m ? m[2]! : s;
    for (const tok of splitWords(values)) {
      const glue = tok.match(GLUE_KEY);
      if (glue) {
        push(glue[1]!, glue[2]!);
      } else {
        push(key, tok);
      }
    }
  }
  return out;
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
    const rest = item[2]!.replace(/[。．.]\s*$/, '');
    if (!cat || !rest) continue;
    const bag = gua[current]!;
    for (const [k, vals] of Object.entries(parseAttrSegments(cat, rest))) {
      bag[k] = [...(bag[k] ?? []), ...vals];
    }
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
