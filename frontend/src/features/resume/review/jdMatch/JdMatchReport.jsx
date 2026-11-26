// The ANVI JD Match report: score, keywords to add, then the résumé heading by heading and line by
// line — what to add on each line, an example of how to write it, and a button to fix it in the
// builder. Hovering a line card highlights that line on the résumé preview.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleAlert, CircleCheck, Copy, Download, Eye, Lightbulb, Loader2, PencilLine, Plus, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { AnviGauge, AnviOrb } from '../AnviVisuals';

const chipTone = {
  must: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20',
  good: 'bg-amber-50 text-amber-800 ring-amber-200/70 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20',
  present: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20',
};

function Chip({ term, importance, status, present = false }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${present ? chipTone.present : chipTone[importance] || chipTone.good}`}>
      {present ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{term}
      {!present && importance === 'must' ? <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">must</span> : null}
      {status === 'partial' ? <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">make clearer</span> : null}
    </span>
  );
}

function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
  };
  return <button type="button" onClick={copy} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white">{done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}{done ? 'Copied' : label}</button>;
}

function LineCard({ line, onFix, onHighlight, onReveal }) {
  const enter = () => onHighlight?.(line.text);
  const leave = () => onHighlight?.(null);
  return (
    <div onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave} className="group rounded-xl border border-slate-200/80 bg-white p-3 transition hover:border-violet-300 hover:shadow-[0_6px_18px_-12px_rgba(124,58,237,0.6)] dark:border-white/[0.07] dark:bg-[#262626] dark:hover:border-violet-400/40">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">
        <span className="truncate">Your line{line.entry ? ` · ${line.entry}` : ''}{line.field === 'bullet' ? ' · bullet' : line.field === 'skills' ? ' · skills' : line.field === 'headline' ? ' · headline' : ''}</span>
      </div>
      <p className="mt-1.5 border-l-2 border-slate-200 pl-2.5 text-[12.5px] leading-5 text-slate-700 dark:border-white/15 dark:text-zinc-300">“{line.text}”</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Add here:</span>
        {line.add.map((item) => <Chip key={item.term} {...item} />)}
      </div>
      {line.example ? (
        <div className="mt-2.5 rounded-lg bg-violet-50/80 px-2.5 py-2 dark:bg-violet-500/10">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[.1em] text-violet-700 dark:text-violet-300"><Sparkles className="h-3 w-3" />Write it like</span>
            <CopyButton text={line.example} />
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-slate-800 dark:text-zinc-100">{line.example}</p>
          <p className="mt-1 text-[11px] leading-4 text-violet-800/80 dark:text-violet-200/70">An example: keep your own facts and use it only if it is true.</p>
        </div>
      ) : null}
      {line.tip ? <p className="mt-2 flex gap-1.5 text-[11.5px] leading-4 text-slate-500 dark:text-zinc-400"><Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />{line.tip}</p> : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={() => onFix(line.focus)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-zinc-200"><PencilLine className="h-3.5 w-3.5" />Fix in builder</button>
        {onReveal ? <button type="button" onClick={() => onReveal(line.text)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/5"><Eye className="h-3.5 w-3.5" />Show in résumé</button> : null}
      </div>
    </div>
  );
}

function NewLineCard({ section, onFix }) {
  const terms = section.newLine.terms;
  const listable = section.key === 'skills' || section.key === 'new:skills';
  return (
    <div className="rounded-xl border border-dashed border-violet-300/80 bg-violet-50/40 p-3 dark:border-violet-400/30 dark:bg-violet-500/[0.06]">
      <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-violet-800 dark:text-violet-200"><Plus className="h-3.5 w-3.5" />{section.isNew ? `Add a ${section.heading} section` : 'Add a new line'}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{terms.map((item) => <Chip key={item.term} {...item} />)}</div>
      <p className="mt-2 text-[11.5px] leading-4 text-slate-600 dark:text-zinc-300">
        {listable ? <>For example: <b className="font-semibold">{terms.map((item) => item.term).join(', ')}</b> — only the ones you have really used.</> : terms[0]?.tip || 'Add a line that shows where you used these.'}
      </p>
      <button type="button" onClick={() => onFix(section.newLine.focus)} className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-violet-700"><PencilLine className="h-3.5 w-3.5" />Open in builder</button>
    </div>
  );
}

function Section({ section, index, onFix, onHighlight, onReveal }) {
  const [open, setOpen] = useState(section.toAdd > 0);
  const ok = section.toAdd === 0;
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-black/[0.06] dark:bg-[#222] dark:ring-white/[0.07]">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${ok ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-violet-600 text-white'}`}>{ok ? <Check className="h-4 w-4" /> : index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold tracking-wide text-slate-900 dark:text-white">{section.heading}{section.isNew ? <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold uppercase text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">new</span> : null}</span>
          <span className="block text-[11px] text-slate-500 dark:text-zinc-400">{ok ? (section.presentTerms.length ? `All good · shows ${section.presentTerms.length} keyword${section.presentTerms.length === 1 ? '' : 's'}` : 'Nothing to add here') : `${section.toAdd} keyword${section.toAdd === 1 ? '' : 's'} to add`}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-2.5 border-t border-slate-100 px-3.5 pb-3.5 pt-3 dark:border-white/[0.06]">
          {section.lines.map((line) => <LineCard key={line.id} line={line} onFix={onFix} onHighlight={onHighlight} onReveal={onReveal} />)}
          {section.newLine ? <NewLineCard section={section} onFix={onFix} /> : null}
          {section.presentTerms.length ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Already shown here:</span>
              {section.presentTerms.map((term) => <Chip key={term} term={term} present />)}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DownloadButton({ match, studentName, wide = false }) {
  const [state, setState] = useState('idle');
  const download = async () => {
    setState('busy');
    try {
      const { downloadJdReport } = await import('./downloadJdReport');
      await downloadJdReport(match, { studentName });
      setState('idle');
    } catch { setState('error'); }
  };
  return (
    <button type="button" onClick={download} disabled={state === 'busy'} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ring-1 ring-inset transition disabled:opacity-60 ${wide ? 'w-full bg-slate-900 py-2 text-white ring-slate-900 hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:ring-white' : 'text-slate-700 ring-slate-200 hover:bg-slate-50 dark:text-zinc-200 dark:ring-white/10 dark:hover:bg-white/5'}`}>
      {state === 'busy' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {state === 'busy' ? 'Preparing PDF…' : state === 'error' ? 'Could not create the PDF · retry' : wide ? 'Download this report (PDF)' : 'Download PDF'}
    </button>
  );
}

export default function JdMatchReport({ match, previousScore = null, onBack, onFix, onHighlight, onReveal, studentName = '' }) {
  const report = match?.report;
  if (!report) return null;
  const { totals } = report;
  const toAddText = report.toAdd.map((item) => item.term).join(', ');
  const delta = typeof previousScore === 'number' ? report.score - previousScore : null;
  let number = 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />Back to job description</button>
        <DownloadButton match={match} studentName={studentName} />
      </div>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-inset ring-black/[0.06] dark:bg-[#222] dark:ring-white/[0.07]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          <AnviGauge score={report.score} size={92} stroke={8} label="JD match" />
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[.12em] text-violet-600 dark:text-violet-300">{[report.role, report.company].filter(Boolean).join(' · ') || 'Job description match'}</p>
            <p className="mt-1 text-[13px] leading-5 text-slate-700 dark:text-zinc-200">{report.summary}</p>
            {delta !== null ? (
              <p className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${delta >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'}`}>{delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{previousScore}% → {report.score}% since your last check of this job</p>
            ) : null}
          </div>
        </div>
        <div className="relative mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-white/[0.04]"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Must-have</p><p className="text-sm font-bold text-slate-900 dark:text-white">{totals.mustPresent} / {totals.must} shown</p></div>
          <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-white/[0.04]"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Good-to-have</p><p className="text-sm font-bold text-slate-900 dark:text-white">{totals.goodPresent} / {totals.good} shown</p></div>
        </div>
        {report.toAdd.length ? (
          <div className="relative mt-3">
            <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">Keywords to add ({report.toAdd.length})</p><CopyButton text={toAddText} label="Copy all" /></div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{report.toAdd.map((item) => <Chip key={item.term} {...item} />)}</div>
          </div>
        ) : null}
      </motion.section>

      <div className="flex items-center gap-2 px-1 pt-1">
        <AnviOrb size={22} />
        <p className="text-[12px] font-semibold text-slate-700 dark:text-zinc-200">Section by section, line by line</p>
      </div>
      {report.sections.map((section) => {
        const at = section.toAdd ? number++ : 0;
        return <Section key={section.key} section={section} index={at} onFix={onFix} onHighlight={onHighlight} onReveal={onReveal} />;
      })}

      {report.noEvidence.length ? (
        <section className="rounded-2xl bg-amber-50/70 p-3.5 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/[0.07] dark:ring-amber-400/20">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-amber-900 dark:text-amber-100"><ShieldAlert className="h-4 w-4" />No evidence on your résumé yet</p>
          <p className="mt-1 text-[11.5px] leading-4 text-amber-800/90 dark:text-amber-200/80">The job asks for these, but nothing on your résumé shows them. If you have really used one, add it with where you used it; if not, learn it with a small project first — don't add it just to match.</p>
          <ul className="mt-2 space-y-1.5">
            {report.noEvidence.map((item) => (
              <li key={item.term} className="flex items-start gap-2 text-[12px] text-amber-900 dark:text-amber-100"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><b>{item.term}</b>{item.importance === 'must' ? <span className="ml-1 text-[10px] font-bold uppercase">must</span> : null}{item.tip ? <span className="block text-[11.5px] text-amber-800/90 dark:text-amber-200/80">{item.tip}</span> : null}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.present.length ? (
        <section className="rounded-2xl bg-white p-3.5 ring-1 ring-inset ring-black/[0.06] dark:bg-[#222] dark:ring-white/[0.07]">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-emerald-700 dark:text-emerald-300"><CircleCheck className="h-4 w-4" />Already on your résumé ({report.present.length})</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{report.present.map((item) => <span key={item.term} title={item.headings.join(', ')}><Chip term={item.term} present /></span>)}</div>
        </section>
      ) : null}

      <p className="rounded-xl bg-slate-100/80 px-3 py-2 text-[11px] leading-4 text-slate-600 dark:bg-white/[0.04] dark:text-zinc-400">Add only what you have really done — interviewers ask about every keyword on your résumé. Keyword match is separate from your ATS readability and résumé strength scores.</p>
      <DownloadButton match={match} studentName={studentName} wide />
      <button type="button" onClick={onBack} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-50 dark:text-violet-300 dark:ring-violet-400/30 dark:hover:bg-violet-500/10">Updated your résumé? Back to the job description to check again <ArrowRight className="h-3.5 w-3.5" /></button>
    </div>
  );
}
