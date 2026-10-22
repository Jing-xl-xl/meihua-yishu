import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  AnchorRef,
  Gua,
  HexagramData,
  JieqiMonthKey,
  KnowledgeMeta,
  TiYongRelation,
  WangShuaiEntry,
  WangShuaiMap,
} from '@meihua/shared';

export type KnowledgeIndex = {
  meta: KnowledgeMeta;
  hexagrams: HexagramData[];
  duanyu: { shengTi: Record<Gua, string>; keTi: Record<Gua, string> };
  tiyong: Record<TiYongRelation, string>;
  wangshuai: WangShuaiMap;
  shibazhan: { categories: string[] };
  dir: string;
};

type LazySlot = {
  loaded: boolean;
  data: unknown;
};

/** D-1 强载；D-2 惰性 */
export function loadKnowledge(dir: string): KnowledgeIndex {
  const read = (rel: string) =>
    JSON.parse(readFileSync(join(dir, rel), 'utf-8')) as unknown;

  const meta = read('meta.json') as KnowledgeMeta;
  const hexagrams = (
    read('structured/hexagrams.json') as { hexagrams: HexagramData[] }
  ).hexagrams;
  const duanyu = read('structured/duanyu.json') as KnowledgeIndex['duanyu'];
  const tiyongRaw = read('structured/tiyong.json') as Record<string, string>;
  const ws = read('structured/wangshuai.json') as {
    entries: WangShuaiMap;
  };
  const sb = read('structured/shibazhan.json') as {
    categories: string[];
  };

  const tiyong = {
    sheng: tiyongRaw.sheng!,
    ke: tiyongRaw.ke!,
    bi_he: tiyongRaw.bi_he!,
    xie: tiyongRaw.xie!,
    bei_ke: tiyongRaw.bei_ke!,
  } as Record<TiYongRelation, string>;

  return {
    meta,
    hexagrams,
    duanyu,
    tiyong,
    wangshuai: ws.entries,
    shibazhan: sb,
    dir,
  };
}

export function makeQuery(index: KnowledgeIndex) {
  const byKw = new Map(index.hexagrams.map((h) => [h.kingwen, h]));
  const byName = new Map<string, HexagramData>();
  for (const h of index.hexagrams) {
    byName.set(h.name, h);
    byName.set(h.fullName, h);
  }

  const lazy = new Map<string, LazySlot>();
  function lazyJson<T>(rel: string): T {
    let slot = lazy.get(rel);
    if (!slot) {
      slot = { loaded: false, data: null };
      lazy.set(rel, slot);
    }
    if (!slot.loaded) {
      const p = join(index.dir, rel);
      if (!existsSync(p)) {
        throw new Error(`knowledge file missing: ${rel}`);
      }
      slot.data = JSON.parse(readFileSync(p, 'utf-8')) as T;
      slot.loaded = true;
    }
    return slot.data as T;
  }

  return {
    meta: (): KnowledgeMeta => index.meta,

    hexagram(id: number | string): HexagramData {
      if (typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))) {
        const kw = typeof id === 'number' ? id : Number(id);
        const byNum = byKw.get(kw);
        if (byNum) return byNum;
      }
      const hit = byName.get(String(id));
      if (!hit) throw new Error(`hexagram not found: ${id}`);
      return hit;
    },

    lineText(kingwen: number, pos: number): string {
      const h = byKw.get(kingwen);
      if (!h) throw new Error(`hexagram ${kingwen} not found`);
      const ln = h.lines.find((l) => l.pos === pos);
      if (!ln) throw new Error(`line ${pos} not found`);
      return ln.text;
    },

    guaCi(kingwen: number): string {
      return this.hexagram(kingwen).guaCi;
    },

    shengTiDuanYu(gua: Gua): string {
      return index.duanyu.shengTi[gua];
    },

    keTiDuanYu(gua: Gua): string {
      return index.duanyu.keTi[gua];
    },

    tiyongDuan(relation: TiYongRelation): string {
      return index.tiyong[relation];
    },

    wangShuai(key: JieqiMonthKey): WangShuaiEntry {
      const e = index.wangshuai[key];
      if (!e) throw new Error(`wangshuai missing ${key}`);
      return e;
    },

    shiBaZhan(_category: string): string {
      return index.shibazhan.categories.join('、');
    },

    /** D-2 惰性 */
    liuXiang(gua: Gua): Record<string, string[]> {
      const all = lazyJson<Record<Gua, Record<string, string[]>>>(
        'graph/liuxiang.json',
      );
      return all[gua] ?? {};
    },

    anchor(id: string): AnchorRef {
      const map = lazyJson<Record<string, AnchorRef>>('corpus/anchors.json');
      const a = map[id];
      if (!a) throw new Error(`anchor not found: ${id}`);
      return a;
    },
  };
}

export type KnowledgeQuery = ReturnType<typeof makeQuery>;
