import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HEXAGRAM_TABLE,
  GUA_NAME_ZH,
  GUA_IDS,
  CLOSENESS_LABEL,
  REL_GROUPS,
  REL_LABEL,
  REL_LEVEL,
  closenessZh,
  computeProfileAxes,
  buildProfileCopy,
  relZh,
  RADAR_MIN_CASES,
  cuoGua,
  huFromBen,
  labelDual,
  zongGua,
  type Gua,
  type ProfileAxes,
} from '@meihua/shared';
import { errText, apiClient, type MessageRow } from '../api/client';
import {
  ConfirmDialog,
  EmptyState,
  PromptDialog,
  SkeletonRows,
  toast,
} from '../components/ui';
import { HexBoard, dualToLines, guaZh } from '../components/HexBoard';
import { SignModal } from '../components/SignModal';
import { ProfileRadar } from '../components/ProfileRadar';
import { RelationGraph } from '../components/RelationGraph';

/** 简单去 Markdown 符号（对话记录展示用） */
function plainTextSafe(s: string): string {
  return String(s ?? '')
    .replace(/[#*`>_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function prettyGuaText(s: string): string {
  let out = s ?? '';
  for (const id of GUA_IDS) {
    const zh = GUA_NAME_ZH[id] ?? guaZh(id);
    // 仅替换「体/用/互 + 卦id」避免误伤普通英文
    out = out
      .split(`体${id}`)
      .join(`体${zh}`)
      .split(`用${id}`)
      .join(`用${zh}`)
      .split(`互${id}`)
      .join(`互${zh}`);
  }
  return out;
}

type Props = {
  personId: string | null;
  onExport: () => void;
  openCaseId?: string | null;
  onOpenCaseConsumed?: () => void;
  onSelectPerson?: (id: string) => void;
  onGotoSettings?: () => void;
  /** 案例被删除后（供工作台清理当前案例） */
  onCaseDeleted?: (id: string) => void;
  /** 在问卦台打开该案例（回放对话/九步） */
  onOpenInWorkbench?: (caseId: string) => void;
};

type CaseRow = {
  id: string;
  input: { question: string; category?: string };
  method?: string;
  createdAt: string;
  accuracy?: string | null;
  feedbackAt?: string | null;
  actual?: string | null;
  cast?: {
    ben: { name: string; lines: number[]; upper: string; lower: string };
    bian: { name: string; lines: number[] };
    hu?: { upper: string; lower: string; name?: string };
    movingYao: number;
    tiYongNote?: string;
    formula?: { label: string; expr: string; note?: string }[];
  };
};

const METHOD_ZH: Record<string, string> = {
  number1: '一数报数',
  number2: '二数报数',
  number3: '三数报数',
  datetime: '年月日时',
  objectCount: '物数占',
  sound: '声音占',
  text: '字占',
  measure: '丈尺占',
  measureZhangChi: '丈尺占',
  measureChiCun: '尺寸占',
  direction: '端法/为人占',
};

function methodZh(m?: string) {
  if (!m) return '';
  return METHOD_ZH[m] ?? m;
}

type Feedback = {
  actual?: string;
  accuracy?: string;
  deviation_notes?: string;
  deviation_steps_json?: string;
} | null;

function accuracyDot(acc?: string | null) {
  if (acc === 'yes') return 'yes';
  if (acc === 'partial') return 'partial';
  if (acc === 'no') return 'no';
  return '';
}

function accuracyLabel(acc?: string | null) {
  if (acc === 'yes') return '是';
  if (acc === 'partial') return '部分';
  if (acc === 'no') return '否';
  return '未回填';
}

export function CasesPage({
  personId,
  onExport: _onExport,
  openCaseId,
  onOpenCaseConsumed,
  onSelectPerson,
  onGotoSettings,
  onCaseDeleted,
  onOpenInWorkbench,
}: Props) {
  const [navPersons, setNavPersons] = useState<
    Array<{ id: string; name: string; caseCount?: number }>
  >([]);
  const [selectedPid, setSelectedPid] = useState<string | null>(personId);
  const [casesTab, setCasesTab] = useState<'list' | 'info' | 'graph'>('list');
  const [graphData, setGraphData] = useState<{
    centerId?: string | null;
    persons: Array<{
      id: string;
      name: string;
      kind: string;
      createdAt?: string;
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
  } | null>(null);
  const [pickedNode, setPickedNode] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<Record<string, string>>({
    name: '',
    kind: 'other',
    relCode: 'other',
    label: '',
    closeness: '3',
    stage: '',
    cares: '',
    workStyle: '',
    nature: '',
    taboo: '',
  });
  const [profileMoreOpen, setProfileMoreOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | string>('all');
  const [closeFilter, setCloseFilter] = useState<'all' | '1-2' | '3' | '4-5'>(
    'all',
  );
  const [clusterTemp, setClusterTemp] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | '7' | '30'>('all');
  const [all, setAll] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const reqIdRef = useRef(0);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<{
    id: string;
    input: { question: string };
    method?: string;
    cast?: CaseRow['cast'];
    steps: {
      stepId: number;
      conclusion: string;
      status: string;
      reasoningNote?: string;
    }[];
    verdict?: {
      grade: string;
      summary: string;
      advice?: string[];
      timing?: string;
      poem?: {
        text?: string;
        lines?: [string, string] | string[];
        source?: string;
      };
    };
    feedback: Feedback;
    messages?: MessageRow[];
  } | null>(null);
  const [delTarget, setDelTarget] = useState<CaseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actual, setActual] = useState('');
  const [accuracy, setAccuracy] = useState<'yes' | 'partial' | 'no'>('yes');
  const [devNotes, setDevNotes] = useState('');
  const [devSteps, setDevSteps] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [accFilter, setAccFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'time' | 'acc'>('time');
  const [showForm, setShowForm] = useState(false);
  const [signOpen, setSignOpen] = useState(false);

  // 左列与顶栏解耦（C-23）：仅首次用顶栏做默认，之后不跟随
  const initedPid = useRef(false);
  useEffect(() => {
    if (initedPid.current) return;
    if (personId) {
      setSelectedPid(personId);
      initedPid.current = true;
    }
  }, [personId]);
  useEffect(() => {
    if (!personId && navPersons.length && !initedPid.current) {
      setSelectedPid(navPersons[0]!.id);
      initedPid.current = true;
    }
  }, [personId, navPersons]);

  const pid = selectedPid;

  const reload = useCallback(async () => {
    if (!pid) return;
    const token = ++reqIdRef.current;
    setLoading(true);
    try {
      const [c, s, plist] = await Promise.all([
        apiClient.listCases(pid),
        apiClient.stats(pid),
        apiClient.listPersons(),
      ]);
      if (token !== reqIdRef.current) return;
      setAll(c.cases as never);
      setStats(s as never);
      setNavPersons(
        (plist.persons as Array<{ id: string; name: string; caseCount?: number }>).map(
          (p) => ({
            id: p.id,
            name: p.name,
            caseCount: p.caseCount ?? 0,
          }),
        ),
      );
    } catch (e) {
      toast('error', errText(e));
    } finally {
      if (token === reqIdRef.current) setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 切换档案重置筛选（C-22）
  useEffect(() => {
    setQ('');
    setAccFilter('all');
    setMethodFilter('all');
    setSortBy('time');
    setDetail(null);
  }, [pid]);

  const openDetail = useCallback(async (id: string, focusFeedback = false) => {
    try {
      const b = (await apiClient.getCase(id)) as unknown as {
        case: {
          id: string;
          input: { question: string };
          method?: string;
          cast?: CaseRow['cast'];
          verdict?: { grade: string; summary: string; advice?: string[]; timing?: string };
        };
        steps: { stepId: number; conclusion: string; status: string; reasoningNote?: string }[];
        feedback: Feedback;
        messages?: MessageRow[];
      };
      // C-24：压平，使 detail.id / input / cast 与 JSX 一致
      const flat = {
        ...(b.case ?? {}),
        steps: b.steps ?? [],
        feedback: b.feedback ?? null,
        messages: b.messages ?? [],
      } as never;
      setDetail(flat);
      setActual(b.feedback?.actual ?? '');
      const prevAcc = b.feedback?.accuracy as 'yes' | 'partial' | 'no' | undefined;
      setAccuracy(prevAcc ?? 'yes');
      setDevNotes(b.feedback?.deviation_notes ?? '');
      setDevSteps(
        b.feedback?.deviation_steps_json
          ? (JSON.parse(String(b.feedback.deviation_steps_json)) as number[])
          : [],
      );
      setShowForm(focusFeedback || !b.feedback?.accuracy);
      // C-25：滚到详情/回填
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (e) {
      toast('error', errText(e));
    }
  }, []);

  useEffect(() => {
    if (!openCaseId) return;
    void openDetail(openCaseId, true);
    onOpenCaseConsumed?.();
  }, [openCaseId, openDetail, onOpenCaseConsumed]);

  const loadProfileInfo = useCallback(async (id: string) => {
    try {
      const r = await apiClient.getProfileInfo(id);
      const i = (r.info ?? {}) as Record<string, unknown>;
      setProfileForm({
        name: String(i.name ?? ''),
        kind: String(i.kind ?? 'other'),
        relCode: String(i.relCode ?? 'other'),
        label: String(i.label ?? ''),
        closeness: String(i.closeness ?? '3'),
        stage: String(i.stage ?? ''),
        cares: String(i.cares ?? ''),
        workStyle: String(i.workStyle ?? ''),
        nature: String(i.nature ?? ''),
        taboo: String(i.taboo ?? ''),
      });
    } catch (e) {
      toast('error', errText(e));
    }
  }, []);

  const loadGraph = useCallback(async (id: string) => {
    try {
      const g = await apiClient.getGraph(id);
      setGraphData({
        centerId: (g as { centerId?: string | null }).centerId ?? null,
        persons: g.persons,
        relations: g.relations,
      });
    } catch (e) {
      toast('error', errText(e));
    }
  }, []);

  const graphView = useMemo(() => {
    if (!graphData) return null;
    const centerId = graphData.centerId ?? pid ?? undefined;
    const infoById = new Map(
      graphData.persons.map((p) => [p.id, p.info] as const),
    );
    const levelOfPerson = (id: string) => {
      const code = String(infoById.get(id)?.relCode ?? 'other');
      return (REL_LEVEL as Record<string, string>)[code] ?? 'other';
    };
    const closenessOf = (id: string) =>
      Number(infoById.get(id)?.closeness ?? 3);
    const withinDays = (iso: string | undefined, days: number) => {
      if (!iso) return true;
      const t = Date.parse(iso);
      if (Number.isNaN(t)) return true;
      return Date.now() - t <= days * 86400000;
    };
    let persons = graphData.persons.filter((p) => {
      if (p.id === centerId) return true;
      if (timeFilter !== 'all' && !withinDays(p.createdAt, Number(timeFilter))) {
        return false;
      }
      if (levelFilter !== 'all' && levelOfPerson(p.id) !== levelFilter) {
        return false;
      }
      const c = closenessOf(p.id);
      if (closeFilter === '1-2' && c > 2) return false;
      if (closeFilter === '3' && c !== 3) return false;
      if (closeFilter === '4-5' && c < 4) return false;
      return true;
    });
    let relations = graphData.relations.filter(
      (r) =>
        r.fromId === centerId && persons.some((p) => p.id === r.toId),
    );
    if (clusterTemp) {
      const tempIds = persons
        .filter((p) => p.id !== centerId && levelOfPerson(p.id) === 'temp')
        .map((p) => p.id);
      if (tempIds.length > 1) {
        const set = new Set(tempIds);
        persons = persons.filter((p) => !set.has(p.id));
        persons.push({
          id: '__cluster_temp__',
          name: `临时 · ${tempIds.length}`,
          kind: 'other',
          info: { relCode: 'stranger', closeness: 2 },
        });
        relations = relations.filter((r) => !set.has(r.toId));
        relations.push({
          id: 'cluster-temp',
          fromId: centerId ?? '',
          toId: '__cluster_temp__',
          relCode: 'stranger',
          label: null,
          closeness: 2,
        });
      }
    }
    return { centerId, persons, relations };
  }, [graphData, levelFilter, closeFilter, clusterTemp, timeFilter, pid]);

  async function doDeleteCase() {
    if (!delTarget || deleting) return;
    setDeleting(true);
    try {
      const r = await apiClient.deleteCase(delTarget.id);
      toast(
        'ok',
        `已删除：九步 ${r.deleted.steps} · 对话 ${r.deleted.messages} · 记忆 ${r.deleted.memories}`,
      );
      if (detail?.id === delTarget.id) setDetail(null);
      onCaseDeleted?.(delTarget.id);
      setDelTarget(null);
      await reload();
    } catch (e) {
      toast('error', errText(e));
    } finally {
      setDeleting(false);
    }
  }

  async function saveFeedback() {
    if (!detail) return;
    try {
      await apiClient.feedback(detail.id, {
        actual,
        accuracy,
        deviationNotes: devNotes,
        deviationSteps: devSteps,
      });
      const who = selectedName || '当前档案';
      toast('ok', `已回填并写入「${who}」的记忆（不影响算式）`);
      await openDetail(detail.id, true);
      await reload();
    } catch (e) {
      toast('error', errText(e));
    }
  }

  const st = (stats ?? {}) as {
    total?: number;
    filled?: number;
    composite?: number | null;
    accuracyDist?: Record<string, number>;
    byDeviationStep?: Record<string, number>;
    byMethod?: Record<string, number>;
  };

  const filtered = useMemo(() => {
    let list = all.slice();
    if (q.trim()) {
      const k = q.trim();
      list = list.filter((c) => c.input?.question?.includes(k));
    }
    if (methodFilter !== 'all') {
      list = list.filter((c) => (c.method ?? '') === methodFilter);
    }
    if (accFilter === 'none') {
      list = list.filter((c) => !c.accuracy);
    } else if (accFilter !== 'all') {
      list = list.filter((c) => (c.accuracy ?? '') === accFilter);
    }
    const accRank: Record<string, number> = { no: 0, partial: 1, yes: 2, '': 3 };
    if (sortBy === 'acc') {
      list.sort((a, b) => {
        const ra = accRank[a.accuracy ?? ''] ?? 3;
        const rb = accRank[b.accuracy ?? ''] ?? 3;
        if (ra !== rb) return ra - rb;
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      });
    } else {
      list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    }
    return list;
  }, [all, q, methodFilter, sortBy, accFilter]);

  const methods = useMemo(() => {
    const s = new Set<string>();
    all.forEach((c) => {
      if (c.method) s.add(c.method);
    });
    return [...s];
  }, [all]);

  const dist = st.accuracyDist ?? { yes: 0, partial: 0, no: 0 };
  const totalDist = (dist.yes ?? 0) + (dist.partial ?? 0) + (dist.no ?? 0) || 1;
  const fillRatio = st.total ? Math.round(((st.filled ?? 0) / st.total) * 100) : 0;
  const selectedName =
    navPersons.find((p) => p.id === pid)?.name ?? '';

  return (
    <div className="page-fade">
      <div className="row cases-toolbar">
        <span className="spacer" />
        <button
          type="button"
          className="ghost sm"
          onClick={() => {
            if (!pid) return;
            void apiClient
              .exportPerson(pid)
              .then((data) => {
                const safe = (selectedName || 'person').replace(/[\\/:*?"<>|]/g, '_');
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: 'application/json',
                });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `export-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              })
              .catch((e) => toast('error', errText(e)));
          }}
        >
          导出
        </button>
      </div>

      <div className="filter-bar" role="tablist" aria-label="案例页分栏">
        {(
          [
            ['list', '案例列表'],
            ['info', '档案信息'],
            // 关系图谱：用户拍板「后面补充」，入口暂隐藏（代码与迁移保留）
            ['graph', '关系图谱'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`chip${casesTab === k ? ' active' : ''}`}
            onClick={() => {
              setCasesTab(k);
              if (k === 'graph' && pid) void loadGraph(pid);
              if (k === 'info' && pid) void loadProfileInfo(pid);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {casesTab === 'info' ? (
        <div className="panel profile-form-panel">
          <div className="row">
            <h3>档案资料</h3>
            <span className="spacer" />
            <select
              value={pid ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedPid(id);
                onSelectPerson?.(id);
                if (id) void loadProfileInfo(id);
              }}
              style={{ width: 'auto' }}
            >
              <option value="">选择档案</option>
              {navPersons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <p className="hint">
            只用于让解卦知道「这是谁」与图谱关系；不影响卦与吉凶。
          </p>
          {!pid ? (
            <EmptyState
              title="先选一个档案"
              desc="在上方选择要编辑的档案；没有的话去文房新建。"
            />
          ) : (
            <>
              <div className="form-group">
                <h4>基本</h4>
                <div className="form-grid">
                  <label>
                    称谓 *
                    <input
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    档案类型
                    <select
                      value={profileForm.kind}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, kind: e.target.value }))
                      }
                    >
                      {(
                        [
                          ['self', '本人'],
                          ['family', '家人'],
                          ['friend', '朋友'],
                          ['stranger', '陌生人'],
                          ['other', '其他'],
                        ] as const
                      ).map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <h4>与我的关系</h4>
                <div className="form-grid">
                  <label>
                    关系 *
                    <select
                      value={profileForm.relCode}
                      onChange={(e) =>
                        setProfileForm((f) => ({
                          ...f,
                          relCode: e.target.value,
                        }))
                      }
                    >
                      {REL_GROUPS.map((g) => (
                        <optgroup key={g.level} label={g.label}>
                          {g.codes.map((c) => (
                            <option key={c} value={c}>
                              {REL_LABEL[c]}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  {profileForm.relCode === 'other' ? (
                    <label>
                      自定义称谓
                      <input
                        value={profileForm.label}
                        placeholder="如：师父 / 邻居家小孩"
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            label: e.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
                <p className="hint field-caption">
                  亲疏（选填，默认「常来常往」；只影响语气与图谱连线）
                </p>
                <div className="seg closeness-seg" role="radiogroup" aria-label="亲疏">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={
                        String(v) === profileForm.closeness ? 'active' : ''
                      }
                      onClick={() =>
                        setProfileForm((f) => ({
                          ...f,
                          closeness: String(v),
                        }))
                      }
                    >
                      {v} · {CLOSENESS_LABEL[v]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => setProfileMoreOpen((v) => !v)}
                >
                  {profileMoreOpen ? '收起完善资料' : '完善资料（可选）'}
                </button>
                {profileMoreOpen ? (
                  <div className="form-grid form-grid-3">
                    <label>
                      身份阶段
                      <input
                        value={profileForm.stage}
                        placeholder="上学 / 工作 / 退休…"
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, stage: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      常关心
                      <input
                        value={profileForm.cares}
                        placeholder="找东西 / 工作 / 关系…"
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, cares: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      处事偏好
                      <input
                        value={profileForm.workStyle}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            workStyle: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      性格自述
                      <input
                        value={profileForm.nature}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            nature: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      忌讳
                      <input
                        value={profileForm.taboo}
                        onChange={(e) =>
                          setProfileForm((f) => ({ ...f, taboo: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="row profile-save-row">
                <button
                  type="button"
                  className="primary"
                  disabled={!pid || !profileForm.name}
                  onClick={() => {
                    if (!pid) return;
                    void apiClient
                      .putProfileInfo(pid, {
                        name: profileForm.name,
                        kind: profileForm.kind,
                        relCode: profileForm.relCode,
                        label: profileForm.label || undefined,
                        closeness: Number(profileForm.closeness) || 3,
                        stage: profileForm.stage || undefined,
                        cares: profileForm.cares || undefined,
                        workStyle: profileForm.workStyle || undefined,
                        nature: profileForm.nature || undefined,
                        taboo: profileForm.taboo || undefined,
                      })
                      .then(() => {
                        toast('ok', `已保存「${profileForm.name}」的资料`);
                        return reload();
                      })
                      .catch((e) => toast('error', errText(e)));
                  }}
                >
                  保存档案资料
                </button>
                <span className="hint">
                  解卦时会带上：{relZh(profileForm.relCode)} ·{' '}
                  {closenessZh(Number(profileForm.closeness))}
                  {profileForm.name ? ` · ${profileForm.name}` : ''}
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}

      {casesTab === 'graph' ? (
        <div className="panel">
          <div className="row">
            <h3>关系图谱</h3>
            <span className="spacer" />
            <select
              value={pid ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedPid(id);
                onSelectPerson?.(id);
                setPickedNode(null);
                if (id) void loadGraph(id);
              }}
              style={{ width: 'auto' }}
            >
              <option value="">选择档案</option>
              {navPersons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost sm"
              onClick={() => {
                if (pid) void loadGraph(pid);
              }}
            >
              刷新
            </button>
          </div>
          <p className="hint">
            中心为「本人」档案；连线颜色按关系级，线越粗越亲近。图谱由档案资料派生。
          </p>
          <div className="graph-filters">
            <span className="hint">关系级</span>
            {(
              [
                ['all', '全部'],
                ['blood', '血缘'],
                ['partner', '伴侣'],
                ['social', '社会'],
                ['temp', '临时'],
                ['other', '其他'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`chip${levelFilter === v ? ' active' : ''}`}
                onClick={() => setLevelFilter(v)}
              >
                {l}
              </button>
            ))}
            <span className="hint">亲疏</span>
            {(
              [
                ['all', '全部'],
                ['1-2', '疏'],
                ['3', '常'],
                ['4-5', '近'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`chip${closeFilter === v ? ' active' : ''}`}
                onClick={() => setCloseFilter(v)}
              >
                {l}
              </button>
            ))}
            <span className="hint">建档</span>
            {(
              [
                ['all', '全部'],
                ['7', '近7天'],
                ['30', '近30天'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`chip${timeFilter === v ? ' active' : ''}`}
                onClick={() => setTimeFilter(v)}
              >
                {l}
              </button>
            ))}
            <label className="graph-cluster">
              <input
                type="checkbox"
                checked={clusterTemp}
                onChange={(e) => setClusterTemp(e.target.checked)}
              />
              收拢临时
            </label>
          </div>
          {!graphView ? (
            <p className="hint">{pid ? '加载中…' : '先选一个档案'}</p>
          ) : graphView.persons.length <= 1 ? (
            <EmptyState
              title="当前筛选下没有可连的档案"
              desc="换个关系级/亲疏，或先去「档案信息」给来问的人补上关系。"
            />
          ) : (
            <>
              <RelationGraph
                centerId={graphView.centerId ?? pid ?? undefined}
                persons={graphView.persons}
                relations={graphView.relations}
                pickedId={pickedNode}
                onPick={(id) => {
                  if (id === '__cluster_temp__') {
                    setClusterTemp(false);
                    setLevelFilter('temp');
                    setPickedNode(null);
                    return;
                  }
                  setPickedNode(id);
                }}
              />
              {(() => {
                const p = graphView.persons.find((x) => x.id === pickedNode);
                if (!p) return null;
                const relCode = String(p.info.relCode ?? 'other');
                return (
                  <div className="graph-card">
                    <div className="row">
                      <b>{p.name}</b>
                      <span className="badge">{relZh(relCode)}</span>
                      <span className="badge">
                        {closenessZh(Number(p.info.closeness ?? 3))}
                      </span>
                    </div>
                    <p className="hint">
                      {(p.info.label as string | undefined) ||
                        (p.info.cares
                          ? `常问：${String(p.info.cares)}`
                          : '无更多资料')}
                    </p>
                    <div className="row">
                      <button
                        type="button"
                        className="primary sm"
                        onClick={() => {
                          setSelectedPid(p.id);
                          onSelectPerson?.(p.id);
                          setPickedNode(null);
                          setCasesTab('list');
                        }}
                      >
                        切到此档案
                      </button>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => {
                          setSelectedPid(p.id);
                          onSelectPerson?.(p.id);
                          void loadProfileInfo(p.id);
                          setCasesTab('info');
                        }}
                      >
                        编辑档案资料
                      </button>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setPickedNode(null)}
                      >
                        清除
                      </button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      ) : null}

      {casesTab === 'list' ? (
        <>
      {/* 汇总：一行说清（P0 工具面：去 KPI 卡） */}
      <div className="journal-summary">
        <span>
          <b>{st.total ?? 0}</b> 例
        </span>
        <span>
          已回填 <b>{st.filled ?? 0}</b>
          {st.total ? `（${fillRatio}%）` : ''}
        </span>
        <span>
          {st.filled
            ? `综合准确率 ${Math.round((st.composite ?? 0) * 100)}%`
            : '回填后显示准确率'}
        </span>
        <span>
          是/部分/否 {dist.yes ?? 0}/{dist.partial ?? 0}/{dist.no ?? 0}
        </span>
      </div>
      <div className="stat-bar" title={`已回填 ${st.filled ?? 0}/${st.total ?? 0}`}>
        <span className="s-yes" style={{ width: `${((dist.yes ?? 0) / totalDist) * 100}%` }} />
        <span
          className="s-partial"
          style={{ width: `${((dist.partial ?? 0) / totalDist) * 100}%` }}
        />
        <span className="s-no" style={{ width: `${((dist.no ?? 0) / totalDist) * 100}%` }} />
      </div>

      {/* 双栏：档案 → 案例 */}
      <div className="cases-split">
        <aside className="cases-persons panel">
          <h3>档案</h3>
          {navPersons.map((p) => {
            const cur = p.id === pid;
            return (
              <div key={p.id} className={`person-row${cur ? ' current' : ''}`}>
                <span className="case-dot" />
                <button
                  type="button"
                  className="person-pick"
                  onClick={() => setSelectedPid(p.id)}
                >
                  <span className="person-name">
                    <span title={p.name}>{p.name}</span>
                    <em className="badge">{p.caseCount ?? 0}</em>
                    {cur && <em className="badge">浏览中</em>}
                  </span>
                </button>
                {cur && pid !== personId && (
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => {
                      if (pid) onSelectPerson?.(pid);
                      toast('ok', '已设为问卦档案（顶栏）');
                    }}
                  >
                    使用此档案
                  </button>
                )}
              </div>
            );
          })}
          <p className="hint" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="ghost sm"
              onClick={() => onGotoSettings?.()}
            >
              去设置管理档案
            </button>
          </p>
        </aside>

        <section className="cases-list panel">
          <div className="filter-bar">
            <input
              placeholder="搜索问题"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
              <option value="all">全部起卦法</option>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {methodZh(m)}
                </option>
              ))}
            </select>
            <select value={accFilter} onChange={(e) => setAccFilter(e.target.value)}>
              <option value="all">全部准确度</option>
              <option value="yes">是</option>
              <option value="partial">部分</option>
              <option value="no">否</option>
              <option value="none">未回填</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'time' | 'acc')}
            >
              <option value="time">时间倒序</option>
              <option value="acc">准确度（未回填置底）</option>
            </select>
          </div>

          {loading && <SkeletonRows n={4} />}
          {!loading && !filtered.length && (
            <EmptyState
              title={pid ? '该档案暂无案例' : '请先选择档案'}
              desc={pid ? '完成一次解卦后会出现在这里。' : '左侧点选一个档案。'}
            />
          )}
          {filtered.map((c) => (
            <div key={c.id} className="case-row">
              <button
                type="button"
                className="case-row-open"
                onClick={() => void openDetail(c.id)}
              >
                <span className={`case-dot ${accuracyDot(c.accuracy)}`} />
                <div className="case-main">
                <div className="case-title">
                  <span title={c.input?.question || ''}>
                    {(c.input?.question || '').slice(0, 40) || '（无标题）'}
                  </span>
                  {c.method ? <span className="muted"> · {methodZh(c.method)}</span> : null}
                  {!c.accuracy ? <span className="tag">待回填</span> : null}
                  {!c.cast ? <span className="tag">未起卦</span> : null}
                </div>
                  <div className="case-sub muted">
                    {c.cast?.ben?.name
                      ? `${c.cast.ben.name}${c.cast.bian?.name ? `之${c.cast.bian.name}` : ''}`
                      : '—'}
                    <span>{c.createdAt?.slice(0, 10)}</span>
                  </div>
                </div>
              </button>
              {!c.accuracy && (
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => void openDetail(c.id, true)}
                >
                  去回填
                </button>
              )}
              <button
                type="button"
                className="ghost sm case-del"
                title="删除这一例"
                aria-label="删除这一例"
                onClick={() => setDelTarget(c)}
              >
                删除
              </button>
            </div>
          ))}
        </section>
      </div>
        </>
      ) : null}

      <ConfirmDialog
        open={!!delTarget}
        title="删除这一例？"
        desc={`将硬删「${(delTarget?.input?.question ?? '').slice(0, 24) || '该案例'}」及其九步、对话/追问、回填与关联记忆，不可恢复。`}
        confirmLabel="删除"
        danger
        busy={deleting}
        onConfirm={() => void doDeleteCase()}
        onCancel={() => setDelTarget(null)}
      />

      {detail && (
        <div className="panel" ref={detailRef}>
          <div className="row">
            <h3>{detail?.input?.question || '（无标题）'}</h3>
            <span className="spacer" />
            {detail.cast && detail.verdict?.grade ? (
              <button
                type="button"
                className="primary sm"
                aria-label="打开签牌"
                onClick={() => setSignOpen(true)}
              >
                查看签诗
              </button>
            ) : null}
            {onOpenInWorkbench ? (
              <button
                type="button"
                className="ghost sm"
                onClick={() => onOpenInWorkbench(detail.id)}
              >
                在问卦台打开
              </button>
            ) : null}
            <button type="button" className="ghost" onClick={() => setDetail(null)}>
              返回列表
            </button>
          </div>
          {detail.cast && detail.verdict?.grade ? (
            <SignModal
              open={signOpen}
              onClose={() => setSignOpen(false)}
              sign={{
                grade: detail.verdict.grade,
                ben: {
                  name: detail.cast.ben.name,
                  lines: detail.cast.ben.lines,
                  movingYao: detail.cast.movingYao,
                },
                poem: detail.verdict.poem,
                question: detail.input?.question,
              }}
            />
          ) : null}
          <p className="muted">
            {methodZh(detail.method)} {detail.cast?.ben?.name ?? ''}
            {detail.cast?.bian?.name ? ` 之 ${detail.cast.bian.name}` : ''}
            {!detail.cast ? ' · 未起卦' : ''}
          </p>
          {detail.cast && (
            <div className="hexboards">
              <HexBoard
                kind="ben"
                name={detail.cast.ben.name}
                lines={detail.cast.ben.lines}
                movingYao={detail.cast.movingYao as 1 | 2 | 3 | 4 | 5 | 6}
              />
              <HexBoard
                kind="hu"
                name={detail.cast.hu?.name ?? ''}
                lines={
                  detail.cast.hu
                    ? dualToLines(detail.cast.hu.upper, detail.cast.hu.lower)
                    : []
                }
                guaPair={
                  detail.cast.hu
                    ? { upper: detail.cast.hu.upper, lower: detail.cast.hu.lower }
                    : undefined
                }
              />
              <HexBoard
                kind="bian"
                name={detail.cast.bian.name}
                lines={detail.cast.bian.lines}
                markBian
                movingYao={detail.cast.movingYao as 1 | 2 | 3 | 4 | 5 | 6}
              />
            </div>
          )}
          <div className="case-dialog-log">
            <h4>
              对话记录
              <span className="muted">
                {' '}
                · {(detail.messages ?? []).filter((m) => m.role !== 'system').length} 条
              </span>
            </h4>
            {(detail.messages ?? []).filter((m) => m.role !== 'system').length === 0 ? (
              <p className="hint">暂无追问或背景问答</p>
            ) : (
              <ul className="msg-list">
                {(detail.messages ?? [])
                  .filter((m) => m.role !== 'system')
                  .map((m) => (
                    <li key={m.id} className={`msg ${m.role}`}>
                      <span className="msg-role">
                        {m.role === 'user' ? '问' : '答'}
                      </span>
                      <span className="msg-text">{plainTextSafe(m.content)}</span>
                      {m.createdAt ? (
                        <span className="msg-time">
                          {String(m.createdAt).slice(5, 16).replace('T', ' ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="vs-grid">
            <div>
              <h4>回填最终结果</h4>
              {detail.feedback?.actual ? (
                <>
                  <p>{detail.feedback.actual}</p>
                  <p className="muted">
                    准确度：{accuracyLabel(detail.feedback.accuracy)}
                  </p>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => setShowForm(true)}
                  >
                    修改回填
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary sm"
                  onClick={() => setShowForm(true)}
                >
                  回填实际发生了什么
                </button>
              )}
            </div>
            <div>
              <h4>占断</h4>
              {prettyGuaText(detail.verdict?.summary || '—')}
              {!!detail.verdict?.advice?.length && (
                <ul>
                  {detail.verdict.advice.map((a, i) => (
                    <li key={i}>{prettyGuaText(a)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="hint">
            九步详情可在上方「在问卦台打开」中查看。
          </p>
          {showForm && (
            <div className="panel">
              <h4>回填最终结果</h4>
              <label>
                实际发生了什么
                <input
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder="事后验证结果，用于档案记忆修正"
                />
              </label>
              <label>
                是否应验
                <select
                  value={accuracy}
                  onChange={(e) =>
                    setAccuracy(e.target.value as 'yes' | 'partial' | 'no')
                  }
                >
                  <option value="yes">是</option>
                  <option value="partial">部分</option>
                  <option value="no">否</option>
                </select>
              </label>
              <label>
                差异说明
                <input value={devNotes} onChange={(e) => setDevNotes(e.target.value)} />
              </label>
              <div className="row">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <label key={n} style={{ display: 'inline-flex', gap: 4, width: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={devSteps.includes(n)}
                      onChange={(e) =>
                        setDevSteps((x) =>
                          e.target.checked ? [...x, n] : x.filter((y) => y !== n),
                        )
                      }
                    />
                    步{n}
                  </label>
                ))}
              </div>
              <div className="row">
                <button type="button" className="primary" onClick={() => void saveFeedback()}>
                  保存回填并写入记忆
                </button>
                <button type="button" className="ghost" onClick={() => setShowForm(false)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TYPE_ZH: Record<string, string> = {
  round: '轮次',
  result: '应验',
  summary: '印象',
  preference: '偏好',
  anchor: '锚点',
};

function isAnchor(m: { type: string; payload: Record<string, unknown> }) {
  return m.type === 'anchor';
}

/** 画像文案 normalize（§4.16.5b 防跳动军规 3）：去 markdown 记号、压空白 */
function normalizeProfileText(s: string | undefined): string {
  return (s ?? '')
    .replace(/[`*_#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function memoryTitle(m: { type: string; payload: Record<string, unknown> }) {
  const p = m.payload ?? {};
  if (isAnchor(m as never)) return `锚 · ${String(p.text ?? '').slice(0, 40)}`;
  if (m.type === 'round') {
    return String(p.topic ?? p.castBrief ?? '').slice(0, 40) || '（轮次）';
  }
  if (m.type === 'result') {
    return String(p.actual ?? '').slice(0, 40) || '（应验）';
  }
  return String(p.text ?? '').slice(0, 40) || (TYPE_ZH[m.type] ?? m.type);
}

function memoryBody(m: { type: string; payload: Record<string, unknown> }) {
  const p = m.payload ?? {};
  const parts = [
    String(p.castBrief ?? ''),
    String(p.conclusionBrief ?? ''),
    String(p.text ?? ''),
    String(p.lessons ?? ''),
  ].filter(Boolean);
  return parts.join(' · ').slice(0, 120);
}

export function MemoryPage({ personId }: { personId: string | null }) {
  const [mems, setMems] = useState<
    Array<{
      id: string;
      type: string;
      rejected?: boolean;
      createdAt: string;
      payload: Record<string, unknown>;
    }>
  >([]);
  const [roleText, setRoleText] = useState('');
  const [roleEdit, setRoleEdit] = useState(false);
  const [confirmCompact, setConfirmCompact] = useState(false);
  const [delMemId, setDelMemId] = useState<string | null>(null);
  const [profileJson, setProfileJson] = useState<{
    nature?: string;
    desire?: string;
    style?: string;
    with?: string;
    sketch?: string;
    axes?: ProfileAxes;
    /** 兼容 */
    domains?: string;
    verification?: string;
    communication?: string;
  } | null>(null);
  const [liveAxes, setLiveAxes] = useState<ProfileAxes | null>(null);
  const [tone, setTone] = useState<'standard' | 'brief' | 'warm'>('standard');
  const [character, setCharacter] = useState<{
    name: string;
    tagline: string;
    identity: string[];
    voice: Record<string, string>;
    examples: Array<{ user: string; reply: string }>;
    boundaries: string[];
  } | null>(null);
  const [caseDone, setCaseDone] = useState(0);
  const [personName, setPersonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showRejected, setShowRejected] = useState(false);
  const [q, setQ] = useState('');
  const [anchorText, setAnchorText] = useState('');
  const [profileRefreshing, setProfileRefreshing] = useState(false);
  const [expandedSlots, setExpandedSlots] = useState<Record<string, boolean>>({});

  const roundCount = mems.filter((m) => m.type === 'round' && !m.rejected).length;

  const reload = useCallback(async () => {
    if (!personId) return;
    setLoading(true);
    try {
      const [r, persons, role, card] = await Promise.all([
        apiClient.listMemories(personId),
        apiClient.listPersons(),
        apiClient.getRoleCard(personId).catch(() => ({ text: '', isDefault: true })),
        apiClient.getCharacter().catch(() => null),
      ]);
      setCharacter(card as never);
      setMems((r.memories as never) ?? []);
      const me = persons.persons.find((p) => p.id === personId);
      try {
        const raw = me?.profileCard ?? '';
        if (raw.trim().startsWith('{')) {
          setProfileJson(JSON.parse(raw));
        } else {
          setProfileJson(null);
        }
      } catch {
        setProfileJson(null);
      }
      setPersonName(me?.name ?? '');
      const p = me as
        | { tone?: 'standard' | 'brief' | 'warm' | 'elegant' }
        | undefined;
      setTone(
        p?.tone === 'brief' || p?.tone === 'warm' ? p.tone : 'standard',
      );
      setRoleText(role.text);
      void apiClient
        .listCases(personId)
        .then((c) => {
          const rows = (c.cases ?? []) as Array<{
            id?: string;
            status?: string;
            verdict?: unknown;
            input?: {
              question?: string;
              category?: string;
              numbers?: number[];
              timeLocal?: string;
            };
          }>;
          const done = rows.filter((x) => x.verdict);
          setCaseDone(done.length);
          // §6.2b 同源现算；缺 caseId 的回填用条数兜底在 profile 后端
          const fb = new Set<string>();
          void apiClient
            .listMemories(personId)
            .then((mr) => {
              const mems = (mr.memories ?? []) as Array<{
                type: string;
                caseId?: string;
              }>;
              for (const m of mems) {
                if (m.type === 'result' && m.caseId) fb.add(m.caseId);
              }
              const live = computeProfileAxes(
                done.map((x) => ({
                  id: x.id,
                  verdict: x.verdict,
                  input: x.input ?? {},
                })),
                fb,
              );
              setLiveAxes(live);
              setProfileJson((p) => (p ? { ...p, axes: live } : p));
            })
            .catch(() => {
              const live = computeProfileAxes(
                done.map((x) => ({
                  id: x.id,
                  verdict: x.verdict,
                  input: x.input ?? {},
                })),
                new Set(),
              );
              setLiveAxes(live);
              setProfileJson((p) => (p ? { ...p, axes: live } : p));
            });
        })
        .catch(() => setCaseDone(0));
    } catch (e) {
      toast('error', errText(e));
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const list = useMemo(() => {
    return mems
      .filter((m) => (showRejected ? true : !m.rejected))
      .filter((m) => {
        if (typeFilter === 'all') return true;
        if (typeFilter === 'anchor') return isAnchor(m as never);
        if (typeFilter === 'preference') return m.type === 'preference' && !isAnchor(m as never);
        return m.type === typeFilter;
      })
      .filter((m) =>
        q.trim()
          ? memoryTitle(m as never).includes(q.trim()) ||
            memoryBody(m as never).includes(q.trim())
          : true,
      );
  }, [mems, typeFilter, showRejected, q]);

  return (
    <div className="page-fade">
      <div className="row">
        <h2>记忆</h2>
        <span className="badge">
          {personName ? `档案：${personName}` : '未选择档案'}
        </span>
        {personId && (
          <span className="muted" title={personId}>
            当前档案
          </span>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="ghost"
          disabled={roundCount < 2}
          title={roundCount < 2 ? '暂无需整理' : undefined}
          onClick={() => {
            if (!personId) return;
            if (roundCount < 2) {
              toast('info', '暂无需整理');
              return;
            }
            setConfirmCompact(true);
          }}
        >
          压缩长期印象
        </button>
      </div>

      <div className="speak-panel panel">
        <h3>占者</h3>
        <div className="speak-identity">
          <b>{character?.name ?? '大肥鱼'}</b>
          <span className="hint">
            {character?.tagline ?? '会看卦、说话顺、不端着的占者；白话为主，轻幽默克制。'}
          </span>
        </div>
        {character ? (
          <details className="speak-card">
            <summary className="hint">角色卡（内置，点开看）</summary>
            <ul>
              {character.identity.map((x) => (
                <li key={x}>{x}</li>
              ))}
              <li>句法：{character.voice.sentence}</li>
              <li>幽默：{character.voice.humor}</li>
            </ul>
            <p className="hint">
              示例：问「{character.examples[0]?.user}」→
              {character.examples[0]?.reply}
            </p>
            <p className="hint">
              边界：{character.boundaries.join(' ')}
            </p>
          </details>
        ) : null}
        <div className="row speak-row">
          <span className="speak-label">语气</span>
          <select
            className="tone-select"
            value={tone}
            onChange={(e) => {
              const t = e.target.value as typeof tone;
              if (!personId) return;
              const prev = tone;
              setTone(t);
              void apiClient
                .updatePerson(personId, { name: personName, tone: t })
                .then(() => toast('ok', '语气已更新（仅影响之后解卦）'))
                .catch((e) => {
                  setTone(prev);
                  toast('error', errText(e));
                });
            }}
          >
            <option value="standard">标准白话</option>
            <option value="brief">简洁直给</option>
            <option value="warm">体贴共情</option>
          </select>
          <span
            className="hint speak-note"
            title="仅影响之后解卦的措辞；历史文案不回溯。"
            aria-label="仅影响之后解卦的措辞；历史文案不回溯。"
          >
            ⓘ 措辞说明
          </span>
        </div>
        <p className="hint speak-try">
          试一句：
          {tone === 'brief'
            ? '「能成，慢。先把手头准备好，别抢。」'
            : tone === 'warm'
              ? '「你问的这事，先别慌。卦上有助力，但成得慢一点，先把能准备的备好。」'
              : '「我看这事能成，就是慢热。先把手头的准备好，别抢话。」'}
        </p>
      </div>

      <div className="memory-grid">
        <div className="panel profile-panel">
          <div className="panel-head">
            <h3>画像</h3>
            <span className="spacer" />
            {caseDone >= 5 ? (
              <button
                type="button"
                className="ghost sm"
                disabled={profileRefreshing}
                onClick={() => {
                  if (!personId || profileRefreshing) return;
                  setProfileRefreshing(true);
                  void apiClient
                    .refreshProfile(personId)
                    .then((r) => {
                      if (!r.ok) {
                        toast('info', r.message ?? '尚未达标');
                        return;
                      }
                      const g = r.generated;
                      if (g) {
                        const x = g as Record<string, string | undefined>;
                        setProfileJson({
                          nature: normalizeProfileText(x.nature),
                          desire: normalizeProfileText(x.desire),
                          style: normalizeProfileText(x.style),
                          with: normalizeProfileText(x.with),
                          sketch: normalizeProfileText(x.sketch),
                          axes: (g as { axes?: ProfileAxes }).axes,
                        });
                      }
                      setCaseDone(r.caseCount ?? caseDone);
                      toast('ok', '画像已整理（仅影响措辞参考）');
                    })
                    .catch((e) => toast('error', errText(e)))
                    .finally(() => setProfileRefreshing(false));
                }}
              >
                {profileRefreshing ? '整理中…' : '重新整理'}
              </button>
            ) : null}
          </div>
          {caseDone >= 5 ? (
            <div className="profile-body">
              {caseDone >= RADAR_MIN_CASES ? (
                <div className="radar-wrap">
                  <ProfileRadar
                    axes={liveAxes ?? profileJson?.axes}
                    caseCount={caseDone}
                  />
                  {(() => {
                    const axes = liveAxes ?? profileJson?.axes;
                    const sk =
                      normalizeProfileText(profileJson?.sketch) ||
                      (axes ? buildProfileCopy(axes).sketch : '');
                    return sk ? <p className="profile-sketch">{sk}</p> : null;
                  })()}
                </div>
              ) : (
                <p className="hint radar-note">
                  求卦满 {RADAR_MIN_CASES} 次后显示六维图（当前 {caseDone}）。
                </p>
              )}
              {(() => {
                const axes = liveAxes ?? profileJson?.axes;
                const copy = axes ? buildProfileCopy(axes) : null;
                const slots = (
                  [
                    ['nature', '性格特质', copy?.nature],
                    ['desire', '所求所念', copy?.desire],
                    ['style', '处事风格', copy?.style],
                    ['with', '相处之道', copy?.with],
                  ] as const
                ).map(([key, title, fallback]) => {
                  const raw = normalizeProfileText(profileJson?.[key]);
                  // 优先显示已整理（LLM 或后端）文案，规则句库仅兜底
                  const text = (raw || fallback) || '样本尚浅';
                  return { key, title, text };
                });
                return (
                  <div
                    className={`profile-texts${profileRefreshing ? ' refreshing' : ''}`}
                  >
                    {slots.map(({ key, title, text }) => {
                      const expanded = !!expandedSlots[key];
                      return (
                        <div key={key} className="slot">
                          <h4>{title}</h4>
                          <p className={expanded ? 'expanded' : undefined}>{text}</p>
                          {text.length > 40 ? (
                            <button
                              type="button"
                              className="slot-toggle"
                              onClick={() =>
                                setExpandedSlots((s) => ({ ...s, [key]: !s[key] }))
                              }
                            >
                              {expanded ? '收起' : '展开'}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    <p className="hint" style={{ gridColumn: '1 / -1' }}>
                      由对话用词与话题归纳；只读；不改变语气/人设。
                    </p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <p className="hint">
              求卦满 5 次后生成画像（当前 {caseDone}）。
            </p>
          )}
        </div>

        <div className="memory-side">
          {/* 角色边界 */}
          <div className="panel role-panel">
          <div className="row">
            <h3>角色边界</h3>
            <span className="spacer" />
            <button
              type="button"
              className="ghost sm"
              onClick={() => setRoleEdit((v) => !v)}
            >
              {roleEdit ? '收起' : '编辑'}
            </button>
            <button
              type="button"
              className="ghost sm"
              onClick={() => {
                if (!personId) return;
                void apiClient
                  .resetRoleCard(personId)
                  .then((r) => {
                    setRoleText(r.text);
                    toast('ok', '已恢复默认角色');
                  })
                  .catch((e) => toast('error', errText(e)));
              }}
            >
              恢复默认
            </button>
          </div>
          {roleEdit ? (
            <>
              <textarea
                rows={5}
                value={roleText}
                onChange={(e) => setRoleText(e.target.value)}
              />
              <div className="row">
                <button
                  type="button"
                  className="primary sm"
                  onClick={() => {
                    if (!personId) return;
                    void apiClient
                      .putRoleCard(personId, roleText)
                      .then(() => {
                        setRoleEdit(false);
                        toast('ok', '角色已保存（仅影响解释）');
                      })
                      .catch((e) => toast('error', errText(e)));
                  }}
                >
                  保存角色
                </button>
              </div>
            </>
          ) : (
            <p
              className="hint role-preview"
              style={{ whiteSpace: 'pre-wrap' }}
              onClick={() => setRoleEdit(true)}
              title="点击编辑"
            >
              {roleText}
            </p>
          )}
          <p className="hint">不得改变卦与算式；口吻用「说话方式」。</p>
        </div>

          {/* 经验锚（手建）· §4.16.5b 右栏，条目在下方账簿 */}
          <div className="panel">
            <h4>经验锚（手建）</h4>
            <div className="row anchor-row">
              <input
                placeholder="例如：寻物先问常用物还是偶然带"
                value={anchorText}
                onChange={(e) => setAnchorText(e.target.value)}
              />
              <button
                type="button"
                className="ghost"
                disabled={!anchorText.trim() || !personId}
                onClick={() => {
                  if (!personId || !anchorText.trim()) return;
                  void apiClient
                    .addAnchor(personId, anchorText.trim().slice(0, 80))
                    .then(() => {
                      setAnchorText('');
                      toast('ok', '已添加经验锚');
                      return reload();
                    })
                    .catch((e) => toast('error', errText(e)));
                }}
              >
                添加锚点
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        {[
          ['all', '全部'],
          ['result', '应验'],
          ['anchor', '锚点'],
          ['preference', '偏好'],
          ['round', '轮次'],
          ['summary', '印象'],
        ].map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`chip${typeFilter === t ? ' active' : ''}`}
            onClick={() => setTypeFilter(t)}
          >
            {label}
          </button>
        ))}
        <input
          placeholder="搜索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 140 }}
        />
        <label style={{ display: 'inline-flex', gap: 4, width: 'auto', margin: 0 }}>
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
          />
          显示已排除
        </label>
      </div>

      {loading && <SkeletonRows n={3} />}
      {!loading && !list.length && (
        <EmptyState
          title="暂无记忆"
          desc="解卦并回填后，这里会长出经验。"
        />
      )}
      <div className="memory-list">
      {list.slice(0, 200).map((m) => (
        <div key={m.id} className={`memory-row${m.rejected ? ' rejected' : ''}`}>
          <div className="row">
            <span className="badge">
              {isAnchor(m as never) ? '锚点' : TYPE_ZH[m.type] ?? m.type}
            </span>
            <span className="mem-date">{m.createdAt?.slice(0, 10)}</span>
            <span className="spacer" />
            <button
              type="button"
              className="sm ghost"
              onClick={() => {
                void apiClient
                  .rejectMemory(m.id)
                  .then(() => {
                    toast('ok', m.rejected ? '已恢复' : '已排除');
                    return reload();
                  })
                  .catch((e) => toast('error', errText(e)));
              }}
            >
              {m.rejected ? '恢复' : '排除'}
            </button>
            <button
              type="button"
              className="sm danger"
              onClick={() => setDelMemId(m.id)}
            >
              删除
            </button>
          </div>
          <p className="mem-title">
            <b>{memoryTitle(m as never)}</b>
          </p>
          <p className="mem-body">{memoryBody(m as never)}</p>
        </div>
      ))}
      </div>

      <ConfirmDialog
        open={confirmCompact}
        title="整理记忆？"
        desc={`将合并 ${roundCount} 条过程记忆为一条印象并删除明细（应验保留），不可撤销。`}
        confirmLabel="整理"
        onCancel={() => setConfirmCompact(false)}
        onConfirm={() => {
          setConfirmCompact(false);
          if (!personId) return;
          void apiClient
            .compactMemories(personId)
            .then((res) => {
              const n = Number((res as { merged?: number }).merged ?? 0);
              toast(
                n ? 'ok' : 'info',
                n ? `已整理记忆（合并 ${n} 条）` : '暂无合并',
              );
              return reload();
            })
            .catch((e) => toast('error', errText(e)));
        }}
      />
      <ConfirmDialog
        open={!!delMemId}
        title="删除这条记忆？"
        desc="删除后不可恢复（不影响卦与档案）。"
        confirmLabel="删除"
        danger
        onCancel={() => setDelMemId(null)}
        onConfirm={() => {
          const id = delMemId;
          setDelMemId(null);
          if (!id) return;
          void apiClient
            .deleteMemory(id)
            .then(() => {
              toast('ok', '已删除');
              return reload();
            })
            .catch((e) => toast('error', errText(e)));
        }}
      />
    </div>
  );
}

/** 八卦三爻（7=阳 8=阴，index 0=初爻）· 与 HexBoard trigram 同构 */
const TRIGRAM_LINES: Record<string, number[]> = {
  qian: [7, 7, 7],
  dui: [7, 7, 8],
  li: [7, 8, 7],
  zhen: [7, 8, 8],
  xun: [8, 7, 7],
  kan: [8, 7, 8],
  gen: [8, 8, 7],
  kun: [8, 8, 8],
};

function knowledgeLines(hex: Record<string, unknown>): number[] {
  const lines = (hex.lines ?? []) as Array<{ pos: number; yang: boolean }>;
  if (lines.length === 6) {
    return lines.map((l) => (l.yang ? 7 : 8));
  }
  return [];
}

const BAGUA_RING: Array<{ id: Gua; zh: string; wx: string; x: number; y: number }> = [
  { id: 'qian', zh: '乾', wx: '金', x: 400, y: 40 },
  { id: 'xun', zh: '巽', wx: '木', x: 560, y: 100 },
  { id: 'kan', zh: '坎', wx: '水', x: 620, y: 260 },
  { id: 'gen', zh: '艮', wx: '土', x: 560, y: 420 },
  { id: 'kun', zh: '坤', wx: '土', x: 400, y: 480 },
  { id: 'zhen', zh: '震', wx: '木', x: 240, y: 420 },
  { id: 'li', zh: '离', wx: '火', x: 180, y: 260 },
  { id: 'dui', zh: '兑', wx: '金', x: 240, y: 100 },
];

function BaguaRing({
  highlight,
  filterGua,
  onPick,
}: {
  highlight: Gua[];
  filterGua?: Gua | null;
  onPick: (g: Gua) => void;
}) {
  const activeSet = new Set<Gua>(highlight);
  if (filterGua) activeSet.add(filterGua);
  const active = filterGua ?? highlight[0] ?? null;

  const YAO: Record<Gua, boolean[]> = {
    qian: [true, true, true],
    dui: [false, true, true],
    li: [true, false, true],
    zhen: [false, false, true],
    xun: [true, true, false],
    kan: [false, true, false],
    gen: [true, false, false],
    kun: [false, false, false],
  };

  const OPPOSITE: Partial<Record<Gua, Gua>> = {
    qian: 'kun',
    kun: 'qian',
    kan: 'li',
    li: 'kan',
    zhen: 'xun',
    xun: 'zhen',
    gen: 'dui',
    dui: 'gen',
  };

  /** 盘心（绘图） */
  const CX = 400;
  const CY = 340;
  /** BAGUA_RING 角度原点（数据坐标系中心，见 §4.17.2c G-ORI） */
  const LABEL_ORIGIN = { x: 400, y: 260 };
  /** 铭文带：必须保证 CY ± (R_LABEL+48) 在 viewBox 内 */
  const R_LABEL = 250;
  /** viewBox 800×720：340±300 内含乾/坤牌 */

  const nodePos = (g: { x: number; y: number }) => {
    const ax = g.x - LABEL_ORIGIN.x;
    const ay = g.y - LABEL_ORIGIN.y;
    const ang = Math.atan2(ay, ax);
    return {
      x: CX + Math.cos(ang) * R_LABEL,
      y: CY + Math.sin(ang) * R_LABEL,
      ang,
    };
  };

  const posOf = (id: Gua) => {
    const g = BAGUA_RING.find((x) => x.id === id)!;
    return nodePos(g);
  };

  return (
    <div className="ring-stage flat">
      <svg
        viewBox="0 0 800 720"
        className="bagua-ring"
        role="img"
        aria-label="先天八卦罗盘"
      >
        <defs>
          <linearGradient id="goldBand" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c4a35a" />
            <stop offset="45%" stopColor="#8a6b2f" />
            <stop offset="100%" stopColor="#a6843c" />
          </linearGradient>
          <radialGradient id="poolGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#b23a2e" stopOpacity="0.18" />
            <stop offset="65%" stopColor="#b23a2e" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#b23a2e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bandSheen" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
          </radialGradient>
        </defs>

        {/* 天穹环 A+ · §4.17.3b（装饰） */}
        <g aria-hidden="true" pointerEvents="none">
          {(() => {
            const R1 = 268;
            const R2 = R1 * 0.92;
            const guaNames: { id: Gua; zh: string }[] = BAGUA_RING.map((g) => ({
              id: g.id,
              zh: g.zh,
            }));
            return (
              <>
                <circle cx={CX} cy={CY} r={R1} fill="none" stroke="var(--ink-jiao)" strokeWidth="1.1" opacity="0.12" />
                <circle cx={CX} cy={CY} r={R2} fill="none" stroke="var(--ink-jiao)" strokeWidth="0.9" opacity="0.06" />
                {Array.from({ length: 8 }).map((_, i) => {
                  const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                  const long = i % 2 === 0;
                  const len = long ? 14 : 10;
                  return (
                    <line
                      key={`ct-${i}`}
                      x1={CX + Math.cos(a) * (R1 - len)}
                      y1={CY + Math.sin(a) * (R1 - len)}
                      x2={CX + Math.cos(a) * R1}
                      y2={CY + Math.sin(a) * R1}
                      stroke="var(--ink-jiao)"
                      strokeWidth="1"
                      opacity="0.12"
                    />
                  );
                })}
                {guaNames.map((g) => {
                  const raw = BAGUA_RING.find((x) => x.id === g.id)!;
                  const pos = nodePos(raw);
                  const ang = pos.ang;
                  const r = R1 + 16;
                  const x = CX + Math.cos(ang) * r;
                  const y = CY + Math.sin(ang) * r;
                  const deg = (ang * 180) / Math.PI + 90;
                  return (
                    <text
                      key={`ct-${g.id}`}
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fontFamily="Songti SC, STSong, serif"
                      fill="var(--ink-jiao)"
                      opacity="0.1"
                      transform={`rotate(${deg} ${x} ${y})`}
                    >
                      {g.zh}
                    </text>
                  );
                })}
                {[0, 1, 2, 3].map((i) => {
                  const a = (i / 4) * Math.PI * 2 - Math.PI / 2 + Math.PI / 8;
                  const r = (R1 + R2) / 2;
                  const x = CX + Math.cos(a) * r;
                  const y = CY + Math.sin(a) * r;
                  const deg = (a * 180) / Math.PI + 90;
                  return (
                    <path
                      key={`cloud-${i}`}
                      d="M-8 2 Q-4 -4 0 0 Q4 4 8 -2"
                      fill="none"
                      stroke="var(--ink-jiao)"
                      strokeWidth="1"
                      opacity="0.08"
                      transform={`translate(${x} ${y}) rotate(${deg})`}
                    />
                  );
                })}
              </>
            );
          })()}
        </g>

        {/* 影贴盘底 */}
        <ellipse cx={CX} cy={CY + 248} rx="190" ry="14" fill="rgba(28,24,20,0.08)" />

        {/* 外镜缘 + 齿 */}
        <circle cx={CX} cy={CY} r="220" fill="var(--surface)" stroke="var(--ink-jiao)" strokeWidth="2" />
        <circle cx={CX} cy={CY} r="210" fill="none" stroke="var(--ink-jiao)" strokeWidth="1" opacity="0.85" />
        <circle cx={CX} cy={CY} r="202" fill="none" stroke="var(--ink-zhong)" strokeWidth="0.8" opacity="0.5" />
        {Array.from({ length: 48 }).map((_, i) => {
          const a = (i / 48) * Math.PI * 2 - Math.PI / 2;
          const long = i % 6 === 0;
          const mid = i % 3 === 0;
          const r1 = long ? 202 : mid ? 206 : 209;
          return (
            <line
              key={i}
              x1={CX + Math.cos(a) * r1}
              y1={CY + Math.sin(a) * r1}
              x2={CX + Math.cos(a) * 210}
              y2={CY + Math.sin(a) * 210}
              stroke="var(--ink-jiao)"
              strokeWidth={long ? 1.3 : 0.7}
              opacity={long ? 0.9 : 0.4}
              pointerEvents="none"
            />
          );
        })}

        {/* 金仪环带 */}
        <circle cx={CX} cy={CY} r="184" fill="none" stroke="url(#goldBand)" strokeWidth="16" />
        <circle cx={CX} cy={CY} r="184" fill="none" stroke="url(#bandSheen)" strokeWidth="16" pointerEvents="none" />
        <circle cx={CX} cy={CY} r="192" fill="none" stroke="var(--gold)" strokeWidth="1.1" />
        <circle cx={CX} cy={CY} r="176" fill="none" stroke="#5c4318" strokeWidth="1" opacity="0.75" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          return (
            <g key={`slot-${i}`} pointerEvents="none">
              <line
                x1={CX + Math.cos(a) * 176}
                y1={CY + Math.sin(a) * 176}
                x2={CX + Math.cos(a) * 192}
                y2={CY + Math.sin(a) * 192}
                stroke="#5c4318"
                strokeWidth="1.1"
                opacity="0.55"
              />
              <rect
                x={CX + Math.cos(a) * 184 - 2.5}
                y={CY + Math.sin(a) * 184 - 2.5}
                width="5"
                height="5"
                transform={`rotate(45 ${CX + Math.cos(a) * 184} ${CY + Math.sin(a) * 184})`}
                fill="#5c4318"
                opacity="0.7"
              />
            </g>
          );
        })}

        {/* 内纹淡 */}
        <circle cx={CX} cy={CY} r="158" fill="none" stroke="var(--ink-jiao)" strokeWidth="1" opacity="0.3" />
        <circle cx={CX} cy={CY} r="140" fill="none" stroke="var(--ink-jiao)" strokeWidth="0.7" opacity="0.18" />
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
          return (
            <line
              key={`spoke-${i}`}
              x1={CX + Math.cos(a) * 140}
              y1={CY + Math.sin(a) * 140}
              x2={CX + Math.cos(a) * 158}
              y2={CY + Math.sin(a) * 158}
              stroke="var(--ink-zhong)"
              strokeWidth="0.6"
              opacity="0.14"
              pointerEvents="none"
            />
          );
        })}

        {/* 对宫弧：贴环带内侧，避开铭文 */}
        {active && OPPOSITE[active] ? (
          (() => {
            const b = posOf(OPPOSITE[active]!);
            const r = 200;
            const cx = CX + Math.cos(b.ang) * r;
            const cy = CY + Math.sin(b.ang) * r;
            const deg = (b.ang * 180) / Math.PI + 90;
            return (
              <path
                d={`M ${cx - 18} ${cy - 8} Q ${cx} ${cy + 8} ${cx + 18} ${cy - 8}`}
                fill="none"
                stroke="var(--cinnabar)"
                strokeWidth="2"
                opacity="0.9"
                transform={`rotate(${deg} ${cx} ${cy})`}
                pointerEvents="none"
              />
            );
          })()
        ) : null}

        {/* 天心枢 */}
        <circle cx={CX} cy={CY} r="72" fill="url(#poolGlow)" pointerEvents="none" />
        <circle cx={CX} cy={CY} r="58" fill="#f6f0e4" stroke="var(--cinnabar)" strokeWidth="1.8" />
        <circle cx={CX} cy={CY} r="48" fill="none" stroke="var(--gold)" strokeWidth="2" />
        <circle cx={CX} cy={CY} r="40" fill="none" stroke="var(--ink-jiao)" strokeWidth="1" opacity="0.45" />
        <text
          x={CX}
          y={CY + 10}
          textAnchor="middle"
          fontSize="30"
          fill="var(--cinnabar)"
          fontFamily="Songti SC, STSong, serif"
          fontWeight="700"
          style={{ letterSpacing: '0.06em' }}
        >
          先天
        </text>

        {/* 卦铭：外带 · 字层最后 · 热区无描边 */}
        {BAGUA_RING.map((g) => {
          const on = activeSet.has(g.id);
          const yaos = YAO[g.id];
          const pos = nodePos(g);
          const yaoW = 36;
          const yaoH = 4;
          const yaoGap = 3.6;
          const yaoTop = pos.y - 18;
          const fill = on ? 'var(--cinnabar)' : 'var(--ink-jiao)';
          return (
            <g
              key={g.id}
              className={`bagua-node${on ? ' on' : ''}`}
              tabIndex={0}
              role="button"
              aria-label={`${g.zh} ${g.wx}`}
              aria-pressed={on}
              onClick={() => onPick(g.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(g.id);
                }
              }}
            >
              <title>{`${g.zh} · ${g.wx}`}</title>
              {/* 热区：透明、无 stroke，避免 hover/on 描边 */}
              <circle cx={pos.x} cy={pos.y} r={34} fill="transparent" stroke="none" />
              {/* 焦点环（仅键盘） */}
              <circle
                className="node-focus"
                cx={pos.x}
                cy={pos.y + 2}
                r="32"
                fill="none"
                stroke="none"
                strokeWidth="2"
                pointerEvents="none"
              />
              {/* 可见牌：默认无底圆；选中朱晕 */}
              <circle
                className="node-plate"
                cx={pos.x}
                cy={pos.y + 2}
                r="28"
                fill={on ? 'rgba(178,58,46,0.12)' : 'transparent'}
                stroke={on ? 'var(--cinnabar)' : 'none'}
                strokeWidth="1.8"
                pointerEvents="none"
              />
              {yaos.map((yang, yi) => {
                const y = yaoTop + yi * (yaoH + yaoGap);
                if (yang) {
                  return (
                    <rect
                      key={yi}
                      x={pos.x - yaoW / 2}
                      y={y}
                      width={yaoW}
                      height={yaoH}
                      fill={fill}
                      rx="0.5"
                    />
                  );
                }
                return (
                  <g key={yi}>
                    <rect
                      x={pos.x - yaoW / 2}
                      y={y}
                      width={yaoW * 0.4}
                      height={yaoH}
                      fill={fill}
                      rx="0.5"
                    />
                    <rect
                      x={pos.x + yaoW / 2 - yaoW * 0.4}
                      y={y}
                      width={yaoW * 0.4}
                      height={yaoH}
                      fill={fill}
                      rx="0.5"
                    />
                  </g>
                );
              })}
              <text
                x={pos.x}
                y={pos.y + 26}
                textAnchor="middle"
                fontSize="16"
                fill={on ? 'var(--cinnabar)' : 'var(--ink-jiao)'}
                fontFamily="Songti SC, STSong, serif"
                fontWeight="700"
                stroke="#f6f0e4"
                strokeWidth="3.2"
                style={{ paintOrder: 'stroke fill', letterSpacing: '0.06em' }}
              >
                {g.zh}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MiniHex({ lines, title, sub }: { lines: number[]; title: string; sub?: string }) {
  return (
    <div className={`hex-mini hex-mini-${title === '互' ? 'hu' : title === '错' ? 'cuo' : 'zong'}`}>
      <div className="hex-mini-head">
        <span>{title}</span>
        <b>{sub || '—'}</b>
      </div>
      <div className="hex-mini-yao">
        {[5, 4, 3, 2, 1, 0].map((i) => {
          const v = lines[i] ?? 8;
          return <i key={i} className={v === 7 || v === 9 ? 'yang' : 'yin'} />;
        })}
      </div>
    </div>
  );
}

export function KnowledgePage() {
  const [kMode, setKMode] = useState<'hex' | 'liuxiang'>('hex');
  const [lxGua, setLxGua] = useState('qian');
  const [lxBag, setLxBag] = useState<Record<string, string[]> | null>(null);
  const [q, setQ] = useState('');
  const [upperF, setUpperF] = useState('all');
  const [lowerF, setLowerF] = useState('all');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [guaFilter, setGuaFilter] = useState<Gua | null>(null);
  /** 观盘（§4.11 路线 A）：罗盘舞台默认收起 */
  const [showRing, setShowRing] = useState(false);

  const list = useMemo(() => {
    let arr = HEXAGRAM_TABLE.map((h) => ({
      kingwen: h.kingwen,
      name: h.name,
      fullName: h.name,
      upper: h.upper as Gua,
      lower: h.lower as Gua,
      lines: dualToLines(h.upper, h.lower),
    }));
    if (upperF !== 'all') arr = arr.filter((h) => h.upper === upperF);
    if (lowerF !== 'all') arr = arr.filter((h) => h.lower === lowerF);
    if (guaFilter) {
      arr = arr.filter((h) => h.upper === guaFilter || h.lower === guaFilter);
    }
    const k = q.trim();
    if (k) {
      arr = arr.filter(
        (h) => h.name.includes(k) || h.fullName.includes(k) || String(h.kingwen) === k,
      );
    }
    return arr;
  }, [q, upperF, lowerF, guaFilter]);

  async function openHex(id: number) {
    setSelected(id);
    try {
      const r = (await apiClient.getHexagram(String(id))) as Record<string, unknown>;
      setDetail((r.hexagram ?? r) as Record<string, unknown>);
    } catch (e) {
      toast('error', errText(e));
    }
  }

  const detailLines = detail ? knowledgeLines(detail) : [];
  const yaoList =
    ((detail?.lines ?? []) as Array<{
      pos: number;
      yang: boolean;
      label?: string;
      text?: string;
    }>) || [];
  const upId = detail?.upper as Gua | undefined;
  const loId = detail?.lower as Gua | undefined;
  const rel =
    detailLines.length === 6
      ? {
          hu: huFromBen(detailLines),
          cuo: cuoGua(detailLines),
          zong: zongGua(detailLines),
        }
      : null;
  const huLabel = rel ? labelDual(rel.hu.upper, rel.hu.lower, rel.hu.name) : '—';

  useEffect(() => {
    if (kMode !== 'liuxiang') return;
    let cancel = false;
    void apiClient
      .getLiuXiang(lxGua)
      .then((r) => {
        if (!cancel) {
          const bag =
            (r as { bag?: Record<string, string[]> }).bag ??
            ((r as { gua?: Record<string, string[]> }).gua as Record<
              string,
              string[]
            >);
          setLxBag(bag ?? {});
        }
      })
      .catch((e) => {
        if (!cancel) {
          setLxBag({});
          toast('error', errText(e));
        }
      });
    return () => {
      cancel = true;
    };
  }, [kMode, lxGua]);


  return (
    <div className="page-fade knowledge-page">
      <h2>知识浏览</h2>
      <p className="hint">通用易理知识库 · 不含个人案例</p>
      <div className="filter-bar kg-toolbar">
        <button
          type="button"
          className={`chip${kMode === 'hex' ? ' active' : ''}`}
          onClick={() => setKMode('hex')}
        >
          六十四卦
        </button>
        <button
          type="button"
          className={`chip${kMode === 'liuxiang' ? ' active' : ''}`}
          onClick={() => setKMode('liuxiang')}
        >
          类象全表
        </button>
        {kMode === 'liuxiang' &&
          BAGUA_RING.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`chip gua-btn${lxGua === g.id ? ' active' : ''}`}
              onClick={() => setLxGua(g.id)}
            >
              {g.zh}
            </button>
          ))}
        {kMode === 'hex' && (
          <>
            <input
              placeholder="卦名或序号"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 150 }}
            />
            <select value={upperF} onChange={(e) => setUpperF(e.target.value)}>
              <option value="all">上卦</option>
              {BAGUA_RING.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.zh}
                </option>
              ))}
            </select>
            <select value={lowerF} onChange={(e) => setLowerF(e.target.value)}>
              <option value="all">下卦</option>
              {BAGUA_RING.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.zh}
                </option>
              ))}
            </select>
            {/* 筛选语义显式化（§4.11）：罗盘=含X（OR）；上下卦=上X 下Y（AND） */}
            {guaFilter && (
              <button
                type="button"
                className="chip active"
                title="罗盘筛选：上卦或下卦含此卦"
                onClick={() => setGuaFilter(null)}
              >
                含{GUA_NAME_ZH[guaFilter]} ×
              </button>
            )}
            {(upperF !== 'all' || lowerF !== 'all') && (
              <button
                type="button"
                className="chip active"
                title="精确定位：上卦且下卦"
                onClick={() => {
                  setUpperF('all');
                  setLowerF('all');
                }}
              >
                {upperF !== 'all' ? `上${guaZh(upperF)}` : ''}
                {upperF !== 'all' && lowerF !== 'all' ? ' ' : ''}
                {lowerF !== 'all' ? `下${guaZh(lowerF)}` : ''} ×
              </button>
            )}
            <span className="spacer" />
            <span className="hint">筛出 {list.length} / 64</span>
            <button
              type="button"
              className={`chip${showRing ? ' active' : ''}`}
              onClick={() => setShowRing((v) => !v)}
            >
              观盘 {showRing ? '▾' : '▸'}
              {detail && !showRing ? (
                <i className="kg-ring-dot" title="已标定方位" />
              ) : null}
            </button>
          </>
        )}
      </div>
      {kMode === 'liuxiang' ? (
        <div className="panel">
          <div className="row lx-head">
            <h3>类象全表 · {BAGUA_RING.find((g) => g.id === lxGua)?.zh ?? lxGua}</h3>
            <span className="lx-trigram" aria-hidden>
              {/* 三爻卦符（§4.11b）：类象是八卦，上爻在顶（§4.6 爻序契约） */}
              {[2, 1, 0].map((i) => (
                <span
                  key={i}
                  className={`hc-yao${(TRIGRAM_LINES[lxGua]?.[i] ?? 8) === 7 ? ' yang' : ''}`}
                >
                  <i />
                  <i />
                </span>
              ))}
            </span>
          </div>
          {!lxBag ? (
            <p className="muted">加载中…</p>
          ) : Object.keys(lxBag).length === 0 ? (
            <p className="muted">类目库暂缺或为空（请先构建知识库）</p>
          ) : (
            <>
              <nav className="lx-index" aria-label="类目索引">
                {Object.keys(lxBag).map((cat) => (
                  <a key={cat} href={`#lx-${cat}`} className="lx-index-item">
                    {cat}
                  </a>
                ))}
              </nav>
              <div className="lx-rows">
                {Object.entries(lxBag).map(([cat, words]) => (
                  <section key={cat} id={`lx-${cat}`} className="lx-row">
                    <h4 className="lx-cat">{cat}</h4>
                    <div className="lx-words">
                      {words.map((w, i) =>
                        w.length <= 6 && !w.includes('。') && !w.includes('：') ? (
                          <span key={i} className="lx-chip">
                            {w}
                          </span>
                        ) : (
                          <span key={i} className="lx-plain">
                            {w}
                          </span>
                        ),
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
      <>
      {showRing && (
        <div className="panel compass-panel kg-stage">
          <div className="row">
            <h3>八卦罗盘</h3>
            <span className="hint">先天方位 · 点卦位=「含X」筛选</span>
          </div>
          <BaguaRing
            highlight={
              upId && loId ? [upId, loId] : guaFilter ? [guaFilter] : []
            }
            filterGua={guaFilter}
            onPick={(g) => setGuaFilter((cur) => (cur === g ? null : g))}
          />
        </div>
      )}

      <div className="cols" style={{ gridTemplateColumns: '1fr 360px' }}>
        <div>
          <div className="hex-grid">
            {list.map((h) => (
              <button
                key={h.kingwen}
                type="button"
                className={`hex-card${selected === h.kingwen ? ' active' : ''}`}
                onClick={() => void openHex(h.kingwen)}
              >
                <span className="hex-card-lines" aria-hidden>
                  {/* 爻序契约（§4.6）：数据初爻在底，渲染上爻在顶；双段 <i> 为绘线载体 */}
                  {[5, 4, 3, 2, 1, 0].map((i) => {
                    const yao = h.lines[i] ?? 8;
                    return (
                      <span
                        key={i}
                        className={`hc-yao${yao === 7 || yao === 9 ? ' yang' : ''}`}
                      >
                        <i />
                        <i />
                      </span>
                    );
                  })}
                </span>
                <span className="hex-card-name">{h.name}</span>
                <span className="hex-card-no muted">{h.kingwen}</span>
              </button>
            ))}
          </div>
          {!list.length &&
            (q.trim() || guaFilter || upperF !== 'all' || lowerF !== 'all' ? (
              <p className="muted" style={{ padding: 16 }}>
                当前筛选无卦，可清除筛选
              </p>
            ) : (
              <SkeletonRows n={3} />
            ))}
        </div>
        <div className="panel kg-detail">
          {detail ? (
            <>
              <div className="row kg-detail-head">
                <h3
                  style={{ fontFamily: 'Songti SC, serif', fontSize: 22, margin: 0 }}
                >
                  {String(detail.fullName ?? detail.name ?? '')}
                </h3>
                <span className="spacer" />
                <button
                  type="button"
                  className="ghost sm"
                  disabled={!selected || selected <= 1}
                  onClick={() => void openHex((selected ?? 1) - 1)}
                >
                  ← 上一卦
                </button>
                <button
                  type="button"
                  className="ghost sm"
                  disabled={!selected || selected >= 64}
                  onClick={() => void openHex((selected ?? 1) + 1)}
                >
                  下一卦 →
                </button>
              </div>
              <p className="muted">
                {detail.kingwen ? `文王 ${String(detail.kingwen)}` : ''}
                {upId && loId
                  ? ` · 上${GUA_NAME_ZH[upId] ?? upId} 下${GUA_NAME_ZH[loId] ?? loId}`
                  : ''}
              </p>
              {detailLines.length === 6 && (
                <div className="hexboards">
                  <HexBoard
                    kind="ben"
                    name={String(detail.fullName ?? detail.name ?? '')}
                    lines={detailLines}
                    movingYao={0 as never}
                  />
                </div>
              )}
              {rel && (
                <div className="hex-mini-row">
                  <MiniHex
                    lines={dualToLines(rel.hu.upper, rel.hu.lower)}
                    title="互"
                    sub={huLabel}
                  />
                  <MiniHex
                    lines={dualToLines(rel.cuo.upper, rel.cuo.lower)}
                    title="错"
                    sub={labelDual(rel.cuo.upper, rel.cuo.lower, rel.cuo.name)}
                  />
                  <MiniHex
                    lines={dualToLines(rel.zong.upper, rel.zong.lower)}
                    title="综"
                    sub={labelDual(rel.zong.upper, rel.zong.lower, rel.zong.name)}
                  />
                </div>
              )}
              <p className="hint">互＝二至五 · 错＝六爻反 · 综＝上下颠</p>
              {detail.gloss ? (
                <section className="kg-sec">
                  <h4>理</h4>
                  <p>{String(detail.gloss)}</p>
                  <p className="hint">体用总诀：动爻所在为用，不动为体。</p>
                </section>
              ) : null}
              <section className="kg-sec">
                <h4>经</h4>
                <h4 style={{ fontFamily: 'inherit', letterSpacing: 0 }}>
                  卦辞
                </h4>
                <p>{String(detail.guaCi ?? '—')}</p>
                <h4 style={{ fontFamily: 'inherit', letterSpacing: 0 }}>
                  爻辞
                </h4>
                <ol>
                  {yaoList.map((l) => (
                    <li key={l.pos}>
                      <b>{l.label ?? l.pos}</b> {l.text}
                    </li>
                  ))}
                </ol>
                {detail.yongYao ? (
                  <p className="hint">用九/用六：{String(detail.yongYao)}</p>
                ) : null}
              </section>
              <section className="kg-sec">
                <h4>类象</h4>
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => {
                    setKMode('liuxiang');
                    if (upId) setLxGua(upId);
                  }}
                >
                  跳类象全表（预选上卦）→
                </button>
              </section>
              <section className="kg-sec">
                <h4>传</h4>
                <p className="muted">大象、彖待知识库补充</p>
              </section>
            </>
          ) : (
            <EmptyState title="点选任一卦" desc="查看卦画、互错综与经传。" />
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

export function SettingsPage({
  onChanged,
  onDeletedPerson,
  onRenamedPerson,
  personId,
}: {
  onChanged?: (s: { hasKey?: boolean; school?: string }) => void;
  onDeletedPerson?: (id: string) => void;
  onRenamedPerson?: (id: string, name: string) => void;
  personId?: string | null;
} = {}) {
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [school, setSchool] = useState('mod');
  const [kbVersion, setKbVersion] = useState('');
  const [persons, setPersons] = useState<Array<{ id: string; name: string }>>([]);
  const [personFilter, setPersonFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchAck, setBatchAck] = useState(false);
  const [lastTestAt, setLastTestAt] = useState<string | null>(null);
  const [lastTestOk, setLastTestOk] = useState<string | null>(null);
  const [lastTestMsg, setLastTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [coolDown, setCoolDown] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [confirmClearKey, setConfirmClearKey] = useState(false);
  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [delPersonTarget, setDelPersonTarget] = useState<{
    id: string;
    name: string;
    isCurrent: boolean;
  } | null>(null);

  const presets: Record<string, { baseUrl: string; model: string; label: string; desc: string }> =
    {
      deepseek: {
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        label: 'DeepSeek',
        desc: 'OpenAI 兼容',
      },
      kimi: {
        baseUrl: 'https://api.moonshot.cn/v1',
        model: 'kimi-k2-0905-preview',
        label: 'Kimi',
        desc: 'Moonshot',
      },
      custom: {
        baseUrl: '',
        model: '',
        label: '自定义',
        desc: 'OpenAI 兼容端点',
      },
      anthropic: {
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-20250514',
        label: 'Anthropic',
        desc: 'Anthropic 协议',
      },
    };

  const visiblePersons = persons.filter((p) =>
    personFilter.trim() ? p.name.includes(personFilter.trim()) : true,
  );

  useEffect(() => {
    void apiClient.settings().then((s) => {
      setHasKey(s.hasKey);
      const extra = s as unknown as {
        provider?: string;
        baseUrl?: string;
        model?: string;
        school?: string;
        kbVersion?: string;
        lastTestAt?: string | null;
        lastTestOk?: string | null;
        lastTestMsg?: string | null;
      };
      const raw = extra.provider ?? 'deepseek';
      const mapped =
        raw === 'deepseek' || raw === 'kimi' || raw === 'anthropic'
          ? raw
          : 'custom';
      setProvider(mapped);
      setBaseUrl(extra.baseUrl ?? '');
      setModel(extra.model ?? '');
      setSchool(extra.school ?? 'mod');
      setKbVersion(extra.kbVersion ?? '');
      setLastTestAt(extra.lastTestAt ?? null);
      setLastTestOk(extra.lastTestOk ?? null);
      setLastTestMsg(extra.lastTestMsg ?? null);
      setDirty(false);
    });
    void apiClient.listPersons().then((r) => setPersons(r.persons));
  }, []);

  function applyPreset(id: string) {
    const p = presets[id];
    setProvider(id);
    if (p) {
      if (id !== 'custom') {
        setBaseUrl(p.baseUrl);
        setModel(p.model);
      }
    }
    setDirty(true);
  }

  function createPersonByName(name: string) {
    void apiClient
      .createPerson(name)
      .then((r) => {
        setPersons((x) => [...x, r.person]);
        toast('ok', `已创建 ${r.person.name}`);
      })
      .catch((e) => toast('error', errText(e)));
  }

  function renamePersonTo(id: string, name: string) {
    void apiClient
      .renamePerson(id, name)
      .then(() => {
        setPersons((x) => x.map((y) => (y.id === id ? { ...y, name } : y)));
        onRenamedPerson?.(id, name);
        toast('ok', '已改名');
      })
      .catch((e) => toast('error', errText(e)));
  }

  function deletePersonById(id: string, name: string) {
    void apiClient
      .deletePerson(id)
      .then(() => {
        setPersons((x) => x.filter((y) => y.id !== id));
        onDeletedPerson?.(id);
        toast('ok', `已删除 ${name}`);
      })
      .catch((e) => toast('error', errText(e)));
  }

  function pickPreset(id: string) {
    const p = presets[id];
    if (id !== 'custom' && p && dirty) {
      const hasEdit = baseUrl.trim() || model.trim() || apiKey.trim();
      if (hasEdit) {
        setPendingPreset(id);
        return;
      }
    }
    applyPreset(id);
    setTestMsg(null);
  }

  async function doTest() {
    if (testing || coolDown) return;
    setTesting(true);
    setTestMsg(null);
    try {
      await apiClient.testLlm({ provider, baseUrl, model, apiKey });
      setTestMsg({ ok: true, text: `连接成功 · ${model || '模型已识别'}` });
      toast('ok', '测试连接成功');
    } catch (e) {
      setTestMsg({ ok: false, text: errText(e) });
      toast('error', errText(e));
    } finally {
      setTesting(false);
      setCoolDown(true);
      window.setTimeout(() => setCoolDown(false), 3000);
      // S-19：刷新测连层
      void apiClient.settings().then((s) => {
        const extra = s as unknown as {
          lastTestAt?: string | null;
          lastTestOk?: string | null;
          lastTestMsg?: string | null;
        };
        setLastTestAt(extra.lastTestAt ?? null);
        setLastTestOk(extra.lastTestOk ?? null);
        setLastTestMsg(extra.lastTestMsg ?? null);
      });
    }
  }

  async function doSave(clear = false) {
    try {
      await apiClient.putLlmSettings({
        provider,
        baseUrl,
        model,
        apiKey: clear ? undefined : apiKey,
        clearApiKey: clear,
      });
      const s = await apiClient.settings();
      setHasKey(s.hasKey);
      if (clear) setApiKey('');
      setDirty(false);
      toast('ok', clear ? '已清除 Key' : '已保存并启用');
      onChanged?.({ hasKey: s.hasKey, school });
    } catch (e) {
      toast('error', errText(e));
    }
  }

  return (
    <div className="page-fade">
      <h2>设置</h2>

      <div className="panel">
        <div className="wizard-steps">
          <span>
            <b>1</b> 预设
          </span>
          <span>
            <b>2</b> Key 与测连
          </span>
          <span>
            <b>3</b> 保存启用
          </span>
          <span className="spacer" />
          <span className={`badge ${hasKey ? 'ok' : 'warn'}`}>
            {hasKey ? '已配置 Key' : '未配置 Key'}
          </span>
          {lastTestOk === '1' ? (
            <span className="badge ok">
              测连已通过
              {lastTestAt ? ` · ${new Date(lastTestAt).toLocaleString()}` : ''}
            </span>
          ) : lastTestOk === '0' ? (
            <span className="badge danger">
              测连失败{lastTestMsg ? ` · ${lastTestMsg}` : ''}
            </span>
          ) : (
            <span className="badge">测连：未测</span>
          )}
          {kbVersion ? <span className="badge">KB {kbVersion}</span> : null}
        </div>

        <div className="preset-cards">
          {Object.entries(presets).map(([id, p]) => (
            <button
              key={id}
              type="button"
              className={provider === id ? 'active' : ''}
              onClick={() => pickPreset(id)}
            >
              <strong>{p.label}</strong>
              <span className="muted">{p.desc}</span>
            </button>
          ))}
        </div>
        <p className="hint">不提供「模拟模型」选项；未配置 Key 时自动离线，可起卦并走规则步。</p>

        <label>
          Base URL
          <input
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setDirty(true);
            }}
            placeholder="https://..."
          />
        </label>
        <label>
          Model
          <input
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setDirty(true);
            }}
            placeholder="deepseek-chat"
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setDirty(true);
            }}
            placeholder="仅存本机 config.local.json"
          />
        </label>
        <div className="row">
          <button
            type="button"
            disabled={testing || coolDown}
            onClick={() => void doTest()}
          >
            {testing ? '测试中…' : coolDown ? '请稍候…' : '测试连接'}
          </button>
          <button type="button" className="primary" onClick={() => void doSave(false)}>
            保存并启用
          </button>
          {hasKey && (
            <button
              type="button"
              className="danger sm"
              onClick={() => setConfirmClearKey(true)}
            >
              清除 Key
            </button>
          )}
          {dirty && <span className="badge warn">未保存</span>}
          {testMsg && (
            <span className={`badge test-badge ${testMsg.ok ? 'ok' : 'danger'}`}>
              {testMsg.text}
            </span>
          )}
        </div>
        <p className="hint">Key 仅存本机 config.local.json，不入库、不上传。留空保存 = 保持已存 Key；清除请点「清除 Key」。</p>
      </div>

      <div className="panel">
        <h2>流派</h2>
        <div className="segmented">
          <button
            type="button"
            className={school === 'mod' ? 'active' : ''}
            onClick={() => setSchool('mod')}
          >
            取模派
          </button>
          <button
            type="button"
            className={school === 'sum' ? 'active' : ''}
            onClick={() => setSchool('sum')}
          >
            总和派
          </button>
        </div>
        <p className="hint">三数动爻流派；V1 不含时（addHour=false）。</p>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void apiClient
              .putSettings({ 'school.movingYao': school })
              .then(() => {
                toast('ok', '流派已保存');
                onChanged?.({ school });
              })
              .catch((e) => toast('error', errText(e)));
          }}
        >
          保存流派
        </button>
      </div>

      <div className="panel">
        <div className="row">
          <h2>档案（{persons.length}）</h2>
          <span className="spacer" />
          <input
            className="person-filter"
            placeholder="过滤名称…"
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
          />
          <button
            type="button"
            className="ghost sm"
            onClick={() => setNewPersonOpen(true)}
          >
            + 新建档案
          </button>
        </div>
        <p className="hint">删除 = 硬删该档案全部数据，不可恢复。建议先导出。</p>
        <div className="person-list">
          {visiblePersons.map((p) => {
            const isCurrent = personId === p.id;
            return (
              <div key={p.id} className={`person-row${isCurrent ? ' current' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={(e) =>
                    setSelectedIds((cur) =>
                      e.target.checked
                        ? [...cur, p.id]
                        : cur.filter((x) => x !== p.id),
                    )
                  }
                />
                <div className="person-name">
                  <span title={p.name}>{p.name}</span>
                  {isCurrent && <em className="badge ok">当前</em>}
                </div>
                <div className="person-actions">
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() =>
                      setRenameTarget({ id: p.id, name: p.name })
                    }
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    className="ghost sm"
                    onClick={() => {
                      void apiClient
                        .exportPerson(p.id)
                        .then((data) => {
                          const safe =
                            p.name.replace(/[\\/:*?"<>|]/g, '_') || 'person';
                          const blob = new Blob(
                            [JSON.stringify(data, null, 2)],
                            { type: 'application/json' },
                          );
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = `export-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
                          a.click();
                        })
                        .catch((e) => toast('error', errText(e)));
                    }}
                  >
                    导出
                  </button>
                  <button
                    type="button"
                    className="danger sm"
                    disabled={batchBusy}
                    onClick={() =>
                      setDelPersonTarget({
                        id: p.id,
                        name: p.name,
                        isCurrent,
                      })
                    }
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
          {!visiblePersons.length && (
            <p className="muted" style={{ padding: '12px 0' }}>
              {persons.length ? '无匹配，清空筛选试试' : '暂无档案，请新建'}
            </p>
          )}
        </div>
        <div className="person-foot">
          <span className="muted">
            已选 {selectedIds.length} · 显示 {visiblePersons.length}/{persons.length}
            {selectedIds.length > visiblePersons.length
              ? `（含已隐藏 ${selectedIds.length - visiblePersons.length}）`
              : ''}
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="ghost sm"
            onClick={() => setSelectedIds([])}
            disabled={!selectedIds.length}
          >
            清除选择
          </button>
          <button
            type="button"
            className="ghost sm"
            onClick={() => {
              const ids = visiblePersons.map((p) => p.id);
              setSelectedIds((cur) =>
                cur.length === ids.length ? [] : ids,
              );
            }}
          >
            全选可见
          </button>
          <button
            type="button"
            className="danger sm"
            disabled={batchBusy || selectedIds.length === 0}
            onClick={() => {
              setBatchAck(false);
              setBatchOpen(true);
            }}
          >
            {batchBusy ? '删除中…' : `删除所选（${selectedIds.length}）`}
          </button>
        </div>
      </div>

      {batchOpen && (
        <div className="modal-mask" role="dialog" aria-modal="true">
          <div className="modal-card modal-danger">
            <h3>删除所选档案</h3>
            <p className="hint">
              将硬删下列档案及其会话/案例/记忆，不可恢复。
            </p>
            <ul className="modal-list">
              {persons
                .filter((p) => selectedIds.includes(p.id))
                .slice(0, 30)
                .map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {personId === p.id ? '（当前）' : ''}
                  </li>
                ))}
              {selectedIds.length > 30 && <li>… 等 {selectedIds.length} 个</li>}
            </ul>
            <label className="modal-ack">
              <input
                type="checkbox"
                checked={batchAck}
                onChange={(e) => setBatchAck(e.target.checked)}
              />
              <span>我已知删除不可恢复</span>
            </label>
            <div className="row">
              <button
                type="button"
                className="danger"
                disabled={!batchAck || batchBusy}
                onClick={() => {
                  setBatchBusy(true);
                  void (async () => {
                    let done = 0;
                    for (const id of selectedIds) {
                      try {
                        await apiClient.deletePerson(id);
                        done++;
                        onDeletedPerson?.(id);
                      } catch (e) {
                        toast(
                          'error',
                          `已删 ${done}/${selectedIds.length}，失败：${errText(e)}`,
                        );
                        setBatchBusy(false);
                        setBatchOpen(false);
                        setSelectedIds([]);
                        void apiClient
                          .listPersons()
                          .then((r) => setPersons(r.persons));
                        return;
                      }
                    }
                    toast('ok', `已删除 ${done} 个档案`);
                    setSelectedIds([]);
                    setBatchBusy(false);
                    setBatchOpen(false);
                    void apiClient.listPersons().then((r) => setPersons(r.persons));
                  })();
                }}
              >
                {batchBusy ? '删除中…' : '确认删除'}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={batchBusy}
                onClick={() => setBatchOpen(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>数据与关于</h2>
        <p className="muted">KB 版本：{kbVersion || '—'}</p>
        <p className="disclaimer" style={{ border: 'none', textAlign: 'left' }}>
          本应用仅供娱乐与学习，不构成医疗、法律或投资建议。
        </p>
      </div>

      <ConfirmDialog
        open={!!pendingPreset}
        title="切换预设？"
        desc="将覆盖当前的 Base URL / Model；已保存的 Key 不受影响。"
        confirmLabel="切换"
        onCancel={() => setPendingPreset(null)}
        onConfirm={() => {
          const id = pendingPreset;
          setPendingPreset(null);
          if (id) applyPreset(id);
        }}
      />
      <ConfirmDialog
        open={confirmClearKey}
        title="清除 API Key？"
        desc="将删除本机已保存的 Key，解卦改为离线（规则步骤仍可用）。"
        confirmLabel="清除"
        danger
        onCancel={() => setConfirmClearKey(false)}
        onConfirm={() => {
          setConfirmClearKey(false);
          void doSave(true);
        }}
      />
      <PromptDialog
        open={newPersonOpen}
        title="新建档案"
        label="称谓"
        placeholder="如：母亲 / 张三 / 同事小李"
        confirmLabel="创建"
        onCancel={() => setNewPersonOpen(false)}
        onConfirm={(name) => {
          setNewPersonOpen(false);
          createPersonByName(name);
        }}
      />
      <PromptDialog
        open={!!renameTarget}
        title="重命名档案"
        label="新称谓"
        defaultValue={renameTarget?.name ?? ''}
        confirmLabel="保存"
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => {
          const t = renameTarget;
          setRenameTarget(null);
          if (t && name !== t.name) renamePersonTo(t.id, name);
        }}
      />
      <ConfirmDialog
        open={!!delPersonTarget}
        title={`删除档案「${delPersonTarget?.name ?? ''}」？`}
        desc={`将硬删该档案的会话/案例/记忆，不可恢复。${
          delPersonTarget?.isCurrent ? '（这是当前使用中档案，删除后需重新选择。）' : ''
        }`}
        confirmLabel="删除"
        danger
        onCancel={() => setDelPersonTarget(null)}
        onConfirm={() => {
          const t = delPersonTarget;
          setDelPersonTarget(null);
          if (t) deletePersonById(t.id, t.name);
        }}
      />
    </div>
  );
}

export type { Person };
type Person = { id: string; name: string };
