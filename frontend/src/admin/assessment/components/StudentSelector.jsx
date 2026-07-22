import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Search,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../../utils/api';
import { mergeSemesterOptions } from '../../../utils/semesterOptions';

const PAGE_SIZE = 20;

export default function StudentSelector({ selected = [], onChange }) {
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [managedSemesters, setManagedSemesters] = useState([]);
  const [semesterFacets, setSemesterFacets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const selectedIds = useMemo(
    () => new Set(selected.map((student) => String(student._id))),
    [selected],
  );
  const semesterOptions = useMemo(
    () => mergeSemesterOptions(managedSemesters, semesterFacets),
    [managedSemesters, semesterFacets],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    api.getAllSemestersForStudent()
      .then((data) => {
        if (active) setManagedSemesters(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setManagedSemesters([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');

    api.listAllStudents({
      search: debouncedQuery,
      semester: selectedSemester,
      sortOrder: 'asc',
      page: pagination.page,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (requestRef.current !== requestId) return;
        const nextPagination = data.pagination || {
          page: 1,
          pages: 1,
          total: data.total ?? data.count ?? 0,
        };
        setStudents(Array.isArray(data.students) ? data.students : []);
        setSemesterFacets(data.facets?.semesters || []);
        setPagination((current) => ({ ...current, ...nextPagination }));
        if (nextPagination.page !== pagination.page) {
          setPagination((current) => ({ ...current, page: nextPagination.page }));
        }
      })
      .catch((requestError) => {
        if (requestRef.current !== requestId) return;
        setStudents([]);
        setError(requestError.message || 'Failed to load students');
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }, [debouncedQuery, pagination.page, selectedSemester]);

  const toggleStudent = (student) => {
    const id = String(student._id);
    if (selectedIds.has(id)) {
      onChange(selected.filter((item) => String(item._id) !== id));
      return;
    }
    onChange([...selected, student]);
  };

  const selectVisible = () => {
    const additions = students.filter((student) => !selectedIds.has(String(student._id)));
    if (additions.length > 0) onChange([...selected, ...additions]);
  };

  const visibleSelected = students.filter((student) => selectedIds.has(String(student._id))).length;
  const allVisibleSelected = students.length > 0 && visibleSelected === students.length;
  const firstResult = pagination.total === 0 ? 0 : ((pagination.page - 1) * PAGE_SIZE) + 1;
  const lastResult = Math.min(pagination.page * PAGE_SIZE, pagination.total);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/80 p-2.5 dark:border-gray-700 dark:bg-gray-800/60 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPagination((current) => ({ ...current, page: 1 }));
            }}
            placeholder="Search name, email, or student ID"
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-8 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/40"
          />
          {query && (
            <button
              type="button"
              title="Clear search"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                setDebouncedQuery('');
                setPagination((current) => ({ ...current, page: 1 }));
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="relative min-w-[165px]">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <select
            value={selectedSemester}
            onChange={(event) => {
              setSelectedSemester(event.target.value);
              setPagination((current) => ({ ...current, page: 1 }));
            }}
            aria-label="Filter students by semester"
            className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/40"
          >
            <option value="">All semesters</option>
            {semesterOptions.map((semester) => (
              <option key={semester.value} value={semester.value}>
                {semester.label}{Number.isFinite(semester.count) ? ` (${semester.count})` : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={selectVisible}
          disabled={loading || allVisibleSelected || students.length === 0}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Check className="h-3.5 w-3.5" />
          {allVisibleSelected ? 'Page selected' : 'Select page'}
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-gray-800 dark:text-gray-400">
        <span>{pagination.total.toLocaleString()} matching students</span>
        <span className="font-semibold text-sky-700 dark:text-sky-300">{selected.length} selected</span>
      </div>

      {error ? (
        <div className="px-3 py-8 text-center text-xs text-red-600 dark:text-red-400">{error}</div>
      ) : loading && students.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-slate-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading students...
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-3 py-10 text-center">
          <Users className="mb-2 h-6 w-6 text-slate-300 dark:text-gray-600" />
          <p className="text-xs font-medium text-slate-600 dark:text-gray-300">No students match these filters</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-gray-800">
          {students.map((student) => {
            const isSelected = selectedIds.has(String(student._id));
            return (
              <label
                key={student._id}
                className={`grid cursor-pointer grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1.5fr)_92px] items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-gray-800/70 ${isSelected ? 'bg-sky-50/70 dark:bg-sky-950/20' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleStudent(student)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-800 dark:text-gray-100">{student.name || 'Unnamed student'}</span>
                  <span className="block truncate text-[10px] text-slate-400">{student.studentId || 'No student ID'}</span>
                </span>
                <span className="truncate text-[11px] text-slate-500 dark:text-gray-400">{student.email || 'No email'}</span>
                <span className="text-right text-[10px] font-medium text-slate-500 dark:text-gray-400">
                  {student.semester ? `Semester ${student.semester}` : 'No semester'}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40">
        <span className="text-[10px] text-slate-500 dark:text-gray-400">
          {firstResult}-{lastResult} of {pagination.total.toLocaleString()}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="Previous page"
            aria-label="Previous page"
            disabled={loading || pagination.page <= 1}
            onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[72px] text-center text-[10px] font-medium text-slate-600 dark:text-gray-300">
            Page {pagination.page} of {pagination.pages || 1}
          </span>
          <button
            type="button"
            title="Next page"
            aria-label="Next page"
            disabled={loading || pagination.page >= (pagination.pages || 1)}
            onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="border-t border-slate-200 px-3 py-2.5 dark:border-gray-700">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-gray-300">Selected students</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
            >
              Clear all
            </button>
          </div>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {selected.map((student) => (
              <span
                key={student._id}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <span className="truncate">{student.name} ({student.studentId || 'No ID'})</span>
                <button
                  type="button"
                  title={`Remove ${student.name}`}
                  aria-label={`Remove ${student.name}`}
                  onClick={() => toggleStudent(student)}
                  className="flex-shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
