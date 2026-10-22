import { createAnthropic } from './anthropic';
import { createOpenAiCompat } from './openaiCompat';
import { MockProvider } from './mock';
import type { LLMProvider, ProviderConfig } from './types';

export function hasApiKey(cfg: Pick<ProviderConfig, 'apiKey'>): boolean {
  return Boolean(cfg.apiKey && cfg.apiKey.length > 0);
}

export function createProvider(cfg: ProviderConfig): LLMProvider {
  if (cfg.provider === 'mock') {
    return new MockProvider();
  }
  // W10 S-01：仅 anthropic 走 Anthropic；custom/deepseek/kimi/openai-compat 均为 OpenAI 兼容
  if (cfg.provider === 'anthropic') {
    return createAnthropic({
      baseUrl: cfg.baseUrl ?? 'https://api.anthropic.com',
      apiKey: cfg.apiKey,
      model: cfg.model ?? 'claude-sonnet-4-20250514',
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
      fetchImpl: cfg.fetchImpl,
    });
  }
  return createOpenAiCompat({
    baseUrl: cfg.baseUrl ?? 'https://api.openai.com/v1',
    apiKey: cfg.apiKey,
    model: cfg.model ?? 'gpt-4o-mini',
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    timeoutMs: cfg.timeoutMs,
    fetchImpl: cfg.fetchImpl,
  });
}
