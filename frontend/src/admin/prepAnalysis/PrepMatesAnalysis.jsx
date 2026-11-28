import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Users, UserRoundCheck, Clock3, Send, GitPullRequestArrow } from 'lucide-react';
import AnalysisHeader from './components/AnalysisHeader';
import { prepAnalysisApi } from './api';
import { rangeToQuery } from '../../components/dateRange/dateRangeModel';

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900';
const field = 'h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white';
const number = (value) => Number(value || 0).toLocaleString();

function Stat({ label, value, Icon, hint }) {
  return <div className={card}>
    <div className="flex items-center justify-between gap-2 text-sm text-slate-500 dark:text-gray-400"><span>{label}</span><Icon size={18} className="text-sky-600" /></div>
    <p className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{number(value)}</p>
    {hint && <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{hint}</p>}
  </div>;
}

export default function PrepMatesAnalysis() {
  const navigate = useNavigate();
  const [areas, setAreas] = useState([]);
  const [period, setPeriod] = useState({ preset: '30d' });
  const [college, setCollege] = useState('');
  const [semester, setSemester] = useState('');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    prepAnalysisApi.catalog(controller.signal).then((catalog) => setAreas([...catalog.areas, { key: 'peers', label: 'Prep Mates' }]))
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught.message); });
    return () => controller.abort();
  }, []);
  const params = useMemo(() => ({ ...rangeToQuery(period), college, semester, search, page }), [period, college, semester, search, page]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    prepAnalysisApi.peers(params, controller.signal)
      .then((result) => { setData(result); setError(''); setLoading(false); })
      .catch((caught) => { if (caught.name !== 'AbortError') { setError(caught.message); setLoading(false); } });
    return () => controller.abort();
  }, [params, refresh]);
  const summary = data?.summary;
  const maxTrend = Math.max(1, ...(data?.trend || []).map((point) => point.requests + point.pings));
  const trend = (data?.trend || []).slice(-30);
  return <main className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-gray-950 dark:text-white">
    <AnalysisHeader areas={areas} area="peers" onArea={(key) => navigate(`/admin/analysis?area=${encodeURIComponent(key)}`)} period={period}
      onPeriod={(next) => { setPeriod(next); setPage(1); }}>
      <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} className={`${field} inline-flex items-center gap-2 font-semibold`}>
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh
      </button>
    </AnalysisHeader>
    <div className="mx-auto max-w-[1680px] space-y-5 px-4 py-6">
      <div>
        <h2 className="text-xl font-bold">Prep Mates analysis</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">See who can connect, current mates and requests, and Prep Pings sent in the selected period.</p>
      </div>
      <form className={`${card} flex flex-wrap items-end gap-3`} onSubmit={(event) => { event.preventDefault(); setSearch(draftSearch.trim()); setPage(1); }}>
        <label className="flex min-w-44 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-gray-300">Campus
          <select className={field} value={college} onChange={(event) => { setCollege(event.target.value); setPage(1); }}><option value="">All campuses</option>{data?.options.colleges.map((name) => <option key={name} value={name}>{name}</option>)}</select>
        </label>
        <label className="flex min-w-32 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-gray-300">Semester
          <select className={field} value={semester} onChange={(event) => { setSemester(event.target.value); setPage(1); }}><option value="">All semesters</option>{data?.options.semesters.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-gray-300">Student
          <input className={field} value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Name, email or student ID" maxLength={100} />
        </label>
        <button type="submit" className="h-9 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">Search</button>
        {search && <button type="button" className="h-9 px-2 text-sm text-sky-700 dark:text-sky-300" onClick={() => { setDraftSearch(''); setSearch(''); setPage(1); }}>Clear</button>}
      </form>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950">{error}</div>}
      {summary && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Eligible students" value={summary.eligible} Icon={Users} hint="Visible, active students with Prep Mates access" />
          <Stat label="Connected students" value={summary.connected} Icon={UserRoundCheck} hint="At least one current mate" />
          <Stat label="Accepted connections" value={summary.acceptedLinks} Icon={GitPullRequestArrow} hint="Current student pairs" />
          <Stat label="Pending requests" value={summary.pendingRequests} Icon={Clock3} hint="Awaiting a response now" />
          <Stat label="Prep Pings" value={summary.pings} Icon={Send} hint="Sent in the selected period" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h3 className="font-bold">Requests and Pings</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{number(summary.latestRequests)} latest saved requests and {number(summary.pings)} Pings in this period.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {Object.entries(summary.requestStatus).map(([status, count]) => <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1 capitalize text-slate-700 dark:bg-gray-800 dark:text-gray-300">{status}: {number(count)}</span>)}
            </div>
            {trend.length ? <div className="mt-5 flex h-36 items-end gap-1 overflow-x-auto" aria-label="Daily requests and Prep Pings">
              {trend.map((point) => <div key={point.day} className="group relative flex min-w-3 flex-1 flex-col items-center justify-end gap-0.5" title={`${point.day}: ${point.requests} requests, ${point.pings} Pings`}>
                <div className="w-full rounded-t-sm bg-sky-600" style={{ height: `${Math.max(2, point.requests / maxTrend * 120)}px` }} />
                <div className="w-full rounded-b-sm bg-emerald-500" style={{ height: `${Math.max(2, point.pings / maxTrend * 120)}px` }} />
              </div>)}
            </div> : <p className="mt-8 text-sm text-slate-500">No requests or Pings in this period.</p>}
            <div className="mt-3 flex gap-4 text-xs text-slate-500"><span>■ <span className="text-sky-600">Requests</span></span><span>■ <span className="text-emerald-500">Pings</span></span></div>
          </section>
          <section className={card}>
            <h3 className="font-bold">Coding activity comparison</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Average distinct locally submitted practice problems accepted per student in this period. Descriptive comparison only.</p>
            {[['With a mate', summary.averageSolvedConnected, summary.connected], ['Without a mate', summary.averageSolvedUnconnected, summary.eligible - summary.connected]].map(([label, value, count]) => <div key={label} className="mt-5">
              <div className="mb-1 flex justify-between text-sm"><span>{label} <span className="text-slate-400">({number(count)})</span></span><strong>{value}</strong></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800"><div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.max(0, Math.min(100, value / Math.max(1, summary.averageSolvedConnected, summary.averageSolvedUnconnected) * 100))}%` }} /></div>
            </div>)}
          </section>
        </div>
        <section className={card}>
          <h3 className="font-bold">Students</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Select a student to see their current mates, request counts, Pings, and local coding activity.</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-gray-700"><tr><th className="py-3">Student</th><th>Campus / semester</th><th>Current mates</th><th>Pending</th><th>Pings sent</th><th>Practice solved</th></tr></thead>
            <tbody>{data.students.rows.map((row) => <tr key={row.id} className="border-b border-slate-100 dark:border-gray-800">
              <td className="py-3"><button type="button" className="font-semibold text-sky-700 hover:underline dark:text-sky-300" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{row.name}</button><div className="text-xs text-slate-500">{row.studentId || row.email}</div>
                {expanded === row.id && <div className="mt-3 max-w-lg space-y-1 rounded-xl bg-slate-100 p-3 text-xs text-slate-700 dark:bg-gray-800 dark:text-gray-300"><p><strong>Current mates:</strong> {row.mateNames.length ? row.mateNames.join(', ') : 'None'}</p><p><strong>Pending:</strong> {row.pendingSent} sent, {row.pendingReceived} received</p><p><strong>Latest saved requests:</strong> {row.requests} sent in this period</p><p><strong>Prep Pings:</strong> {row.pingsSent} sent, {row.pingsReceived} received</p><p><strong>Accepted practice problems:</strong> {row.solved}</p></div>}</td>
              <td>{row.college || '—'}{row.semester ? ` · ${row.semester}` : ''}</td><td>{row.mates}</td><td>{row.pendingSent + row.pendingReceived}</td><td>{row.pingsSent}</td><td>{row.solved}</td>
            </tr>)}</tbody>
          </table>{!data.students.total && <p className="py-8 text-center text-sm text-slate-500">No eligible students match these filters.</p>}</div>
          {data.students.pages > 1 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" className="rounded-lg border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {data.students.pages}</span><button type="button" className="rounded-lg border px-3 py-1 disabled:opacity-40" disabled={page >= data.students.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
        </section>
        <p className="text-xs text-slate-500 dark:text-gray-400">{data.note}</p>
      </>}
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw size={14} className="animate-spin" />Loading Prep Mates analysis…</p>}
    </div>
  </main>;
}
