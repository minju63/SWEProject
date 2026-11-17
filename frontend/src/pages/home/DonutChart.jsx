import { CATEGORY_STYLE } from './homeConfig.js';

const R = 52;
const C = 2 * Math.PI * R;

// 맞춤 혜택 도넛 그래프 (FR-H04, FR-H09). segments: [{ name, count }]
export default function DonutChart({ segments, selected, onSelect, centerCount, centerLabel }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const visible = segments.filter((s) => s.count > 0);
  const starts = visible.map((_, i) =>
    visible.slice(0, i).reduce((sum, s) => sum + (s.count / total) * C, 0)
  );
  return (
    <svg className="donut" viewBox="0 0 140 140" role="img" aria-label="분야별 맞춤 혜택 그래프">
      {visible.map((s, idx) => {
        const offset = starts[idx];
        const len = (s.count / total) * C;
        const isSel = selected === s.name;
        const dimmed = selected && !isSel;
        const node = (
          <circle
            key={s.name}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={CATEGORY_STYLE[s.name]?.color}
            strokeWidth={isSel ? 26 : 20}
            strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
            opacity={dimmed ? 0.3 : 1}
            style={{ cursor: 'pointer', transition: 'all .2s' }}
            onClick={() => onSelect(s.name)}
          />
        );
        return node;
      })}
      {/* 조각 안 비율 (8% 이상만) */}
      {visible.map((s, idx) => {
        const frac = s.count / total;
        if (frac < 0.08) return null;
        const mid = ((starts[idx] + (frac * C) / 2) / C) * 2 * Math.PI - Math.PI / 2;
        return (
          <text
            key={s.name}
            x={70 + R * Math.cos(mid)}
            y={70 + R * Math.sin(mid) + 3}
            textAnchor="middle"
            className="donut-pct"
            opacity={selected && selected !== s.name ? 0.3 : 1}
            pointerEvents="none"
          >
            {Math.round(frac * 100)}%
          </text>
        );
      })}
      <text x="70" y="70" textAnchor="middle" className="donut-num">
        {centerCount}
        <tspan className="donut-unit">개</tspan>
      </text>
      <text x="70" y="88" textAnchor="middle" className="donut-label">
        {centerLabel}
      </text>
    </svg>
  );
}
