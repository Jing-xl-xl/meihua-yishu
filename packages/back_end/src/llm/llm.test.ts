import { describe, expect, it } from 'vitest';

import { LlmError, AppError } from '@meihua/shared';

import { parseJsonText, tryParseJsonText } from './parse';
import { MockProvider } from './mock';
import { createOpenAiCompat } from './openaiCompat';
import { createAnthropic } from './anthropic';
import { createProvider, hasApiKey } from './router';
import type { FetchLike } from './types';

describe('parseJsonText', () => {
  it('bare json', () => {
    expect(parseJsonText('{"a":1}')).toEqual({ a: 1 });
  });

  it('fenced json', () => {
    const t = '```json\n{"a":1}\n```';
    expect(parseJsonText(t)).toEqual({ a: 1 });
  });

  it('braces inside string', () => {
    expect(parseJsonText('{"a":"}"}')).toEqual({ a: '}' });
  });

  it('extract first object', () => {
    expect(parseJsonText('xx {"a":2} yy')).toEqual({ a: 2 });
  });

  it('bad json throws LLM_BAD_JSON', () => {
    expect(() => parseJsonText('not json')).toThrow(LlmError);
    try {
      parseJsonText('nope');
    } catch (e) {
      expect((e as AppError).code).toBe('LLM_BAD_JSON');
    }
    expect(tryParseJsonText('nope')).toBeUndefined();
  });
});

describe('MockProvider', () => {
  it('queue and calls', async () => {
    const m = new MockProvider();
    m.queueText('{"x":1}');
    m.queueText('{"x":2}');
    const a = await m.streamChat({ system: 's', messages: [] });
    const b = await m.streamChat({ system: 's2', messages: [{ role: 'user', content: 'q' }] });
    expect(a.json).toEqual({ x: 1 });
    expect(b.json).toEqual({ x: 2 });
    expect(m.calls).toHaveLength(2);
    expect(m.calls[1]!.messages[0]!.role).toBe('user');
  });

  it('failNext', async () => {
    const m = new MockProvider();
    m.failNext('NO_API_KEY');
    await expect(m.streamChat({ system: '', messages: [] })).rejects.toMatchObject({
      code: 'NO_API_KEY',
    });
    const ok = await m.streamChat({ system: '', messages: [] });
    expect(ok.text).toBeTruthy();
  });
});

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

describe('openaiCompat with fake fetch', () => {
  const base = { baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm' };

  it('200 + empty → EMPTY', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, { choices: [{ message: { content: '  ' } }] })) as FetchLike;
    const p = createOpenAiCompat({ ...base, fetchImpl });
    await expect(p.streamChat({ system: 's', messages: [] })).rejects.toMatchObject({
      code: 'LLM_EMPTY_RESPONSE',
    });
  });

  it('200 text', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, {
        model: 'm',
        choices: [{ message: { content: '{"a":1}' } }],
      })) as FetchLike;
    const p = createOpenAiCompat({ ...base, fetchImpl });
    const r = await p.streamChat({ system: 's', messages: [] });
    expect(r.json).toEqual({ a: 1 });
  });

  it('401 → UNAUTHORIZED', async () => {
    const fetchImpl = (async () => jsonResponse(401, 'no')) as FetchLike;
    const p = createOpenAiCompat({ ...base, fetchImpl });
    await expect(p.streamChat({ system: 's', messages: [] })).rejects.toMatchObject({
      code: 'LLM_UNAUTHORIZED',
    });
  });

  it('429 → RATE_LIMIT with retryAfter', async () => {
    const fetchImpl = (async () =>
      jsonResponse(429, 'slow', { 'retry-after': '2' })) as FetchLike;
    const p = createOpenAiCompat({ ...base, fetchImpl });
    await expect(p.streamChat({ system: 's', messages: [] })).rejects.toMatchObject({
      code: 'LLM_RATE_LIMIT',
      retryAfterMs: 2000,
    });
  });

  it('500 → HTTP_ERROR', async () => {
    const fetchImpl = (async () => jsonResponse(500, 'x')) as FetchLike;
    const p = createOpenAiCompat({ ...base, fetchImpl });
    await expect(p.streamChat({ system: 's', messages: [] })).rejects.toMatchObject({
      code: 'LLM_HTTP_ERROR',
    });
  });

  it('fetch throw → UNAVAILABLE', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as FetchLike;
    const p = createOpenAiCompat({ ...base, fetchImpl });
    await expect(p.streamChat({ system: 's', messages: [] })).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
  });

  it('no key → NO_API_KEY', async () => {
    const p = createOpenAiCompat({ baseUrl: 'x', model: 'm' });
    await expect(p.streamChat({ system: 's', messages: [] })).rejects.toMatchObject({
      code: 'NO_API_KEY',
    });
  });
});

describe('anthropic + router', () => {
  it('anthropic 200', async () => {
    const fetchImpl = (async () =>
      jsonResponse(200, {
        model: 'a',
        content: [{ type: 'text', text: '{"z":9}' }],
      })) as FetchLike;
    const p = createAnthropic({
      baseUrl: 'https://example.test',
      apiKey: 'k',
      model: 'a',
      fetchImpl,
    });
    const r = await p.streamChat({ system: 's', messages: [] });
    expect(r.json).toEqual({ z: 9 });
  });

  it('router mock without key; openai no key hasApiKey false', async () => {
    expect(hasApiKey({ apiKey: '' })).toBe(false);
    expect(hasApiKey({ apiKey: 'k' })).toBe(true);
    const mock = createProvider({ provider: 'mock' });
    const r = await mock.streamChat({ system: 's', messages: [] });
    expect(r.text).toBeTruthy();
    const oa = createProvider({ provider: 'openai-compat', baseUrl: 'http://x' });
    await expect(oa.streamChat({ system: 's', messages: [] })).rejects.toMatchObject({
      code: 'NO_API_KEY',
    });
  });
});
