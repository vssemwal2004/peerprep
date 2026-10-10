import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Code2, FileText, ListChecks, Play } from 'lucide-react';
import { formatRelativeTime, formatWatchTime } from './dashboardUtils';
import { DifficultyTag, focusRing, IconTile, interactiveCard, ProgressBar, SectionHeader, Skeleton, softButton, Unavailable } from './ui';

const LEARNING_KINDS = {
  video: { label: 'Video lesson', icon: Play },
  notes: { label: 'Notes', icon: FileText },
  questions: { label: 'Topic questions', icon: ListChecks },
  topic: { label: 'Topic', icon: BookOpen },
};

function progressOf(item) {
  const value = Number(item.progressPercent);
  if (item.progressPercent == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ResumeCard({ item, now, wide }) {
  const isCoding = item.type === 'coding';
  const kind = isCoding ? { label: 'Coding', icon: Code2 } : LEARNING_KINDS[item.contentType] || LEARNING_KINDS.topic;
  const progress = progressOf(item);
  const progressLabel = isCoding ? 'tests passed' : item.contentType === 'video' ? 'watched' : 'complete';
  const status = isCoding
    ? item.status === 'in_progress' ? 'Attempted, not solved yet' : 'Opened, not attempted yet'
    : item.contentType === 'video' && item.watchedSeconds > 0
      ? `${formatWatchTime(item.watchedSeconds)}${item.durationSeconds > 0 ? ` of ${formatWatchTime(item.durationSeconds)}` : ''} watched`
      : 'Pick up where you stopped';
  return <Link to={item.href} state={item.state} className={`group flex h-full min-w-0 flex-col justify-between gap-3 p-4 ${interactiveCard} ${focusRing} ${wide ? 'sm:col-span-2' : ''}`}>
    <div className="flex items-center gap-3">
      <IconTile icon={kind.icon} tone={isCoding ? 'ink' : 'sky'} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-zinc-500">
          <span>{kind.label}</span><span aria-hidden="true">·</span><span className="normal-case tracking-normal">{formatRelativeTime(item.updatedAt, now)}</span>
        </p>
        <h3 className="mt-0.5 truncate text-[14px] font-semibold text-slate-900 dark:text-zinc-100" title={item.title}>{item.title}</h3>
        {item.subtitle && <p className="truncate text-[12px] text-slate-500 dark:text-zinc-400">{item.subtitle}</p>}
      </div>
      <span className={softButton}>Resume<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
    </div>
    {progress !== null
      ? <div className="flex items-center gap-3">
        <ProgressBar value={progress} label={`${item.title} progress`} className="flex-1" tone={isCoding ? 'bg-slate-800 dark:bg-zinc-300' : 'bg-sky-500'} />
        <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-slate-600 dark:text-zinc-300">{progress}% <span className="font-normal text-slate-400 dark:text-zinc-500">{progressLabel}</span></span>
      </div>
      : <div className="flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-zinc-400">
        {isCoding && <DifficultyTag difficulty={item.difficulty} />}<span className="truncate">{status}</span>
      </div>}
  </Link>;
}

export default function ContinueSection({ items, section, now, onRetry }) {
  const visible = items.slice(0, 4);
  return <section aria-labelledby="continue-title">
    <SectionHeader id="continue-title" title="Continue where you left off" />
    {section.loading
      ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Loading recent progress"><Skeleton className="h-[104px]" /><Skeleton className="h-[104px]" /></div>
      : section.error
        ? <Unavailable message="Your recent progress could not be loaded." onRetry={onRetry} />
        : <div className={`grid grid-cols-1 gap-3 ${visible.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {visible.map((item, index) => <ResumeCard key={item.id} item={item} now={now} wide={visible.length % 2 === 1 && visible.length > 1 && index === 0} />)}
        </div>}
  </section>;
}
