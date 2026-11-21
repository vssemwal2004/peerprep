// Prep Resume template gallery: browse 30+ designs, preview each one with
// sample data or the student's own details, then apply it. Applying only
// changes `template`; content is never touched.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Columns2, FileCheck2, LayoutTemplate, Search, Type, X } from 'lucide-react';
import ResumePreview, { ResumeThumbnail } from './ResumePreview';
import { FONT_FAMILIES } from './templates/fonts';
import { RESUME_TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, getTemplateTheme, templateMatches } from './templates/catalog';
import { sampleResumeFor } from './templates/sampleResume';

const LAYOUT_LABEL = { single: 'One column', 'sidebar-left': 'Left sidebar', 'sidebar-right': 'Right sidebar' };

export function templateFacts(id) {
  const theme = getTemplateTheme(id);
  const fonts = [...new Set([theme.fonts.heading, theme.fonts.body, theme.fonts.title])].map((key) => FONT_FAMILIES[key]?.label).filter(Boolean);
  const swatches = [theme.colors.accent, theme.side?.bg, theme.header.place === 'banner' ? theme.header.bannerBg : null, theme.colors.text]
    .filter((value) => value && String(value).startsWith('#'))
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 3);
  const layout = theme.header.place === 'banner' ? `${LAYOUT_LABEL[theme.layout]} · header band` : LAYOUT_LABEL[theme.layout];
  return { fonts, swatches, layout };
}

/** Renders its children only once scrolled near the viewport. */
function LazyMount({ children, height }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setVisible(true); }, { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={ref} style={{ minHeight: height }}>{visible ? children : <div className="animate-pulse bg-slate-100 dark:bg-slate-800" style={{ height }} />}</div>;
}

function TemplateCard({ template, data, active, current, onOpen }) {
  const facts = useMemo(() => templateFacts(template.id), [template.id]);
  const resume = useMemo(() => ({ ...data, template: template.id }), [data, template.id]);
  return (
    <button
      type="button"
      onClick={() => onOpen(template.id)}
      className={`group flex flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-slate-900 ${active ? 'border-sky-500 ring-2 ring-sky-200 dark:ring-sky-900' : 'border-slate-200 dark:border-slate-800'}`}
      aria-label={`Preview ${template.name} template`}
    >
      <div className="relative flex justify-center overflow-hidden border-b border-slate-100 bg-slate-100 px-3 pt-3 dark:border-slate-800 dark:bg-slate-950">
        <LazyMount height={243}>
          <div className="overflow-hidden rounded-t-[3px] shadow-[0_6px_18px_-10px_rgba(0,0,0,.45)]" style={{ height: 243 }}>
            <ResumeThumbnail resume={resume} width={196} />
          </div>
        </LazyMount>
        {current ? <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white shadow"><Check className="h-3 w-3" />In use</span> : null}
        {template.ats ? <span className="absolute right-2 top-2 rounded-full bg-emerald-600/95 px-2 py-0.5 text-[10px] font-bold text-white shadow">ATS-friendly</span> : null}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full justify-center bg-gradient-to-t from-slate-950/70 to-transparent pb-3 pt-8 text-[11px] font-bold text-white transition group-hover:translate-y-0">Preview template</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-900 dark:text-white">{template.name}</span>
          <span className="flex shrink-0 gap-1">{facts.swatches.map((swatch) => <span key={swatch} className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: swatch }} />)}</span>
        </div>
        <p className="line-clamp-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{template.tagline}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{facts.layout}</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{facts.fonts.join(' + ')}</span>
        </div>
      </div>
    </button>
  );
}

function TemplateDetail({ template, data, current, sampleMode, onBack, onApply, onStep }) {
  const facts = useMemo(() => templateFacts(template.id), [template.id]);
  const resume = useMemo(() => ({ ...data, template: template.id }), [data, template.id]);
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 bg-slate-100 dark:bg-slate-950">
        <ResumePreview resume={resume} mode="scroll" sampleNotice={sampleMode ? 'Sample details — your own details will appear in this design' : ''} />
        <button type="button" onClick={() => onStep(-1)} className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-lg hover:text-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:block" aria-label="Previous template"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" onClick={() => onStep(1)} className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-lg hover:text-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:block" aria-label="Next template"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:w-[320px] lg:border-l lg:border-t-0">
        <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-sky-600"><ChevronLeft className="h-4 w-4" />All templates</button>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-600">{TEMPLATE_CATEGORIES.find((item) => item.id === template.category)?.label}</div>
          <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{template.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{template.tagline}</p>
        </div>
        <dl className="space-y-3 rounded-xl border border-slate-200 p-3.5 text-xs dark:border-slate-800">
          <div className="flex gap-3"><dt className="flex w-24 shrink-0 items-center gap-1.5 font-bold text-slate-500"><Columns2 className="h-3.5 w-3.5" />Layout</dt><dd className="text-slate-800 dark:text-slate-200">{facts.layout}</dd></div>
          <div className="flex gap-3"><dt className="flex w-24 shrink-0 items-center gap-1.5 font-bold text-slate-500"><Type className="h-3.5 w-3.5" />Fonts</dt><dd className="text-slate-800 dark:text-slate-200">{facts.fonts.join(', ')}</dd></div>
          <div className="flex gap-3"><dt className="flex w-24 shrink-0 items-center gap-1.5 font-bold text-slate-500"><LayoutTemplate className="h-3.5 w-3.5" />Colours</dt><dd className="flex gap-1.5">{facts.swatches.map((swatch) => <span key={swatch} className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ backgroundColor: swatch }} title={swatch} />)}</dd></div>
          <div className="flex gap-3"><dt className="flex w-24 shrink-0 items-center gap-1.5 font-bold text-slate-500"><FileCheck2 className="h-3.5 w-3.5" />ATS</dt><dd className="text-slate-800 dark:text-slate-200">{template.ats ? 'Simple structure that applicant tracking systems read reliably.' : 'Designed layout. For strict online portals, an ATS-friendly template is safer.'}</dd></div>
        </dl>
        <div className="rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300"><span className="font-bold text-slate-800 dark:text-slate-100">Best for: </span>{template.bestFor}</div>
        <p className="text-[11px] leading-4 text-slate-400">Switching templates never changes or removes your details. You can switch back at any time.</p>
        <div className="mt-auto">
          {current
            ? <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><Check className="h-4 w-4" />This template is in use</div>
            : <button type="button" onClick={() => onApply(template.id)} className="w-full rounded-xl bg-sky-600 py-3 text-sm font-black text-white shadow-sm transition hover:bg-sky-700">Use {template.name}</button>}
        </div>
      </aside>
    </div>
  );
}

export default function TemplateGallery({ currentId, resume, hasContent, onApply, onClose, initialId = '' }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(initialId);
  const [dataMode, setDataMode] = useState(hasContent ? 'mine' : 'sample');
  const sampleMode = dataMode === 'sample' || !hasContent;
  const data = useMemo(() => (sampleMode ? sampleResumeFor(currentId) : resume), [sampleMode, currentId, resume]);
  const list = useMemo(() => RESUME_TEMPLATE_CATALOG.filter((template) => templateMatches(template, { category, query })), [category, query]);
  const counts = useMemo(() => Object.fromEntries(TEMPLATE_CATEGORIES.map((item) => [item.id, RESUME_TEMPLATE_CATALOG.filter((template) => templateMatches(template, { category: item.id })).length])), []);
  const open = openId ? RESUME_TEMPLATE_CATALOG.find((template) => template.id === openId) : null;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') { if (openId) setOpenId(''); else onClose(); }
      if (openId && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        const source = list.length ? list : RESUME_TEMPLATE_CATALOG;
        const index = source.findIndex((template) => template.id === openId);
        const next = source[(index + (event.key === 'ArrowRight' ? 1 : -1) + source.length) % source.length];
        if (next) setOpenId(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, list, onClose]);

  const step = (delta) => {
    const source = list.length ? list : RESUME_TEMPLATE_CATALOG;
    const index = source.findIndex((template) => template.id === openId);
    setOpenId(source[(index + delta + source.length) % source.length].id);
  };

  return (
    <div className="fixed inset-0 z-[96] flex items-stretch justify-center bg-slate-950/70 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="template-gallery-title">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex h-full w-full max-w-[1500px] flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-950 sm:rounded-2xl sm:border sm:border-slate-200 dark:sm:border-slate-800">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white"><LayoutTemplate className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="template-gallery-title" className="text-base font-black text-slate-950 dark:text-white sm:text-lg">Choose a template</h2>
            <p className="hidden text-[11px] text-slate-500 sm:block">{RESUME_TEMPLATE_CATALOG.length} professional designs. Your details stay the same in every one, so switch as often as you like.</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold dark:border-slate-700 dark:bg-slate-950" role="group" aria-label="Preview with">
            <button type="button" onClick={() => setDataMode('sample')} className={`rounded-md px-2.5 py-1.5 ${sampleMode ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300' : 'text-slate-500'}`}>Sample details</button>
            <button type="button" onClick={() => setDataMode('mine')} disabled={!hasContent} title={hasContent ? '' : 'Add some details first'} className={`rounded-md px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${!sampleMode ? 'bg-white text-sky-700 shadow-sm dark:bg-slate-800 dark:text-sky-300' : 'text-slate-500'}`}>My details</button>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close templates"><X className="h-5 w-5" /></button>
        </header>

        {open ? (
          <TemplateDetail template={open} data={data} current={open.id === currentId} sampleMode={sampleMode} onBack={() => setOpenId('')} onApply={(id) => { onApply(id); setOpenId(''); }} onStep={step} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-4" aria-label="Template categories">
              {TEMPLATE_CATEGORIES.map((item) => (
                <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-bold transition ${category === item.id ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <span>{item.label}</span><span className="rounded-md bg-slate-100 px-1.5 text-[10px] text-slate-500 dark:bg-slate-800">{counts[item.id]}</span>
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <label className="relative mb-4 block max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <span className="sr-only">Search templates</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search: sidebar, serif, software, research…" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-sky-950" />
              </label>
              {list.length ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {list.map((template) => <TemplateCard key={template.id} template={template} data={data} active={template.id === openId} current={template.id === currentId} onOpen={setOpenId} />)}
                </div>
              ) : <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">No template matches “{query}”.</div>}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
