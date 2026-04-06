import { useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Download } from 'lucide-react';

const requiredColumns = ['name', 'email', 'studentid', 'branch', 'teacherid', 'semester', 'course', 'college'];
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function buildErrorsCsv(rows, errorsByRow) {
  if (!rows || rows.length === 0) return '';
  const headerKeys = Object.keys(rows[0]).filter((k) => k !== '__row');
  const header = [...headerKeys, 'error'];
  const dataRows = [];
  for (const row of rows) {
    const rowNum = row.__row;
    const errs = errorsByRow[rowNum];
    if (!errs) continue;
    const values = headerKeys.map((k) => `"${(row[k] ?? '').toString().replace(/"/g, '""')}"`);
    values.push(`"${errs.join('; ').replace(/"/g, '""')}"`);
    dataRows.push(values.join(','));
  }
  return header.map((h) => `"${h}"`).join(',') + '\n' + dataRows.join('\n');
}

export default function CSVUploader({ csvState, onChange }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result || '';
      try {
        const rows = text.trim().split(/\r?\n/);
        const header = rows.shift();
        const cols = parseCSVLine(header).map((s) => s.toLowerCase());

        const missingColumns = requiredColumns.filter((col) => !cols.includes(col));
        if (missingColumns.length > 0) {
          onChange({
            file,
            rows: [],
            errors: [{ row: 1, error: `Missing required columns: ${missingColumns.join(', ')}` }],
            summary: '',
          });
          return;
        }

        const parsed = rows.map((row, i) => {
          const vals = parseCSVLine(row);
          const obj = { __row: i + 2 };
          cols.forEach((c, idx) => (obj[c] = vals[idx] || ''));
          return obj;
        });

        const errs = [];
        const seenEmails = new Set();
        const seenIds = new Set();

        parsed.forEach((r) => {
          const rowNum = r.__row;
          const missing = [];
          if (!r.name || r.name.trim() === '') missing.push('name');
          if (!r.email || r.email.trim() === '') missing.push('email');
          if (!r.studentid && !r.student_id && !r.sid) missing.push('studentid');
          if (!r.branch || r.branch.trim() === '') missing.push('branch');
          if (!r.course || r.course.trim() === '') missing.push('course');
          if (!r.college || r.college.trim() === '') missing.push('college');
          if (!r.teacherid || r.teacherid.trim() === '') missing.push('teacherid');
          if (!r.semester || r.semester.trim() === '') missing.push('semester');

          if (r.group && r.group.trim() !== '') {
            const groupValue = r.group.trim().toUpperCase();
            if (!['G1', 'G2', 'G3', 'G4', 'G5'].includes(groupValue)) {
              errs.push({ row: rowNum, error: 'Invalid group value. Must be G1, G2, G3, G4, or G5', details: ['group'] });
            }
          }

          if (missing.length > 0) {
            errs.push({ row: rowNum, error: 'Missing required fields', details: missing });
          } else {
            const email = r.email.toLowerCase().trim();
            if (!emailRegex.test(email)) errs.push({ row: rowNum, error: 'Invalid email address format' });
            if (seenEmails.has(email)) errs.push({ row: rowNum, error: 'Duplicate email found in this file', details: 'email' });
            if (seenIds.has(r.studentid || r.student_id || r.sid)) errs.push({ row: rowNum, error: 'Duplicate student ID found in this file', details: 'studentid' });
            seenEmails.add(email);
            seenIds.add(r.studentid || r.student_id || r.sid);
          }
        });

        const summary = errs.length === 0
          ? `CSV validated. ${parsed.length} student(s) ready to assign.`
          : `Found ${errs.length} error(s). Fix the CSV to proceed.`;

        onChange({ file, rows: parsed, errors: errs, summary });
      } catch (err) {
        onChange({ file, rows: [], errors: [{ row: 0, error: err.message || 'Failed to parse CSV' }], summary: '' });
      }
    };
    reader.readAsText(file);
  };

  const errorsByRow = (csvState.errors || []).reduce((acc, cur) => {
    const msg = cur.details ? (Array.isArray(cur.details) ? cur.details.join(', ') : cur.details) : cur.error;
    if (!acc[cur.row]) acc[cur.row] = [];
    acc[cur.row].push(msg || cur.error);
    return acc;
  }, {});

  const downloadErrorsCsv = () => {
    if (!csvState.rows || csvState.rows.length === 0 || csvState.errors.length === 0) return;
    const csv = buildErrorsCsv(csvState.rows, errorsByRow);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assessment-students-errors.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border-2 border-dashed p-6 transition-colors ${
          dragActive
            ? 'border-sky-500 bg-sky-50 dark:border-sky-400/60 dark:bg-sky-900/10'
            : 'border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800/40'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm dark:bg-gray-900 dark:text-sky-300">
            <Upload className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Drag & drop your CSV file here</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">Use the student onboarding template for header structure.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0])} />
            Browse File
          </label>
        </div>
      </div>

      {csvState.file && (
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
          <FileText className="h-4 w-4" />
          {csvState.file.name}
        </div>
      )}

      {csvState.summary && (
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
          {csvState.errors.length === 0 ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-rose-500" />}
          {csvState.summary}
        </div>
      )}

      {csvState.errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/10">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Validation errors</div>
            <button type="button" onClick={downloadErrorsCsv} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
              <Download className="h-3.5 w-3.5" />
              Download errors CSV
            </button>
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {csvState.errors.map((err, idx) => (
              <div key={`${err.row}-${idx}`}>Row {err.row}: {err.error}</div>
            ))}
          </div>
        </div>
      )}

      {csvState.rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-gray-700 dark:text-gray-300">
            Preview ({csvState.rows.length} students)
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  {Object.keys(csvState.rows[0]).filter((k) => k !== '__row').map((key) => (
                    <th key={key} className="px-3 py-2 font-semibold uppercase">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {csvState.rows.slice(0, 8).map((row) => (
                  <tr key={row.__row}>
                    {Object.keys(csvState.rows[0]).filter((k) => k !== '__row').map((key) => (
                      <td key={`${row.__row}-${key}`} className="px-3 py-2 text-slate-700 dark:text-gray-200">{row[key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {csvState.rows.length > 8 && (
            <div className="px-4 py-2 text-xs text-slate-500 dark:text-gray-400">Showing first 8 rows</div>
          )}
        </div>
      )}
    </div>
  );
}
