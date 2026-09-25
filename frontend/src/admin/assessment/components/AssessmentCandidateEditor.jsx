import { useRef, useState } from 'react';
import { Check, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '../../../utils/api';

const emptyStudent = { name: '', email: '', studentid: '' };
const inputClass = 'min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white';
const normalize = (value) => String(value || '').trim().toLowerCase();
const studentId = (entry) => String(entry.studentid || entry.studentId || '').trim();

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

function alreadySelected(row, selected, excluded) {
  return selected.some((entry) => entry !== excluded && (
    (normalize(entry.email) && normalize(entry.email) === normalize(row.email)) ||
    (studentId(entry) && normalize(studentId(entry)) === normalize(row.studentid)) ||
    (row.existingStudent?._id && String(entry._id) === String(row.existingStudent._id))
  ));
}

export default function AssessmentCandidateEditor({ mode, selected = [], onChange }) {
  const fileRef = useRef(null);
  const [student, setStudent] = useState(emptyStudent);
  const [individualMessage, setIndividualMessage] = useState(null);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [fileName, setFileName] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [editFields, setEditFields] = useState(emptyStudent);

  const checkRows = async (values) => {
    const data = await api.previewAssessmentStudents(values);
    return (data.preview || []).map((row) => row.status !== 'error' && alreadySelected(row, selected)
      ? { ...row, status: 'selected', errors: [] }
      : row);
  };
  const addIndividual = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setIndividualMessage(null);
    try {
      const [result] = await checkRows([student]);
      if (!result) throw new Error('Could not check this student.');
      if (result.status === 'selected') setIndividualMessage({ kind: 'warning', text: 'This student is already selected for this assessment.' });
      else if (result.status === 'existing') setIndividualMessage({ kind: 'warning', text: 'This student already has an account. Use “Add existing students” to select them.' });
      else if (result.status === 'error') setIndividualMessage({ kind: 'error', text: result.errors.join('; ') });
      else {
        onChange([...selected, { name: result.name, email: result.email, studentid: result.studentid, accessScope: 'assessment_only' }]);
        setStudent(emptyStudent);
        setIndividualMessage({ kind: 'success', text: `${result.name} added. Login details will be emailed when the assessment is published.` });
      }
    } catch (requestError) { setError(requestError.message || 'Could not check this student.'); }
    finally { setBusy(false); }
  };
  const reviewRows = async (values = rows) => {
    setBusy(true); setError('');
    try {
      const checked = await checkRows(values);
      setPreview(checked); setNeedsReview(false);
    } catch (requestError) { setError(requestError.message || 'Could not review students.'); setNeedsReview(true); }
    finally { setBusy(false); }
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setPreview([]); setRows([]);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('CSV must be smaller than 2 MB.');
      const records = parseCsv(await file.text());
      if (records.length < 2) throw new Error('Add a header and at least one student.');
      const headers = records[0].map((value) => normalize(value).replace(/[\s_-]+/g, ''));
      const nameIndex = headers.indexOf('name');
      const emailIndex = headers.findIndex((header) => ['email', 'emailid', 'emailaddress'].includes(header));
      const idIndex = headers.findIndex((header) => ['studentid', 'stdid'].includes(header));
      if ([nameIndex, emailIndex, idIndex].some((index) => index < 0)) throw new Error('CSV headers must include Name, Email ID, Student ID.');
      const setIndex = headers.findIndex((header) => ['assessmentset', 'set'].includes(header));
      const values = records.slice(1).map((cells) => ({ name: cells[nameIndex] || '', email: cells[emailIndex] || '', studentid: cells[idIndex] || '', assessmentSet: setIndex >= 0 ? cells[setIndex] || '' : '' }));
      if (values.length > 1000) throw new Error('Upload up to 1,000 students at a time.');
      setRows(values); setFileName(file.name); setNeedsReview(true);
      await reviewRows(values);
    } catch (uploadError) { setError(uploadError.message || 'Could not read this CSV.'); }
  };
  const changeRow = (index, key, value) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
    setNeedsReview(true);
  };
  const addReviewed = () => {
    if (busy || needsReview || !preview.length || preview.some((row) => row.status === 'error')) return;
    const additions = preview.filter((row) => row.status !== 'selected').map((row) => row.existingStudent
      ? { ...row.existingStudent, assessmentSet: row.assessmentSet || '', assessmentSetSource: row.assessmentSet ? 'csv' : '' }
      : { name: row.name, email: row.email, studentid: row.studentid, assessmentSet: row.assessmentSet || '', assessmentSetSource: row.assessmentSet ? 'csv' : '', accessScope: 'assessment_only' });
    if (!additions.length) return;
    onChange([...selected, ...additions]);
    setRows([]); setPreview([]); setFileName(''); setError('');
  };
  const saveEdit = async () => {
    setBusy(true); setError('');
    try {
      const data = await api.previewAssessmentStudents([editFields]);
      const row = data.preview?.[0];
      if (!row) throw new Error('Could not check this student.');
      if (alreadySelected(row, selected, editingEntry)) throw new Error('This student is already selected for this assessment.');
      if (row.status === 'error') throw new Error(row.errors.join('; '));
      if (row.status === 'existing') throw new Error('This student already has an account. Use “Add existing students” to select them.');
      onChange(selected.map((entry) => entry === editingEntry ? { ...entry, name: row.name, email: row.email, studentid: row.studentid } : entry));
      setEditingEntry(null);
    } catch (requestError) { setError(requestError.message || 'Could not save this student.'); }
    finally { setBusy(false); }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(['Name,Email ID,Student ID,Assessment Set\nAarav Sharma,aarav@example.com,STD-001,1\n'], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'assessment-students.csv'; link.click();
    URL.revokeObjectURL(url);
  };
  const counts = {
    new: preview.filter((row) => row.status === 'new').length,
    existing: preview.filter((row) => row.status === 'existing' || row.status === 'selected').length,
    error: preview.filter((row) => row.status === 'error').length,
  };
  const addCount = preview.length - counts.error - preview.filter((row) => row.status === 'selected').length;
  const newStudents = selected.filter((entry) => entry.accessScope === 'assessment_only' && !entry._id);

  return <div className="space-y-4">
    {mode === 'individual' && <form onSubmit={addIndividual} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add one student</h3>
      <p className="mb-4 mt-1 text-xs text-slate-500">We check for existing accounts when you select Add student.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {[['name', 'Full name'], ['studentid', 'Student ID'], ['email', 'Email ID']].map(([key, label]) => <label key={key} className="space-y-1 text-xs font-medium text-slate-700 dark:text-gray-300">{label}<input required type={key === 'email' ? 'email' : 'text'} value={student[key]} onChange={(event) => { setStudent({ ...student, [key]: event.target.value }); setIndividualMessage(null); }} className={inputClass} /></label>)}
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"><Plus className="h-4 w-4" />{busy ? 'Checking...' : 'Add student'}</button></div>
      {individualMessage && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${individualMessage.kind === 'success' ? 'bg-emerald-50 text-emerald-800' : individualMessage.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>{individualMessage.text}</p>}
    </form>}
    {mode === 'bulk' && <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add students from CSV</h3><p className="mt-1 text-xs text-slate-500">Download the template, upload a file, then review and edit rows before adding.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200"><Download className="h-4 w-4" />CSV template</button><button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"><Upload className="h-4 w-4" />Upload CSV</button><input ref={fileRef} type="file" accept=".csv,text/csv" onChange={upload} className="hidden" aria-label="Upload student CSV" /></div></div>
      {rows.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4 dark:border-gray-700"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Review {fileName}</h4><p className="text-xs text-slate-500">{rows.length} rows · Edit any cell, then recheck before adding.</p></div><div className="flex gap-2"><button type="button" onClick={() => { setRows([]); setPreview([]); setFileName(''); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-gray-700">Cancel</button>{needsReview ? <button type="button" disabled={busy} onClick={() => reviewRows()} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Checking...' : 'Recheck rows'}</button> : <button type="button" disabled={busy || counts.error > 0 || addCount === 0} onClick={addReviewed} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Add {addCount} student{addCount === 1 ? '' : 's'}</button>}</div></div>
        <div className="mb-3 grid grid-cols-3 gap-2">{[['New', counts.new, 'text-emerald-700 bg-emerald-50'], ['Already exist', counts.existing, 'text-amber-700 bg-amber-50'], ['Errors', counts.error, 'text-rose-700 bg-rose-50']].map(([label, count, style]) => <div key={label} className={`rounded-lg p-3 ${style}`}><span className="block text-lg font-bold">{needsReview ? '—' : count}</span><span className="text-xs font-medium">{label}</span></div>)}</div>
        {needsReview && <p role="status" className="mb-2 text-xs font-medium text-amber-700">Rows changed. Recheck to refresh the results.</p>}
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-gray-700"><table className="w-full min-w-[840px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-gray-800 dark:text-gray-300"><tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Email ID</th><th className="p-2">Student ID</th><th className="p-2">Set (optional)</th><th className="p-2">Result</th></tr></thead><tbody>{rows.map((row, index) => { const result = preview[index]; return <tr key={index} className="border-t border-slate-100 dark:border-gray-800"><td className="p-2 text-slate-500">{index + 2}</td>{['name', 'email', 'studentid', 'assessmentSet'].map((key) => <td key={key} className="p-1"><input aria-label={`Row ${index + 2} ${key}`} type={key === 'email' ? 'email' : key === 'assessmentSet' ? 'number' : 'text'} min={key === 'assessmentSet' ? 1 : undefined} max={key === 'assessmentSet' ? 8 : undefined} value={row[key] || ''} onChange={(event) => changeRow(index, key, event.target.value)} className={`${inputClass} !px-2 !py-1.5`} /></td>)}<td className="max-w-52 p-2">{needsReview ? <span className="text-slate-500">Needs check</span> : result?.status === 'error' ? <span className="text-rose-700">{result.errors.join('; ')}</span> : result?.status === 'selected' ? <span className="text-amber-700">Already selected</span> : result?.status === 'existing' ? <span className="text-amber-700">Existing account</span> : <span className="text-emerald-700">New student</span>}</td></tr>; })}</tbody></table></div>
        {counts.error > 0 && !needsReview && <p role="alert" className="mt-2 text-xs text-rose-700">Fix the errors and recheck before adding students.</p>}
      </div>}
    </div>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    {newStudents.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">New students added ({newStudents.length})</h3><div className="space-y-2">{newStudents.map((entry) => <div key={entry.email} className="rounded-lg border border-slate-100 p-3 dark:border-gray-700">{editingEntry === entry ? <div className="space-y-2"><div className="grid gap-2 md:grid-cols-3">{[['name', 'Name'], ['studentid', 'Student ID'], ['email', 'Email ID']].map(([key, label]) => <input key={key} aria-label={`Edit ${label}`} value={editFields[key]} onChange={(event) => setEditFields({ ...editFields, [key]: event.target.value })} className={inputClass} />)}</div><div className="flex gap-2"><button type="button" onClick={saveEdit} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" />Save</button><button type="button" onClick={() => setEditingEntry(null)} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button></div></div> : <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium text-slate-900 dark:text-white">{entry.name} <span className="text-xs font-normal text-slate-500">· {studentId(entry)}</span></p><p className="text-xs text-slate-500">{entry.email}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setEditingEntry(entry); setEditFields({ name: entry.name || '', email: entry.email || '', studentid: studentId(entry) }); setError(''); }} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" aria-label={`Remove ${entry.name}`} onClick={() => onChange(selected.filter((item) => item !== entry))} className="rounded-lg border px-2 py-1 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div></div>}</div>)}</div></div>}
  </div>;
}
