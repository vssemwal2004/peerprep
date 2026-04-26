
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { Calendar, ClipboardList, Filter, Plus, Search, Trash2, Eye, Pencil, Copy, X } from 'lucide-react';
import AssessmentCard from './assessment/components/AssessmentCard';
import { SectionCard } from './compiler/CompilerUi';

const statusStyles = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
  Upcoming: 'bg-amber-50 text-amber-700 border-amber-200',
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-200 text-slate-700 border-slate-300',
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

export default function AssessmentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const toast = useToast();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    status: 'All',
    search: '',
    startDate: '',
    endDate: '',
  });

  const loadAssessments = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listAssessments();
      setAssessments(data.assessments || []);
    } catch (err) {
      setError(err.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, []);

  const summary = useMemo(() => {
    const total = assessments.length;
    const active = assessments.filter((a) => a.status === 'Active').length;
    const upcoming = assessments.filter((a) => a.status === 'Upcoming').length;
    const completed = assessments.filter((a) => a.status === 'Completed').length;
    return { total, active, upcoming, completed };
  }, [assessments]);

  const filtered = useMemo(() => {
    return assessments.filter((assessment) => {
      const matchesStatus = filters.status === 'All' || assessment.status === filters.status;
      const matchesSearch = !filters.search
        || assessment.title?.toLowerCase().includes(filters.search.toLowerCase());
      const startTime = assessment.startTime ? new Date(assessment.startTime).getTime() : null;
      const endTime = assessment.endTime ? new Date(assessment.endTime).getTime() : null;
      const startFilter = filters.startDate ? new Date(filters.startDate).getTime() : null;
      const endFilter = filters.endDate ? new Date(filters.endDate).getTime() : null;
      const matchesDate = (!startFilter || (startTime && startTime >= startFilter))
        && (!endFilter || (endTime && endTime <= endFilter));
      return matchesStatus && matchesSearch && matchesDate;
    });
  }, [assessments, filters]);

  const handleDelete = async (assessmentId) => {
    if (!confirm('Delete this assessment and all submissions?')) return;
    try {
      await api.deleteAssessment(assessmentId);
      toast.success('Assessment deleted');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to delete assessment');
    }
  };

  const handleDuplicate = async (assessmentId) => {
    try {
      const data = await api.getAssessmentById(assessmentId);
      const assessment = data.assessment;
      const payload = {
        ...assessment,
        title: `${assessment.title} (Copy)`,
        lifecycleStatus: 'draft',
      };
      await api.createAssessment(payload);
      toast.success('Assessment duplicated as draft');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to duplicate assessment');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-7xl px-4 py-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-white">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Assessment Dashboard</h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">Manage assessment lifecycle and performance.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`${rolePrefix}/assessment/create`)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            <Plus className="h-4 w-4" />
            Create Assessment
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <AssessmentCard label="Total Assessments" value={summary.total} helper="All drafts and published" Icon={ClipboardList} />
          <AssessmentCard label="Active" value={summary.active} helper="Currently running" Icon={Calendar} />
          <AssessmentCard label="Upcoming" value={summary.upcoming} helper="Scheduled next" Icon={Calendar} />
          <AssessmentCard label="Completed" value={summary.completed} helper="Closed" Icon={Calendar} />
        </div>

        <SectionCard
          title="Assessment Registry"
          subtitle="Filter and review assessments by status, timing, and target audience."
          action={(
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </div>
          )}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Search by title"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {['All', 'Draft', 'Upcoming', 'Active', 'Completed'].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-gray-700">
            {loading ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-gray-400">Loading assessments...</div>
            ) : error ? (
              <div className="p-6 text-center text-sm text-rose-600">{error}</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Start Time</th>
                    <th className="px-4 py-3">End Time</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                  {filtered.map((assessment) => (
                    <tr key={assessment._id} className="hover:bg-slate-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-gray-100">{assessment.title || 'Untitled'}</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400">Version {assessment.version || 1}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-gray-300">
                        {assessment.targetType === 'all' ? 'All Students' : 'Selected'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{formatDateTime(assessment.startTime)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{formatDateTime(assessment.endTime)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{assessment.attempts || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[assessment.status] || statusStyles.Upcoming}`}>
                          {assessment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelected(assessment)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`${rolePrefix}/assessment/${assessment._id}/edit`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(assessment._id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(assessment._id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>
      </motion.div>

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ opacity: 0, x: 320 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 320 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl dark:bg-gray-900"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selected.title || 'Assessment'}</h2>
                  <p className="text-xs text-slate-500 dark:text-gray-400">Assessment details</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <div className="text-xs text-slate-400">Description</div>
                  <div className="mt-1">{selected.description || 'No description provided.'}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    <div className="text-slate-400">Start</div>
                    <div className="mt-1 font-semibold">{formatDateTime(selected.startTime)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    <div className="text-slate-400">End</div>
                    <div className="mt-1 font-semibold">{formatDateTime(selected.endTime)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    <div className="text-slate-400">Duration</div>
                    <div className="mt-1 font-semibold">{selected.duration || '-'} min</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    <div className="text-slate-400">Attempts</div>
                    <div className="mt-1 font-semibold">{selected.attempts || 0}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <div className="text-slate-400">Sections</div>
                  <div className="mt-2 space-y-2">
                    {(selected.sections || []).map((section, idx) => (
                      <div key={`${section.sectionName}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                        <span className="font-semibold">{section.sectionName || `Section ${idx + 1}`}</span>
                        <span>{section.questions?.length || 0} questions</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
