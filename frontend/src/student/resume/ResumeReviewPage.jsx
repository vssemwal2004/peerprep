// Prep Resume › Your resume: the finished resume beside ANVI's check (ATS +
// grammar + job match). Fixes apply and save here; "Edit" and "Go to" open the
// builder at the exact field.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Download, FileText, LayoutTemplate, Loader2, PencilLine, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AnviAura, AnviGlowBackdrop, AnviOrb, AnviScanSheet, AnviWord } from '../../features/resume/review/AnviVisuals';
import { focusRing, Skeleton } from '../dashboard/ui';
import ResumePreview from '../../features/resume/ResumePreview';
import { buildResumePdfBlob, saveBlob } from '../../features/resume/exportPdf';
import { filenameForResume, hasResumeContent, mergeSavedResumeMetadata, normalizeClientResume } from '../../features/resume/resumeUtils';
import ResumeCheckPanel from '../../features/resume/review/ResumeCheckPanel';
import { useResumeCheck } from '../../features/resume/review/useResumeCheck';
import { getTemplate } from '../../features/resume/templates/catalog';
import { sampleResumeFor } from '../../features/resume/templates/sampleResume';
import { api } from '../../utils/api';
import RequirePasswordChange from '../RequirePasswordChange';
import PageGuideButton from '../../guide/platform/PageGuideButton';

/** Builder deep link for a place in the resume. */
export function focusLink({ section, entryIndex = null, field = null, bulletIndex = null } = {}) {
  if (!section || section === 'template') return '/student/resume/create?templates=1';
  const parts = [section];
  if (section === 'basics') parts.push(field || 'headline');
  else if (entryIndex !== null && entryIndex !== undefined) {
    parts.push(entryIndex);
    if (field) parts.push(field);
    if (field === 'bullet' && bulletIndex !== null && bulletIndex !== undefined) parts.push(bulletIndex);
  }
  return `/student/resume/create?focus=${encodeURIComponent(parts.join('|'))}`;
}

export default function ResumeReviewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [downloading, setDownloading] = useState(false);
  const [mobileTab, setMobileTab] = useState('check');
  const measuredRef = useRef(null);
  const resumeRef = useRef(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let live = true;
    api.getMyResume().then((result) => {
      if (!live) return;
      const value = normalizeClientResume(result?.resume);
      resumeRef.current = value;
      setResume(value);
    }).catch((loadError) => live && setError(loadError.message || 'Could not load your resume.')).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const save = useCallback(async () => {
    if (!dirtyRef.current || !resumeRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      const result = await api.saveMyResume(resumeRef.current);
      const merged = mergeSavedResumeMetadata(resumeRef.current, normalizeClientResume(result?.resume));
      resumeRef.current = merged;
      setSaveState('saved');
    } catch (saveError) {
      dirtyRef.current = true;
      setSaveState('error');
      setError(saveError.message || 'Could not save the fix. Please try again.');
    }
  }, []);

  // Fixes applied here are saved shortly after, like the builder's autosave.
  useEffect(() => {
    if (saveState !== 'editing') return undefined;
    const timer = setTimeout(save, 900);
    return () => clearTimeout(timer);
  }, [saveState, resume, save]);

  const handleResumeChange = useCallback((next) => {
    resumeRef.current = next;
    dirtyRef.current = true;
    setResume(next);
    setSaveState('editing');
  }, []);

  const handleLayoutChange = useCallback((info) => { measuredRef.current = info; }, []);
  const buildPdf = useCallback((value) => buildResumePdfBlob(value, measuredRef.current), []);

  const check = useResumeCheck({ userId: user?._id || user?.id, resume: resume || normalizeClientResume({}), buildPdf, onResumeChange: handleResumeChange });

  // Links from the hub's ANVI card: ?tab=grammar|ats|job opens that view;
  // ?run=1 starts a check straight away when there is nothing checked yet.
  const [searchParams] = useSearchParams();
  const initialTab = ['grammar', 'ats', 'job'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'ats';
  const autoRun = searchParams.get('run') === '1';
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRan.current || loading || !resume || !hasResumeContent(resume) || check.running) return;
    autoRan.current = true;
    check.runCheck();
  }, [autoRun, loading, resume, check]);

  const go = useCallback(async (to) => { await save(); navigate(to); }, [navigate, save]);
  const onLocate = useCallback((target) => go(focusLink(target)), [go]);
  const onBrowseTemplates = useCallback(() => go('/student/resume/create?templates=1'), [go]);

  const download = async () => {
    if (!resume || downloading) return;
    setDownloading(true);
    try { saveBlob(await buildResumePdfBlob(resume, measuredRef.current), filenameForResume(resume)); } catch (downloadError) { setError(downloadError.message || 'Could not create the PDF.'); } finally { setDownloading(false); }
  };

  const hasContent = resume ? hasResumeContent(resume) : false;
  const previewResume = useMemo(() => (resume && hasContent ? resume : sampleResumeFor(resume?.template)), [resume, hasContent]);

  const shell = 'min-h-screen bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100';
  if (loading) return <div className={`${shell} p-4 sm:p-6`}><div className="mx-auto grid max-w-[1680px] gap-5 lg:grid-cols-[minmax(0,1fr)_480px]"><Skeleton className="h-[760px] rounded-3xl" /><Skeleton className="h-[760px] rounded-3xl" /></div></div>;
  if (!resume) return <div className={`${shell} pt-24 text-center`}><p className="text-slate-600 dark:text-zinc-300">{error || 'Your resume could not be loaded.'}</p><button type="button" onClick={() => navigate('/student/resume')} className={`mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white ${focusRing}`}>Back to Prep Resume</button></div>;

  const template = getTemplate(resume.template);
  const panelHeight = { height: 'calc(100vh - 96px)', minHeight: 560 };

  return (
    <RequirePasswordChange user={user}>
      <div className={`flex flex-col ${shell}`}>
        {/* Toolbar */}
        {/* Part of the app frame (same surface as the sidebar, no dividing line); the page's curved
            corner sits just below it (ShellCorners). */}
        <div className="sticky top-0 z-30 bg-[var(--shell-frame)]">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:py-0" data-guide="rr-toolbar">
            <button type="button" onClick={() => go('/student/resume')} className={`flex h-9 w-9 items-center justify-center rounded-xl border border-[#e3e5ea] bg-white text-slate-500 transition hover:text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:text-white ${focusRing}`} aria-label="Back to Prep Resume"><ArrowLeft className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => go('/student/resume')} className="hidden text-[12px] font-medium text-slate-400 hover:text-sky-700 dark:text-zinc-500 dark:hover:text-sky-300 sm:inline">Prep Resume</button>
                <span className="hidden text-slate-300 dark:text-zinc-600 sm:inline">/</span>
                <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">Your resume</h1>
                <PageGuideButton size="sm" />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300"><LayoutTemplate className="h-3 w-3" />{template.name}</span>
                {template.ats ? <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><ShieldCheck className="h-3 w-3" />ATS-friendly</span> : null}
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${saveState === 'error' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' : 'text-slate-500 dark:text-zinc-400'}`}>
                  {saveState === 'saving' ? <><Loader2 className="h-3 w-3 animate-spin" />Saving fix…</> : saveState === 'editing' ? 'Unsaved fix' : saveState === 'error' ? 'Fix not saved' : <><Check className="h-3 w-3 text-emerald-500" />Saved</>}
                </span>
              </div>
            </div>
            <button type="button" onClick={() => go('/student/resume/create')} data-guide="rr-edit" className={`inline-flex h-9 items-center gap-2 rounded-xl border border-[#e3e5ea] bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-sky-400/30 dark:hover:text-sky-300 ${focusRing}`}><PencilLine className="h-4 w-4" /><span className="hidden sm:inline">Edit resume</span></button>
            <button type="button" onClick={download} disabled={!hasContent || downloading} data-guide="rr-download" className={`inline-flex h-9 items-center gap-2 rounded-xl bg-sky-600 px-3.5 text-[12.5px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(2,132,199,0.9)] transition hover:bg-sky-700 disabled:opacity-40 ${focusRing}`}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className="hidden sm:inline">Download PDF</span></button>
          </div>
        </div>

        {/* Phone: switch between ANVI and the resume */}
        <div className="mx-auto mt-3 w-full max-w-[1680px] px-4 lg:hidden">
          <div className="flex rounded-full bg-white p-1 ring-1 ring-black/[0.05] dark:bg-[#242424] dark:ring-white/[0.07]" role="tablist">
            {[['check', 'ANVI check'], ['resume', 'Resume']].map(([key, label]) => (
              <button type="button" role="tab" aria-selected={mobileTab === key} key={key} onClick={() => setMobileTab(key)} className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${mobileTab === key ? 'text-white' : 'text-slate-600 dark:text-zinc-300'}`}>
                {mobileTab === key ? <motion.span layoutId="rr-mobile-tab" className="absolute inset-0 rounded-full bg-gradient-to-r from-sky-500 via-violet-600 to-fuchsia-600" transition={{ type: 'spring', stiffness: 420, damping: 34 }} /> : null}
                <span className="relative inline-flex items-center gap-2">{key === 'check' ? <Sparkles className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{label}</span>
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="mx-auto mt-3 w-full max-w-[1680px] px-4 sm:px-6"><div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</div></div> : null}

        <main className="mx-auto grid w-full max-w-[1680px] flex-1 gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_480px]">
          {/* The resume, on a desk */}
          <section data-guide="rr-preview" className={`${mobileTab === 'resume' ? 'block' : 'hidden lg:block'} min-w-0`}>
            <div className="relative overflow-hidden rounded-3xl border border-[#e9eaee] bg-[#eef1f5] bg-[radial-gradient(rgba(15,23,42,0.07)_1px,transparent_1px)] [background-size:16px_16px] dark:border-white/[0.07] dark:bg-[#1e1e1e] dark:bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] lg:sticky lg:top-[80px]" style={panelHeight}>
              <ResumePreview resume={previewResume} mode="scroll" onLayoutChange={hasContent ? handleLayoutChange : undefined} sampleNotice={hasContent ? '' : 'Sample details — create your resume to see your own'} />
            </div>
          </section>

          {/* ANVI */}
          <aside data-guide="rr-check" className={`${mobileTab === 'check' ? 'block' : 'hidden lg:block'} min-w-0 lg:sticky lg:top-[80px] lg:self-start`}>
            <AnviAura radius="1.5rem" innerClassName="!bg-[#f6f7f9] dark:!bg-[#1c1c1c]">
              <div style={{ height: 'calc(100vh - 98px)', minHeight: 558 }}>
                {hasContent ? (
                  <ResumeCheckPanel className="h-full" initialTab={initialTab} check={check} resume={resume} hasContent={hasContent} onLocate={onLocate} onBrowseTemplates={onBrowseTemplates} />
                ) : (
                  <div className="relative flex h-full flex-col items-center justify-center p-8 text-center">
                    <AnviGlowBackdrop />
                    <div className="relative"><AnviScanSheet width={120} className="rotate-[-4deg]" /><span className="absolute -bottom-4 -right-6"><AnviOrb size={48} /></span></div>
                    <h2 className="relative mt-8 text-lg font-semibold text-slate-950 dark:text-white">Nothing for <AnviWord /> to check yet</h2>
                    <p className="relative mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-zinc-400">Create your resume first. Once it has your details, ANVI checks its grammar, its ATS readiness and how well it matches a job.</p>
                    <button type="button" onClick={() => navigate('/student/resume/create')} className={`relative mt-5 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 ${focusRing}`}>Create your resume</button>
                  </div>
                )}
              </div>
            </AnviAura>
          </aside>
        </main>
      </div>
    </RequirePasswordChange>
  );
}
