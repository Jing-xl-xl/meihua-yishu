import { parseFrame, streamSse, type SseFrame } from './sse';

/** 业务/网络错误 → 人话（含下一步）。P0：单一来源，UI 一律走 errText */
const CODE_TEXT: Record<string, string> = {
  NO_API_KEY: '未配置模型 Key：起卦与规则步骤仍可用；去「文房」填写后可解其余步骤',
  LLM_UNAVAILABLE: '模型暂不可用：已完成步骤已保留，可稍后重试或先用离线规则',
  LLM_RATE_LIMIT: '模型限流：请稍等约一分钟再试',
  LLM_TIMEOUT: '模型响应超时：已完成步骤已保留，可重试本步',
  LLM_UNAUTHORIZED: 'API Key 无效或无权限：去「文房」检查 Key 与模型名',
  LLM_BAD_JSON: '模型返回格式异常：已降级为规则结论',
  LLM_EMPTY_RESPONSE: '模型没有返回内容：可重试，或先用离线规则',
  LLM_ABORT: '已中断：完成的步骤已保留',
  LLM_HTTP_ERROR: '模型接口报错：检查 Base URL 与模型名，或改用 DeepSeek/Kimi 预设',
  STEP_FAILED: '这一步没有解出来：可重试本步，其余步骤不受影响',
  CASE_EXISTS: '一会话一案例：请点「新事」再起卦',
  CASE_IN_FLIGHT: '该案例正在解卦，请稍候',
  PERSON_NOT_FOUND: '档案不存在：请重新选择或新建档案',
  KB_NOT_LOADED: '知识库未就绪：请在应用目录重新构建知识库后重启',
  CAST_INVALID_INPUT: '起卦信息不完整：检查问题、报数与时间',
  INVALID_REQUEST: '输入不合法：请检查当前表单',
  SECRET_SETTING_REJECTED: '密钥不能存在普通设置里：请用「文房」的 Key 输入框',
  INTERNAL: '内部错误：请重试；若反复出现，重启应用',
};

export function humanizeError(raw: unknown): string {
  const s = String(raw ?? '').replace(/^Error:\s*/, '').trim();
  if (!s) return '出现未知问题：请重试';
  for (const [code, text] of Object.entries(CODE_TEXT)) {
    if (s.includes(code)) return text;
  }
  if (
    /Failed to fetch|NetworkError|ECONNREFUSED|fetch failed|network failure|网络失败/i.test(s)
  ) {
    return '后端服务未启动：请重新双击「启动梅花算卜」，或检查终端是否有报错';
  }
  if (/http 404|HTTP 404/i.test(s)) {
    return '模型接口 404：请改用 DeepSeek/Kimi 预设，或检查 Base 是否含 /v1、协议是否选对';
  }
  if (/http 401|HTTP 401|http 403|HTTP 403|unauthorized/i.test(s)) {
    return 'API Key 无效或无权限：去「文房」检查 Key 与模型名';
  }
  if (/timeout|timed out|超时/i.test(s)) {
    return '请求超时：可重试，完成的步骤不会丢';
  }
  if (/abort|SSE|连接中断|EventSource/i.test(s) && /abort|中断|closed/i.test(s)) {
    return '连接中断：已完成步骤已保留，可重新解卦';
  }
  if (s.includes('too_small') || s.includes('invalid_value')) {
    if (s.includes('question')) return '请填写所问之事';
    if (s.includes('hourZhi')) return '请填写时支';
    if (s.includes('text')) return '请填写文字';
    if (s.includes('count')) return '请填写数量';
    return '输入不合法：请检查当前表单';
  }
  if (/[\u4e00-\u9fa5]/.test(s)) return s; // 已是中文（含我们包装过的）
  return `出现技术错误：${s.slice(0, 80)}`;
}

/** UI 统一入口：Error 对象或字符串 → 人话 */
export function errText(raw: unknown): string {
  const base = raw instanceof Error ? raw.message : raw;
  return humanizeError(base);
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
    const raw = `${data?.code ?? ''} ${data?.message ?? ''} HTTP ${res.status}`;
    throw new Error(humanizeError(raw));
  }
  if (data == null) {
    throw new Error('空响应或非 JSON');
  }
  return data;
}

export type Person = { id: string; name: string; profileCard?: string };

/** 会话/案例消息（追问、背景问答） */
export type MessageRow = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  caseId?: string | null;
  createdAt?: string;
};

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

export type VerdictPoem = {
  text?: string;
  lines?: [string, string] | string[];
  source?: 'llm' | 'rule' | string;
};

export type Verdict = {
  grade: string;
  summary: string;
  advice: string[];
  timing: string;
  risks: string[];
  basedOnSteps: number[];
  poem?: VerdictPoem;
};

export const apiClient = {
  getPrecastAsk: (caseId: string) =>
    api<{
      ask: null | {
        question: string;
        why?: string;
        examples?: string[];
        suggested?: string[];
        slot?: string;
      };
    }>(`/api/cases/${caseId}/precast-ask`),
  precast: (caseId: string, body: { answer?: string; skip?: boolean }) =>
    api<{ ok: boolean }>(`/api/cases/${caseId}/precast`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getCharacter: () =>
    api<{
      id: string;
      name: string;
      tagline: string;
      identity: string[];
      voice: Record<string, string>;
      examples: Array<{ user: string; reply: string }>;
      boundaries: string[];
      stages: Record<string, string>;
    }>('/api/character'),

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
  updatePerson: (
    id: string,
    body: {
      name?: string;
      persona?: 'feiyu';
      tone?: 'standard' | 'brief' | 'warm';
    },
  ) =>
    api<{ ok: boolean; person?: Person }>(`/api/persons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
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
  refreshProfile: (personId: string) =>
    api<{
      ok: boolean;
      caseCount?: number;
      threshold?: number;
      message?: string;
      generated?: {
        style?: string;
        domains?: string;
        verification?: string;
        communication?: string;
        nature?: string;
        desire?: string;
        with?: string;
        sketch?: string;
        caseCount?: number;
        axes?: {
          focus: number;
          lost: number;
          work: number;
          brief: number;
          feedback: number;
          params: number;
        };
      };
    }>('/api/memory/profile/refresh', {
      method: 'POST',
      body: JSON.stringify({ personId }),
    }),
  getHexagram: (id: string) =>
    api<Record<string, unknown>>(`/api/knowledge/hexagram?id=${id}`),
  getLiuXiang: (gua?: string) =>
    api<Record<string, unknown>>(
      `/api/knowledge/liuxiang${gua ? `?gua=${encodeURIComponent(gua)}` : ''}`,
    ),
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
        sessionId?: string;
        input?: { question?: string };
        method?: string;
        cast?: CastResult;
        verdict?: Verdict;
      };
      steps: StepState[];
      /** 五幕阶段（旧案例读时派生） */
      stage?: string;
      feedback?: {
        actual?: string;
        accuracy?: string;
        deviation_notes?: string;
        deviation_steps_json?: string;
      } | null;
      messages?: MessageRow[];
    }>(`/api/cases/${caseId}`),
  deleteCase: (caseId: string) =>
    api<{
      ok: boolean;
      deleted: {
        caseId: string;
        steps: number;
        messages: number;
        feedback: number;
        memories: number;
        sessionDeleted: boolean;
      };
    }>(`/api/cases/${caseId}`, { method: 'DELETE' }),
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
  getProfileInfo: (personId: string) =>
    api<{ info: Record<string, unknown> }>(
      `/api/persons/${personId}/profile-info`,
    ),
  putProfileInfo: (personId: string, body: Record<string, unknown>) =>
    api<{ ok: boolean; info?: Record<string, unknown> }>(
      `/api/persons/${personId}/profile-info`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  listRelations: (personId?: string) =>
    api<{
      relations: Array<{
        id: string;
        fromId: string;
        toId: string;
        relCode: string;
        label?: string | null;
        closeness?: number | null;
      }>;
    }>(`/api/relations${personId ? `?personId=${encodeURIComponent(personId)}` : ''}`),
  upsertRelation: (body: Record<string, unknown>) =>
    api<{ ok: boolean; id: string }>(`/api/relations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getGraph: (centerId?: string) =>
    api<{
      centerId: string | null;
      persons: Array<{
        id: string;
        name: string;
        kind: string;
        info: Record<string, unknown>;
      }>;
      relations: Array<{
        id: string;
        fromId: string;
        toId: string;
        relCode: string;
        label?: string | null;
        closeness?: number | null;
      }>;
    }>(`/api/graph${centerId ? `?centerId=${encodeURIComponent(centerId)}` : ''}`),
};

export { parseFrame, streamSse };
export type { SseFrame };
