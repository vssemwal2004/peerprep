import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, ExternalLink, Power } from 'lucide-react';
import { api } from '../../utils/api';
import ProgressionEditor from '../platform/ProgressionEditor';
import { useAction, useUniversities } from './useUniversities';
import { portalUrl, STATUS_META, universityHealth } from './universityModel';
import { Button, Card, EmptyState, LoadingBlock, Notice, pageShell, Pill, helper } from './ui';
import UniversityBadge from './UniversityBadge';
import OverviewTab from './detail/OverviewTab';
import ProfileTab from './detail/ProfileTab';
import ModulesTab from './detail/ModulesTab';
import PlanTab from './detail/PlanTab';
import ConnectionsTab from './detail/ConnectionsTab';
import StudentsTab from './detail/StudentsTab';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'profile', label: 'Profile & logo' },
  { key: 'modules', label: 'Modules' },
  { key: 'plan', label: 'Plan & Prep Coins' },
  { key: 'connections', label: 'Connections' },
  { key: 'progression', label: 'Level progression' },
  { key: 'students', label: 'Students' },
];

/** One university, managed in focused tabs instead of one long form. */
export default function UniversityDetail() {
  const { universityId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { universities, defaults, loading, error, reload } = useUniversities();
  const { busy, message, run } = useAction(reload);
  const university = useMemo(() => universities.find((row) => row.universityId === universityId), [universities, universityId]);
  const tab = TABS.some((item) => item.key === params.get('tab')) ? params.get('tab') : 'overview';
  const tabLink = useCallback((key) => `/admin/universities/${universityId}?tab=${key}`, [universityId]);

  if (loading) return <LoadingBlock label="Loading university…" />;
  if (!university) {
    return <div className={pageShell}>{error && <Notice tone="danger">{error}</Notice>}<Card><EmptyState icon={Building2} title="University not found" action={<Link to="/admin/universities/all" className="text-sm font-semibold text-sky-700 hover:underline">Back to all universities</Link>}>It may have been removed, or the link is wrong.</EmptyState></Card></div>;
  }

  const health = universityHealth(university);
  const status = STATUS_META[health.status];
  const remove = () => {
    if (!window.confirm(`Remove ${university.name} (${university.universityId}) from PeerPrep? Its shared assessment access is revoked. Its own database stays intact.`)) return;
    run('delete', () => api.deleteUniversity(university.universityId)).then((result) => { if (result) navigate('/admin/universities/all'); });
  };
  const props = { university, defaults, run, busy, tabLink };

  return (
    <div className={pageShell}>
      <Link to="/admin/universities/all" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-sky-700 dark:text-slate-400"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All universities</Link>

      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-4">
          <UniversityBadge university={university} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{university.name}</h1><Pill tone={status.tone}>{status.label}</Pill></div>
            <p className={`mt-1 ${helper}`}><span className="font-mono">{university.universityId}</span> · peerprep.co.in/u/{university.universityId}{university.contactEmail ? ` · ${university.contactEmail}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={portalUrl(university)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" aria-hidden="true" />Open portal</a>
          <Button variant={university.active ? 'danger' : 'primary'} icon={Power} busy={busy === 'active'}
            onClick={() => run('active', () => api.updateUniversity(university.universityId, { active: !university.active }), university.active ? 'University disabled: its users cannot sign in.' : 'University enabled.')}>
            {university.active ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </header>

      {params.get('created') && <Notice tone="success">University created. Its first admin can now sign in at peerprep.co.in/u/{university.universityId} and must change the starting password.</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-slate-800 dark:bg-slate-900" role="tablist" aria-label="University sections">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setParams({ tab: item.key })}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === item.key ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            {item.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" key={tab}>
        {tab === 'overview' && <OverviewTab {...props} onDelete={remove} />}
        {tab === 'profile' && <ProfileTab {...props} />}
        {tab === 'modules' && <ModulesTab {...props} />}
        {tab === 'plan' && <PlanTab key={`${university.serviceStartDate}|${university.serviceEndDate}|${university.coordinatorLimit}|${university.studentLimit}`} {...props} />}
        {tab === 'connections' && <ConnectionsTab {...props} />}
        {tab === 'progression' && (
          <Card id="progression-title" title="Level progression" description="How quickly this university's students move up levels. Starts from the platform defaults.">
            {defaults?.progression
              ? <ProgressionEditor defaultOpen scopeLabel={university.name} stored={university.progression} permissions={university.permissions} disabled={Boolean(busy)} resetSource={defaults.progression}
                onSave={(body) => api.updateUniversity(university.universityId, body)} onSaved={reload} />
              : <p className={helper}>Level progression is not available on this server yet.</p>}
          </Card>
        )}
        {tab === 'students' && <StudentsTab {...props} />}
      </div>
    </div>
  );
}
