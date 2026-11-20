import { REL_LABEL, REL_LEVEL, type RelCode, type RelLevel } from '@meihua/shared';

export type GraphNode = {
  id: string;
  name: string;
  kind: string;
  info: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  fromId: string;
  toId: string;
  relCode: string;
  label?: string | null;
  closeness?: number | null;
};

const LEVEL_COLOR: Record<RelLevel, string> = {
  self: '#b23a2e',
  blood: '#2a4a5c',
  partner: '#8a6b2f',
  social: '#5d6e5a',
  temp: '#8a8175',
  other: '#8a8175',
};

function levelOf(code: string): RelLevel {
  return REL_LEVEL[code as RelCode] ?? 'other';
}

/** 2D 关系图谱（规格 §12.3.4）· 点选小卡 */
export function RelationGraph({
  centerId,
  persons,
  relations,
  onPick,
  pickedId,
}: {
  centerId?: string;
  persons: GraphNode[];
  relations: GraphEdge[];
  onPick?: (id: string) => void;
  pickedId?: string | null;
}) {
  const count = Math.max(
    1,
    Math.min(12, persons.filter((p) => p.id !== centerId).length),
  );
  const W = count > 8 ? 620 : 520;
  const H = count > 8 ? 430 : 340;
  const cx = W / 2;
  const cy = H / 2;
  const center = persons.find((p) => p.id === centerId) ?? persons[0];
  const others = persons.filter((p) => p.id !== center?.id).slice(0, 12);

  const pos = new Map<string, { x: number; y: number }>();
  if (center) pos.set(center.id, { x: cx, y: cy });
  const ring = others.length <= 4 ? 108 : others.length <= 7 ? 122 : 142;
  others.forEach((p, i) => {
    const a = (Math.PI * 2 * i) / Math.max(others.length, 1) - Math.PI / 2;
    pos.set(p.id, { x: cx + ring * Math.cos(a), y: cy + ring * Math.sin(a) });
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      role="img"
      aria-label="档案关系图谱"
    >
      {relations.map((e) => {
        const a = pos.get(e.fromId) ?? pos.get(e.toId);
        const b = pos.get(e.toId) ?? pos.get(e.fromId);
        if (!a || !b) return null;
        const lvl = levelOf(e.relCode);
        return (
          <line
            key={e.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={LEVEL_COLOR[lvl]}
            strokeWidth={0.8 + (e.closeness ?? 3) * 0.5}
            strokeDasharray={lvl === 'temp' ? '4 4' : undefined}
            opacity={0.7}
          />
        );
      })}
      {[...pos.entries()].map(([id, pt]) => {
        const p = persons.find((x) => x.id === id);
        if (!p) return null;
        const isCenter = id === center?.id;
        const color = isCenter
          ? LEVEL_COLOR.self
          : LEVEL_COLOR[levelOf(String(p.info.relCode ?? 'other'))] ?? LEVEL_COLOR.other;
        return (
          <g
            key={id}
            onClick={() => onPick?.(id)}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick?.(id);
              }
            }}
          >
            <title>{p.name}</title>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={isCenter ? 28 : 22}
              fill={color}
              stroke={pickedId === id ? 'var(--cinnabar)' : 'var(--line-strong)'}
              strokeWidth={pickedId === id ? 2.5 : 1}
            />
            <text
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fill="#f8f4ec"
            >
              {(() => {
                const n = p.name || '?';
                return n.length > 3 ? `${n.slice(0, 2)}…` : n;
              })()}
            </text>
            {!isCenter && p.info.relCode ? (
              <text
                x={pt.x}
                y={pt.y + 30}
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-zhong)"
              >
                {REL_LABEL[p.info.relCode as RelCode] ?? String(p.info.relCode)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
