import { LlmError } from '@meihua/shared';

import { tryParseJsonText } from './parse';
import type {
  FetchLike,
  LLMProvider,
  StreamChatRequest,
  StreamChatResult,
} from './types';

type AnthropicCfg = {
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

export function createAnthropic(cfg: AnthropicCfg): LLMProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    id: 'anthropic',
    async streamChat(req: StreamChatRequest): Promise<StreamChatResult> {
      if (!cfg.apiKey) {
        throw new LlmError('NO_API_KEY', 'missing api key');
      }
      const timeoutMs = req.timeoutMs ?? cfg.timeoutMs ?? 60_000;
      const body = {
        model: cfg.model,
        system: req.system,
        messages: req.messages,
        max_tokens: req.maxTokens ?? cfg.maxTokens ?? 4096,
        temperature: req.temperature ?? cfg.temperature,
      };

      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = req.signal
        ? AbortSignal.any([req.signal, timeoutSignal])
        : timeoutSignal;

      let res: Response;
      try {
        res = await doFetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': cfg.apiKey!,
            'anthropic-version': '2023-06-01',
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
        throw new LlmError('LLM_UNAVAILABLE', 'network unavailable');
      }

      const bodyText = await res.text();
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new LlmError('LLM_UNAUTHORIZED', 'unauthorized');
        }
        if (res.status === 429) {
          throw new LlmError(
            'LLM_RATE_LIMIT',
            'rate limited',
            parseRetryAfter(res.headers),
          );
        }
        throw new LlmError('LLM_HTTP_ERROR', `http ${res.status}`);
      }

      let parsed: {
        model?: string;
        content?: { type: string; text?: string }[];
      };
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        throw new LlmError('LLM_BAD_JSON', 'invalid http json body');
      }
      const text = (parsed.content ?? [])
        .map((c) => c.text ?? '')
        .join('');
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
