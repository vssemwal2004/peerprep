// Prep Resume hub: two clear paths. Create resume (the builder, where your
// details live) and Your resume (the finished resume, checked by ANVI).
// Follows the student pages' look (Prep Mock / dashboard): neutral cards that
// follow light and dark theme, sky for actions, violet for ANVI.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUp, CheckCircle2, Circle, Clock3, Download, FileText, HelpCircle, LayoutTemplate, ListChecks, PencilLine, RefreshCw, ScanText, ShieldCheck, Sparkles, SpellCheck2, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageGuideButton from '../../guide/platform/PageGuideButton';
import { ResumeThumbnail } from '../../features/resume/ResumePreview';
import { FIXED_SECTION_META, calculateReadiness, hasResumeContent, normalizeClientResume, visibleSectionKeys } from '../../features/resume/resumeUtils';
import { AnviAura, AnviGauge, AnviMessage, AnviOrb, AnviWord, QuickReplies, TypingDots, useTyping, VerdictPill } from '../../features/resume/review/AnviVisuals';
import { readLastCheck } from '../../features/resume/review/useResumeCheck';
import { atsSignature } from '../../features/resume/review/reviewModel';
import { RESUME_TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, getTemplate } from '../../features/resume/templates/catalog';
import { sampleResumeFor } from '../../features/resume/templates/sampleResume';
import { card, focusRing, SectionHeader, Skeleton } from '../dashboard/ui';
import { api } from '../../utils/api';
import RequirePasswordChange from '../RequirePasswordChange';

const SECTIONS = [['basics', 'Basic details'], ...Object.entries(FIXED_SECTION_META).map(([key, meta]) => [key, meta.label])];
const TEMPLATE_PICKS = ['harvard', 'aurora', 'timeline', 'emerald', 'peerprep-circuit'];
const CATEGORY_LABEL = Object.fromEntries(TEMPLATE_CATEGORIES.map((item) => [item.id, item.label]));

const ago = (iso) => {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return minutes < 1 ? 'just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

/* ─────────────────────────────── small parts ─────────────────────────────── */

/** Hand-drawn stroke under the coloured word, the student pages' title motif. */
function TitleUnderline() {
  return <svg viewBox="0 0 200 16" preserveAspectRatio="none" fill="none" aria-hidden="true" className="pointer-events-none absolute -bottom-2.5 left-0 h-3 w-full overflow-visible text-sky-400 dark:text-sky-500">
    <path d="M4 11.5C52 5.5 118 3.2 196 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" pathLength="1" className="dashboard-underline" />
  </svg>;
}

function CompletionMedal({ percent, loading }) {
  const radius = 40;
  const ring = 2 * Math.PI * radius;
  const share = Math.max(0, Math.min(1, (percent || 0) / 100));
  return (
    <div className="relative h-[104px] w-[104px] shrink-0" role="img" aria-label={`Resume ${percent}% complete`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <defs><linearGradient id="presume-medal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#0369a1" /></linearGradient></defs>
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-sky-100 dark:stroke-white/[0.07]" />
        {share > 0 && !loading && <motion.circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" strokeLinecap="round" stroke="url(#presume-medal)" strokeDasharray={ring} initial={{ strokeDashoffset: ring }} animate={{ strokeDashoffset: ring * (1 - share) }} transition={{ duration: 0.9, ease: 'easeOut' }} />}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="text-[24px] font-bold leading-none tabular-nums tracking-[-0.03em] text-slate-950 dark:text-white">{loading ? '–' : percent}<span className="text-[13px] font-semibold text-slate-400 dark:text-zinc-500">%</span></span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-zinc-400">ready</span>
      </span>
    </div>
  );
}

function Stat({ label, value, detail, className = '' }) {
  return (
    <div className={`min-w-0 border-black/[0.05] px-4 py-3 sm:px-5 dark:border-white/[0.06] ${className}`}>
      <dt className="text-[11.5px] text-slate-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-[18px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">
        <span className="truncate">{value}</span>{detail ? <span className="shrink-0 truncate text-[12px] font-medium text-slate-400 dark:text-zinc-500">{detail}</span> : null}
      </dd>
    </div>
  );
}

function AtsBadge() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/15"><ShieldCheck className="h-3 w-3" aria-hidden="true" />ATS-friendly</span>;
}

/** The student's own details in three templates, fanned: one resume, any design. */
function TemplateFan({ resume, currentId, report, stale, loading }) {
  const ids = useMemo(() => [currentId, ...['aurora', 'emerald', 'timeline', 'harvard'].filter((id) => id !== currentId)].slice(0, 3), [currentId]);
  const sheets = useMemo(() => ids.map((id) => ({ id, data: { ...resume, template: id } })), [ids, resume]);
  // sheets[0] is the student's template (front, centre); 1 fans left, 2 fans right.
  const poses = [
    'z-10 -translate-y-2 group-hover/fan:-translate-y-4',
    '-translate-x-[92px] rotate-[-9deg] group-hover/fan:-translate-x-[118px] group-hover/fan:rotate-[-13deg]',
    'translate-x-[92px] rotate-[9deg] group-hover/fan:translate-x-[118px] group-hover/fan:rotate-[13deg]',
  ];
  return (
    <div className="group/fan relative hidden h-[200px] w-[330px] shrink-0 md:block" aria-hidden="true">
      {[1, 2, 0].map((slot) => {
        const sheet = sheets[slot];
        if (!sheet) return null;
        return (
          <div key={sheet.id} className={`absolute left-1/2 top-3 -ml-[64px] overflow-hidden rounded-[4px] bg-white shadow-[0_20px_40px_-20px_rgba(15,23,42,0.55)] ring-1 ring-black/[0.06] transition-transform duration-500 ease-out ${poses[slot]}`}>
            {loading ? <div className="h-[181px] w-[128px] animate-pulse bg-white" /> : <ResumeThumbnail resume={sheet.data} width={128} />}
          </div>
        );
      })}
      <span className="absolute -right-1 top-1 z-20 inline-flex items-center gap-2 rounded-2xl bg-white/90 px-2.5 py-1.5 shadow-[0_12px_30px_-14px_rgba(76,29,149,0.5)] ring-1 ring-violet-100 backdrop-blur dark:bg-[#2a2a2a]/90 dark:ring-violet-400/20">
        <AnviOrb size={26} />
        <span className="leading-tight"><span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500">ATS</span><span className="block text-[14px] font-bold tabular-nums text-slate-900 dark:text-white">{report && !stale ? `${report.readinessScore}/100` : report ? 'Re-check' : 'Not checked'}</span></span>
      </span>
      <span className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-[10.5px] font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-900">Same details · {RESUME_TEMPLATE_CATALOG.length} designs</span>
    </div>
  );
}

function StepTag({ number, tone }) {
  const tones = { sky: 'text-sky-700 bg-sky-50 ring-sky-100 dark:text-sky-300 dark:bg-sky-500/10 dark:ring-sky-400/15', violet: 'text-violet-700 bg-violet-50 ring-violet-100 dark:text-violet-300 dark:bg-violet-500/10 dark:ring-violet-400/15' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] ring-1 ring-inset ${tones[tone]}`}>Step {number}</span>;
}

/** A resume sheet on a dotted desk, with a second sheet behind it. Never clipped. */
function PaperStage({ resume, loading, sample, templateName }) {
  return (
    <div className="relative flex h-full min-h-[300px] items-center justify-center overflow-hidden bg-[#f3f5f8] bg-[radial-gradient(rgba(15,23,42,0.07)_1px,transparent_1px)] [background-size:14px_14px] dark:bg-[#1e1e1e] dark:bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)]">
      <div className="pointer-events-none absolute h-[249px] w-[176px] translate-x-3 translate-y-2 rotate-[5deg] rounded-[4px] bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] dark:bg-zinc-200" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[4px] bg-white shadow-[0_22px_44px_-22px_rgba(15,23,42,0.55)] ring-1 ring-black/[0.06] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_28px_50px_-22px_rgba(15,23,42,0.6)]">
        {loading ? <div className="h-[249px] w-[176px] animate-pulse bg-white" /> : <ResumeThumbnail resume={resume} width={176} />}
      </div>
      <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold text-slate-600 shadow-sm ring-1 ring-black/[0.05] backdrop-blur dark:bg-[#2a2a2a]/90 dark:text-zinc-300 dark:ring-white/[0.08]">
        <LayoutTemplate className="h-3 w-3" aria-hidden="true" />{sample ? `${templateName} · sample` : templateName}
      </span>
    </div>
  );
}

/* ─────────────────────────────── the two paths ─────────────────────────────── */

function CreateCard({ loading, hasContent, readiness, filled, template, thumb, onOpen, onTemplates }) {
  return (
    <motion.article data-guide="pr-create" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`group relative grid overflow-hidden sm:grid-cols-[minmax(0,1fr)_210px] xl:grid-cols-[minmax(0,1fr)_230px] ${card} transition-[border-color,box-shadow] duration-200 hover:border-sky-200 hover:shadow-[0_18px_40px_-26px_rgba(2,132,199,0.45)] dark:hover:border-sky-400/25`}>
      <div className="flex min-w-0 flex-col p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-[0_8px_18px_-8px_rgba(2,132,199,0.8)]" aria-hidden="true"><PencilLine className="h-5 w-5" strokeWidth={1.9} /></span>
          <StepTag number={1} tone="sky" />
        </div>
        <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-zinc-50">{hasContent ? 'Edit your resume' : 'Create your resume'}</h2>
        <p className="mt-1.5 text-[13.5px] leading-6 text-slate-500 dark:text-zinc-400">Add your details once. Every template reads the same details, so switching designs never loses anything.</p>

        <div className="mt-5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-slate-700 dark:text-zinc-200">{loading ? 'Loading…' : `${filled.size} of ${SECTIONS.length} sections filled`}</span>
            <span className="tabular-nums text-slate-500 dark:text-zinc-400">{loading ? '' : `${readiness.percent}%`}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef0f3] dark:bg-white/[0.08]"><motion.div initial={{ width: 0 }} animate={{ width: `${loading ? 0 : readiness.percent}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} className="h-full rounded-full bg-sky-500" /></div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {SECTIONS.map(([key, label]) => {
              const done = filled.has(key);
              return <li key={key} className={`flex min-w-0 items-center gap-2 text-[12.5px] ${done ? 'text-slate-700 dark:text-zinc-200' : 'text-slate-400 dark:text-zinc-500'}`}>
                {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300 dark:text-zinc-600" aria-hidden="true" />}
                <span className="truncate">{label}</span><span className="sr-only">{done ? ' (filled)' : ' (empty)'}</span>
              </li>;
            })}
          </ul>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
          <button type="button" onClick={onOpen} className={`inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(2,132,199,0.9)] transition hover:bg-sky-700 ${focusRing}`}>
            {hasContent ? 'Continue editing' : 'Start building'}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={onTemplates} className={`inline-flex h-10 items-center gap-2 rounded-xl border border-[#e3e5ea] bg-white px-3.5 text-[13px] font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700 dark:border-white/[0.1] dark:bg-transparent dark:text-zinc-200 dark:hover:border-sky-400/30 dark:hover:text-sky-300 ${focusRing}`}>
            <LayoutTemplate className="h-4 w-4" aria-hidden="true" />{RESUME_TEMPLATE_CATALOG.length} templates
          </button>
        </div>
      </div>
      <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden="true" className="hidden border-l border-[#eef0f3] sm:block dark:border-white/[0.06]">
        <PaperStage resume={thumb} loading={loading} sample={!hasContent} templateName={template.name} />
      </button>
    </motion.article>
  );
}

/** One honest line from ANVI, built only from the last check's numbers. */
function anviSays({ report, grammarCount, stale, hasContent }) {
  if (!report) return hasContent ? 'Ready when you are. One check reads your PDF like an ATS and every line for grammar.' : 'Add your details first, then I can read your resume.';
  if (stale) return 'You edited your resume after my last check. Run it again for a fresh score.';
  const failed = report.failedChecks?.length || 0;
  if (report.readinessScore < 70) return `${failed} ATS ${failed === 1 ? 'check is' : 'checks are'} costing you points. Open your resume to see what to fix first, and where.`;
  if (grammarCount) return `${grammarCount} grammar and spelling ${grammarCount === 1 ? 'slip' : 'slips'} left. Each one has a one-click fix.`;
  if (!report.job) return 'Looking strong. Paste a job description to see how well you match it.';
  return 'Looking strong. Check the missing skills in your job match before you apply.';
}

/** A user's question, shown on the right like a sent message. */
function UserBubble({ children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex justify-end pl-12">
      <span className="rounded-2xl rounded-br-md bg-sky-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_6px_16px_-10px_rgba(2,132,199,0.9)]">{children}</span>
    </motion.div>
  );
}

function ResultTile({ label, value, detail, tone }) {
  const tones = {
    sky: 'bg-sky-50/80 ring-sky-100 dark:bg-sky-500/[0.07] dark:ring-sky-400/15',
    violet: 'bg-violet-50/80 ring-violet-100 dark:bg-violet-500/[0.07] dark:ring-violet-400/15',
    fuchsia: 'bg-fuchsia-50/80 ring-fuchsia-100 dark:bg-fuchsia-500/[0.07] dark:ring-fuchsia-400/15',
  };
  return (
    <div className={`min-w-0 rounded-xl px-2.5 py-2 ring-1 ring-inset ${tones[tone]}`}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 truncate text-[17px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{value}<span className="ml-0.5 text-[11px] font-medium text-slate-400 dark:text-zinc-500">{detail}</span></div>
    </div>
  );
}

/** The last check, as a result card inside ANVI's message. */
function ResultCard({ report, grammarCount, checkedAt, stale }) {
  const jobScore = report.job ? report.job.score : null;
  return (
    <div className="-mx-1 mt-1">
      <div className="flex items-center gap-3.5">
        <AnviGauge score={report.readinessScore} size={84} stroke={8} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold text-slate-900 dark:text-white">ATS readiness</span><VerdictPill score={report.readinessScore} /></div>
          {report.checksTotal ? <div className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400"><b className="font-semibold text-slate-800 dark:text-zinc-100">{report.checksPassed} of {report.checksTotal}</b> ATS checks passed</div> : null}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500">
            <Clock3 className="h-3 w-3" aria-hidden="true" />Checked {ago(checkedAt)}
            {stale ? <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">edited since</span> : null}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ResultTile label="ATS score" value={report.readinessScore} detail="/100" tone="sky" />
        <ResultTile label="Grammar" value={grammarCount === null ? '–' : grammarCount} detail={grammarCount === null ? '' : grammarCount === 1 ? ' issue' : ' issues'} tone="violet" />
        <ResultTile label="Job match" value={jobScore ?? '–'} detail={jobScore === null || jobScore === undefined ? '' : '/100'} tone="fuchsia" />
      </div>
    </div>
  );
}

const CHECKS_LIST = [
  [ScanText, 'ATS readiness out of 100', 'I export your PDF and read it like recruiter software: headings, layout, contacts, dates, 35 rules.'],
  [SpellCheck2, 'Grammar and spelling', 'Every bullet and title, with the exact words to change and a one-click fix.'],
  [Target, 'Job match', 'Paste a job description and I list the requirements you meet and the skills missing.'],
];

/**
 * Step 2 as ANVI's assistant panel: a short conversation built only from the
 * last check's numbers, suggested replies that open the right place, and a
 * message bar that opens the full check.
 */
function ReviewCard({ hasContent, report, grammarCount, checkedAt, stale, firstName, templateName, navigate }) {
  const typing = useTyping(700);
  const [asked, setAsked] = useState(false);
  const open = (query = '') => navigate(`/student/resume/review${query}`);
  const greeting = firstName ? `Hi ${firstName}.` : 'Hi.';
  const message = anviSays({ report, grammarCount, stale, hasContent });

  let replies;
  if (!hasContent) {
    replies = [{ label: 'Start building', icon: PencilLine, primary: true, onClick: () => navigate('/student/resume/create') }];
  } else if (!report) {
    replies = [
      { label: 'Check my resume', icon: Sparkles, primary: true, onClick: () => open('?run=1') },
      ...(asked ? [] : [{ label: 'What do you check?', icon: HelpCircle, onClick: () => setAsked(true) }]),
      { label: 'Match me to a job', icon: Target, onClick: () => open('?run=1&tab=job') },
    ];
  } else {
    replies = [
      ...(stale ? [{ label: 'Check again', icon: RefreshCw, primary: true, onClick: () => open('?run=1') }] : []),
      { label: 'What should I fix first?', icon: ListChecks, primary: !stale, onClick: () => open() },
      ...(grammarCount ? [{ label: `Fix ${grammarCount} grammar ${grammarCount === 1 ? 'issue' : 'issues'}`, icon: SpellCheck2, onClick: () => open('?tab=grammar') }] : []),
      { label: report.job ? 'See job match' : 'Match me to a job', icon: Target, onClick: () => open('?tab=job') },
    ];
  }

  return (
    <motion.div data-guide="pr-review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="h-full">
      <AnviAura radius="1rem" className="h-full" innerClassName="flex h-full flex-col">
        {/* Assistant header */}
        <header className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-3.5 dark:border-white/[0.06]">
          <AnviOrb size={42} online />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><AnviWord className="text-[19px] leading-none" /><span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Resume assistant</span></div>
            <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-zinc-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />Online · checks ATS readiness, grammar and job match</div>
          </div>
          <StepTag number={2} tone="violet" />
        </header>

        {/* Conversation */}
        <div className="anvi-thread flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5" aria-live="polite">
          {typing ? (
            <div className="flex items-end gap-2"><AnviOrb size={28} /><TypingDots /></div>
          ) : (
            <>
              <AnviMessage>
                {report
                  ? <>{greeting} I read your resume in <b className="font-semibold text-slate-900 dark:text-white">{templateName}</b>. Here is where it stands:<ResultCard report={report} grammarCount={grammarCount} checkedAt={checkedAt} stale={stale} /></>
                  : <>{greeting} I’m <AnviWord />, your resume assistant. I read your resume the way recruiters and their software do, then tell you what to fix first, and where.</>}
              </AnviMessage>
              <AnviMessage avatar={false} delay={0.12}>{message}</AnviMessage>
              {asked ? (
                <>
                  <UserBubble>What do you check?</UserBubble>
                  <AnviMessage delay={0.1}>
                    <ul className="space-y-2.5">
                      {CHECKS_LIST.map(([Icon, title, text]) => (
                        <li key={title} className="flex gap-2.5">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/15" aria-hidden="true"><Icon className="h-3.5 w-3.5" /></span>
                          <div className="min-w-0"><div className="text-[12.5px] font-semibold text-slate-900 dark:text-white">{title}</div><p className="text-[12px] leading-[1.45] text-slate-500 dark:text-zinc-400">{text}</p></div>
                        </li>
                      ))}
                    </ul>
                  </AnviMessage>
                </>
              ) : null}
              <div className="mt-auto pt-1"><QuickReplies items={replies} delay={0.22} /></div>
            </>
          )}
        </div>

        {/* Message bar: opens the full check */}
        <div className="border-t border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
          <button type="button" onClick={() => (hasContent ? open(report ? '' : '?run=1') : navigate('/student/resume/create'))} className={`group flex w-full items-center gap-3 rounded-xl border border-[#e3e5ea] bg-white py-1.5 pl-3.5 pr-1.5 text-left transition hover:border-violet-300 hover:shadow-[0_8px_20px_-14px_rgba(124,58,237,0.6)] dark:border-white/[0.1] dark:bg-white/[0.03] dark:hover:border-violet-400/40 ${focusRing}`}>
            <Sparkles className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500 dark:text-zinc-400">{!hasContent ? 'Add your details, then ask ANVI to check them' : report ? 'Open your resume with ANVI’s full check' : 'Ask ANVI to check your resume'}</span>
            <span className="anvi-button flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" aria-hidden="true"><ArrowUp className="h-4 w-4 transition group-hover:-translate-y-0.5" /></span>
          </button>
          <p className="mt-2 text-center text-[10.5px] text-slate-400 dark:text-zinc-500">The ATS score comes from an open, rule-based engine. ANVI explains it and never changes it.</p>
        </div>
      </AnviAura>
    </motion.div>
  );
}

/* ─────────────────────────────── lower sections ─────────────────────────────── */

const FLOW = [
  [PencilLine, 'Add your details', 'Education, projects, skills: once.'],
  [LayoutTemplate, 'Pick a template', `${RESUME_TEMPLATE_CATALOG.length} designs, switch any time.`],
  [Sparkles, 'Check with ANVI', 'ATS, grammar and job match.'],
  [Download, 'Download the PDF', 'Exactly what the preview shows.'],
];

function HowItWorks() {
  return (
    <section data-guide="pr-how" aria-labelledby="pr-how-title" className="mt-9">
      <SectionHeader id="pr-how-title" title="How it works" />
      <ol className={`grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4 ${card} bg-[#eef0f3] dark:bg-white/[0.06]`}>
        {FLOW.map(([Icon, title, text], index) => (
          <li key={title} className="relative flex items-start gap-3 bg-white p-4 dark:bg-[#242424]">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset ${index === 2 ? 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/15' : 'bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/15'}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500">0{index + 1}</div>
              <div className="text-[13.5px] font-semibold text-slate-900 dark:text-zinc-50">{title}</div>
              <p className="mt-0.5 text-[12px] leading-5 text-slate-500 dark:text-zinc-400">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TemplatePicks({ onPick, onAll }) {
  const picks = useMemo(() => TEMPLATE_PICKS.map((id) => getTemplate(id)).filter((item, index, list) => item && list.findIndex((other) => other.id === item.id) === index), []);
  const samples = useMemo(() => Object.fromEntries(picks.map((item) => [item.id, sampleResumeFor(item.id)])), [picks]);
  return (
    <section aria-labelledby="pr-picks-title" className="mt-9">
      <SectionHeader id="pr-picks-title" title="Template picks" action={
        <button type="button" onClick={onAll} className={`inline-flex shrink-0 items-center gap-1 rounded text-[12.5px] font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 ${focusRing}`}>See all {RESUME_TEMPLATE_CATALOG.length}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
      } />
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {picks.map((item) => (
          <button key={item.id} type="button" onClick={() => onPick(item.id)} className={`group/pick flex w-[180px] shrink-0 snap-start flex-col overflow-hidden text-left sm:w-auto ${card} transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_14px_30px_-22px_rgba(16,24,40,0.4)] dark:hover:border-sky-400/25 ${focusRing}`}>
            <span className="flex justify-center overflow-hidden bg-[#f3f5f8] px-4 pt-4 dark:bg-[#1e1e1e]">
              <span className="block h-[150px] overflow-hidden rounded-t-[3px] shadow-[0_10px_24px_-14px_rgba(15,23,42,0.5)] ring-1 ring-black/[0.05] transition duration-300 group-hover/pick:-translate-y-0.5">
                <ResumeThumbnail resume={samples[item.id]} width={150} />
              </span>
            </span>
            <span className="flex flex-col gap-1 border-t border-[#eef0f3] px-3 py-2.5 dark:border-white/[0.06]">
              <span className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-50">{item.name}</span>{item.ats ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="ATS-friendly" /> : null}</span>
              <span className="truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{CATEGORY_LABEL[item.category] || item.category}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────── page ─────────────────────────────── */

export default function PrepResumeHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    api.getMyResume().then((result) => live && setResume(normalizeClientResume(result?.resume))).catch(() => live && setResume(normalizeClientResume({}))).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const lastCheck = useMemo(() => readLastCheck(user?._id || user?.id), [user]);
  const hasContent = resume ? hasResumeContent(resume) : false;
  const thumb = resume && hasContent ? resume : sampleResumeFor(resume?.template);
  const readiness = useMemo(() => (resume ? calculateReadiness(resume) : { percent: 0 }), [resume]);
  const filled = useMemo(() => {
    if (!resume) return new Set();
    const keys = new Set(visibleSectionKeys(resume).filter((key) => SECTIONS.some(([id]) => id === key)));
    if (Object.values(resume.basics || {}).some(Boolean)) keys.add('basics');
    return keys;
  }, [resume]);
  const template = getTemplate(resume?.template);
  const report = lastCheck?.ats?.report || null;
  const grammarCount = lastCheck?.grammar?.issues ? lastCheck.grammar.issues.filter((item) => !(lastCheck.ignored || []).includes(item.ignoreKey)).length : null;
  const checkedAt = lastCheck?.ats?.checkedAt || lastCheck?.grammar?.checkedAt;
  const stale = Boolean(report && resume && lastCheck.ats.signature !== atsSignature(resume));
  const firstName = String(user?.name || '').trim().split(/\s+/)[0];

  const openBuilder = () => navigate('/student/resume/create');
  const openTemplates = (id = '1') => navigate(`/student/resume/create?templates=${encodeURIComponent(id)}`);

  return (
    <RequirePasswordChange user={user}>
      <div className="min-h-full bg-[#f6f7f9] pb-12 font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
        <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {/* Hero: what this is, and where the student stands */}
          <section data-guide="pr-header" aria-labelledby="pr-title" className="relative overflow-hidden rounded-3xl border border-[#e4ecf4] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(14,165,233,0.13),transparent_65%),radial-gradient(45%_90%_at_100%_0%,rgba(139,92,246,0.10),transparent_65%)]" aria-hidden="true" />
            <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.13em] text-sky-700 dark:text-sky-300"><FileText className="h-4 w-4" aria-hidden="true" />Placement resume</p>
                <h1 id="pr-title" className="mt-1.5 text-[30px] font-medium leading-tight tracking-[-0.03em] text-slate-900 sm:text-[34px] dark:text-zinc-50">
                  Prep <span className="relative inline-block font-bold text-sky-600 dark:text-sky-400">Resume<TitleUnderline /></span>
                  <PageGuideButton className="ml-3 align-middle" />
                </h1>
                <p className="mt-3 max-w-xl text-[14px] leading-6 text-slate-500 dark:text-zinc-400">
                  {firstName ? `${firstName}, build` : 'Build'} your resume once, switch between {RESUME_TEMPLATE_CATALOG.length} professional templates, and let ANVI check it the way recruiters and their software read it.
                </p>
              </div>
              <div className="md:hidden"><CompletionMedal percent={readiness.percent} loading={loading} /></div>
              <TemplateFan resume={thumb} currentId={template.id} report={report} stale={stale} loading={loading} />
            </div>
            <dl className="relative grid grid-cols-2 border-t border-black/[0.05] bg-white/55 backdrop-blur sm:grid-cols-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <Stat label="Sections filled" value={loading ? '–' : filled.size} detail={`of ${SECTIONS.length}`} />
              <Stat label="Template" value={loading ? '–' : template.name} detail={!loading && template.ats ? <AtsBadge /> : ''} className="border-l" />
              <Stat label="ATS readiness" value={report ? report.readinessScore : '–'} detail={report ? `/100${stale ? ' · edited since' : ''}` : 'not checked'} className="border-t sm:border-l sm:border-t-0" />
              <Stat label="Grammar & spelling" value={grammarCount === null ? '–' : grammarCount} detail={grammarCount === null ? 'not checked' : grammarCount === 1 ? 'issue' : 'issues'} className="border-l border-t sm:border-t-0" />
            </dl>
          </section>

          {/* The two paths */}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {loading && !resume ? <><Skeleton className="h-[380px] rounded-2xl" /><Skeleton className="h-[380px] rounded-2xl" /></> : (
              <>
                <CreateCard loading={loading} hasContent={hasContent} readiness={readiness} filled={filled} template={template} thumb={thumb} onOpen={openBuilder} onTemplates={() => openTemplates()} />
                <ReviewCard hasContent={hasContent} report={report} grammarCount={grammarCount} checkedAt={checkedAt} stale={stale} firstName={firstName} templateName={getTemplate(lastCheck?.ats?.template || resume?.template).name} navigate={navigate} />
              </>
            )}
          </div>

          <HowItWorks />
          <TemplatePicks onPick={(id) => openTemplates(id)} onAll={() => openTemplates()} />

          <p className="mt-6 flex items-start gap-1.5 text-[11.5px] leading-5 text-slate-500 dark:text-zinc-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />The ATS score comes from an open, rule-based engine, so the same resume always gets the same score. ANVI explains it and never changes it. Grammar runs on your device; your PDF is read once and not stored.</p>
        </div>
      </div>
    </RequirePasswordChange>
  );
}
