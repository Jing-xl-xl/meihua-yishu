import { parseFrame, streamSse, type SseFrame } from './sse';

/** 业务/网络错误 → 中文（wengua Q-10） */
export function humanizeError(raw: unknown): string {
  const s = String(raw ?? '');
  if (
    /Failed to fetch|NetworkError|ECONNREFUSED|fetch failed|network failure|网络失败/i.test(s)
  ) {
    return '后端未启动或不可达，请运行 npm run dev:api';
  }
  if (/timeout|timed out|超时/i.test(s)) {
    return '请求超时，请重试';
  }
  if (/abort|SSE|连接中断|EventSource/i.test(s) && /abort|中断|closed/i.test(s)) {
    return '连接中断；已完成步骤已保留，可重新解卦';
  }
  if (/http 404|HTTP 404/i.test(s)) {
    return '接口 404：请改用 DeepSeek/Kimi 预设，或检查 Base 是否含 /v1、协议是否选对';
  }
  if (/http 401|HTTP 401|http 403|HTTP 403|unauthorized/i.test(s)) {
    return 'API Key 无效或无权限';
  }
  if (s.includes('LLM_HTTP_ERROR') || /^http \d+/i.test(s.trim())) {
    return `模型接口错误：${s}`;
  }
  if (s.includes('too_small') || s.includes('question')) {
    if (s.includes('question')) return '请填写所问之事';
  }
  if (s.includes('CAST_INVALID_INPUT')) return '起卦信息不完整或非法';
  if (s.includes('CASE_EXISTS')) return '一会话一案例，请点「新事」';
  if (s.includes('NO_API_KEY')) return '请先在设置中配置 API Key';
  if (s.includes('CASE_IN_FLIGHT')) return '该案例正在解卦，请稍候';
  if (s.includes('"origin"') || s.includes('too_small') || s.includes('invalid_value')) {
    if (s.includes('hourZhi')) return '请填写时支';
    if (s.includes('text')) return '请填写文字';
    if (s.includes('count')) return '请填写数量';
    return '输入不合法，请检查表单';
  }
  return s.replace(/^Error:\s*/, '');
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const hasBody = init?.body != null && init.body !== '';
  try {
    res = await fetch(path, {
      ...init,
      // S-21：无 body 不得声明 JSON，否则 DELETE/POST 空体会被拒
      headers: {
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error('网络失败：后端未启动或不可达');
  }
  const text = await res.text();
  let data: (T & { code?: string; message?: string }) | null;
  try {
    data = text ? (JSON.parse(text) as T & { code?: string; message?: string }) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const raw = data?.message || data?.code || `HTTP ${res.status} 后端异常`;
    throw new Error(humanizeError(raw));
  }
  if (data == null) {
    throw new Error('空响应或非 JSON');
  }
  return data;
}

export type Person = { id: string; name: string; profileCard?: string };

export type HexLine = { pos: number; yang: boolean; label: string; text: string };

export type DualGua = { upper: string; lower: string; name?: string };

export type CastResult = {
  method: string;
  formula: { label: string; expr: string; note?: string }[];
  ben: { name: string; lines: number[]; upper: string; lower: string };
  hu: DualGua;
  bian: { name: string; lines: number[]; upper: string; lower: string };
  movingYao: number;
  ti: string;
  yong: string;
  tiYongNote: string;
};

export type StepState = {
  stepId: number;
  status: string;
  conclusion: string;
  evidence?: string;
  sources?: { id: string; title: string }[];
  reasoningNote?: string;
};

export type Verdict = {
  grade: string;
  summary: string;
  advice: string[];
  timing: string;
  risks: string[];
  basedOnSteps: number[];
};

export const apiClient = {
  listPersons: () => api<{ persons: Person[] }>('/api/persons'),
  createPerson: (name: string) =>
    api<{ person: Person }>('/api/persons', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deletePerson: (id: string) =>
    api<{ ok: boolean }>(`/api/persons/${id}`, { method: 'DELETE' }),
  renamePerson: (id: string, name: string) =>
    api<{ ok: boolean }>(`/api/persons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  route: (
    sessionId: string,
    body?: {
      question: string;
      contextNote?: string;
      directionNote?: string;
      answer?: string;
      currentMethod?: string;
      mode?: 'method' | 'parseDirection';
      numbers?: number[];
      timeLocal?: string;
      text?: string;
      count?: number;
    },
  ) =>
    api<{
      mode: string;
      method?: string;
      category?: string;
      reason?: string;
      confidence?: string;
      routeRounds?: number;
      missing?: string[];
      clarify?: { question: string; options: string[] } | null;
      source?: string;
      objectGua?: string;
      directionGua?: string;
      labels?: { object: string; direction: string };
    }>(`/api/sessions/${sessionId}/route`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  putSettings: (body: Record<string, string>) =>
    api<{ ok: boolean }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  createSession: (personId: string) =>
    api<{ session: { id: string } }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ personId }),
    }),
  createCase: (sessionId: string, personId: string, payload: Record<string, unknown>) =>
    api<{ case: { id: string } }>(`/api/sessions/${sessionId}/cases`, {
      method: 'POST',
      body: JSON.stringify({ personId, ...payload }),
    }),
  cast: (caseId: string, payload: Record<string, unknown>) =>
    api<{ cast: CastResult }>(`/api/cases/${caseId}/cast`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  feedback: (caseId: string, payload: Record<string, unknown>) =>
    api<{ ok: boolean }>(`/api/cases/${caseId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  settings: () =>
    api<{ hasKey: boolean; school: string; kbVersion: string }>(
      '/api/settings',
    ),
  listMemories: (personId: string) =>
    api<{ memories: { id: string; type: string; rejected?: boolean; createdAt: string; payload: Record<string, unknown> }[] }>(
      `/api/memory?personId=${personId}`,
    ),
  getRoleCard: (personId: string) =>
    api<{ text: string; isDefault: boolean }>(
      `/api/memory/role?personId=${encodeURIComponent(personId)}`,
    ),
  putRoleCard: (personId: string, text: string) =>
    api<{ ok: boolean }>('/api/memory/role', {
      method: 'PUT',
      body: JSON.stringify({ personId, text }),
    }),
  resetRoleCard: (personId: string) =>
    api<{ ok: boolean; text: string }>('/api/memory/role/reset', {
      method: 'POST',
      body: JSON.stringify({ personId }),
    }),
  addAnchor: (personId: string, text: string, caseId?: string) =>
    api<{ memory: { id: string } }>('/api/memory', {
      method: 'POST',
      body: JSON.stringify({ personId, text, type: 'anchor', caseId }),
    }),
  rejectMemory: (id: string) =>
    api<{ ok: boolean; rejected: boolean }>(`/api/memory/${id}/reject`, {
      method: 'POST',
    }),
  deleteMemory: (id: string) =>
    api<{ ok: boolean }>(`/api/memory/${id}`, { method: 'DELETE' }),
  compactMemories: (personId: string) =>
    api<{ merged: number }>('/api/memory/compact', {
      method: 'POST',
      body: JSON.stringify({ personId }),
    }),
  getHexagram: (id: string) =>
    api<Record<string, unknown>>(`/api/knowledge/hexagram?id=${id}`),
  putLlmSettings: (body: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }) =>
    api<{ ok: boolean; hasKey?: boolean }>(`/api/settings/llm`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  testLlm: (body: Record<string, string>) =>
    api<{ ok: boolean }>(`/api/settings/test`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  exportPerson: (personId: string) =>
    api<Record<string, unknown>>('/api/export', {
      method: 'POST',
      body: JSON.stringify({ personId }),
    }),
  getCase: (caseId: string) =>
    api<{
      case: {
        id: string;
        cast?: CastResult;
        verdict?: Verdict;
      };
      steps: StepState[];
      feedback?: {
        actual?: string;
        accuracy?: string;
        deviation_notes?: string;
        deviation_steps_json?: string;
      } | null;
    }>(`/api/cases/${caseId}`),
  listMessages: (sessionId: string) =>
    api<{
      messages: {
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
      }[];
    }>(`/api/sessions/${sessionId}`),
  followup: (caseId: string, question: string) =>
    api<{ text: string }>(`/api/cases/${caseId}/followup`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  listCases: (personId: string) =>
    api<{ cases: Array<Record<string, unknown>> }>(
      `/api/cases?personId=${personId}`,
    ),
  stats: (personId: string) =>
    api<Record<string, number | object>>(`/api/cases/stats?personId=${personId}`),
};

export { parseFrame, streamSse };
export type { SseFrame };
