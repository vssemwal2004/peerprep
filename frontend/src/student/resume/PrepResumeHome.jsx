import { useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { ArrowRight, Check, Download, FileUp, GraduationCap, LayoutTemplate, ListChecks, PencilLine, ScanText, ShieldCheck, Sparkles, Target, UserRound, Wrench, BriefcaseBusiness } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageGuideButton from '../../guide/platform/PageGuideButton';
import { ResumeThumbnail } from '../../features/resume/ResumePreview';
import { getResumeRequirements, normalizeClientResume } from '../../features/resume/resumeUtils';
import { AnviAura, AnviOrb, AnviWord } from '../../features/resume/review/AnviVisuals';
import { readLastCheck } from '../../features/resume/review/useResumeCheck';
import { atsSignature } from '../../features/resume/review/reviewModel';
import { RESUME_TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, getTemplate } from '../../features/resume/templates/catalog';
import { sampleResumeFor } from '../../features/resume/templates/sampleResume';
import { card, focusRing, SectionHeader, Skeleton } from '../dashboard/ui';
import { api } from '../../utils/api';
import RequirePasswordChange from '../RequirePasswordChange';

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

/** The student's own details in three templates, fanned: one resume, any design. */
function TemplateFan({ resume, currentId, loading }) {
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
    </div>
  );
}

const essentials = [
  { label: 'Contact details', ids: ['name', 'contact'], Icon: UserRound, section: 'basics' },
  { label: 'Education', ids: ['degree', 'institute'], Icon: GraduationCap, section: 'education' },
  { label: 'Skills', ids: ['skills'], Icon: Wrench, section: 'skills' },
  { label: 'Project or experience', ids: ['work-title', 'work-bullet'], Icon: BriefcaseBusiness, section: 'projects' },
];

function EssentialsCard({ requirements, hasDraft, onEdit }) {
  return <section className={card + ' p-5 sm:p-6'} aria-labelledby="resume-essentials">
    <div className="flex items-center justify-between gap-3">
      <h2 id="resume-essentials" className="text-lg font-semibold tracking-tight">Résumé essentials</h2>
      {hasDraft && <span className="text-sm font-semibold tabular-nums text-sky-700 dark:text-sky-300">{requirements.complete} / {requirements.total}</span>}
    </div>
    <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{!hasDraft ? 'What you’ll need for your first ATS check.' : requirements.ready ? 'Your draft has the details needed for an ATS check.' : requirements.missing.length + ' details to finish before your ATS check.'}</p>
    <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/[.06]">
      {essentials.map(({ label, ids, Icon, section }) => {
        const remaining = requirements.missing.filter(item => ids.includes(item.id));
        const next = remaining[0];
        return <li key={section}><button type="button" onClick={() => onEdit(next || { section })} className={'flex w-full items-center gap-3 rounded-md py-2.5 text-left hover:text-sky-700 dark:hover:text-sky-300 ' + focusRing}>
          <Icon size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span>
            {hasDraft && next && <span className="block text-xs text-slate-500 dark:text-zinc-400">{next.label}</span>}
          </span>
          {hasDraft && !next ? <Check size={16} aria-label="Complete" className="text-emerald-600" /> : <ArrowRight size={15} aria-hidden="true" className="text-slate-400" />}
        </button></li>;
      })}
    </ul>
  </section>;
}

function ReviewCard({ ready, report, stale, hasDraft, open, onFirstMissing }) {
  const options = [
    { label: !ready ? 'Finish missing details' : report ? 'What should I fix first?' : stale ? 'Recheck my résumé' : 'Check my résumé', Icon: ScanText, onClick: () => ready ? open(report ? '?action=fixes' : '?run=1') : onFirstMissing() },
    { label: 'Improve a bullet', Icon: PencilLine, onClick: () => open('?action=rewrite') },
    { label: 'Check my writing', Icon: ListChecks, onClick: () => open('?tab=grammar') },
    { label: 'Match a job', Icon: Target, onClick: () => open('?tab=job') },
  ];
  return <section data-guide="pr-review" aria-label="Ask ANVI" className="h-full">
    <AnviAura className="h-full" innerClassName="h-full p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,.12),transparent_56%)]" />
      <div className="relative flex items-center gap-3"><AnviOrb size={48} /><div>
        <h2 className="text-xl font-semibold tracking-tight">Ask <AnviWord /></h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-zinc-400">Your résumé review</p>
      </div></div>
      <p className="relative mt-4 text-sm leading-6 text-slate-600 dark:text-zinc-300">{report ? 'Your latest PDF scored ' + report.readinessScore + '/100 on the ATS check. Open your feedback to see what to improve.' : stale ? 'Your draft has changed. Run a fresh check on the latest version.' : hasDraft ? 'Review your writing, improve a bullet or compare your skills with a job description.' : 'Add your résumé to get feedback on its content, writing and PDF layout.'}</p>
      {!hasDraft ? <ul className="relative mt-4 grid gap-x-4 gap-y-2.5 text-[13px] text-slate-600 sm:grid-cols-2 dark:text-zinc-300">
        {[[ScanText, 'PDF readability'], [PencilLine, 'Bullet rewrites'], [ListChecks, 'Grammar and spelling'], [Target, 'Job matching']].map(([Icon, label]) => <li key={label} className="flex items-center gap-2"><Icon size={16} className="text-violet-600 dark:text-violet-300" />{label}</li>)}
      </ul> : <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
        {options.map(({ label, Icon, onClick }) => <button type="button" key={label} onClick={onClick} className={'group flex min-h-12 items-center gap-2.5 rounded-xl border border-violet-100 bg-white/80 px-3 py-2.5 text-left text-[13px] font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-violet-400/20 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-violet-500/10 ' + focusRing}>
          <Icon size={16} className="shrink-0 text-violet-600 dark:text-violet-300" /><span className="flex-1">{label}</span><ArrowRight size={13} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </button>)}
      </div>}
    </AnviAura>
  </section>;
}

const FLOW = [
  [FileUp, 'Add your résumé', 'Upload a PDF or Word file, or start from scratch.'],
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
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError('');
    api.getMyResume().then(({ resume: draft }) => {
      if (live) setResume(normalizeClientResume(draft));
    }).catch(() => {
      if (live) setLoadError('Your draft could not be loaded.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [attempt, user?._id, user?.id]);

  const hasDraft = Boolean(resume?.exists);
  const requirements = getResumeRequirements(hasDraft ? resume : {});
  const last = useMemo(() => readLastCheck(user?._id || user?.id), [user]);
  const stale = Boolean(last?.ats?.report && last.ats.signature !== atsSignature(resume));
  const report = hasDraft && requirements.ready && !stale ? last?.ats?.report : null;
  const template = getTemplate(resume?.template);
  const thumb = hasDraft ? resume : sampleResumeFor(template.id);
  const editor = (query = '') => navigate('/student/resume/create' + query);
  const review = (query = '') => navigate('/student/resume/review' + query);
  const editField = (target) => {
    const parts = [target?.section || 'basics', target?.entryIndex, target?.field, target?.bulletIndex].filter(value => value != null);
    editor('?focus=' + encodeURIComponent(parts.join('|')) + (hasDraft ? '' : '&start=1'));
  };
  const openTemplates = (id = '1') => editor('?templates=' + encodeURIComponent(id));

  let mainLabel = 'Upload your résumé';
  let mainAction = () => editor('?import=1');
  if (hasDraft && requirements.ready) {
    mainLabel = report ? 'View my review' : stale ? 'Recheck résumé' : 'Check résumé';
    mainAction = () => review(report ? '?action=fixes' : '?run=1');
  } else if (hasDraft) {
    mainLabel = 'Continue editing';
    mainAction = () => editor();
  }
  const resumeEditing = hasDraft && requirements.ready;
  const secondaryLabel = resumeEditing ? 'Continue editing' : hasDraft ? 'Import another résumé' : 'Start from scratch';
  const secondaryQuery = resumeEditing ? '' : hasDraft ? '?import=1' : '?start=1';

  return <RequirePasswordChange user={user}><MotionConfig reducedMotion="user">
    <main className="min-h-full bg-[#f6f7f9] pb-12 font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
      <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <section data-guide="pr-header" aria-labelledby="pr-title" className="relative overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#242424]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,.13),transparent_52%)]" />
          <div data-guide="pr-create" className="relative flex items-center justify-between gap-6 px-5 py-7 sm:p-8">
            <div className="min-w-0 max-w-xl">
              <h1 id="pr-title" className="flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">Prep <span className="relative text-sky-600 dark:text-sky-400">Resume<TitleUnderline /></span><PageGuideButton className="ml-1" /></h1>
              <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-base dark:text-zinc-300">{hasDraft ? 'Continue your draft, try a template, or review the latest PDF with ANVI.' : 'Bring your current résumé into a PeerPrep template, or build your first draft here.'}</p>
              {loadError ? <div role="alert" className="mt-4 text-sm">{loadError} <button onClick={() => setAttempt(n => n + 1)} className="font-semibold text-sky-700 underline dark:text-sky-300">Try again</button></div> : loading ? <Skeleton className="mt-5 h-11 w-56 rounded-xl" /> : <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={mainAction} className={'inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 ' + focusRing}>
                  {hasDraft ? requirements.ready ? <Sparkles size={16} /> : <PencilLine size={16} /> : <FileUp size={17} />}
                  {mainLabel}
                </button>
                <button type="button" onClick={() => editor(secondaryQuery)} className={'min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold hover:border-sky-300 dark:border-white/15 dark:bg-white/5 ' + focusRing}>{secondaryLabel}</button>
                {hasDraft && requirements.ready && <button type="button" onClick={() => editor('?import=1')} className={'px-2 py-2 text-sm font-medium text-sky-700 dark:text-sky-300 ' + focusRing}>Import another résumé</button>}
              </div>}
              <div className="mt-3 text-xs text-slate-500 dark:text-zinc-400">{hasDraft ? template.name + (resume.updatedAt ? ' · Last saved ' + ago(resume.updatedAt) : ' · Saved draft') : 'PDF or DOCX · Up to 5 MB'}</div>
            </div>
            <TemplateFan resume={thumb} currentId={template.id} loading={loading} />
          </div>
        </section>
        {!loading && !loadError && <div className="mt-5 grid gap-4 lg:grid-cols-[1.12fr_1fr]">
          <ReviewCard ready={requirements.ready} report={report} stale={stale} hasDraft={hasDraft} open={review} onFirstMissing={() => hasDraft ? editField(requirements.missing[0]) : editor('?import=1')} />
          <EssentialsCard requirements={requirements} hasDraft={hasDraft} onEdit={editField} />
        </div>}
        <TemplatePicks onPick={openTemplates} onAll={() => openTemplates()} />
        <HowItWorks />
      </div>
    </main>
  </MotionConfig></RequirePasswordChange>;
}
