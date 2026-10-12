import { DIFFICULTY_THEME } from '../../utils/difficultyTheme';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, Cpu, Database, FileText, Layers, Network, PlayCircle, Sigma, Workflow } from 'lucide-react';
import { displayTitle, numeric, subjectTheme } from './dashboardUtils';
import { card, DifficultyTag, focusRing, interactiveCard, SectionHeader, Skeleton, textLink, Unavailable } from './ui';

function subjectIcon(title) {
  const name = String(title || '').toLowerCase();
  if (/database|dbms|sql/.test(name)) return Database;
  if (/network|communication/.test(name)) return Network;
  if (/operating|architecture|hardware|system/.test(name)) return Cpu;
  if (/math|calculus|statistic|algebra|discrete/.test(name)) return Sigma;
  if (/algorithm|programming|data structure|graph|tree|coding/.test(name)) return Workflow;
  return BookOpen;
}

/** White ring on the coloured band; the subject's real completion. */
function ProgressRing({ value, label }) {
  const size = 46, stroke = 4, radius = (size - stroke) / 2, circumference = 2 * Math.PI * radius;
  return <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="white" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none" />
    </svg>
    <span className="text-[11.5px] font-semibold tabular-nums text-white">{value}%</span>
  </span>;
}

function BandPattern() {
  const id = useId();
  return <svg className="absolute inset-0 h-full w-full text-white opacity-[0.16] transition-transform duration-500 group-hover:translate-x-1.5 motion-reduce:transition-none" aria-hidden="true">
    <defs>
      <pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <circle cx="2" cy="2" r="1.4" fill="currentColor" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>;
}

function SubjectCard({ subject, index }) {
  const completed = numeric(subject.completedTopics);
  const total = Math.max(completed, numeric(subject.totalTopics));
  const progress = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const finished = total > 0 && completed >= total;
  const cta = completed ? finished ? 'Review subject' : 'Continue subject' : 'Explore subject';
  const theme = subjectTheme(subject.id || subject.title);
  const Icon = subjectIcon(subject.title);
  const title = displayTitle(subject.title);
  const next = subject.nextTopic;
  const facts = [
    [BookOpen, `${total.toLocaleString()} ${total === 1 ? 'topic' : 'topics'}`],
    numeric(subject.videoCount) > 0 && [PlayCircle, `${numeric(subject.videoCount)} ${numeric(subject.videoCount) === 1 ? 'video' : 'videos'}`],
    numeric(subject.notesCount) > 0 && [FileText, `${numeric(subject.notesCount)} notes`],
  ].filter(Boolean);

  return <article className={`dashboard-rise flex flex-col overflow-hidden ${interactiveCard}`} style={{ '--rise': index + 4 }}>
    <Link to={subject.href} state={subject.state} className={`group flex flex-1 flex-col ${focusRing} rounded-t-2xl focus-visible:ring-inset focus-visible:ring-offset-0`}>
      <div className={`relative h-[96px] overflow-hidden bg-gradient-to-br ${theme.band}`}>
        <BandPattern />
        <Icon className="absolute -bottom-6 -right-3 h-28 w-28 rotate-[-8deg] text-white/[0.13]" strokeWidth={1.4} aria-hidden="true" />
        <div className="relative flex h-full items-start justify-between p-4">
          {subject.semesterName ? <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">{subject.semesterName}</span> : <span />}
          <ProgressRing value={progress} label={`${title} completion`} />
        </div>
      </div>
      <div className="relative flex flex-1 flex-col px-5 pb-5">
        <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-[14px] bg-white shadow-[0_8px_20px_-10px_rgba(16,24,40,0.45)] ring-1 ring-black/[0.04] dark:bg-[#2c2c2c] dark:ring-white/10" aria-hidden="true">
          <Icon className="h-[22px] w-[22px]" style={{ color: theme.ring }} strokeWidth={1.9} />
        </span>
        <h3 className="mt-3 line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-slate-950 transition-colors group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300" title={title}>{title}</h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-500 dark:text-zinc-400">
          {facts.map(([FactIcon, label]) => <span key={label} className="inline-flex items-center gap-1.5"><FactIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{label}</span>)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="text-[12.5px] text-slate-500 dark:text-zinc-400">
            {completed > 0
              ? <><strong className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{completed}</strong> completed</>
              : 'Not started yet'}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-[#f1f2f5] px-3 py-[7px] text-[12.5px] font-medium text-slate-700 transition-colors group-hover:bg-slate-900 group-hover:text-white dark:bg-white/[0.07] dark:text-zinc-200 dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900">
            {cta}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
    {next && !finished && <Link to={next.href} state={subject.state}
      className={`group flex items-center gap-3 border-t border-[#f0f1f4] bg-[#fafbfc] px-5 py-3 transition-colors hover:bg-sky-50/70 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-sky-500/[0.06] ${focusRing} rounded-b-2xl focus-visible:ring-inset focus-visible:ring-offset-0`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${theme.soft}`} aria-hidden="true">
        {next.contentType === 'video' ? <PlayCircle className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-zinc-500">{completed ? 'Next up' : 'Start with'}</span>
        <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-zinc-100" title={next.title}>{displayTitle(next.title)}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-sky-600 dark:text-zinc-600 dark:group-hover:text-sky-300" aria-hidden="true" />
    </Link>}
  </article>;
}

export function LearningSubjects({ subjects, section, onRetry }) {
  if (!section.loading && !section.error && !subjects.length) return null;
  return <section aria-labelledby="learning-paths-title">
    <SectionHeader id="learning-paths-title" title="Explore your learning" action={<Link className={textLink} to="/student/learning">All subjects<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>} />
    {section.loading
      ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((value) => <Skeleton key={value} className="h-[268px] rounded-2xl" />)}</div>
      : section.error
        ? <Unavailable message="Your learning subjects could not be loaded." onRetry={onRetry} />
        : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.slice(0, 3).map((subject, index) => <SubjectCard key={subject.id} subject={subject} index={index} />)}
        </div>}
  </section>;
}

const DIFFICULTY_RAIL = Object.fromEntries(Object.entries(DIFFICULTY_THEME).map(([key, theme]) => [key.toLowerCase(), theme.rail]));

export function PracticeSuggestions({ problems, section, onRetry }) {
  if (!section.loading && !section.error && !problems.length) return null;
  return <section aria-labelledby="practice-next-title" className={`flex flex-col p-5 ${card}`}>
    <header className="flex items-start justify-between gap-3">
      <div>
        <h2 id="practice-next-title" className="text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-100">Next in practice</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-zinc-400">Unsolved problems, easiest first</p>
      </div>
      <Link className={`${textLink} mt-0.5`} to="/problems">All questions<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
    </header>
    {section.loading
      ? <Skeleton className="mt-4 h-[150px]" />
      : section.error
        ? <Unavailable className="mt-4" message="Practice suggestions could not be loaded." onRetry={onRetry} />
        : <ol className="mt-3 space-y-2">
          {problems.slice(0, 4).map((problem) => <li key={problem.id}>
            <Link to={problem.href} className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border border-[#eef0f3] bg-white py-3 pl-4 pr-3 transition-[border-color,box-shadow,background-color] hover:border-sky-200 hover:bg-sky-50/40 hover:shadow-[0_8px_20px_-16px_rgba(2,132,199,0.6)] dark:border-white/[0.06] dark:bg-transparent dark:hover:border-sky-400/30 dark:hover:bg-sky-500/[0.05] ${focusRing}`}>
              <span className={`absolute inset-y-2.5 left-0 w-[3px] rounded-r-full ${DIFFICULTY_RAIL[String(problem.difficulty).toLowerCase()] || 'bg-slate-300'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-800 dark:text-zinc-100" title={problem.title}>{problem.title}</span>
              <DifficultyTag difficulty={problem.difficulty} />
              <span className="inline-flex w-[62px] shrink-0 items-center justify-end gap-1 text-[12.5px] font-medium text-slate-300 transition-colors group-hover:text-sky-700 dark:text-zinc-600 dark:group-hover:text-sky-300">
                Solve<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          </li>)}
        </ol>}
  </section>;
}
