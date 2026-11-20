import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1];

/** A block that rises into place; children marked <RevealItem> follow one after another. */
export function Reveal({ children, className = "", delay = 0, stagger = 0.05, as = "div", ...props }) {
  const reduce = useReducedMotion();
  const Component = motion[as] || motion.div;
  return (
    <Component {...props} className={className} initial={reduce ? false : "hidden"} animate="shown"
      variants={{ hidden: {}, shown: { transition: { delayChildren: delay, staggerChildren: stagger } } }}>
      {children}
    </Component>
  );
}

export function RevealItem({ children, className = "", as = "div", ...props }) {
  const reduce = useReducedMotion();
  const Component = motion[as] || motion.div;
  return (
    // min-w-0: as a grid item it may shrink below its content (wide charts scroll inside their card).
    <Component className={`min-w-0 ${className}`} {...props}
      variants={reduce ? undefined : { hidden: { opacity: 0, y: 14, scale: 0.985 }, shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE } } }}>
      {children}
    </Component>
  );
}

/** A number that counts up to its value once (and smoothly to new values). */
export function CountUp({ value, decimals = null, duration = 900, suffix = "" }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return undefined;
    if (reduce) { setShown(value); return undefined; }
    const from = fromRef.current;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (Number(value) - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = Number(value);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduce]);
  if (value === null || value === undefined) return "—";
  const places = decimals ?? (Number.isInteger(Number(value)) ? 0 : 1);
  return <span className="tabular-nums">{Number(shown).toLocaleString("en-IN", { minimumFractionDigits: places, maximumFractionDigits: places })}{suffix}</span>;
}
