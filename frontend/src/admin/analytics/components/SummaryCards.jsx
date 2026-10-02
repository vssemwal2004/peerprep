import { motion } from "framer-motion";
import { Activity, BarChart3, BookOpenCheck, Code2, Gauge, Users } from "lucide-react";

const ICONS = { coding: Code2, assessment: BarChart3, learning: BookOpenCheck, students: Users, consistency: Activity, overall: Gauge };
const TONES = { sky: "from-sky-500 to-cyan-400", emerald: "from-emerald-500 to-teal-400", violet: "from-violet-500 to-fuchsia-400", amber: "from-amber-500 to-orange-400", rose: "from-rose-500 to-pink-400", indigo: "from-indigo-500 to-blue-400" };

function formatValue(item) {
  if (item.value == null) return "—";
  if (item.format === "percent" || item.unit === "%") return `${Number(item.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  return Number.isFinite(Number(item.value)) ? Number(item.value).toLocaleString(undefined, { maximumFractionDigits: 1 }) : item.value;
}

export default function SummaryCards({ items = [] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.slice(0, 6).map((item, index) => {
        const Icon = ICONS[item.icon || item.id] || Gauge;
        const tone = TONES[item.tone] || TONES.sky;
        return (
          <motion.article key={item.id || item.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035 }} whileHover={{ y: -2 }} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${tone}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{item.label}</p>
                <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-950 dark:text-white">{formatValue(item)}</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-200"><Icon className="h-4 w-4" /></div>
            </div>
            <p className="mt-1.5 min-h-4 text-[11px] leading-4 text-slate-500 dark:text-gray-400">{item.helper || item.description || "Evidence in the active scope"}</p>
          </motion.article>
        );
      })}
    </section>
  );
}
