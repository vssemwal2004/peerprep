import { Check, CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import { GRAPH_GROUPS, GRAPH_REGISTRY, getGraphState } from "../graphRegistry";

const STATUS = {
  ready: { Icon: CircleCheck, label: "Available", className: "text-emerald-600" },
  partial: { Icon: CircleAlert, label: "Partial evidence", className: "text-amber-600" },
  empty: { Icon: CircleMinus, label: "Needs evidence", className: "text-slate-400" },
  not_relevant: { Icon: CircleMinus, label: "Not relevant", className: "text-slate-400" },
  not_requested: { Icon: CircleMinus, label: "Evaluated on apply", className: "text-slate-400" },
};

export default function GraphPicker({ value, onChange, serverGraphs = [] }) {
  const byId = Object.fromEntries(serverGraphs.map((graph) => [graph.id, graph]));
  const toggle = (id) => onChange({ ...value, selectedIds: value.selectedIds.includes(id) ? value.selectedIds.filter((item) => item !== id) : [...value.selectedIds, id] });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
        {[{ value: "recommended", label: "Recommended" }, { value: "custom", label: "Custom layout" }].map((mode) => (
          <button key={mode.value} type="button" onClick={() => onChange({ ...value, mode: mode.value })} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${value.mode === mode.value ? "bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300" : "text-slate-500"}`}>{mode.label}</button>
        ))}
      </div>
      {value.mode === "recommended" && <p className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs leading-5 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">The server selects 6–10 diverse, evidence-valid graphs. Invalid visualizations are never rendered.</p>}
      {GRAPH_GROUPS.map((group) => (
        <section key={group}>
          <h4 className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{group}</h4>
          <div className="space-y-2">
            {GRAPH_REGISTRY.filter((graph) => graph.group === group).map((graph) => {
              const state = getGraphState(graph, byId[graph.id]);
              const status = STATUS[state.status] || STATUS.not_requested;
              const selected = value.selectedIds.includes(graph.id);
              return (
                <button key={graph.id} type="button" disabled={value.mode !== "custom"} onClick={() => toggle(graph.id)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${selected && value.mode === "custom" ? "border-sky-300 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-400/10" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[.03]"} disabled:cursor-default`}>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 text-transparent dark:border-slate-600"}`}><Check className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{graph.title}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-400">{graph.description}</span><span className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold ${status.className}`}><status.Icon className="h-3 w-3" />{status.label}{state.reason ? ` · ${state.reason}` : ""}</span></span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

