
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import {
  Calendar, ClipboardList, Filter, Plus, Search, Trash2, Eye, EyeOff,
  Pencil, Copy, X, MoreVertical, Lock, Unlock, Globe, ShieldOff,
} from 'lucide-react';
import AssessmentCard from './assessment/components/AssessmentCard';
import { SectionCard } from './compiler/CompilerUi';

const statusStyles = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
  Upcoming: 'bg-amber-50 text-amber-700 border-amber-200',
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-200 text-slate-700 border-slate-300',
};

const tabs = [
  { id: 'all', label: 'All Assessments' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
];

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

function ThreeDotsMenu({ assessment, onEdit, onDuplicate, onDelete, onToggleVisibility, onEditPassword }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const item = (icon, label, onClick, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(); }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50 dark:hover:bg-gray-700 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-gray-200'}`}
    >
      {icon}
      {label}
    </button>
  );

  const isVisible = assessment.isVisible !== false;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 z-50 min-w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
          >
            {item(<Pencil className="h-3.5 w-3.5" />, 'Edit Assessment', onEdit)}
            {item(<Lock className="h-3.5 w-3.5" />, 'Edit Password', onEditPassword)}
            {item(
              isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />,
              isVisible ? 'Hide Test' : 'Show Test',
              onToggleVisibility,
            )}
            {item(<Copy className="h-3.5 w-3.5" />, 'Duplicate', onDuplicate)}
            <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
            {item(<Trash2 className="h-3.5 w-3.5" />, 'Delete Assessment', onDelete, true)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PasswordModal({ assessment, onClose, onSave }) {
  const [enabled, setEnabled] = useState(Boolean(assessment.passwordEnabled));
  const [value, setValue] = useState(assessment.password || '');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateAssessment(assessment._id, {
        ...assessment,
        passwordEnabled: enabled,
        password: enabled ? value : '',
      });
      toast.success('Password settings updated');
      onSave();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Password Protection</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Control access to <span className="font-medium">{assessment.title}</span></p>

        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">Enable Password</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">Candidates must enter password to start</p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-sky-600' : 'bg-slate-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {enabled && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-gray-400">Password</label>
              <div className="relative mt-1">
                <input
                  type={show ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={assessment.passwordEnabled ? 'Leave blank to keep current password' : 'Enter assessment password…'}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AssessmentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const toast = useToast();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ status: 'All', search: '', startDate: '', endDate: '' });

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

  useEffect(() => { loadAssessments(); }, []);

  const summary = useMemo(() => {
    const total = assessments.length;
    const active = assessments.filter((a) => a.status === 'Active').length;
    const upcoming = assessments.filter((a) => a.status === 'Upcoming').length;
    const completed = assessments.filter((a) => a.status === 'Completed').length;
    return { total, active, upcoming, completed };
  }, [assessments]);

  const filtered = useMemo(() => assessments.filter((a) => {
    // Filter by active tab
    let matchesTab = true;
    if (activeTab === 'drafts') {
      matchesTab = a.lifecycleStatus === 'draft';
    } else if (activeTab !== 'all') {
      matchesTab = a.status === activeTab;
    }

    const matchesStatus = filters.status === 'All' || a.status === filters.status;
    const matchesSearch = !filters.search || a.title?.toLowerCase().includes(filters.search.toLowerCase());
    const startTime = a.startTime ? new Date(a.startTime).getTime() : null;
    const endTime = a.endTime ? new Date(a.endTime).getTime() : null;
    const startFilter = filters.startDate ? new Date(filters.startDate).getTime() : null;
    const endFilter = filters.endDate ? new Date(filters.endDate).getTime() : null;
    const matchesDate = (!startFilter || (startTime && startTime >= startFilter)) && (!endFilter || (endTime && endTime <= endFilter));
    return matchesTab && matchesStatus && matchesSearch && matchesDate;
  }), [assessments, filters, activeTab]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this assessment and all submissions?')) return;
    try {
      await api.deleteAssessment(id);
      toast.success('Assessment deleted');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const data = await api.getAssessmentById(id);
      const a = data.assessment;
      await api.createAssessment({ ...a, title: `${a.title} (Copy)`, lifecycleStatus: 'draft' });
      toast.success('Duplicated as draft');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to duplicate');
    }
  };

  const handleToggleVisibility = async (assessment) => {
    try {
      await api.updateAssessment(assessment._id, { ...assessment, isVisible: !assessment.isVisible });
      toast.success(assessment.isVisible ? 'Test hidden' : 'Test visible');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to update visibility');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto max-w-7xl px-4 py-6">
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
          <button type="button" onClick={() => navigate(`${rolePrefix}/assessment/create`)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500">
            <Plus className="h-4 w-4" /> Create Assessment
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <AssessmentCard label="Total Assessments" value={summary.total} helper="All drafts and published" Icon={ClipboardList} />
          <AssessmentCard label="Active" value={summary.active} helper="Currently running" Icon={Calendar} />
          <AssessmentCard label="Upcoming" value={summary.upcoming} helper="Scheduled next" Icon={Calendar} />
          <AssessmentCard label="Completed" value={summary.completed} helper="Closed" Icon={Calendar} />
        </div>

        <SectionCard title="Assessment Registry" subtitle="Filter and review assessments by status, timing, and target audience." action={<div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400"><Filter className="h-3.5 w-3.5" /> Filters</div>}>
          <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-gray-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} placeholder="Search by title" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
            </div>
            <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              {['All', 'Draft', 'Upcoming', 'Active', 'Completed'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" />
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
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Start Time</th>
                    <th className="px-4 py-3">End Time</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Access</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                  {filtered.map((assessment) => (
                    <tr key={assessment._id} className="hover:bg-slate-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-gray-100">{assessment.title || 'Untitled'}</div>
                        <div className="text-xs text-slate-400 dark:text-gray-500">ID: {assessment.assessmentId || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{assessment.testType || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{formatDateTime(assessment.startTime)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{formatDateTime(assessment.endTime)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[assessment.status] || statusStyles.Upcoming}`}>
                          {assessment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${assessment.isVisible !== false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                            {assessment.isVisible !== false ? <Globe className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                            {assessment.isVisible !== false ? 'Visible' : 'Hidden'}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${assessment.passwordEnabled ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
                            {assessment.passwordEnabled ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                            {assessment.passwordEnabled ? 'Protected' : 'Open'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setSelected(assessment)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <ThreeDotsMenu
                            assessment={assessment}
                            onEdit={() => navigate(`${rolePrefix}/assessment/${assessment._id}/edit`)}
                            onDuplicate={() => handleDuplicate(assessment._id)}
                            onDelete={() => handleDelete(assessment._id)}
                            onToggleVisibility={() => handleToggleVisibility(assessment)}
                            onEditPassword={() => setPasswordTarget(assessment)}
                          />
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

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setSelected(null)} />
            <motion.div initial={{ opacity: 0, x: 320 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 320 }} className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selected.title || 'Assessment'}</h2>
                  <p className="text-xs text-slate-500 dark:text-gray-400">Assessment ID: {selected.assessmentId || '—'}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Access badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${selected.isVisible !== false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                  {selected.isVisible !== false ? <Globe className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                  {selected.isVisible !== false ? 'Visible to Students' : 'Hidden from Students'}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${selected.passwordEnabled ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
                  {selected.passwordEnabled ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  {selected.passwordEnabled ? 'Password Protected' : 'No Password Set'}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <div className="text-xs text-slate-400">Description</div>
                  <div className="mt-1">{selected.description || 'No description provided.'}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { label: 'Start', value: formatDateTime(selected.startTime) },
                    { label: 'End', value: formatDateTime(selected.endTime) },
                    { label: 'Duration', value: `${selected.duration || '-'} min` },
                    { label: 'Attempts', value: selected.attempts || 0 },
                    { label: 'Type', value: selected.testType || '—' },
                    { label: 'Target', value: selected.targetType === 'all' ? 'All Students' : 'Selected' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                      <div className="text-slate-400">{label}</div>
                      <div className="mt-1 font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <div className="text-slate-400">Sections</div>
                  <div className="mt-2 space-y-2">
                    {(selected.sections || []).map((sec, idx) => (
                      <div key={`${sec.sectionName}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                        <span className="font-semibold">{sec.sectionName || `Section ${idx + 1}`}</span>
                        <span>{sec.questions?.length || 0} questions</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" onClick={() => { setSelected(null); navigate(`${rolePrefix}/assessment/${selected._id}/edit`); }} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500">
                    <Pencil className="h-3.5 w-3.5" /> Edit Assessment
                  </button>
                  <button type="button" onClick={() => { setPasswordTarget(selected); setSelected(null); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200">
                    <Lock className="h-3.5 w-3.5" /> Edit Password
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Password Modal */}
      {passwordTarget && (
        <PasswordModal
          assessment={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSave={loadAssessments}
        />
      )}
    </div>
  );
}
