import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, Eye, EyeOff, FileText, Loader2, ShieldCheck, Upload, UserPlus, Users } from 'lucide-react';
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

function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

export default function CoordinatorOnboarding() {
  const toast = useToast();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [grantDefaultAccess, setGrantDefaultAccess] = useState(true);
  const [mode, setMode] = useState('bulk');
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

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

  const downloadTemplate = () => {
    const csv = 'Name,Email,CoordinatorId,Password,Phone,Department,College,GrantDefaultAccess\nJane Doe,jane@university.edu,COO2026-001,,+919876543210,Computer Science,PeerPrep University,true\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'peerprep-coordinator-upload-template.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const readBulkFile = (file) => {
    setBulkFile(file || null);
    setBulkRows([]);
    setBulkErrors([]);
    setBulkResult(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const lines = String(event.target?.result || '').split(/\r?\n/).filter((line) => line.trim());
        const headers = parseCsvLine(lines.shift() || '').map((header) => header.toLowerCase().replace(/[\s_-]/g, ''));
        const required = ['name', 'email', 'coordinatorid'];
        const missing = required.filter((header) => !headers.includes(header));
        if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);
        const rows = lines.map((line, index) => {
          const values = parseCsvLine(line);
          const raw = Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || '']));
          return {
            row: index + 2,
            name: raw.name,
            email: raw.email,
            coordinatorId: raw.coordinatorid,
            password: raw.password,
            phone: raw.phone,
            department: raw.department,
            college: raw.college,
            grantDefaultAccess: String(raw.grantdefaultaccess || 'true').toLowerCase() !== 'false',
          };
        });
        if (!rows.length) throw new Error('The CSV does not contain coordinator rows.');
        const seenEmails = new Set();
        const seenIds = new Set();
        const validationErrors = [];
        rows.forEach((row) => {
          if (!row.name || !row.email || !row.coordinatorId) validationErrors.push(`Row ${row.row}: Name, email, and Coordinator ID are required.`);
          if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) validationErrors.push(`Row ${row.row}: Invalid email address.`);
          if (row.password && row.password.length < 6) validationErrors.push(`Row ${row.row}: Password must have at least 6 characters.`);
          const emailKey = row.email.toLowerCase();
          const idKey = row.coordinatorId.toLowerCase();
          if (seenEmails.has(emailKey)) validationErrors.push(`Row ${row.row}: Duplicate email in this file.`);
          if (seenIds.has(idKey)) validationErrors.push(`Row ${row.row}: Duplicate Coordinator ID in this file.`);
          seenEmails.add(emailKey);
          seenIds.add(idKey);
        });
        setBulkRows(rows);
        setBulkErrors(validationErrors);
      } catch (error) {
        setBulkErrors([error.message || 'Unable to read CSV file.']);
      }
    };
    reader.onerror = () => setBulkErrors(['Unable to read CSV file.']);
    reader.readAsText(file);
  };

  const uploadBulk = async () => {
    if (!bulkRows.length || bulkErrors.length || bulkLoading) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const response = await api.bulkCreateCoordinators(bulkRows);
      setBulkResult(response);
      toast.success(`${response.created} coordinator${response.created === 1 ? '' : 's'} created.`);
    } catch (error) {
      toast.error(error.message || 'Bulk coordinator upload failed.');
    } finally {
      setBulkLoading(false);
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

        <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-gray-900">
          {[['bulk', 'Bulk CSV Upload'], ['single', 'Individual Coordinator']].map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${mode === value ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.04]'}`}>{label}</button>)}
        </div>

        {mode === 'bulk' && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-400/20 dark:bg-sky-400/10">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-bold text-sky-950 dark:text-sky-100">Coordinator CSV guidelines</h2><p className="mt-1 text-sm text-sky-800/80 dark:text-sky-200/80">Required: Name, Email, CoordinatorId. Password defaults to CoordinatorId. Optional: Phone, Department, College, GrantDefaultAccess.</p></div><button type="button" onClick={downloadTemplate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"><Download className="h-4 w-4" />Download template</button></div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
              <label className="relative flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-sky-400 hover:bg-sky-50 dark:border-white/15 dark:bg-white/[0.03] dark:hover:border-sky-400/50"><input type="file" accept=".csv,text/csv" onChange={(event) => readBulkFile(event.target.files?.[0])} className="absolute inset-0 cursor-pointer opacity-0" /><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-600 text-white"><Upload className="h-5 w-5" /></span><span className="mt-4 text-sm font-bold text-slate-900 dark:text-white">Drop or select coordinator CSV</span><span className="mt-1 text-xs text-slate-500">Maximum 500 coordinator rows</span></label>
              {bulkFile && <div className="mt-3 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200"><FileText className="h-4 w-4" />{bulkFile.name}<span className="text-xs opacity-70">({(bulkFile.size / 1024).toFixed(1)} KB)</span></div>}
            </div>
            {bulkErrors.length > 0 && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><div className="font-bold">Fix these CSV problems before upload</div><ul className="mt-2 list-disc space-y-1 pl-5">{bulkErrors.slice(0, 20).map((error) => <li key={error}>{error}</li>)}</ul></div>}
            {bulkRows.length > 0 && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h3 className="font-bold text-slate-950 dark:text-white">Upload preview</h3><p className="text-sm text-slate-500">{bulkRows.length} coordinator rows ready for server validation</p></div><button type="button" onClick={uploadBulk} disabled={bulkErrors.length > 0 || bulkLoading || Boolean(bulkResult)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">{bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{bulkLoading ? 'Uploading...' : bulkResult ? 'Upload processed' : 'Upload coordinators'}</button></div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-400 dark:bg-white/[0.03]"><tr>{['Row', 'Name', 'Email', 'Coordinator ID', 'Department', 'College', 'Access', 'Result'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/10">{bulkRows.slice(0, 100).map((row) => { const rowResult = bulkResult?.results?.find((item) => item.row === row.row); return <tr key={row.row}><td className="px-4 py-3 font-bold text-slate-500">{row.row}</td><td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{row.name}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.email}</td><td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{row.coordinatorId}</td><td className="px-4 py-3 text-slate-500">{row.department || '-'}</td><td className="px-4 py-3 text-slate-500">{row.college || '-'}</td><td className="px-4 py-3 text-slate-500">{row.grantDefaultAccess ? 'Default' : 'None'}</td><td className={`px-4 py-3 text-xs font-bold ${rowResult?.status === 'created' ? 'text-emerald-600' : rowResult ? 'text-rose-600' : 'text-slate-400'}`}>{rowResult ? (rowResult.status === 'created' ? 'Created' : rowResult.errors?.join(', ')) : 'Ready'}</td></tr>; })}</tbody></table></div>{bulkRows.length > 100 && <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Showing first 100 rows. All {bulkRows.length} rows will be processed.</div>}</div>}
            {bulkResult && <div className="grid gap-3 sm:grid-cols-4">{[['Created', bulkResult.created], ['Failed', bulkResult.failed], ['Emails sent', bulkResult.emailSent], ['Email failures', bulkResult.emailFailed]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value || 0}</div></div>)}</div>}
          </div>
        )}

        <div className={`${mode === 'single' ? 'grid' : 'hidden'} gap-5 xl:grid-cols-[minmax(0,1fr)_360px]`}>
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
