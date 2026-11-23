import { useMemo, useState } from 'react';
import { ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, FileSearch, ListChecks, Loader2, ScanLine, Sparkles, SpellCheck2, Wand2 } from 'lucide-react';
import { getSectionTitle, visibleSectionKeys } from '../resumeUtils';
import { api } from '../../../utils/api';
import { AnviOrb, AnviScanSheet } from './AnviVisuals';
import { collectTextUnits, locationLabel, toPlain } from './reviewModel';

export function DraftChecklist({ requirements, onLocate }) {
  const count = requirements.missing.length;
  return (
    <section aria-labelledby="anvi-draft-title" className="anvi-review-card">
      <div className="flex items-start gap-3">
        <span className="anvi-tool-icon"><ListChecks size={19} /></span>
        <div className="min-w-0 flex-1">
          <h3 id="anvi-draft-title" className="text-[15px] font-semibold">Finish {count} {count === 1 ? 'detail' : 'details'} to unlock your ATS score</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Choose a detail to open its field in the editor.</p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/10">
        {requirements.missing.map(item => (
          <li key={item.id}><button type="button" onClick={() => onLocate(item)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-[13px] hover:bg-sky-50 focus-visible:outline-sky-600 dark:hover:bg-sky-950">
            <span className="h-3 w-3 shrink-0 rounded-full border border-amber-500" aria-hidden="true" />
            <span className="flex-1">{item.label}</span><ChevronRight size={15} className="text-sky-600" />
          </button></li>
        ))}
      </ul>
    </section>
  );
}

export function ScanScene({ check, templateName, resume }) {
  const { ats, grammar } = check;
  const { done = 0, total = 0 } = grammar.progress || {};
  const isCheckingText = grammar.status === 'running';
  const isReading = ats.status === 'running';
  const pdfLabel = ({
    export: 'Preparing your PDF',
    upload: 'Sending your PDF',
    queued: 'Your PDF is in the scan queue',
    reconnect: 'Reconnecting to your scan',
  })[ats.stage] || 'Reading your PDF';
  const heading = isReading ? pdfLabel : 'Checking your wording';
  const lanes = [];
  if (isReading || ats.status === 'done' || ats.status === 'error') {
    lanes.push({ label: ats.status === 'done' ? 'PDF checked' : ats.status === 'error' ? 'PDF check interrupted' : pdfLabel, detail: templateName, state: ats.status, icon: FileSearch });
  }
  if (isCheckingText || grammar.status === 'done' || grammar.status === 'error') {
    lanes.push({ label: grammar.status === 'error' ? 'Grammar check interrupted' : grammar.loadingEngine && isCheckingText ? 'Opening the grammar checker' : 'Grammar and spelling', detail: total ? `${done} / ${total} lines` : '', state: grammar.status, icon: SpellCheck2 });
  }
  return (
    <section className="anvi-review-card !overflow-hidden !p-0">
      <div className="anvi-scan-stage" aria-hidden="true">
        <div className="anvi-scan-grid" />
        <div className="anvi-scan-orbit" />
        <div className="anvi-scan-sheet"><AnviScanSheet width={94} scanning headings={visibleSectionKeys(resume).slice(0, 3).map(key => getSectionTitle(resume, key))} /></div>
        <div className="anvi-scan-orb"><AnviOrb size={46} busy /></div>
        <span className="anvi-scan-token"><ScanLine size={13} /> PDF</span>
      </div>
      <div className="px-5 pb-5 pt-4">
        <h3 role="status" className="text-lg font-semibold tracking-tight">{heading}…</h3>
        <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/10">
          {lanes.map(({ label, detail, state, icon: Icon }) => (
            <li key={Icon.displayName || label} className="flex items-center gap-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
              <span className="flex-1 text-[13px] font-medium">{label}</span>
              <small className="text-right text-[11px] text-slate-500 dark:text-zinc-400">{detail}</small>
              {state === 'done' ? <Check size={15} className="text-emerald-600" /> : state === 'error' ? <CircleAlert size={15} className="text-amber-600" /> : <Loader2 size={15} className="animate-spin text-violet-500 motion-reduce:animate-none" />}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RewriteForm({ unit, check }) {
  const [stage, setStage] = useState('idle');
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState('');
  const original = toPlain(unit.raw).text;
  const generate = async () => {
    setStage('loading');
    setError('');
    try {
      const result = await api.resumeWritingAdvice({ original, context: unit.entryLabel });
      setSuggestion(result.suggestion);
      setStage('compare');
    } catch (failure) {
      setStage('idle');
      setError(failure.message || 'The suggestion could not be generated. Try again.');
    }
  };
  const apply = async () => {
    setStage('applying');
    const result = await check.replaceBullet(unit.id, unit.raw, suggestion);
    if (!result?.ok) {
      setError('This bullet changed. Select the current version to try again.');
      setStage('idle');
    } else {
      setStage('idle');
      setSuggestion('');
    }
  };
  return (
    <div className="mt-4">
      <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">
        <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Current wording</div>
        <p className="mt-1 break-words text-[13px] leading-5">{original}</p>
      </div>
      {stage === 'loading' ? <div role="status" className="anvi-writing-status"><AnviOrb size={25} busy /><span>ANVI is working on this bullet…</span></div> : null}
      {stage === 'compare' || stage === 'applying' ? (
        <div className="anvi-reveal mt-2 rounded-xl border border-violet-200/80 bg-violet-50/70 p-3 dark:border-violet-400/25 dark:bg-violet-500/[0.06]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300"><Sparkles size={13} />Suggested wording</div>
          <p className="mt-1 break-words text-[13px] leading-5">{suggestion}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">Check that it matches your work before applying.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={apply} disabled={stage === 'applying'} className="anvi-primary"><Check size={15} />Apply rewrite</button>
            <button type="button" onClick={() => { setStage('idle'); setSuggestion(''); }} disabled={stage === 'applying'} className="anvi-secondary">Keep original</button>
          </div>
        </div>
      ) : null}
      {stage === 'idle' ? <button type="button" onClick={generate} className="anvi-primary mt-3"><Wand2 size={15} />Suggest a rewrite</button> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}

export function RewriteTool({ resume, check, onLocate }) {
  const bullets = useMemo(() => collectTextUnits(resume).filter(unit => unit.field === 'bullet'), [resume]);
  const [selected, setSelected] = useState('');
  const unit = bullets.find(item => item.id === selected) || bullets[0];
  return (
    <section className="anvi-review-card">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Wand2 size={17} className="text-violet-600" />Improve a bullet</h3>
      {unit ? <>
        <label className="mb-1.5 mt-4 block text-xs font-medium" htmlFor="anvi-bullet-picker">Choose a bullet</label>
        <select id="anvi-bullet-picker" className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] dark:border-white/15 dark:bg-zinc-900" value={unit.id} onChange={event => setSelected(event.target.value)}>
          {bullets.map(item => <option value={item.id} key={item.id}>{locationLabel(item).join(' › ')}</option>)}
        </select>
        <RewriteForm key={unit.id + ':' + unit.raw} unit={unit} check={check} />
      </> : <div className="pt-3 text-[13px]">
        <p>Add a bullet about a project or experience, then ANVI can suggest wording for it.</p>
        <button type="button" className="anvi-secondary mt-3" onClick={() => onLocate({ section: 'projects' })}>Open projects <ArrowRight size={14} /></button>
      </div>}
    </section>
  );
}

export function UndoNotice({ check }) {
  const [message, setMessage] = useState('');
  if (!check.canUndoFix && !message) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
      <CheckCheck size={16} /><span className="flex-1" role="status">{check.canUndoFix ? 'Change applied to your draft' : message}</span>
      {check.canUndoFix ? <button type="button" className="rounded px-2 py-1 font-semibold underline" onClick={async () => {
        const result = await check.undoFix();
        setMessage(result?.ok ? 'Original wording restored' : 'This line has changed since your last edit.');
      }}>Undo</button> : null}
    </div>
  );
}

