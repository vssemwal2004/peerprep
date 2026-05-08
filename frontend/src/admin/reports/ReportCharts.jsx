/* SVG chart primitives — no external chart library */
export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export function Sparkline({ data, width = 120, height = 32, stroke = '#0ea5e9', fill = 'rgba(14,165,233,0.08)', strokeWidth = 1.5 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`);
  const area = `${pts[0].split(',')[0]},${height} ` + pts.join(' ') + ` ${pts[pts.length - 1].split(',')[0]},${height}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polygon points={area} fill={fill} />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MiniBarChart({ data, labels, width = 200, height = 48, barColor = '#0ea5e9', max }) {
  if (!data || !data.length) return <div style={{ width, height }} />;
  const m = max || Math.max(...data, 1);
  const barW = Math.max(4, (width / data.length) * 0.6);
  const gap = (width / data.length) * 0.4;
  return (
    <svg width={width} height={height} className="overflow-visible">
      {data.map((v, i) => {
        const h = (v / m) * (height - 14);
        const x = i * (barW + gap) + gap / 2;
        const y = height - h - 2;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={3} fill={barColor} opacity={0.85 + (i / data.length) * 0.15} />
            {labels && <text x={x + barW / 2} y={height - 1} fontSize="8" textAnchor="middle" fill="#94a3b8">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({ value, total, size = 44, stroke = 4, color, bg = '#e2e8f0' }) {
  const pct = total ? clamp((value / total) * 100, 0, 100) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const col = color || (pct >= 75 ? '#10b981' : pct >= 50 ? '#0ea5e9' : pct >= 35 ? '#f59e0b' : '#ef4444');
  return (
    <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke={bg} strokeWidth={stroke} fill="none" className="dark:stroke-slate-700" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
    </svg>
  );
}

export function HorizontalProgress({ value, max, height = 6, color = '#0ea5e9', bg = '#e2e8f0' }) {
  const pct = max ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: bg }}>
      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
