// ANVI Resume Check panel: grammar + ATS readiness + job match, with a clear
// answer to "what should I fix first, and where?".
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDashed, Clock3,
  EyeOff, FileSearch, Info, LayoutTemplate, ListChecks, Loader2, MapPin, PencilLine, RefreshCw, ScanText, ShieldCheck, Sparkles, SpellCheck2, Target, Wand2, X,
} from 'lucide-react';
import { describeAtsFinding } from './describeAtsFinding';
import { getTemplate } from '../templates/catalog';
import { AnviOrb as Orb, AnviWord } from './AnviVisuals';
import PrepCoinIcon from '../../../components/prepCoin/PrepCoinIcon';
import JdMatchReport from './jdMatch/JdMatchReport';
import { JD_MIN_CHARS } from './jdMatch/jdMatchModel';
import { resumeScore } from './resumeScore';
import { canAutoFix } from './useResumeCheck';
import { BulletCoach, DraftChecklist, ScanScene, UndoNotice } from './ReviewWorkspace';
import { ATS_CATEGORY_LABELS, SECTION_LABEL, atsRuleInfo, fixFirst, groupIssues, locationLabel, verdictFor } from './reviewModel';

const TONES = {
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', ring: '#10b981', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  sky: { text: 'text-sky-600 dark:text-sky-400', ring: '#0ea5e9', soft: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' },
  amber: { text: 'text-amber-600 dark:text-amber-400', ring: '#f59e0b', soft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  rose: { text: 'text-rose-600 dark:text-rose-400', ring: '#f43f5e', soft: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
  slate: { text: 'text-slate-500', ring: '#94a3b8', soft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};
const CATEGORY_TONE = { spelling: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900', grammar: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900', style: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900' };
const SEVERITY = { error: ['Critical', 'bg-rose-600 text-white'], warning: ['Warning', 'bg-amber-500 text-white'], info: ['Tip', 'bg-slate-500 text-white'] };

const timeAgo = (iso) => {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString();
};

export function ScoreRing({ score, size = 92, stroke = 9, label = '/100', tone, inverse = false }) {
  const verdict = verdictFor(score);
  const color = TONES[tone || verdict.tone].ring;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className={inverse ? 'stroke-white/15' : 'stroke-slate-100 dark:stroke-slate-800'} />
        <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} stroke={color} strokeLinecap="round" strokeDasharray={length} initial={{ strokeDashoffset: length }} animate={{ strokeDashoffset: length * (1 - value / 100) }} transition={{ duration: 1, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-black leading-none ${size < 70 ? 'text-lg' : 'text-2xl'} ${inverse ? 'text-white' : 'text-slate-950 dark:text-white'}`}>{score ?? '–'}</span>
        <span className={`mt-0.5 text-[9px] font-bold uppercase tracking-[.14em] ${inverse ? 'text-slate-300' : 'text-slate-400'}`}>{label}</span>
      </div>
    </div>
  );
}

const ORB_PX = { 'h-20 w-20': 80, 'h-16 w-16': 60, 'h-11 w-11': 44, 'h-9 w-9': 36 };
function AnviOrb({ size = 'h-16 w-16', busy = false, online = false }) {
  return <Orb size={ORB_PX[size] || 60} busy={busy} online={online} />;
}

// ───────────── first run / scanning ─────────────


// ───────────── grammar ─────────────

function Highlight({ issue, suggestion }) {
  const before = issue.plainText.slice(0, issue.start);
  const after = issue.plainText.slice(issue.end);
  const prefix = before.length > 58 ? '…' + before.slice(-58) : before;
  const suffix = after.length > 58 ? after.slice(0, 58) + '…' : after;
  return (
    <dl className="space-y-2 text-[13px] leading-5 text-slate-700 dark:text-slate-200">
      <div><dt className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400">Original</dt><dd>{prefix}<mark className="rounded bg-rose-100 px-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-300">{issue.problem}</mark>{suffix}</dd></div>
      {suggestion !== undefined ? <div><dt className="text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">Suggested</dt><dd>{prefix}<mark className="rounded bg-emerald-100 px-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{suggestion}</mark>{suffix}</dd></div> : null}
    </dl>
  );
}

function IssueCard({ issue, onLocate, onApply, onIgnore, onIgnoreWord, onHighlight }) {
  const [choice, setChoice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const suggestion = issue.suggestions[choice];
  const fixable = canAutoFix(issue);
  const unsure = issue.confidence === 'low';
  const skill = issue.category === 'spelling' && ['skills', 'technologies'].includes(issue.unit.field) && !unsure;
  const apply = async () => {
    setBusy(true);
    const result = await onApply(issue, suggestion);
    setBusy(false);
    if (!result?.ok) setNote('This line changed since the check. Run the check again.');
  };
  // Hovering a finding marks its line on the résumé preview.
  const hover = onHighlight ? { onMouseEnter: () => onHighlight(issue.plainText), onMouseLeave: () => onHighlight(null), onFocus: () => onHighlight(issue.plainText), onBlur: () => onHighlight(null) } : {};
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} {...hover} className={`rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset dark:bg-[#242424] ${skill ? 'ring-rose-200 dark:ring-rose-400/30' : 'ring-black/[0.06] dark:ring-white/[0.07]'}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span className={`rounded-full px-2 py-0.5 uppercase tracking-[.06em] ring-1 ${unsure ? 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-white/[0.04] dark:text-zinc-300 dark:ring-white/10' : CATEGORY_TONE[issue.category]}`}>{unsure ? 'Name or typo?' : skill ? 'Skill typo' : issue.category}</span>
        <span className="inline-flex min-w-0 items-center gap-1 text-slate-500 dark:text-zinc-400"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{locationLabel(issue.unit).join(' › ')}</span></span>
      </div>
      <p className="mt-2 text-[13px] font-semibold leading-5 text-slate-900 dark:text-white">{unsure ? `“${issue.problem}” is not in the dictionary. If it is a name (company, product, place), choose “It's a name”.` : issue.message}</p>
      {/* Spelling shows the corrected word in place; grammar and style only point at the words to rework. */}
      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-black/20"><Highlight issue={issue} suggestion={fixable ? suggestion : undefined} /></div>
      {!fixable && issue.suggestions[0] !== undefined ? (
        <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-[12.5px] leading-5 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100"><b className="font-semibold">Hint:</b> {issue.suggestions[0] ? <>try “{issue.suggestions[0]}” here</> : 'remove the marked part'}, then reread the whole line in your own words.</p>
      ) : null}
      {fixable && issue.suggestions.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {issue.suggestions.map((item, index) => <button type="button" key={`${item}-${index}`} onClick={() => setChoice(index)} className={`rounded-md border px-2 py-1 text-[12px] font-semibold transition ${index === choice ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-300'}`}>{item || '(remove)'}</button>)}
        </div>
      ) : null}
      {note ? <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">{note}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {fixable ? <button type="button" onClick={apply} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SpellCheck2 className="h-3.5 w-3.5" />}Fix spelling</button> : null}
        <button type="button" onClick={() => onLocate({ ...issue.unit })} className={fixable ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300' : 'inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-zinc-200'}><PencilLine className="h-3.5 w-3.5" />{fixable ? 'Go to line' : 'Edit it yourself'}</button>
        {unsure && onIgnoreWord ? <button type="button" onClick={() => onIgnoreWord(issue)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]"><Check className="h-3.5 w-3.5" />It's a name</button>
          : <button type="button" onClick={() => onIgnore(issue)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-white/[0.06]"><EyeOff className="h-3.5 w-3.5" />Ignore</button>}
      </div>
    </motion.li>
  );
}

/** One failed ATS check, with what the PDF reader saw and where to fix it. */
function AtsFindingCard({ item, resume, onLocate, onBrowseTemplates }) {
  const info = describeAtsFinding(item, resume);
  const [label, badge] = SEVERITY[item.severity] || SEVERITY.info;
  return (
    <li className="rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[.06em] ${badge}`}>{label}</span>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">ATS</span>
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-slate-900 dark:text-white">{info.title}</span>
        {item.scoreImpact ? <span className="shrink-0 text-[12px] font-semibold text-rose-600 dark:text-rose-300">−{item.scoreImpact} pts</span> : null}
      </div>
      <p className="mt-2 text-[12.5px] leading-5 text-slate-700 dark:text-slate-200">{info.instruction}</p>
      <details className="mt-1.5 text-[12px] text-slate-500 dark:text-zinc-400"><summary className="cursor-pointer">What the PDF reader found</summary><p className="mt-1 leading-5">{item.evidence}</p></details>
      <button type="button" onClick={() => (info.template ? onBrowseTemplates() : onLocate(info.target))} className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300">
        {info.template ? <><LayoutTemplate className="h-3.5 w-3.5" />Browse ATS-friendly templates</> : <><ArrowRight className="h-3.5 w-3.5" />{info.target.field ? (info.target.field === 'bullet' ? 'Open bullet' : 'Open ' + info.target.field) : 'Open ' + SECTION_LABEL(resume, info.section)}</>}
      </button>
    </li>
  );
}

const ISSUE_FILTERS = [['all', 'All'], ['spelling', 'Spelling'], ['grammar', 'Grammar'], ['style', 'Style'], ['ats', 'ATS'], ['unsure', 'Names?']];

// Every finding in one place: writing (spelling, grammar, style) and the PDF's failed ATS checks.
function IssuesTab({ check, resume, onLocate, onBrowseTemplates, onHighlight, atsReport }) {
  const [filter, setFilter] = useState('all');
  const [bulk, setBulk] = useState('');
  const { grammar, visibleIssues, ignoredCount } = check;
  const atsFindings = atsReport?.failedChecks || [];
  const counts = useMemo(() => ({
    all: visibleIssues.length + atsFindings.length,
    spelling: visibleIssues.filter((i) => i.category === 'spelling' && i.confidence !== 'low').length,
    grammar: visibleIssues.filter((i) => i.category === 'grammar').length,
    style: visibleIssues.filter((i) => i.category === 'style').length,
    ats: atsFindings.length,
    unsure: visibleIssues.filter((i) => i.confidence === 'low').length,
  }), [visibleIssues, atsFindings.length]);
  const shown = useMemo(() => visibleIssues.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'unsure') return item.confidence === 'low';
    if (filter === 'spelling') return item.category === 'spelling' && item.confidence !== 'low';
    return filter !== 'ats' && item.category === filter;
  }), [visibleIssues, filter]);
  const groups = useMemo(() => groupIssues(shown, resume), [shown, resume]);
  // Sure spelling fixes with a suggestion can be applied in one go.
  const fixable = useMemo(() => visibleIssues.filter((item) => item.category === 'spelling' && item.confidence !== 'low' && item.suggestions.length), [visibleIssues]);
  if (grammar.status === 'error') return <ErrorCard message={grammar.error} onRetry={() => check.runCheck({ only: 'grammar' })} />;
  if (grammar.status === 'running') return <div className="flex items-center gap-2 py-8 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking {grammar.progress.done}/{grammar.progress.total} lines…</div>;
  if (!counts.all) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
        <BadgeCheck className="mx-auto h-10 w-10 text-emerald-500" />
        <h4 className="mt-3 text-[15px] font-semibold text-slate-900 dark:text-white">No issues found</h4>
        <p className="mt-1 text-[13px] text-slate-600 dark:text-zinc-300">ANVI checked {grammar.lineCount} lines{atsReport ? ' and your PDF' : ''}.</p>
        {ignoredCount ? <button type="button" onClick={check.unignoreAll} className="mt-3 text-[12px] font-semibold text-sky-700 hover:underline dark:text-sky-300">Show {ignoredCount} ignored</button> : null}
      </div>
    );
  }
  const applyAll = async () => {
    setBulk('running');
    const result = await check.applyMany(fixable);
    setBulk(result?.applied ? `Fixed ${result.applied} spelling mistake${result.applied === 1 ? '' : 's'}.` : 'Nothing could be applied: run the check again.');
    setTimeout(() => setBulk(''), 4000);
  };
  return (
    <div>
      <div className="sticky top-0 z-[1] -mx-4 -mt-4 mb-3 border-b border-slate-200/70 bg-[#f6f7f9]/95 px-4 pb-2.5 pt-3 backdrop-blur dark:border-white/10 dark:bg-[#1c1c1c]/95">
        <div className="flex flex-wrap items-center gap-1.5">
          {ISSUE_FILTERS.filter(([key]) => key === 'all' || counts[key]).map(([key, label]) => (
            <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${filter === key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-white/[0.04] dark:text-zinc-300 dark:ring-white/10'}`}>{label} <span className="tabular-nums opacity-70">{counts[key]}</span></button>
          ))}
        </div>
        {fixable.length > 1 || ignoredCount ? <div className="mt-2 flex flex-wrap items-center gap-2">
          {fixable.length > 1 ? <button type="button" onClick={applyAll} disabled={bulk === 'running'} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{bulk === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}Fix all {fixable.length} spelling mistakes</button> : null}
          {bulk && bulk !== 'running' ? <span role="status" className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300">{bulk}</span> : null}
          {ignoredCount ? <button type="button" onClick={check.unignoreAll} className="ml-auto text-[12px] font-semibold text-slate-500 hover:text-sky-700 dark:text-zinc-400">Show {ignoredCount} ignored</button> : null}
        </div> : null}
      </div>
      {(filter === 'all' || filter === 'ats') && atsFindings.length ? (
        <section className="mb-5">
          <h4 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.1em] text-slate-500 dark:text-zinc-400">PDF / ATS<span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></h4>
          <ul className="space-y-2">{atsFindings.map((item) => <AtsFindingCard key={item.id} item={item} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} />)}</ul>
        </section>
      ) : null}
      {filter === 'ats' ? null : grammar.status !== 'done' || check.grammarOutdated ? (
        <button className="anvi-primary" type="button" onClick={() => check.runCheck({ only: 'grammar' })}><SpellCheck2 size={15} />Check spelling and grammar</button>
      ) : (
        <div className="space-y-5">
          {groups.map((section) => (
            <section key={section.key}>
              <h4 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.1em] text-slate-500 dark:text-zinc-400">{section.label}<span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></h4>
              {section.entries.map((entry) => (
                <div key={entry.index} className="mb-3">
                  <div className="mb-1.5 truncate text-[13px] font-semibold text-slate-700 dark:text-slate-200">{entry.label}</div>
                  <ul className="space-y-2"><AnimatePresence initial={false}>{entry.issues.map((issue) => <IssueCard key={issue.id} issue={issue} onLocate={onLocate} onApply={check.applyFix} onIgnore={check.ignore} onIgnoreWord={check.ignoreWord} onHighlight={onHighlight} />)}</AnimatePresence></ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────── ATS ─────────────

function ErrorCard({ message, onRetry, retryLabel = 'Try again' }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1 leading-5">{message}</span></div>
      <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700"><RefreshCw className="h-3.5 w-3.5" />{retryLabel}</button>
    </div>
  );
}

function Field({ label, value, missing }) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-xs">
      {missing ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />}
      <span className="w-24 shrink-0 font-bold text-slate-500">{label}</span>
      <span className={`min-w-0 flex-1 break-words ${missing ? 'italic text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>{missing ? 'Not found' : value}</span>
    </div>
  );
}

const dateText = (date) => (date?.year ? `${date.month ? `${String(date.month).padStart(2, '0')}/` : ''}${date.year}` : '');

// Résumé strength: content quality checks (separate from ATS readability), biggest gaps first.
function StrengthCard({ strength, onLocate }) {
  const [all, setAll] = useState(false);
  const list = all ? strength.checks : strength.improvements.slice(0, 4);
  return (
    <section id="anvi-strength" className="anvi-review-card scroll-mt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Content <span className="ml-1 tabular-nums text-violet-700 dark:text-violet-300">{strength.score}/100</span></h3>
        <button type="button" onClick={() => setAll((value) => !value)} className="anvi-text-link text-[12px]">{all ? 'Only gaps' : 'All checks'}</button>
      </div>
      <p className="mt-0.5 text-[12px] leading-4 text-slate-500 dark:text-zinc-400">What a recruiter reads: real work, measurable results and clear bullets.</p>
      {list.length ? <ul className="mt-2.5 space-y-1.5">
        {list.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[12.5px] dark:bg-white/[0.04]">
            {item.passed ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />}
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><b className="font-semibold text-slate-800 dark:text-zinc-100">{item.title}</b><span className="shrink-0 tabular-nums text-[11.5px] text-slate-500 dark:text-zinc-400">{Math.round(item.earned)}/{item.weight}</span></span>
              <span className="block text-slate-500 dark:text-zinc-400">{item.detail}</span>
              {!item.passed ? <span className="mt-0.5 block text-slate-700 dark:text-zinc-200">{item.fix}</span> : null}
              {!item.passed && item.target ? <button type="button" onClick={() => onLocate(item.target)} className="anvi-text-link mt-1 text-[12px]"><MapPin size={11} />Go to</button> : null}
            </span>
          </li>
        ))}
      </ul> : <p className="mt-2 text-[12.5px] text-emerald-700 dark:text-emerald-300">Every content check passes. Nice work.</p>}
    </section>
  );
}

// "Match a job": one job description box, then two clearly explained checks — the free Quick match
// (exact words) and the ANVI deep check (opt-in, Prep Coins: meaning, and exactly where to add).
const jdFieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:text-[13px] dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:ring-violet-950';
const JD_PLACEHOLDER = 'Paste the complete job description: role summary, responsibilities and requirements.\n\nExample:\nSoftware Engineer Intern, Acme\nRequirements: Java or Node.js, REST APIs, SQL databases, Git…';

function StepLabel({ n, children }) {
  return <p className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">{n}</span>{children}</p>;
}

function AnviDeepCheck({ jd, text, role, company }) {
  const overview = jd.overview;
  const chars = text.trim().length;
  const short = chars < JD_MIN_CHARS;
  // No daily limit any more (the server sends dailyLimit null): only coins limit the checks.
  const left = overview && Number.isFinite(overview.dailyLimit) ? Math.max(0, overview.dailyLimit - overview.usedToday) : null;
  const price = overview ? overview.cost : null;
  const running = Boolean(jd.popup && ['quote', 'charging', 'running'].includes(jd.popup.phase));
  const turnedOff = jd.overviewError?.status === 403;
  let blocked = '';
  if (turnedOff) blocked = 'ANVI JD Match is not turned on for your account. Ask your admin.';
  else if (jd.overviewError && !overview) blocked = 'ANVI JD Match could not be loaded.';
  else if (!overview) blocked = 'Loading the price…';
  else if (price === null) blocked = 'The price could not be loaded right now.';
  else if (overview.paused) blocked = 'Paused for now: this month\'s ANVI check budget is used up. No coins are taken.';
  else if (left === 0) blocked = `You have used today's ${overview.dailyLimit} ANVI checks. Try again tomorrow.`;
  else if (overview.resumeTooLong) blocked = 'Your résumé is longer than ANVI can check in one go (about two pages). Shorten it first, for example by removing old or repeated points.';
  // The limit for this student's résumé comes from the server (same rule it checks before charging).
  const jdMax = overview?.jdMaxChars ?? null;
  const tooLong = jdMax !== null && chars > jdMax;
  const why = short ? `Paste the full job description first (${JD_MIN_CHARS - chars} more characters needed).`
    : blocked || (tooLong ? `This job description is too long for one check: shorten it to ${jdMax.toLocaleString('en-IN')} characters (remove about ${(chars - jdMax).toLocaleString('en-IN')}). Keep the role summary and requirements; company introductions and benefits can go.` : '');
  return (
    <div data-guide="rr-jd-anvi" className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 dark:border-violet-400/25 dark:bg-violet-500/[0.05]">
      <div className="flex items-start gap-3">
        <Orb size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-slate-900 dark:text-white"><AnviWord /> deep check</p>
            {price !== null ? <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/25"><PrepCoinIcon size={13} />{price ? `${price} Prep Coins` : 'Free this time'}</span> : null}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">ANVI reads the job like a recruiter and compares it with every line of your résumé.</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-[12.5px] leading-5 text-slate-700 dark:text-zinc-200">
        {['Every keyword the job needs that your résumé is missing, must-haves first', 'The exact line of your résumé to change, section by section', 'A reference for what to add (you write the words), and a PDF report you can download'].map((item) => (
          <li key={item} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" />{item}</li>
        ))}
      </ul>
      {running && jd.popup.hidden ? (
        <button type="button" onClick={jd.showPopup} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-[13px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-300 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/30"><Loader2 className="h-4 w-4 animate-spin" />ANVI is checking this job · View</button>
      ) : (
        <button type="button" disabled={Boolean(why) || running} onClick={() => jd.start({ jobDescription: text, role, company }, price)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-white/10 dark:disabled:text-zinc-400">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? 'ANVI is checking…' : price ? `Check with ANVI · ${price} coins` : 'Check with ANVI'}
        </button>
      )}
      <p className={`mt-2 text-center text-[12px] leading-4 ${why ? 'text-amber-800 dark:text-amber-300' : 'text-slate-600 dark:text-zinc-400'}`}>
        {why || `${left !== null ? `${left} of ${overview.dailyLimit} checks left today · ` : ''}You confirm before any coins are used · coins come back automatically if ANVI can't finish · the same job again within 24 hours is free`}
        {jd.overviewError && !overview && !turnedOff ? <button type="button" onClick={jd.refresh} className="ml-1 font-semibold underline">Retry</button> : null}
      </p>
      {overview?.history?.length ? (
        <div className="mt-3 border-t border-violet-100 pt-3 dark:border-white/[0.06]">
          <p className="text-[11.5px] font-semibold text-slate-600 dark:text-zinc-300">Your earlier ANVI checks {jd.opening ? <Loader2 className="ml-1 inline h-3 w-3 animate-spin" /> : null}</p>
          <ul className="mt-1.5 space-y-1">
            {overview.history.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => jd.openReport(item.id)} className="flex min-h-10 w-full items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 text-left text-[12.5px] hover:bg-white dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-zinc-100">{[item.role, item.company].filter(Boolean).join(' · ') || 'Job description'}</span>
                  <span className="shrink-0 text-slate-500 dark:text-zinc-400">{new Date(item.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                  <span className="shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 font-semibold tabular-nums text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{item.score ?? '–'}%</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function JobMatch({ check, jd = null }) {
  const report = check.ats.report;
  const [text, setText] = useState(check.jobText || jd?.lastRequest?.jobDescription || '');
  const [role, setRole] = useState(jd?.lastRequest?.role || '');
  const [company, setCompany] = useState(jd?.lastRequest?.company || '');
  const [editing, setEditing] = useState(false);
  const running = check.ats.status === 'running';
  const job = text.trim() === check.jobText.trim() ? report?.job : null;
  if (jd?.enabled && jd.match?.status === 'done') {
    return <JdMatchReport match={jd.match} previousScore={jd.previousScore} onBack={jd.clearReport} onFix={jd.onFix} onHighlight={jd.onHighlight} onReveal={jd.onReveal} studentName={jd.studentName} />;
  }
  const chars = text.trim().length;
  const enough = chars >= JD_MIN_CHARS;
  const jdMax = jd?.enabled ? jd.overview?.jdMaxChars ?? null : null;
  const limit = Math.min(12000, jdMax ?? 12000);
  const over = chars > limit;
  const showResultFirst = Boolean(job) && !editing;
  const result = job ? (
    <div className="anvi-reveal">
      <div className="flex items-center gap-4">
        <ScoreRing score={job.score} size={76} stroke={8} label="match" />
        <div className="text-[12.5px] leading-5 text-slate-600 dark:text-slate-300"><b className="text-slate-900 dark:text-white">Quick match: {job.score ?? '–'}/100 on exact words.</b> {job.requirements.filter((r) => r.status === 'met').length} of {job.requirements.length || 0} requirements clearly met. Add a skill only if you have genuinely used it.</div>
      </div>
      {job.requirements.length ? (
        <ul className="mt-3 space-y-1.5">
          {job.requirements.map((requirement, index) => {
            const tone = requirement.status === 'met' ? 'text-emerald-600' : requirement.status === 'partial' ? 'text-amber-600' : requirement.status === 'missing' ? 'text-rose-600' : 'text-slate-500';
            const Icon = requirement.status === 'met' ? CircleCheck : requirement.status === 'missing' ? CircleAlert : CircleDashed;
            return (
              <li key={index} className="flex gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] dark:bg-black/20">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
                <div className="min-w-0"><span className="text-slate-800 dark:text-slate-200">{requirement.text}</span> <span className={`font-semibold uppercase tracking-[.06em] ${tone}`}>{requirement.status}</span>{requirement.importance === 'preferred' ? <span className="ml-1 text-slate-500">(preferred)</span> : null}
                  {requirement.terms?.length ? <div className="mt-1 flex flex-wrap gap-1">{requirement.terms.map((term) => <span key={term.term} className={`rounded px-1.5 py-0.5 ${term.found ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>{term.term}</span>)}</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-emerald-700 dark:text-emerald-300">On your resume ({job.matchedKeywords.length})</div><div className="flex flex-wrap gap-1">{job.matchedKeywords.slice(0, 30).map((word) => <span key={word} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[12px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{word}</span>)}</div></div>
        <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-rose-700 dark:text-rose-300">Missing ({job.missingKeywords.length})</div><div className="flex flex-wrap gap-1">{job.missingKeywords.slice(0, 30).map((word) => <span key={word} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[12px] font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">{word}</span>)}</div></div>
      </div>
    </div>
  ) : null;
  if (showResultFirst) {
    // The result comes first, where the student is looking; the form folds away until needed.
    return (
      <section id="anvi-job-match" className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white"><Briefcase className="h-4 w-4 text-violet-600 dark:text-violet-300" />Job match result</h4>
          <button type="button" onClick={() => setEditing(true)} className="anvi-secondary !py-1.5 text-[12px]">Change job description</button>
        </div>
        {result}
        {jd?.enabled ? <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10"><AnviDeepCheck jd={jd} text={text} role={role} company={company} /></div> : null}
      </section>
    );
  }
  return (
    <section id="anvi-job-match" className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white"><Briefcase className="h-4 w-4 text-violet-600 dark:text-violet-300" />Match your résumé to a job</h4>
        {job ? <button type="button" onClick={() => setEditing(false)} className="anvi-text-link text-[12px]">Back to result</button> : null}
      </div>
      <p className="mt-1 text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">Copy the job description from the company's careers page, LinkedIn or your placement cell and paste it below. It is compared with your saved résumé.</p>
      <div className="mt-4 space-y-2">
        <StepLabel n={1}>Paste the job description</StepLabel>
        <textarea aria-label="Job description" value={text} onChange={(event) => setText(event.target.value)} rows={7} maxLength={12000} placeholder={JD_PLACEHOLDER} className={`${jdFieldClass} resize-y leading-5`} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className={chars === 0 ? 'text-slate-600 dark:text-zinc-400' : over ? 'font-medium text-rose-700 dark:text-rose-300' : enough ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}>
            {chars === 0 ? 'Include the requirements or skills list: that is what gets matched.'
              : over ? `Too long for an ANVI check: remove about ${(chars - limit).toLocaleString('en-IN')} characters (company intro, benefits).`
                : enough ? 'Looks complete.' : `Add a little more: at least ${JD_MIN_CHARS} characters, including the requirements.`}
          </span>
          <span className={`tabular-nums ${over ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-zinc-400'}`}>{chars.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')}</span>
        </div>
        {jd?.enabled ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">Role <span className="font-normal text-slate-500 dark:text-zinc-400">(optional)</span>
              <input value={role} onChange={(event) => setRole(event.target.value)} maxLength={80} placeholder="e.g. SDE Intern" className={`${jdFieldClass} mt-1`} />
            </label>
            <label className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">Company <span className="font-normal text-slate-500 dark:text-zinc-400">(optional)</span>
              <input value={company} onChange={(event) => setCompany(event.target.value)} maxLength={80} placeholder="e.g. Infosys" className={`${jdFieldClass} mt-1`} />
            </label>
          </div>
        ) : null}
      </div>
      <div className="mt-4 space-y-2.5">
        <StepLabel n={2}>Choose a check</StepLabel>
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Quick match</p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">Free · instant</span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">Looks for the job's exact words in your résumé PDF and lists the ones that are missing.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setEditing(false); check.runJobMatch(text); }} disabled={running || !text.trim()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/5">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}{job ? 'Run quick match again' : 'Run quick match'}</button>
            {report?.job && text.trim() && text !== check.jobText ? <span className="text-[12px] text-slate-500 dark:text-zinc-400">The text changed: run it again to update</span> : null}
            {report?.job && !text.trim() ? <button type="button" onClick={() => { setText(''); check.runJobMatch(''); }} className="text-[12px] font-semibold text-slate-500 hover:text-rose-600">Remove job match</button> : null}
          </div>
        </div>
        {jd?.match?.status === 'failed' ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{jd.match.error?.message || 'This ANVI report could not be opened.'}</p> : null}
        {jd?.enabled ? <AnviDeepCheck jd={jd} text={text} role={role} company={company} /> : null}
      </div>
    </section>
  );
}

function AtsTab({ check, resume, onLocate, onBrowseTemplates }) {
  const { ats } = check;
  const [showText, setShowText] = useState(false);
  const [showPassed, setShowPassed] = useState(false);
  if (ats.status === 'error') return <ErrorCard message={ats.error} retryLabel="Retry PDF check" onRetry={() => check.runCheck({ only: 'ats' })} />;
  if (ats.status === 'running' && !ats.report) return <div className="flex items-center gap-2 py-8 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{ats.stage === 'export' ? 'Exporting your PDF…' : 'Reading the PDF like an ATS…'}</div>;
  const report = ats.report;
  if (!report) return null;
  const template = getTemplate(ats.template || resume.template);
  const verdict = verdictFor(report.readinessScore);
  const parsed = report.parsed;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950 dark:text-white">Score by category</div>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500"><span className={`font-semibold ${TONES[verdict.tone].text}`}>{report.checksPassed} of {report.checksTotal}</span> checks passed on the PDF exported in <b>{template.name}</b>.</p>
          </div>
          {!template.ats ? <button type="button" onClick={onBrowseTemplates} className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:underline"><LayoutTemplate className="h-3.5 w-3.5" />Try an ATS-friendly template</button> : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />ATS-friendly template</span>}
        </div>
        <div className="mt-4 space-y-2">
          {report.categories.map((category) => (
            <div key={category.category} className="flex items-center gap-3 text-[11px]">
              <span className="w-32 shrink-0 font-semibold text-slate-600 dark:text-slate-300">{ATS_CATEGORY_LABELS[category.category] || category.category}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><motion.div initial={{ width: 0 }} animate={{ width: `${category.score}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ backgroundColor: TONES[verdictFor(category.score).tone].ring }} /></div>
              <span className="w-12 shrink-0 text-right font-bold text-slate-500">{category.passed}/{category.total}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-slate-400"><Info className="mt-0.5 h-3 w-3 shrink-0" />Scored by the open-source ATS engine v{report.engineVersion}: deterministic rules, no AI in the score.</p>
      </section>

      {report.failedChecks.length ? (
        <section>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[.1em] text-slate-500 dark:text-zinc-400">Needs attention · {report.failedChecks.length}</h4>
          <ul className="space-y-2">
            {report.failedChecks.map((item) => <AtsFindingCard key={item.id} item={item} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} />)}
          </ul>
        </section>
      ) : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">Every ATS check passed.</div>}

      <section className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
        <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><FileSearch className="h-4 w-4 text-sky-500" />What the ATS read from your PDF</h4>
        <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          <Field label="Name" value={parsed.name} missing={!parsed.name} />
          <Field label="Email" value={parsed.email} missing={!parsed.email} />
          <Field label="Phone" value={parsed.phone} missing={!parsed.phone} />
          <Field label="Links" value={parsed.links.join(', ')} missing={!parsed.links.length} />
          <Field label="Roles" value={parsed.roles.map((role) => [role.title, role.employer].filter(Boolean).join(' at ') + (role.start ? ` (${dateText(role.start)}–${role.current ? 'now' : dateText(role.end)})` : '')).join('; ')} missing={!parsed.roles.length} />
          <Field label="Education" value={parsed.education.map((item) => [item.credential, item.school].filter(Boolean).join(', ')).join('; ')} missing={!parsed.education.length} />
          <Field label={`Skills (${parsed.skills.length})`} value={parsed.skills.slice(0, 24).join(', ')} missing={!parsed.skills.length} />
          {parsed.certifications.length ? <Field label="Certifications" value={parsed.certifications.join(', ')} /> : null}
        </div>
        {report.parsingWarnings.length ? <ul className="mt-3 space-y-1">{report.parsingWarnings.map((warning) => <li key={warning} className="flex gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{warning}</li>)}</ul> : null}
        <button type="button" onClick={() => setShowText((value) => !value)} className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-sky-600"><ChevronDown className={`h-3.5 w-3.5 transition ${showText ? 'rotate-180' : ''}`} />{showText ? 'Hide' : 'Show'} the raw text the ATS extracted</button>
        {showText ? <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-mono text-[10.5px] leading-4 text-slate-200">{report.text}</pre> : null}
      </section>

      {report.passedChecks.length ? (
        <section>
          <button type="button" onClick={() => setShowPassed((value) => !value)} className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[.14em] text-slate-400 hover:text-emerald-600"><ChevronDown className={`h-3.5 w-3.5 transition ${showPassed ? 'rotate-180' : ''}`} />Passed · {report.passedChecks.length}</button>
          {showPassed ? <ul className="mt-2 space-y-1">{report.passedChecks.map((item) => <li key={item.id} className="flex gap-2 text-[11px] text-slate-600 dark:text-slate-300"><CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /><span><b>{atsRuleInfo(item.id, resume).title}.</b> {item.evidence}</span></li>)}</ul> : null}
        </section>
      ) : null}
    </div>
  );
}

// ───────────── summary + ANVI explain ─────────────

function FixFirst({ items, resume, onLocate, onBrowseTemplates }) {
  if (!items.length) return null;
  return (
    <section className="rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <h4 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900 dark:text-white"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20"><Target className="h-3.5 w-3.5" /></span>Fix these first</h4>
        <span className="text-[10.5px] text-slate-400 dark:text-zinc-500">Open a finding to edit</span>
      </div>
      {/* Each fix is one button: it opens the builder at that section, entry or bullet. */}
      <ol className="space-y-1.5">
        {items.map((item, index) => {
          const where = item.target.template ? 'Templates' : item.target.sectionLabel ? locationLabel(item.target).join(' › ') : [SECTION_LABEL(resume, item.target.section), item.target.field].filter(Boolean).join(' › ');
          return (
            <li key={item.key}>
              <button type="button" onClick={() => (item.target.template ? onBrowseTemplates() : onLocate(item.target))}
                className="group flex w-full items-start gap-3 rounded-xl bg-[#f8f9fb] px-3 py-2.5 text-left ring-1 ring-inset ring-transparent transition hover:bg-violet-50/70 hover:ring-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-white/[0.03] dark:hover:bg-violet-500/[0.08] dark:hover:ring-violet-400/25">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-violet-600 to-fuchsia-600 text-[11px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(124,58,237,0.7)]">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{item.title}</span>
                    {item.impact ? <span className="rounded-md bg-rose-50 px-1.5 py-px text-[10.5px] font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">−{item.impact} pts</span> : null}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-slate-500 dark:text-zinc-400">{item.detail}</span>
                  <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-100 dark:bg-white/[0.04] dark:text-violet-300 dark:ring-violet-400/20">
                    {item.target.template ? <LayoutTemplate className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}<span className="truncate">{where}</span>
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500 dark:text-zinc-600" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ExplainCard({ check, resume, onLocate, onBrowseTemplates }) {
  const { explain } = check;
  const disabled = !check.ats.report && !check.visibleIssues.length;
  if (explain.status === 'idle') {
    return (
      <div className={`anvi-aura ${disabled ? 'opacity-50 [animation-play-state:paused]' : ''}`} style={{ '--anvi-radius': '1rem' }}>
        <button type="button" onClick={check.runExplain} disabled={disabled} className="anvi-aura-inner group relative flex w-full items-center gap-3 overflow-hidden bg-white p-3.5 text-left transition dark:bg-[#242424]">
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sky-50/60 via-violet-50/70 to-fuchsia-50/60 opacity-0 transition group-hover:opacity-100 dark:from-sky-500/[0.05] dark:via-violet-500/[0.08] dark:to-fuchsia-500/[0.05]" aria-hidden="true" />
          <AnviOrb size="h-11 w-11" />
          <div className="relative flex-1"><div className="text-sm font-semibold text-slate-900 dark:text-zinc-50">Explain with <AnviWord /></div><div className="text-[11px] text-slate-500 dark:text-zinc-400">Get a short explanation of your findings.</div></div>
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-violet-600 to-fuchsia-600 text-white shadow-[0_6px_16px_-6px_rgba(124,58,237,0.8)] transition group-hover:scale-110"><Sparkles className="h-4 w-4" /></span>
        </button>
      </div>
    );
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white dark:border-violet-900 dark:bg-slate-900">
      <div className="flex items-center gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-sky-50/60 px-4 py-3 dark:border-white/[0.06] dark:from-violet-500/10 dark:to-transparent">
        <AnviOrb size="h-9 w-9" busy={explain.status === 'running'} />
        <div className="flex-1"><div className="text-sm font-semibold text-slate-900 dark:text-zinc-50">ANVI</div><div role="status" className="text-[10.5px] text-slate-500 dark:text-zinc-400">{explain.status === 'running' ? 'Preparing your suggestions…' : 'Based on your scan results.'}</div></div>
      </div>
      <div className="p-4">
        {explain.status === 'running' ? <div className="space-y-2">{[90, 75, 82].map((width) => <div key={width} className="h-3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" style={{ width: `${width}%` }} />)}</div> : null}
        {explain.status === 'error' ? <ErrorCard message={explain.error} onRetry={check.runExplain} /> : null}
        {explain.status === 'done' && explain.data ? (
          <div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] leading-6 text-slate-700 dark:text-slate-200">{explain.data.summary}</motion.p>
            <ol className="mt-3 space-y-3">
              {explain.data.fixes.map((fix, index) => (
                <motion.li key={index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 * (index + 1) }} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                  <div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-600 text-[10px] font-black text-white">{index + 1}</span><span className="text-xs font-black text-slate-900 dark:text-white">{fix.title}</span></div>
                  <p className="mt-1.5 text-[11.5px] leading-5 text-slate-600 dark:text-slate-300">{fix.why}</p>
                  <p className="mt-1 text-[11.5px] font-semibold leading-5 text-slate-800 dark:text-slate-100">→ {fix.action}</p>
                  {fix.evidence ? <p className="mt-1.5 border-l-2 border-violet-300 pl-2 text-[11px] italic text-slate-500">“{fix.evidence}”</p> : null}
                  {fix.section ? <button type="button" onClick={() => (fix.section === 'template' ? onBrowseTemplates() : onLocate({ section: fix.section, entryIndex: fix.entryIndex, bulletIndex: fix.bulletIndex, field: fix.bulletIndex !== null && fix.bulletIndex !== undefined ? 'bullet' : null }))} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:underline dark:text-violet-300"><MapPin className="h-3 w-3" />{SECTION_LABEL(resume, fix.section)}{fix.bulletIndex !== null && fix.bulletIndex !== undefined ? ` › bullet ${fix.bulletIndex + 1}` : ''}<ArrowRight className="h-3 w-3" /></button> : null}
                </motion.li>
              ))}
            </ol>
            {explain.data.skillNotes?.length ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="text-[11px] font-black text-amber-800 dark:text-amber-300">Skills the job asks for</div>
                <ul className="mt-1.5 space-y-1">{explain.data.skillNotes.map((note) => <li key={note.skill} className="text-[11px] text-slate-700 dark:text-slate-300"><b>{note.skill}:</b> {note.foundInResume ? 'already in your resume. Make sure it also appears in your skills list.' : 'add it only if you have genuinely used it, with a line showing where.'}</li>)}</ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ───────────── score header ─────────────

const EMPTY_ISSUES = [];
const TABS = [
  { id: 'overview', label: 'Summary', icon: Sparkles },
  { id: 'grammar', label: 'Issues', icon: ListChecks },
  { id: 'ats', label: 'ATS', icon: FileSearch },
  { id: 'job', label: 'Job match', icon: Briefcase },
  { id: 'rewrite', label: 'Improve', icon: PencilLine },
];
const PDF_STAGE = { export: ['Preparing your PDF', 0.15], upload: ['Sending your PDF', 0.3], queued: ['Your PDF is in the scan queue', 0.4], reconnect: ['Reconnecting to your scan', 0.4] };

function PartChip({ label, value, detail, onClick }) {
  const tone = value === null || value === undefined ? 'slate' : verdictFor(value).tone;
  return (
    <button type="button" onClick={onClick} className="group flex min-w-0 flex-1 flex-col items-start rounded-xl bg-white/70 px-2.5 py-1.5 text-left ring-1 ring-inset ring-slate-200/80 transition hover:bg-white hover:ring-violet-300 dark:bg-white/[0.03] dark:ring-white/10 dark:hover:bg-white/[0.06] dark:hover:ring-violet-400/40">
      <span className="flex w-full items-center justify-between gap-1 text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{label}<ChevronRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" /></span>
      <span className={`text-[17px] font-semibold leading-6 tabular-nums ${TONES[tone].text}`}>{value ?? '–'}</span>
      <span className="w-full truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{detail}</span>
    </button>
  );
}

/** Always visible at the top of the panel: the score, its three parts, and a running check's progress. */
function ScoreHeader({ score, check, latest, writingDone, onPart, onRun, hasContent, ready }) {
  const { ats, grammar } = check;
  if (check.running) {
    const { done = 0, total = 0 } = grammar.progress || {};
    const pdf = ats.status === 'running' ? PDF_STAGE[ats.stage] || ['Reading your PDF like an ATS', 0.7] : null;
    const textPart = grammar.status === 'running' ? (total ? done / total : 0.1) : 1;
    const parts = [pdf ? pdf[1] : 1, textPart];
    const progress = Math.round((parts.reduce((sum, value) => sum + value, 0) / parts.length) * 100);
    return (
      <div className="px-4 pb-3 pt-1" role="status">
        <div className="flex items-center justify-between text-[12.5px] font-medium text-slate-700 dark:text-zinc-200">
          <span>{pdf ? pdf[0] : 'Checking spelling and grammar'}{grammar.status === 'running' && total ? ` · ${done}/${total} lines` : ''}…</span>
          <span className="tabular-nums text-slate-500 dark:text-zinc-400">{progress}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-violet-600 to-fuchsia-600" animate={{ width: `${Math.max(6, progress)}%` }} transition={{ duration: 0.4 }} /></div>
      </div>
    );
  }
  if (score.overall === null) {
    return (
      <div className="flex items-center gap-3 px-4 pb-3 pt-1">
        <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">{ready ? (check.atsOutdated ? 'Your draft has changed since the last check.' : 'One check scores your PDF, content and language.') : 'Finish the details below to unlock your score.'}</p>
        {ready ? <button type="button" className="anvi-primary shrink-0" disabled={!hasContent} onClick={onRun}><Sparkles size={15} />{check.atsOutdated ? 'Recheck' : 'Check my résumé'}</button> : null}
      </div>
    );
  }
  const { counts } = score;
  const mistakes = counts.spelling + counts.grammar;
  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-center gap-3">
        <ScoreRing score={score.overall} size={62} stroke={7} label="score" tone={score.verdict.tone} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400">Prep Resume Score{score.partial ? ' · partial' : ''}</p>
          <p className={`text-[16px] font-semibold leading-6 ${TONES[score.verdict.tone].text}`}>{score.verdict.label}</p>
          {score.caps[0] ? <p className="mt-0.5 flex items-start gap-1 text-[12px] leading-4 text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />Capped at {score.caps[0].limit}: {score.caps[0].reason}</p> : null}
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <PartChip label="ATS" value={score.parts.ats} detail={latest ? `${latest.failedChecks.length} to fix` : 'Not checked'} onClick={() => onPart('ats')} />
        <PartChip label="Content" value={score.parts.content} detail={`${score.strength.improvements.length} gaps`} onClick={() => onPart('content')} />
        <PartChip label="Language" value={score.parts.language} detail={writingDone ? `${mistakes} mistake${mistakes === 1 ? '' : 's'}${counts.style ? ` · ${counts.style} style` : ''}` : 'Not checked'} onClick={() => onPart('grammar')} />
      </div>
    </div>
  );
}

/** Shown once a check finishes, at the top of whatever the student is looking at. */
function ResultsBanner({ banner, onOpen, onDismiss }) {
  return (
    <div role="status" className="anvi-reveal flex items-start gap-3 rounded-2xl bg-gradient-to-r from-sky-50 via-violet-50 to-fuchsia-50 p-3.5 ring-1 ring-inset ring-violet-200 dark:from-sky-500/[0.08] dark:via-violet-500/[0.1] dark:to-fuchsia-500/[0.08] dark:ring-violet-400/25">
      <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Your results are ready{banner.score !== null ? `: ${banner.score}/100` : ''}</p>
        <p className="mt-0.5 text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">{banner.issues ? `${banner.issues} thing${banner.issues === 1 ? '' : 's'} to fix, the most important first.` : 'No issues found. Nice work.'}</p>
        {banner.issues ? <button type="button" onClick={onOpen} className="anvi-primary mt-2 !py-1.5"><ListChecks size={14} />See all {banner.issues} issues</button> : null}
      </div>
      <button type="button" onClick={onDismiss} className="rounded-md p-1 text-slate-400 hover:bg-white/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-zinc-200" aria-label="Dismiss"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ───────────── panel ─────────────

export default function ResumeCheckPanel({ check, resume, hasContent, onLocate, onBrowseTemplates, onClose = null, onHighlight = null, className = '', initialTab = 'overview', initialAction = '', jdMatch = null, viewRequest = null, onViewChange = null }) {
  const [view, setView] = useState(initialAction === 'rewrite' ? 'rewrite' : initialTab);
  // The page remembers the open tab, so "Go to" → builder → back returns to the same tab.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  useEffect(() => { onViewChangeRef.current?.(view); }, [view]);
  const [fresh, setFresh] = useState(() => new Set()); // tabs with results the student has not opened yet
  const [banner, setBanner] = useState(null);
  // The page can ask for a view (e.g. the job view when an ANVI report is ready).
  useEffect(() => { if (viewRequest?.view) setView(viewRequest.view); }, [viewRequest]);
  const scrollRef = useRef(null);
  const tabRefs = useRef({});
  const lastView = useRef(view);
  const toTop = () => {
    const node = scrollRef.current;
    if (!node) return;
    if (typeof node.scrollTo === 'function') node.scrollTo({ top: 0, behavior: 'smooth' });
    else node.scrollTop = 0;
  };
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);
  const templateName = getTemplate(resume.template).name;
  const { grammar, ats, requirements } = check;
  const ready = requirements.ready;
  const latest = ready && !check.atsOutdated ? ats.report : null;
  const writingDone = grammar.status === 'done' && !check.grammarOutdated;
  const issues = check.grammarOutdated ? EMPTY_ISSUES : check.visibleIssues;
  const score = useMemo(() => resumeScore({ resume, atsReport: latest, issues: writingDone ? issues : null }), [resume, latest, writingDone, issues]);
  const strength = score.strength;
  const top = useMemo(() => fixFirst({ report: latest, issues, resume }).map(item => {
    if (item.source !== 'ats') return item;
    const finding = latest.failedChecks.find(source => item.key === 'ats:' + source.id);
    if (!finding) return item;
    const info = describeAtsFinding(finding, resume);
    return { ...item, target: info.target, detail: info.instruction };
  }), [latest, issues, resume]);
  const checkedAt = latest ? ats.checkedAt : grammar.checkedAt || null;
  const overview = view === 'overview';
  const pdfRunning = ats.status === 'running';
  const grammarRunning = grammar.status === 'running';
  const showScan = (overview && check.running && !latest && !writingDone) || (view === 'grammar' && grammarRunning) || (['ats', 'job'].includes(view) && pdfRunning);
  const run = () => { setBanner(null); return check.runCheck({ force: true }); };
  const reducedMotion = useReducedMotion();
  const totalIssues = (writingDone ? issues.length : 0) + (latest?.failedChecks.length || 0);

  // When a check finishes: jump to the top, say so, and mark the tabs that have new results.
  const finished = useRef({ running: check.running });
  finished.current.score = score.overall;
  finished.current.total = totalIssues;
  useEffect(() => {
    const was = finished.current.running;
    finished.current.running = check.running;
    if (!was || check.running) return;
    if (finished.current.score === null && !finished.current.total) return;
    setBanner({ score: finished.current.score, issues: finished.current.total, at: Date.now() });
    setFresh((current) => new Set([...current, 'grammar', 'ats'].filter((id) => id !== lastView.current)));
    toTop();
  }, [check.running]);
  // ANVI's explanation appears at the top of the summary: bring it into view when it lands.
  useEffect(() => { if (check.explain.status === 'done' && lastView.current === 'overview') toTop(); }, [check.explain.status]);

  const selectView = id => {
    if (id === 'content') {
      setView('overview');
      setTimeout(() => document.getElementById('anvi-strength')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }
    setView(id);
    setFresh((current) => { const next = new Set(current); next.delete(id); return next; });
    if (id === 'grammar' && (grammar.status === 'idle' || check.grammarOutdated)) check.runCheck({ only: 'grammar' });
  };
  const onTabKey = (event, index) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    selectView(next.id);
    tabRefs.current[next.id]?.focus();
  };
  const outdated = check.atsOutdated || check.grammarOutdated;

  return (
    <MotionConfig reducedMotion="user" transition={reducedMotion ? { duration: 0 } : undefined}>
      <div className={`anvi-workspace flex min-h-0 flex-col ${className}`}>
        {/* Fixed top: who, score, tabs. Results never land out of sight below the fold. */}
        <div className="shrink-0 border-b border-slate-200/80 bg-white dark:border-white/10 dark:bg-zinc-900">
          <header className="flex items-center gap-3 px-4 pb-2 pt-3">
            <Orb size={32} busy={check.running} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-white"><AnviWord /> résumé check</h2>
              <p className="text-[12px] text-slate-500 dark:text-zinc-400">{check.running ? 'Checking your latest draft…' : outdated && checkedAt ? <span className="text-amber-700 dark:text-amber-300">Draft changed since the last check</span> : checkedAt ? `Last checked ${timeAgo(checkedAt)}` : 'Not checked yet'}</p>
            </div>
            {score.overall !== null && !check.running ? <button type="button" className={`anvi-secondary !py-1.5 ${outdated ? '!border-amber-300 !text-amber-800 dark:!text-amber-200' : ''}`} onClick={run}><RefreshCw size={13} />Recheck</button> : null}
            {onClose ? <button type="button" onClick={onClose} className="anvi-icon-button" aria-label="Close check"><X size={16} /></button> : null}
          </header>
          <ScoreHeader score={score} check={check} latest={latest} writingDone={writingDone} onPart={selectView} onRun={run} hasContent={hasContent} ready={ready} />
          <div role="tablist" aria-label="Résumé check" className="flex overflow-x-auto px-2 [scrollbar-width:none]">
            {TABS.map(({ id, label, icon: Icon }, index) => {
              const active = view === id;
              const count = id === 'grammar' && (writingDone || latest) ? totalIssues : null;
              return (
                <button key={id} ref={(node) => { tabRefs.current[id] = node; }} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => selectView(id)} onKeyDown={(event) => onTabKey(event, index)}
                  className={`relative inline-flex shrink-0 items-center gap-1 px-2 pb-2.5 pt-1.5 text-[13px] font-semibold transition ${active ? 'text-violet-700 dark:text-violet-300' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100'}`}>
                  <Icon className="h-3.5 w-3.5" />{label}
                  {count !== null ? <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${count ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'}`}>{count}</span> : null}
                  {fresh.has(id) && !active ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-fuchsia-500" aria-label="new results" /> : null}
                  {active ? <motion.span layoutId="anvi-tab-line" className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-sky-500 via-violet-600 to-fuchsia-600" /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="sr-only" role="status">{check.running ? 'Checking the current draft' : banner ? 'Your review is ready' : ''}</div>
        <div className="px-4 [&:not(:empty)]:pt-3"><UndoNotice check={check} /></div>
        <div ref={scrollRef} role="tabpanel" className="anvi-panel-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [scrollbar-gutter:stable]">
          {banner && !check.running ? <ResultsBanner banner={banner} onOpen={() => { setBanner(null); selectView('grammar'); }} onDismiss={() => setBanner(null)} /> : null}
          {showScan ? <ScanScene check={check} templateName={templateName} resume={resume} /> : null}
          {!check.running && !ready && ['overview', 'ats', 'job'].includes(view) ? <DraftChecklist requirements={requirements} onLocate={onLocate} /> : null}
          {ats.status === 'error' && ['overview', 'job'].includes(view) ? <ErrorCard message={ats.error} retryLabel="Retry PDF check" onRetry={() => check.runCheck({ only: 'ats' })} /> : null}
          {grammar.status === 'error' && overview ? <ErrorCard message={grammar.error} onRetry={() => check.runCheck({ only: 'grammar' })} /> : null}

          {overview && !showScan ? <>
            {latest || issues.length ? <ExplainCard check={check} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} /> : null}
            <FixFirst items={top} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} />
            <StrengthCard strength={strength} onLocate={onLocate} />
            {latest && latest.readinessScore - strength.score >= 20 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">An ATS reads your PDF easily ({latest.readinessScore}), but recruiters judge the content ({strength.score}). Work on the points above before applying.</p> : null}
          </> : null}
          {view === 'rewrite' ? <BulletCoach resume={resume} check={check} onLocate={onLocate} onOpenIssues={() => selectView('grammar')} /> : null}
          {!grammarRunning && view === 'grammar' ? <IssuesTab check={check} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} onHighlight={onHighlight} atsReport={latest} /> : null}
          {!pdfRunning && view === 'ats' && ready ? latest || ats.status === 'error' ? <AtsTab check={check} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} /> : <button type="button" className="anvi-primary" onClick={() => check.runCheck({ only: 'ats' })}><ScanText size={15} />Check this PDF</button> : null}
          {view === 'job' && ready ? <div hidden={pdfRunning && !(jdMatch?.match?.status === 'done')}><JobMatch check={check} jd={jdMatch} /></div> : null}
        </div>
      </div>
    </MotionConfig>
  );
}
