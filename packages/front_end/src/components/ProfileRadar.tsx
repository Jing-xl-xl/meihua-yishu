import { isAxesEmpty, type ProfileAxes } from '@meihua/shared';

export type { ProfileAxes };

/** 画像六维雷达（规格 §6.2b）· 纯 SVG，纸墨风 */

const AXES: Array<{ key: keyof ProfileAxes; label: string }> = [
  { key: 'focus', label: '聚焦' },
  { key: 'lost', label: '寻物' },
  { key: 'work', label: '事功' },
  { key: 'brief', label: '简洁' },
  { key: 'feedback', label: '回填' },
  { key: 'params', label: '参数' },
];

function point(
  cx: number,
  cy: number,
  r: number,
  i: number,
  n: number,
): [number, number] {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function ProfileRadar({
  axes,
  caseCount,
}: {
  axes?: Partial<ProfileAxes>;
  caseCount: number;
}) {
  const size = 220;
  const c = size / 2;
  const R = 78;
  const n = AXES.length;
  const grid = [0.33, 0.66, 1];
  const empty = isAxesEmpty(axes);

  const vals = AXES.map((a) => Number(axes?.[a.key] ?? 0));
  const poly = vals
    .map((v, i) => {
      const r = (Math.max(0, Math.min(100, v)) / 100) * R;
      const [x, y] = point(c, c, r, i, n);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="profile-radar">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-label="画像六维图"
      >
        {grid.map((g) => (
          <polygon
            key={g}
            points={AXES.map((_, i) => {
              const [x, y] = point(c, c, R * g, i, n);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ')}
            fill="none"
            stroke="var(--line)"
            strokeWidth={1}
          />
        ))}
        {AXES.map((a, i) => {
          const [x, y] = point(c, c, R, i, n);
          const [lx, ly] = point(c, c, R + 18, i, n);
          return (
            <g key={a.key}>
              <line
                x1={c}
                y1={c}
                x2={x}
                y2={y}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill="var(--ink-zhong)"
              >
                {a.label}
              </text>
            </g>
          );
        })}
        {empty ? (
          <text
            x={c}
            y={c}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fill="var(--ink-qing)"
          >
            样本不足
          </text>
        ) : (
          <polygon
            points={poly}
            fill="rgba(178, 58, 46, 0.12)"
            stroke="var(--cinnabar)"
            strokeWidth={1.5}
          />
        )}
      </svg>
      <p className="hint radar-note">N={caseCount}，形态参考</p>
    </div>
  );
}
