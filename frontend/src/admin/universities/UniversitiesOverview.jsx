import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, Building2, ClipboardCheck, PlusCircle, SlidersHorizontal } from 'lucide-react';
import { useUniversities } from './useUniversities';
import { actionLabel, STATUS_META, universityHealth } from './universityModel';
import { ButtonLink, Card, EmptyState, LoadingBlock, Notice, PageHeader, pageShell, Pill, Stat, helper } from './ui';
import UniversityBadge from './UniversityBadge';

const STEPS = [
  { title: 'Add the university', text: 'Connect its database and code judge, and create its first admin.', to: '/admin/universities/new', icon: PlusCircle },
  { title: 'Choose what it gets', text: 'Turn modules on or off; new universities start from your defaults.', to: '/admin/universities/defaults', icon: SlidersHorizontal },
  { title: 'Share assessments', text: 'Give universities access to PeerPrep assessments.', to: '/admin/universities/assessments', icon: ClipboardCheck },
  { title: 'Students sign in', text: 'Each university admin creates students; they sign in at the university link.', to: '/admin/universities/all', icon: Building2 },
];

/** Universities home: how many, which need action, and what changed recently. */
export default function UniversitiesOverview() {
  const { universities, overview, loading, error } = useUniversities();
  if (loading) return <LoadingBlock label="Loading universities…" />;
  const rows = universities.map((university) => ({ university, health: universityHealth(university) }));
  const live = rows.filter((row) => row.health.status === 'live' || row.health.status === 'expiring').length;
  const attention = rows.filter((row) => row.health.needsAttention);
  const ending = rows.filter((row) => row.health.status === 'expiring').length;
  const coins = universities.reduce((sum, university) => sum + Number(university.coinBalance || 0), 0);

  return (
    <div className={pageShell}>
      <PageHeader title="Universities overview" description="Every university runs on the same PeerPrep website with its own database, code judge and admins."
        actions={<><ButtonLink to="/admin/universities/all" variant="secondary">All universities</ButtonLink><ButtonLink to="/admin/universities/new" icon={PlusCircle}>Add university</ButtonLink></>} />
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Universities" value={universities.length} />
        <Stat label="Live now" value={live} />
        <Stat label="Need attention" value={attention.length} tone={attention.length ? 'warning' : undefined} />
        <Stat label="Ending within 30 days" value={ending} tone={ending ? 'warning' : undefined} />
        <Stat label="Prep Coins with universities" value={coins.toLocaleString()} />
      </div>

      {universities.length === 0 ? (
        <Card><EmptyState icon={Building2} title="No universities yet" action={<ButtonLink to="/admin/universities/new" icon={PlusCircle}>Add your first university</ButtonLink>}>Add a university to give its students their own PeerPrep portal.</EmptyState></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card id="attention-title" title="Needs attention" icon={AlertTriangle} description="Missing setup, or a service period that has ended or ends soon.">
            {attention.length === 0 ? <p className={helper}>Every university is set up and within its service period.</p> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {attention.map(({ university, health }) => (
                  <li key={university.universityId}>
                    <Link to={`/admin/universities/${university.universityId}`} className="flex items-center gap-3 py-3 hover:opacity-90">
                      <UniversityBadge university={university} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{university.name}</span>
                        <span className={`block truncate ${helper}`}>{health.issues[0] || (health.status === 'expired' ? 'Service period has ended' : `Service ends in ${health.daysLeft} day${health.daysLeft === 1 ? '' : 's'}`)}{health.issues.length > 1 ? ` · +${health.issues.length - 1} more` : ''}</span>
                      </span>
                      <Pill tone={STATUS_META[health.status].tone}>{STATUS_META[health.status].label}</Pill>
                      <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card id="recent-title" title="Recent activity" icon={Activity} actions={<Link to="/admin/universities/activity" className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">View all</Link>}>
            {(overview?.audit || []).length === 0 ? <p className={helper}>Nothing has changed yet.</p> : (
              <ul className="space-y-3">
                {overview.audit.slice(0, 7).map((row) => (
                  <li key={row._id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0"><span className="block font-medium text-slate-800 dark:text-slate-200">{actionLabel(row.action)}</span>{row.universityId && <span className={helper}>{universities.find((u) => u.universityId === row.universityId)?.name || row.universityId}</span>}</span>
                    <time className={`shrink-0 ${helper}`} dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleDateString()}</time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card id="flow-title" title="How a university goes live">
        <ol className="grid gap-3 md:grid-cols-4">
          {STEPS.map(({ title, text, to, icon: Icon }, index) => (
            <li key={title}>
              <Link to={to} className="flex h-full flex-col rounded-xl border border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-slate-800 dark:hover:border-sky-800 dark:hover:bg-sky-950/20">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-600"><Icon className="h-4 w-4" aria-hidden="true" />Step {index + 1}</span>
                <span className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
                <span className={`mt-1 ${helper}`}>{text}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
