import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiClient,
  streamSse,
  type CastResult,
  type Person,
  type SseFrame,
  type StepState,
  type Verdict,
} from '../api/client';
import { PERSON_TO_GUA } from '../api/methods';
import { HexBoard, GUA_ORDER, dualToLines, guaZh } from '../components/HexBoard';
import { CasesPage, KnowledgePage, MemoryPage, SettingsPage } from '../features/pages';
import { ToastHost, toast } from '../components/ui';
import { ZHI_BY_NUM, GUA_NAME_ZH, qiSegments, qiTrendPlain } from '@meihua/shared';
import {
  STATUS_LABEL,
  STEP_TITLES,
  gradeClass,
  gradeLabel,
} from './labels';

const PERSON_KEY = 'meihua.personId';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  kind?: 'cast' | 'step' | 'verdict' | 'need' | 'error' | 'followup';
};

type NeedInput = { stepId?: number; question: string; options?: string[] };

type MethodId =
  | 'number3'
  | 'number1'
  | 'number2'
  | 'objectCount'
  | 'sound'
  | 'text'
  | 'measureZhangChi'
  | 'measureChiCun'
  | 'datetime'
  | 'direction';

const METHOD_LABELS: { id: MethodId; label: string; group: string }[] = [
  { id: 'number3', label: '三数报数', group: '报数' },
  { id: 'number2', label: '二数报数', group: '报数' },
  { id: 'number1', label: '一数报数', group: '报数' },
  { id: 'datetime', label: '年月日时', group: '时间' },
  { id: 'direction', label: '端法/为人占', group: '端法' },
  { id: 'objectCount', label: '物数占', group: '其它' },
  { id: 'sound', label: '声音占', group: '其它' },
  { id: 'text', label: '字占（字数）', group: '其它' },
  { id: 'measureZhangChi', label: '丈尺占', group: '其它' },
  { id: 'measureChiCun', label: '尺寸占', group: '其它' },
];

const METHOD_GROUPS = ['报数', '时间', '端法', '其它'] as const;

type FlowPhase = 'prep' | 'cast' | 'interpret' | 'done';

/** 时支：子=1 … 亥=12（与 lunar.hourZhiNum 一致） */
function hourZhiFromHours(h: number): number {
  if (h === 23 || h === 0) return 1;
  return Math.floor((h + 1) / 2) + 1;
}

/** datetime-local 本地串，禁止 toISOString（UTC） */
function localDateTimeValue(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function countChars(text: string): number {
  const hits = text.match(/[一-鿿A-Za-z0-9]/g);
  return hits ? hits.length : 0;
}

/** 去 Markdown 符号（R-3） */
function plainText(s: string): string {
  return String(s ?? '')
    .replace(/\*\*|__|`|#+\s*/g, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateLine(s: string, n = 40): string {
  const t = plainText(s).replace(/\n/g, ' ');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

function validateForm(
  method: MethodId,
  numbers: string,
  text: string,
  count: string,
  question: string,
  hourZhi: string,
  timeLocal: string,
  zhang: string,
  chi: string,
  cun: string,
): string {
  const q = question.trim();
  if (!q) return '请填写所问之事';
  if (q.length > 200) return '问题过长，请精简（建议 ≤200 字）';
  const nums = numbers
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (method === 'number3' && nums.length !== 3) return '三数报数需正好 3 个数';
  if (method === 'number2' && nums.length !== 2) return '二数报数需正好 2 个数';
  if (method === 'number1' && nums.length !== 1) return '一数报数需正好 1 个数';
  if (method === 'text') {
    if (!text.trim()) return '请填写文字';
    if (countChars(text) < 2) return '字占有效字数至少 2 字';
  }
  if ((method === 'objectCount' || method === 'sound') && !(Number(count) > 0)) {
    return '数量需为正整数';
  }
  if (method === 'measureZhangChi') {
    if (!(Number(zhang) + Number(chi) >= 1)) return '丈与尺之和需 ≥ 1';
  }
  if (method === 'measureChiCun') {
    if (!(Number(chi) + Number(cun) >= 1)) return '尺与寸之和需 ≥ 1';
  }
  if (method === 'datetime' && !timeLocal.trim()) return '请选择起卦时间';
  const needHour = method !== 'measureZhangChi' && method !== 'text';
  if (needHour) {
    const h = Number(hourZhi);
    if (!Number.isInteger(h) || h < 1 || h > 12) return '请选择时支（子=1 … 亥=12）';
  }
  return '';
}

function schoolHint(method: MethodId): string {
  switch (method) {
    case 'number1':
      return '一数必加时；上下卦与动爻均用时支';
    case 'number2':
      return '二数动爻默认不加时（addHour=false）';
    case 'number3':
      return '三数动爻默认不加时；流派见设置（取模/总和）';
    case 'objectCount':
    case 'sound':
    case 'measureChiCun':
      return '本法动爻加时支';
    case 'measureZhangChi':
    case 'text':
      return '本法不加时';
    case 'datetime':
      return '年月日时起卦，必含时';
    case 'direction':
      return '端法：物数+方位数+时';
    default:
      return '';
  }
}

export function App() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [personId, setPersonId] = useState<string | null>(
    localStorage.getItem(PERSON_KEY),
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [kbVersion, setKbVersion] = useState('');
  const [schoolMoving, setSchoolMoving] = useState<'mod' | 'sum'>('mod');
  const [backendDown, setBackendDown] = useState(false);
  const [running, setRunning] = useState(false);
  const [openFeedbackCaseId, setOpenFeedbackCaseId] = useState<string | null>(null);

  const [method, setMethod] = useState<MethodId>('number3');
  const [question, setQuestion] = useState('');
  const [numbers, setNumbers] = useState('');
  const [count, setCount] = useState('12');
  const [text, setText] = useState('');
  const [zhang, setZhang] = useState('1');
  const [chi, setChi] = useState('5');
  const [cun, setCun] = useState('3');
  const [hourZhi, setHourZhi] = useState(String(hourZhiFromHours(new Date().getHours())));
  const [timeLocal, setTimeLocal] = useState(localDateTimeValue());
  const [objectGua, setObjectGua] = useState('qian');
  const [directionGua, setDirectionGua] = useState('xun');
  const [personKey, setPersonKey] = useState(
    Object.keys(PERSON_TO_GUA)[0] as string,
  );
  const [routeHint, setRouteHint] = useState('');
  const [methodOpen, setMethodOpen] = useState(false);
  const [recommendStale, setRecommendStale] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{
    method?: string;
    reason?: string;
    category?: string;
    confidence?: string;
    source?: string;
    missing?: string[];
  } | null>(null);
  const [clarify, setClarify] = useState<{
    question: string;
    options: string[];
  } | null>(null);
  const [clarifyAnswer, setClarifyAnswer] = useState('');
  const [directionNote, setDirectionNote] = useState('');
  const [dirParse, setDirParse] = useState<{
    objectGua: string;
    directionGua: string;
    labels?: { object: string; direction: string };
  } | null>(null);

  const [cast, setCast] = useState<CastResult | null>(null);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [need, setNeed] = useState<NeedInput | null>(null);
  const [answer, setAnswer] = useState('');
  const [remember, setRemember] = useState(true);
  const [followText, setFollowText] = useState('');
  const [reviseOpen, setReviseOpen] = useState<number | null>(null);
  const [reviseText, setReviseText] = useState('');
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [followExpanded, setFollowExpanded] = useState(false);
  const [chatPinned, setChatPinned] = useState(true);
  const [hexFull, setHexFull] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [page, setPage] = useState<
    'work' | 'cases' | 'memory' | 'knowledge' | 'settings'
  >('work');
  const [recentCases, setRecentCases] = useState<
    Array<{
      id: string;
      sessionId?: string;
      question: string;
      hex?: string;
      date?: string;
    }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const pushChat = useCallback((m: Omit<ChatMsg, 'id'>) => {
    setChat((c) => [
      ...c,
      { ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    ]);
  }, []);

  const applyStep = useCallback((st: StepState) => {
    setSteps((prev) => {
      const next = prev.filter((s) => s.stepId !== st.stepId);
      return [...next, st].sort((a, b) => a.stepId - b.stepId);
    });
    // R-6：revise 后自动展开该步
    if (st.status === 'revised') {
      setExpandedStep(st.stepId);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [p, s] = await Promise.all([
          apiClient.listPersons(),
          apiClient.settings(),
        ]);
        setPersons(p.persons);
        setHasKey(s.hasKey);
        setBackendDown(false);
        const sch = (s as unknown as { school?: string }).school;
        if (sch === 'mod' || sch === 'sum') setSchoolMoving(sch);
        const kb = (s as unknown as { kbVersion?: string }).kbVersion;
        if (kb) setKbVersion(kb);
      } catch {
        setBackendDown(true);
        setStatus('后端未启动（npm run dev:api）');
      }
    })();
  }, []);

  useEffect(() => {
    if (!personId) return;
    void apiClient
      .listCases(personId)
      .then((r) => {
        const list = (r.cases as Array<Record<string, unknown>>).slice(0, 5);
        setRecentCases(
          list.map((c) => {
            const input = c.input as { question?: string } | undefined;
            const cast = c.cast as
              | { ben?: { name?: string }; bian?: { name?: string } }
              | undefined;
            return {
              id: String(c.id),
              sessionId: String(c.sessionId ?? ''),
              question: input?.question ?? '',
              hex: cast?.ben?.name
                ? `${cast.ben.name}${cast.bian?.name ? `之${cast.bian.name}` : ''}`
                : String(c.method ?? ''),
              date: String(c.createdAt ?? '').slice(0, 10),
            };
          }),
        );
        setBackendDown(false);
      })
      .catch(() => undefined);
  }, [personId]);

  useEffect(() => {
    if (!sessionId || !caseId) return;
    void (async () => {
      try {
        const bundle = await apiClient.getCase(caseId);
        if (bundle.case.cast) {
          setCast(bundle.case.cast);
          setLocked(true);
        }
        setSteps(bundle.steps ?? []);
        if (bundle.case.verdict) setVerdict(bundle.case.verdict);
        const { messages: msgs } = await apiClient.listMessages(sessionId);
        setChat(
          msgs.map(
            (m: {
              id: string;
              role: 'user' | 'assistant' | 'system';
              content: string;
            }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              kind: m.role === 'user' ? undefined : 'step',
            }),
          ),
        );
        setBackendDown(false);
      } catch {
        /* 新会话可忽略 */
      }
    })();
  }, [sessionId, caseId]);

  useEffect(() => {
    // R-4/R-5：仅贴底时跟滚；历史载入不强制
    if (!chatPinned) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, chatPinned]);

  function onChatScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setChatPinned(nearBottom);
  }

  function abortSse() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }

  useEffect(() => () => abortSse(), []);

  function pickPerson(id: string) {
    abortSse();
    setPersonId(id);
    localStorage.setItem(PERSON_KEY, id);
    resetWorkbench();
  }

  function resetWorkbench() {
    setSessionId(null);
    setCaseId(null);
    setCast(null);
    setSteps([]);
    setVerdict(null);
    setChat([]);
    setLocked(false);
    setNeed(null);
    setRunning(false);
    setRouteHint('');
  }

  async function newPerson() {
    const name = window.prompt('姓名') || '测试';
    try {
      const r = await apiClient.createPerson(name);
      setPersons((x) => [...x, r.person]);
      pickPerson(r.person.id);
      setBackendDown(false);
    } catch (e) {
      setStatus(String(e));
    }
  }

  function newSession() {
    abortSse();
    resetWorkbench();
    setStatus('新会话（一事一占）');
  }

  function parseNumbers(): number[] {
    return numbers
      .split(/[,，\s]+/)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));
  }

  function buildCastBody() {
    const nums = parseNumbers();
    const h = Number(hourZhi) || 1;
    const school = { movingYao: schoolMoving, addHour: false as const };
    switch (method) {
      case 'number3':
      case 'number2':
      case 'number1':
        return { method, hourZhi: h, numbers: nums, school };
      case 'objectCount':
      case 'sound':
        return { method, hourZhi: h, count: Number(count) || 1, school };
      case 'text':
        return { method, text, hourZhi: h, school };
      case 'measureZhangChi':
        return {
          method,
          zhang: Number(zhang) || 0,
          chi: Number(chi) || 0,
          school,
        };
      case 'measureChiCun':
        return {
          method,
          chi: Number(chi) || 0,
          cun: Number(cun) || 0,
          hourZhi: h,
          school,
        };
      case 'datetime':
        return { method, timeLocal, hourZhi: h, school };
      case 'direction': {
        const og =
          personKey && PERSON_TO_GUA[personKey as keyof typeof PERSON_TO_GUA]
            ? PERSON_TO_GUA[personKey as keyof typeof PERSON_TO_GUA]
            : objectGua;
        return {
          method: 'direction',
          hourZhi: h,
          school,
          overrides: {
            objectGua: og || objectGua,
            directionGua,
          },
        };
      }
    }
  }

  async function recommendMethod(answer?: string) {
    if (!personId) return setStatus('请先选择档案');
    const q = question.trim();
    if (!q) {
      setFormError('请填写所问之事');
      setStatus('请填写所问之事');
      return;
    }
    setFormError('');
    setRecommendStale(false);
    try {
      const sid =
        sessionId ?? (await apiClient.createSession(personId)).session.id;
      setSessionId(sid);
      const nums = parseNumbers();
      const r = await apiClient.route(sid, {
        question: q,
        answer,
        currentMethod: method,
        mode: 'method',
        numbers: nums.length ? nums : undefined,
        timeLocal: method === 'datetime' ? timeLocal : undefined,
        text: method === 'text' ? text : undefined,
        count:
          method === 'objectCount' || method === 'sound'
            ? Number(count) || undefined
            : undefined,
        directionNote: method === 'direction' ? directionNote : undefined,
      });
      if (r.clarify?.question) {
        setClarify({
          question: r.clarify.question,
          options: r.clarify.options ?? [],
        });
        setRouteHint(`需要澄清：${r.clarify.question}`);
        return;
      }
      setClarify(null);
      if (r.method) {
        setRouteInfo({
          method: r.method,
          reason: r.reason,
          category: r.category,
          confidence: r.confidence,
          source: r.source,
          missing: r.missing ?? [],
        });
        setRouteHint(
          `推荐：${METHOD_LABELS.find((x) => x.id === r.method)?.label ?? r.method}${r.reason ? ` · ${r.reason}` : ''}${r.source === 'rule' ? ' · 离线规则' : ''}`,
        );
        // 不静默覆盖：仅提示可采纳
      }
    } catch (e) {
      const msg = String(e);
      setStatus(msg);
      toast('error', msg);
    }
  }

  function adoptRecommend() {
    if (!routeInfo?.method) return;
    const m = routeInfo.method as MethodId;
    if (METHOD_LABELS.some((x) => x.id === m)) {
      setMethod(m);
      toast('ok', '已采纳推荐起卦法');
    }
    setRouteInfo((r) => (r ? { ...r } : r));
  }

  async function parseDirection() {
    if (!personId || !directionNote.trim()) return;
    try {
      const sid =
        sessionId ?? (await apiClient.createSession(personId)).session.id;
      setSessionId(sid);
      const r = await apiClient.route(sid, {
        question: question.trim() || directionNote,
        directionNote: directionNote.trim(),
        mode: 'parseDirection',
      });
      if (r.objectGua && r.directionGua) {
        setDirParse({
          objectGua: r.objectGua,
          directionGua: r.directionGua,
          labels: r.labels,
        });
        setObjectGua(r.objectGua);
        setDirectionGua(r.directionGua);
        toast('ok', `解析：${r.labels?.object ?? ''}→${r.objectGua}，${r.labels?.direction ?? ''}→${r.directionGua}`);
      }
    } catch (e) {
      toast('error', String(e));
    }
  }

  async function startCast() {
    if (!personId) return setStatus('请先选择档案');
    const err = validateForm(
      method,
      numbers,
      text,
      count,
      question,
      hourZhi,
      timeLocal,
      zhang,
      chi,
      cun,
    );
    setFormError(err);
    if (err) return;
    abortSse();
    setStatus('起卦中…');
    try {
      const sess =
        sessionId != null
          ? { session: { id: sessionId } }
          : await apiClient.createSession(personId);
      const sid = sess.session.id;
      setSessionId(sid);
      const nums = parseNumbers();
      const c =
        caseId != null
          ? { case: { id: caseId } }
          : await apiClient.createCase(sid, personId, {
              question: question.trim(),
              numbers: nums.length ? nums : undefined,
              category: routeInfo?.category ?? '问卦',
            });
      setCaseId(c.case.id);
      pushChat({ role: 'user', content: question || '（未填问题）' });
      const body = buildCastBody() as Record<string, unknown>;
      // W7 L-1：起卦时带上最新问题/占类
      body.question = question.trim();
      body.category = routeInfo?.category ?? '问卦';
      if (method === 'direction' && dirParse) {
        body.overrides = {
          ...((body.overrides as object) ?? {}),
          objectGua: dirParse.objectGua,
          directionGua: dirParse.directionGua,
        };
      }
      const r = await apiClient.cast(c.case.id, body);
      setCast(r.cast);
      setLocked(true);
      setBackendDown(false);
      pushChat({
        role: 'assistant',
        kind: 'cast',
        content: `起卦：${r.cast.ben.name} 之 ${r.cast.bian.name}，动爻 ${r.cast.movingYao}（${schoolMoving === 'sum' ? '总和派' : '取模派'}·不含时）`,
      });
      setStatus(`已起卦：${r.cast.ben.name} 之 ${r.cast.bian.name}`);
      toast('ok', `已起卦：${r.cast.ben.name} 之 ${r.cast.bian.name}`);
    } catch (e) {
      setStatus(String(e));
      pushChat({ role: 'system', kind: 'error', content: String(e) });
      toast('error', String(e));
    }
  }

  function runStream(url: string, body: unknown, onFrame: (f: SseFrame) => void) {
    abortSse();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    return streamSse(url, body, onFrame, ac.signal)
      .catch((e) => {
        if (!String(e).includes('abort')) {
          setStatus(String(e));
          pushChat({ role: 'system', kind: 'error', content: String(e) });
        }
      })
      .finally(() => {
        setRunning(false);
        if (abortRef.current === ac) abortRef.current = null;
      });
  }

  async function interpret() {
    if (!caseId) return setStatus('请先起卦');
    setStatus('解卦中…');
    await runStream(`/api/cases/${caseId}/interpret`, {}, (f) => {
      if (f.event === 'step_done' || f.event === 'step_revised') {
        const st = f.data as StepState;
        applyStep(st);
        if (f.event === 'step_revised') {
          pushChat({
            role: 'system',
            kind: 'step',
            content: `已修正步骤 ${st.stepId}`,
          });
        }
      } else if (f.event === 'verdict') {
        const v = f.data as Verdict;
        setVerdict(v);
        setVerdictOpen(true);
        pushChat({
          role: 'assistant',
          kind: 'verdict',
          content: `占断（${gradeLabel(v.grade)}）：${v.summary}`,
        });
        toast('ok', `解卦完成：${gradeLabel(v.grade)}`);
      } else if (f.event === 'need_input') {
        setNeed(f.data as NeedInput);
        pushChat({
          role: 'assistant',
          kind: 'need',
          content: (f.data as NeedInput).question,
        });
      } else if (f.event === 'error') {
        const e = f.data as { code?: string; message?: string };
        pushChat({
          role: 'system',
          kind: 'error',
          content: `${e.code ?? 'ERR'} ${e.message ?? ''}`,
        });
      } else if (f.event === 'done') {
        setStatus('解卦完成');
      }
    });
  }

  async function submitResume(skip = false) {
    if (!caseId) return;
    const textAns = skip ? '' : answer.trim();
    if (!skip && !textAns) {
      // 空提交等价跳过，但保留显式路径
    }
    if (!skip) pushChat({ role: 'user', content: textAns || '（空）' });
    else pushChat({ role: 'user', content: '（跳过背景）' });
    const stepId = need?.stepId;
    setNeed(null);
    await runStream(
      `/api/cases/${caseId}/resume`,
      {
        // G：text 空串/「跳过」不进背景；stepId 保证从提问步续跑（勿传空 answers）
        answers: [
          {
            stepId,
            text: skip ? '' : textAns,
            remember: skip ? false : remember,
          },
        ],
      },
      (f) => {
        if (f.event === 'step_done' || f.event === 'step_revised') {
          applyStep(f.data as StepState);
        } else if (f.event === 'verdict') {
          const v = f.data as Verdict;
          setVerdict(v);
          pushChat({
            role: 'assistant',
            kind: 'verdict',
            content: `占断（${gradeLabel(v.grade)}）：${v.summary}`,
          });
        } else if (f.event === 'done') setStatus(skip ? '已跳过背景并继续' : '续跑完成');
      },
    );
    setAnswer('');
  }

  async function doRevise(stepId: number) {
    if (!caseId || !reviseText) return;
    pushChat({
      role: 'user',
      content: `[插话·步骤${stepId}] ${reviseText}`,
    });
    await runStream(
      `/api/cases/${caseId}/revise`,
      { stepId, message: reviseText },
      (f) => {
        if (f.event === 'step_done' || f.event === 'step_revised') {
          const st = f.data as StepState;
          applyStep(st);
          if (f.event === 'step_revised') {
            pushChat({
              role: 'system',
              kind: 'step',
              content: `已修正步骤 ${st.stepId}`,
            });
          }
        } else if (f.event === 'verdict') {
          setVerdict(f.data as Verdict);
        }
      },
    );
    setReviseText('');
    setReviseOpen(null);
  }

  async function doFollowup() {
    if (!caseId || !followText) return;
    setChatPinned(true);
    setFollowExpanded(false);
    pushChat({ role: 'user', content: followText });
    try {
      const r = await apiClient.followup(caseId, followText);
      // 存全文，展示层截断（R-14）
      pushChat({
        role: 'assistant',
        kind: 'followup',
        content: plainText(r.text),
      });
      setBackendDown(false);
    } catch (e) {
      pushChat({ role: 'system', kind: 'error', content: String(e) });
    }
    setFollowText('');
  }

  const phase: FlowPhase = verdict
    ? 'done'
    : running
      ? 'interpret'
      : locked
        ? 'cast'
        : 'prep';

  const doneCount = steps.filter(
    (s) => s.status !== 'pending' && s.status !== 'running',
  ).length;

  const huLines = useMemo(
    () =>
      cast?.hu
        ? dualToLines(
            (cast.hu as { upper?: string }).upper,
            (cast.hu as { lower?: string }).lower,
          )
        : [],
    [cast],
  );

  const tiYongOn = useMemo(() => {
    if (!cast) return { ben: null as null | 'ti' | 'yong', bian: null as null | 'ti' | 'yong' };
    // 铁律：动爻所在为用；本卦盘整体标「体」侧提示
    const movingInLower = cast.movingYao <= 3;
    // 动在下 → 下用上体；HexBoard 单签标在本卦：标体
    void movingInLower;
    return {
      ben: 'ti' as 'ti' | 'yong',
      bian: null as null | 'ti' | 'yong',
    };
  }, [cast]);

  const qiSegs = useMemo(() => {
    if (!cast) return [];
    return qiSegments({
      ben: { upper: cast.ben.upper as never, lower: cast.ben.lower as never },
      hu: cast.hu?.upper
        ? {
            upper: (cast.hu as { upper: string }).upper as never,
            lower: (cast.hu as { lower: string }).lower as never,
          }
        : undefined,
      bian: {
        upper: cast.bian.upper as never,
        lower: cast.bian.lower as never,
      },
      movingYao: cast.movingYao,
    });
  }, [cast]);

  const guaOptions = useMemo(
    () =>
      Object.entries(PERSON_TO_GUA).map(([k, v]) => (
        <option key={k} value={k}>
          {k}（{guaZh(String(v))}）
        </option>
      )),
    [],
  );

  return (
    <div className="app">
      <ToastHost />
      <header className="top">
        <h1>
          <span className="brand-dot" />
          梅花易数
        </h1>
        <div className="row">
          <span className={`badge ${hasKey ? 'ok' : 'warn'}`}>
            {hasKey ? '已配置 Key' : '未配置 Key'}
          </span>
          {kbVersion ? <span className="badge">KB {kbVersion}</span> : null}
          <select
            value={personId ?? ''}
            onChange={(e) => pickPerson(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="">选择档案</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="ghost sm" onClick={() => void newPerson()}>
            新建档案
          </button>
          <button type="button" className="ghost sm" onClick={newSession}>
            新事
          </button>
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ['work', '问卦'],
            ['cases', '案例'],
            ['memory', '记忆'],
            ['knowledge', '知识'],
            ['settings', '设置'],
          ] as const
        ).map(([p, label]) => (
          <button
            key={p}
            type="button"
            className={page === p ? 'active' : ''}
            onClick={() => setPage(p)}
          >
            {label}
          </button>
        ))}
      </nav>

      {backendDown && (
        <div className="banner danger">
          后端未启动或不可达（npm run dev:api）。起卦/解卦不可用。
        </div>
      )}
      {!hasKey && page === 'work' && (
        <div className="banner warn">
          当前未配置 Key：可起卦排盘；步 1/3/4/5 规则可解，其余标「需配置 Key」。可在设置中配置。
        </div>
      )}

      {page === 'cases' && (
        <CasesPage
          personId={personId}
          openCaseId={openFeedbackCaseId}
          onOpenCaseConsumed={() => setOpenFeedbackCaseId(null)}
          onSelectPerson={(id) => pickPerson(id)}
          onGotoSettings={() => setPage('settings')}
          onExport={() => {
            if (!personId) return;
            void apiClient
              .exportPerson(personId)
              .then((data) => {
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: 'application/json',
                });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `export-${(persons.find((x) => x.id === personId)?.name ?? 'me').replace(/[^\w一-龥-]/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              })
              .catch((e) => toast('error', String(e)));
          }}
        />
      )}
      {page === 'memory' && <MemoryPage personId={personId} />}
      {page === 'knowledge' && <KnowledgePage />}
      {page === 'settings' && (
        <SettingsPage
          personId={personId}
          onChanged={(s) => {
            if (s.hasKey != null) setHasKey(s.hasKey);
            if (s.school === 'mod' || s.school === 'sum') setSchoolMoving(s.school);
          }}
          onDeletedPerson={(id) => {
            setPersons((ps) => ps.filter((p) => p.id !== id));
            if (personId === id) pickPerson('');
          }}
          onRenamedPerson={(id, name) => {
            setPersons((ps) =>
              ps.map((p) => (p.id === id ? { ...p, name } : p)),
            );
          }}
        />
      )}

      {page === 'work' && (
        <div className="page-fade" key={phase + String(caseId)}>
          <div className="flowbar">
            {(
              [
                ['prep', '准备'],
                ['cast', '起卦'],
                ['interpret', '解卦'],
                ['done', '完成'],
              ] as const
            ).map(([id, label], i, arr) => {
              const idx = ['prep', 'cast', 'interpret', 'done'].indexOf(phase);
              const cls =
                i < idx ? 'done' : i === idx ? 'current' : '';
              return (
                <span key={id} className={`flow-step ${cls}`}>
                  <span className="dot" />
                  {label}
                  {i < arr.length - 1 && <span className="flow-sep"> ── </span>}
                </span>
              );
            })}
            <span className="spacer" />
            <span className="muted">
              {locked
                ? '一会话一案例 · 表单已锁定'
                : '一事一议 · 起卦后锁定'}
            </span>
          </div>

          <main className="cols">
            <section className="col left">
              <div className="panel">
                <h2>会话</h2>
                <p className="muted">
                  {sessionId ? `会话 ${sessionId.slice(0, 8)}…` : '未开始'}
                  {caseId ? ` · 案例 ${caseId.slice(0, 8)}…` : ''}
                </p>

                {!locked ? (
                  <>
                    {/* 1. 问题置顶 */}
                    <label>
                      问题
                      <textarea
                        rows={2}
                        value={question}
                        placeholder="例如：明日面试是否顺利 / 我想找一个东西"
                        onChange={(e) => {
                          setQuestion(e.target.value);
                          if (routeInfo || routeHint) setRecommendStale(true);
                        }}
                      />
                    </label>

                    {/* 2. AI 推荐条 */}
                    <div className="panel" style={{ marginTop: 8 }}>
                      <div className="row">
                        <button
                          type="button"
                          className="primary sm"
                          onClick={() => void recommendMethod()}
                          disabled={!personId}
                        >
                          获取起卦法推荐
                        </button>
                        {recommendStale && (
                          <span className="badge warn">问题已变，请重新推荐</span>
                        )}
                        {routeInfo?.source === 'rule' && (
                          <span className="badge">离线规则</span>
                        )}
                        {routeInfo?.confidence === 'low' && (
                          <span className="badge warn">仅供参考</span>
                        )}
                      </div>
                      {routeInfo?.method && (
                        <p className="hint">
                          推荐：
                          {METHOD_LABELS.find((x) => x.id === routeInfo.method)?.label ??
                            routeInfo.method}
                          {routeInfo.reason ? ` · ${routeInfo.reason}` : ''}
                          {routeInfo.category ? ` · 占类：${routeInfo.category}` : ''}
                          <span className="row" style={{ marginTop: 6 }}>
                            <button type="button" className="sm primary" onClick={adoptRecommend}>
                              采纳
                            </button>
                            <button
                              type="button"
                              className="sm ghost"
                              onClick={() => setRouteInfo(null)}
                            >
                              不用
                            </button>
                          </span>
                        </p>
                      )}
                      {clarify && (
                        <div>
                          <p className="hint">{clarify.question}</p>
                          <div className="row">
                            {clarify.options.map((o) => (
                              <button
                                key={o}
                                type="button"
                                className="sm"
                                onClick={() => {
                                  setClarifyAnswer(o);
                                  void recommendMethod(o);
                                }}
                              >
                                {o}
                              </button>
                            ))}
                            <input
                              style={{ width: 120 }}
                              value={clarifyAnswer}
                              onChange={(e) => setClarifyAnswer(e.target.value)}
                              placeholder="自定义"
                            />
                            <button
                              type="button"
                              className="sm primary"
                              onClick={() => void recommendMethod(clarifyAnswer)}
                            >
                              提交
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. 起卦法（可折叠） */}
                    <div className="row" style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setMethodOpen((v) => !v)}
                      >
                        {methodOpen ? '收起起卦法' : '展开起卦法'} · 当前：
                        {METHOD_LABELS.find((x) => x.id === method)?.label ?? method}
                      </button>
                    </div>
                    {methodOpen && (
                      <div className="method-wrap">
                        {METHOD_GROUPS.map((g) => (
                          <div key={g} className="method-grid">
                            {METHOD_LABELS.filter((m) => m.group === g).map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className={`method-card${method === m.id ? ' active' : ''}`}
                                onClick={() => {
                                  setMethod(m.id);
                                  setMethodOpen(false);
                                }}
                              >
                                <strong>{m.label}</strong>
                                <span className="muted">{g}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 4. 参数区 */}
                    <div className="form">
                      {(method === 'number3' ||
                        method === 'number2' ||
                        method === 'number1') && (
                        <label>
                          报数（逗号分隔）
                          <input
                            value={numbers}
                            placeholder="31, 25, 9"
                            onChange={(e) => setNumbers(e.target.value)}
                          />
                        </label>
                      )}
                      {(method === 'objectCount' || method === 'sound') && (
                        <label>
                          数量
                          <input
                            value={count}
                            onChange={(e) => setCount(e.target.value)}
                          />
                        </label>
                      )}
                      {method === 'text' && (
                        <label>
                          文字
                          <input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                          />
                        </label>
                      )}
                      {method === 'measureZhangChi' && (
                        <>
                          <label>
                            丈
                            <input
                              value={zhang}
                              onChange={(e) => setZhang(e.target.value)}
                            />
                          </label>
                          <label>
                            尺
                            <input
                              value={chi}
                              onChange={(e) => setChi(e.target.value)}
                            />
                          </label>
                          <p className="hint">按所报数直填，不做单位换算</p>
                        </>
                      )}
                      {method === 'measureChiCun' && (
                        <>
                          <label>
                            尺
                            <input
                              value={chi}
                              onChange={(e) => setChi(e.target.value)}
                            />
                          </label>
                          <label>
                            寸
                            <input
                              value={cun}
                              onChange={(e) => setCun(e.target.value)}
                            />
                          </label>
                        </>
                      )}
                      {method === 'datetime' && (
                        <label>
                          时间
                          <input
                            type="datetime-local"
                            value={timeLocal}
                            onChange={(e) => setTimeLocal(e.target.value)}
                          />
                        </label>
                      )}
                      {method === 'direction' && (
                        <>
                          <label>
                            自然语言取象（如：老人往东南）
                            <input
                              value={directionNote}
                              placeholder="老人往东南 / 见火在南方"
                              onChange={(e) => setDirectionNote(e.target.value)}
                            />
                          </label>
                          <div className="row">
                            <button
                              type="button"
                              className="sm"
                              onClick={() => void parseDirection()}
                            >
                              解析取象
                            </button>
                            {dirParse && (
                              <span className="badge">
                                {dirParse.labels?.object ?? ''}→{guaZh(dirParse.objectGua)}，
                                {dirParse.labels?.direction ?? ''}→
                                {guaZh(dirParse.directionGua)}
                              </span>
                            )}
                          </div>
                          <label>
                            人物象（可选，优先于手选卦）
                            <select
                              value={personKey}
                              onChange={(e) => setPersonKey(e.target.value)}
                            >
                              {guaOptions}
                            </select>
                          </label>
                          <label>
                            物象卦（回退）
                            <select
                              value={objectGua}
                              onChange={(e) => setObjectGua(e.target.value)}
                            >
                              {GUA_ORDER.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.zh}({g.num})
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            方位卦（回退）
                            <select
                              value={directionGua}
                              onChange={(e) => setDirectionGua(e.target.value)}
                            >
                              {GUA_ORDER.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.zh}({g.num})
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}
                      <label>
                        时支
                        <select value={hourZhi} onChange={(e) => setHourZhi(e.target.value)}>
                          {ZHI_BY_NUM.map((z, i) => (
                            <option key={z} value={String(i + 1)}>
                              {z}（{i + 1}）
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="hint">
                        流派：{schoolMoving === 'sum' ? '总和派' : '取模派'} ·{' '}
                        {schoolHint(method)}
                      </p>
                      {routeInfo?.missing?.length ? (
                        <p className="field-error">
                          推荐法还缺：{routeInfo.missing.join('、')}
                        </p>
                      ) : null}
                      {formError && <p className="field-error">{formError}</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <h2>本卦摘要</h2>
                    <p>
                      <b>{cast?.ben.name}</b>
                      {cast ? ` 之 ${cast.bian.name}` : ''}
                    </p>
                    <p className="muted">{question}</p>
                    <p className="hint">
                      已起卦，表单已锁定；同事仅可追问/插话，禁止再起卦。
                    </p>
                    <button type="button" className="ghost" onClick={newSession}>
                      开新事
                    </button>
                  </>
                )}

                <div className="row left-cta">
                  {!locked ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void startCast()}
                      disabled={!personId || backendDown}
                    >
                      起卦
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void interpret()}
                      disabled={!caseId || !cast || running || backendDown}
                    >
                      {running ? '解卦中…' : '解卦'}
                    </button>
                  )}
                  {running && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => abortSse()}
                    >
                      停止
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="col mid">
              <h2>排盘与九步</h2>
              {!cast && !steps.length && (
                <div className="empty-state">
                  <strong>尚未起卦</strong>
                  左侧填写问题与起卦信息，点「起卦」查看算式与三重卦盘。
                  {!personId && '（请先选择档案）'}
                  {!!personId && recentCases.length > 0 && (
                    <div style={{ marginTop: 12, textAlign: 'left' }}>
                      <p className="muted">最近问卦</p>
                      <ul>
                        {recentCases.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="ghost sm"
                              onClick={() => {
                                setCaseId(c.id);
                                if (c.sessionId) setSessionId(c.sessionId);
                                setStatus(`已打开案例 ${c.id.slice(0, 8)}…`);
                              }}
                            >
                              {c.question.slice(0, 24) || '（无标题）'}
                              {c.hex ? ` · ${c.hex}` : ''}
                            </button>
                            <span className="muted"> {c.date}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {cast && (
                <div className="panel">
                  {cast.formula?.length > 0 && (
                    <>
                      <div className="formula-summary">
                        <div className="formula-flow">
                          <b>本</b> {cast.ben.name}
                          <span className="arrow">→</span>
                          <b>互</b> {cast.hu?.name || '—'}
                          <span className="arrow">→</span>
                          <b>变</b> {cast.bian.name}
                        </div>
                        <div className="formula-meta">
                          <span className="badge">动爻 {cast.movingYao}</span>
                          <span className="badge">{schoolHint(method)}</span>
                          <span className="badge">
                            {schoolMoving === 'sum' ? '总和派' : '取模派'}
                          </span>
                        </div>
                      </div>
                      <details className="formula-full">
                        <summary>展开完整算式</summary>
                        <ol className="formula-list">
                          {cast.formula.map((f, i) => (
                            <li key={i}>
                              <span className="fl-label">{f.label}</span>
                              <span className="fl-expr">
                                {f.expr}
                                {f.note ? <em>（{f.note}）</em> : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    </>
                  )}
                  <div className={`hex-strip${hexFull ? ' full' : ' mini'}`}>
                    <div className="hex-strip-bar">
                      <div className="formula-meta">
                        <span className="badge">动爻 {cast.movingYao}</span>
                        <span className="badge">{cast.tiYongNote}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setHexFull((v) => !v)}
                      >
                        {hexFull ? '收起大图' : '放大看盘'}
                      </button>
                    </div>
                    {qiSegs.length > 0 && (
                      <div className="qi-panel">
                        <div className="qi-tiyong">
                          <div className="qi-card ti">
                            <b>体 · 我/主</b>
                            <span>
                              {GUA_NAME_ZH[qiSegs[0]!.ti] ?? qiSegs[0]!.ti}
                              （{qiSegs[0]!.tiEl}）
                            </span>
                            <em>
                              {qiSegs[0]!.ti === cast.ben.lower ? '下卦' : '上卦'}
                            </em>
                          </div>
                          <div className="qi-flow">
                            <span>
                              {qiSegs[0]!.yongEl}
                              {qiSegs[0]!.relation === 'bi_he'
                                ? ' ≡ '
                                : qiSegs[0]!.flow === 'yong_to_ti'
                                  ? ' → '
                                  : ' ⇐ '}
                              {qiSegs[0]!.tiEl}
                            </span>
                            <b>{qiSegs[0]!.label}</b>
                            <em>{qiSegs[0]!.plain}</em>
                          </div>
                          <div className="qi-card yong">
                            <b>用 · 事/客</b>
                            <span>
                              {GUA_NAME_ZH[qiSegs[0]!.yong] ?? qiSegs[0]!.yong}
                              （{qiSegs[0]!.yongEl}）
                            </span>
                            <em>
                              {qiSegs[0]!.yong === cast.ben.lower ? '下卦·动所在' : '上卦·动所在'}
                            </em>
                          </div>
                        </div>
                        <div className="qi-stages">
                          {qiSegs.map((s) => (
                            <span key={s.stage} className="badge">
                              {s.stage === 'ben' ? '本' : s.stage === 'hu' ? '互' : '变'}：
                              {s.label}
                            </span>
                          ))}
                          <span className="muted">趋势：{qiTrendPlain(qiSegs)}</span>
                        </div>
                      </div>
                    )}
                    {hexFull ? (
                      <div
                        className="hexboards reveal"
                        key={cast.ben.name + cast.movingYao}
                      >
                        <HexBoard
                          kind="ben"
                          name={cast.ben.name}
                          lines={cast.ben.lines}
                          movingYao={cast.movingYao as 1 | 2 | 3 | 4 | 5 | 6}
                          tiYong={tiYongOn.ben}
                          guaPair={{
                            upper: cast.ben.upper,
                            lower: cast.ben.lower,
                          }}
                        />
                        <HexBoard
                          kind="hu"
                          name={cast.hu?.name ?? ''}
                          lines={huLines}
                          guaPair={{
                            upper: (cast.hu as { upper?: string })?.upper ?? '',
                            lower: (cast.hu as { lower?: string })?.lower ?? '',
                          }}
                        />
                        <HexBoard
                          kind="bian"
                          name={cast.bian.name}
                          lines={cast.bian.lines}
                          movingYao={cast.movingYao as 1 | 2 | 3 | 4 | 5 | 6}
                          markBian
                          guaPair={{
                            upper: cast.bian.upper,
                            lower: cast.bian.lower,
                          }}
                        />
                      </div>
                    ) : (
                      <div className="hex-mini-row">
                        {(
                          [
                            ['本', cast.ben.name, cast.ben.lines, true],
                            ['互', cast.hu?.name ?? '', huLines, false],
                            ['变', cast.bian.name, cast.bian.lines, false],
                          ] as const
                        ).map(([kind, name, lines, isBen]) => (
                          <div key={kind} className="hex-mini">
                            <div className="hex-mini-head">
                              <span>{kind}</span>
                              <b>{name || '—'}</b>
                            </div>
                            <div className="hex-mini-yao">
                              {[5, 4, 3, 2, 1, 0].map((i) => {
                                const v = lines[i] ?? 8;
                                const yang = v === 7 || v === 9;
                                const moving =
                                  isBen && cast.movingYao === i + 1;
                                return (
                                  <i
                                    key={i}
                                    className={`${yang ? 'yang' : 'yin'}${moving ? ' moving' : ''}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(steps.length > 0 || running) && (
                <>
                  <div className="step-progress">
                    <span>
                      解卦进度 {doneCount}/{steps.length || 9}
                    </span>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.round((doneCount / 9) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="step-list-wrap">
                  <ul className="step-list">
                    {(steps.length
                      ? steps
                      : ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => ({
                          stepId: n as StepState['stepId'],
                          status: 'pending' as StepState['status'],
                          conclusion: '',
                          sources: [] as StepState['sources'],
                          evidence: undefined,
                          reasoningNote: undefined,
                        }))
                    ).map((s) => {
                      const open = expandedStep === s.stepId;
                      const summary =
                        s.status === 'running' && !s.conclusion
                          ? '解卦中…'
                          : truncateLine(s.conclusion || '');
                      return (
                        <li
                          key={s.stepId}
                          className={`step-card${running && s.status === 'running' ? ' active' : ''}${open ? ' open' : ''}`}
                        >
                          <button
                            type="button"
                            className="step-row"
                            aria-expanded={open}
                            onClick={() => setExpandedStep(open ? null : s.stepId)}
                          >
                            <div className="step-rail">
                              <span
                                className={`step-dot ${s.status === 'running' && running ? 'running' : s.status}`}
                              />
                            </div>
                            <div className="step-brief">
                              <b className="step-title">
                                {s.stepId}. {STEP_TITLES[s.stepId] ?? ''}
                              </b>
                              <span className="step-sum">{summary}</span>
                            </div>
                            <span
                              className={`badge ${
                                s.status === 'confirmed'
                                  ? 'ok'
                                  : s.status === 'failed'
                                    ? 'danger'
                                    : s.status === 'need_key' ||
                                        s.status === 'skipped_by_method'
                                      ? 'warn'
                                      : ''
                              }`}
                            >
                              {statusLabel(s.status)}
                            </span>
                            <span className="muted">{open ? '收起' : '展开'}</span>
                          </button>
                          {open && (
                            <div className="step-detail">
                              {s.status === 'running' && !s.conclusion ? (
                                <div className="skeleton" />
                              ) : (
                                <p className="conclusion">{plainText(s.conclusion)}</p>
                              )}
                              {s.evidence && (
                                <p className="evidence">{plainText(s.evidence)}</p>
                              )}
                              {s.reasoningNote && (
                                <p className="reasoning">{plainText(s.reasoningNote)}</p>
                              )}
                              {!!s.sources?.length && (
                                <details>
                                  <summary className="muted">依据</summary>
                                  <ul>
                                    {s.sources.map((src, i) => (
                                      <li key={i}>
                                        {src.title}
                                        {src.id ? `（${src.id}）` : ''}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                              <div className="step-actions">
                                <button
                                  type="button"
                                  className="ghost sm"
                                  onClick={() => {
                                    setReviseOpen(
                                      reviseOpen === s.stepId ? null : s.stepId,
                                    );
                                    setReviseText('');
                                  }}
                                >
                                  插话
                                </button>
                              </div>
                              {reviseOpen === s.stepId && (
                                <div className="step-revise">
                                  <textarea
                                    rows={2}
                                    value={reviseText}
                                    placeholder="纠偏说明，提交后从本步重算"
                                    onChange={(e) => setReviseText(e.target.value)}
                                  />
                                  <div className="row">
                                    <button
                                      type="button"
                                      className="primary sm"
                                      disabled={!reviseText || running}
                                      onClick={() => void doRevise(s.stepId)}
                                    >
                                      重算本步
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost sm"
                                      onClick={() => setReviseOpen(null)}
                                    >
                                      取消
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                </>
              )}

              {verdict && (
                <article className="card verdict">
                  <button
                    type="button"
                    className="verdict-bar"
                    aria-expanded={verdictOpen}
                    onClick={() => setVerdictOpen((v) => !v)}
                  >
                    <span className={gradeClass(verdict.grade)}>
                      {gradeLabel(verdict.grade)}
                    </span>
                    <span className="verdict-sum">
                      {truncateLine(verdict.summary, 36)}
                    </span>
                    <span className="muted">
                      {verdictOpen ? '收起' : '展开占断书'}
                    </span>
                  </button>
                  {verdictOpen && (
                  <div className="verdict-detail">
                  <div className="verdict-head">
                    <span className={gradeClass(verdict.grade)}>
                      {gradeLabel(verdict.grade)}
                    </span>
                    <b>占断书</b>
                  </div>
                  <div className="verdict-section">
                    <h4>总断</h4>
                    <p>{verdict.summary}</p>
                  </div>
                  {verdict.advice?.length > 0 && (
                    <div className="verdict-section">
                      <h4>建议</h4>
                      <ul>
                        {verdict.advice.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {verdict.risks?.length > 0 && (
                    <div className="verdict-section">
                      <h4>风险</h4>
                      <ul>
                        {verdict.risks.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="verdict-section">
                    <h4>应期</h4>
                    <p className="muted">{verdict.timing}</p>
                  </div>
                  {verdict.basedOnSteps?.length > 0 && (
                    <p className="muted">
                      主断依据步骤：{verdict.basedOnSteps.join('、')}
                    </p>
                  )}
                  <div className="row">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        if (caseId) setOpenFeedbackCaseId(caseId);
                        setPage('cases');
                      }}
                    >
                      去回填实际
                    </button>
                  </div>
                  </div>
                  )}
                </article>
              )}
            </section>

            <section className="col right">
              <h2>对话</h2>
              <div className="chat chat-scroll" onScroll={onChatScroll}>
                {chat.length === 0 && (
                  <p className="muted">
                    起卦后这里会显示过程；可同卦追问（不重起）。
                  </p>
                )}
                {chat.map((m) => {
                  const text = plainText(m.content);
                  const isLongFollow = m.kind === 'followup' && text.length > 200;
                  const shown =
                    isLongFollow && !followExpanded ? `${text.slice(0, 200)}…` : text;
                  return (
                    <div key={m.id} className={`bubble ${m.role} ${m.kind ?? ''}`}>
                      {shown}
                      {isLongFollow && (
                        <button
                          type="button"
                          className="ghost sm"
                          onClick={() => setFollowExpanded((v) => !v)}
                        >
                          {followExpanded ? '收起' : '展开全文'}
                        </button>
                      )}
                    </div>
                  );
                })}
                {need && (
                  <div className="bubble assistant need">
                    <p>{plainText(need.question)}</p>
                    {need.options?.length ? (
                      <div className="row">
                        {need.options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            className="sm"
                            onClick={() => setAnswer(o)}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="可跳过"
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      记入记忆
                    </label>
                    <div className="row">
                      <button
                        type="button"
                        className="primary sm"
                        onClick={() => {
                          setChatPinned(true);
                          return void submitResume(false);
                        }}
                      >
                        提交
                      </button>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => {
                          setChatPinned(true);
                          return void submitResume(true);
                        }}
                      >
                        跳过并继续
                      </button>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {!chatPinned && (
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => {
                    setChatPinned(true);
                    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  回到底部
                </button>
              )}
              <div className="chat-input-row">
                <input
                  value={followText}
                  onChange={(e) => setFollowText(e.target.value)}
                  placeholder="同卦追问（不重起）"
                  disabled={!hasKey || !caseId}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void doFollowup();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!hasKey || !caseId}
                  onClick={() => void doFollowup()}
                >
                  发送
                </button>
              </div>
              <p className="hint">
                插话请在中栏对应步骤卡内操作；此处仅同卦追问。
              </p>
              <p className="status">{status}</p>
            </section>
          </main>
        </div>
      )}

      <p className="disclaimer">
        本应用仅供娱乐与学习，不构成医疗、法律或投资建议。记忆仅影响解释与措辞，不改变卦与算式。
      </p>
    </div>
  );
}
