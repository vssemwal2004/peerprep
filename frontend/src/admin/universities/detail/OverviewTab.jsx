import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, KeyRound, Trash2 } from 'lucide-react';
import { api } from '../../../utils/api';
import { enabledModules, MODULES, STATUS_META, universityHealth } from '../universityModel';
import { Button, Card, Pill, helper, inputClass } from '../ui';

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

export default function OverviewTab({ university, tabLink, adminEmails, onDelete, busy, run }) {
  const [passwordAccount, setPasswordAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [formError, setFormError] = useState('');
  const closePasswordForm = () => { setPasswordAccount(''); setPassword(''); setConfirmation(''); setFormError(''); };
  const savePassword = async () => {
    if (password.length < 12) { setFormError('Enter a password of at least 12 characters.'); return; }
    if (!/[#@]/.test(password)) { setFormError('The password must contain @ or #.'); return; }
    if (password !== confirmation) { setFormError('The passwords do not match.'); return; }
    setFormError('');
    const result = await run('admin-password', () => api.resetUniversityAdminPassword(university.universityId, passwordAccount, password),
      `${passwordAccount === 'spoc' ? 'SPOC' : 'University admin'} password updated. Their current session has ended.`);
    if (result) closePasswordForm();
  };
  const health = universityHealth(university);
  const modules = enabledModules(university);
  const service = university.serviceStartDate && university.serviceEndDate ? `${university.serviceStartDate} to ${university.serviceEndDate}` : 'Not set';
  return (
    <div className="space-y-5">
      <Card id="setup-title" data-guide="unid-setup" info="unid-setup" title={health.issues.length ? 'Finish setting up' : 'Setup complete'} icon={health.issues.length ? AlertTriangle : CheckCircle2}
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

      <div data-guide="unid-facts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Status" value={<Pill tone={STATUS_META[health.status].tone}>{STATUS_META[health.status].label}</Pill>} />
        <Fact label="Service period" value={health.daysLeft !== null && health.daysLeft >= 0 ? `${service} · ${health.daysLeft} days left` : service} to={tabLink('plan')} />
        <Fact label="Account limits" value={`${university.coordinatorLimit ?? '—'} coordinators · ${university.studentLimit ?? '—'} students · ${university.assessmentStudentLimit ?? '—'} assessment places · ${university.prepMockStudentLimit ?? 0} PrepMock`} to={tabLink('plan')} />
        <Fact label="University wallet" value={`${Number(university.coinBalance || 0).toLocaleString()} Prep Coins`} to={tabLink('plan')} />
      </div>

      <Card id="university-admins-title" title="University admins" description="Email addresses used to sign in to this university.">
        {adminEmails?.error ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{adminEmails.error}</p> : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
              <dt className={helper}>SPOC email</dt>
              <dd className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-white">{adminEmails?.loading ? 'Loading…' : adminEmails?.spocEmail || 'Not configured'}</dd>
              {adminEmails?.spocEmail && <Button variant="secondary" icon={KeyRound} className="mt-3" onClick={() => { closePasswordForm(); setPasswordAccount('spoc'); }}>Change password</Button>}
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
              <dt className={helper}>University admin email</dt>
              <dd className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-white">{adminEmails?.loading ? 'Loading…' : adminEmails?.adminEmail || 'Not configured'}</dd>
              {adminEmails?.adminEmail && <Button variant="secondary" icon={KeyRound} className="mt-3" onClick={() => { closePasswordForm(); setPasswordAccount('admin'); }}>Change password</Button>}
            </div>
          </dl>
        )}
        {passwordAccount && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-800 dark:bg-sky-950/20">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Change {passwordAccount === 'spoc' ? 'SPOC' : 'university admin'} password</h3>
            <p className={`mt-1 ${helper}`}>{passwordAccount === 'spoc' ? adminEmails?.spocEmail : adminEmails?.adminEmail} will need to sign in again and change this password. The new password must have at least 12 characters and include @ or #.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">New password
                <input className={`mt-1 ${inputClass}`} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Confirm password
                <input className={`mt-1 ${inputClass}`} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
            </div>
            {formError && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{formError}</p>}
            <div className="mt-3 flex gap-2">
              <Button busy={busy === 'admin-password'} disabled={Boolean(busy)} onClick={savePassword}>Save password</Button>
              <Button variant="secondary" disabled={Boolean(busy)} onClick={closePasswordForm}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      <Card id="modules-summary-title" data-guide="unid-modules" title="Modules" actions={<Link to={tabLink('modules')} className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">Manage modules</Link>}>
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

      <Card id="danger-title" data-guide="unid-remove" info="unid-remove" title="Delete university" description="Permanently deletes this university and its MongoDB database, including all student accounts, assessments, attempts, and reports.">
        <Button variant="danger" icon={Trash2} busy={busy === 'delete'} onClick={onDelete}>Delete {university.name}</Button>
      </Card>
    </div>
  );
}
