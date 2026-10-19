import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { enabledModules, MODULES, STATUS_META, universityHealth } from '../universityModel';
import { Button, Card, Pill, helper } from '../ui';

const TAB_FOR_ISSUE = {
  'Database not connected': 'connections',
  'Code judge (Judge0) not connected': 'connections',
  'Service dates not set': 'plan',
  'Account limits not set': 'plan',
};

function Fact({ label, value, to }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
      <p className={helper}>{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
      {to && <Link to={to} className="mt-1 inline-block text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">Change</Link>}
    </div>
  );
}

export default function OverviewTab({ university, tabLink, onDelete, busy }) {
  const health = universityHealth(university);
  const modules = enabledModules(university);
  const service = university.serviceStartDate && university.serviceEndDate ? `${university.serviceStartDate} to ${university.serviceEndDate}` : 'Not set';
  return (
    <div className="space-y-5">
      <Card id="setup-title" title={health.issues.length ? 'Finish setting up' : 'Setup complete'} icon={health.issues.length ? AlertTriangle : CheckCircle2}
        description={health.issues.length ? 'Students cannot use every feature until these are done.' : 'Database, code judge, service period and limits are all set.'}>
        {health.issues.length > 0 && (
          <ul className="space-y-2">
            {health.issues.map((issue) => (
              <li key={issue} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm dark:border-amber-500/30 dark:bg-amber-500/5">
                <span className="text-amber-900 dark:text-amber-200">{issue}</span>
                <Link to={tabLink(TAB_FOR_ISSUE[issue] || 'overview')} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">Fix this</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Status" value={<Pill tone={STATUS_META[health.status].tone}>{STATUS_META[health.status].label}</Pill>} />
        <Fact label="Service period" value={health.daysLeft !== null && health.daysLeft >= 0 ? `${service} · ${health.daysLeft} days left` : service} to={tabLink('plan')} />
        <Fact label="Account limits" value={`${university.coordinatorLimit ?? '—'} coordinators · ${university.studentLimit ?? '—'} students`} to={tabLink('plan')} />
        <Fact label="University wallet" value={`${Number(university.coinBalance || 0).toLocaleString()} Prep Coins`} to={tabLink('plan')} />
      </div>

      <Card id="modules-summary-title" title="Modules" actions={<Link to={tabLink('modules')} className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">Manage modules</Link>}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((module) => {
            const on = modules.some((item) => item.key === module.key);
            return (
              <li key={module.key} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${on ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-slate-200 opacity-70 dark:border-slate-800'}`}>
                <span className="font-medium text-slate-900 dark:text-white">{module.label}</span>
                <Pill tone={on ? 'success' : 'neutral'}>{on ? 'On' : 'Off'}</Pill>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card id="danger-title" title="Remove university" description="Removes the registration from PeerPrep and revokes its shared assessments. The university's own database is not touched.">
        <Button variant="danger" icon={Trash2} busy={busy === 'delete'} onClick={onDelete}>Remove {university.name}</Button>
      </Card>
    </div>
  );
}
