import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, History, Loader2, RefreshCw, Save, Search, Send, Tags, Target, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import PageGuideButton from '../guide/platform/PageGuideButton';
import GuideInfo from '../guide/platform/GuideInfo';

// Master Admin → Settings → Prep Topic Priority Adjustment. Server: routes/prepReadinessSettings.js.
// Edits weight, target and priority per topic and track; cutoffs and difficulty multipliers are
// read-only. Draft → server preview (no writes) → publish with a reason. A newer draft or version
// (another admin) returns 409; local edits stay on screen with a reload / compare path.

const CATEGORY_LABELS = {
  core: 'Core Fundamentals & SBC Essentials', patterns: 'Core DSA Patterns', 'high-signal': 'High-Signal PBC Topics',
  'mid-tier': 'Mid-Tier & Situational Topics', advanced: 'Advanced / Competitive & Niche Topics',
};
const TRACKS = [{ key: 'sbc', label: 'SBC · Service-Based' }, { key: 'pbc', label: 'PBC · Product-Based' }];
const card = 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-zinc-800 dark:bg-[#242424]';
const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1a1a1a]';
const input = `h-8 w-20 rounded-lg border bg-white px-2 text-right text-[12.5px] tabular-nums text-slate-800 dark:bg-[#1f1f22] dark:text-zinc-100 ${ring}`;
const button = `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${ring}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Client-side mirror of the server validation (the server re-checks everything). */
function rowErrors(topic) {
  const errors = {};
  for (const track of ['sbc', 'pbc']) {
    const row = topic[track];
    for (const field of ['weight', 'target', 'priority']) {
      const value = row[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) errors[`${track}.${field}`] = 'Enter a number';
      else if (value < 0) errors[`${track}.${field}`] = 'Cannot be negative';
    }
    if (row.weight > 0) {
      if (!(row.target > 0)) errors[`${track}.target`] = 'Needs a target above 0';
      if (!(Number.isInteger(row.priority) && row.priority >= 1 && row.priority <= 5)) errors[`${track}.priority`] = 'Whole number 1–5';
    }
  }
  return errors;
}
const totalsOf = (topics) => Object.fromEntries(['sbc', 'pbc'].map((track) => [track, topics.reduce((sum, topic) => sum + (topic[track].weight > 0 ? topic[track].weight : 0), 0)]));
const sameRow = (a, b) => ['sbc', 'pbc'].every((track) => ['weight', 'target', 'priority'].every((field) => a?.[track]?.[field] === b?.[track]?.[field]));

function Bars({ buckets, color }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="flex h-16 items-end gap-0.5" aria-hidden="true">
      {buckets.map((bucket) => <span key={bucket.from} title={`${bucket.from}–${bucket.to}: ${bucket.count}`} className="flex-1 rounded-t" style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%`, backgroundColor: color, opacity: bucket.count ? 0.85 : 0.2 }} />)}
    </div>
  );
}

export default function PrepTopicPriority() {
  const [workspace, setWorkspace] = useState(null);
  const [topics, setTopics] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [track, setTrack] = useState('pbc');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [changedOnly, setChangedOnly] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [serverErrors, setServerErrors] = useState([]);
  const [universityId, setUniversityId] = useState('platform');
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [unmapped, setUnmapped] = useState(null);
  const [mapping, setMapping] = useState({});

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await api.prepReadinessPolicy();
      setWorkspace(data);
      const source = data.draft || data.active;
      setTopics(clone(source.topics));
      setBaseline(clone(source.topics));
      setReason(data.draft?.changeReason || '');
      setConflict(null);
      setServerErrors([]);
      setPreview(null);
    } catch (error) { setLoadError(error.message || 'Could not load the topic policy.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = workspace?.active;
  const draft = workspace?.draft;
  const activeByKey = useMemo(() => new Map((active?.topics || []).map((topic) => [topic.key, topic])), [active]);
  const baselineByKey = useMemo(() => new Map(baseline.map((topic) => [topic.key, topic])), [baseline]);
  const errors = useMemo(() => new Map(topics.map((topic) => [topic.key, rowErrors(topic)])), [topics]);
  const errorCount = [...errors.values()].reduce((sum, item) => sum + Object.keys(item).length, 0);
  const totals = totalsOf(topics);
  const trackError = ['sbc', 'pbc'].filter((key) => !(totals[key] > 0));
  const unsaved = topics.some((topic) => !sameRow(topic, baselineByKey.get(topic.key)));
  const changedFromLive = topics.filter((topic) => !sameRow(topic, activeByKey.get(topic.key)));
  const invalid = errorCount > 0 || trackError.length > 0;

  const visible = topics.filter((topic) => {
    if (category !== 'all' && topic.category !== category) return false;
    if (changedOnly && sameRow(topic, activeByKey.get(topic.key))) return false;
    return !query.trim() || topic.label.toLowerCase().includes(query.trim().toLowerCase());
  });

  const edit = (key, field, raw) => {
    const value = raw === '' ? Number.NaN : Number(raw);
    setTopics((current) => current.map((topic) => {
      if (topic.key !== key) return topic;
      const row = { ...topic[track], [field]: value };
      if (field === 'weight' && value === 0) row.priority = 0;
      if (field === 'weight' && value > 0 && !(row.priority >= 1)) row.priority = Math.max(1, Math.min(5, Math.round(value)));
      return { ...topic, [track]: row };
    }));
    setPreview(null);
  };

  const handleConflict = (error) => {
    const data = error?.response?.data || {};
    if (error?.response?.status === 409) { setConflict({ message: error.message, ...data }); return true; }
    if (error?.response?.status === 400 && Array.isArray(data.errors)) { setServerErrors(data.errors); return true; }
    return false;
  };
  const run = async (name, work) => {
    setBusy(name); setNotice(null); setServerErrors([]);
    try { await work(); } catch (error) { if (!handleConflict(error)) setNotice({ tone: 'error', text: error.message || 'Something went wrong.' }); }
    finally { setBusy(''); }
  };

  const saveDraft = () => run('save', async () => {
    const result = await api.savePrepReadinessDraft({ topics, changeReason: reason, revision: draft?.revision || 0 });
    setWorkspace((current) => ({ ...current, draft: result.draft }));
    setBaseline(clone(topics));
    setNotice({ tone: 'ok', text: `Draft v${result.draft.version} saved (revision ${result.draft.revision}). Live scores are unchanged until you publish.` });
  });
  const discard = () => run('discard', async () => {
    await api.discardPrepReadinessDraft(draft.revision);
    await load();
    setNotice({ tone: 'ok', text: 'Draft discarded. The editor shows the live policy.' });
  });
  const runPreview = () => run('preview', async () => {
    setPreview(await api.previewPrepReadiness({ topics, universityId }));
  });
  const publish = () => run('publish', async () => {
    const result = await api.publishPrepReadiness({ revision: draft.revision, changeReason: reason });
    setConfirming(false);
    await load();
    setNotice({ tone: 'ok', text: `Version ${result.active.version} is live. New readiness scores use it; history keeps the policy each day used.` });
  });
  const loadUnmapped = () => run('unmapped', async () => setUnmapped(await api.prepReadinessUnmapped(universityId)));
  const saveMapping = (item) => run(`map:${item.problemKey}`, async () => {
    await api.setPrepReadinessMapping({ problemKey: item.problemKey, topic: mapping[item.problemKey], title: item.title });
    setUnmapped((current) => ({ ...current, items: current.items.filter((row) => row.problemKey !== item.problemKey) }));
    setNotice({ tone: 'ok', text: `“${item.title}” now counts toward ${topics.find((topic) => topic.key === mapping[item.problemKey])?.label}. Existing solves of it are credited on the next readiness refresh.` });
  });

  if (loadError) return <div className="mx-auto max-w-3xl p-6"><div className={`${card} text-center`}><p className="text-[13px] text-rose-600">{loadError}</p><button type="button" onClick={load} className={`${button} mt-3 bg-violet-600 text-white`}><RefreshCw className="h-4 w-4" />Retry</button></div></div>;
  if (!workspace) return <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading topic policy…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      {/* Header */}
      <header className={`${card} flex flex-wrap items-start justify-between gap-4`} data-guide="ptp-header">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[20px] font-bold text-slate-900 dark:text-white"><Target className="h-5 w-5 text-violet-600" aria-hidden="true" />Prep Topic Priority Adjustment<PageGuideButton size="sm" /></h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-slate-500 dark:text-zinc-400">Topic weight, target and priority for SBC and PBC Prep Readiness. Priority only orders ANVI practice suggestions; weight and target change scores. Applies to every university.</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">Live v{active.version}{active.builtIn ? ' (default)' : ''}</span>
            {draft ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/20">Draft v{draft.version} · revision {draft.revision}</span> : null}
            {unsaved ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">Unsaved changes</span> : null}
            {changedFromLive.length ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">{changedFromLive.length} topic{changedFromLive.length === 1 ? '' : 's'} differ from live</span> : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-[12px]" aria-label="Read-only track settings">
          {['sbc', 'pbc'].map((key) => (
            <div key={key} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
              <dt className="font-semibold text-slate-700 dark:text-zinc-200">{key.toUpperCase()} · target {active.tracks[key].cutoff}</dt>
              <dd className="mt-0.5 tabular-nums text-slate-500 dark:text-zinc-400">E {active.tracks[key].multipliers.Easy} · M {active.tracks[key].multipliers.Medium} · H {active.tracks[key].multipliers.Hard}</dd>
              <dd className="tabular-nums text-slate-500 dark:text-zinc-400">Weight total {active.totals[key].weight} → <b className={totals[key] !== active.totals[key].weight ? 'text-violet-700 dark:text-violet-300' : ''}>{totals[key]}</b></dd>
            </div>
          ))}
        </dl>
      </header>

      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1"><b>Someone else changed this policy.</b> {conflict.message} Your edits are still on screen ({changedFromLive.length} topics differ from live).</p>
          <button type="button" onClick={load} className={`${button} bg-amber-600 text-white hover:bg-amber-700`}><RefreshCw className="h-4 w-4" />Reload latest (drops my edits)</button>
          <button type="button" onClick={() => setConflict(null)} className={`${button} bg-white text-amber-800 ring-1 ring-amber-300 dark:bg-transparent dark:text-amber-200`}>Keep editing</button>
        </div>
      ) : null}
      {notice ? <p role="status" className={`rounded-xl px-4 py-2.5 text-[12.5px] ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200'}`}>{notice.text}</p> : null}
      {serverErrors.length ? <ul role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-[12.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{serverErrors.slice(0, 8).map((item, index) => <li key={index}>{item.topic ? `${item.topic}${item.track ? ` (${item.track.toUpperCase()})` : ''}: ` : ''}{item.message}</li>)}</ul> : null}

      {/* Editor */}
      <section className={card} aria-labelledby="ptp-editor-title" data-guide="ptp-editor">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ptp-editor-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 dark:text-white">Topics<GuideInfo step="ptp-editor" /></h2>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]" role="tablist" aria-label="Track">
            {TRACKS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={track === item.key} onClick={() => setTrack(item.key)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${ring} ${track === item.key ? 'bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-200' : 'text-slate-500 dark:text-zinc-400'}`}>{item.label}</button>)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1"><span className="sr-only">Search topics</span><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics" className={`h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[12.5px] dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 ${ring}`} /></label>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className={`h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] dark:border-white/10 dark:bg-[#1f1f22] dark:text-zinc-100 ${ring}`}>
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-zinc-300"><input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} className="h-4 w-4 accent-violet-600" />Changed from live only</label>
        </div>
        {trackError.length ? <p role="alert" className="mt-2 text-[12px] font-semibold text-rose-600">{trackError.map((key) => key.toUpperCase()).join(' and ')} need at least one topic with weight.</p> : null}
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/[0.08]">
          <table className="w-full min-w-[760px] text-left text-[12.5px]" data-no-serial>
            <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500 dark:bg-white/[0.03] dark:text-zinc-400">
              <tr><th className="px-3 py-2">Topic</th><th className="px-2 py-2">Category</th><th className="px-2 py-2 text-right">Weight</th><th className="px-2 py-2 text-right">Target</th><th className="px-2 py-2 text-right">Priority</th><th className="px-2 py-2 text-right">Score share</th><th className="px-3 py-2">Live</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
              {visible.map((topic) => {
                const row = topic[track];
                const live = activeByKey.get(topic.key)?.[track];
                const rowError = errors.get(topic.key) || {};
                const changed = live && ['weight', 'target', 'priority'].some((field) => live[field] !== row[field]);
                const field = (name, props = {}) => (
                  <input type="number" inputMode="decimal" aria-label={`${topic.label} ${track.toUpperCase()} ${name}`} aria-invalid={Boolean(rowError[`${track}.${name}`])}
                    value={Number.isFinite(row[name]) ? row[name] : ''} onChange={(event) => edit(topic.key, name, event.target.value)}
                    className={`${input} ${rowError[`${track}.${name}`] ? 'border-rose-400' : 'border-slate-200 dark:border-white/10'}`} {...props} />
                );
                return (
                  <tr key={topic.key} className={changed ? 'bg-violet-50/50 dark:bg-violet-500/[0.05]' : row.weight === 0 ? 'text-slate-400' : ''}>
                    <th scope="row" className="px-3 py-1.5 font-semibold text-slate-800 dark:text-zinc-100">{topic.label}{row.weight === 0 ? <span className="ml-1.5 text-[10.5px] font-medium text-slate-400">excluded</span> : null}</th>
                    <td className="px-2 py-1.5 text-[11.5px] text-slate-500 dark:text-zinc-400">{CATEGORY_LABELS[topic.category]}</td>
                    <td className="px-2 py-1.5 text-right">{field('weight', { min: 0, step: 1 })}</td>
                    <td className="px-2 py-1.5 text-right">{field('target', { min: 0, step: 1 })}</td>
                    <td className="px-2 py-1.5 text-right">{field('priority', { min: 0, max: 5, step: 1, disabled: row.weight === 0 })}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-zinc-300">{row.weight > 0 && totals[track] ? `${((100 * row.weight) / totals[track]).toFixed(2)}%` : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] tabular-nums text-slate-400">
                      {changed ? <span className="text-violet-700 dark:text-violet-300">was {live.weight} · {live.target} · P{live.priority}</span> : 'same'}
                      {Object.values(rowError).length ? <span className="block text-rose-600">{Object.values(rowError)[0]}</span> : null}
                    </td>
                  </tr>
                );
              })}
              {!visible.length ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No topics match.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Actions */}
      <section className={`${card} sticky bottom-3 z-10 flex flex-wrap items-end gap-3 shadow-lg`} data-guide="ptp-actions" aria-label="Draft actions">
        <label className="min-w-[220px] flex-1 text-[12px] font-semibold text-slate-600 dark:text-zinc-300">Reason for the change log
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="e.g. Raise Graph PBC target after catalogue growth"
            className={`mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-normal dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 ${ring}`} /></label>
        <button type="button" onClick={saveDraft} disabled={Boolean(busy) || invalid || !unsaved} className={`${button} bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-900`}>{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save draft</button>
        {draft ? <button type="button" onClick={discard} disabled={Boolean(busy)} className={`${button} text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 dark:text-rose-300 dark:ring-rose-400/30`}><Trash2 className="h-4 w-4" />Discard draft</button> : null}
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} disabled={Boolean(busy) || !draft || unsaved || invalid || reason.trim().length < 5}
            title={!draft ? 'Save a draft first' : unsaved ? 'Save your changes first' : reason.trim().length < 5 ? 'Add a reason (5+ characters)' : ''}
            className={`${button} bg-violet-600 text-white hover:bg-violet-700`}><Send className="h-4 w-4" />Publish…</button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-[12.5px] text-violet-900 dark:bg-violet-500/10 dark:text-violet-100">
            Publish draft v{draft.version} for every university?
            <button type="button" onClick={publish} disabled={Boolean(busy)} className={`${button} bg-violet-600 text-white`}>{busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Yes, publish</button>
            <button type="button" onClick={() => setConfirming(false)} className={`${button} text-violet-800 dark:text-violet-200`}>Cancel</button>
          </span>
        )}
      </section>

      {/* Preview */}
      <section className={card} aria-labelledby="ptp-preview-title" data-guide="ptp-preview">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="ptp-preview-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 dark:text-white">Preview impact<GuideInfo step="ptp-preview" /></h2>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400">Calculated on the server from stored evidence. Nothing live changes.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={universityId} onChange={(event) => { setUniversityId(event.target.value); setPreview(null); setUnmapped(null); }} aria-label="University for preview"
              className={`h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] dark:border-white/10 dark:bg-[#1f1f22] dark:text-zinc-100 ${ring}`}>
              <option value="platform">PeerPrep students</option>
              {(workspace.universities || []).map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}
            </select>
            <button type="button" onClick={runPreview} disabled={Boolean(busy) || invalid} className={`${button} bg-violet-600 text-white hover:bg-violet-700`}>{busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Run preview</button>
          </div>
        </div>
        {preview ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {['sbc', 'pbc'].map((key) => {
              const cohort = preview.cohort[key];
              return (
                <div key={key} className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03]">
                  <p className="text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{key.toUpperCase()} · {preview.cohort.withEvidence} students with evidence{preview.cohort.capped ? ' (first 3,000)' : ''}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {['before', 'after'].map((side) => (
                      <div key={side}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{side === 'before' ? `Live v${active.version}` : 'Draft'}</p>
                        <Bars buckets={cohort[side].buckets} color={side === 'before' ? '#94a3b8' : '#7c3aed'} />
                        <p className="mt-1 text-[11.5px] tabular-nums text-slate-600 dark:text-zinc-300">median {cohort[side].median ?? '—'} · mean {cohort[side].mean ?? '—'} · {cohort[side].met} met target</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] text-slate-500 dark:text-zinc-400">Weight total {preview.totals.active[key].weight} → {preview.totals.draft[key].weight}</p>
                </div>
              );
            })}
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03] lg:col-span-2">
              <p className="text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">Catalogue capacity · {preview.catalogue.total} practice problems ({preview.catalogue.unmapped} without a recognised topic)</p>
              <p className="text-[11.5px] text-slate-500 dark:text-zinc-400">Topics where even solving every available problem cannot reach the target: a catalogue shortage, not a student practice gap.</p>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-[12px]" data-no-serial>
                  <thead className="text-[10.5px] uppercase text-slate-400"><tr><th className="py-1 text-left">Topic</th><th className="py-1 text-left">Track</th><th className="py-1 text-right">E/M/H available</th><th className="py-1 text-right">Max points</th><th className="py-1 text-right">Target</th><th className="py-1 text-right">Short by</th></tr></thead>
                  <tbody>
                    {preview.catalogue.capacity.flatMap((row) => ['sbc', 'pbc'].filter((key) => row[key].short).map((key) => (
                      <tr key={`${row.key}:${key}`} className="border-t border-slate-200/70 dark:border-white/[0.06]">
                        <td className="py-1">{topics.find((topic) => topic.key === row.key)?.label}</td><td className="py-1">{key.toUpperCase()}</td>
                        <td className="py-1 text-right tabular-nums">{row.counts.Easy}/{row.counts.Medium}/{row.counts.Hard}</td>
                        <td className="py-1 text-right tabular-nums">{row[key].points}</td><td className="py-1 text-right tabular-nums">{row[key].target}</td>
                        <td className="py-1 text-right font-semibold tabular-nums text-amber-700 dark:text-amber-300">{row[key].missing}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : <p className="mt-3 text-[12.5px] text-slate-500 dark:text-zinc-400">Run a preview to compare score distributions and catalogue reach for the chosen university.</p>}
      </section>

      {/* Unmapped questions */}
      <section className={card} aria-labelledby="ptp-unmapped-title" data-guide="ptp-unmapped">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="ptp-unmapped-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 dark:text-white"><Tags className="h-4 w-4 text-violet-600" aria-hidden="true" />Questions without a readiness topic</h2>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400">Their accepted solves are recorded; readiness credit starts once you choose the topic (audited).</p>
          </div>
          <button type="button" onClick={loadUnmapped} disabled={Boolean(busy)} className={`${button} ring-1 ring-slate-200 hover:bg-slate-50 dark:ring-white/10`}>{busy === 'unmapped' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Check catalogue</button>
        </div>
        {unmapped ? (unmapped.items.length ? (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.05]">
            {unmapped.items.map((item) => (
              <li key={item.problemKey} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1"><b className="text-slate-800 dark:text-zinc-100">{item.title}</b> <span className="text-slate-400">· {item.difficulty} · tags: {item.tags.join(', ') || 'none'}</span></span>
                <select value={mapping[item.problemKey] || ''} onChange={(event) => setMapping((current) => ({ ...current, [item.problemKey]: event.target.value }))} aria-label={`Topic for ${item.title}`}
                  className={`h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] dark:border-white/10 dark:bg-[#1f1f22] dark:text-zinc-100 ${ring}`}>
                  <option value="">Choose topic…</option>
                  {topics.map((topic) => <option key={topic.key} value={topic.key}>{topic.label}</option>)}
                </select>
                <button type="button" onClick={() => saveMapping(item)} disabled={!mapping[item.problemKey] || Boolean(busy)} className={`${button} bg-violet-600 py-1.5 text-white`}>Save</button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-[12.5px] text-emerald-700 dark:text-emerald-300">Every practice question in this catalogue has a readiness topic.</p>) : null}
      </section>

      {/* History */}
      <section className={card} aria-labelledby="ptp-history-title" data-guide="ptp-history">
        <h2 id="ptp-history-title" className="flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 dark:text-white"><History className="h-4 w-4 text-slate-500" aria-hidden="true" />Version history</h2>
        {workspace.history?.length ? (
          <ul className="mt-2 divide-y divide-slate-100 text-[12.5px] dark:divide-white/[0.05]">
            {workspace.history.map((row) => (
              <li key={row.version} className="flex flex-wrap items-center gap-2 py-2">
                <b className="text-slate-800 dark:text-zinc-100">v{row.version}</b>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${row.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06]'}`}>{row.status}</span>
                <span className="text-slate-500 dark:text-zinc-400">{row.publishedAt ? new Date(row.publishedAt).toLocaleString() : ''}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-zinc-300">{row.changeReason}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-[12.5px] text-slate-500 dark:text-zinc-400">No published versions yet. The built-in default (v1) is live.</p>}
      </section>
    </div>
  );
}
