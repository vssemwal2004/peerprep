import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe, Pencil, RotateCcw, ShieldOff } from 'lucide-react';
import { api } from '../../utils/api';
import { DialogFrame } from './PublishToggle';
import { BatchProgress, ResultTile, TargetMocks } from './BulkAssignDialog';
import {
  BULK_LIMITS, DIALOG_BUTTONS as dialogButton, EMPTY_PUBLISH_RESULT, builderPathFor, chunk, mergePublishResult,
  publishBreakdown, runBatches,
} from './mockAccessModel';

// Bulk publish / unpublish of Prep Mocks (Master Admin, platform). The server runs, for each mock,
// exactly the checks of the single "Publish" (one shared function), so a mock that is not ready is
// skipped with its reason instead of failing the whole run; each skipped mock links to its builder.
// Unpublishing many mocks takes an explicit acknowledgement: every university loses access at once.

const SHOWN_SKIPPED = 300;
const plural = (number, word, many = `${word}s`) => `${Number(number || 0).toLocaleString()} ${number === 1 ? word : many}`;

/** target: { title, mocks } (exact mocks); publish: true | false; onDone(result) refreshes the list. */
export default function BulkPublishDialog(props) {
  return props.target ? <BulkPublishFlow {...props} /> : null;
}

function BulkPublishFlow({ target, publish, onClose, onDone, onOpenBuilder, toast }) {
  const [step, setStep] = useState('confirm');
  const [acknowledged, setAcknowledged] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);

  const mocks = target.mocks;
  const breakdown = useMemo(() => publishBreakdown(mocks), [mocks]);
  const byId = useMemo(() => new Map(mocks.map((mock) => [String(mock._id), mock])), [mocks]);
  const ids = publish ? breakdown.toPublish : breakdown.toUnpublish;
  const unchangedCount = publish ? breakdown.live : breakdown.ready + breakdown.draft;
  const verb = publish ? 'Publish' : 'Unpublish';

  const run = async (batches, previous = EMPTY_PUBLISH_RESULT) => {
    setStep('running');
    setProgress({ done: 0, total: batches.length });
    const response = await runBatches(
      batches,
      (mockIds) => (publish ? api.bulkPublishMocks({ mockIds }) : api.bulkUnpublishMocks({ mockIds })),
      (total, part) => mergePublishResult(total, part, publish),
      previous,
      setProgress,
    );
    setOutcome(response);
    setStep('result');
    if (response.done > 0) onDone?.(response.result);
    const { result } = response;
    if (response.error) toast?.error(response.error?.message || `Some mocks could not be ${publish ? 'published' : 'unpublished'}.`);
    else if (result.skipped.length || result.missingMocks.length) toast?.warning(`${plural(result.changed, 'mock')} ${publish ? 'published' : 'unpublished'}. Review the skipped mocks.`);
    else toast?.success(`${plural(result.changed, 'mock')} ${publish ? 'published' : 'unpublished'}.`);
  };

  let body;
  let footer;
  if (step === 'running') {
    body = <BatchProgress progress={progress} label={publish ? 'Publishing mocks…' : 'Unpublishing mocks…'} />;
    footer = <p className="min-w-0 flex-1 text-xs text-slate-500 dark:text-gray-400">{verb} {plural(ids.length, 'mock')}</p>;
  } else if (step === 'result') {
    const result = outcome?.result || EMPTY_PUBLISH_RESULT;
    const issues = [...result.skipped, ...result.missingMocks.map((_id) => ({ _id, reason: 'This mock is no longer available.', missing: true }))];
    // Mocks the client already knew were unchanged (live / draft) were not sent: count them too.
    const unchanged = result.unchanged + unchangedCount;
    body = (
      <div className="space-y-3 px-5 py-4">
        {outcome?.error ? (
          <div role="alert" className="flex flex-wrap items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {outcome.done > 0 ? `Completed ${outcome.done} of ${outcome.done + outcome.remaining.length} parts in this run. ` : ''}The remaining changes could not be confirmed.{' '}
              {outcome.error?.message || 'The request failed.'}
            </span>
            <button type="button" onClick={() => run(outcome.remaining, outcome.result)} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 dark:bg-gray-900 dark:text-rose-300 dark:ring-rose-900">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />{outcome.done > 0 ? 'Retry the rest' : 'Try again'}
            </button>
          </div>
        ) : issues.length > 0 ? (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />Review the mocks that were skipped and the reason for each.
          </p>
        ) : (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {publish
              ? 'Published mocks are live for every university with an active Prep Mock package, and for own students inside their dates.'
              : 'Unpublished mocks are drafts again. Past attempts and reports are kept.'}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          <ResultTile label={publish ? 'Published' : 'Unpublished'} value={result.changed} tone={publish ? 'emerald' : 'amber'} />
          <ResultTile label={publish ? 'Already live' : 'Already drafts'} value={unchanged} />
          <ResultTile label="Skipped" value={issues.length} tone={issues.length ? 'rose' : 'slate'} />
        </div>
        {issues.length > 0 && (
          <section aria-label="Skipped mocks" className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-800">
            <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">Skipped mocks</p>
            <ul className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto dark:divide-gray-800">
              {issues.slice(0, SHOWN_SKIPPED).map((row) => {
                const mock = byId.get(String(row._id)) || { _id: row._id, title: row.title };
                return (
                  <li key={row._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-800 dark:text-gray-100">{row.title || mock.title || 'Untitled mock'}</span>
                      <span className="block text-[11px] text-rose-700 dark:text-rose-300">{row.reason || 'Could not be changed.'}</span>
                    </span>
                    {publish && onOpenBuilder && !row.missing && !mock.shared && (
                      <button type="button" onClick={() => { onClose(); onOpenBuilder(builderPathFor(mock, row.reason)); }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                        <Pencil className="h-3 w-3" aria-hidden="true" />{/pattern|month and year/i.test(String(row.reason)) ? 'Open builder at Pattern' : 'Open builder'}
                      </button>
                    )}
                  </li>
                );
              })}
              {issues.length > SHOWN_SKIPPED && <li className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-gray-400">…and {(issues.length - SHOWN_SKIPPED).toLocaleString()} more</li>}
            </ul>
          </section>
        )}
      </div>
    );
    footer = <><span className="min-w-0 flex-1" /><button type="button" data-close onClick={onClose} className={dialogButton.primary}>Close</button></>;
  } else {
    const needsAck = !publish && ids.length > 0;
    body = (
      <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-slate-600 dark:text-gray-300">
        <TargetMocks title={target.title} mocks={mocks} />
        <ul className="grid gap-1.5 text-xs" aria-label="What happens">
          {publish ? <>
            {breakdown.ready > 0 && <li><b className="text-slate-900 dark:text-white">{plural(breakdown.ready, 'ready draft')}</b> will be published.</li>}
            {breakdown.hidden > 0 && <li><b className="text-slate-900 dark:text-white">{plural(breakdown.hidden, 'hidden mock')}</b> will be made live again.</li>}
            {breakdown.draft > 0 && <li><b className="text-slate-900 dark:text-white">{plural(breakdown.draft, 'incomplete draft')}</b> will be checked; any that fail the publish checks are skipped and listed with the reason.</li>}
            {breakdown.live > 0 && <li>{plural(breakdown.live, 'mock is', 'mocks are')} already live and stay as they are.</li>}
          </> : <>
            {breakdown.live + breakdown.hidden > 0 && <li><b className="text-slate-900 dark:text-white">{plural(breakdown.live + breakdown.hidden, 'published mock')}</b> will go back to draft.</li>}
            {unchangedCount > 0 && <li>{plural(unchangedCount, 'mock is', 'mocks are')} already drafts and stay as they are.</li>}
          </>}
        </ul>
        {ids.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-gray-950 dark:text-gray-300">Nothing to {publish ? 'publish' : 'unpublish'}: every mock listed is already {publish ? 'live' : 'a draft'}.</p>
        ) : publish ? (
          <p className="text-xs">Every university with an active Prep Mock package gets them straight away; own students see them inside their own dates.</p>
        ) : (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
            <span>I understand that students of every university and own students lose access to {plural(ids.length, 'mock')} now (attempts in progress end). Past attempts and reports are kept.</span>
          </label>
        )}
        {ids.length > BULK_LIMITS.mocks && <p className="text-[11px] text-slate-500 dark:text-gray-400">Sent in {chunk(ids).length} parts, one after another.</p>}
      </div>
    );
    footer = <>
      <span className="min-w-0 flex-1" />
      <button type="button" data-cancel onClick={onClose} className={dialogButton.secondary}>{ids.length ? 'Cancel' : 'Close'}</button>
      {ids.length > 0 && (
        <button type="button" data-confirm onClick={() => run(chunk(ids))} disabled={needsAck && !acknowledged} className={publish ? dialogButton.success : dialogButton.warning}>
          {publish ? <Globe className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}{verb} {plural(ids.length, 'mock')}
        </button>
      )}
    </>;
  }

  return (
    <DialogFrame
      size="md"
      key={step}
      icon={publish ? Globe : ShieldOff}
      tone={publish ? 'emerald' : 'amber'}
      title={step === 'result' ? `${verb} results` : step === 'running' ? `${publish ? 'Publishing' : 'Unpublishing'} mocks` : `${verb} ${plural(ids.length, 'mock')}?`}
      subtitle={<span className="block truncate">{target.title}</span>}
      onClose={onClose}
      busy={step === 'running'}
      initialFocus={step === 'result' ? '[data-close]' : publish ? '[data-confirm]' : '[data-cancel]'}
      footer={footer}
    >
      {body}
    </DialogFrame>
  );
}
