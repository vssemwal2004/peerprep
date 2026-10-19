import { useCallback, useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../../utils/api';
import { useUniversities } from './useUniversities';
import { actionLabel } from './universityModel';
import { Button, Card, EmptyState, Notice, PageHeader, pageShell, helper, inputClass } from './ui';

const KINDS = [
  { value: '', label: 'All activity' },
  { value: 'university', label: 'Universities' },
  { value: 'publication', label: 'Shared assessments' },
  { value: 'prep_score', label: 'Prep Score' },
  { value: 'prep_coin', label: 'Prep Coin' },
  { value: 'platform', label: 'Platform Prep Coins' },
];
const dayLabel = (date) => new Date(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Who changed what across the platform, newest first, filtered by university and kind. */
export default function UniversityActivity() {
  const { universities } = useUniversities();
  const [universityId, setUniversityId] = useState('');
  const [action, setAction] = useState('');
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (before = '') => {
    setLoading(true); setError('');
    try {
      const page = await api.platformAudit({ universityId, action, before });
      setEntries((previous) => (before ? [...previous, ...page.entries] : page.entries));
      setCursor(page.nextCursor);
    } catch (cause) { setError(cause.message || 'Activity could not be loaded.'); }
    finally { setLoading(false); }
  }, [universityId, action]);
  useEffect(() => { void load(); }, [load]);

  const names = useMemo(() => new Map(universities.map((university) => [university.universityId, university.name])), [universities]);
  const days = useMemo(() => {
    const groups = new Map();
    for (const entry of entries) {
      const key = new Date(entry.createdAt).toDateString();
      if (!groups.has(key)) groups.set(key, { label: dayLabel(entry.createdAt), entries: [] });
      groups.get(key).entries.push(entry);
    }
    return [...groups.values()];
  }, [entries]);

  return (
    <div className={`${pageShell} max-w-5xl`}>
      <PageHeader title="Activity log" description="Every change a Master Admin makes to universities, shared assessments, Prep Score and Prep Coin, and every time student records are viewed." />
      <Card>
        <div className="flex flex-wrap gap-3">
          <select className={`${inputClass} w-auto`} value={universityId} onChange={(event) => setUniversityId(event.target.value)} aria-label="University">
            <option value="">All universities</option>
            {universities.map((university) => <option key={university.universityId} value={university.universityId}>{university.name}</option>)}
          </select>
          <select className={`${inputClass} w-auto`} value={action} onChange={(event) => setAction(event.target.value)} aria-label="Kind of activity">
            {KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </div>
        {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
        <div className="mt-5 space-y-6">
          {!loading && entries.length === 0 ? <EmptyState icon={History} title="No activity">Nothing matches these filters yet.</EmptyState> : days.map((day) => (
            <section key={day.label}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{day.label}</h2>
              <ol className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {day.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900 dark:text-white">{actionLabel(entry.action)}</span>
                      <span className={helper}>{[entry.universityId && (names.get(entry.universityId) || entry.universityId), `by ${entry.actorName}`, entry.details?.reason].filter(Boolean).join(' · ')}</span>
                    </span>
                    <time className={`shrink-0 tabular-nums ${helper}`} dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        {cursor && <div className="mt-5 flex justify-center"><Button variant="secondary" busy={loading} onClick={() => load(cursor)}>Load older activity</Button></div>}
        {loading && !entries.length && <p className={`mt-4 ${helper}`}>Loading…</p>}
      </Card>
    </div>
  );
}
