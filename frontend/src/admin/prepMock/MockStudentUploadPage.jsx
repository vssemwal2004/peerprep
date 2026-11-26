import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../utils/api';

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const button = 'inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50';
const label = { created: 'New PrepMock-only account', linked_student: 'Linked existing PeerPrep account', existing_student: 'Existing university student', already_enrolled: 'Already uploaded', error: 'Could not upload' };

function downloadCsv(name, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MockStudentUploadPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('single');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [file, setFile] = useState(null);
  const fileInput = useRef(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({ used: 0, limit: 0, students: [] });
  const [results, setResults] = useState([]);
  const portal = user?.universityId ? `${window.location.origin}/u/${user.universityId}/student` : '';

  const refresh = useCallback(async () => {
    const data = await api.listPrepMockStudents();
    setSummary(data);
  }, []);
  useEffect(() => {
    let active = true;
    api.listPrepMockStudents().then((data) => { if (active) setSummary(data); })
      .catch((cause) => { if (active) setError(cause.message || 'Could not load PrepMock students.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setResults([]);
    try {
      const data = tab === 'single'
        ? await api.uploadPrepMockStudent({ name: name.trim(), email: email.trim(), studentId: studentId.trim() })
        : await api.uploadPrepMockStudentsBulk(file);
      setResults(tab === 'single' ? [data] : data.entries || []);
      if (tab === 'single') { setName(''); setEmail(''); setStudentId(''); }
      else { setFile(null); if (fileInput.current) fileInput.current.value = ''; }
      await refresh();
    } catch (cause) { setError(cause.message || 'Upload failed.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-sky-700">PrepMock</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Upload Students</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Only uploaded students can see this university’s PrepMocks. Enter each student’s academic ID; their university code is added to the login ID without a separator.</p>
      </header>

      <section className={card} aria-label="PrepMock student limit">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Student places</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{loading ? '…' : `${summary.used} / ${summary.limit}`}</p></div>
          <p className="max-w-sm text-right text-xs text-slate-500">The Master Admin sets this limit for your university.</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-sky-600" style={{ width: `${summary.limit ? Math.min(100, summary.used / summary.limit * 100) : 0}%` }} /></div>
      </section>

      <section className={card}>
        <div className="flex gap-2 border-b border-slate-200 pb-4 dark:border-slate-800" role="tablist" aria-label="Upload method">
          {[["single", 'Single Upload'], ["bulk", 'Bulk Upload']].map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setError(''); setResults([]); }} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{text}</button>)}
        </div>
        <form onSubmit={save} className="mt-4 space-y-4">
          {tab === 'single' ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Student name<input className={`mt-1 ${input}`} value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={160} /></label>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Email address<input className={`mt-1 ${input}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Student ID<input className={`mt-1 ${input}`} value={studentId} onChange={(event) => setStudentId(event.target.value)} required maxLength={64} /></label>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-300">Upload a CSV with <strong>name</strong>, <strong>email</strong> and <strong>studentId</strong> columns, up to 500 rows. Each row reports its own result.</p>
              <button type="button" onClick={() => downloadCsv('prepmock-students-template.csv', [['name', 'email', 'studentId'], ['Student Name', 'student@example.edu', '12345']])} className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"><Download className="h-4 w-4" /> Download CSV template</button>
              <input ref={fileInput} className={input} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          <button className={button} type="submit" disabled={busy || loading || (tab === 'bulk' && !file) || (summary.used >= summary.limit && tab === 'single')}>{busy ? 'Uploading…' : <><Upload className="h-4 w-4" /> Upload {tab === 'single' ? 'student' : 'CSV'}</>}</button>
        </form>
      </section>

      {results.length > 0 && <section className={card} aria-label="Upload results">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-slate-950 dark:text-white">Upload results</h2><button type="button" onClick={() => downloadCsv('prepmock-upload-results.csv', [['row', 'name', 'email', 'studentId', 'loginStudentId', 'status', 'temporaryPassword', 'error'], ...results.map((entry) => [entry.row, entry.name, entry.email, entry.studentId, entry.loginStudentId, entry.status, entry.temporaryPassword, entry.error])])} className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700 hover:underline"><Download className="h-4 w-4" /> Download results</button></div>
        {results.some((entry) => entry.temporaryPassword) && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">New passwords appear only here. Save them and share them with those students. They must change the password on first sign-in.</p>}
        {results.some((entry) => entry.status === 'linked_student') && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Linked students sign in with the university login ID and their existing PeerPrep password.</p>}
        {portal && <p className="mt-1 break-all text-xs text-slate-600 dark:text-slate-300">University sign-in: {portal}</p>}
        <div className="mt-3 space-y-2">{results.map((entry, index) => <div key={`${entry.email}-${index}`} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><span className="font-semibold">{entry.email}</span> · {label[entry.status] || entry.status}{entry.loginStudentId && <p className="mt-1 text-xs">Login ID: <strong>{entry.loginStudentId}</strong></p>}{entry.temporaryPassword && <p className="mt-1 font-mono text-sm font-semibold text-sky-800 dark:text-sky-200">Temporary password: {entry.temporaryPassword}</p>}{entry.error && <p className="mt-1 text-rose-700 dark:text-rose-300">{entry.error}</p>}</div>)}</div>
      </section>}

      <section className={card}>
        <h2 className="flex items-center gap-2 font-bold text-slate-950 dark:text-white"><UserPlus className="h-4 w-4" /> Uploaded students</h2>
        <p className="mt-1 text-xs text-slate-500">Showing the most recent 200 students. Every uploaded student counts toward the limit.</p>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{summary.students.map((student) => <div key={student.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="font-semibold text-slate-900 dark:text-white">{student.name} <span className="font-normal text-slate-500">{student.email}</span><span className="block text-xs text-slate-500">Login ID: {student.loginStudentId}</span></span><span className="text-xs text-slate-500">{student.linked ? 'Existing PeerPrep password' : student.prepMockOnly ? 'PrepMock only' : 'Existing university account'}</span></div>)}</div>
        {!loading && summary.students.length === 0 && <p className="mt-3 text-sm text-slate-500">No students uploaded yet.</p>}
      </section>
    </main>
  );
}
