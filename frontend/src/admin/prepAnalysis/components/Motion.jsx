import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** A number that counts up to its value (instantly when the viewer prefers less motion). */
export function AnimatedNumber({ value, format = (number) => Math.round(number).toLocaleString(), duration = 650 }) {
  const reduced = useReducedMotion();
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reduced ? target : 0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (reduced) { setShown(target); return undefined; }
    const from = fromRef.current;
    const start = performance.now();
    let frame;
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [duration, reduced, target]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

/**
 * Colour chips that stand for parts of a chart (from legendParts). A chip opens its part,
 * so the legend works like the chart itself.
 */
export function PartLegend({ parts, onPart, vertical = false }) {
  if (!parts?.length) return null;
  return (
    <ul className={vertical ? "flex flex-col gap-1" : "flex flex-wrap justify-end gap-1"} aria-label="Legend">
      {parts.map((part) => (
        <li key={part.key}>
          <button type="button" onClick={() => onPart?.(part)} disabled={!onPart}
            title={onPart ? `See the students behind ${part.label}` : part.label}
            className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11.5px] transition-colors ${onPart ? "hover:bg-slate-100 dark:hover:bg-white/[0.06]" : "cursor-default"}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] transition-transform group-hover:scale-125" style={{ backgroundColor: part.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{part.label}</span>
            {part.share !== undefined
              ? <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{part.share}%</span>
              : part.value !== undefined && <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{Number(part.value).toLocaleString()}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
