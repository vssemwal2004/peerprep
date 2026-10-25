import { EyeOff, Shuffle } from "lucide-react";
import { Chip } from "../controls";
import { PRIORITY_TONES, priorityLabel } from "./counts";

export function PriorityChip({ priority }) {
  return <Chip tone={PRIORITY_TONES[priority] || "slate"}>{priorityLabel(priority)} priority</Chip>;
}

// Shown wherever live topics appear: their questions are never listed for the admin.
export function PrivacyNote({ className = "" }) {
  return (
    <p className={`flex items-start gap-2 text-xs leading-relaxed text-slate-500 dark:text-gray-400 ${className}`}>
      <EyeOff size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        Questions are generated privately for each student at interview time; you'll see them in each
        student's report.
      </span>
    </p>
  );
}

// The card that stands in for a question list: what ANVI will ask, never the questions.
export default function LiveTopicsSummary({ plan, fixedCount = 0, onEdit }) {
  if (!plan.topics.length) return null;
  return (
    <section
      data-live-summary
      aria-labelledby="live-summary-heading"
      className="rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-500/30 dark:bg-gray-900"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300"
          >
            <Shuffle size={16} />
          </span>
          <div className="min-w-0">
            <h3 id="live-summary-heading" className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">
              ANVI creates {plan.total} different question{plan.total === 1 ? "" : "s"} for every student
            </h3>
            <p className="mt-0.5 text-[13px] text-slate-500 dark:text-gray-400">
              From {plan.topics.length} topic{plan.topics.length === 1 ? "" : "s"}
              {fixedCount ? `, plus ${fixedCount} fixed question${fixedCount === 1 ? "" : "s"} everyone gets` : ""}.
            </p>
          </div>
        </div>
        {onEdit}
      </header>
      <div className="space-y-4 px-5 py-4">
        <ul className="divide-y divide-slate-100 dark:divide-gray-800">
          {plan.topics.map((topic) => (
            <li key={topic.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="break-words text-sm font-medium text-slate-900 dark:text-gray-100">{topic.name}</span>
                <PriorityChip priority={topic.priority} />
                {topic.explicit !== null && <Chip>Exact number</Chip>}
              </span>
              <span
                className={`text-sm tabular-nums ${topic.count ? "text-slate-600 dark:text-gray-300" : "font-medium text-rose-600 dark:text-rose-400"}`}
              >
                {topic.count} question{topic.count === 1 ? "" : "s"}
                {topic.maxFollowUps ? ` · up to ${topic.maxFollowUps} follow-up${topic.maxFollowUps === 1 ? "" : "s"} each` : ""}
              </span>
            </li>
          ))}
        </ul>
        <PrivacyNote />
      </div>
    </section>
  );
}
