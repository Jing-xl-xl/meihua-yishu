import { LlmError } from '@meihua/shared';

/** 跳过字符串字面量的括号平衡扫描 */
function extractBalanced(src: string, open: string, close: string): string | null {
  let start = -1;
  let depth = 0;
  let inStr = false;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        inStr = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === open) {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === close && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        return src.slice(start, i + 1);
      }
    }
  }
  return null;
}

function tryParse(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * 裸 JSON → 去围栏 → 平衡块。
 * 失败抛 LLM_BAD_JSON（由调用方决定是否捕获）。
 */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) {
    const inner = tryParse(fence[1]!.trim());
    if (inner !== undefined) return inner;
  }

  const obj = extractBalanced(trimmed, '{', '}');
  if (obj) {
    const v = tryParse(obj);
    if (v !== undefined) return v;
  }
  const arr = extractBalanced(trimmed, '[', ']');
  if (arr) {
    const v = tryParse(arr);
    if (v !== undefined) return v;
  }

  throw new LlmError('LLM_BAD_JSON', 'response is not valid JSON');
}

/** 尽力解析，失败返回 undefined，不抛错 */
export function tryParseJsonText(text: string): unknown {
  try {
    return parseJsonText(text);
  } catch {
    return undefined;
  }
}
