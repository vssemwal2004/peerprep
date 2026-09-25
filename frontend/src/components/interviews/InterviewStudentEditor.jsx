import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '../../utils/api';
import { mergeInterviewStudents, parseStudentCsv, serializeStudents, STUDENT_COLUMNS, studentCsvFile } from './interviewSetup';

const inputClass = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800';

export default function InterviewStudentEditor({ mode, special, selected, onChange, onPendingChange }) {
  const [identity, setIdentity] = useState('');
  const [rows, setRows] = useState([]);
  const [results, setResults] = useState([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const fileRef = useRef(null);

  useEffect(() => { onPendingChange(busy || !!fileName); }, [busy, fileName, onPendingChange]);
  useEffect(() => () => { request.current += 1; }, []);

  const check = async (values) => {
    const file = studentCsvFile(values);
    let specialRows;
    if (special) specialRows = (await api.checkSpecialEventCsv(file)).results;
    const response = await api.checkInterviewParticipantCsv(file);
    if (response.results?.length !== values.length || (special && specialRows?.length !== values.length)) throw new Error('The server returned an incomplete review. Please try again.');
    return response.results.map((result, index) => {
      if (special && specialRows[index].status !== 'ready') return specialRows[index];
      if (result.status === 'ready' && special) return { ...result, student: { ...result.student, ...values[index], _id: result.student._id } };
      return result;
    });
  };

  const review = async (values) => {
    const version = ++request.current;
    setBusy(true); setError(''); setResults([]); setNotice('');
    try {
      const next = await check(values);
      if (version === request.current) setResults(next);
    } catch (err) { if (version === request.current) setError(err.message || 'Could not review the CSV.'); }
    finally { if (version === request.current) setBusy(false); }
  };

  const upload = async (file) => {
    if (!file) return;
    const version = ++request.current;
    setError(''); setResults([]); setRows([]); setFileName(file.name); setBusy(true); setNotice('');
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file. Export Excel sheets as CSV first.');
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a CSV smaller than 2 MB.');
      const values = parseStudentCsv(await file.text());
      if (version !== request.current) return;
      setRows(values);
      await review(values);
    } catch (err) { if (version === request.current) { setError(err.message); setBusy(false); } }
  };

  const addIndividual = async (event) => {
    event.preventDefault();
    if (!identity.trim() || busy) return;
    const version = ++request.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const row = identity.includes('@') ? { email: identity.trim() } : { studentid: identity.trim() };
      const response = await api.checkInterviewParticipantCsv(studentCsvFile([row]));
      const result = response.results?.[0];
      if (result?.status !== 'ready') throw new Error(result?.message || 'Registered student not found.');
      if (special) {
        const validation = await api.checkSpecialEventCsv(studentCsvFile([result.student]));
        if (validation.results?.[0]?.status !== 'ready') throw new Error(validation.results?.[0]?.message || 'This student is not eligible for a Special interview.');
      }
      if (version !== request.current) return;
      const next = mergeInterviewStudents(selected, [result.student]);
      onChange(next);
      setNotice(next.length === selected.length ? 'This student is already selected.' : `${result.student.name} added to the interview.`);
      setIdentity('');
    } catch (err) { if (version === request.current) setError(err.message || 'Could not add this student.'); }
    finally { if (version === request.current) setBusy(false); }
  };

  const clear = () => {
    request.current += 1; setRows([]); setResults([]); setFileName(''); setError(''); setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const ready = results.filter((row) => row.status === 'ready').length;
  const columns = special ? STUDENT_COLUMNS : ['email', 'studentid'];
  const sample = serializeStudents([{ name: 'Registered student name', email: 'student@example.com', studentid: 'ST001', branch: 'CSE', semester: '1', teacherid: 'COORD001' }]);

  return (
    <div className="space-y-4">
      {mode === 'individual' ? (
        <form onSubmit={addIndividual} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <label htmlFor="interview-student-identity" className="text-sm font-semibold text-slate-800 dark:text-white">Student email or ID</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input id="interview-student-identity" value={identity} disabled={busy} onChange={(e) => setIdentity(e.target.value)} placeholder="Enter a registered email or student ID" className={inputClass} required />
            <button type="submit" disabled={busy || !identity.trim()} className={`${buttonClass} shrink-0`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add student</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Only registered students within your access scope can be added. No new accounts are created here.</p>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
            <div><h3 className="text-sm font-semibold text-slate-800 dark:text-white">Import registered students</h3><p className="mt-1 text-xs text-slate-500">CSV · Up to 1,000 rows · Maximum 2 MB</p></div>
            <div className="flex flex-wrap gap-2">
              <a className={buttonClass} download="interview-students-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(sample)}`}><Download className="h-4 w-4" />Sample CSV</a>
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={buttonClass}><Upload className="h-4 w-4" />{fileName ? 'Replace CSV' : 'Choose CSV'}</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Upload interview students CSV" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">{special ? 'Special interviews require Name, Email, Student ID and Branch. Include the assigned Teacher ID / Coordinator code for students with a coordinator. Student details must match their registered profiles.' : 'Include Email or Student ID. If both are provided, they must refer to the same registered student.'}</p>
          {fileName && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span className="break-all">{fileName}{rows.length > 0 ? ` · ${rows.length} rows` : ''}</span><button type="button" onClick={clear} className={buttonClass}>Discard import</button></div>}
          {rows.length > 0 && <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p role="status" className="text-slate-500">{busy ? 'Checking registered student records…' : results.length ? `${ready} ready · ${results.length - ready} need attention` : 'Rows changed. Check them again before adding.'}</p><button type="button" onClick={() => review(rows)} disabled={busy} className={buttonClass}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Check rows</button></div>
            <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 dark:border-gray-700">
              <table className="w-full text-left text-xs"><caption className="sr-only">Review and correct imported students</caption><thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 dark:bg-gray-800 dark:text-gray-300"><tr><th className="p-3">Row</th>{columns.map((column) => <th key={column} className="p-3 capitalize">{column === 'studentid' ? 'Student ID' : column === 'teacherid' ? 'Teacher ID' : column}</th>)}<th className="p-3">Validation</th><th className="p-3"><span className="sr-only">Remove</span></th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">{rows.map((row, index) => <tr key={index} className="bg-white dark:bg-gray-900"><td className="p-3 text-slate-500">{index + 2}</td>{columns.map((column) => <td key={column} className="min-w-40 p-2"><input disabled={busy} aria-label={`Row ${index + 2} ${column}`} className={inputClass} value={row[column] || ''} onChange={(e) => { setRows(rows.map((value, i) => i === index ? { ...value, [column]: e.target.value } : value)); setResults([]); }} /></td>)}<td className="min-w-52 p-3"><span className={results[index]?.status === 'ready' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-gray-300'}>{results[index]?.status === 'ready' ? 'Ready to add' : results[index]?.message || results[index]?.status?.replaceAll('_', ' ') || 'Needs review'}</span></td><td className="p-2"><button type="button" disabled={busy} aria-label={`Remove row ${index + 2}`} className={buttonClass} onClick={() => { setRows(rows.filter((_, i) => i !== index)); setResults([]); }}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody>
              </table>
            </div>
            <div className="flex justify-end"><button type="button" disabled={busy || ready !== rows.length || !ready} className={`${buttonClass} border-sky-200 text-sky-700`} onClick={() => { const next = mergeInterviewStudents(selected, results.map((row) => row.student)); onChange(next); setNotice(`${next.length - selected.length} students added. Already-selected students were skipped.`); clear(); }}><Plus className="h-4 w-4" />Add {ready || ''} students</button></div>
          </>}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
    </div>
  );
}
