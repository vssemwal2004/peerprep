import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronRight, FileText, ListChecks, Play, SquarePen } from 'lucide-react';
import { displayTitle, formatRelativeTime, formatWatchTime, languageLabel, verdictInfo } from './dashboardUtils';
import { card, DifficultyTag, focusRing, Skeleton, Unavailable } from './ui';

const LEARNING_KINDS = {
  video: { label: 'Video lesson', icon: Play, cta: 'Resume video' },
  notes: { label: 'Notes', icon: FileText, cta: 'Continue reading' },
  questions: { label: 'Topic questions', icon: ListChecks, cta: 'Continue practice' },
  topic: { label: 'Topic', icon: BookOpen, cta: 'Continue topic' },
};

const EXTENSIONS = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', cpp: 'cpp', c: 'c', csharp: 'cs', php: 'php', go: 'go', rust: 'rs', kotlin: 'kt', ruby: 'rb', swift: 'swift', r: 'r', sql: 'sql' };
const HASH_COMMENTS = new Set(['python', 'ruby', 'r']);
const KEYWORDS = new Set(('def return if elif else for while in not and or is class import from as try except finally with lambda pass break continue '
  + 'None True False int long float double char bool boolean void auto const static public private protected final new this self struct '
  + 'using namespace std let var function async await of null true false switch case default do yield fn mut impl pub match func package').split(' '));
const TOKEN = /(\/\/.*$)|(#.*$)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/g;
const TOKEN_CLASS = { comment: 'text-slate-500 italic', keyword: 'text-violet-300', string: 'text-emerald-300', number: 'text-amber-300', call: 'text-sky-300' };

/** A tiny, dependency-free highlighter. It only colours text; content is always rendered as text. */
function highlight(line, language) {
  const parts = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const [text, slashComment, hash, string, number, call, word] = match;
    if (match.index > last) parts.push([null, line.slice(last, match.index)]);
    const kind = slashComment ? 'comment' : hash ? (HASH_COMMENTS.has(language) ? 'comment' : 'keyword') : string ? 'string' : number ? 'number'
      : call ? (KEYWORDS.has(call) ? 'keyword' : 'call') : word && KEYWORDS.has(word) ? 'keyword' : null;
    parts.push([kind, text]);
    last = match.index + text.length;
  }
  if (last < line.length) parts.push([null, line.slice(last)]);
  return parts;
}

function CodePreview({ preview, language }) {
  const lines = preview.lines;
  return <div className="relative overflow-hidden rounded-xl bg-[#0d1424] ring-1 ring-inset ring-white/[0.06]">
    <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-2">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-slate-300">
        <SquarePen className="h-3 w-3 text-sky-300" aria-hidden="true" />solution.{EXTENSIONS[language] || 'txt'}
      </span>
      <span className="text-[11px] text-slate-500">Your last run</span>
    </div>
    <pre className="overflow-hidden px-0 py-2.5 font-mono text-[12px] leading-[1.7] text-slate-200" aria-label="Preview of your last code">
      {lines.map((line, index) => <div key={index} className="flex">
        <span className="w-10 shrink-0 select-none pr-3 text-right tabular-nums text-slate-600">{preview.startLine + index}</span>
        <code className="min-w-0 whitespace-pre pr-3">
          {highlight(line, language).map(([kind, text], part) => <span key={part} className={kind ? TOKEN_CLASS[kind] : undefined}>{text}</span>)}
          {index === lines.length - 1 && <span className="dashboard-caret ml-px inline-block h-[14px] w-[2px] translate-y-[2px] bg-sky-400" aria-hidden="true" />}
        </code>
      </div>)}
    </pre>
    {lines.length >= 6 && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0d1424] to-transparent" aria-hidden="true" />}
  </div>;
}

/** One cell per test case when there are few; a proportional split bar when there are many. */
function TestStrip({ passed, total }) {
  const label = `${passed} of ${total} test cases passing`;
  if (total > 24) {
    return <div className="flex h-2 overflow-hidden rounded-full bg-rose-200/70 dark:bg-rose-500/25" role="img" aria-label={label}>
      <span className="dashboard-fill h-full bg-emerald-500" style={{ width: `${(passed / total) * 100}%` }} />
    </div>;
  }
  return <div className="flex gap-1" role="img" aria-label={label}>
    {Array.from({ length: total }, (_, index) => <span key={index} className={`h-2 flex-1 rounded-full ${index < passed ? 'bg-emerald-500' : 'bg-rose-200 dark:bg-rose-500/30'}`} />)}
  </div>;
}

function NotStartedPreview() {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-[#fafbfc] px-4 py-4 dark:border-white/10 dark:bg-white/[0.02]">
    <div className="space-y-2" aria-hidden="true">
      {[68, 44, 56].map((width, index) => <div key={index} className="flex items-center gap-3">
        <span className="w-4 text-right font-mono text-[11px] text-slate-300 dark:text-zinc-600">{index + 1}</span>
        <span className="h-2 rounded-full bg-slate-200/80 dark:bg-white/[0.07]" style={{ width: `${width}%` }} />
      </div>)}
    </div>
    <p className="mt-3 text-[12.5px] text-slate-500 dark:text-zinc-400">Opened, not attempted yet. Your first run will show up here.</p>
  </div>;
}

function VideoTimeline({ item, progress }) {
  const watched = Number(item.watchedSeconds) > 0;
  return <div className="rounded-xl bg-gradient-to-br from-violet-50 to-sky-50 p-4 ring-1 ring-inset ring-violet-100 dark:from-violet-500/[0.08] dark:to-sky-500/[0.06] dark:ring-white/[0.06]">
    <div className="flex items-center gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-[0_4px_14px_-6px_rgba(124,58,237,0.6)] transition-transform group-hover:scale-105 dark:bg-zinc-900 dark:text-violet-300" aria-hidden="true">
        <Play className="ml-0.5 h-[18px] w-[18px]" fill="currentColor" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="relative h-1.5 rounded-full bg-white/90 dark:bg-white/10" role="progressbar" aria-label={`${item.title} video progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}>
          <span className="dashboard-fill absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: `${progress ?? 0}%` }} />
          {progress !== null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-600 shadow dark:border-zinc-900" style={{ left: `clamp(6px, ${progress}%, calc(100% - 6px))` }} aria-hidden="true" />}
        </div>
        <p className="mt-2 flex justify-between text-[12px] tabular-nums text-slate-500 dark:text-zinc-400">
          <span>{watched ? `${formatWatchTime(item.watchedSeconds)} watched` : 'Not started'}</span>
          {item.durationSeconds > 0 && <span>{formatWatchTime(item.durationSeconds)}</span>}
        </p>
      </div>
    </div>
  </div>;
}

function ReadingPreview({ kind, crumbs }) {
  const Icon = kind.icon;
  return <div className="flex items-center gap-3.5 rounded-xl bg-gradient-to-br from-violet-50 to-white p-4 ring-1 ring-inset ring-violet-100 dark:from-violet-500/[0.08] dark:to-transparent dark:ring-white/[0.06]">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-[0_4px_14px_-8px_rgba(124,58,237,0.6)] dark:bg-zinc-900 dark:text-violet-300" aria-hidden="true">
      <Icon className="h-5 w-5" strokeWidth={1.8} />
    </span>
    <p className="flex min-w-0 flex-wrap items-center gap-1 text-[12.5px] text-slate-600 dark:text-zinc-300">
      {crumbs.map((crumb, index) => <span key={crumb} className="inline-flex min-w-0 items-center gap-1">
        {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-zinc-600" aria-hidden="true" />}
        <span className="truncate">{crumb}</span>
      </span>)}
    </p>
  </div>;
}

function progressOf(item) {
  const value = Number(item.progressPercent);
  if (item.progressPercent == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const VERDICT_TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200/70 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10',
};

/** The single most recent unfinished item, shown as the place the student actually stopped. */
function ResumeBody({ item, now }) {
  const isCoding = item.type === 'coding';
  const kind = isCoding ? null : LEARNING_KINDS[item.contentType] || LEARNING_KINDS.topic;
  const progress = progressOf(item);
  const language = item.codePreview?.language || item.language;
  const languageName = languageLabel(language);
  const verdict = isCoding && item.status === 'in_progress' ? verdictInfo(item.lastVerdict) : null;
  const hasTests = isCoding && Number(item.totalTests) > 0;
  const crumbs = String(item.subtitle || '').split(' · ').map((part) => part.trim()).filter(Boolean).map(displayTitle);
  const cta = isCoding ? (item.status === 'in_progress' ? (languageName ? `Resume in ${languageName}` : 'Resume coding') : 'Start solving')
    : item.contentType === 'video' && Number(item.watchedSeconds) > 0 ? `Resume at ${formatWatchTime(item.watchedSeconds)}` : kind.cta;
  const caption = isCoding
    ? hasTests ? <><strong className="font-semibold text-slate-900 dark:text-zinc-100">{item.passedTests}/{item.totalTests}</strong> tests passing</>
      : item.status === 'in_progress' ? 'Attempted, not solved yet' : 'Not attempted yet'
    : progress !== null ? <><strong className="font-semibold text-slate-900 dark:text-zinc-100">{progress}%</strong> {item.contentType === 'video' ? 'watched' : 'complete'}</>
      : 'Pick up where you stopped';

  return <Link to={item.href} state={item.state} className={`group flex flex-1 flex-col rounded-b-2xl px-5 pb-5 pt-1 ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}>
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${isCoding ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${isCoding ? 'bg-sky-500' : 'bg-violet-500'}`} aria-hidden="true" />{isCoding ? 'Coding' : kind.label}
      </span>
      {isCoding && <DifficultyTag difficulty={item.difficulty} className="!rounded-full !px-2 !text-[11px]" />}
      {languageName && <span className="rounded-full bg-[#f1f2f5] px-2 py-0.5 text-[11.5px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">{languageName}</span>}
      {verdict && <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${VERDICT_TONES[verdict.tone]}`}>{verdict.label}</span>}
    </div>
    <h3 className="mt-2.5 line-clamp-2 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-slate-950 transition-colors group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300" title={item.title}>{item.title}</h3>

    <div className="mt-4">
      {isCoding
        ? item.codePreview ? <CodePreview preview={item.codePreview} language={language} />
          : item.status === 'in_progress' ? null : <NotStartedPreview />
        : item.contentType === 'video' ? <VideoTimeline item={item} progress={progress} />
          : <ReadingPreview kind={kind} crumbs={crumbs.length ? crumbs : [kind.label]} />}
    </div>

    {hasTests && <div className="mt-4"><TestStrip passed={Math.min(item.passedTests, item.totalTests)} total={item.totalTests} /></div>}

    <div className="mt-auto flex items-center justify-between gap-3 pt-4">
      <p className="min-w-0 truncate text-[12.5px] text-slate-500 dark:text-zinc-400">
        {caption}<span className="mx-1.5 text-slate-300 dark:text-zinc-600" aria-hidden="true">·</span>{formatRelativeTime(item.updatedAt, now)}
      </p>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-sky-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_6px_16px_-8px_rgba(2,132,199,0.7)] transition-colors group-hover:bg-sky-700">
        {cta}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </div>
  </Link>;
}

export default function ContinueSection({ items, section, now, onRetry, className = '', style }) {
  const latest = items[0];
  return <section aria-labelledby="continue-title" style={style} className={`flex flex-col ${card} transition-[border-color,box-shadow] duration-200 hover:border-[#dcdee4] hover:shadow-[0_14px_36px_-22px_rgba(16,24,40,0.3)] dark:hover:border-white/[0.14] ${className}`}>
    <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
      <h2 id="continue-title" className="text-[13px] font-medium text-slate-500 dark:text-zinc-400">Continue where you left off</h2>
    </header>
    {section.loading
      ? <div className="space-y-3 px-5 pb-5" aria-hidden="true"><Skeleton className="h-5 w-40" /><Skeleton className="h-6 w-3/4" /><Skeleton className="h-[120px] rounded-xl" /></div>
      : section.error
        ? <div className="px-5 pb-5"><Unavailable message="Your recent progress could not be loaded." onRetry={onRetry} /></div>
        : latest && <ResumeBody item={latest} now={now} />}
  </section>;
}
