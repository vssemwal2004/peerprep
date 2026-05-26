import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { defaultCoordinatorPermissions } from './coordinatorPermissions';

const initialForm = {
  coordinatorName: '',
  coordinatorEmail: '',
  coordinatorID: '',
  coordinatorPassword: '',
  phone: '',
  department: '',
  college: '',
};

function Field({ label, value, onChange, error, type = 'text', placeholder, action }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</label>
        {action}
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:ring-2 dark:bg-gray-950 dark:text-white ${
          error
            ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100 dark:border-rose-400/40 dark:focus:ring-rose-400/10'
            : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100 dark:border-white/10 dark:focus:ring-sky-400/10'
        }`}
      />
      {error ? <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}

export default function CoordinatorOnboarding() {
  const toast = useToast();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [grantDefaultAccess, setGrantDefaultAccess] = useState(true);

  const errors = useMemo(() => {
    const next = {};
    if (!form.coordinatorName.trim()) next.coordinatorName = 'Coordinator name is required.';
    if (!form.coordinatorEmail.trim()) next.coordinatorEmail = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.coordinatorEmail)) next.coordinatorEmail = 'Enter a valid email address.';
    if (!form.coordinatorID.trim()) next.coordinatorID = 'Coordinator ID is required.';
    if (form.coordinatorPassword && form.coordinatorPassword.length < 6) next.coordinatorPassword = 'Use at least 6 characters.';
    return next;
  }, [form]);

  const isValid = Object.keys(errors).length === 0;
  const update = (key, value) => {
    setMessage(null);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        ...form,
        permissions: grantDefaultAccess ? defaultCoordinatorPermissions : [],
      };
      const result = await api.createCoordinator(payload);
      setForm(initialForm);
      setGrantDefaultAccess(true);
      setMessage({ type: 'success', text: `Coordinator created with ${result.permissionCount ?? 0} assigned permissions.` });
      toast.success('Coordinator created successfully.');
    } catch (err) {
      const text = err.message?.includes('exists')
        ? 'A coordinator with this email or Coordinator ID already exists.'
        : err.message || 'Failed to create coordinator.';
      setMessage({ type: 'error', text });
      toast.error(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
              <UserPlus className="h-3.5 w-3.5" />
              Coordinator Management
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Add Coordinator</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Create a coordinator account, capture ownership details, and choose whether they start with default platform access.
            </p>
          </div>
          <Link to="/admin/coordinator-access" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
            <ShieldCheck className="h-4 w-4" />
            Manage Access
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Coordinator Details</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Required identity fields are validated before account creation.</p>
              </div>
            </div>

            {message ? (
              <div className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm font-semibold ${
                message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200'
              }`}>
                {message.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
                {message.text}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full Name" value={form.coordinatorName} onChange={(value) => update('coordinatorName', value)} error={errors.coordinatorName} placeholder="Jane Doe" />
              <Field label="Email" value={form.coordinatorEmail} onChange={(value) => update('coordinatorEmail', value)} error={errors.coordinatorEmail} placeholder="jane@university.edu" />
              <Field label="Coordinator ID" value={form.coordinatorID} onChange={(value) => update('coordinatorID', value)} error={errors.coordinatorID} placeholder="COO2026-001" />
              <Field
                label="Temporary Password"
                value={form.coordinatorPassword}
                onChange={(value) => update('coordinatorPassword', value)}
                error={errors.coordinatorPassword}
                type={showPassword ? 'text' : 'password'}
                placeholder="Defaults to Coordinator ID"
                action={(
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              />
              <Field label="Phone" value={form.phone} onChange={(value) => update('phone', value)} placeholder="+91 98765 43210" />
              <Field label="Department" value={form.department} onChange={(value) => update('department', value)} placeholder="Computer Science" />
              <div className="md:col-span-2">
                <Field label="College / Organization" value={form.college} onChange={(value) => update('college', value)} placeholder="PeerPrep University" />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={grantDefaultAccess}
                  onChange={(event) => setGrantDefaultAccess(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-950 dark:text-white">Grant default coordinator access</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Turn this off to create the account with no feature access and configure permissions manually from Coordinator Access.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setForm(initialForm); setMessage(null); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
                Reset
              </button>
              <button type="submit" disabled={!isValid || loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {loading ? 'Creating...' : 'Create Coordinator'}
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">Access Flow</h3>
              <div className="mt-4 space-y-3">
                {['Create coordinator identity', 'Assign default or custom access', 'Coordinator sees only enabled features'].map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">{index + 1}</span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
              Default access mirrors the existing coordinator platform features. Admins can fine-tune every feature later from the access details page.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
