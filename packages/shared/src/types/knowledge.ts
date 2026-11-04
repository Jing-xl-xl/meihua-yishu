import type { Gua, JieqiMonthKey } from './base';

export type HexLineData = {
  pos: 1 | 2 | 3 | 4 | 5 | 6;
  yang: boolean;
  label: string;
  text: string;
};

export type HexagramData = {
  kingwen: number;
  /** 单名，如 大畜 */
  name: string;
  /** 全名，如 山天大畜；↔ HEXAGRAM_TABLE.name */
  fullName: string;
  upper: Gua;
  lower: Gua;
  gloss: string;
  guaCi: string;
  lines: HexLineData[];
  yongYao: string | null;
  notes?: { tixiang?: string; counter?: string };
  anchors?: string[];
};

export type WangShuaiEntry = {
  strong: Gua[];
  weak: Gua[];
};

/** 体用/生克；v2 码（规格 §5.1）：yong_ke=用克体，ti_ke=体克用 */
export type TiYongRelation = 'sheng' | 'bi_he' | 'xie' | 'yong_ke' | 'ti_ke';

export type KnowledgeMeta = {
  version: string;
  builtAt?: string;
  sourceHash?: string;
};

export type AnchorRef = {
  id: string;
  title: string;
  quote: string;
  sourcePath?: string;
};

export type WangShuaiMap = Record<JieqiMonthKey, WangShuaiEntry>;
