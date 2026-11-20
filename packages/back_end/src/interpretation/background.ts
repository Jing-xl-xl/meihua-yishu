/**
 * 背景澄清：槽位化提问（B3）
 * 规则选槽 → 大肥鱼口吻措辞；一次只问一个；每例最多 2 个（步 3 / 步 7）。
 * 槽位只影响「解释与追问」，不改卦与算式（AGENTS.md §3）。
 */

export type AskSlot =
  | 'relation'
  | 'stage'
  | 'object'
  | 'intent'
  | 'timing'
  | 'expectation'
  | 'urgency'
  | 'worry';

export type AskSpec = {
  stepId: 3 | 7;
  slot: AskSlot;
  /** 大肥鱼口吻的问题 */
  question: string;
  /** 为什么问（说人话，降低被盘问感） */
  why: string;
  /** 可直接点的短回答 */
  suggested: string[];
  /** 「例：…」提示句 */
  examples: string[];
};

type AskCtx = { question: string; category?: string };

function hasHit(ctx: AskCtx, keys: string[]): boolean {
  const q = ctx.question || '';
  const cat = ctx.category ?? '';
  return keys.some((k) => cat.includes(k) || q.includes(k));
}

type Pack = {
  keys: string[];
  s3: Omit<AskSpec, 'stepId' | 'slot'> & { slot: AskSlot };
  s7: Omit<AskSpec, 'stepId' | 'slot'> & { slot: AskSlot };
};

const PACKS: Pack[] = [
  {
    keys: ['找', '寻', '丢', '失', '钥匙', '手机'],
    s3: {
      slot: 'object',
      question: '丢的是常用物，还是随手带的东西？大概什么时候发现不见的？',
      why: '问这个，是为了看「东西还在不在近处」，好定往哪找；不改吉凶。',
      suggested: ['常用物', '随手带的', '今天才发现'],
      examples: ['例：钥匙，常用物，昨晚还在。', '例：耳机，随手带的，今天早上发现没了。'],
    },
    s7: {
      slot: 'urgency',
      question: '你更急找回，还是更想知道大概去向？',
      why: '问这个，是为了把「找」还是「等」说清楚；两句都算。',
      suggested: ['更急找回', '想知道去向', '都行'],
      examples: ['例：急着用，先找。', '例：不急着用，知道大概在哪就行。'],
    },
  },
  {
    keys: ['面试', '工作', '事业', '升职', '跳槽', '财', '生意'],
    s3: {
      slot: 'stage',
      question: '现在准备到哪一步了？最担心哪一环？',
      why: '问这个，是为了看这卦是「事来就我」，还是得自己去够；不改档位。',
      suggested: ['准备充分', '一般', '还没开始'],
      examples: ['例：材料都齐了，怕临场。', '例：还没怎么准备，先问问。'],
    },
    s7: {
      slot: 'expectation',
      question: '你更在意过程发挥，还是最终结果？',
      why: '问这个，是为了把话说到你在意的点上，别答偏。',
      suggested: ['更在意结果', '更在意过程', '都在意'],
      examples: ['例：结果最重要，过程差点没事。', '例：先别失常，结果随缘。'],
    },
  },
  {
    keys: ['婚', '恋', '爱', '对象', '复合', '感情'],
    s3: {
      slot: 'intent',
      question: '你是想问能不能发展，还是想问要不要继续？',
      why: '问这个，是为了定体用的落点；不是替你拿主意。',
      suggested: ['问发展', '问要不要继续', '问对方态度'],
      examples: ['例：想看看有没有戏。', '例：有点累，想知道还值不值得。'],
    },
    s7: {
      slot: 'expectation',
      question: '这事你最想确认哪一点：对方态度、时机，还是结果？',
      why: '问这个，是为了断语落在真正的问题上。',
      suggested: ['对方态度', '时机', '结果'],
      examples: ['例：就想知道对方怎么想。', '例：想知道什么时候有转机。'],
    },
  },
  {
    keys: ['病', '健康', '不适', '心惊', '身体', '睡眠', '医'],
    s3: {
      slot: 'timing',
      question: '是偶发，还是已经持续几天了？',
      why: '问这个，是为了看缓急；不给医疗判断，该看医生还是看医生。',
      suggested: ['偶发', '持续几天', '说不清'],
      examples: ['例：昨晚突然的。', '例：断断续续一周了。'],
    },
    s7: {
      slot: 'worry',
      question: '你更担心原因，还是更想知道什么时候能缓过来？',
      why: '问这个，是为了把话说在你在意的地方，不替你下诊断。',
      suggested: ['担心原因', '想知道何时缓解', '都担心'],
      examples: ['例：怕有什么没查出来。', '例：只想知道还要熬多久。'],
    },
  },
  {
    keys: ['出行', '旅', '迁', '搬家', '飞', '车', '远行'],
    s3: {
      slot: 'intent',
      question: '是问该不该去，还是问去了顺不顺？',
      why: '问这个，是为了定体用：你先动，还是事来应你。',
      suggested: ['该不该去', '去了顺不顺', '都有'],
      examples: ['例：在犹豫去不去。', '例：已经定了，问顺不顺。'],
    },
    s7: {
      slot: 'worry',
      question: '最顾虑的是安全、花费，还是时机？',
      why: '问这个，是为了把风险说到点上。',
      suggested: ['安全', '花费', '时机'],
      examples: ['例：主要怕路上不安全。', '例：怕白跑一趟。'],
    },
  },
];

const DEFAULT_PACK: Pack = {
  keys: [],
  s3: {
    slot: 'relation',
    question: '这是你自己要问，还是替别人问？',
    why: '问这个，是为了定体用（谁主谁客），不影响吉凶档位。',
    suggested: ['我自己', '替家人', '替朋友或旁观'],
    examples: ['例：我自己问。', '例：替我妈问。'],
  },
  s7: {
    slot: 'expectation',
    question: '你更关心结果，还是过程？',
    why: '问这个，是为了把断语说在你在意的地方。',
    suggested: ['结果', '过程', '都关心'],
    examples: ['例：就想要个结果。', '例：结果一般，主要想看过程怎么走。'],
  },
};

/** 选一个尚未问过的槽位；没有则 null */
export function pickBackgroundAsk(
  stepId: 3 | 7,
  ctx: AskCtx,
  askedSlots: AskSlot[],
): AskSpec | null {
  const pack = PACKS.find((p) => p.keys.some((k) => hasHit(ctx, [k]))) ?? DEFAULT_PACK;
  const picked = stepId === 3 ? pack.s3 : pack.s7;
  if (askedSlots.includes(picked.slot)) return null;
  return { stepId, ...picked };
}

/** 兜底问题（理论上不会用到；保持可跳过） */
export function fallbackAsk(stepId: 3 | 7): AskSpec {
  return {
    stepId,
    slot: stepId === 3 ? 'relation' : 'expectation',
    question:
      stepId === 3
        ? '我先多嘴问一句：这是你自己要问，还是替别人问？'
        : '你更关心结果，还是过程？',
    why: '问这个，是为了把体用与落点说准；不改卦与档位。',
    suggested: stepId === 3 ? ['我自己', '替别人'] : ['结果', '过程'],
    examples: ['例：我自己问。'],
  };
}
