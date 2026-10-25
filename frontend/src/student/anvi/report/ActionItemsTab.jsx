import { useState } from "react";
import { Check } from "lucide-react";
import { CardHeader, Icon, Meter } from "./parts";
import { muted, reportCard } from "./styles";
import { defaultStorage, readDoneActions, writeDoneActions } from "./actionProgress";

/**
 * The numbered action plan. Students tick items off; the ticks are personal and stay in this browser
 * (`storage`, localStorage by default). Admins see the plan without checkboxes.
 */
export function ActionItemsTab({ model, storage = defaultStorage() }) {
  const { actions, attemptId } = model;
  const student = model.audience === "student";
  const [done, setDone] = useState(() => (student ? readDoneActions(attemptId, actions, storage) : []));
  const [local, setLocal] = useState(false);
  if (!actions.length) return <p className={`${reportCard} text-sm ${muted}`}>No action items were recorded for this attempt.</p>;
  const toggle = (text) => {
    const next = done.includes(text) ? done.filter((entry) => entry !== text) : [...done, text];
    setDone(next);
    setLocal(!writeDoneActions(attemptId, next, storage));
  };
  const count = actions.filter((text) => done.includes(text)).length;
  return <section className={reportCard} aria-labelledby="anvi-actions-title" data-report-actions>
    <CardHeader id="anvi-actions-title" icon="listTodo" title="Action plan"
      hint={student ? "Work through these, then take the interview again." : "What the candidate should practise next."}
      aside={student ? <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-50" data-actions-progress>{count} of {actions.length} done</span> : null} />
    {student && <Meter percent={(count / actions.length) * 100} tone="positive" height="h-1.5" className="-mt-1 mb-5" />}
    <ol className="space-y-3">
      {actions.map((text, index) => {
        const checked = done.includes(text);
        const id = `anvi-action-${index}`;
        return <li key={text} data-action={index + 1} data-done={checked ? "true" : "false"}
          className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5 rounded-xl border p-4 transition sm:grid-cols-[auto_minmax(0,1fr)_auto] ${checked ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-400/20 dark:bg-emerald-400/[0.05]" : "border-slate-200 dark:border-white/[0.08]"}`}>
          <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${checked ? "bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950" : "bg-sky-600 text-white dark:bg-sky-500 dark:text-sky-950"}`}>
            {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
          </span>
          <p id={id} className={`min-w-0 text-sm leading-6 ${checked ? "text-slate-500 line-through decoration-slate-300 dark:text-zinc-400 dark:decoration-zinc-600" : "text-slate-800 dark:text-zinc-100"}`}>{text}</p>
          {student && <label className="col-start-2 inline-flex h-8 cursor-pointer select-none items-center gap-2 justify-self-start rounded-lg sm:col-start-auto border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200">
            <input type="checkbox" checked={checked} onChange={() => toggle(text)} aria-describedby={id} data-action-toggle className="h-4 w-4 rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:outline-none" />
            Mark done
          </label>}
        </li>;
      })}
    </ol>
    {student && <p className={`mt-4 flex items-start gap-1.5 text-xs ${muted}`} data-actions-note>
      <Icon name="lock" className="mt-px h-3.5 w-3.5 shrink-0" />
      {local ? "This browser blocks saving, so your ticks last for this visit only." : "Your personal checklist. Ticks are saved in this browser only; your institution does not see them."}
    </p>}
  </section>;
}
