import { useMemo, useState } from 'react';
import { ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, CircleCheck, FileSearch, ListChecks, Loader2, PencilLine, ScanLine, SpellCheck2 } from 'lucide-react';
import { getSectionTitle, visibleSectionKeys } from '../resumeUtils';
import { AnviOrb, AnviScanSheet } from './AnviVisuals';
import { collectTextUnits, locationLabel, toPlain } from './reviewModel';
import { VERB_IDEAS, coachBullet } from './bulletCoach';

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

/**
 * "Improve a bullet": ANVI coaches, the student writes. It checks the chosen bullet and asks what is
 * missing; it never generates or applies wording (that would not be the student's own work and
 * would read as AI-written). Bullets are listed weakest first.
 */
export function BulletCoach({ resume, check, onLocate, onOpenIssues }) {
  const bullets = useMemo(() => collectTextUnits(resume).filter(unit => unit.field === 'bullet').map((unit) => {
    const review = coachBullet(toPlain(unit.raw).text, (check.visibleIssues || []).filter((issue) => issue.unitId === unit.id));
    return { unit, review };
  }), [resume, check.visibleIssues]);
  const ranked = useMemo(() => [...bullets].sort((a, b) => a.review.score - b.review.score), [bullets]);
  const [selected, setSelected] = useState('');
  const current = bullets.find(item => item.unit.id === selected) || ranked[0];
  const [verbs, setVerbs] = useState(false);
  if (!current) {
    return (
      <section className="anvi-review-card text-[13px]">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold"><PencilLine size={17} className="text-violet-600" />Improve a bullet</h3>
        <p className="mt-2">Add a bullet about a project or experience, then ANVI can check it with you.</p>
        <button type="button" className="anvi-secondary mt-3" onClick={() => onLocate({ section: 'projects' })}>Open projects <ArrowRight size={14} /></button>
      </section>
    );
  }
  const { unit, review } = current;
  const open = review.checks.filter((item) => !item.passed);
  return (
    <section className="anvi-review-card">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold"><PencilLine size={17} className="text-violet-600" />Improve a bullet</h3>
      <p className="mt-1 text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">ANVI checks the bullet and asks what is missing. You write the words, so the résumé stays yours.</p>
      <label className="mb-1.5 mt-4 block text-[12.5px] font-medium" htmlFor="anvi-bullet-picker">Bullet (weakest first)</label>
      <select id="anvi-bullet-picker" className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-[13px] dark:border-white/15 dark:bg-zinc-900" value={unit.id} onChange={event => setSelected(event.target.value)}>
        {ranked.map(({ unit: item, review: itemReview }) => <option value={item.id} key={item.id}>{itemReview.score}/{itemReview.total} · {locationLabel(item).slice(1).join(' › ')}</option>)}
      </select>
      <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">
        <div className="flex items-center justify-between text-[11.5px] font-semibold text-slate-500 dark:text-zinc-400"><span>Your bullet</span><span className="tabular-nums">{review.score}/{review.total} checks</span></div>
        <p className="mt-1 break-words text-[13px] leading-5">{toPlain(unit.raw).text}</p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {review.checks.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12.5px]">
            {item.passed ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
            <span className="min-w-0 flex-1">
              <b className={`font-semibold ${item.passed ? 'text-slate-600 dark:text-zinc-300' : 'text-slate-900 dark:text-white'}`}>{item.title}</b>
              {!item.passed && item.question ? <span className="mt-0.5 block text-slate-700 dark:text-zinc-200">{item.question}</span> : null}
              {!item.passed && item.tip ? <span className="block text-slate-500 dark:text-zinc-400">{item.tip}</span> : null}
              {!item.passed && item.id === 'clean' && onOpenIssues ? <button type="button" onClick={onOpenIssues} className="anvi-text-link mt-0.5 text-[12px]">Open Issues <ArrowRight size={12} /></button> : null}
              {!item.passed && item.id === 'action' ? <button type="button" onClick={() => setVerbs((value) => !value)} className="anvi-text-link mt-0.5 text-[12px]">{verbs ? 'Hide' : 'Show'} verb ideas</button> : null}
              {!item.passed && item.id === 'action' && verbs ? (
                <span className="mt-1.5 block space-y-1">
                  {Object.entries(VERB_IDEAS).map(([group, list]) => <span key={group} className="block text-[12px] text-slate-600 dark:text-zinc-300"><span className="text-slate-500 dark:text-zinc-400">{group}:</span> {list.join(', ')}</span>)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onLocate({ ...unit })} className="anvi-primary"><PencilLine size={15} />Edit this bullet</button>
        <span className="text-[12px] text-slate-500 dark:text-zinc-400">{open.length ? `${open.length} thing${open.length === 1 ? '' : 's'} to add` : 'This bullet passes every check.'}</span>
      </div>
    </section>
  );
}

export function UndoNotice({ check }) {
  const [message, setMessage] = useState('');
  if (!check.canUndoFix && !message) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
      <CheckCheck size={16} /><span className="flex-1" role="status">{check.canUndoFix ? 'Spelling fixed in your draft' : message}</span>
      {check.canUndoFix ? <button type="button" className="rounded px-2 py-1 font-semibold underline" onClick={async () => {
        const result = await check.undoFix();
        setMessage(result?.ok ? 'Original wording restored' : 'This line has changed since your last edit.');
      }}>Undo</button> : null}
    </div>
  );
}

