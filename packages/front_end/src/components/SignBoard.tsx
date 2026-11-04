import { useMemo, useState } from 'react';

import {
  gradeClass,
  gradeLabel,
  movingYaoLabel,
  questionBrief,
} from '../app/labels';
import { exportSignPng } from './signExport';

export type SignPoem = {
  text?: string;
  lines?: [string, string] | string[];
  source?: 'llm' | 'rule' | string;
};

export type SignBoardProps = {
  grade: string;
  ben: {
    name: string;
    lines: number[];
    movingYao?: number;
  };
  poem?: SignPoem | null;
  question?: string;
  /** 敏感类必出免责（规格 §3.7） */
  sensitive?: boolean;
  /** 流式中：有 grade 无新诗 */
  poemPending?: boolean;
};

const FALLBACK_NOTE = '诗签暂缺';
const DISCLAIMER =
  '仅供娱乐与学习，不构成医疗、法律或投资建议。';

/** 仅展示：逻辑序上句→下句；右→左由 CSS vertical-rl 完成 */
function normalizePoem(poem?: SignPoem | null): {
  upper?: string;
  lower?: string;
  source?: string;
  legacySingle?: boolean;
} {
  if (!poem) return {};
  const lines = poem.lines;
  if (Array.isArray(lines) && lines.length >= 2) {
    return {
      upper: String(lines[0] ?? ''),
      lower: String(lines[1] ?? ''),
      source: poem.source,
    };
  }
  const text = (poem.text ?? '').trim();
  if (!text) return { source: poem.source };
  const parts = text
    .split(/\n|，|。|；|;/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      upper: parts[0],
      lower: parts[1],
      source: poem.source,
    };
  }
  return { upper: text, source: poem.source, legacySingle: true };
}

function isSensitiveQuestion(q?: string, sensitive?: boolean): boolean {
  if (sensitive) return true;
  if (!q) return false;
  return /病|疾|医|讼|法|死|投资|股|遗|生死/.test(q);
}

/** 八卦环刻度 */
function BaguaRing() {
  const groups = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <svg
      className="sign-ring"
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.14"
      />
      <circle
        cx="100"
        cy="100"
        r="82"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2 7"
        opacity="0.1"
      />
      {groups.map((i) => {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return (
          <line
            key={i}
            x1={100 + cos * 74}
            y1={100 + sin * 74}
            x2={100 + cos * 88}
            y2={100 + sin * 88}
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.16"
          />
        );
      })}
    </svg>
  );
}

function CornerOrnament({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg
      className={`sign-corner sign-corner-${pos}`}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 20 V2 H20 M2 28 V8 H12 M8 2 V12 H2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function SignBoard({
  grade,
  ben,
  poem,
  question,
  sensitive,
  poemPending,
}: SignBoardProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const n = useMemo(() => normalizePoem(poem), [poem]);
  const brief = questionBrief(question);
  const showDisclaimer = isSensitiveQuestion(question, sensitive);
  const gLabel = gradeLabel(grade);
  const mLabel = ben.movingYao ? movingYaoLabel(ben.movingYao) : undefined;

  const yaoRows = useMemo(() => {
    const lines = ben.lines ?? [];
    return [5, 4, 3, 2, 1, 0].map((idx) => {
      const pos = idx + 1;
      const v = lines[idx] ?? 8;
      const yang = v === 7 || v === 9;
      return { pos, yang, moving: ben.movingYao === pos };
    });
  }, [ben.lines, ben.movingYao]);

  const copyText = useMemo(() => {
    const rows = [
      `【${gLabel}】${ben.name || '—'}${mLabel ? ` · ${mLabel}` : ''}`,
    ];
    if (n.upper) rows.push(n.upper);
    if (n.lower) rows.push(n.lower);
    if (!n.upper && !n.lower) {
      rows.push(poemPending ? '…' : FALLBACK_NOTE);
    }
    if (brief) rows.push(`问：${brief}`);
    if (showDisclaimer) rows.push(`（${DISCLAIMER}）`);
    return rows.join('\n');
  }, [gLabel, ben.name, mLabel, n.upper, n.lower, poemPending, brief, showDisclaimer]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportSignPng({
        gradeLabel: gLabel,
        guaName: ben.name || '—',
        movingLabel: mLabel,
        yaoRows,
        upper: n.upper,
        lower: n.lower,
        legacySingle: n.legacySingle && n.upper ? n.upper : undefined,
        brief,
        showDisclaimer,
        disclaimer: DISCLAIMER,
      });
    } catch {
      /* 导出失败静默；可由调用方 toast */
    } finally {
      setExporting(false);
    }
  };

  return (
    <article className="signboard sign-open" aria-label="签牌">
      <div className="sign-decor" aria-hidden="true">
        <CornerOrnament pos="tl" />
        <CornerOrnament pos="tr" />
        <CornerOrnament pos="bl" />
        <CornerOrnament pos="br" />
      </div>

      <header className="sign-head sign-head-center">
        <div className="sign-actions">
          <button
            type="button"
            className="sign-act"
            title="复制签文"
            aria-label="复制签文"
            onClick={() => void onCopy()}
          >
            {copied ? <span className="sign-seal-qi">讫</span> : '录'}
          </button>
          <button
            type="button"
            className="sign-act"
            title="导出签图"
            aria-label="导出签图"
            disabled={exporting}
            onClick={() => void onExport()}
          >
            摹
          </button>
        </div>
        <span
          className={`sign-seal sign-seal-main ${gradeClass(grade)}`}
          aria-label={gLabel}
        >
          <span className="sign-seal-inner">{gLabel}</span>
        </span>
      </header>

      <div className="sign-hex">
        <div className="sign-hex-stage">
          <BaguaRing />
          <div className="sign-yao" aria-hidden>
            {yaoRows.map((r) => (
              <div
                key={r.pos}
                className={`sign-yao-line${r.yang ? ' yang' : ' yin'}${r.moving ? ' moving' : ''}`}
              >
                {r.yang ? (
                  <i className="bar solid" />
                ) : (
                  <>
                    <i className="bar" />
                    <i className="bar" />
                  </>
                )}
                {r.moving ? (
                  <span className="sign-dong-out" title={`动爻 ${r.pos}`}>
                    {mLabel || `动${r.pos}`}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <p className="sign-gua-name">{ben.name || '—'}</p>
        <div className="sign-gold-rule" aria-hidden="true" />
      </div>

      <div className="sign-poem" aria-label="签诗">
        {n.legacySingle && n.upper ? (
          <div className="sign-poem-rail single">
            <p className="sign-poem-single">{n.upper}</p>
          </div>
        ) : n.upper || n.lower ? (
          <div className="sign-poem-rail">
            <p className="sign-poem-col upper">{n.upper ?? ''}</p>
            <span className="sign-poem-seal" aria-hidden="true">
              诗
            </span>
            <p className="sign-poem-col lower">{n.lower ?? ''}</p>
          </div>
        ) : (
          <div className="sign-poem-rail single">
            <p className="sign-poem-empty">{poemPending ? '…' : FALLBACK_NOTE}</p>
          </div>
        )}
      </div>

      <footer className="sign-foot">
        {brief ? (
          <p className="sign-brief">
            <span className="sign-wen-seal" aria-hidden="true">
              问
            </span>
            {brief}
          </p>
        ) : null}
        {(n.source === 'rule' || (!n.upper && !poemPending && poem?.source === 'rule')) && (
          <span className="sign-rule-tag">规则</span>
        )}
        {showDisclaimer ? <p className="sign-disclaimer">{DISCLAIMER}</p> : null}
      </footer>
    </article>
  );
}

export default SignBoard;
