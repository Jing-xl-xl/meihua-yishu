import { openDb } from '../storage/db';
import { createStore } from '../storage/store';
import { loadKnowledge, makeQuery } from '../knowledge/query';
import { createProvider } from '../llm/router';
import type { LLMProvider } from '../llm/types';
import { CaseLocks } from '../storage/locks';
import {
  castByCount,
  castByDateTime,
  castByDirection,
  castByMeasureChiCun,
  castByMeasureZhangChi,
  castByNumbers,
  castByText,
  toLunarMoment,
} from '../casting';
import {
  answerFollowUp,
  resumeInterpret,
  reviseInterpret,
  runInterpret,
} from '../interpretation/pipeline';
import { resolveLlmConfig } from '../config/llmConfig';
import { createApp } from './server';
import type { AppDeps } from './types';

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

async function main(): Promise<void> {
  const dataDir = env('DATA_DIR', './data-dev');
  const knowledgeDir = env('KNOWLEDGE_DIR', './knowledge');
  const port = Number(env('PORT', '8787'));

  const db = openDb(`${dataDir}/meihua.db`);
  const store = createStore(db);
  const knowledgeIndex = loadKnowledge(knowledgeDir);

  function makeLlm(): LLMProvider {
    const cfg = resolveLlmConfig(process.env, dataDir);
    return createProvider({
      provider: (
        cfg.provider === 'anthropic' || cfg.provider === 'mock'
          ? cfg.provider
          : 'openai-compat'
      ) as 'mock' | 'openai-compat' | 'anthropic',
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
    });
  }

  let llm = makeLlm();
  let offline = resolveLlmConfig(process.env, dataDir).offline;

  const deps: AppDeps = {
    store,
    knowledgeIndex,
    knowledge: makeQuery(knowledgeIndex),
    get llm() {
      return llm;
    },
    locks: new CaseLocks(),
    config: {
      port,
      offline,
      dataDir,
    },
    reloadLlm: () => {
      llm = makeLlm();
      offline = resolveLlmConfig(process.env, dataDir).offline;
      deps.config.offline = offline;
    },
    castByNumbers,
    toLunarMoment: toLunarMoment as never,
    castByDateTime: castByDateTime as never,
    castByDirection: castByDirection as never,
    castByCount,
    castByText,
    castByMeasureZhangChi,
    castByMeasureChiCun,
    interpret: {
      run: (o: Record<string, unknown>) => runInterpret(o as never),
      resume: (o: Record<string, unknown>) => resumeInterpret(o as never),
      revise: (o: Record<string, unknown>) => reviseInterpret(o as never),
      followUp: (o: Record<string, unknown>) => answerFollowUp(o as never),
    },
  };

  const app = createApp(deps);
  await app.listen({ port, host: '127.0.0.1' });
  console.log(
    `meihua api listening http://127.0.0.1:${port} offline=${offline}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
