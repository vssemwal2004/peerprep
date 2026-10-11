import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Code2, FileText, ListChecks, Play } from 'lucide-react';
import { formatRelativeTime } from './dashboardUtils';
import { focusRing, IconTile, interactiveCard, ProgressBar, SectionHeader, Skeleton, softButton, Unavailable } from './ui';

const KINDS = {
  coding: { label: 'Coding', icon: Code2, progress: 'tests passed' },
  video: { label: 'Video lesson', icon: Play, progress: 'watched' },
  notes: { label: 'Notes', icon: FileText, progress: 'complete' },
  questions: { label: 'Topic questions', icon: ListChecks, progress: 'complete' },
  topic: { label: 'Topic', icon: BookOpen, progress: 'complete' },
};

function progressOf(item) {
  const value = Number(item.progressPercent);
  if (item.progressPercent == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** The single most recent unfinished item, whichever module it came from. */
function ResumeCard({ item, now }) {
  const isCoding = item.type === 'coding';
  const kind = isCoding ? KINDS.coding : KINDS[item.contentType] || KINDS.topic;
  const progress = progressOf(item);
  return <Link to={item.href} state={item.state} className={`group block w-full p-5 sm:max-w-[480px] ${interactiveCard} ${focusRing}`}>
    <div className="flex items-center gap-3.5">
      <IconTile icon={kind.icon} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-medium text-slate-900 dark:text-zinc-100" title={item.title}>{item.title}</h3>
        <p className="mt-0.5 truncate text-[12.5px] text-slate-500 dark:text-zinc-400">{kind.label} · {formatRelativeTime(item.updatedAt, now)}</p>
      </div>
      <span className={softButton}>Resume<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
    </div>
    {progress !== null && <div className="mt-4 flex items-center gap-3">
      <ProgressBar value={progress} label={`${item.title}: ${progress}% ${kind.progress}`} className="flex-1" tone="bg-sky-500" />
      <span className="shrink-0 text-[12px] font-medium tabular-nums text-slate-600 dark:text-zinc-300" title={kind.progress}>{progress}%</span>
    </div>}
  </Link>;
}

export default function ContinueSection({ items, section, now, onRetry }) {
  const latest = items[0];
  return <section aria-labelledby="continue-title">
    <SectionHeader id="continue-title" title="Continue where you left off" />
    {section.loading
      ? <Skeleton className="h-[92px] w-full rounded-2xl sm:max-w-[480px]" />
      : section.error
        ? <Unavailable message="Your recent progress could not be loaded." onRetry={onRetry} />
        : latest && <ResumeCard item={latest} now={now} />}
  </section>;
}
