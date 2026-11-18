import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TIER_COLORS } from "./chartOptions";

const plain = (value) => Number(value || 0).toLocaleString();
const MIN_RADIUS = 13;
const MAX_RADIUS = 60;
const GAP = 3;

/**
 * Packs circles (biggest first) along a wide spiral: each one takes the first place on the spiral
 * where it overlaps nothing. Deterministic (same topics, same picture) and tight, unlike a force
 * layout, and the whole cloud is then scaled into the card by the SVG viewBox, so nothing is cut off.
 */
function packBubbles(items) {
  const most = Math.max(1, ...items.map((item) => item.value));
  const placed = [];
  for (const item of items) {
    // Area grows with the value (radius with its square root), with a readable minimum.
    const r = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(item.value / most);
    let spot = { x: 0, y: 0 };
    if (placed.length) {
      for (let angle = 0; angle < 400; angle += 0.12) {
        const distance = 1.6 * angle;
        const candidate = { x: Math.cos(angle) * distance * 1.55, y: Math.sin(angle) * distance };
        if (placed.every((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) >= other.r + r + GAP)) { spot = candidate; break; }
      }
    }
    placed.push({ ...spot, r, item });
  }
  const minX = Math.min(...placed.map((bubble) => bubble.x - bubble.r)) - 4;
  const maxX = Math.max(...placed.map((bubble) => bubble.x + bubble.r)) + 4;
  const minY = Math.min(...placed.map((bubble) => bubble.y - bubble.r)) - 4;
  const maxY = Math.max(...placed.map((bubble) => bubble.y + bubble.r)) + 4;
  return { bubbles: placed, viewBox: [minX, minY, maxX - minX, maxY - minY] };
}

/** A label that fits inside a circle of radius r at this font size (about 0.56em per letter). */
function fitText(text, r, fontSize) {
  const room = Math.floor((r * 1.7) / (fontSize * 0.56));
  return text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1))}…`;
}

/**
 * "Topics students are solving" as bubbles: every topic at least one student solves, area by the
 * number of students, colour by priority (Most practised / Growing / Needs focus). Hover or tap a
 * bubble for its figures; click (or Enter) lists its students. data: the chart's bubble payload.
 */
export default function TopicBubbles({ chart, onPart, height }) {
  const gradientId = useId().replace(/:/g, "");
  const data = chart.data || {};
  const items = useMemo(() => data.items || [], [data.items]);
  const tiers = useMemo(() => data.tiers || [], [data.tiers]);
  const { bubbles, viewBox } = useMemo(() => packBubbles(items), [items]);
  const [tip, setTip] = useState(null);
  const counts = useMemo(() => Object.fromEntries(tiers.map((tier) => [tier.key, items.filter((item) => item.tier === tier.key).length])), [items, tiers]);
  const tierLabel = useMemo(() => new Map(tiers.map((tier) => [tier.key, tier.label])), [tiers]);

  const show = useCallback((event, bubble) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({ key: bubble.item.key, x: rect.left + rect.width / 2, y: rect.top, item: bubble.item });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  useEffect(() => {
    if (!tip) return undefined;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tip, hide]);

  if (!items.length) return null;
  const open = (item) => onPart?.({ key: item.key, label: item.name, value: item.value, unit: data.valueLabel, students: item.value });

  return (
    <div style={{ height }} className="flex flex-col">
      {/* Priority legend with how many topics are in each. */}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pb-1 text-[10.5px] text-slate-500 dark:text-slate-400">
        {tiers.map((tier) => (
          <span key={tier.key} className="inline-flex items-center gap-1.5" title={tier.hint}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TIER_COLORS[tier.key] }} aria-hidden="true" />
            {tier.label}<span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{counts[tier.key] || 0}</span>
          </span>
        ))}
        <span className="text-slate-400">· {plain(items.length)} topics · size = students solving</span>
      </div>
      <svg viewBox={viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" className="min-h-0 w-full flex-1" role="list" aria-label={`${chart.title}: ${items.length} topics`}>
        <defs>
          {Object.entries(TIER_COLORS).map(([key, color]) => (
            <radialGradient key={key} id={`${gradientId}-${key}`} cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor={color} stopOpacity="0.72" />
              <stop offset="100%" stopColor={color} />
            </radialGradient>
          ))}
        </defs>
        {bubbles.map((bubble) => {
          const { item, r, x, y } = bubble;
          const fontSize = Math.max(7.5, Math.min(15, r * 0.3));
          const showName = r >= 18;
          const showCount = r >= 26;
          const active = tip?.key === item.key;
          return (
            <g key={item.key} role="listitem" tabIndex={0} aria-label={`${item.name}: ${plain(item.value)} ${data.valueLabel || "students"}, ${tierLabel.get(item.tier) || ""}`}
              className="cursor-pointer outline-none"
              onPointerEnter={(event) => { if (event.pointerType !== "touch") show(event, bubble); }}
              onPointerLeave={(event) => { if (event.pointerType !== "touch") hide(); }}
              onFocus={(event) => show(event, bubble)} onBlur={hide}
              onClick={(event) => {
                // Touch: the first tap shows the figures, the second opens the students.
                if (event.nativeEvent?.pointerType === "touch" && tip?.key !== item.key) { show(event, bubble); return; }
                hide(); open(item);
              }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(item); } }}>
              <circle cx={x} cy={y} r={active ? r + 2 : r} fill={`url(#${gradientId}-${item.tier})`} stroke={active ? "#0f172a" : "white"} strokeOpacity={active ? 0.35 : 0.9} strokeWidth={active ? 2 : 1.5}
                style={{ transition: "r 120ms ease-out" }} />
              {showName && (
                <text x={x} y={showCount ? y - fontSize * 0.25 : y + fontSize * 0.35} textAnchor="middle" fontSize={fontSize} fontWeight="700" fill="white" pointerEvents="none"
                  style={{ fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif" }}>
                  {fitText(item.name, r, fontSize)}
                </text>
              )}
              {showCount && (
                <text x={x} y={y + fontSize * 1.05} textAnchor="middle" fontSize={fontSize * 0.85} fontWeight="600" fill="white" fillOpacity="0.88" pointerEvents="none"
                  style={{ fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif" }}>
                  {plain(item.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && typeof document !== "undefined" && createPortal(
        <div role="tooltip" className="pointer-events-none fixed z-[10000] w-max max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] leading-snug text-slate-700 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          style={{ left: Math.min(Math.max(tip.x, 110), window.innerWidth - 110), top: tip.y - 6 }}>
          <p className="font-bold text-slate-900 dark:text-white">{tip.item.name}</p>
          <p><b className="tabular-nums">{plain(tip.item.value)}</b> {data.valueLabel || "students"}{tip.item.pct !== undefined ? ` · ${tip.item.pct}% of ${plain(data.cohort)}` : ""}</p>
          {tip.item.accuracy !== undefined && <p className="text-slate-500 dark:text-slate-400">{tip.item.accuracy}% of submissions accepted</p>}
          <p className="mt-0.5 flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_COLORS[tip.item.tier] }} aria-hidden="true" />{tierLabel.get(tip.item.tier)} · click to see the students
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}
