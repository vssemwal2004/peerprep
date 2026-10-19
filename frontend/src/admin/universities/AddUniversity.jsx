import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Database, KeyRound, PlugZap, Sparkles } from 'lucide-react';
import { api } from '../../utils/api';
import { useUniversities } from './useUniversities';
import { MODULES } from './universityModel';
import { Button, Card, Field, Notice, PageHeader, pageShell, helper, inputClass } from './ui';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const today = () => new Date().toISOString().slice(0, 10);
const inAYear = () => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10); };
const EMPTY = {
  universityId: '', name: '', contactEmail: '',
  dbUri: '', judge0Url: '', judge0AuthHeader: '', judge0AuthToken: '', interviewServiceUrl: '', interviewServiceSecret: '',
  adminEmail: '', adminPassword: '',
  serviceStartDate: today(), serviceEndDate: inAYear(), coordinatorLimit: '20', studentLimit: '1000', initialCoins: '0',
};
const STEPS = [
  { key: 'identity', title: 'Identity', hint: 'Name and web address' },
  { key: 'connections', title: 'Connections', hint: 'Database and code judge' },
  { key: 'admin', title: 'First admin', hint: 'Who runs the university' },
  { key: 'plan', title: 'Plan', hint: 'Service period and limits' },
  { key: 'review', title: 'Review', hint: 'Check and create' },
];

function strongPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const values = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

/** Problems that block the given step, in plain words. */
function stepProblems(step, form, dbTest) {
  const problems = [];
  if (step === 'identity') {
    if (!ID_PATTERN.test(form.universityId)) problems.push('University ID: 2–63 lowercase letters, numbers or hyphens, starting with a letter or number.');
    if (form.name.trim().length < 2) problems.push('Enter the university name.');
    if (form.contactEmail && !EMAIL.test(form.contactEmail)) problems.push('Contact email is not valid.');
  }
  if (step === 'connections') {
    if (!(dbTest?.status === 'success' && dbTest.uri === form.dbUri && dbTest.id === form.universityId)) problems.push('Test the MongoDB connection; it must pass before you continue.');
    if (!/^https?:\/\//.test(form.judge0Url)) problems.push('Enter the Judge0 URL (starting with http:// or https://).');
    if (Boolean(form.judge0AuthHeader) !== Boolean(form.judge0AuthToken)) problems.push('Judge0 auth header and token go together: fill both or neither.');
    if (Boolean(form.interviewServiceUrl) !== Boolean(form.interviewServiceSecret)) problems.push('AI interview URL and secret go together: fill both or neither.');
    if (form.interviewServiceSecret && form.interviewServiceSecret.length < 32) problems.push('The AI interview secret must be at least 32 characters.');
  }
  if (step === 'admin') {
    if (!EMAIL.test(form.adminEmail)) problems.push('Enter the first admin\'s email.');
    if (form.adminPassword.length < 12) problems.push('The starting password needs at least 12 characters.');
  }
  if (step === 'plan') {
    if (!form.serviceStartDate || !form.serviceEndDate) problems.push('Set both service dates.');
    else if (form.serviceEndDate < form.serviceStartDate) problems.push('The service must end after it starts.');
    for (const [key, label] of [['coordinatorLimit', 'Maximum coordinators'], ['studentLimit', 'Maximum students'], ['initialCoins', 'Starting Prep Coins']]) {
      if (!/^\d+$/.test(String(form[key]))) problems.push(`${label} must be a whole number.`);
    }
  }
  return problems;
}

function Summary({ rows }) {
  return <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2"><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="text-right font-medium text-slate-900 dark:text-white">{value || '—'}</dd></div>)}</dl>;
}

/** A guided, step-by-step registration: nothing is created until the last step. */
export default function AddUniversity() {
  const navigate = useNavigate();
  const { defaults } = useUniversities();
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [dbTest, setDbTest] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: key === 'universityId' ? event.target.value.toLowerCase().replace(/\s+/g, '-') : event.target.value }));
  const current = STEPS[step];
  const problems = useMemo(() => stepProblems(current.key, form, dbTest), [current.key, form, dbTest]);
  const defaultModules = MODULES.filter(({ key }) => defaults?.permissions?.[key] === true);

  async function testDatabase() {
    const { universityId: id, dbUri: uri } = form;
    setDbTest({ id, uri, status: 'testing' });
    try {
      await api.testUniversityDatabase(id, uri);
      setDbTest({ id, uri, status: 'success' });
    } catch (cause) {
      setDbTest({ id, uri, status: 'error', message: cause.message || 'The connection failed.' });
    }
  }

  async function create() {
    setCreating(true); setError('');
    try {
      // The server treats "no starting coins" as empty; 0 is not a valid top-up amount.
      await api.createUniversity({ ...form, initialCoins: Number(form.initialCoins) > 0 ? form.initialCoins : '' });
      navigate(`/admin/universities/${form.universityId}?created=1`);
    } catch (cause) {
      setError(cause.message || 'The university could not be created.');
    } finally { setCreating(false); }
  }

  const dbStatus = dbTest && dbTest.uri === form.dbUri && dbTest.id === form.universityId ? dbTest : null;
  return (
    <div className={`${pageShell} max-w-5xl`}>
      <PageHeader title="Add a university" description="Five short steps. Nothing is saved until you press Create on the last one; credentials stay on the server." />

      <ol className="grid gap-2 sm:grid-cols-5" aria-label="Steps">
        {STEPS.map((item, index) => {
          const done = index < step;
          const active = index === step;
          return (
            <li key={item.key}>
              <button type="button" disabled={index > step} onClick={() => setStep(index)} aria-current={active ? 'step' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-default ${active ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{done ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}</span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900 dark:text-white">{item.title}</span><span className={`block truncate ${helper}`}>{item.hint}</span></span>
              </button>
            </li>
          );
        })}
      </ol>

      <Card>
        {current.key === 'identity' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="University ID" required hint={<>Used in the web address: <b className="font-mono">peerprep.co.in/u/{form.universityId || 'your-id'}</b>. It cannot be changed later.</>}>
              <input className={`${inputClass} font-mono`} value={form.universityId} onChange={set('universityId')} placeholder="graphic-era" autoComplete="off" autoFocus />
            </Field>
            <Field label="University name" required><input className={inputClass} value={form.name} onChange={set('name')} placeholder="Graphic Era University" /></Field>
            <Field label="Contact email" hint="Optional: who PeerPrep contacts about this university."><input className={inputClass} type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="it-office@university.edu" /></Field>
          </div>
        )}

        {current.key === 'connections' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Database className="h-4 w-4 text-sky-600" aria-hidden="true" />University database</p>
              <p className={`mt-1 ${helper}`}>The university's own MongoDB. Testing checks it is reachable and not used by another university; it saves nothing.</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="MongoDB URI" required className="min-w-[18rem] flex-1"><input className={inputClass} type="password" autoComplete="off" value={form.dbUri} onChange={set('dbUri')} placeholder="mongodb+srv://…" /></Field>
                <Button variant="secondary" icon={PlugZap} busy={dbStatus?.status === 'testing'} disabled={!form.dbUri || !ID_PATTERN.test(form.universityId)} onClick={testDatabase}>Test connection</Button>
              </div>
              {dbStatus?.status === 'success' && <div className="mt-3"><Notice tone="success">Connection verified.</Notice></div>}
              {dbStatus?.status === 'error' && <div className="mt-3"><Notice tone="danger">{dbStatus.message}</Notice></div>}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><KeyRound className="h-4 w-4 text-sky-600" aria-hidden="true" />Code judge (Judge0)</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field label="Judge0 URL" required><input className={inputClass} type="url" value={form.judge0Url} onChange={set('judge0Url')} placeholder="https://judge.university.edu" /></Field>
                <Field label="Auth header" hint="Optional"><input className={inputClass} value={form.judge0AuthHeader} onChange={set('judge0AuthHeader')} placeholder="X-Auth-Token" /></Field>
                <Field label="Auth token" hint="Optional"><input className={inputClass} type="password" autoComplete="off" value={form.judge0AuthToken} onChange={set('judge0AuthToken')} /></Field>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Sparkles className="h-4 w-4 text-sky-600" aria-hidden="true" />AI interview service <span className="font-normal text-slate-500">(optional, can be added later)</span></p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Service URL"><input className={inputClass} type="url" value={form.interviewServiceUrl} onChange={set('interviewServiceUrl')} placeholder="https://interviews.university.edu" /></Field>
                <Field label="Service secret" hint="At least 32 characters"><input className={inputClass} type="password" autoComplete="off" value={form.interviewServiceSecret} onChange={set('interviewServiceSecret')} /></Field>
              </div>
            </div>
          </div>
        )}

        {current.key === 'admin' && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Admin email" required hint="If this email already has an admin account in the university database, that account is kept."><input className={inputClass} type="email" value={form.adminEmail} onChange={set('adminEmail')} placeholder="admin@university.edu" /></Field>
            <Field label="Starting password" required hint="At least 12 characters. The admin must change it on first sign-in.">
              <span className="flex gap-2">
                <input className={inputClass} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.adminPassword} onChange={set('adminPassword')} />
                <Button variant="secondary" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</Button>
                <Button variant="secondary" onClick={() => { setForm((previous) => ({ ...previous, adminPassword: strongPassword() })); setShowPassword(true); }}>Generate</Button>
              </span>
            </Field>
          </div>
        )}

        {current.key === 'plan' && (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Service starts" required><input className={inputClass} type="date" value={form.serviceStartDate} onChange={set('serviceStartDate')} /></Field>
            <Field label="Service ends (inclusive)" required><input className={inputClass} type="date" value={form.serviceEndDate} onChange={set('serviceEndDate')} /></Field>
            <Field label="Starting Prep Coins" hint="Added to the university wallet; its admin passes them to coordinators."><input className={inputClass} type="number" min="0" step="1" value={form.initialCoins} onChange={set('initialCoins')} /></Field>
            <Field label="Maximum coordinators" required hint="No new coordinator can be added beyond this, including by bulk upload."><input className={inputClass} type="number" min="0" step="1" value={form.coordinatorLimit} onChange={set('coordinatorLimit')} /></Field>
            <Field label="Maximum students" required><input className={inputClass} type="number" min="0" step="1" value={form.studentLimit} onChange={set('studentLimit')} /></Field>
          </div>
        )}

        {current.key === 'review' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div><p className="mb-1 text-sm font-bold text-slate-900 dark:text-white">University</p><Summary rows={[['Name', form.name], ['ID', form.universityId], ['Student link', `peerprep.co.in/u/${form.universityId}/student`], ['Contact', form.contactEmail], ['First admin', form.adminEmail]]} /></div>
            <div><p className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Plan and connections</p><Summary rows={[['Service', `${form.serviceStartDate} to ${form.serviceEndDate}`], ['Limits', `${form.coordinatorLimit} coordinators · ${form.studentLimit} students`], ['Starting Prep Coins', Number(form.initialCoins || 0).toLocaleString()], ['Database', 'Verified'], ['Judge0', form.judge0Url], ['AI interviews', form.interviewServiceUrl ? 'Connected' : 'Not connected']]} /></div>
            <div className="lg:col-span-2 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50">
              <p className="font-semibold text-slate-900 dark:text-white">Modules it starts with</p>
              <p className={`mt-1 ${helper}`}>{defaultModules.length ? defaultModules.map((module) => module.label).join(', ') : 'None'}. These come from the <Link to="/admin/universities/defaults" className="font-semibold text-sky-700 underline dark:text-sky-300">new-university defaults</Link>; you can change them on the university's page afterwards.</p>
            </div>
          </div>
        )}

        {problems.length > 0 && current.key !== 'review' && (
          <ul className="mt-5 space-y-1 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{problems.map((problem) => <li key={problem}>• {problem}</li>)}</ul>
        )}
        {error && <div className="mt-5"><Notice tone="danger">{error}</Notice></div>}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button variant="ghost" icon={ChevronLeft} disabled={step === 0 || creating} onClick={() => setStep((value) => value - 1)}>Back</Button>
          {current.key === 'review'
            ? <Button busy={creating} icon={Check} onClick={create}>{creating ? 'Creating university…' : 'Create university'}</Button>
            : <Button disabled={problems.length > 0} onClick={() => setStep((value) => value + 1)}>Continue<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>}
        </div>
      </Card>
    </div>
  );
}
