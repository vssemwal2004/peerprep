import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../../../utils/api';

export default function StudentSelector({ selected = [], onChange, students: initialStudents }) {
  const [students, setStudents] = useState(initialStudents || []);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialStudents && initialStudents.length > 0) {
      setStudents(initialStudents);
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.listAllStudents('', 'asc');
        if (!mounted) return;
        setStudents(data.students || []);
      } catch {
        if (!mounted) return;
        setStudents([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [initialStudents]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s._id)), [selected]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return students.slice(0, 12);
    return students.filter((s) => (
      s.name?.toLowerCase().includes(term)
      || s.email?.toLowerCase().includes(term)
      || s.studentId?.toLowerCase().includes(term)
    )).slice(0, 12);
  }, [students, query]);

  const toggleStudent = (student) => {
    if (selectedIds.has(student._id)) {
      onChange(selected.filter((s) => s._id !== student._id));
    } else {
      onChange([...selected, student]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or student ID"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
          <span>{loading ? 'Loading students...' : 'Suggested students'}</span>
          <span>{selected.length} selected</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {filtered.map((student) => (
            <button
              key={student._id}
              type="button"
              onClick={() => toggleStudent(student)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                selectedIds.has(student._id)
                  ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400/60 dark:bg-sky-900/20 dark:text-sky-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <div>
                <div className="font-semibold">{student.name}</div>
                <div className="text-[11px] text-slate-400">{student.email} - {student.studentId}</div>
              </div>
              <div className="text-[11px] font-semibold">{selectedIds.has(student._id) ? 'Selected' : 'Add'}</div>
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-xs font-semibold text-slate-600 dark:text-gray-300">Selected Students</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.map((student) => (
              <span key={student._id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                {student.name} ({student.studentId})
                <button type="button" onClick={() => toggleStudent(student)}>
                  <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
