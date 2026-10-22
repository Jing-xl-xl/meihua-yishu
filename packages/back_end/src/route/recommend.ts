import type { CastMethod, Gua } from '@meihua/shared';
import {
  FANGWEI_TO_GUA,
  PERSON_TO_GUA,
  isGuaId,
} from '@meihua/shared';

import type { LLMProvider } from '../llm/types';
import { tryParseJsonText } from '../llm/parse';

export type RouteMode = 'method' | 'parseDirection';

export type RouteCategory =
  | '问卦'
  | '寻物'
  | '事业'
  | '婚恋'
  | '健康'
  | '出行'
  | '学业'
  | '其他';

export type Clarify = { question: string; options: string[] };

export type RouteResult = {
  mode: 'method';
  method: CastMethod;
  category: RouteCategory;
  reason: string;
  confidence: 'high' | 'mid' | 'low';
  routeRounds: number;
  missing: string[];
  clarify?: Clarify | null;
  source: 'llm' | 'rule';
};

export type ParseDirectionResult = {
  mode: 'parseDirection';
  objectGua: Gua;
  directionGua: Gua;
  labels: { object: string; direction: string };
  reason: string;
  category: RouteCategory;
  source: 'llm' | 'rule';
};

const METHODS: CastMethod[] = [
  'number1',
  'number2',
  'number3',
  'datetime',
  'objectCount',
  'sound',
  'text',
  'measureZhangChi',
  'measureChiCun',
  'direction',
];

const CATEGORIES: RouteCategory[] = [
  '问卦',
  '寻物',
  '事业',
  '婚恋',
  '健康',
  '出行',
  '学业',
  '其他',
];

function guessCategory(q: string): RouteCategory {
  if (/找|寻|丢|失|不见/.test(q)) return '寻物';
  if (/工作|事业|升职|跳槽|面试|财|生意|投资/.test(q)) return '事业';
  if (/婚|恋|爱|对象|复合|情感/.test(q)) return '婚恋';
  if (/病|健康|身体|医/.test(q)) return '健康';
  if (/行|出|旅|迁|搬家|方位/.test(q)) return '出行';
  if (/学|考试|考|业|论文/.test(q)) return '学业';
  return '问卦';
}

function ruleMethod(
  q: string,
  input: { numbers?: number[]; timeLocal?: string; directionNote?: string; text?: string; count?: number },
): { method: CastMethod; missing: string[] } {
  const n = input.numbers?.length ?? 0;
  if (n === 3) return { method: 'number3', missing: [] };
  if (n === 2) return { method: 'number2', missing: [] };
  if (n === 1) return { method: 'number1', missing: [] };
  if (input.directionNote?.trim()) return { method: 'direction', missing: [] };
  if (input.timeLocal) return { method: 'datetime', missing: [] };
  if (input.text?.trim()) return { method: 'text', missing: [] };
  if (input.count != null) return { method: 'objectCount', missing: [] };
  if (/找|寻|丢|失/.test(q)) return { method: 'objectCount', missing: ['数量'] };
  if (/何时|几时|哪天|时间|年月日时/.test(q)) {
    return { method: 'datetime', missing: ['时间'] };
  }
  if (/字|姓名|签/.test(q)) return { method: 'text', missing: ['文字'] };
  if (/方|位|东南|西北|老人|往/.test(q)) {
    return { method: 'direction', missing: ['物象/方位'] };
  }
  return { method: 'datetime', missing: ['时间'] };
}

function ruleParseDirection(
  note: string,
): { objectGua: Gua; directionGua: Gua; labels: { object: string; direction: string } } | null {
  const t = note.replace(/\s+/g, '');
  let objectGua: Gua | null = null;
  let objectLabel = '';
  for (const [k, v] of Object.entries(PERSON_TO_GUA)) {
    if (t.includes(k)) {
      objectGua = v;
      objectLabel = k;
      break;
    }
  }
  let directionGua: Gua | null = null;
  let directionLabel = '';
  // 最长方位优先，避免「东南」被「南」误匹配
  const fangEntries = Object.entries(FANGWEI_TO_GUA).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [k, v] of fangEntries) {
    if (t.includes(k)) {
      directionGua = v;
      directionLabel = k;
      break;
    }
  }
  if (!objectGua || !directionGua) return null;
  return {
    objectGua,
    directionGua,
    labels: { object: objectLabel, direction: directionLabel },
  };
}

const METHOD_SYSTEM = `你是梅花易数起卦法顾问。只输出 JSON，禁止其它文本。
字段：method, category, reason, confidence, missing, clarify
method 只能是：number1,number2,number3,datetime,objectCount,sound,text,measureZhangChi,measureChiCun,direction
category 只能是：问卦,寻物,事业,婚恋,健康,出行,学业,其他
confidence 只能是：high,mid,low
reason 不超过40字现代白话，无恐吓绝对化。
缺参数放 missing 数组；需要澄清时 clarify={question,options}，否则 clarify=null。
依据问题语义推荐，不要回声用户已选方法。`;

const DIR_SYSTEM = `你是梅花易数取象助手。只输出 JSON。
字段：objectGua, directionGua, labels, reason, category
objectGua/directionGua 只能是：qian,dui,li,zhen,xun,kan,gen,kun
方位映射：南li 北kan 东zhen 西dui 东南xun 西北qian 东北gen 西南kun
人物物象参考：老人qian 少女dui 长男zhen 中男kan 少男gen 长女xun 中女li 母kun
reason≤40字。禁止输出爻位吉凶应期。`;

function clampMethod(v: unknown): CastMethod | null {
  return typeof v === 'string' && (METHODS as string[]).includes(v)
    ? (v as CastMethod)
    : null;
}

function clampCategory(v: unknown): RouteCategory {
  return typeof v === 'string' && (CATEGORIES as string[]).includes(v)
    ? (v as RouteCategory)
    : '问卦';
}

function clampConfidence(v: unknown): 'high' | 'mid' | 'low' {
  return v === 'high' || v === 'low' ? v : 'mid';
}

export async function recommendMethod(opts: {
  llm?: LLMProvider;
  offline: boolean;
  routeRounds: number;
  question: string;
  contextNote?: string;
  directionNote?: string;
  answer?: string;
  currentMethod?: string;
  numbers?: number[];
  timeLocal?: string;
  text?: string;
  count?: number;
}): Promise<Omit<RouteResult, 'mode'>> {
  const q = opts.question.slice(0, 500);
  const category = guessCategory(q);
  const maxRound = 2;
  const forceRule = opts.offline || opts.routeRounds > maxRound;

  if (!forceRule && opts.llm) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await opts.llm.streamChat({
          system: METHOD_SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                `问题：${q}`,
                opts.contextNote ? `背景：${opts.contextNote}` : '',
                opts.directionNote ? `方位描述：${opts.directionNote}` : '',
                opts.answer ? `澄清答复：${opts.answer}` : '',
                opts.currentMethod ? `用户当前手选：${opts.currentMethod}` : '',
                `routeRounds：${opts.routeRounds}（≤2 轮往返）`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        });
        const parsed = tryParseJsonText(r.text) as Record<string, unknown> | null;
        if (parsed && clampMethod(parsed.method)) {
          const missing = Array.isArray(parsed.missing)
            ? parsed.missing.map(String).slice(0, 6)
            : [];
          let clarify: Clarify | null = null;
          const c = parsed.clarify as Clarify | null | undefined;
          if (c && typeof c.question === 'string' && opts.routeRounds < maxRound) {
            clarify = {
              question: c.question.slice(0, 120),
              options: Array.isArray(c.options)
                ? c.options.map(String).slice(0, 4)
                : [],
            };
          }
          return {
            method: clampMethod(parsed.method)!,
            category: clampCategory(parsed.category ?? category),
            reason: String(parsed.reason ?? '').slice(0, 80),
            confidence: clampConfidence(parsed.confidence),
            routeRounds: opts.routeRounds,
            missing,
            clarify,
            source: 'llm',
          };
        }
      } catch {
        /* retry / rule */
      }
    }
  }

  const rule = ruleMethod(q, opts);
  return {
    method: rule.method,
    category,
    reason: `离线规则：按问题与已填字段推断为${rule.method}`,
    confidence: 'low',
    routeRounds: opts.routeRounds,
    missing: rule.missing,
    clarify: null,
    source: 'rule',
  };
}

export async function parseDirectionNote(opts: {
  llm?: LLMProvider;
  offline: boolean;
  directionNote: string;
}): Promise<Omit<ParseDirectionResult, 'mode'>> {
  const note = opts.directionNote.trim();
  const category = guessCategory(note);

  const ruleHit = ruleParseDirection(note);
  if (opts.offline || !opts.llm) {
    if (ruleHit) {
      return {
        ...ruleHit,
        reason: `离线规则：${ruleHit.labels.object}→${ruleHit.objectGua}，${ruleHit.labels.direction}→${ruleHit.directionGua}`,
        category,
        source: 'rule',
      };
    }
    return {
      objectGua: 'qian',
      directionGua: 'xun',
      labels: { object: '手选', direction: '手选' },
      reason: '离线规则无法解析，请手选物象/方位卦',
      category,
      source: 'rule',
    };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await opts.llm.streamChat({
        system: DIR_SYSTEM,
        messages: [{ role: 'user', content: `描述：${note.slice(0, 300)}` }],
      });
      const parsed = tryParseJsonText(r.text) as Record<string, unknown> | null;
      const og = parsed?.objectGua;
      const dg = parsed?.directionGua;
      if (parsed && isGuaId(og) && isGuaId(dg)) {
        const labels = (parsed.labels ?? {}) as { object?: string; direction?: string };
        return {
          objectGua: og,
          directionGua: dg,
          labels: {
            object: String(labels.object ?? note.slice(0, 8)),
            direction: String(labels.direction ?? note.slice(0, 8)),
          },
          reason: String(parsed.reason ?? '').slice(0, 80),
          category: clampCategory(parsed.category ?? category),
          source: 'llm',
        };
      }
    } catch {
      /* retry */
    }
  }

  if (ruleHit) {
    return {
      ...ruleHit,
      reason: `规则兜底：${ruleHit.labels.object}/${ruleHit.labels.direction}`,
      category,
      source: 'rule',
    };
  }
  return {
    objectGua: 'qian',
    directionGua: 'xun',
    labels: { object: '手选', direction: '手选' },
    reason: '解析失败，请手选卦名',
    category,
    source: 'rule',
  };
}
