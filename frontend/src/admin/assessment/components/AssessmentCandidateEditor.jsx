import { useRef, useState } from 'react';
import { Download, Upload, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../../utils/api';

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const normalize = (value) => String(value || '').toLowerCase().replace(/[\s_-]+/g, '');

export default function AssessmentCandidateEditor({ selected = [], onChange }) {
  const fileRef = useRef(null);
  const [student, setStudent] = useState({ name: '', email: '', studentid: '' });
  const [preview, setPreview] = useState([]);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showIndividual, setShowIndividual] = useState(false);
  const [showNewStudents, setShowNewStudents] = useState(false);

  const review = async (rows, label) => {
    setBusy(true); setError(''); setPreview([]);
    try {
      const data = await api.previewAssessmentStudents(rows);
      const selectedEmails = new Set(selected.map((entry) => String(entry.email || '').toLowerCase()));
      const selectedIds = new Set(selected.map((entry) => String(entry.studentId || entry.studentid || '')));
      setPreview((data.preview || []).map((row) => selectedEmails.has(row.email) || selectedIds.has(row.studentid)
        ? { ...row, status: 'error', errors: [...row.errors, 'Already selected for this assessment'] }
        : row));
      setSource(label);
    } catch (requestError) { setError(requestError.message || 'Could not review students.'); }
    finally { setBusy(false); }
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('CSV must be smaller than 2 MB.');
      const records = parseCsv(await file.text());
      if (records.length < 2) throw new Error('Add a header and at least one student.');
      const headers = records[0].map(normalize);
      const nameIndex = headers.indexOf('name');
      const emailIndex = headers.findIndex((header) => ['email', 'emailid', 'emailaddress'].includes(header));
      const idIndex = headers.findIndex((header) => ['studentid', 'stdid'].includes(header));
      if ([nameIndex, emailIndex, idIndex].some((index) => index < 0)) throw new Error('CSV headers must include Name, Email ID, Student ID.');
      await review(records.slice(1).map((values) => ({ name: values[nameIndex], email: values[emailIndex], studentid: values[idIndex] })), file.name);
    } catch (uploadError) { setError(uploadError.message); setPreview([]); }
  };
  const addReviewed = () => {
    if (preview.some((row) => row.status === 'error')) return;
    const keys = new Set(selected.map((entry) => String(entry.email || '').toLowerCase()));
    const additions = preview.filter((row) => !keys.has(row.email)).map((row) => row.existingStudent || ({
      name: row.name, email: row.email, studentid: row.studentid, accessScope: 'assessment_only',
    }));
    onChange([...selected, ...additions]);
    setPreview([]);
    if (source === 'Individual student') {
      setStudent({ name: '', email: '', studentid: '' });
      setShowIndividual(false);
    }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(['Name,Email ID,Student ID\nAarav Sharma,aarav@example.com,STD-001\n'], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'assessment-students.csv'; link.click();
    URL.revokeObjectURL(url);
  };
  const counts = { existing: preview.filter((row) => row.status === 'existing').length, new: preview.filter((row) => row.status === 'new').length, error: preview.filter((row) => row.status === 'error').length };
  const newStudents = selected.filter((entry) => entry.accessScope === 'assessment_only' && !entry._id);
  return <div className="rounded-xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
      <div><p className="text-sm font-semibold text-slate-900 dark:text-white">Add students</p><p className="text-[11px] text-slate-500 dark:text-gray-400">Upload a new CSV or add one student.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"><Download className="h-3.5 w-3.5" />Template</button>
        <button type="button" onClick={() => { setShowIndividual((current) => !current); setPreview([]); setError(''); }} aria-expanded={showIndividual} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"><Plus className="h-3.5 w-3.5" />Add one</button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"><Upload className="h-3.5 w-3.5" />Upload new CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={upload} className="hidden" aria-label="Upload new student CSV" />
      </div>
    </div>
    {showIndividual && <div className="grid gap-2 border-t border-slate-200 p-3 md:grid-cols-[1fr_1.3fr_0.8fr_auto] dark:border-gray-700 sm:px-4">
      <input aria-label="Student name" placeholder="Full name" value={student.name} onChange={(event) => setStudent({ ...student, name: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
      <input aria-label="Student email" placeholder="Email ID" type="email" value={student.email} onChange={(event) => setStudent({ ...student, email: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
      <input aria-label="Student ID" placeholder="Student ID" value={student.studentid} onChange={(event) => setStudent({ ...student, studentid: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950" />
      <button type="button" disabled={busy} onClick={() => review([student], 'Individual student')} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />Review</button>
    </div>}
    {error && <p role="alert" className="mx-4 mb-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {busy && <p className="px-4 pb-4 text-xs text-slate-500">Checking student records...</p>}
    {preview.length > 0 && <div className="border-t border-slate-200 p-4 dark:border-gray-700"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-bold text-slate-900 dark:text-white">Review {source}</h4><p className="text-xs text-slate-500">{counts.existing} existing · {counts.new} new · {counts.error} errors</p></div><div className="flex gap-2"><button type="button" onClick={() => setPreview([])} className="rounded-lg border px-3 py-2 text-xs">Cancel</button><button type="button" disabled={counts.error > 0} onClick={addReviewed} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Add {preview.length} students</button></div></div><div className="max-h-72 overflow-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Student ID</th><th className="p-2">Result</th></tr></thead><tbody>{preview.map((row) => <tr key={row.row} className="border-b border-slate-100 dark:border-gray-800"><td className="p-2">{row.row}</td><td className="p-2">{row.name}</td><td className="p-2">{row.email}</td><td className="p-2">{row.studentid}</td><td className={`p-2 font-semibold ${row.status === 'error' ? 'text-rose-600' : row.status === 'existing' ? 'text-amber-600' : 'text-emerald-600'}`}>{row.status === 'error' ? row.errors.join('; ') : row.status === 'existing' ? 'Existing student' : 'New student — credentials on publish'}</td></tr>)}</tbody></table></div></div>}
    {newStudents.length > 0 && <div className="border-t border-slate-200 px-4 py-2 text-xs dark:border-gray-700"><button type="button" onClick={() => setShowNewStudents((current) => !current)} aria-expanded={showNewStudents} className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300">{newStudents.length} new student{newStudents.length === 1 ? '' : 's'} added {showNewStudents ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>{showNewStudents && <div className="mt-2 flex flex-wrap gap-2">{newStudents.map((entry) => <span key={entry.email} className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">{entry.name} ({entry.studentid}) <button type="button" aria-label={`Remove ${entry.name}`} onClick={() => onChange(selected.filter((item) => item !== entry))}><Trash2 className="ml-1 inline h-3 w-3" /></button></span>)}</div>}</div>}
  </div>;
}
