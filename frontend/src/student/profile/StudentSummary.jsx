import { ArrowRight, CalendarCheck, CheckCircle2, Languages, Send, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimatedMetric } from './ui';
import { focusRing, languageLabel } from './format';

function plural(count, word, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

/** One short, data-grounded line. Every clause depends on data that exists. */
function buildHeadline({ coding, acceptance, streak, mostUsedLanguage }) {
  const parts = [];
  if (coding.totalSolved > 0) {
    parts.push(`${plural(coding.totalSolved, 'problem')} solved`);
  } else if (acceptance.total > 0) {
    parts.push(`${plural(acceptance.total, 'submission')} so far`);
  } else {
    parts.push('No submissions yet');
  }
  if (mostUsedLanguage) parts.push(`mostly ${languageLabel(mostUsedLanguage)}`);
  if (streak.current > 0) parts.push(`${plural(streak.current, 'day')} streak`);
  return parts.join(' · ');
}

function buildNextStep({ coding, streak, assessments }) {
  if (coding.totalSolved === 0) return { text: 'Solve your first Easy problem', to: '/problems' };
  if (streak.current === 0) return { text: 'Submit today to start a streak', to: '/problems' };
  if (coding.mediumSolved === 0 && coding.easySolved >= 5) return { text: 'Try your first Medium problem', to: '/problems' };
  if (coding.hardSolved === 0 && coding.mediumSolved >= 5) return { text: 'Attempt a Hard problem', to: '/problems' };
  if (assessments.attempts === 0) return { text: 'Take an assessment to benchmark yourself', to: null };
  return { text: "Keep the streak going with today's challenge", to: '/problems' };
}

function Tile({ icon, label, value, sub }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50/80 px-2.5 py-2 dark:bg-zinc-900/50">
      <p className="flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-zinc-400">
        <span className="shrink-0 text-sky-500 dark:text-sky-400" aria-hidden="true">{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 text-[15px] font-semibold leading-tight tracking-tight tabular-nums text-slate-900 dark:text-zinc-50">{value}</p>
      {sub ? <p className="truncate text-[10px] text-slate-400 dark:text-zinc-500" title={typeof sub === 'string' ? sub : undefined}>{sub}</p> : null}
    </div>
  );
}

const MUTED = <span className="text-slate-300 dark:text-zinc-600">—</span>;

/**
 * Compact summary card (half width). Shows only figures not repeated elsewhere on the page:
 * acceptance, submissions, active days, languages. Solved/streak live in Coding Progress;
 * assessments/interviews/learning in PeerPrep Progress; levels/awards in Badges.
 */
export default function StudentSummary(props) {
  const { firstName, acceptance, streak, languagesCount, className = '' } = props;
  const headline = buildHeadline(props);
  const nextStep = buildNextStep(props);
  const hasAcceptance = acceptance.total > 0 && acceptance.rate !== null;

  return (
    <section
      id="student-summary"
      aria-labelledby="student-summary-title"
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424] ${className}`}
    >
      <div className="bg-gradient-to-r from-sky-50 via-white to-white px-4 pb-2.5 pt-3.5 dark:from-sky-500/10 dark:via-[#242424] dark:to-[#242424]">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Summary
        </p>
        <h2 id="student-summary-title" className="mt-0.5 text-[15px] font-semibold tracking-tight text-slate-900 dark:text-zinc-50">
          {firstName ? `Hi ${firstName}, here's your progress` : "Here's your progress"}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p className="text-[12px] text-slate-500 dark:text-zinc-400">{headline}</p>
          {nextStep.to ? (
            <Link
              to={nextStep.to}
              className={`inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700 ${focusRing}`}
            >
              {nextStep.text}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : (
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
              {nextStep.text}
            </span>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 content-start gap-2 px-4 pb-4 pt-2 sm:grid-cols-4">
        <Tile
          icon={<CheckCircle2 className="h-3 w-3" />}
          label="Acceptance"
          value={hasAcceptance ? <AnimatedMetric value={acceptance.rate} suffix="%" decimals={1} /> : MUTED}
          sub={acceptance.total > 0 ? `${acceptance.accepted ?? 0}/${acceptance.total} accepted` : null}
        />
        <Tile
          icon={<Send className="h-3 w-3" />}
          label="Submissions"
          value={<AnimatedMetric value={acceptance.total} />}
        />
        <Tile
          icon={<CalendarCheck className="h-3 w-3" />}
          label="Active days"
          value={<AnimatedMetric value={streak.activeDays} />}
          sub="Past year"
        />
        <Tile
          icon={<Languages className="h-3 w-3" />}
          label="Languages"
          value={<AnimatedMetric value={languagesCount} />}
          sub={props.mostUsedLanguage ? `${languageLabel(props.mostUsedLanguage)} leads` : null}
        />
      </div>
    </section>
  );
}
