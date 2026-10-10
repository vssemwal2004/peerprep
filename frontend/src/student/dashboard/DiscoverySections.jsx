import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarRange, Code2, Cpu, Database, Network, Sigma } from 'lucide-react';
import { numeric } from './dashboardUtils';
import { card, DifficultyTag, focusRing, IconTile, interactiveCard, ProgressBar, SectionHeader, Skeleton, softButton, textLink, Unavailable } from './ui';

function subjectIcon(title) {
  const name = String(title || '').toLowerCase();
  if (/database|dbms|sql/.test(name)) return Database;
  if (/network|communication/.test(name)) return Network;
  if (/operating|architecture|hardware|system/.test(name)) return Cpu;
  if (/math|calculus|statistic|algebra|discrete/.test(name)) return Sigma;
  if (/algorithm|programming|data structure|coding/.test(name)) return Code2;
  return BookOpen;
}

export function LearningSubjects({ subjects, section, onRetry }) {
  if (!section.loading && !section.error && !subjects.length) return null;
  return <section aria-labelledby="learning-paths-title">
    <SectionHeader id="learning-paths-title" title="Explore your learning" action={<Link className={textLink} to="/student/learning">All subjects<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>} />
    {section.loading
      ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((value) => <Skeleton key={value} className="h-[172px]" />)}</div>
      : section.error
        ? <Unavailable message="Your learning subjects could not be loaded." onRetry={onRetry} />
        : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.slice(0, 3).map((subject) => {
            const completed = numeric(subject.completedTopics);
            const total = Math.max(completed, numeric(subject.totalTopics));
            const progress = total ? Math.min(100, Math.round((completed / total) * 100)) : 0;
            const cta = completed ? progress === 100 ? 'Review subject' : 'Continue subject' : 'Explore subject';
            return <Link key={subject.id} to={subject.href} state={subject.state} className={`group flex flex-col p-4 ${interactiveCard} ${focusRing}`}>
              <div className="flex items-start gap-3">
                <IconTile icon={subjectIcon(subject.title)} />
                <h3 className="line-clamp-2 pt-0.5 text-[14px] font-semibold leading-snug text-slate-900 dark:text-zinc-100">{subject.title}</h3>
              </div>
              <div className="mt-3 space-y-1 text-[12px] text-slate-500 dark:text-zinc-400">
                <p className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{total.toLocaleString()} {total === 1 ? 'topic' : 'topics'}{completed > 0 && <><span aria-hidden="true">·</span>{completed} completed</>}</p>
                {subject.semesterName && <p className="flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{subject.semesterName}</p>}
              </div>
              <ProgressBar value={progress} label={`${subject.title} completion`} className="mt-3" />
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
                <span className="text-[11.5px] font-semibold tabular-nums text-slate-500 dark:text-zinc-400">{progress}%</span>
                <span className={softButton}>{cta}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              </div>
            </Link>;
          })}
        </div>}
  </section>;
}

export function PracticeSuggestions({ problems, section, onRetry }) {
  if (!section.loading && !section.error && !problems.length) return null;
  return <section aria-labelledby="practice-next-title" className={`flex flex-col p-4 ${card}`}>
    <header className="flex items-center justify-between gap-3">
      <h2 id="practice-next-title" className="text-[14px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-100">Next in practice</h2>
      <Link className={textLink} to="/problems">All questions<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
    </header>
    {section.loading
      ? <Skeleton className="mt-3 h-[150px]" />
      : section.error
        ? <Unavailable className="mt-3" message="Practice suggestions could not be loaded." onRetry={onRetry} />
        : <ol className="mt-2 divide-y divide-slate-100 dark:divide-zinc-800">
          {problems.slice(0, 4).map((problem, index) => <li key={problem.id}>
            <Link to={problem.href} className={`group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/60 ${focusRing}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold tabular-nums text-slate-500 transition-colors group-hover:bg-slate-900 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-zinc-100">{problem.title}</span>
                <span className="block text-[11px] text-slate-400 dark:text-zinc-500">{problem.source === 'shared' ? 'Shared collection' : 'University collection'}</span>
              </span>
              <DifficultyTag difficulty={problem.difficulty} />
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-700 dark:text-zinc-600 dark:group-hover:text-zinc-200" aria-hidden="true" />
            </Link>
          </li>)}
        </ol>}
  </section>;
}
