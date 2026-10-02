import { motion } from "framer-motion";
import { CircleAlert, Info } from "lucide-react";
import AnalyticsChart from "../charts/AnalyticsChart";

function DataTable({ payload, title }) {
  const rows = Array.isArray(payload?.data) ? payload.data : payload?.data?.rows || payload?.data?.items || [];
  const matrixRows = rows.filter((row) => Array.isArray(row?.cells)).slice(0, 25);
  if (matrixRows.length) {
    const matrixColumns = (payload?.data?.columns || [...new Set(matrixRows.flatMap((row) => row.cells.map((cell) => cell.topic))) ]).slice(0, 12);
    return <details className="border-t border-slate-100 dark:border-white/10"><summary className="cursor-pointer px-5 py-3 text-xs font-bold text-sky-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-300 dark:text-sky-300">View accessible data table</summary><div className="overflow-x-auto px-5 pb-4"><table className="min-w-full text-left text-xs"><caption className="sr-only">Data for {title}</caption><thead><tr><th scope="col" className="border-b border-slate-200 px-2 py-2 font-black text-slate-500 dark:border-white/10">Student</th>{matrixColumns.map((column) => <th key={column} scope="col" className="border-b border-slate-200 px-2 py-2 font-black text-slate-500 dark:border-white/10">{column}</th>)}</tr></thead><tbody>{matrixRows.map((row) => <tr key={row.studentId || row.name}>{<th scope="row" className="border-b border-slate-100 px-2 py-2 font-bold text-slate-700 dark:border-white/5 dark:text-slate-200">{row.name}</th>}{matrixColumns.map((column) => { const cell = row.cells.find((item) => item.topic === column); return <td key={column} className="border-b border-slate-100 px-2 py-2 text-slate-600 dark:border-white/5 dark:text-slate-300">{cell?.value == null ? "No evidence" : `${cell.value}%`}</td>; })}</tr>)}</tbody></table></div></details>;
  }
  const simpleRows = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row.values) && !Array.isArray(row.cells)).slice(0, 25);
  const columns = [...new Set(simpleRows.flatMap((row) => Object.keys(row).filter((key) => ["string", "number"].includes(typeof row[key]))))].slice(0, 8);
  if (!simpleRows.length || !columns.length) return null;
  return <details className="border-t border-slate-100 dark:border-white/10"><summary className="cursor-pointer px-5 py-3 text-xs font-bold text-sky-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-300 dark:text-sky-300">View accessible data table</summary><div className="overflow-x-auto px-5 pb-4"><table className="min-w-full text-left text-xs"><caption className="sr-only">Data for {title}</caption><thead><tr>{columns.map((column) => <th key={column} scope="col" className="border-b border-slate-200 px-2 py-2 font-black capitalize text-slate-500 dark:border-white/10">{column.replace(/([A-Z])/g, " $1")}</th>)}</tr></thead><tbody>{simpleRows.map((row, index) => <tr key={row.id || row.studentId || row.date || index}>{columns.map((column) => <td key={column} className="border-b border-slate-100 px-2 py-2 text-slate-600 dark:border-white/5 dark:text-slate-300">{row[column] == null ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table>{rows.length > simpleRows.length && <p className="mt-2 text-[10px] text-slate-400">Showing the first {simpleRows.length} rows. Export for the complete dataset.</p>}</div></details>;
}

export default function GraphCard({ item, index = 0 }) {
  const { definition, payload, status } = item;
  const Icon = definition.icon;
  return <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: Math.min(index * 0.03, 0.2) }} className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${definition.size === "wide" ? "xl:col-span-2" : ""}`}>
    <header className="flex items-start gap-2.5 border-b border-slate-100 px-3.5 py-3 dark:border-gray-800"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"><Icon className="h-4 w-4" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-slate-900 dark:text-white">{definition.title}</h2>{status === "partial" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><CircleAlert className="h-3 w-3" /> Partial</span>}</div><p className="mt-0.5 text-[11px] leading-4 text-slate-400">{payload?.subtitle || definition.description}</p></div></header>
    <div role="img" aria-label={`${definition.title}. ${payload?.subtitle || definition.description}`} className="p-3"><AnalyticsChart definition={definition} payload={payload} /></div>
    <DataTable payload={payload} title={definition.title} />
    {(payload?.note || payload?.evidence) && <footer className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] leading-4 text-slate-500 dark:border-white/10 dark:bg-white/[.02] dark:text-slate-400"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{payload.note || payload.evidence}</footer>}
  </motion.article>;
}
