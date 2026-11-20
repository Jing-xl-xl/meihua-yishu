import { useLayoutEffect, useState } from 'react';

/** 与后端 trigrams.ts 同构：7=阳 8=阴，下→上 */
const TRIGRAM: Record<string, [number, number, number]> = {
  qian: [7, 7, 7],
  dui: [7, 7, 8],
  li: [7, 8, 7],
  zhen: [7, 8, 8],
  xun: [8, 7, 7],
  kan: [8, 7, 8],
  gen: [8, 8, 7],
  kun: [8, 8, 8],
};

export const GUA_ZH: Record<string, string> = {
  qian: '乾',
  dui: '兑',
  li: '离',
  zhen: '震',
  xun: '巽',
  kan: '坎',
  gen: '艮',
  kun: '坤',
};

export const GUA_ORDER: Array<{ id: string; zh: string; num: number }> = [
  { id: 'qian', zh: '乾', num: 1 },
  { id: 'dui', zh: '兑', num: 2 },
  { id: 'li', zh: '离', num: 3 },
  { id: 'zhen', zh: '震', num: 4 },
  { id: 'xun', zh: '巽', num: 5 },
  { id: 'kan', zh: '坎', num: 6 },
  { id: 'gen', zh: '艮', num: 7 },
  { id: 'kun', zh: '坤', num: 8 },
];

export function guaZh(g: string | undefined): string {
  if (!g) return '';
  return GUA_ZH[g] ?? g;
}

export function trigramLines(gua: string | undefined): number[] {
  if (!gua) return [];
  return TRIGRAM[gua] ?? [];
}

export function dualToLines(upper?: string, lower?: string): number[] {
  const lo = trigramLines(lower);
  const up = trigramLines(upper);
  if (lo.length !== 3 || up.length !== 3) return [];
  return [...lo, ...up];
}

function isYang(v: number): boolean {
  return v === 7 || v === 9;
}

/** 揲蓍 → 连续形变参数 v（视觉设计语言 §4.6）：7 少阳=1，8 少阴=0，9 老阳=1，6 老阴=0 */
export function yaoToV(yao: number): number {
  return yao === 7 || yao === 9 ? 1 : 0;
}

/** 爻条：双段矩形，间隙随 v 合拢（v=0 阴、v=1 阳）；morph=从对侧形变落位 ≤240ms */
export function YaoBar({ v, morph }: { v: number; morph?: boolean }) {
  const [liveV, setLiveV] = useState(morph ? 1 - v : v);
  useLayoutEffect(() => {
    if (!morph) {
      setLiveV(v);
      return;
    }
    setLiveV(1 - v);
    const id = requestAnimationFrame(() => setLiveV(v));
    return () => cancelAnimationFrame(id);
  }, [morph, v]);
  const k = 0.8 + 0.2 * liveV;
  return (
    <span className="yao-bar" aria-hidden>
      <span className="bar seg-l" style={{ transform: `scaleX(${k})` }} />
      <span className="bar seg-r" style={{ transform: `scaleX(${k})` }} />
    </span>
  );
}

export function MiniLines({ lines }: { lines: number[] }) {
  return (
    <span className="mini-lines" aria-hidden>
      {[5, 4, 3, 2, 1, 0].map((i) => {
        const v = lines[i] ?? 8;
        const yang = v === 7 || v === 9;
        return <i key={i} className={yang ? 'yang' : 'yin'} />;
      })}
    </span>
  );
}

export function HexBoard({
  kind,
  name,
  lines,
  movingYao,
  guaPair,
  tiYong,
  sub,
  markBian,
}: {
  kind: 'ben' | 'hu' | 'bian';
  name: string;
  lines: number[];
  /** 本卦动爻位置 1–6；变卦仅作「变」位标记 */
  movingYao?: 1 | 2 | 3 | 4 | 5 | 6;
  guaPair?: { upper: string; lower: string };
  tiYong?: 'ti' | 'yong' | null;
  sub?: string;
  markBian?: boolean;
}) {
  const title = kind === 'ben' ? '本' : kind === 'hu' ? '互' : '变';
  const showLines = lines.length === 6;
  const pairText = guaPair
    ? kind === 'hu'
      ? `互见${guaZh(guaPair.upper)}、${guaZh(guaPair.lower)}`
      : `${guaZh(guaPair.upper)}上${guaZh(guaPair.lower)}下`
    : '';
  const displayName =
    name || (kind === 'hu' ? pairText : '') || sub || '—';

  return (
    <div
      className={`hexboard kind-${kind}${tiYong ? ` hex-${tiYong}` : ''}`}
    >
      <div className="hexboard-head">
        <span className="hexboard-kind">{title}</span>
        <span className="hexboard-name">{displayName}</span>
      </div>
      {showLines ? (
        <div className="hexboard-yao">
          {[5, 4, 3, 2, 1, 0].map((i) => {
            const yao = lines[i] ?? 8;
            const yang = isYang(yao);
            const isMoving =
              kind === 'ben' && movingYao != null && movingYao === i + 1;
            const isBianMark =
              kind === 'bian' &&
              markBian &&
              movingYao != null &&
              movingYao === i + 1;
            return (
              <div
                key={i}
                className={[
                  'yao-line',
                  yang ? 'yang' : 'yin',
                  isMoving ? 'moving' : '',
                  isBianMark ? 'bian-mark' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <YaoBar v={yaoToV(yao)} morph={isMoving || isBianMark} />
                <span className="yao-flag">
                  {isMoving ? '动' : isBianMark ? '变' : ''}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted hexboard-empty">{sub ?? pairText ?? '—'}</p>
      )}
      {tiYong && (
        <span className={`tiyong-tag ${tiYong}`}>
          {tiYong === 'ti' ? '体' : '用'}
        </span>
      )}
      {kind === 'hu' && showLines && name && pairText ? (
        <p className="muted hexboard-sub">{pairText}</p>
      ) : null}
    </div>
  );
}
