import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Trash2, Upload } from 'lucide-react';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      current += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else current += character;
  }
  values.push(current.trim());
  return values;
}

export default function AssessmentCandidateEditor({ selected = [], onChange }) {
  const fileRef = useRef(null);
  const [candidate, setCandidate] = useState({ name: '', email: '', studentid: '' });
  const [error, setError] = useState('');

  const addCandidates = (rows) => {
    const existingEmails = new Set(selected.map((entry) => String(entry.email || '').toLowerCase()));
    const valid = [];
    const invalid = [];
    rows.forEach((row, index) => {
      const name = String(row.name || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const studentid = String(row.studentid || '').trim();
      if (!name || !emailPattern.test(email)) invalid.push(index + 1);
      else if (!existingEmails.has(email)) {
        existingEmails.add(email);
        valid.push({ name, email, studentid, accessScope: 'assessment_only' });
      }
    });
    if (valid.length) onChange([...selected, ...valid]);
    setError(invalid.length ? `Skipped ${invalid.length} row${invalid.length === 1 ? '' : 's'} with a missing name or invalid email.` : '');
    return valid.length;
  };

  const addOne = () => {
    const added = addCandidates([candidate]);
    if (added) setCandidate({ name: '', email: '', studentid: '' });
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return setError('The CSV must include a header and at least one candidate.');
    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[\s_-]+/g, ''));
    const nameIndex = headers.indexOf('name');
    const emailIndex = headers.indexOf('email');
    const idIndex = headers.findIndex((header) => ['candidateid', 'studentid', 'externalid'].includes(header));
    if (nameIndex < 0 || emailIndex < 0) return setError('Use the assessment-candidate template. Required headers are Name and Email.');
    addCandidates(lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      return { name: values[nameIndex], email: values[emailIndex], studentid: idIndex >= 0 ? values[idIndex] : '' };
    }));
  };

  const downloadTemplate = () => {
    const blob = new Blob(['Name,Email,Candidate ID\nAarav Sharma,aarav@example.com,CAND-001\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'peerprep-assessment-candidates-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-sky-50/60 px-4 py-3 dark:border-gray-700 dark:bg-sky-950/20">
        <div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Assessment candidates</h3><p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">Only name and email are required. Candidate ID is optional.</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={downloadTemplate} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300"><Download className="h-3.5 w-3.5" />CSV template</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500"><Upload className="h-3.5 w-3.5" />Upload CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" />
        </div>
      </div>

      <div className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-[1fr_1.3fr_0.8fr_auto] dark:border-gray-800">
        <input value={candidate.name} onChange={(event) => setCandidate((current) => ({ ...current, name: event.target.value }))} placeholder="Full name *" className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
        <input value={candidate.email} onChange={(event) => setCandidate((current) => ({ ...current, email: event.target.value }))} placeholder="Email address *" type="email" className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
        <input value={candidate.studentid} onChange={(event) => setCandidate((current) => ({ ...current, studentid: event.target.value }))} placeholder="Candidate ID" className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />
        <button type="button" onClick={addOne} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-500"><Plus className="h-4 w-4" />Add</button>
      </div>
      {error && <div className="border-b border-orange-200 bg-orange-50 px-4 py-2 text-xs text-orange-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-orange-300">{error}</div>}

      {selected.length ? <div className="max-h-80 overflow-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:bg-gray-800"><tr><th className="px-4 py-2.5">Candidate</th><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Candidate ID</th><th className="w-14 px-4 py-2.5"><span className="sr-only">Remove</span></th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-gray-800">{selected.map((entry, index) => <tr key={`${entry.email}-${index}`}><td className="px-4 py-3 font-semibold text-slate-800 dark:text-gray-100">{entry.name}</td><td className="px-4 py-3 text-slate-500 dark:text-gray-400">{entry.email}</td><td className="px-4 py-3 text-slate-500 dark:text-gray-400">{entry.studentid || entry.studentId || 'Generated automatically'}</td><td className="px-4 py-3"><button type="button" onClick={() => onChange(selected.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Remove ${entry.name}`} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div> : <div className="flex flex-col items-center px-4 py-10 text-center"><FileSpreadsheet className="h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-600 dark:text-gray-300">No assessment candidates added</p></div>}
    </div>
  );
}
