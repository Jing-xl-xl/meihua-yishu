/** 显示层文案映射（不改 shared 枚举） */

export const STEP_TITLES: Record<number, string> = {
  1: '排盘',
  2: '观卦名',
  3: '定体用',
  4: '五行生克',
  5: '衰旺',
  6: '卦辞爻辞',
  7: '类象落地',
  8: '互变参断',
  9: '定应期',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  confirmed: '已确认',
  revised: '已修正',
  failed: '失败',
  skipped_by_method: '古法不取',
  need_key: '需配置 Key',
};

/** 枚举 → 签头/badge；与 SignBoard 单源（规格 v2 §5.3） */
export const GRADE_LABEL: Record<string, string> = {
  great: '大吉',
  good: '吉',
  neutral: '平',
  bad: '凶',
  terrible: '大凶',
};

/** 动爻 1–6 → 签面汉字序数 */
export const YAO_ZH = ['一', '二', '三', '四', '五', '六'] as const;

export function yaoZh(pos: number | undefined): string {
  if (pos == null || pos < 1 || pos > 6) return '';
  return YAO_ZH[pos - 1] ?? '';
}

export function movingYaoLabel(pos: number | undefined): string {
  const z = yaoZh(pos);
  return z ? `动${z}` : '';
}

export function gradeLabel(g: string | undefined): string {
  return GRADE_LABEL[g ?? ''] ?? g ?? '平';
}

export function gradeClass(g: string | undefined): string {
  return `grade-badge grade-${g ?? 'neutral'}`;
}

/** 问题摘要：≤20 字，超出加省略号（规格 §3.9） */
export function questionBrief(q: string | undefined, max = 20): string {
  const t = (q ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function isYangLine(v: number): boolean {
  return v === 7 || v === 9;
}

export function formulaSummary(
  formula: { label: string; expr: string; note?: string }[],
): string {
  return formula
    .map((f) => (f.note ? `${f.label}:${f.expr}（${f.note}）` : `${f.label}:${f.expr}`))
    .join(' · ');
}
