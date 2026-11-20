/** 画像六维（规格 §6.2b）· 性格与关切 · 前后端同公式 */

export type ProfileAxes = {
  social: number;
  caution: number;
  agency: number;
  explore: number;
  home: number;
  mood: number;
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

const WORDS: Record<keyof ProfileAxes, RegExp> = {
  social: /聚会|人际|同事|朋友|拜访|面试|合作|社交|见人/,
  caution: /顺利|稳当|妥当|稳妥|有没有问题|安全|放心|别出错|稳妥/,
  agency: /怎么办|要准备什么|步骤|怎么做|如何做|要做什么|准备/,
  explore: /出行|旅行|外地|新机会|转机|学习|出远门|换|变动/,
  home: /找|丢|失物|不见|家里|家宅|车票|日程|考试|常放|身边/,
  mood: /慌|急|紧张|担心|尴尬|压力|焦|悬心|没底|害怕/,
};

const WEIGHT_PRIMARY = 1;
const WEIGHT_SECONDARY = 0.5;

function classify(
  text: string,
): { primary?: keyof ProfileAxes; secondary?: keyof ProfileAxes } {
  const scores: Array<{ key: keyof ProfileAxes; n: number }> = (
    Object.keys(WORDS) as Array<keyof ProfileAxes>
  ).map((key) => ({
    key,
    n: (text.match(WORDS[key]) ?? []).length,
  }));
  scores.sort((a, b) => b.n - a.n);
  const top = scores[0]!;
  const second = scores[1]!;
  if (!top.n) return {};
  return {
    primary: top.key,
    secondary: second.n ? second.key : undefined,
  };
}

export function computeProfileAxes(
  done: Array<ProfileCaseLite & { id?: string }>,
  _feedbackCaseIds?: Set<string>,
): ProfileAxes {
  const n = done.length;
  const acc: Record<keyof ProfileAxes, number> = {
    social: 0,
    caution: 0,
    agency: 0,
    explore: 0,
    home: 0,
    mood: 0,
  };
  let moodWords = 0;
  let totalChars = 0;

  for (const c of done) {
    const text = `${c.input.category ?? ''}${c.input.question ?? ''}`;
    totalChars += text.length;
    moodWords += (text.match(WORDS.mood) ?? []).length;
    const { primary, secondary } = classify(text);
    if (primary) acc[primary] += WEIGHT_PRIMARY;
    if (secondary) acc[secondary] += WEIGHT_SECONDARY;
  }

  const pct = (x: number) => (n === 0 ? 50 : Math.round((x / n) * 100));
  const mid = (v: number) => (v === 0 ? 50 : Math.min(100, v));

  // 心绪：按情绪词密度分档（定稿原式 ×80 在实际提问长度下恒贴 50，无可读差异；
  // 改为分档映射，保持「0–100 / 无信号=50 / 不造假极端」的语义）
  const moodDensity = totalChars > 0 ? moodWords / totalChars : 0;
  const moodScore =
    n === 0 || totalChars === 0 || moodWords === 0
      ? 50
      : moodDensity < 0.005
        ? 62
        : moodDensity < 0.015
          ? 74
          : 86;

  return {
    social: mid(pct(acc.social)),
    caution: mid(pct(acc.caution)),
    agency: mid(pct(acc.agency)),
    explore: mid(pct(acc.explore)),
    home: mid(pct(acc.home)),
    mood: moodScore,
  };
}

export function isAxesEmpty(a?: Partial<ProfileAxes> | null): boolean {
  if (!a) return true;
  const keys: Array<keyof ProfileAxes> = [
    'social',
    'caution',
    'agency',
    'explore',
    'home',
    'mood',
  ];
  return keys.every((k) => !Number(a[k]));
}

/** 雷达出图门槛（规格 §6.2b） */
export const RADAR_MIN_CASES = 8;

/** 人设四栏句库（规格 §6.2）· 稍文白话 */
export type ProfileCopy = {
  nature: string;
  desire: string;
  style: string;
  with: string;
  sketch: string;
};

export function buildProfileCopy(axes: ProfileAxes): ProfileCopy {
  const rank = (
    Object.entries(axes) as Array<[keyof ProfileAxes, number]>
  ).sort((a, b) => b[1] - a[1]);
  const top = rank[0];
  const second = rank[1];
  const hasHigh = (top?.[1] ?? 0) >= 55;

  const natureParts: string[] = [];
  const pushNature = (k: keyof ProfileAxes, v: number) => {
    if (v < 55) return;
    if (k === 'caution') natureParts.push('其人持重，凡事先问稳妥');
    if (k === 'social') natureParts.push('心多向人际场面上走，喜有人商量');
    if (k === 'agency') natureParts.push('务实肯行，好问怎么做');
    if (k === 'explore') natureParts.push('眼界朝外，留意机缘与远行');
    if (k === 'home') natureParts.push('情系身边人与物，求安稳无失');
    if (k === 'mood') natureParts.push('心中牵挂略多，言语间常带分寸');
  };
  if (top) pushNature(top[0], top[1]);
  if (second && second[0] !== top?.[0]) pushNature(second[0], second[1]);

  const nature = hasHigh
    ? natureParts.join('；') + '。'
    : '其人性情平和，无甚偏倾，遇事多随分而安。';

  const desireBits: string[] = [];
  if (axes.explore >= 55) desireBits.push('所求多在出行、机会与前程');
  if (axes.home >= 55) desireBits.push('所念多在安稳、身边人和事');
  if (axes.social >= 55) desireBits.push('所问多关于人与场合');
  const desire = desireBits.length
    ? desireBits.join('；') + '。'
    : '所求多在日常平稳，无甚奇想。';

  let style = '处事尚平，无大起大落之势。';
  if (axes.agency >= 55 && axes.caution >= 55) {
    style = '遇事先理清再动，好有准备，不喜冒失。';
  } else if (axes.agency >= 55) {
    style = '偏向先把事做起来，边走边调。';
  } else if (axes.caution >= 55) {
    style = '宁缓勿急，务求少错。';
  }

  const withBits: string[] = [];
  if (axes.caution >= 55) withBits.push('先给一句定心话，再补条件');
  if (axes.mood >= 55) withBits.push('多用「多半、大致」，少作断言');
  if (axes.agency >= 55) withBits.push('宜附可行步骤');
  if (axes.social >= 55) withBits.push('可兼提身边人的看法');
  const withText = withBits.length
    ? withBits.join('；') + '。'
    : '平实直说即可，勿故弄玄虚。';

  let sketch = '其人平实，所求无非稳妥。';
  if (axes.caution >= 55 && axes.home >= 55) {
    sketch = '其人持重，所求安稳，行事宜缓不宜急。';
  } else if (axes.caution >= 55) {
    sketch = '其人持重，谋定而后动。';
  } else if (axes.agency >= 55) {
    sketch = '其人务实，好问可行之策。';
  } else if (axes.explore >= 55) {
    sketch = '其人多思远行与机缘。';
  } else if (!hasHigh) {
    sketch = '其人性情平和，无甚偏倾。';
  }

  return { nature, desire, style, with: withText, sketch };
}
