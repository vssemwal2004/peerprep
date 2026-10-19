import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Search } from 'lucide-react';
import { api } from '../../utils/api';
import { Button, Card, EmptyState, LoadingBlock, Notice, PageHeader, pageShell, Pill, helper, inputClass } from './ui';

const sameSet = (left = [], right = []) => left.length === right.length && left.every((value) => right.includes(value));
const when = (value) => (value ? new Date(value).toLocaleDateString() : null);

/** Which universities can use each PeerPrep assessment. Public questions are shared automatically. */
export default function SharedAssessments() {
  const [data, setData] = useState(null);
  const [universities, setUniversities] = useState([]);
  const [selection, setSelection] = useState({});
  const [query, setQuery] = useState('');
  const [view, setView] = useState('all');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    const [overview, catalog] = await Promise.all([api.platformOverview(), api.platformPublications()]);
    setUniversities(overview.universities || []);
    setData(catalog);
    setSelection(Object.fromEntries(catalog.assessments.map((row) => [String(row._id), catalog.publications.find((item) => String(item.contentId) === String(row._id))?.universityIds || []])));
  }, []);
  useEffect(() => { load().catch((error) => setMessage({ tone: 'danger', text: error.message || 'Assessments could not be loaded.' })); }, [load]);

  const rows = useMemo(() => (data?.assessments || []).map((assessment) => {
    const id = String(assessment._id);
    const publication = data.publications.find((item) => String(item.contentId) === id);
    return { assessment, id, published: Boolean(publication?.published), saved: publication?.universityIds || [] };
  }), [data]);
  const visible = rows.filter((row) => (view === 'all' || (view === 'shared' ? row.published : !row.published))
    && (!query.trim() || String(row.assessment.title || '').toLowerCase().includes(query.trim().toLowerCase())));

  async function save(row, published) {
    setBusy(row.id); setMessage(null);
    try {
      await api.publishPlatformContent('assessment', row.id, { published, universityIds: selection[row.id] || [] });
      await load();
      setMessage({ tone: 'success', text: published ? `"${row.assessment.title}" is shared with ${(selection[row.id] || []).length} universit${(selection[row.id] || []).length === 1 ? 'y' : 'ies'}.` : `"${row.assessment.title}" is hidden from every university.` });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message || 'Access could not be saved.' });
    } finally { setBusy(''); }
  }
  const toggle = (rowId, universityId, on) => setSelection((previous) => {
    const current = previous[rowId] || [];
    return { ...previous, [rowId]: on ? [...current, universityId] : current.filter((value) => value !== universityId) };
  });

  if (!data && !message) return <LoadingBlock label="Loading assessments…" />;
  return (
    <div className={pageShell}>
      <PageHeader title="Shared assessments" description="Choose which universities can use each PeerPrep assessment. Public, published questions are shared with every university automatically." />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[16rem] flex-1">
            <span className="sr-only">Search assessments</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assessments" />
          </label>
          <select className={`${inputClass} w-auto`} value={view} onChange={(event) => setView(event.target.value)} aria-label="Show">
            <option value="all">All assessments</option><option value="shared">Shared</option><option value="hidden">Not shared</option>
          </select>
        </div>
        <div className="mt-4 space-y-3">
          {visible.length === 0 ? <EmptyState icon={ClipboardCheck} title={rows.length ? 'No assessment matches' : 'No assessments yet'}>{rows.length ? 'Try another search.' : 'Assessments created in the PeerPrep admin appear here.'}</EmptyState> : visible.map((row) => {
            const chosen = selection[row.id] || [];
            const dirty = !sameSet(chosen, row.saved);
            const dates = [when(row.assessment.startTime), when(row.assessment.endTime)].filter(Boolean).join(' – ');
            return (
              <article key={row.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.assessment.title || 'Untitled assessment'}</h2><Pill tone={row.published ? 'success' : 'neutral'}>{row.published ? `Shared · ${row.saved.length}` : 'Not shared'}</Pill>{dirty && <Pill tone="warning">Unsaved</Pill>}</div>
                    <p className={`mt-0.5 ${helper}`}>{[row.assessment.lifecycleStatus === 'draft' ? 'Draft' : 'Published', dates].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setSelection((previous) => ({ ...previous, [row.id]: chosen.length === universities.length ? [] : universities.map((u) => u.universityId) }))}>{chosen.length === universities.length ? 'Clear all' : 'Select all'}</Button>
                    {row.published && <Button variant="secondary" busy={busy === row.id} onClick={() => save(row, false)}>Stop sharing</Button>}
                    <Button busy={busy === row.id} disabled={!chosen.length || (row.published && !dirty)} onClick={() => save(row, true)}>{row.published ? 'Save access' : 'Share'}</Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {universities.map((university) => {
                    const on = chosen.includes(university.universityId);
                    return (
                      <label key={university.universityId} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}`}>
                        <input type="checkbox" className="h-3.5 w-3.5 accent-sky-600" checked={on} onChange={(event) => toggle(row.id, university.universityId, event.target.checked)} />{university.name}
                      </label>
                    );
                  })}
                  {!universities.length && <p className={helper}>Add a university first.</p>}
                </div>
              </article>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
