import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, Compass, Flame, Sparkles, Target, TrendingUp } from "lucide-react";
import { Card, focusRing } from "./ui";

const TONES = {
  urgent: { bar: "bg-rose-500", icon: Target, tile: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300", label: "Fix first" },
  focus: { bar: "bg-sky-500", icon: Compass, tile: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300", label: "Next" },
  grow: { bar: "bg-emerald-500", icon: TrendingUp, tile: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", label: "Keep going" },
};
const KIND_ICONS = { habit: Flame, upcomingTest: CalendarClock };

/** "What to do next": each step links to the exact place to act; topic steps can open the topic. */
export default function CoachPanel({ steps, onOpenTopic }) {
  if (!steps.length) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" aria-hidden="true"><Sparkles className="h-[18px] w-[18px]" /></span>
        <p className="text-[13px] text-slate-600 dark:text-zinc-300">You are on track. Keep practising every day.</p>
      </Card>
    );
  }
  return (
    <ol className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3" aria-label="Next steps">
      {steps.map((step, index) => {
        const tone = TONES[step.tone] || TONES.focus;
        const Icon = KIND_ICONS[step.kind] || tone.icon;
        return (
          <li key={step.id}>
            <Card className="relative flex h-full flex-col overflow-hidden p-4 pl-5">
              <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden="true" />
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.tile}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{index + 1} · {tone.label}</p>
                  <h3 className="mt-0.5 text-[14px] font-semibold leading-snug text-slate-950 dark:text-zinc-50">{step.title}</h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{step.reason}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
                {step.action && (
                  <Link to={step.action.to} className={`inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-sky-700 ${focusRing}`}>
                    {step.action.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
                {step.topicKey && (
                  <button type="button" onClick={() => onOpenTopic(step.topicKey)} className={`rounded-lg px-2 py-1.5 text-[12px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>
                    Topic details
                  </button>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
