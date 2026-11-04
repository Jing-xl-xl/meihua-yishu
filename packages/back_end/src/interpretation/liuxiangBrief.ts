import type { Gua } from '@meihua/shared';

export type LiuxiangBag = Record<string, string[]>;

const DEFAULT_CATS = ['人物', '人事', '静物', '身体'];

/** 步 7 类象摘录（规格 §9）：体 2–4 类目 + 用 1–3，每类 ≤6 词，总 ≤300 字 */
export function buildLiuXiangExcerpt(opts: {
  ti: Gua | string;
  yong: Gua | string;
  tiBag: LiuxiangBag;
  yongBag: LiuxiangBag;
  category?: string;
  question?: string;
}): string {
  const q = `${opts.category ?? ''}${opts.question ?? ''}`;
  const pick = (bag: LiuxiangBag, maxCats: number): string[] => {
    const keys = Object.keys(bag);
    const scored = keys
      .map((k) => {
        let s = 0;
        if (q.includes(k)) s += 3;
        if (DEFAULT_CATS.includes(k)) s += 1;
        for (const w of bag[k]!.slice(0, 8)) {
          if (q.includes(w)) s += 2;
        }
        return { k, s, n: bag[k]!.length };
      })
      .filter((x) => x.n > 0)
      .sort((a, b) => b.s - a.s || b.n - a.n);
    const chosen = scored.slice(0, maxCats);
    if (!chosen.length) {
      return DEFAULT_CATS.filter((c) => bag[c]?.length)
        .slice(0, 2)
        .map((c) => `${c}：${bag[c]!.slice(0, 6).join('、')}`);
    }
    return chosen.map((c) => `${c.k}：${(bag[c.k] ?? []).slice(0, 6).join('、')}`);
  };

  const tiLines = pick(opts.tiBag, 4);
  const yongLines = pick(opts.yongBag, 3);
  let text = [
    '【类象摘录】',
    `体卦${opts.ti}：${tiLines.join('；') || '（无）'}`,
    `用卦${opts.yong}：${yongLines.join('；') || '（无）'}`,
  ].join('\n');
  if (text.length > 300) {
    text = text.slice(0, 297) + '…';
  }
  return text;
}

export function isLiuXiangEmpty(bag: LiuxiangBag): boolean {
  return !bag || Object.keys(bag).length === 0;
}
