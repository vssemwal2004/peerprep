import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TIER_COLORS } from "./chartOptions";

const plain = (value) => Number(value || 0).toLocaleString();
const GAP = 3;
// One bubble size per group level t0 (most students) … t7 (fewest), so a size reads as a group.
const TIER_RADIUS = Object.freeze({ t0: 60, t1: 52, t2: 45, t3: 39, t4: 33, t5: 28, t6: 23, t7: 19 });
const radiusOf = (item) => TIER_RADIUS[item.tier] || TIER_RADIUS.t7;
const capitalNoun = (noun) => noun.charAt(0).toUpperCase() + noun.slice(1);

/**
 * Packs circles (biggest first) along a wide spiral: each one takes the first place on the spiral
 * where it overlaps nothing. Deterministic (same topics, same picture) and tight, unlike a force
 * layout, and the whole cloud is then scaled into the card by the SVG viewBox, so nothing is cut off.
 */
function packBubbles(items) {
  const placed = [];
  for (const item of items) {
    const r = radiusOf(item);
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
  // What one bubble is ("topic", "sheet"), from the data's item label.
  const noun = String(data.itemLabel || "Topic").toLowerCase();
  const open = (item) => onPart?.({ key: item.key, label: item.name, value: item.value, unit: data.valueLabel, students: item.value });

  return (
    <div style={{ height }} className="flex flex-col">
      {/* Legend: each group's size and colour, the students its topics have, and how many topics. */}
      <ul data-tour="bubble-legend" className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 pb-2 text-[11px] text-slate-600 dark:text-slate-300" aria-label="Bubble groups">
        {tiers.filter((tier) => (tier.topics ?? counts[tier.key]) > 0).map((tier) => (
          <li key={tier.key} className="inline-flex items-center gap-1.5" title={`Topics with ${tier.label} solving`}>
            <span className="shrink-0 rounded-full" style={{ backgroundColor: TIER_COLORS[tier.key], width: Math.round(radiusOf({ tier: tier.key }) / 4), height: Math.round(radiusOf({ tier: tier.key }) / 4) }} aria-hidden="true" />
            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{tier.label}</span>
            <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-white/[0.07] dark:text-slate-300" title={`${capitalNoun(noun)}s in this group`}>{plain(tier.topics ?? counts[tier.key])} {(tier.topics ?? counts[tier.key]) === 1 ? noun : `${noun}s`}</span>
          </li>
        ))}
        <li className="text-slate-400">· {plain(items.length)} {items.length === 1 ? noun : `${noun}s`} · bigger = more students</li>
      </ul>
      <svg viewBox={viewBox.join(" ")} preserveAspectRatio="xMidYMid meet" className="min-h-0 w-full flex-1" role="list" aria-label={`${chart.title}: ${items.length} ${noun}s`}>
        <defs>
          {Object.entries(TIER_COLORS).map(([key, color]) => (
            <radialGradient key={key} id={`${gradientId}-${key}`} cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor={color} stopOpacity="0.72" />
              <stop offset="100%" stopColor={color} />
            </radialGradient>
          ))}
        </defs>
        {bubbles.map((bubble, bubbleIndex) => {
          const { item, r, x, y } = bubble;
          const fontSize = Math.max(7.5, Math.min(15, r * 0.3));
          // Every bubble shows its count; names from the third-smallest size up.
          const showName = r >= 31;
          const showCount = true;
          const active = tip?.key === item.key;
          return (
            <g key={item.key} role="listitem" tabIndex={0} data-tour={`bubble-${bubbleIndex}`} aria-label={`${item.name}: ${plain(item.value)} ${data.valueLabel || "students"}, ${tierLabel.get(item.tier) || ""}`}
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
                <text x={x} y={showName ? y + fontSize * 1.05 : y + fontSize * 0.4} textAnchor="middle" fontSize={showName ? fontSize * 0.85 : Math.max(9, fontSize * 1.1)} fontWeight={showName ? "600" : "800"} fill="white" fillOpacity={showName ? 0.9 : 1} pointerEvents="none"
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
          <p><b className="tabular-nums">{plain(tip.item.value)}</b> {data.valueLabel || "students"}{tip.item.pct !== undefined ? ` · ${tip.item.pct}% ${data.pctLabel || `of ${plain(data.cohort)}`}` : ""}</p>
          {tip.item.accuracy !== undefined && <p className="text-slate-500 dark:text-slate-400">{tip.item.accuracy}% of submissions accepted</p>}
          {tip.item.detail && <p className="text-slate-500 dark:text-slate-400">{tip.item.detail}</p>}
          <p className="mt-0.5 flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_COLORS[tip.item.tier] }} aria-hidden="true" />{tierLabel.get(tip.item.tier)} · click to see the students
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}
