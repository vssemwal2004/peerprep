import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, History, RotateCcw, Save } from 'lucide-react';
import { api } from '../utils/api';
import { configProblem, MODULES } from './prepScore/engine';
import { card, helperText, inputClass, sectionTitle } from './prepScore/fields';
import FormulaCard from './prepScore/FormulaCard';
import ModuleCard from './prepScore/ModuleCard';
import Simulator from './prepScore/Simulator';
import ImpactPanel from './prepScore/ImpactPanel';

const clone = (value) => structuredClone(value);
const formatDate = (value) => (value ? new Date(value).toLocaleString() : '');

/** Master Admin only: every value in the Prep Score formula, versioned as draft → publish. */
export default function PrepScoreAdjustment() {
  const [workspace, setWorkspace] = useState(null);
  const [config, setConfig] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api.prepScorePolicy();
    const start = clone(data.draft?.config || data.active.config);
    setWorkspace(data);
    setConfig(start);
    setBaseline(JSON.stringify(start));
    setReason(data.draft?.changeReason || '');
  };
  useEffect(() => { load().catch((requestError) => setError(requestError.message || 'Could not load Prep Score settings.')); }, []);

  const update = (path, value) => setConfig((previous) => {
    const next = clone(previous);
    let target = next;
    path.slice(0, -1).forEach((key) => { target = target[key]; });
    target[path.at(-1)] = value;
    return next;
  });

  const unsaved = config && JSON.stringify(config) !== baseline;
  const problem = useMemo(() => (config ? configProblem(config) : ''), [config]);

  async function run(action, work, done) {
    setBusy(action); setError(''); setNotice('');
    try {
      await work();
      setNotice(done);
      await load();
    } catch (requestError) {
      setError(requestError.message || 'The Prep Score policy could not be updated.');
    } finally {
      setBusy(''); setConfirming(false);
    }
  }
  const save = () => run('save', () => api.savePrepScorePolicyDraft({ config, changeReason: reason }), 'Draft saved. Students are unaffected until it is published.');
  const publish = () => run('publish', async () => {
    if (unsaved) await api.savePrepScorePolicyDraft({ config, changeReason: reason });
    await api.publishPrepScorePolicy({ changeReason: reason });
  }, 'Published. Every university recalculates in the background; students keep the previous scores until theirs finishes.');
  const restore = (version) => run(`restore-${version}`, () => api.restorePrepScorePolicy(version), `Version ${version} copied into the draft. Review it, then publish.`);
  const discard = () => { setConfig(JSON.parse(baseline)); setNotice(''); setError(''); };

  if (!config) {
    return <div className="p-8 text-sm text-slate-500">{error || 'Loading Prep Score settings…'}</div>;
  }
  const draftVersion = workspace?.draft?.version;
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-600">Master Admin settings</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Prep Score Adjustment</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Every value in the Prep Score formula, for all universities. Students see only their score and rank, never these settings. Prep Coin is separate and unaffected.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Live: version {workspace.active.version}</span>
          {draftVersion && <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Draft: version {draftVersion}</span>}
          {unsaved && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Unsaved changes</span>}
        </div>
      </header>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}

      <FormulaCard config={config} update={update} />
      <div className="grid gap-5 xl:grid-cols-2">
        {MODULES.map(({ key, label, symbol }) => <ModuleCard key={key} moduleKey={key} label={label} symbol={symbol} module={config.modules[key]} update={update} />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Simulator config={config} />
        <ImpactPanel config={config} universities={workspace.universities} disabled={Boolean(problem)} />
      </div>

      <section className={card} aria-labelledby="publish-title">
        <h2 id="publish-title" className={sectionTitle}>Save and publish</h2>
        <p className={`mt-1 ${helperText}`}>A draft changes nothing for students. Publishing recalculates every student's score and rank with these values.</p>
        {problem && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{problem}</p>}
        <label className="mt-3 block text-sm font-semibold text-slate-700 dark:text-slate-200">Reason for this change
          <textarea className={`${inputClass} mt-1 min-h-20`} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: reward Hard problems more strongly this semester." />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={Boolean(busy) || Boolean(problem) || !unsaved} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"><Save className="h-4 w-4" aria-hidden="true" />Save draft</button>
          {unsaved && <button type="button" disabled={Boolean(busy)} onClick={discard} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Discard changes</button>}
          {!confirming ? (
            <button type="button" disabled={Boolean(busy) || Boolean(problem) || (!draftVersion && !unsaved) || reason.trim().length < 5} onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Publish…</button>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 px-3 py-1.5 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-100">
              Recalculate every student's score with these values?
              <button type="button" disabled={Boolean(busy)} onClick={publish} className="rounded-lg bg-sky-600 px-3 py-1 font-semibold text-white">{busy === 'publish' ? 'Publishing…' : 'Publish'}</button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-3 py-1 font-semibold">Cancel</button>
            </span>
          )}
        </div>
        {reason.trim().length < 5 && <p className={`mt-2 ${helperText}`}>Publishing needs a reason of at least 5 characters.</p>}
      </section>

      <section className={card} aria-labelledby="history-title">
        <div className="flex items-center gap-2"><History className="h-5 w-5 text-sky-600" aria-hidden="true" /><h2 id="history-title" className={sectionTitle}>Version history</h2></div>
        {workspace.history.length === 0 ? <p className={`mt-3 ${helperText}`}>Nothing published yet: the built-in defaults are live (version {workspace.active.version}).</p> : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {workspace.history.map((row) => (
              <li key={row.version} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <b className="text-slate-900 dark:text-white">Version {row.version}</b>
                  {row.status === 'active' && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Live</span>}
                  <span className="ml-2 text-slate-500">{row.changeReason || 'No reason recorded'}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={helperText}>{formatDate(row.publishedAt)}</span>
                  {row.status !== 'active' && <button type="button" disabled={Boolean(busy)} onClick={() => restore(row.version)} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline disabled:opacity-50 dark:text-sky-300"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Restore as draft</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
