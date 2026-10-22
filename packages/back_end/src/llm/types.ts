export type ChatMessage = {
  /** 仅 user | assistant；system 只走 req.system 顶层 */
  role: 'user' | 'assistant';
  content: string;
};

export type StreamChatResult = {
  text: string;
  /** 尽力解析；失败为 undefined，不抛错 */
  json?: unknown;
  raw?: unknown;
  model?: string;
};

export type StreamChatRequest = {
  system: string;
  messages: ChatMessage[];
  jsonSchema?: object;
  temperature?: number;
  maxTokens?: number;
  /** 覆盖 cfg.timeoutMs，默认 60000 */
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type LLMProvider = {
  readonly id: string;
  streamChat(req: StreamChatRequest): Promise<StreamChatResult>;
};

export type FetchLike = typeof fetch;

export type ProviderConfig = {
  provider: 'mock' | 'openai-compat' | 'anthropic';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};
