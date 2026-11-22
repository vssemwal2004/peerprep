// ANVI Resume Check panel: grammar + ATS readiness + job match, with a clear
// answer to "what should I fix first, and where?".
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, BadgeCheck, Briefcase, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDashed, Clock3,
  EyeOff, FileSearch, Info, LayoutTemplate, Loader2, Lock, MapPin, RefreshCw, ScanText, ShieldCheck, Sparkles, SpellCheck2, Target, Wand2, X,
} from 'lucide-react';
import { getTemplate } from '../templates/catalog';
import { AnviOrb as Orb, AnviGauge, AnviMessage, AnviScanSheet, AnviWord, VerdictPill } from './AnviVisuals';
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

function FirstRun({ onStart, templateName, disabled }) {
  return (
    <div className="space-y-3">
      <AnviMessage>
        Hi, I’m <AnviWord />. I read your resume the way recruiters and their software do, then tell you <b className="font-semibold text-slate-900 dark:text-white">what to fix first, and where</b>.
      </AnviMessage>
      <AnviMessage avatar={false} delay={0.15}>
        <div className="text-[12px] font-semibold text-slate-900 dark:text-white">One check gives you:</div>
        <ul className="mt-2 space-y-2.5">
          {[
            [ScanText, 'ATS readiness out of 100', `I export your PDF in ${templateName} and read it like an applicant tracking system: headings, layout, contacts, dates, 35 rules.`],
            [SpellCheck2, 'Grammar and spelling', 'Every bullet, title and paragraph, with the exact words to change and a one-click fix.'],
            [Target, 'Job match (optional)', 'Paste a job description to see the requirements you meet and the skills missing.'],
          ].map(([Icon, title, text]) => (
            <li key={title} className="flex gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/15"><Icon className="h-3.5 w-3.5" /></span>
              <div className="min-w-0"><div className="text-[12px] font-semibold text-slate-900 dark:text-white">{title}</div><p className="text-[11.5px] leading-[1.45] text-slate-500 dark:text-zinc-400">{text}</p></div>
            </li>
          ))}
        </ul>
      </AnviMessage>
      <div className="pl-9 pt-1">
        <button type="button" onClick={onStart} disabled={disabled} className="anvi-button inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          <Sparkles className="h-4 w-4" />Check my resume with ANVI
        </button>
        {disabled ? <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-zinc-400">Add some details to your resume first.</p> : null}
      </div>
      <p className="flex items-start gap-2 pl-9 text-[11px] leading-4 text-slate-400 dark:text-zinc-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Grammar runs on your device. The PDF is read once for the score and not stored. The score comes from an open, rule-based ATS engine, so the same resume always gets the same score.</p>
    </div>
  );
}

function Step({ state, children }) {
  const icon = state === 'done' ? <CircleCheck className="h-4 w-4 text-emerald-500" /> : state === 'active' ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" /> : state === 'error' ? <CircleAlert className="h-4 w-4 text-rose-500" /> : <CircleDashed className="h-4 w-4 text-slate-300 dark:text-slate-600" />;
  return <li className={`flex items-center gap-3 py-1.5 text-xs ${state === 'pending' ? 'text-slate-400' : state === 'error' ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>{icon}<span className={state === 'active' ? 'font-bold' : ''}>{children}</span></li>;
}

function Scanning({ check, templateName }) {
  const { grammar, ats } = check;
  const grammarState = grammar.status === 'done' ? 'done' : grammar.status === 'error' ? 'error' : grammar.status === 'running' ? (grammar.loadingEngine ? 'pending' : 'active') : 'pending';
  const atsState = (stage) => (ats.status === 'done' ? 'done' : ats.status === 'error' ? 'error' : ats.status !== 'running' ? 'pending' : ats.stage === stage ? 'active' : stage === 'export' ? 'done' : 'pending');
  const total = grammar.progress?.total || 0;
  const done = grammar.progress?.done || 0;
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="relative">
        <AnviScanSheet width={128} scanning />
        <span className="absolute -bottom-4 -right-5"><AnviOrb size="h-11 w-11" busy /></span>
      </div>
      <h3 className="mt-7 text-base font-semibold text-slate-950 dark:text-white"><AnviWord /> is checking your resume</h3>
      <p className="mt-1 text-xs text-slate-500">This usually takes a few seconds.</p>
      <div className="mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" animate={{ width: `${Math.round(((ats.status === 'done' ? 0.5 : ats.stage === 'read' ? 0.3 : 0.1) + (total ? (done / total) * 0.5 : grammar.status === 'done' ? 0.5 : 0)) * 100)}%` }} />
      </div>
      <ul className="mt-5 w-full max-w-sm text-left">
        <Step state="done">Reading your resume sections</Step>
        <Step state={grammar.loadingEngine ? 'active' : grammar.status === 'idle' ? 'pending' : 'done'}>Loading ANVI’s language engine{grammar.loadingEngine ? ' (first time only)' : ''}</Step>
        <Step state={grammarState}>Checking grammar and spelling{total ? ` · ${done}/${total} lines` : ''}</Step>
        <Step state={atsState('export')}>Exporting your PDF in {templateName}</Step>
        <Step state={atsState('read')}>Reading the PDF the way an ATS does and scoring 35 rules</Step>
      </ul>
    </div>
  );
}

// ───────────── grammar ─────────────

function Highlight({ issue, suggestion }) {
  const text = issue.plainText;
  const from = Math.max(0, issue.start - 70);
  const to = Math.min(text.length, issue.end + 70);
  return (
    <p className="text-[12.5px] leading-6 text-slate-700 dark:text-slate-200">
      {from > 0 ? '… ' : ''}{text.slice(from, issue.start)}
      <span className="rounded-sm bg-rose-100 px-0.5 text-rose-700 line-through decoration-rose-500 decoration-2 dark:bg-rose-950 dark:text-rose-300">{issue.problem || ' '}</span>
      {suggestion !== undefined ? <span className="ml-0.5 rounded-sm bg-emerald-100 px-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{suggestion || '(remove)'}</span> : null}
      {text.slice(issue.end, to)}{to < text.length ? ' …' : ''}
    </p>
  );
}

function IssueCard({ issue, onLocate, onApply, onIgnore }) {
  const [choice, setChoice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const suggestion = issue.suggestions[choice];
  const apply = async () => {
    setBusy(true);
    const result = await onApply(issue, suggestion);
    setBusy(false);
    if (!result?.ok) setNote('This line changed since the check. Run the check again.');
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} className="rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
        <span className={`rounded-full px-2 py-0.5 uppercase tracking-[.08em] ring-1 ${CATEGORY_TONE[issue.category]}`}>{issue.category}</span>
        <span className="inline-flex items-center gap-1 text-slate-500"><MapPin className="h-3 w-3" />{locationLabel(issue.unit).join(' › ')}</span>
        {issue.source === 'anvi' ? <span className="ml-auto inline-flex items-center gap-1 text-violet-500"><Sparkles className="h-3 w-3" />ANVI rule</span> : null}
      </div>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-900 dark:text-white">{issue.message}</p>
      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-950"><Highlight issue={issue} suggestion={suggestion} /></div>
      {issue.suggestions.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {issue.suggestions.map((item, index) => <button type="button" key={`${item}-${index}`} onClick={() => setChoice(index)} className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${index === choice ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-300'}`}>{item || '(remove)'}</button>)}
        </div>
      ) : null}
      {note ? <p className="mt-2 text-[11px] text-amber-600">{note}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onLocate({ ...issue.unit })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300"><ArrowRight className="h-3.5 w-3.5" />{issue.unit.field === 'bullet' ? 'Go to bullet' : 'Go to line'}</button>
        {issue.suggestions.length ? <button type="button" onClick={apply} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}Apply fix</button> : <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800">Rewrite this in your own words</span>}
        <button type="button" onClick={() => onIgnore(issue)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><EyeOff className="h-3.5 w-3.5" />Ignore</button>
      </div>
    </motion.li>
  );
}

function GrammarTab({ check, resume, onLocate }) {
  const [filter, setFilter] = useState('all');
  const { grammar, visibleIssues, ignoredCount } = check;
  const counts = useMemo(() => ({ all: visibleIssues.length, spelling: visibleIssues.filter((i) => i.category === 'spelling').length, grammar: visibleIssues.filter((i) => i.category === 'grammar').length, style: visibleIssues.filter((i) => i.category === 'style').length }), [visibleIssues]);
  const groups = useMemo(() => groupIssues(visibleIssues.filter((item) => filter === 'all' || item.category === filter), resume), [visibleIssues, filter, resume]);
  if (grammar.status === 'error') return <ErrorCard message={grammar.error} onRetry={() => check.runCheck({ only: 'grammar' })} />;
  if (grammar.status === 'running') return <div className="flex items-center gap-2 py-8 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking {grammar.progress.done}/{grammar.progress.total} lines…</div>;
  if (!visibleIssues.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
        <BadgeCheck className="mx-auto h-10 w-10 text-emerald-500" />
        <h4 className="mt-3 text-sm font-black text-slate-900 dark:text-white">No grammar or spelling issues</h4>
        <p className="mt-1 text-xs text-slate-500">ANVI checked {grammar.lineCount} lines of your resume.</p>
        {ignoredCount ? <button type="button" onClick={check.unignoreAll} className="mt-3 text-[11px] font-bold text-sky-600 hover:underline">Show {ignoredCount} ignored</button> : null}
      </div>
    );
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[['all', 'All'], ['spelling', 'Spelling'], ['grammar', 'Grammar'], ['style', 'Style']].map(([key, label]) => (
          <button type="button" key={key} onClick={() => setFilter(key)} className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${filter === key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>{label} <span className="opacity-60">{counts[key]}</span></button>
        ))}
        {ignoredCount ? <button type="button" onClick={check.unignoreAll} className="ml-auto text-[11px] font-bold text-slate-400 hover:text-sky-600">Show {ignoredCount} ignored</button> : null}
      </div>
      <div className="space-y-5">
        {groups.map((section) => (
          <section key={section.key}>
            <h4 className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[.14em] text-slate-400">{section.label}<span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /></h4>
            {section.entries.map((entry) => (
              <div key={entry.index} className="mb-3">
                <div className="mb-1.5 truncate text-xs font-bold text-slate-700 dark:text-slate-200">{entry.label}</div>
                <ul className="space-y-2"><AnimatePresence initial={false}>{entry.issues.map((issue) => <IssueCard key={issue.id} issue={issue} onLocate={onLocate} onApply={check.applyFix} onIgnore={check.ignore} />)}</AnimatePresence></ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

// ───────────── ATS ─────────────

function ErrorCard({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1 leading-5">{message}</span></div>
      <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700"><RefreshCw className="h-3.5 w-3.5" />Try again</button>
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

function JobMatch({ check }) {
  const report = check.ats.report;
  const [text, setText] = useState(check.jobText);
  const running = check.ats.status === 'running';
  const job = report?.job;
  return (
    <section id="anvi-job-match" className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
      <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><Briefcase className="h-4 w-4 text-violet-500" />Job match <span className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Optional</span></h4>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">Paste a job description to compare it with your resume, requirement by requirement. This score is separate from ATS readiness.</p>
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} maxLength={12000} placeholder="Paste the job description here…" className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-violet-950" />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => check.runJobMatch(text)} disabled={running || text.trim().length < 40} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}{job ? 'Match again' : 'Match to this job'}</button>
        {text && text !== check.jobText ? <span className="text-[10px] text-slate-400">Not matched yet</span> : null}
        {job && !text.trim() ? <button type="button" onClick={() => { setText(''); check.runJobMatch(''); }} className="text-[11px] font-bold text-slate-400 hover:text-rose-600">Remove job match</button> : null}
      </div>
      {job ? (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <ScoreRing score={job.score} size={76} stroke={8} label="match" />
            <div className="text-xs leading-5 text-slate-600 dark:text-slate-300"><b className="text-slate-900 dark:text-white">Job match {job.score ?? '–'}/100.</b> {job.requirements.filter((r) => r.status === 'met').length} of {job.requirements.length || 0} requirements clearly met. Add a skill only if you have genuinely used it.</div>
          </div>
          {job.requirements.length ? (
            <ul className="mt-3 space-y-1.5">
              {job.requirements.map((requirement, index) => {
                const tone = requirement.status === 'met' ? 'text-emerald-600' : requirement.status === 'partial' ? 'text-amber-500' : requirement.status === 'missing' ? 'text-rose-500' : 'text-slate-400';
                const Icon = requirement.status === 'met' ? CircleCheck : requirement.status === 'missing' ? CircleAlert : CircleDashed;
                return (
                  <li key={index} className="flex gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] dark:bg-slate-950">
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
                    <div className="min-w-0"><span className="text-slate-800 dark:text-slate-200">{requirement.text}</span> <span className={`font-bold uppercase tracking-[.08em] ${tone}`}>{requirement.status}</span>{requirement.importance === 'preferred' ? <span className="ml-1 text-slate-400">(preferred)</span> : null}
                      {requirement.terms?.length ? <div className="mt-1 flex flex-wrap gap-1">{requirement.terms.map((term) => <span key={term.term} className={`rounded px-1.5 py-0.5 ${term.found ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>{term.term}</span>)}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-600">On your resume ({job.matchedKeywords.length})</div><div className="flex flex-wrap gap-1">{job.matchedKeywords.slice(0, 30).map((word) => <span key={word} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{word}</span>)}</div></div>
            <div><div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-rose-600">Missing ({job.missingKeywords.length})</div><div className="flex flex-wrap gap-1">{job.missingKeywords.slice(0, 30).map((word) => <span key={word} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">{word}</span>)}</div></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AtsTab({ check, resume, onLocate, onBrowseTemplates }) {
  const { ats } = check;
  const [showText, setShowText] = useState(false);
  const [showPassed, setShowPassed] = useState(false);
  if (ats.status === 'error') return <ErrorCard message={ats.error} onRetry={() => check.runCheck({ only: 'ats' })} />;
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
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-[.14em] text-slate-400">Needs attention · {report.failedChecks.length}</h4>
          <ul className="space-y-2">
            {report.failedChecks.map((item) => {
              const info = atsRuleInfo(item.id, resume);
              const [label, badge] = SEVERITY[item.severity] || SEVERITY.info;
              return (
                <li key={item.id} className="rounded-xl bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[.1em] ${badge}`}>{label}</span>
                    <span className="flex-1 text-xs font-black text-slate-900 dark:text-white">{info.title}</span>
                    {item.scoreImpact ? <span className="text-[11px] font-black text-rose-500">−{item.scoreImpact} pts</span> : null}
                  </div>
                  <p className="mt-2 border-l-2 border-slate-200 pl-2.5 text-[11px] italic leading-4 text-slate-500 dark:border-slate-700">{item.evidence}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200"><b>Fix: </b>{item.fix}</p>
                  <button type="button" onClick={() => (info.template ? onBrowseTemplates() : onLocate({ section: info.section }))} className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300">
                    {info.template ? <><LayoutTemplate className="h-3.5 w-3.5" />Browse ATS-friendly templates</> : <><ArrowRight className="h-3.5 w-3.5" />Go to {SECTION_LABEL(resume, info.section)}</>}
                  </button>
                </li>
              );
            })}
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
        <span className="text-[10.5px] text-slate-400 dark:text-zinc-500">Tap to open the exact place</span>
      </div>
      {/* Each fix is one button: it opens the builder at that section, entry or bullet. */}
      <ol className="space-y-1.5">
        {items.map((item, index) => {
          const where = item.target.template ? 'Templates' : item.source === 'grammar' ? locationLabel(item.target).join(' › ') : SECTION_LABEL(resume, item.target.section);
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
          <div className="relative flex-1"><div className="text-sm font-semibold text-slate-900 dark:text-zinc-50">Explain with <AnviWord /></div><div className="text-[11px] text-slate-500 dark:text-zinc-400">Your top three fixes in plain words, pointing to the exact place.</div></div>
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-violet-600 to-fuchsia-600 text-white shadow-[0_6px_16px_-6px_rgba(124,58,237,0.8)] transition group-hover:scale-110"><Sparkles className="h-4 w-4" /></span>
        </button>
      </div>
    );
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white dark:border-violet-900 dark:bg-slate-900">
      <div className="flex items-center gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-sky-50/60 px-4 py-3 dark:border-white/[0.06] dark:from-violet-500/10 dark:to-transparent">
        <AnviOrb size="h-9 w-9" busy={explain.status === 'running'} />
        <div className="flex-1"><div className="text-sm font-semibold text-slate-900 dark:text-zinc-50">ANVI</div><div className="text-[10.5px] text-slate-500 dark:text-zinc-400">{explain.status === 'running' ? 'Reading your check…' : 'Based on your scan results.'}</div></div>
        {explain.status !== 'running' ? <button type="button" onClick={check.runExplain} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-violet-700 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Explain again"><RefreshCw className="h-4 w-4" /></button> : null}
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

// ───────────── panel ─────────────

/** Counts up to `value` once (skipped with reduced motion). Non-numbers show as they are. */
function CountUp({ value }) {
  const reduce = useReducedMotion();
  const target = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState(target === null || reduce ? value : 0);
  useEffect(() => {
    if (target === null || reduce) { setShown(value); return undefined; }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 650);
      setShown(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, value, reduce]);
  return <>{shown}</>;
}

const TILE_TONES = {
  sky: { chip: 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20', chipOn: 'bg-sky-600 text-white ring-sky-600', ring: 'ring-sky-300 dark:ring-sky-400/50', hint: 'text-sky-700 dark:text-sky-300', bar: 'from-sky-400 to-sky-600' },
  violet: { chip: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20', chipOn: 'bg-violet-600 text-white ring-violet-600', ring: 'ring-violet-300 dark:ring-violet-400/50', hint: 'text-violet-700 dark:text-violet-300', bar: 'from-violet-400 to-violet-600' },
  fuchsia: { chip: 'bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20', chipOn: 'bg-fuchsia-600 text-white ring-fuchsia-600', ring: 'ring-fuchsia-300 dark:ring-fuchsia-400/50', hint: 'text-fuchsia-700 dark:text-fuchsia-300', bar: 'from-fuchsia-400 to-fuchsia-600' },
};

/** One result tile. It is a tab: it opens that part of the check. */
function CheckTile({ id, selected, onSelect, icon: Icon, label, value, unit, hint, tone, busy }) {
  const t = TILE_TONES[tone];
  return (
    <button type="button" role="tab" id={`anvi-tab-${id}`} aria-selected={selected} aria-controls="anvi-tab-panel" onClick={onSelect}
      className={`group relative flex min-w-0 flex-col rounded-xl bg-white px-2.5 pb-2 pt-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-12px_rgba(16,24,40,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-[#242424] ${selected ? `ring-2 ${t.ring}` : 'ring-black/[0.06] dark:ring-white/[0.07]'}`}>
      <span className="flex items-center gap-1.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors duration-200 ${selected ? t.chipOn : t.chip}`} aria-hidden="true">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />}
        </span>
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-zinc-400">{label}</span>
      </span>
      <span className="mt-2 flex items-baseline gap-1">
        <span className="text-[22px] font-bold leading-none tabular-nums tracking-[-0.02em] text-slate-950 dark:text-white"><CountUp value={value} /></span>
        {unit ? <span className="truncate text-[11px] font-medium text-slate-400 dark:text-zinc-500">{unit}</span> : null}
      </span>
      <span className={`mt-2 flex items-center gap-0.5 text-[11px] font-semibold ${t.hint}`}>
        <span className="truncate">{hint}</span><ChevronRight className="h-3 w-3 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      {selected ? <motion.span layoutId="anvi-tile-bar" className={`absolute inset-x-3 -bottom-[3px] h-[3px] rounded-full bg-gradient-to-r ${t.bar}`} transition={{ type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" /> : null}
    </button>
  );
}

/** Focuses the job description box once it is on screen. */
function focusJobBox() {
  let tries = 0;
  const attempt = () => {
    const box = document.getElementById('anvi-job-match');
    if (!box) { if (tries < 15) { tries += 1; setTimeout(attempt, 80); } return; }
    // Scroll inside the panel so the box sits just below the pinned result cards.
    const scroller = box.closest('.overflow-y-auto');
    const pinned = document.getElementById('anvi-tiles');
    if (scroller) {
      const offset = box.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: Math.max(0, offset - (pinned?.offsetHeight || 0) - 8), behavior: 'smooth' });
    } else box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box.querySelector('textarea')?.focus({ preventScroll: true });
  };
  setTimeout(attempt, 60);
}

/** `initialTab`: 'ats' | 'grammar' | 'job'. */
export default function ResumeCheckPanel({ check, resume, hasContent, onLocate, onBrowseTemplates, onClose = null, className = '', initialTab = 'ats' }) {
  const [tab, setTab] = useState(['ats', 'grammar', 'job'].includes(initialTab) ? initialTab : 'ats');
  const jobFocused = useRef(false);
  useEffect(() => {
    if (initialTab !== 'job' || jobFocused.current || !check.ats.report) return;
    jobFocused.current = true;
    focusJobBox();
  }, [initialTab, check.ats.report]);
  const templateName = getTemplate(resume.template).name;
  const { grammar, ats } = check;
  const showFirstRun = !check.hasResult && !check.running && grammar.status !== 'error' && ats.status !== 'error';
  const scanning = check.running && !check.hasResult;
  const top = useMemo(() => fixFirst({ report: ats.report, issues: check.visibleIssues, resume }), [ats.report, check.visibleIssues, resume]);
  const outdated = check.grammarOutdated || check.atsOutdated;
  const checkedAt = ats.checkedAt || grammar.checkedAt;
  const verdict = verdictFor(ats.report?.readinessScore);
  const failed = ats.report?.failedChecks.length ?? null;
  const issues = check.visibleIssues.length;
  const job = ats.report?.job || null;
  const selectTab = (key) => { setTab(key); if (key === 'job') focusJobBox(); };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <header className="relative flex items-center gap-3 border-b border-black/[0.06] bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-[#242424]">
        <AnviOrb size="h-9 w-9" busy={check.running} online={!check.running} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-950 dark:text-white"><AnviWord className="text-[16px]" /><span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Resume assistant</span></h2>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-zinc-400">{check.running ? 'Reading your resume…' : checkedAt ? <><Clock3 className="h-3 w-3" />Last check {timeAgo(checkedAt)}</> : <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Online · grammar, ATS readiness, job match</>}</p>
        </div>
        {check.hasResult ? <button type="button" onClick={() => check.runCheck()} disabled={check.running || !hasContent} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-400/25 dark:bg-white/[0.04] dark:text-violet-200 dark:hover:bg-white/[0.08]"><RefreshCw className={`h-3.5 w-3.5 ${check.running ? 'animate-spin' : ''}`} />Run again</button> : null}
        {onClose ? <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close check"><X className="h-4 w-4" /></button> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 [scrollbar-gutter:stable]">
        {showFirstRun ? <FirstRun onStart={() => check.runCheck()} templateName={templateName} disabled={!hasContent} /> : null}
        {scanning ? <Scanning check={check} templateName={templateName} /> : null}
        {!showFirstRun && !scanning ? (
          <div className="space-y-3">
            {outdated && !check.running ? (
              <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                <Clock3 className="h-4 w-4 shrink-0" /><span className="flex-1">You changed your resume after this check{check.atsOutdated && !check.grammarOutdated ? ' (or its template)' : ''}. Results may be out of date.</span>
                <button type="button" onClick={() => check.runCheck()} className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700">Run again</button>
              </div>
            ) : null}

            {/* Score: the engine's number, never changed by ANVI */}
            <section className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-1 ring-inset ring-black/[0.06] dark:bg-[#242424] dark:ring-white/[0.07]">
              {ats.report ? <AnviGauge score={ats.report.readinessScore} size={96} stroke={9} /> : <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">{ats.status === 'running' ? <Loader2 className="h-7 w-7 animate-spin text-violet-500" /> : <AlertTriangle className="h-7 w-7 text-rose-500" />}</span>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-slate-950 dark:text-white">ATS readiness</span>
                  {ats.report ? <VerdictPill score={ats.report.readinessScore} /> : <span className={`text-sm font-semibold ${TONES[verdict.tone].text}`}>{ats.status === 'running' ? 'Checking…' : 'Not available'}</span>}
                </div>
                {ats.report ? (
                  <>
                    <p className="mt-1.5 text-[12px] leading-5 text-slate-600 dark:text-zinc-300"><b className="font-semibold text-slate-900 dark:text-white">{ats.report.checksPassed} of {ats.report.checksTotal}</b> checks passed on your PDF in {templateName}.</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]" aria-hidden="true"><motion.div initial={{ width: 0 }} animate={{ width: `${(ats.report.checksPassed / Math.max(1, ats.report.checksTotal)) * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-500 to-fuchsia-500" /></div>
                    <p className="mt-2 flex items-center gap-1 text-[10.5px] text-slate-400 dark:text-zinc-500"><ShieldCheck className="h-3 w-3" />Open rule-based engine. ANVI explains the score, never changes it.</p>
                  </>
                ) : <p className="mt-1.5 text-[12px] text-slate-500">The ATS read did not finish.</p>}
              </div>
            </section>

            <FixFirst items={top} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} />
            <ExplainCard check={check} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} />

            {/* The three results double as tabs, and stay on screen while you scroll. */}
            <div id="anvi-tiles" className="sticky top-0 z-10 -mx-4 bg-[#f6f7f9]/95 px-4 pb-3 pt-2 backdrop-blur dark:bg-[#1c1c1c]/95">
              <div className="mb-2 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500"><span>Details</span><span className="normal-case tracking-normal">Tap a card to open it</span></div>
              <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Check details">
                <CheckTile id="ats" selected={tab === 'ats'} onSelect={() => selectTab('ats')} icon={ScanText} tone="sky" label="ATS checks"
                  value={failed ?? '–'} unit={failed === null ? '' : failed === 0 ? 'all passed' : 'to fix'} hint={failed ? 'View checks' : 'See report'} busy={ats.status === 'running'} />
                <CheckTile id="grammar" selected={tab === 'grammar'} onSelect={() => selectTab('grammar')} icon={SpellCheck2} tone="violet" label="Grammar"
                  value={grammar.status === 'running' ? '…' : issues} unit={issues === 1 ? 'issue' : 'issues'} hint={issues ? 'Review fixes' : 'All clear'} busy={grammar.status === 'running'} />
                <CheckTile id="job" selected={tab === 'job'} onSelect={() => selectTab('job')} icon={Briefcase} tone="fuchsia" label="Job match"
                  value={job ? (job.score ?? '–') : '–'} unit={job ? '/100' : ''} hint={job ? 'See match' : 'Add a job'} />
              </div>
            </div>

            <motion.div key={tab} id="anvi-tab-panel" role="tabpanel" aria-labelledby={`anvi-tab-${tab}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              {tab === 'ats' ? <AtsTab check={check} resume={resume} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} /> : null}
              {tab === 'grammar' ? <GrammarTab check={check} resume={resume} onLocate={onLocate} /> : null}
              {tab === 'job' ? (ats.report ? <JobMatch check={check} /> : <ErrorCard message="Job match needs the ATS read. Run the check again." onRetry={() => check.runCheck({ only: 'ats' })} />) : null}
            </motion.div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
