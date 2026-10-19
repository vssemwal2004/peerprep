import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { api } from '../../utils/api';
import { card, helperText, inputClass, sectionTitle } from './fields';

const PLATFORM = { id: 'platform', name: 'PeerPrep students (no university)' };

function Stat({ label, value }) {
  return <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60"><p className={helperText}>{label}</p><p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{value}</p></div>;
}

function RecalculationStatus({ status }) {
  if (!status) return null;
  if (status.rebuilding) {
    return <p className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Recalculating for version {status.rebuildVersion} · {status.processed.toLocaleString()} students done. Students see version {status.servingVersion} until it finishes.</p>;
  }
  return <p className={helperText}>{status.servingVersion ? `Scores here are on version ${status.servingVersion}.` : 'Scores here have not been calculated yet; they are built on first use.'}</p>;
}

/** Runs the values on screen against one university's real students, without saving anything. */
export default function ImpactPanel({ config, universities = [], disabled }) {
  const options = [PLATFORM, ...universities];
  const [universityId, setUniversityId] = useState(options[0].id);
  const [impact, setImpact] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setImpact(null);
    api.prepScoreSyncStatus(universityId).then((value) => { if (live) setStatus(value); }).catch(() => { if (live) setStatus(null); });
    return () => { live = false; };
  }, [universityId]);

  async function run() {
    setBusy(true); setError('');
    try { setImpact(await api.prepScoreImpact({ config, universityId })); }
    catch (requestError) { setError(requestError.message || 'The preview could not be run.'); }
    finally { setBusy(false); }
  }

  return (
    <section className={card} aria-labelledby="impact-title">
      <div className="flex items-center gap-2"><Users className="h-5 w-5 text-sky-600" aria-hidden="true" /><h2 id="impact-title" className={sectionTitle}>Impact on real students</h2></div>
      <p className={`mt-1 ${helperText}`}>Compares students' current scores with the values on this page. Nothing is saved or shown to students.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-[14rem] flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200">University
          <select className={`${inputClass} mt-1`} value={universityId} onChange={(event) => setUniversityId(event.target.value)}>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={run} disabled={busy || disabled} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}Run preview
        </button>
      </div>
      <div className="mt-2"><RecalculationStatus status={status} /></div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {impact && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Students with work" value={impact.withProgress.toLocaleString()} />
            <Stat label="Scores that change" value={impact.scoreChanged.toLocaleString()} />
            <Stat label="Ranks that change" value={impact.rankChanged.toLocaleString()} />
            <Stat label="Average score" value={`${impact.averageBefore} → ${impact.averageAfter}`} />
          </div>
          {impact.truncated && <p className={helperText}>Compared the first {impact.studentsCompared.toLocaleString()} students.</p>}
          {impact.top.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm" data-no-serial>
                <caption className={`mb-2 text-left ${helperText}`}>Top {impact.top.length} with these values</caption>
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 text-left font-semibold">Student</th><th className="py-2 text-right font-semibold">Now</th><th className="py-2 text-right font-semibold">With these values</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {impact.top.map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <td className="py-2 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
                      <td className="py-2 text-right tabular-nums text-slate-500">{row.before.score} <span className="text-xs">(#{row.before.rank ?? '–'})</span></td>
                      <td className="py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{row.after.score} <span className="text-xs font-normal text-slate-500">(#{row.after.rank ?? '–'})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
