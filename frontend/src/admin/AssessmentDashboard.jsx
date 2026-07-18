
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import {
  Calendar, ClipboardList, Filter, Plus, Search, Trash2, Eye, EyeOff,
  Pencil, Copy, X, MoreVertical, Lock, Unlock, Globe, ShieldOff,
  RotateCcw, CheckCircle2, AlertTriangle, FileCheck2, Mail, Send, Loader2,
  Users, UserMinus, UserPlus,
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
const formatShortDate = (value) => (
  value
    ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : '-'
);

const getStudentAddedBadgeClass = (createdAt) => {
  const createdTime = createdAt ? new Date(createdAt).getTime() : 0;
  if (!createdTime) return 'border-slate-200 bg-slate-50 text-slate-500';
  const ageDays = (Date.now() - createdTime) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (ageDays <= 30) return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
};

function ThreeDotsMenu({ assessment, onEdit, onDuplicate, onDelete, onToggleVisibility, onEditPassword, onSendInvitations, onEligibleStudents, onAddStudents, onResetSubmissions, onMarkComplete, onReleaseAnswers }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuWidth = 240;
      const menuHeight = menuRef.current?.getBoundingClientRect().height || 360;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const left = Math.max(8, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 8));
      const opensUpward = rect.bottom + 8 + menuHeight > viewportHeight - 8;
      const top = opensUpward
        ? Math.max(8, rect.top - menuHeight - 8)
        : Math.min(rect.bottom + 8, viewportHeight - menuHeight - 8);

      setMenuStyle({ left, top, width: menuWidth, transformOrigin: opensUpward ? 'bottom right' : 'top right' });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

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
  const menu = (
    <AnimatePresence>
      {open && menuStyle && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.12 }}
          style={menuStyle}
          className="fixed z-[90] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-950/5 dark:border-gray-700 dark:bg-gray-900"
        >
          {item(<Pencil className="h-3.5 w-3.5" />, 'Edit Assessment', onEdit)}
          {item(<Lock className="h-3.5 w-3.5" />, 'Edit Password', onEditPassword)}
          {assessment.lifecycleStatus !== 'draft' && item(<Users className="h-3.5 w-3.5" />, 'Eligible Students', onEligibleStudents)}
          {assessment.lifecycleStatus !== 'draft' && item(<UserPlus className="h-3.5 w-3.5" />, 'Add Student', onAddStudents)}
          {assessment.lifecycleStatus !== 'draft' && item(<Mail className="h-3.5 w-3.5" />, 'Send Mail to Eligible Students', onSendInvitations)}
          {item(
            isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />,
            isVisible ? 'Hide Test' : 'Show Test',
            onToggleVisibility,
          )}
          {item(<Copy className="h-3.5 w-3.5" />, 'Duplicate', onDuplicate)}
          <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
          {item(<RotateCcw className="h-3.5 w-3.5" />, 'Reset Test Submissions', onResetSubmissions)}
          {item(<CheckCircle2 className="h-3.5 w-3.5" />, 'Mark as Complete', onMarkComplete)}
          {item(<FileCheck2 className="h-3.5 w-3.5" />, 'Generate Answers', onReleaseAnswers)}
          <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
          {item(<Trash2 className="h-3.5 w-3.5" />, 'Delete Assessment', onDelete, true)}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {createPortal(menu, document.body)}
    </div>
  );
}

function InvitationModal({ assessment, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const sendInvitations = async () => {
    if (assessment.passwordEnabled && !password.trim()) {
      toast.error('Enter the assessment password first.');
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const response = await api.sendAssessmentInvitations(assessment._id, password);
      setResult(response);
      if (response.failed > 0) toast.info(`${response.sent} sent, ${response.failed} failed.`);
      else toast.success(`Invitation sent to ${response.sent} eligible student${response.sent === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error.message || 'Failed to send invitations.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300"><Mail className="h-5 w-5" /></div>
            <div><h3 className="text-base font-semibold text-slate-900 dark:text-white">Send assessment invitation</h3><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Professional PeerPrep email for every eligible student.</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 dark:border-gray-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="font-semibold text-slate-900 dark:text-white">{assessment.title}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-gray-400">
            <span>Starts: {formatDateTime(assessment.startTime)}</span><span>Duration: {assessment.duration || '-'} min</span>
            <span>Target: {assessment.targetType === 'all' ? 'All eligible students' : `${assessment.assignedCount || 0} selected`}</span><span>{assessment.passwordEnabled ? 'Password protected' : 'No password'}</span>
          </div>
        </div>

        {assessment.passwordEnabled && (
          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-600 dark:text-gray-300">Confirm assessment password</label>
            <div className="relative mt-1.5"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter the current assessment password" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            <p className="mt-1.5 text-xs text-slate-500">The server verifies this password before including it in the invitation; it is never read back from storage.</p>
          </div>
        )}

        {result && <div className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${result.failed ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{result.sent} sent · {result.failed} failed · {result.eligible} eligible</div>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={sending} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-gray-700 dark:text-gray-300">Close</button><button type="button" onClick={sendInvitations} disabled={sending || Boolean(result)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Sending...' : result ? 'Invitations processed' : 'Send to all eligible students'}</button></div>
      </motion.div>
    </div>
  );
}

const submissionStatusStyles = {
  none: 'border-slate-200 bg-slate-50 text-slate-500',
  not_started: 'border-slate-200 bg-slate-50 text-slate-500',
  in_progress: 'border-sky-200 bg-sky-50 text-sky-700',
  submitted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  violation: 'border-rose-200 bg-rose-50 text-rose-700',
  expired: 'border-amber-200 bg-amber-50 text-amber-700',
  incomplete: 'border-amber-200 bg-amber-50 text-amber-700',
};

const submissionLabel = (status) => {
  if (!status) return 'Not started';
  return String(status).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

function StudentActionsMenu({ student, onViewProfile, onResetSubmission, onRemoveStudent }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (ref.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }
    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = 210;
      const height = menuRef.current?.getBoundingClientRect().height || 150;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const left = Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));
      const top = rect.bottom + 8 + height > viewportHeight
        ? Math.max(8, rect.top - height - 8)
        : rect.bottom + 8;
      setMenuStyle({ left, top, width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const item = (icon, label, onClick, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(student); }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-gray-800 ${danger ? 'text-rose-600 dark:text-rose-300' : 'text-slate-700 dark:text-gray-200'}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div ref={ref} className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && menuStyle && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.12 }}
              style={menuStyle}
              className="fixed z-[95] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl ring-1 ring-slate-950/5 dark:border-gray-700 dark:bg-gray-900"
            >
              {item(<Eye className="h-3.5 w-3.5" />, 'View Profile', onViewProfile)}
              {item(<RotateCcw className="h-3.5 w-3.5" />, 'Reset Submission', onResetSubmission)}
              <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
              {item(<UserMinus className="h-3.5 w-3.5" />, 'Remove from Assessment', onRemoveStudent, true)}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function EligibleStudentsModal({ assessment, rolePrefix, onClose, onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [addMode, setAddMode] = useState(Boolean(assessment.startInAddMode));
  const [candidateSearch, setCandidateSearch] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [addingStudents, setAddingStudents] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listAssessmentEligibleStudents(assessment._id);
      setStudents(data.students || []);
      setSummary(data.summary || null);
    } catch (error) {
      toast.error(error.message || 'Failed to load eligible students.');
    } finally {
      setLoading(false);
    }
  }, [assessment._id, toast]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  useEffect(() => {
    if (!addMode) return undefined;
    let mounted = true;
    const loadCandidates = async () => {
      setLoadingCandidates(true);
      try {
        const data = await api.listAllStudents('', 'desc');
        if (mounted) setAllStudents(data.students || []);
      } catch (error) {
        if (mounted) {
          setAllStudents([]);
          toast.error(error.message || 'Failed to load platform students.');
        }
      } finally {
        if (mounted) setLoadingCandidates(false);
      }
    };
    loadCandidates();
    return () => { mounted = false; };
  }, [addMode, toast]);

  const assignedIds = useMemo(() => new Set(students.map((student) => String(student._id))), [students]);
  const selectedCandidateIdSet = useMemo(() => new Set(selectedCandidateIds), [selectedCandidateIds]);
  const selectedCandidateStudents = useMemo(() => (
    allStudents.filter((student) => selectedCandidateIdSet.has(String(student._id || student.id || student.studentId || student.email || '')))
  ), [allStudents, selectedCandidateIdSet]);

  const candidateStudents = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    return allStudents
      .filter((student) => !assignedIds.has(String(student._id)))
      .filter((student) => {
        if (!query) return true;
        return [
          student.name,
          student.email,
          student.studentId,
          student.course,
          student.branch,
          student.college,
          student.group,
        ].some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 60);
  }, [allStudents, assignedIds, candidateSearch]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => [
      student.name,
      student.email,
      student.studentId,
      student.course,
      student.branch,
      student.college,
      student.group,
      student.submission?.status,
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [students, search]);

  const openProfile = (student) => {
    onClose();
    navigate(`${rolePrefix}/students/${student._id}`);
  };

  const resetSubmission = async (student) => {
    if (!confirm(`Reset submission for ${student.name || student.email || 'this student'}?`)) return;
    setBusyId(student._id);
    try {
      const result = await api.resetAssessmentStudentSubmission(assessment._id, student._id);
      toast.success(result.deletedSubmissions ? 'Student submission reset.' : 'No submission existed for this student.');
      await loadStudents();
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to reset student submission.');
    } finally {
      setBusyId('');
    }
  };

  const removeStudent = async (student) => {
    if (!confirm(`Remove ${student.name || student.email || 'this student'} from this assessment? Their existing submission will also be removed.`)) return;
    setBusyId(student._id);
    try {
      await api.removeAssessmentEligibleStudent(assessment._id, student._id);
      toast.success('Student removed from assessment.');
      await loadStudents();
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to remove student from assessment.');
    } finally {
      setBusyId('');
    }
  };

  const toggleCandidate = (studentId) => {
    setSelectedCandidateIds((previous) => (
      previous.includes(studentId)
        ? previous.filter((id) => id !== studentId)
        : [...previous, studentId]
    ));
  };

  const addSelectedStudents = async () => {
    if (!selectedCandidateIds.length) {
      toast.error('Select at least one student to add.');
      return;
    }
    setAddingStudents(true);
    try {
      const result = await api.addAssessmentEligibleStudents(assessment._id, selectedCandidateIds, selectedCandidateStudents);
      toast.success(`Added ${result.addedCount || selectedCandidateIds.length} student${(result.addedCount || selectedCandidateIds.length) === 1 ? '' : 's'} to assessment.`);
      setSelectedCandidateIds([]);
      setAddMode(false);
      await loadStudents();
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to add students to assessment.');
    } finally {
      setAddingStudents(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-5 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 dark:border-gray-700 dark:bg-gray-900 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
              <Users className="h-3.5 w-3.5" />
              Eligible Students
            </div>
            <h3 className="mt-2 text-xl font-bold text-slate-950 dark:text-white">{assessment.title || 'Assessment'}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-gray-400">
              View assigned students, add recent platform students, reset individual submissions, or remove students from this assessment.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => setAddMode((value) => !value)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${addMode ? 'bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
            >
              <UserPlus className="h-4 w-4" />
              {addMode ? 'Hide Add' : 'Add Student'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50/40 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ['Total', summary?.total ?? students.length],
              ['Not Started', summary?.notStarted ?? 0],
              ['In Progress', summary?.inProgress ?? 0],
              ['Submitted', summary?.submitted ?? 0],
              ['Other', summary?.other ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">{label}</div>
                <div className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{value}</div>
              </div>
            ))}
          </div>
          <div className="relative mt-4 max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search students, email, ID, course..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-sky-500/10"
            />
          </div>
        </div>

        {addMode && (
          <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-base font-bold text-slate-950 dark:text-white">Add Platform Students</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-gray-400">Recent students who are already eligible are hidden from this list.</div>
              </div>
              <div className="relative w-full max-w-lg">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={candidateSearch}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                  placeholder="Search students to add..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-sky-500/10"
                />
              </div>
            </div>

            <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              {loadingCandidates ? (
                <div className="flex items-center justify-center p-6 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-600" />
                  Loading recent students...
                </div>
              ) : candidateStudents.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No recently added students are available to add.</div>
              ) : (
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[44px_1.4fr_1fr_1fr_140px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    <div />
                    <div>Student</div>
                    <div>Student ID</div>
                    <div>Course / Branch</div>
                    <div>Added On</div>
                  </div>
                  {candidateStudents.map((student) => {
                    const studentId = String(student._id || student.id || student.studentId || student.email || '');
                    const selected = selectedCandidateIdSet.has(studentId);
                    return (
                      <button
                        key={student._id}
                        type="button"
                        onClick={() => toggleCandidate(studentId)}
                        className={`grid w-full grid-cols-[44px_1.4fr_1fr_1fr_140px] items-center px-4 py-3 text-left transition-colors ${selected ? 'bg-sky-50 text-sky-950 dark:bg-sky-900/20 dark:text-sky-100' : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`}
                      >
                        <div>
                          <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white dark:border-gray-600 dark:bg-gray-950'}`}>
                            {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{student.name || 'Unnamed Student'}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">{student.email || '-'}</div>
                        </div>
                        <div className="font-mono text-xs text-slate-600 dark:text-slate-300">{student.studentId || '-'}</div>
                        <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
                          <div className="truncate">{student.course || '-'}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">{student.branch || '-'}</div>
                        </div>
                        <div>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStudentAddedBadgeClass(student.createdAt)}`}>
                            {formatShortDate(student.createdAt)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-600 dark:text-gray-300">{selectedCandidateIds.length} selected</div>
              <button
                type="button"
                onClick={addSelectedStudents}
                disabled={addingStudents || selectedCandidateIds.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addingStudents ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {addingStudents ? 'Adding...' : 'Add Selected'}
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-sky-600" />
              Loading eligible students...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No eligible students found.</div>
          ) : (
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Semester</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Submission</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Violations</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {filteredStudents.map((student) => {
                  const status = student.submission?.status || 'none';
                  const score = Number(student.submission?.score);
                  const maxMarks = Number(student.submission?.maxMarks);
                  const violations = Number(student.submission?.tabSwitches || 0)
                    + Number(student.submission?.fullscreenExits || 0)
                    + Number(student.submission?.cameraFlags || 0)
                    + Number(student.submission?.copyPasteCount || 0);
                  return (
                    <tr key={student._id} className={busyId === student._id ? 'opacity-60' : 'hover:bg-slate-50 dark:hover:bg-sky-400/5'}>
                      <td className="px-6 py-4">
                        <button type="button" onClick={() => openProfile(student)} className="text-left font-bold text-slate-950 hover:text-sky-700 hover:underline dark:text-white dark:hover:text-sky-300">
                          {student.name || 'Unnamed Student'}
                        </button>
                        <div className="mt-0.5 text-xs text-slate-500">{student.email || '-'}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">{student.studentId || '-'}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.course || '-'}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.branch || '-'}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.semester || '-'}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.group || '-'}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${submissionStatusStyles[status] || submissionStatusStyles.none}`}>
                          {submissionLabel(status)}
                        </span>
                        {student.submission?.updatedAt && <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(student.submission.updatedAt)}</div>}
                      </td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                        {Number.isFinite(score) ? `${score}${Number.isFinite(maxMarks) ? ` / ${maxMarks}` : ''}` : '-'}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600 dark:text-slate-300">{violations}</td>
                      <td className="px-6 py-4 text-right">
                        <StudentActionsMenu
                          student={student}
                          onViewProfile={openProfile}
                          onResetSubmission={resetSubmission}
                          onRemoveStudent={removeStudent}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ConfirmActionModal({ action, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false);
  if (!action) return null;

  const isDanger = action.tone === 'danger';
  const isInfo = action.tone === 'info';
  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(action);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isDanger ? 'bg-rose-50 text-rose-600' : isInfo ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {isDanger ? <RotateCcw className="h-5 w-5" /> : isInfo ? <FileCheck2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{action.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-gray-300">{action.message}</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {action.assessment?.title || 'Untitled assessment'}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className={`rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
              isDanger ? 'bg-rose-600 hover:bg-rose-500' : isInfo ? 'bg-sky-600 hover:bg-sky-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {saving ? 'Working...' : action.confirmLabel}
          </button>
        </div>
      </motion.div>
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
  const [invitationTarget, setInvitationTarget] = useState(null);
  const [eligibleTarget, setEligibleTarget] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
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
      matchesTab = String(a.status || '').toLowerCase() === activeTab;
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

  const openResetSubmissions = (assessment) => {
    setConfirmAction({
      type: 'reset',
      tone: 'danger',
      assessment,
      title: 'Reset test submissions?',
      message: 'All student submissions, answers, scores, security logs, and progress for this test will be deleted. Students will see a fresh test and can start again while the schedule is open.',
      confirmLabel: 'Reset Test',
    });
  };

  const openMarkComplete = (assessment) => {
    setConfirmAction({
      type: 'complete',
      tone: 'warning',
      assessment,
      title: 'Mark assessment as complete?',
      message: 'Students will no longer be able to start or continue this assessment. On the student side, the assessment will appear as Completed.',
      confirmLabel: 'Mark Complete',
    });
  };

  const openReleaseAnswers = (assessment) => {
    setConfirmAction({
      type: 'releaseAnswers',
      tone: 'info',
      assessment,
      title: 'Generate answers for students?',
      message: 'This will release the student report for this assessment with score, question review, correct answers, section analytics, and rank wherever backend data is available. Students will see it dynamically on their report page after refresh.',
      confirmLabel: 'Generate Answers',
    });
  };

  const handleConfirmAction = async (action) => {
    try {
      if (action.type === 'reset') {
        const result = await api.resetAssessmentSubmissions(action.assessment._id);
        toast.success(`Test reset. ${result.deletedSubmissions || 0} submission${Number(result.deletedSubmissions || 0) === 1 ? '' : 's'} deleted.`);
      } else if (action.type === 'complete') {
        await api.markAssessmentComplete(action.assessment._id);
        toast.success('Assessment marked as complete');
      } else if (action.type === 'releaseAnswers') {
        await api.releaseAssessmentAnswers(action.assessment._id);
        toast.success('Answers and detailed reports released to students');
      }
      setConfirmAction(null);
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Action failed');
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
                            onSendInvitations={() => setInvitationTarget(assessment)}
                            onEligibleStudents={() => setEligibleTarget(assessment)}
                            onAddStudents={() => setEligibleTarget({ ...assessment, startInAddMode: true })}
                            onResetSubmissions={() => openResetSubmissions(assessment)}
                            onMarkComplete={() => openMarkComplete(assessment)}
                            onReleaseAnswers={() => openReleaseAnswers(assessment)}
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
      {invitationTarget && <InvitationModal assessment={invitationTarget} onClose={() => setInvitationTarget(null)} />}
      {eligibleTarget && (
        <EligibleStudentsModal
          assessment={eligibleTarget}
          rolePrefix={rolePrefix}
          onClose={() => setEligibleTarget(null)}
          onChanged={loadAssessments}
        />
      )}
      <ConfirmActionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
