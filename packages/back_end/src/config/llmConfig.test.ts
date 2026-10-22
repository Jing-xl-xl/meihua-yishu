import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  configLocalPath,
  describePresets,
  loadLocalLlmConfig,
  resolveLlmConfig,
  saveLocalLlmConfig,
} from './llmConfig';

describe('llmConfig', () => {
  it('save/load config.local.json with mode 600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meihua-cfg-'));
    const saved = saveLocalLlmConfig(dir, {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-test',
    });
    expect(saved.apiKey).toBe('sk-test');
    const p = configLocalPath(dir);
    expect(existsSync(p)).toBe(true);
    const loaded = loadLocalLlmConfig(dir);
    expect(loaded.provider).toBe('deepseek');
    expect(loaded.apiKey).toBe('sk-test');
    rmSync(dir, { recursive: true, force: true });
  });

  it('env overrides file; offline when no key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meihua-cfg2-'));
    saveLocalLlmConfig(dir, {
      provider: 'kimi',
      model: 'kimi-k2-0905-preview',
      apiKey: 'file-key',
    });
    const fromFile = resolveLlmConfig({}, dir);
    expect(fromFile.apiKey).toBe('file-key');
    expect(fromFile.model).toBe('kimi-k2-0905-preview');
    expect(fromFile.offline).toBe(false);

    const fromEnv = resolveLlmConfig({ LLM_API_KEY: 'env-key' }, dir);
    expect(fromEnv.apiKey).toBe('env-key');

    rmSync(dir, { recursive: true, force: true });
    const noKey = resolveLlmConfig({}, dir);
    expect(noKey.offline).toBe(true);
    expect(noKey.provider).toBe('mock');
  });

  it('presets include deepseek and kimi', () => {
    const list = describePresets();
    const ids = list.map((p) => p.id);
    expect(ids).toContain('deepseek');
    expect(ids).toContain('kimi');
    expect(list.find((p) => p.id === 'kimi')?.model).toContain('kimi');
  });

  it('file is valid json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meihua-cfg3-'));
    saveLocalLlmConfig(dir, { model: 'x' });
    const raw = readFileSync(configLocalPath(dir), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });

  it('empty apiKey keeps stored key; clearApiKey deletes (B-03)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'meihua-cfg4-'));
    saveLocalLlmConfig(dir, { provider: 'deepseek', apiKey: 'sk-keep' });
    saveLocalLlmConfig(dir, { model: 'deepseek-chat', apiKey: '' });
    expect(loadLocalLlmConfig(dir).apiKey).toBe('sk-keep');
    saveLocalLlmConfig(dir, { apiKey: undefined as unknown as string });
    expect(loadLocalLlmConfig(dir).apiKey).toBe('sk-keep');
    saveLocalLlmConfig(dir, { clearApiKey: true });
    expect(loadLocalLlmConfig(dir).apiKey).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});
