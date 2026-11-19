import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DIFFICULTY_COLORS } from "./chartTheme";

const plain = (value) => Number(value || 0).toLocaleString();
const SIZE = 184;
const STROKE = 14;
const SPACING = 6;

/**
 * Concentric progress rings, one per item (outermost first), each filled to its value in %, with a
 * legend beside them: the %, the count behind it and the students. A ring or legend row opens its
 * students. data: { unit: "%", valueLabel, items: [{ key, label, value, solved, total, students }] }.
 */
export default function RadialRings({ chart, onPart, height }) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(null);
  const items = chart.data?.items || [];
  if (!items.length) return null;
  const colorOf = (item, index) => DIFFICULTY_COLORS[item.key] || ["#0ea5e9", "#8b5cf6", "#f43f5e"][index % 3];
  const open = (item, index) => onPart?.({ key: item.key, label: `${item.label} questions`, color: colorOf(item, index), value: item.solved, unit: "questions solved", students: item.students });
  const center = SIZE / 2;
  const best = items.reduce((top, item) => (item.value > top.value ? item : top), items[0]);
  const shown = active !== null ? items[active] : null;

  return (
    <div style={{ minHeight: height }} className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }} data-tour="rings">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="-rotate-90" role="img"
          aria-label={items.map((item) => `${item.label}: ${item.value}% ${chart.data.valueLabel || ""}`).join(", ")}>
          {items.map((item, index) => {
            const radius = center - STROKE / 2 - index * (STROKE + SPACING);
            const length = 2 * Math.PI * radius;
            const color = colorOf(item, index);
            const fill = Math.max(0, Math.min(100, item.value)) / 100;
            return (
              <g key={item.key} className="cursor-pointer" onClick={() => open(item, index)}
                onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
                <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeOpacity={active === index ? 0.22 : 0.13} strokeWidth={STROKE} />
                <motion.circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
                  strokeDasharray={length}
                  initial={reduced ? false : { strokeDashoffset: length }}
                  animate={{ strokeDashoffset: length * (1 - fill) }}
                  transition={{ duration: 0.9, delay: reduced ? 0 : index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                  style={{ filter: active === index ? `drop-shadow(0 0 6px ${color}88)` : undefined }} />
              </g>
            );
          })}
        </svg>
        {/* The middle: the ring under the pointer, else the best solve rate. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[19px] font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">{(shown || best).value}%</span>
          <span className="mt-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">{(shown || best).label}{shown ? "" : " · best"}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 max-w-[260px] space-y-2">
        {items.map((item, index) => {
          const color = colorOf(item, index);
          return (
            <li key={item.key} data-tour={`ring-row-${index}`}>
              <button type="button" onClick={() => open(item, index)} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)} onBlur={() => setActive(null)} disabled={!onPart}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default ${active === index ? "bg-slate-100 dark:bg-white/[0.06]" : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"}`}
                title={onPart ? `See the ${plain(item.students)} students who solved a ${item.label} question` : undefined}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{item.label}</span>
                  <span className="block truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400" title={`${plain(item.solved)} of ${plain(item.total)} questions solved · ${plain(item.students)} students solved one`}>{plain(item.solved)}/{plain(item.total)} solved · {plain(item.students)} students</span>
                </span>
                <span className="text-[16px] font-extrabold tabular-nums" style={{ color }}>{item.value}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
