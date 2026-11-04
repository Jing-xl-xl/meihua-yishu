/** 画像六维（规格 §6.2b）· 前后端同公式单源 */

export type ProfileAxes = {
  focus: number;
  lost: number;
  work: number;
  brief: number;
  feedback: number;
  params: number;
};

export type ProfileCaseInput = {
  question?: string;
  category?: string;
  numbers?: number[];
  timeLocal?: string;
};

export type ProfileCaseLite = {
  verdict?: unknown;
  input: ProfileCaseInput;
};

export function isDoneCase(c: ProfileCaseLite): boolean {
  return c.verdict != null;
}

export function computeProfileAxes(
  done: Array<ProfileCaseLite & { id?: string }>,
  feedbackCaseIds: Set<string>,
): ProfileAxes {
  const n = done.length;
  const pct = (x: number) => (n === 0 ? 0 : Math.round((x / n) * 100));
  const qtext = (c: ProfileCaseLite) =>
    `${c.input.category ?? ''}${c.input.question ?? ''}`;
  const isLost = (c: ProfileCaseLite) =>
    /寻物|找|丢|失物|忘带|不见/.test(qtext(c));
  const isWork = (c: ProfileCaseLite) =>
    /事业|工作|面试|升职|跳槽|运势|考|求职/.test(qtext(c));

  let top1 = 0;
  const cat: Record<string, number> = {};
  for (const c of done) {
    const k = c.input.category || '未分类';
    cat[k] = (cat[k] ?? 0) + 1;
    top1 = Math.max(top1, cat[k]!);
  }
  const qs = done.map((c) => c.input.question ?? '').filter(Boolean);
  const avg = qs.length
    ? qs.reduce((s, x) => s + x.length, 0) / qs.length
    : 20;
  const brief = Math.round(
    Math.max(0, Math.min(100, 100 - ((avg - 15) / 25) * 100)),
  );
  const params = done.filter(
    (c) =>
      (c.input.numbers && c.input.numbers.length > 0) ||
      Boolean(c.input.timeLocal),
  ).length;

  return {
    focus: pct(top1),
    lost: pct(done.filter(isLost).length),
    work: pct(done.filter(isWork).length),
    brief,
    feedback: pct(feedbackCaseIds.size),
    params: pct(params),
  };
}

export function isAxesEmpty(a?: Partial<ProfileAxes> | null): boolean {
  if (!a) return true;
  const keys: Array<keyof ProfileAxes> = [
    'focus',
    'lost',
    'work',
    'brief',
    'feedback',
    'params',
  ];
  return keys.every((k) => !Number(a[k]));
}
