export type Accuracy = 'yes' | 'partial' | 'no';

export type StatsResult = {
  total: number;
  filled: number;
  accuracyDist: { yes: number; partial: number; no: number };
  /** filled=0 → null；公式 (yes*1 + partial*0.5 + no*0) / filled */
  composite: number | null;
  byMethod: Record<string, number>;
  byDeviationStep: Record<string, number>;
  byCategory: Record<string, number>;
};

export function computeStats(rows: {
  accuracy: Accuracy | null;
  cast_method: string | null;
  category?: string | null;
  deviation_steps?: number[] | null;
}[]): StatsResult {
  let yes = 0;
  let partial = 0;
  let no = 0;
  const byMethod: Record<string, number> = {};
  const byDeviationStep: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    if (r.cast_method) {
      byMethod[r.cast_method] = (byMethod[r.cast_method] ?? 0) + 1;
    }
    if (r.category) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    }
    for (const s of r.deviation_steps ?? []) {
      const k = String(s);
      byDeviationStep[k] = (byDeviationStep[k] ?? 0) + 1;
    }
    if (r.accuracy === 'yes') yes++;
    else if (r.accuracy === 'partial') partial++;
    else if (r.accuracy === 'no') no++;
  }
  const filled = yes + partial + no;
  const composite =
    filled === 0 ? null : (yes * 1 + partial * 0.5 + no * 0) / filled;
  return {
    total: rows.length,
    filled,
    accuracyDist: { yes, partial, no },
    composite,
    byMethod,
    byDeviationStep,
    byCategory,
  };
}
