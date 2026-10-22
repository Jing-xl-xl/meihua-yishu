import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type LlmLocalConfig = {
  provider?: 'deepseek' | 'kimi' | 'openai-compat' | 'anthropic' | 'mock' | 'custom';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
};

export type LlmRuntimeConfig = {
  provider: 'deepseek' | 'kimi' | 'openai-compat' | 'anthropic' | 'mock';
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  offline: boolean;
};

const PRESETS = {
  deepseek: {
    provider: 'openai-compat' as const,
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  kimi: {
    provider: 'openai-compat' as const,
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0905-preview',
  },
  'openai-compat': {
    provider: 'openai-compat' as const,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    provider: 'anthropic' as const,
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
  },
  mock: {
    provider: 'mock' as const,
    baseUrl: '',
    model: 'mock',
  },
} as const;

export function configLocalPath(dataDir: string): string {
  return join(dataDir, 'config.local.json');
}

export function loadLocalLlmConfig(dataDir: string): LlmLocalConfig {
  const p = configLocalPath(dataDir);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as LlmLocalConfig;
  } catch {
    return {};
  }
}

export function saveLocalLlmConfig(
  dataDir: string,
  cfg: LlmLocalConfig & { clearApiKey?: boolean },
): LlmLocalConfig {
  const p = configLocalPath(dataDir);
  mkdirSync(dirname(p), { recursive: true });
  const old = loadLocalLlmConfig(dataDir);
  const { clearApiKey, ...rest } = cfg;
  // 空 Key = 保持已存（bug.xiu B-03 / W1 修订）；清除须 clearApiKey 显式
  if (rest.apiKey === undefined || rest.apiKey === null || rest.apiKey === '') {
    delete rest.apiKey;
  }
  const merged: LlmLocalConfig = { ...old, ...rest };
  if (clearApiKey) {
    delete merged.apiKey;
  }
  writeFileSync(p, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  try {
    chmodSync(p, 0o600);
  } catch {
    /* best effort */
  }
  return merged;
}

/** env 优先，config.local.json 兜底 */
export function resolveLlmConfig(env: NodeJS.ProcessEnv, dataDir: string): LlmRuntimeConfig {
  const local = loadLocalLlmConfig(dataDir);
  const apiKey = env.LLM_API_KEY || local.apiKey;
  const presetName = (env.LLM_PROVIDER || local.provider || (apiKey ? 'deepseek' : 'mock')) as keyof typeof PRESETS;
  const preset = PRESETS[presetName] ?? PRESETS.mock;
  const rawProvider = (env.LLM_PROVIDER || local.provider || preset.provider) as string;
  return {
    provider: (rawProvider === 'deepseek' || rawProvider === 'kimi' || rawProvider === 'custom'
      ? 'openai-compat'
      : rawProvider) as LlmRuntimeConfig['provider'],
    baseUrl: env.LLM_BASE_URL || local.baseUrl || preset.baseUrl,
    model: env.LLM_MODEL || local.model || preset.model,
    apiKey: apiKey || undefined,
    temperature: local.temperature,
    maxTokens: local.maxTokens,
    offline: !apiKey,
  };
}

export function describePresets(): Array<{
  id: string;
  baseUrl: string;
  model: string;
  protocol: string;
}> {
  return [
    {
      id: 'deepseek',
      baseUrl: PRESETS.deepseek.baseUrl,
      model: PRESETS.deepseek.model,
      protocol: 'openai-compat',
    },
    {
      id: 'kimi',
      baseUrl: PRESETS.kimi.baseUrl,
      model: PRESETS.kimi.model,
      protocol: 'openai-compat',
    },
    {
      id: 'openai-compat',
      baseUrl: PRESETS['openai-compat'].baseUrl,
      model: PRESETS['openai-compat'].model,
      protocol: 'openai-compat',
    },
  ];
}
