import { useEffect, useState } from 'react';
import { Globe2, ShieldCheck } from 'lucide-react';
import StudentDashboardHeader from '../components/StudentDashboardHeader';
import UniversityRankCard from './profile/UniversityRankCard';
import GlobalRankCard from './profile/GlobalRankCard';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function StudentRankings() {
  const { user } = useAuth();
  const identity = user?._id || user?.id;
  const [state, setState] = useState({ loading: true, data: null, error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ identity, loading: true, data: null, error: false });
    api.getStudentRanking(true).then((result) => { if (active) setState({ identity, loading: false, data: result.ranking, error: false }); })
      .catch(() => { if (active) setState({ identity, loading: false, data: null, error: true }); });
    return () => { active = false; };
  }, [retry, identity]);
  const current = state.identity === identity ? state : { loading: true, data: null, error: false };
  return <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#1a1a1a] dark:text-zinc-100">
    <StudentDashboardHeader />
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 to-blue-800 p-6 text-white sm:p-8">
        <Globe2 className="absolute -right-8 -top-8 h-52 w-52 opacity-10" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-100">Your progress, in perspective</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your rankings</h1>
        <p className="mt-2 max-w-md text-sm text-sky-100">One verified Prep Score from your own work. Your position at university and across connected universities.</p>
      </header>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <div><UniversityRankCard ranking={current.data} loading={current.loading} />{current.error && <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 rounded text-sm font-semibold text-sky-600 focus-visible:outline focus-visible:outline-2">Retry university ranking</button>}</div>
        <GlobalRankCard showLink={false} scoreRevision={current.data?.score} />
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500 dark:text-zinc-400"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />Private by design: no student names, contact details or profiles are shared in global rankings. Equal scores share a rank. Global results reflect the latest synced Prep Scores; universities with stale or disabled access are excluded.</p>
    </main>
  </div>;
}
