/** 档案关系细码（规格 §12.3.2） */

export type RelLevel = 'self' | 'blood' | 'partner' | 'social' | 'temp' | 'other';

export type RelCode =
  | 'self'
  | 'father'
  | 'mother'
  | 'sibling'
  | 'child'
  | 'other_kin'
  | 'spouse'
  | 'partner'
  | 'friend'
  | 'close_friend'
  | 'colleague'
  | 'boss'
  | 'subordinate'
  | 'classmate'
  | 'teacher'
  | 'neighbor'
  | 'acquaintance'
  | 'stranger'
  | 'one_off'
  | 'online'
  | 'other';

export const REL_LABEL: Record<RelCode, string> = {
  self: '本人',
  father: '父',
  mother: '母',
  sibling: '兄弟姐妹',
  child: '子女',
  other_kin: '其他亲属',
  spouse: '配偶',
  partner: '伴侣',
  friend: '朋友',
  close_friend: '挚友',
  colleague: '同事',
  boss: '上级',
  subordinate: '下属',
  classmate: '同学',
  teacher: '师长',
  neighbor: '邻里',
  acquaintance: '相识',
  stranger: '陌生人',
  one_off: '一卦之缘',
  online: '网友',
  other: '其他',
};

export const REL_LEVEL: Record<RelCode, RelLevel> = {
  self: 'self',
  father: 'blood',
  mother: 'blood',
  sibling: 'blood',
  child: 'blood',
  other_kin: 'blood',
  spouse: 'partner',
  partner: 'partner',
  friend: 'social',
  close_friend: 'social',
  colleague: 'social',
  boss: 'social',
  subordinate: 'social',
  classmate: 'social',
  teacher: 'social',
  neighbor: 'social',
  acquaintance: 'social',
  stranger: 'temp',
  one_off: 'temp',
  online: 'temp',
  other: 'other',
};

export function relZh(code: string | undefined): string {
  if (!code) return '';
  return REL_LABEL[code as RelCode] ?? code;
}

export type PersonKind = 'self' | 'family' | 'friend' | 'stranger' | 'other';

export type ProfileInfo = {
  name: string;
  kind: PersonKind;
  relCode: RelCode;
  label?: string;
  closeness?: number;
  stage?: string;
  cares?: string;
  workStyle?: string;
  nature?: string;
  taboo?: string;
};

export type RelationEdge = {
  id: string;
  fromId: string;
  toId: string;
  relCode: RelCode;
  label?: string;
  closeness?: number;
  note?: string;
};

/** 亲疏 1–5 的中文档位（只影响语气措辞与图谱连线，不影响算式） */
export const CLOSENESS_LABEL: Record<number, string> = {
  1: '一面之缘',
  2: '点头之交',
  3: '常来常往',
  4: '亲近',
  5: '至亲',
};

/** 亲疏数值 → 中文（缺省 3；越界夹紧） */
export function closenessZh(n: number | null | undefined, dflt = 3): string {
  const v = Math.min(5, Math.max(1, Math.round(n ?? dflt)));
  return CLOSENESS_LABEL[v] ?? CLOSENESS_LABEL[3]!;
}

/** 关系分组（表单下拉用；与 REL_LEVEL 同源） */
export const REL_GROUPS: Array<{ level: RelLevel; label: string; codes: RelCode[] }> = [
  { level: 'self', label: '自属', codes: ['self'] },
  { level: 'blood', label: '血缘', codes: ['father', 'mother', 'sibling', 'child', 'other_kin'] },
  { level: 'partner', label: '伴侣', codes: ['spouse', 'partner'] },
  {
    level: 'social',
    label: '社会',
    codes: ['close_friend', 'friend', 'colleague', 'boss', 'subordinate', 'classmate', 'teacher', 'neighbor', 'acquaintance'],
  },
  { level: 'temp', label: '临时', codes: ['stranger', 'one_off', 'online'] },
  { level: 'other', label: '其他', codes: ['other'] },
];
