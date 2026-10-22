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

/** 枚举 → 显示；禁止恐吓词（对齐 W4） */
export const GRADE_LABEL: Record<string, string> = {
  great: '上吉',
  good: '吉',
  neutral: '平',
  bad: '凶 · 宜守',
  terrible: '不利 · 宜慎',
};

export function gradeLabel(g: string | undefined): string {
  return GRADE_LABEL[g ?? ''] ?? g ?? '平';
}

export function gradeClass(g: string | undefined): string {
  return `grade-badge grade-${g ?? 'neutral'}`;
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
