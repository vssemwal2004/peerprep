import { BarChart3, BookOpenCheck, Code2, LayoutDashboard, Users } from "lucide-react";

const ANALYSIS_MODES = [
  { id: "overview", label: "Overview", helper: "Cross-source health", icon: LayoutDashboard },
  { id: "coding", label: "Coding", helper: "Practice & problem solving", icon: Code2 },
  { id: "assessments", label: "Assessments", helper: "Scores & participation", icon: BarChart3 },
  { id: "learning", label: "Learning", helper: "Progress & completion", icon: BookOpenCheck },
  { id: "students", label: "Students", helper: "Rank, spread & support", icon: Users },
];

export default function AnalysisModeSelector({ value, onChange, disabled = false, showIntro = true }) {
  return <div>{showIntro && <div className="mb-3"><h3 className="text-sm font-black text-slate-950 dark:text-white">What do you want to analyze?</h3><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Choose one view. We will select the matching evidence and show no more than four relevant charts.</p></div>}<nav aria-label="Analysis mode" className="grid gap-2 sm:grid-cols-2">{ANALYSIS_MODES.map(({ id, label, helper, icon: Icon }) => {
    const active = value === id;
    return <button key={id} type="button" aria-pressed={active} disabled={disabled} onClick={() => onChange(id)} className={`flex min-h-16 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-200 disabled:opacity-60 ${active ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[.02] dark:text-slate-300 dark:hover:bg-white/[.05]"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-xs font-black">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">{helper}</span></span><span aria-hidden="true" className={`ml-auto h-3.5 w-3.5 shrink-0 rounded-full border-2 ${active ? "border-sky-600 bg-sky-600 ring-2 ring-sky-100 dark:ring-sky-900" : "border-slate-300 dark:border-slate-600"}`} /></button>;
  })}</nav></div>;
}
