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

export function AreaChart({ data, width = 360, height = 120, stroke = '#0ea5e9', fill = 'rgba(14,165,233,0.14)' }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 8;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  const area = `${pad},${height - pad} ${pts.join(' ')} ${width - pad},${height - pad}`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`area-${stroke.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} x1={pad} x2={width - pad} y1={height * ratio} y2={height * ratio} stroke="#e2e8f0" strokeDasharray="4 6" />
      ))}
      <polygon points={area} fill={`url(#area-${stroke.replace('#', '')})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PieChart({ data = [], size = 120, colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!total) return <DonutChart value={0} total={1} size={size} stroke={12} color="#cbd5e1" />;
  const radius = size / 2 - 8;
  const center = size / 2;
  let startAngle = -90;
  const toPoint = (angle) => {
    const radians = (Math.PI / 180) * angle;
    return [center + radius * Math.cos(radians), center + radius * Math.sin(radians)];
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((item, index) => {
        const angle = (Number(item.value || 0) / total) * 360;
        const endAngle = startAngle + angle;
        const [x1, y1] = toPoint(startAngle);
        const [x2, y2] = toPoint(endAngle);
        const largeArc = angle > 180 ? 1 : 0;
        const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        startAngle = endAngle;
        return <path key={`${item.label}-${index}`} d={path} fill={colors[index % colors.length]} />;
      })}
      <circle cx={center} cy={center} r={radius * 0.56} fill="white" className="dark:fill-gray-900" />
    </svg>
  );
}

export function Heatmap({ rows = [], max = null }) {
  const values = rows.flatMap((row) => row.values || []);
  const maxValue = max || Math.max(...values, 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[72px_1fr] items-center gap-2">
          <div className="truncate text-[10px] font-semibold text-slate-500 dark:text-gray-400">{row.label}</div>
          <div className="grid grid-cols-7 gap-1">
            {(row.values || []).slice(0, 7).map((value, index) => {
              const intensity = clamp(Number(value || 0) / maxValue, 0, 1);
              return (
                <div
                  key={`${row.label}-${index}`}
                  title={`${row.label}: ${value}`}
                  className="h-7 rounded-md border border-white/50 dark:border-gray-900"
                  style={{ backgroundColor: `rgba(14, 165, 233, ${0.08 + intensity * 0.72})` }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
