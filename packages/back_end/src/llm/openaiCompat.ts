import { LlmError } from '@meihua/shared';

import { tryParseJsonText } from './parse';
import type {
  FetchLike,
  LLMProvider,
  StreamChatRequest,
  StreamChatResult,
} from './types';

type OpenAiCfg = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

function parseRetryAfter(h: Headers): number | undefined {
  const v = h.get('retry-after');
  if (!v) return undefined;
  const sec = Number(v);
  if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
  return undefined;
}

async function mapHttpError(
  res: Response,
  bodyText: string,
): Promise<never> {
  if (res.status === 401 || res.status === 403) {
    throw new LlmError('LLM_UNAUTHORIZED', 'unauthorized');
  }
  if (res.status === 429) {
    let retryAfterMs = parseRetryAfter(res.headers);
    try {
      const body = JSON.parse(bodyText) as {
        retryAfterMs?: number;
        retry_after?: number;
      };
      if (retryAfterMs == null && typeof body.retryAfterMs === 'number') {
        retryAfterMs = body.retryAfterMs;
      }
      if (retryAfterMs == null && typeof body.retry_after === 'number') {
        retryAfterMs = body.retry_after * 1000;
      }
    } catch {
      /* ignore */
    }
    throw new LlmError('LLM_RATE_LIMIT', 'rate limited', retryAfterMs);
  }
  throw new LlmError('LLM_HTTP_ERROR', `http ${res.status}`);
}

export function createOpenAiCompat(cfg: OpenAiCfg): LLMProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    id: 'openai-compat',
    async streamChat(req: StreamChatRequest): Promise<StreamChatResult> {
      if (!cfg.apiKey) {
        throw new LlmError('NO_API_KEY', 'missing api key');
      }
      const timeoutMs = req.timeoutMs ?? cfg.timeoutMs ?? 60_000;
      const messages = [
        ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
        ...req.messages,
      ];
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages,
        temperature: req.temperature ?? cfg.temperature,
        max_tokens: req.maxTokens ?? cfg.maxTokens,
      };
      if (req.jsonSchema) {
        body.response_format = { type: 'json_object' };
      }

      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = req.signal
        ? AbortSignal.any([req.signal, timeoutSignal])
        : timeoutSignal;

      let res: Response;
      try {
        res = await doFetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'TimeoutError') {
          throw new LlmError('LLM_TIMEOUT', 'timeout');
        }
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw new LlmError('LLM_ABORT', 'aborted');
        }
        // fetch 网络错误（DNS/断网等）
        throw new LlmError('LLM_UNAVAILABLE', 'network unavailable');
      }

      const bodyText = await res.text();
      if (!res.ok) {
        await mapHttpError(res, bodyText);
      }

      let parsed: {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        throw new LlmError('LLM_BAD_JSON', 'invalid http json body');
      }
      const text = parsed.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) {
        throw new LlmError('LLM_EMPTY_RESPONSE', 'empty content');
      }
      return {
        text,
        json: tryParseJsonText(text),
        raw: parsed,
        model: parsed.model ?? cfg.model,
      };
    },
  };
}
