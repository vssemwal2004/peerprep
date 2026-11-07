import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import {
  ArrowLeft, BarChart3, Download, FileSpreadsheet, Filter,
  GraduationCap, LayoutDashboard, Loader2, Megaphone, Search,
  ShieldAlert, SlidersHorizontal, X,
} from 'lucide-react';
import {
  FilterChip,
  TableEmpty, TableRow, SkeletonRow,
  formatDuration, formatDateTime,
} from './reports/ReportComponents';
import ColumnHeader from './reports/ColumnHeader';
import PageNav from './reports/PageNav';
import ReportDetailDrawer from './reports/ReportDetailDrawer';
import ReportViolationModal from './reports/ReportViolationModal';
import ReportOverview from './reports/ReportOverview';
import RosterFilterSheet from './reports/RosterFilterSheet';
import LiveRefreshControl from './reports/LiveRefreshControl';
import useLiveAssessmentRoster, { DEFAULT_REFRESH_INTERVAL_MS } from './reports/useLiveAssessmentRoster';
import {
  ACADEMIC_DIMENSIONS, COLUMN_FILTERS, DEFAULT_ROSTER_FILTERS, ROSTER_EVALUATION_OPTIONS, ROSTER_PAGE_SIZES,
  ROSTER_STATUS_OPTIONS, ROSTER_TYPE_OPTIONS, academicValue, activeAcademicKeys, activeColumnFilterKeys,
  columnOptions, computeRosterStats, filterRosterRows, hasActiveRosterFilters, paginateRows, rowHasViolations,
  rowOutcome, rowViolationCount, sortRosterRows,
} from './reports/rosterModel';

// Charts are heavy; the analysis loads only when its tab is first opened.
const ReportAnalysis = lazy(() => import('./reports/ReportAnalysis'));

const PAGE_SIZES = ROSTER_PAGE_SIZES;

const ROSTER_COLUMN_LABELS = {
  student: 'Candidate', status: 'Status', progress: 'Progress', score: 'Score',
  startedAt: 'Started', submittedAt: 'Submitted', time: 'Time', violations: 'Flags',
  ...Object.fromEntries(ACADEMIC_DIMENSIONS.map(({ key, label }) => [key, label])),
};

// Table columns in display order. `sortKey` feeds sortRosterRows, `filterKey` feeds COLUMN_FILTERS.
const TABLE_COLUMNS = [
  { key: 'student', label: 'Candidate', sortKey: 'name', filterKey: 'student' },
  { key: 'course', label: 'Course', sortKey: 'course', filterKey: 'course' },
  { key: 'branch', label: 'Branch', sortKey: 'branch', filterKey: 'branch' },
  { key: 'semester', label: 'Semester', sortKey: 'semester', filterKey: 'semester' },
  { key: 'group', label: 'Group', sortKey: 'group', filterKey: 'group' },
  { key: 'college', label: 'College', sortKey: 'college', filterKey: 'college' },
  { key: 'status', label: 'Status', sortKey: 'status', filterKey: 'status', align: 'center' },
  { key: 'progress', label: 'Progress', sortKey: 'progress', filterKey: 'progress', align: 'center' },
  { key: 'score', label: 'Score', sortKey: 'score', filterKey: 'score', align: 'right' },
  { key: 'startedAt', label: 'Started', sortKey: 'startedAt', filterKey: 'startedAt' },
  { key: 'submittedAt', label: 'Submitted', sortKey: 'submittedAt', filterKey: 'submittedAt' },
  { key: 'time', label: 'Time', sortKey: 'timeTakenSec', filterKey: 'time', align: 'right' },
  { key: 'violations', label: 'Flags', sortKey: 'violations', filterKey: 'violations', align: 'center' },
];

const DEFAULT_VISIBLE_COLUMNS = {
  student: true, course: false, branch: false, semester: false, group: false, college: false,
  status: true, progress: true, score: true, startedAt: true, submittedAt: false, time: true, violations: true,
};

const COLUMN_FILTER_LABELS = {
  student: 'Candidate', status: 'Status', progress: 'Progress', score: 'Score', time: 'Time', violations: 'Flags',
  startedAt: 'Started', submittedAt: 'Submitted',
  ...Object.fromEntries(ACADEMIC_DIMENSIONS.map(({ key, label }) => [key, label])),
};

// Quick views above the candidate table. Outcome views (passed, failed, ...) are
// reached from the overview's completion breakdown.
const QUICK_VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'finished', label: 'Finished' },
  { key: 'not_started', label: 'Not started' },
  { key: 'flagged', label: 'Flagged' },
];
const OUTCOME_VIEW_LABELS = {
  passed: 'Passed', failed: 'Failed', graded: 'Graded', evaluating: 'Evaluating', needs_review: 'Needs review',
};
const matchesQuickView = (row, view, passPercentage) => {
  if (view === 'all') return true;
  if (view === 'in_progress') return row.status === 'in_progress';
  if (view === 'not_started') return !row.status || row.status === 'not_started';
  if (view === 'finished') return Boolean(row.status) && row.status !== 'in_progress' && row.status !== 'not_started';
  if (view === 'flagged') return Boolean(row.flagged) || rowHasViolations(row);
  return rowOutcome(row, passPercentage) === view;
};

const REFRESH_INTERVAL_KEY = 'peerprep.reports.refreshIntervalMs';
const filtersStorageKey = (assessmentId) => `peerprep.reports.filters.${assessmentId}`;

function readRefreshInterval() {
  try {
    const saved = window.localStorage.getItem(REFRESH_INTERVAL_KEY);
    if (saved === null) return DEFAULT_REFRESH_INTERVAL_MS;
    const value = Number(saved);
    return [0, 15000, 30000, 60000].includes(value) ? value : DEFAULT_REFRESH_INTERVAL_MS;
  } catch {
    return DEFAULT_REFRESH_INTERVAL_MS;
  }
}

// Filters survive a remount of the page (for example a layout re-render) for the session.
function readSavedFilters(assessmentId) {
  if (!assessmentId) return DEFAULT_ROSTER_FILTERS;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(filtersStorageKey(assessmentId)) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_ROSTER_FILTERS;
    return {
      ...DEFAULT_ROSTER_FILTERS,
      ...saved,
      statuses: Array.isArray(saved.statuses) ? saved.statuses : [],
      academic: saved.academic && typeof saved.academic === 'object' ? saved.academic : {},
      columns: saved.columns && typeof saved.columns === 'object' ? saved.columns : {},
    };
  } catch {
    return DEFAULT_ROSTER_FILTERS;
  }
}

/** Shape a roster row the way the detail drawer and violation modal expect. */
const toDrawerStudent = (row) => ({
  ...row,
  _id: row.submissionId,
  studentName: row.name,
  studentId: row.rollNo || row.email || '',
  attemptDate: row.startedAt,
  violationCount: rowViolationCount(row),
});

const reportAssessmentStatus = (assessment, now = Date.now()) => {
  if (assessment.isVisible === false) return 'Archived';
  if (assessment.lifecycleStatus === 'draft') return 'Draft';
  if (assessment.manuallyCompletedAt) return 'Completed';
  const start = assessment.startTime ? new Date(assessment.startTime).getTime() : NaN;
  const end = assessment.endTime ? new Date(assessment.endTime).getTime() : NaN;
  if (Number.isFinite(end) && now > end) return 'Completed';
  if (Number.isFinite(start) && now < start) return 'Scheduled';
  return Number.isFinite(start) && Number.isFinite(end) ? 'Live' : 'Scheduled';
};

const reportAssessmentStatusClass = {
  Draft: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Scheduled: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  Live: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  Completed: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  Archived: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
};

const tabsConfig = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'candidates', label: 'Candidates', icon: GraduationCap },
  { id: 'analytics', label: 'Analysis', icon: BarChart3 },
  { id: 'violations', label: 'Violations', icon: ShieldAlert },
];

const EXPORT_SETTINGS_KEY = 'peerprep_assessment_report_export_columns_v1';

const EXPORT_COLUMN_DEFS = [
  { key: 'candidateName', label: 'Candidate Name' },
  { key: 'candidateEmail', label: 'Email' },
  { key: 'candidateStudentId', label: 'Student ID' },
  { key: 'candidateCourse', label: 'Course' },
  { key: 'candidateBranch', label: 'Branch' },
  { key: 'candidateCollege', label: 'College' },
  { key: 'candidateSemester', label: 'Semester' },
  { key: 'candidateGroup', label: 'Group' },
  { key: 'assessmentName', label: 'Assessment Name' },
  { key: 'assessmentType', label: 'Assessment Type' },
  { key: 'assessmentCode', label: 'Assessment Code' },
  { key: 'assessmentStatus', label: 'Assessment Status' },
  { key: 'assessmentStartTime', label: 'Assessment Start' },
  { key: 'assessmentEndTime', label: 'Assessment End' },
  { key: 'assessmentDurationMin', label: 'Assessment Duration (min)' },
  { key: 'attemptDate', label: 'Attempt Date' },
  { key: 'submittedAt', label: 'Submitted At' },
  { key: 'completionStatus', label: 'Completion Status' },
  { key: 'attempts', label: 'Attempt Count' },
  { key: 'score', label: 'Score' },
  { key: 'totalMarks', label: 'Total Marks' },
  { key: 'percentage', label: 'Percentage' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'rank', label: 'Rank' },
  { key: 'percentile', label: 'Percentile' },
  { key: 'totalQuestions', label: 'Total Questions' },
  { key: 'correctAnswers', label: 'Correct Answers' },
  { key: 'wrongAnswers', label: 'Wrong Answers' },
  { key: 'skippedQuestions', label: 'Skipped Questions' },
  { key: 'pendingEvaluationQuestions', label: 'Pending Evaluation' },
  { key: 'completionRate', label: 'Completion Rate' },
  { key: 'timeSpentSec', label: 'Time Spent (sec)' },
  { key: 'violationCount', label: 'Violation Count' },
  { key: 'violationScore', label: 'Violation Score' },
  { key: 'tabSwitches', label: 'Tab Switches' },
  { key: 'fullscreenExits', label: 'Fullscreen Exits' },
  { key: 'cameraFlags', label: 'Camera Flags' },
  { key: 'copyPasteCount', label: 'Copy/Paste Count' },
  { key: 'pauseCount', label: 'Pause Count' },
  { key: 'lastPauseAt', label: 'Last Pause At' },
  { key: 'sectionScores', label: 'Section Scores' },
  { key: 'sectionPerformance', label: 'Section Performance' },
  { key: 'deviceBrowser', label: 'Browser' },
  { key: 'deviceOs', label: 'OS' },
  { key: 'deviceInfo', label: 'Device Info' },
  { key: 'ipAddress', label: 'IP Address' },
  { key: 'userAgent', label: 'User Agent' },
  { key: 'securityHeartbeat', label: 'Security Heartbeat' },
  { key: 'location', label: 'Location' },
  { key: 'proctoringFlags', label: 'Proctoring Flags' },
  { key: 'proctoringActivityCount', label: 'Proctoring Activity Count' },
  { key: 'attemptHistory', label: 'Attempt History' },
];

const DEFAULT_EXPORT_COLUMNS = Object.fromEntries(
  EXPORT_COLUMN_DEFS.map(({ key }) => [key, [
    'candidateName',
    'candidateEmail',
    'candidateStudentId',
    'assessmentName',
    'score',
    'percentage',
    'attemptDate',
    'assessmentDurationMin',
    'violationCount',
    'completionStatus',
    'sectionScores',
    'proctoringFlags',
    'deviceInfo',
  ].includes(key)]),
);

function loadSavedExportColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPORT_SETTINGS_KEY) || '{}');
    return {
      ...DEFAULT_EXPORT_COLUMNS,
      ...saved,
    };
  } catch {
    return { ...DEFAULT_EXPORT_COLUMNS };
  }
}

export default function AssessmentReports() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const initialAssessmentId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('assessmentId') || ''
    : '';

  /* View state */
  const [activeTab, setActiveTab] = useState('overview');
  // The analysis mounts the first time its tab opens and then stays, so switching tabs is instant.
  const [analysisOpened, setAnalysisOpened] = useState(false);
  useEffect(() => { if (activeTab === 'analytics') setAnalysisOpened(true); }, [activeTab]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(initialAssessmentId);

  /* Candidate filters (all client-side, applied to the live roster) */
  const [rosterFilters, setRosterFilters] = useState(() => readSavedFilters(initialAssessmentId));
  const filtersOwnerRef = useRef(initialAssessmentId);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [quickView, setQuickView] = useState('all');
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [statusTime, setStatusTime] = useState(() => Date.now());
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(readRefreshInterval);

  useEffect(() => {
    // Ticks the relative times in the activity feed and the assessment status badges.
    const timer = window.setInterval(() => setStatusTime(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const changeRefreshInterval = useCallback((value) => {
    setRefreshIntervalMs(value);
    try { window.localStorage.setItem(REFRESH_INTERVAL_KEY, String(value)); } catch { /* preference only */ }
  }, []);

  /* Each assessment keeps its own filters for the session. */
  useEffect(() => {
    if (filtersOwnerRef.current === selectedAssessmentId) return;
    filtersOwnerRef.current = selectedAssessmentId;
    setRosterFilters(readSavedFilters(selectedAssessmentId));
    setQuickView('all');
  }, [selectedAssessmentId]);
  useEffect(() => {
    const id = filtersOwnerRef.current;
    if (!id) return;
    try { window.sessionStorage.setItem(filtersStorageKey(id), JSON.stringify(rosterFilters)); } catch { /* preference only */ }
  }, [rosterFilters]);

  /* Page shell data (assessment list); loaded once, not per filter change */
  const [assessments, setAssessments] = useState([]);
  const [allAssessments, setAllAssessments] = useState([]);
  const [shellLoading, setShellLoading] = useState(true);
  const [shellVersion, setShellVersion] = useState(0);
  const [sort, setSort] = useState({ key: 'status', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  /* Detail drawer */
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const detailRequestRef = useRef(0);
  const detailVersionRef = useRef('');

  /* Violation modal */
  const [violationReport, setViolationReport] = useState(null);
  const [violationsLoading, setViolationsLoading] = useState(false);

  /* Results release */
  const [releaseSettings, setReleaseSettings] = useState(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState(null);

  /* Column visibility */
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportColumns, setExportColumns] = useState(loadSavedExportColumns);

  const selectedAssessment = useMemo(
    () => allAssessments.find((a) => String(a._id) === String(selectedAssessmentId))
      || assessments.find((a) => String(a._id) === String(selectedAssessmentId)),
    [allAssessments, assessments, selectedAssessmentId]
  );

  const roster = useLiveAssessmentRoster(selectedAssessmentId, { fallbackAssessment: selectedAssessment, intervalMs: refreshIntervalMs });

  /* Shell metadata merged with the roster's authoritative assessment summary. */
  const reportAssessment = useMemo(() => {
    if (!selectedAssessment && !roster.assessment) return null;
    return { ...(selectedAssessment || {}), ...(roster.assessment || {}) };
  }, [selectedAssessment, roster.assessment]);
  const passPercentage = reportAssessment?.passPercentage ?? reportAssessment?.settings?.passPercentage ?? null;

  const updateRosterFilter = useCallback((key, value) => {
    setRosterFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleStatusFilter = useCallback((status) => {
    setRosterFilters((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter((item) => item !== status)
        : [...prev.statuses, status],
    }));
  }, []);

  const setAcademicFilter = useCallback((key, values) => {
    setRosterFilters((prev) => ({ ...prev, academic: { ...prev.academic, [key]: values } }));
  }, []);

  // The table header menus and the filter sheet edit the same class-detail filters.
  const getColumnFilter = useCallback((key) => (
    ACADEMIC_DIMENSIONS.some((dimension) => dimension.key === key)
      ? { values: rosterFilters.academic?.[key] || [] }
      : rosterFilters.columns?.[key]
  ), [rosterFilters.academic, rosterFilters.columns]);

  const setColumnFilter = useCallback((key, spec) => {
    if (ACADEMIC_DIMENSIONS.some((dimension) => dimension.key === key)) {
      setAcademicFilter(key, spec?.values || []);
      return;
    }
    setRosterFilters((prev) => {
      const columns = { ...prev.columns };
      if (spec) columns[key] = spec; else delete columns[key];
      return { ...prev, columns };
    });
  }, [setAcademicFilter]);

  const selectAssessmentReport = useCallback((assessmentOrId, options = {}) => {
    const id = typeof assessmentOrId === 'object'
      ? assessmentOrId?._id || assessmentOrId?.id
      : assessmentOrId;
    if (!id) return;

    setSelectedAssessmentId(id);
    if (options.openOverview !== false) setActiveTab('overview');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadAssessments = async () => {
      try {
        const data = await api.listAssessments();
        if (!active) return;
        setAllAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
      } catch (err) {
        if (active) toast.error(err.message || 'Failed to load assessments');
      }
    };
    void loadAssessments();
    return () => { active = false; };
  }, [toast]);

  /* ── Page shell: assessment list from the reports endpoint, loaded once (and on manual refresh) ── */
  useEffect(() => {
    let active = true;
    const loadShell = async () => {
      setShellLoading(true);
      try {
        const data = await api.getAssessmentReports({ page: 1, limit: 25 });
        if (!active) return;
        setAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
      } catch (err) {
        if (!active) return;
        console.error('Error loading reports:', err);
        toast.error(err.message || 'Failed to load reports');
        setAssessments([]);
      } finally {
        if (active) setShellLoading(false);
      }
    };
    void loadShell();
    return () => { active = false; };
  }, [shellVersion, toast]);

  useEffect(() => {
    // Validate only against the full assessment list; the shell list may be partial.
    if (!selectedAssessmentId || !allAssessments.length) return;
    const selectedStillExists = allAssessments.some((a) => String(a._id) === String(selectedAssessmentId))
      || assessments.some((a) => String(a._id) === String(selectedAssessmentId));
    if (!selectedStillExists) setSelectedAssessmentId('');
  }, [allAssessments, assessments, selectedAssessmentId]);

  /* Client pagination returns to page 1 whenever the visible set changes shape. */
  useEffect(() => { setPage(1); }, [rosterFilters, sort, selectedAssessmentId, activeTab, pageSize, quickView]);

  /* ── Results release state for the selected assessment ── */
  useEffect(() => {
    setReleaseSettings(null);
    setReleaseConfirm(null);
    if (!selectedAssessmentId) return undefined;
    let active = true;
    api.getAssessmentById(selectedAssessmentId)
      .then((data) => {
        if (!active) return;
        const settings = data?.assessment?.settings || {};
        setReleaseSettings({
          showResultsAfterSubmit: Boolean(settings.showResultsAfterSubmit),
          resultsReleasedAt: settings.resultsReleasedAt || data?.assessment?.resultsReleasedAt || null,
        });
      })
      .catch(() => { if (active) setReleaseSettings({ showResultsAfterSubmit: false, resultsReleasedAt: null, unknown: true }); });
    return () => { active = false; };
  }, [selectedAssessmentId]);

  // A release/withdraw made on this page wins; otherwise prefer the roster's copy if it sends one.
  const resultsReleasedAt = !releaseSettings?.changedHere && roster.assessment
    && Object.prototype.hasOwnProperty.call(roster.assessment, 'resultsReleasedAt')
    ? roster.assessment.resultsReleasedAt
    : releaseSettings?.resultsReleasedAt || null;

  const confirmReleaseChange = useCallback(async () => {
    if (!releaseConfirm || !selectedAssessmentId) return;
    const release = releaseConfirm === 'release';
    setReleaseBusy(true);
    try {
      const data = await api.releaseAssessmentResults(selectedAssessmentId, release);
      setReleaseSettings((prev) => ({ ...(prev || {}), changedHere: true, resultsReleasedAt: release ? data?.resultsReleasedAt || new Date().toISOString() : null }));
      toast.success(release ? 'Results released to students' : 'Results hidden from students');
      setReleaseConfirm(null);
    } catch (err) {
      toast.error(err?.response?.status === 404
        ? 'Releasing results is not available on this server yet.'
        : err.message || 'Failed to update result release');
    } finally {
      setReleaseBusy(false);
    }
  }, [releaseConfirm, selectedAssessmentId, toast]);

  /* ── Load student detail ── */
  const loadStudentDetail = useCallback(async (submissionId, { silent = false } = {}) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    if (!silent) {
      setDetailLoading(true);
      setDetailData(null);
    }
    try {
      const data = await api.getStudentAssessmentReport(submissionId);
      if (detailRequestRef.current === requestId) setDetailData(data);
    } catch (err) {
      if (!silent && detailRequestRef.current === requestId) toast.error(err.message || 'Failed to load student report');
    } finally {
      if (!silent && detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }, [toast]);

  const openStudentDetail = useCallback((studentRow) => {
    if (!studentRow?.submissionId) return;
    setSelectedStudent(studentRow);
    detailVersionRef.current = `${studentRow.updatedAt || ''}|${studentRow.status}|${studentRow.evaluationStatus}|${studentRow.answeredCount}`;
    void loadStudentDetail(studentRow.submissionId);
  }, [loadStudentDetail]);

  const closeStudentDetail = useCallback(() => {
    detailRequestRef.current += 1;
    detailVersionRef.current = '';
    setSelectedStudent(null);
    setDetailData(null);
    setDetailLoading(false);
  }, []);

  /* Keep an open drawer in step with live roster changes for that candidate. */
  const openRosterRow = useMemo(
    () => (selectedStudent ? roster.rows.find((row) => row.key === selectedStudent.key) || null : null),
    [roster.rows, selectedStudent],
  );
  const openRowVersion = openRosterRow
    ? `${openRosterRow.updatedAt || ''}|${openRosterRow.status}|${openRosterRow.evaluationStatus}|${openRosterRow.answeredCount}`
    : '';
  useEffect(() => {
    if (!openRosterRow?.submissionId || !openRowVersion || openRowVersion === detailVersionRef.current) return;
    detailVersionRef.current = openRowVersion;
    void loadStudentDetail(openRosterRow.submissionId, { silent: true });
  }, [loadStudentDetail, openRosterRow, openRowVersion]);

  /* ── Violation report ── */
  const openViolationReport = useCallback(async (submissionId) => {
    setViolationsLoading(true);
    try {
      const data = await api.getSubmissionViolations(submissionId);
      setViolationReport(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load violation report');
    } finally {
      setViolationsLoading(false);
    }
  }, [toast]);

  /* ── Export ── */
  const saveExportPreferences = useCallback(() => {
    localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(exportColumns));
    toast.success('Export preferences saved');
  }, [exportColumns, toast]);

  // There is no export-metadata endpoint; the column list is the static
  // EXPORT_COLUMN_DEFS contract, so opening the modal costs no request.
  const setAllExportColumns = useCallback((checked) => {
    setExportColumns((prev) => ({
      ...prev,
      ...Object.fromEntries(EXPORT_COLUMN_DEFS.map(({ key }) => [key, checked])),
    }));
  }, []);

  const visibleExportDefs = EXPORT_COLUMN_DEFS;

  // submissionId always travels with the export so the file can be limited to the candidates on screen.
  const buildExportParams = useCallback((selectedDefs) => {
    const params = {};
    if (selectedAssessmentId) params.assessmentId = selectedAssessmentId;
    params.columns = [...selectedDefs.map(({ key }) => key), 'submissionId'].join(',');
    return params;
  }, [selectedAssessmentId]);

  // "Current view" = every candidate the filters and quick view leave (not only the visible page).
  // Candidates who never started have no attempt, so they are in the on-screen count but not in a file.
  // The rows are computed further down the component, so they are read through a ref at click time.
  const [exportScope, setExportScope] = useState('all');
  const exportViewRef = useRef([]);
  const scopeExportRows = useCallback((rows) => {
    if (exportScope !== 'view') return rows;
    const ids = new Set(exportViewRef.current.map((row) => row.submissionId).filter(Boolean).map(String));
    return rows.filter((row) => ids.has(String(row.submissionId)));
  }, [exportScope]);
  // The summary must describe the rows in the file, so a filtered export recomputes it from the same rows.
  const scopeExportSummary = useCallback((summary) => {
    if (exportScope !== 'view') return summary;
    const viewStats = computeRosterStats(exportViewRef.current, { passPercentage });
    return {
      ...summary,
      totalCandidates: viewStats.total,
      avgScore: viewStats.avgPercentage,
      maxScore: viewStats.maxPercentage,
      minScore: viewStats.minPercentage,
      passCount: viewStats.passed,
      failCount: viewStats.failed,
      violationCount: viewStats.violationEvents,
      unit: '%',
    };
  }, [exportScope, passPercentage]);

  const buildExportValue = useCallback((row, key) => {
    const value = row?.[key];
    if (value === null || value === undefined) return '';
    if (['attemptDate', 'submittedAt', 'assessmentStartTime', 'assessmentEndTime', 'assessmentCreatedAt', 'lastPauseAt'].includes(key)) {
      return formatDateTime(value);
    }
    if (key === 'timeSpentSec') return formatDuration(Number(value || 0));
    return value;
  }, []);

  const handleExcelExport = useCallback(async () => {
    const selectedDefs = visibleExportDefs.filter(({ key }) => exportColumns[key]);
    if (!selectedDefs.length) {
      toast.error('Select at least one column for Excel export.');
      return;
    }

    setExportingExcel(true);
    try {
      const payload = await api.getAssessmentReportsExportData(buildExportParams(selectedDefs));
      const rows = scopeExportRows(Array.isArray(payload?.rows) ? payload.rows : []);
      const rowIds = new Set(rows.map((row) => String(row.submissionId)));
      const sectionRows = (Array.isArray(payload?.sectionRows) ? payload.sectionRows : [])
        .filter((row) => exportScope !== 'view' || rowIds.has(String(row.submissionId)));
      const summary = scopeExportSummary(payload?.summary || {});
      const unitSuffix = summary.unit === '%' ? ' (%)' : '';

      if (!rows.length) {
        toast.error('No candidate report data found for the selected assessment and filters.');
        return;
      }

      const selectedTitle = selectedAssessment?.title || 'All Assessments';
      const excelModule = await import('exceljs');
      const ExcelJS = excelModule.default || excelModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PeerPrep';
      workbook.company = 'PeerPrep';
      workbook.subject = `${selectedTitle} assessment report`;
      workbook.title = `PeerPrep | ${selectedTitle}`;
      workbook.created = new Date();

      const palette = {
        navy: 'FF0F2742', blue: 'FF0284C7', sky: 'FFE0F2FE', pale: 'FFF5FAFE',
        green: 'FF059669', greenPale: 'FFD1FAE5', amber: 'FFD97706', amberPale: 'FFFEF3C7',
        red: 'FFDC2626', redPale: 'FFFEE2E2', slate: 'FF475569', border: 'FFDCE7F1', white: 'FFFFFFFF',
      };
      const thinBorder = { style: 'thin', color: { argb: palette.border } };
      const humanizeKey = (key) => String(key || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      const styleTableSheet = (sheet, headers, data, { hiddenKeys = [] } = {}) => {
        const headerRowNumber = 1;
        sheet.showGridLines = false;
        sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 } };
        sheet.headerFooter.oddFooter = '&RPage &P of &N';
        const headerRow = sheet.getRow(headerRowNumber);
        headerRow.values = headers.map((header) => header.label);
        headerRow.height = 28;
        headerRow.eachCell((cell) => {
          cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: palette.white } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.blue } };
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          cell.border = { bottom: { style: 'medium', color: { argb: palette.navy } } };
        });
        data.forEach((sourceRow, rowIndex) => {
          const row = sheet.addRow(headers.map(({ key, value }) => value ? value(sourceRow) : sourceRow?.[key] ?? ''));
          row.height = 22;
          row.eachCell((cell, columnIndex) => {
            cell.font = { name: 'Aptos', size: 9, color: { argb: 'FF1E293B' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIndex % 2 ? 'FFF8FAFC' : palette.white } };
            cell.border = { bottom: thinBorder };
            cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left', wrapText: false };
            const key = headers[columnIndex - 1]?.key;
            if (['percentage', 'accuracy', 'completionRate'].includes(key) && typeof cell.value === 'number') cell.numFmt = '0.0"%"';
            if (['score', 'totalMarks', 'violationCount', 'violationScore', 'rank', 'percentile'].includes(key) && typeof cell.value === 'number') cell.numFmt = '#,##0.00';
          });
          const statusIndex = headers.findIndex(({ key }) => key === 'completionStatus');
          if (statusIndex >= 0) {
            const statusCell = row.getCell(statusIndex + 1);
            const status = String(statusCell.value || '').toLowerCase();
            const positive = status === 'submitted' || status === 'completed';
            statusCell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: positive ? palette.green : palette.amber } };
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: positive ? palette.greenPale : palette.amberPale } };
          }
          const violationIndex = headers.findIndex(({ key }) => key === 'violationCount');
          if (violationIndex >= 0 && Number(row.getCell(violationIndex + 1).value || 0) > 0) {
            row.getCell(violationIndex + 1).font = { name: 'Aptos', size: 9, bold: true, color: { argb: palette.red } };
            row.getCell(violationIndex + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.redPale } };
          }
        });
        sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: headers.length } };
        sheet.views = [{ state: 'frozen', ySplit: headerRowNumber, activeCell: `A${headerRowNumber + 1}`, showGridLines: false }];
        headers.forEach(({ key, label }, index) => {
          const values = data.slice(0, 250).map((row) => String(row?.[key] ?? ''));
          const contentWidth = Math.max(label.length + 2, ...values.map((value) => value.length + 2));
          const wide = ['candidateEmail', 'sectionScores', 'sectionPerformance', 'proctoringFlags', 'message', 'userAgent', 'securityHeartbeat', 'location'].includes(key);
          sheet.getColumn(index + 1).width = Math.min(wide ? 44 : 26, Math.max(wide ? 18 : 11, contentWidth));
          sheet.getColumn(index + 1).hidden = hiddenKeys.includes(key);
        });
      };

      const summarySheet = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });
      summarySheet.mergeCells('A1:H1');
      summarySheet.getCell('A1').value = selectedTitle;
      summarySheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: palette.white } };
      summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.navy } };
      summarySheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
      summarySheet.getRow(1).height = 30;
      summarySheet.showGridLines = false;
      summarySheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 };
      summarySheet.headerFooter.oddFooter = '&RPage &P of &N';
      const kpis = [
        [exportScope === 'view' ? 'Candidates (filtered)' : 'Candidates', summary.totalCandidates || rows.length || 0, palette.blue, palette.sky],
        [`Average score${unitSuffix}`, summary.avgScore ?? '—', palette.navy, 'FFE8EEF5'],
        ['Passed', summary.passCount || 0, palette.green, palette.greenPale],
        ['Failed', summary.failCount || 0, palette.red, palette.redPale],
      ];
      kpis.forEach(([label, value, color, fill], index) => {
        const startColumn = 1 + (index * 2);
        summarySheet.mergeCells(3, startColumn, 3, startColumn + 1);
        summarySheet.mergeCells(4, startColumn, 5, startColumn + 1);
        const labelCell = summarySheet.getCell(3, startColumn);
        labelCell.value = label;
        labelCell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: palette.slate } };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
        const valueCell = summarySheet.getCell(4, startColumn);
        valueCell.value = value;
        valueCell.font = { name: 'Aptos Display', size: 22, bold: true, color: { argb: color } };
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
        [3, 4, 5].forEach((rowNumber) => {
          for (let column = startColumn; column <= startColumn + 1; column += 1) summarySheet.getCell(rowNumber, column).border = { bottom: thinBorder };
        });
      });
      summarySheet.getRow(3).height = 22;
      summarySheet.getRow(4).height = 26;
      summarySheet.getRow(5).height = 18;
      summarySheet.getCell('A8').value = 'Results';
      summarySheet.getCell('A8').font = { name: 'Aptos', size: 11, bold: true, color: { argb: palette.navy } };
      const totalResults = Number(summary.passCount || 0) + Number(summary.failCount || 0);
      const detailRows = [
        [`Highest score${unitSuffix}`, summary.maxScore ?? '—'],
        [`Lowest score${unitSuffix}`, summary.minScore ?? '—'],
        ['Pass rate', totalResults ? Number(((Number(summary.passCount || 0) / totalResults) * 100).toFixed(1)) : 0],
      ];
      detailRows.forEach(([label, value], index) => {
        const row = 9 + index;
        summarySheet.getCell(row, 1).value = label;
        summarySheet.getCell(row, 1).font = { name: 'Aptos', size: 9, bold: true, color: { argb: palette.slate } };
        summarySheet.mergeCells(row, 2, row, 4);
        summarySheet.getCell(row, 2).value = value;
        summarySheet.getCell(row, 2).font = { name: 'Aptos', size: 9, color: { argb: 'FF1E293B' } };
        summarySheet.getCell(row, 2).alignment = { wrapText: true, vertical: 'middle' };
        if (label === 'Pass rate') summarySheet.getCell(row, 2).numFmt = '0.0"%"';
        summarySheet.getRow(row).height = 22;
        for (let column = 1; column <= 4; column += 1) summarySheet.getCell(row, column).border = { bottom: thinBorder };
      });
      summarySheet.columns.forEach((column) => { column.width = 15; });
      summarySheet.getColumn(1).width = 20;
      summarySheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];

      const candidateSheet = workbook.addWorksheet('Candidates');
      const candidateHeaders = selectedDefs.map(({ key, label }) => ({ key, label, value: (row) => buildExportValue(row, key) }));
      styleTableSheet(candidateSheet, candidateHeaders, rows);

      if (sectionRows.length) {
        const sectionSheet = workbook.addWorksheet('Section Performance');
        const sectionHeaders = Object.keys(sectionRows[0] || {}).map((key) => ({ key, label: humanizeKey(key) }));
        styleTableSheet(sectionSheet, sectionHeaders, sectionRows, { hiddenKeys: ['submissionId'] });
      }

      const dateStamp = new Date().toISOString().slice(0, 10);
      const safeAssessmentName = selectedTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'all-assessments';
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `assessment-report-${safeAssessmentName}-${dateStamp}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      setShowExportModal(false);
      toast.success('Excel exported successfully');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error(err.message || 'Excel export failed');
    } finally {
      setExportingExcel(false);
    }
  }, [buildExportParams, buildExportValue, exportColumns, exportScope, scopeExportRows, scopeExportSummary, selectedAssessment, toast, visibleExportDefs]);

  const handleCsvExport = useCallback(async () => {
    const selectedDefs = visibleExportDefs.filter(({ key }) => exportColumns[key]);
    if (!selectedDefs.length) {
      toast.error('Select at least one column for CSV export.');
      return;
    }
    setExportingExcel(true);
    try {
      const payload = await api.getAssessmentReportsExportData(buildExportParams(selectedDefs));
      const rows = scopeExportRows(Array.isArray(payload?.rows) ? payload.rows : []);
      if (!rows.length) {
        toast.error('No candidate report data found for the selected filters.');
        return;
      }
      const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [
        selectedDefs.map(({ label }) => escapeCsv(label)).join(','),
        ...rows.map((row) => selectedDefs.map(({ key }) => escapeCsv(buildExportValue(row, key))).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `assessment-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'CSV export failed');
    } finally {
      setExportingExcel(false);
    }
  }, [buildExportParams, buildExportValue, exportColumns, scopeExportRows, toast, visibleExportDefs]);

  const handlePdfExport = useCallback(async () => {
    const selectedDefs = visibleExportDefs.filter(({ key }) => exportColumns[key]);
    if (!selectedDefs.length) {
      toast.error('Select at least one column for PDF export.');
      return;
    }
    setExportingExcel(true);
    try {
      const payload = await api.getAssessmentReportsExportData(buildExportParams(selectedDefs));
      const rows = scopeExportRows(Array.isArray(payload?.rows) ? payload.rows : []);
      const summary = scopeExportSummary(payload?.summary || {});
      if (!rows.length) {
        toast.error('No candidate report data found for the selected filters.');
        return;
      }
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
      }[char]));
      const tableHead = selectedDefs.map(({ label }) => `<th>${escapeHtml(label)}</th>`).join('');
      const tableRows = rows.map((row) => `<tr>${selectedDefs.map(({ key }) => `<td>${escapeHtml(buildExportValue(row, key))}</td>`).join('')}</tr>`).join('');
      const printWindow = window.open('', '_blank', 'noopener,noreferrer');
      if (!printWindow) {
        toast.error('Allow popups to generate the PDF report.');
        return;
      }
      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>Assessment Report</title>
            <style>
              body { font-family: Inter, Arial, sans-serif; color: #0f172a; margin: 28px; }
              h1 { margin: 0; font-size: 22px; }
              .meta { color: #64748b; font-size: 12px; margin: 8px 0 18px; }
              .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
              .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; }
              .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
              .value { margin-top: 4px; font-weight: 800; font-size: 18px; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th { background: #f1f5f9; text-align: left; padding: 8px; border: 1px solid #e2e8f0; }
              td { padding: 7px; border: 1px solid #e2e8f0; vertical-align: top; }
              tr:nth-child(even) td { background: #f8fafc; }
              @media print { body { margin: 16px; } .no-print { display: none; } }
            </style>
          </head>
          <body>
            <button class="no-print" onclick="window.print()" style="margin-bottom: 16px; padding: 8px 12px;">Print / Save PDF</button>
            <h1>PeerPrep Assessment Analytics Report</h1>
            <div class="meta">Assessment: ${escapeHtml(selectedAssessment?.title || 'All Assessments')} | Generated: ${escapeHtml(formatDateTime(payload?.generatedAt))}</div>
            <div class="summary">
              <div class="card"><div class="label">Candidates${exportScope === 'view' ? ' (filtered)' : ''}</div><div class="value">${summary.totalCandidates || rows.length}</div></div>
              <div class="card"><div class="label">Average Score${summary.unit === '%' ? ' (%)' : ''}</div><div class="value">${summary.avgScore || 0}</div></div>
              <div class="card"><div class="label">Passed</div><div class="value">${summary.passCount || 0}</div></div>
              <div class="card"><div class="label">Violations</div><div class="value">${summary.violationCount || 0}</div></div>
            </div>
            <table><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table>
          </body>
        </html>
      `);
      printWindow.document.close();
      setShowExportModal(false);
      toast.success('PDF report opened');
    } catch (err) {
      toast.error(err.message || 'PDF export failed');
    } finally {
      setExportingExcel(false);
    }
  }, [buildExportParams, buildExportValue, exportColumns, exportScope, scopeExportRows, scopeExportSummary, selectedAssessment, toast, visibleExportDefs]);

  /* ── Sorting ── */
  const handleSort = useCallback((key) => {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  }, []);
  const handleSortDirection = useCallback((key, dir) => setSort({ key, dir }), []);

  /* ── Clear ── */
  const clearFilters = useCallback(() => {
    setRosterFilters(DEFAULT_ROSTER_FILTERS);
    setQuickView('all');
  }, []);
  const closeFilterPanel = useCallback(() => setShowFilterPanel(false), []);

  /* ── Active chips ── */
  const activeChips = useMemo(() => {
    const chips = [];
    const f = rosterFilters;
    if (OUTCOME_VIEW_LABELS[quickView]) chips.push({ key: 'view', label: `Outcome: ${OUTCOME_VIEW_LABELS[quickView]}`, clear: () => setQuickView('all') });
    if (f.query.trim()) chips.push({ key: 'query', label: `Search: ${f.query.trim()}`, clear: () => updateRosterFilter('query', '') });
    f.statuses.forEach((status) => {
      const label = ROSTER_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
      chips.push({ key: `status-${status}`, label: `Status: ${label}`, clear: () => toggleStatusFilter(status) });
    });
    if (f.evaluation !== 'all') chips.push({ key: 'evaluation', label: `Evaluation: ${ROSTER_EVALUATION_OPTIONS.find((option) => option.value === f.evaluation)?.label || f.evaluation}`, clear: () => updateRosterFilter('evaluation', 'all') });
    if (f.submissionType !== 'all') chips.push({ key: 'submissionType', label: `Submission: ${ROSTER_TYPE_OPTIONS.find((option) => option.value === f.submissionType)?.label || f.submissionType}`, clear: () => updateRosterFilter('submissionType', 'all') });
    if (f.scoreMin !== '' || f.scoreMax !== '') chips.push({ key: 'score', label: `Score: ${f.scoreMin || 0}% - ${f.scoreMax || 100}%`, clear: () => setRosterFilters((prev) => ({ ...prev, scoreMin: '', scoreMax: '' })) });
    if (f.flaggedOnly) chips.push({ key: 'flagged', label: 'Flagged only', clear: () => updateRosterFilter('flaggedOnly', false) });
    if (f.hasViolations) chips.push({ key: 'violations', label: 'Has violations', clear: () => updateRosterFilter('hasViolations', false) });
    activeAcademicKeys(f).forEach((key) => {
      const label = ROSTER_COLUMN_LABELS[key];
      const values = f.academic[key].map((value) => (value === '' ? 'Not set' : value));
      chips.push({ key: `academic-${key}`, label: `${label}: ${values.length > 2 ? `${values.slice(0, 2).join(', ')} +${values.length - 2}` : values.join(', ')}`, clear: () => setAcademicFilter(key, []) });
    });
    activeColumnFilterKeys(f).forEach((key) => {
      const spec = f.columns[key];
      const label = COLUMN_FILTER_LABELS[key] || key;
      let text;
      if (COLUMN_FILTERS[key].kind === 'enum') {
        const names = columnOptions(roster.rows, key).filter((option) => spec.values.includes(option.value)).map((option) => option.label);
        text = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
      } else if (COLUMN_FILTERS[key].kind === 'text') {
        text = spec.text;
      } else if (COLUMN_FILTERS[key].kind === 'date') {
        text = `${spec.from || '…'} → ${spec.to || '…'}`;
      } else {
        text = `${spec.min === '' || spec.min == null ? '…' : spec.min} – ${spec.max === '' || spec.max == null ? '…' : spec.max}`;
      }
      chips.push({ key: `column-${key}`, label: `${label}: ${text}`, clear: () => setColumnFilter(key, null) });
    });
    return chips;
  }, [quickView, roster.rows, rosterFilters, setAcademicFilter, setColumnFilter, toggleStatusFilter, updateRosterFilter]);

  /* ── Roster derived data (client-side, instant) ── */
  const stats = useMemo(
    () => computeRosterStats(roster.rows, { passPercentage }),
    [roster.rows, passPercentage],
  );

  const statusCounts = useMemo(() => {
    const counts = {};
    roster.rows.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
    return counts;
  }, [roster.rows]);

  const quickViewCounts = useMemo(() => Object.fromEntries(
    QUICK_VIEWS.map(({ key }) => [key, roster.rows.filter((row) => matchesQuickView(row, key, passPercentage)).length]),
  ), [passPercentage, roster.rows]);
  const tabRows = useMemo(() => {
    const base = activeTab === 'violations' ? roster.rows.filter((row) => row.flagged || rowHasViolations(row)) : roster.rows;
    return quickView === 'all' ? base : base.filter((row) => matchesQuickView(row, quickView, passPercentage));
  }, [activeTab, passPercentage, quickView, roster.rows]);

  /* Change of each headline number since the previous live update. */
  const [kpiDeltas, setKpiDeltas] = useState({});
  const statsSnapshotRef = useRef({ at: null, stats: null });
  useEffect(() => {
    statsSnapshotRef.current = { at: null, stats: null };
    setKpiDeltas({});
  }, [selectedAssessmentId]);
  useEffect(() => {
    const previous = statsSnapshotRef.current;
    if (!roster.lastUpdatedAt || previous.at === roster.lastUpdatedAt) return;
    statsSnapshotRef.current = { at: roster.lastUpdatedAt, stats };
    if (!previous.stats) return;
    setKpiDeltas({
      started: stats.started - previous.stats.started,
      inProgress: stats.inProgress - previous.stats.inProgress,
      finished: stats.finished - previous.stats.finished,
      flagged: stats.flaggedSessions - previous.stats.flaggedSessions,
    });
  }, [roster.lastUpdatedAt, stats]);

  /* Overview shortcuts open the candidate table on the matching view. */
  const showCandidates = useCallback((view) => {
    setQuickView(view === 'flagged' || QUICK_VIEWS.some((entry) => entry.key === view) || OUTCOME_VIEW_LABELS[view] ? view : 'all');
    setActiveTab('candidates');
  }, []);
  const visibleRows = useMemo(
    () => sortRosterRows(filterRosterRows(tabRows, rosterFilters), sort),
    [rosterFilters, sort, tabRows],
  );
  const pageData = useMemo(() => paginateRows(visibleRows, page, pageSize), [page, pageSize, visibleRows]);
  const filtersActive = hasActiveRosterFilters(rosterFilters);
  useEffect(() => { exportViewRef.current = visibleRows; }, [visibleRows]);
  // Opening the export dialog on a narrowed table defaults to exactly what is on screen.
  useEffect(() => {
    if (showExportModal) setExportScope(filtersActive || quickView !== 'all' ? 'view' : 'all');
    // Only the opening should choose the default; later filter edits must not flip the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExportModal]);
  const exportableInView = useMemo(() => visibleRows.filter((row) => row.submissionId).length, [visibleRows]);
  const exportableAll = useMemo(() => roster.rows.filter((row) => row.submissionId).length, [roster.rows]);

  // Violation chart data, from the live roster
  const violationLabels = ['Tab Switch', 'Fullscreen Exit', 'Camera Flags', 'AI Flags'];
  const violationData = [stats.tabSwitches, stats.fullscreenExits, stats.cameraFlags, stats.aiViolations];
  const totalViolationEvents = stats.violationEvents;
  const highestViolationCategoryCount = Math.max(1, ...violationData);
  const mostFlaggedCandidate = stats.topViolator;

  const assessmentSidebarItems = useMemo(() => {
    const source = allAssessments.length ? allAssessments : assessments;
    const search = assessmentSearch.trim().toLowerCase();
    return source
      .filter((assessment) => {
        const haystack = `${assessment.title || ''} ${assessment.assessmentType || ''} ${assessment.assessmentId || ''}`.toLowerCase();
        return !search || haystack.includes(search);
      })
      .sort((a, b) => {
        const aTime = new Date(a.startTime || a.createdAt || 0).getTime();
        const bTime = new Date(b.startTime || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [allAssessments, assessments, assessmentSearch]);

  const totalPages = pageData.totalPages;
  const currentPage = pageData.page;

  const openViolationsFor = useCallback((rowKey) => {
    const row = roster.rows.find((entry) => entry.key === rowKey);
    if (row?.submissionId) void openViolationReport(row.submissionId);
  }, [openViolationReport, roster.rows]);

  const releaseControl = (
    <div className="flex flex-col items-start gap-1.5 lg:items-end">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">Student results</span>
      {!releaseSettings ? (
        <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800" />
      ) : releaseSettings.showResultsAfterSubmit ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" title="Students see their result after submitting, once evaluation completes. Change this in the assessment's Results settings.">Shown after submission</span>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${resultsReleasedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
            {resultsReleasedAt ? `Released ${formatDateTime(resultsReleasedAt)}` : 'Not announced'}
          </span>
          <button
            type="button"
            disabled={releaseBusy}
            onClick={() => setReleaseConfirm(resultsReleasedAt ? 'withdraw' : 'release')}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${resultsReleasedAt ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700' : 'bg-sky-600 text-white shadow-sm hover:bg-sky-500'}`}
          >
            <Megaphone className="h-3.5 w-3.5" />
            {resultsReleasedAt ? 'Withdraw' : 'Release results'}
          </button>
        </div>
      )}
    </div>
  );

  // A slim icon rail that slides open over the page while the pointer is on it and slides shut
  // when it leaves (80 ms), so the report keeps the full width. The inner column has a fixed
  // width, so opening only reveals it: nothing inside reflows.
  const railReveal = 'opacity-0 transition-opacity duration-[80ms] group-hover/rail:opacity-100 group-has-[:focus-visible]/rail:opacity-100 group-has-[input:focus]/rail:opacity-100';
  const assessmentRail = (
    <div className="group/rail absolute inset-y-0 left-0 z-30 w-14 overflow-hidden border-r border-slate-200 bg-white transition-[width,box-shadow] duration-[80ms] ease-out hover:w-72 hover:shadow-2xl has-[:focus-visible]:w-72 has-[input:focus]:w-72 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex h-full w-72 flex-col">
        <div className="shrink-0 border-b border-slate-200 px-3 py-3 dark:border-gray-800">
          <div className="flex h-8 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400" aria-hidden="true"><Search className="h-4 w-4" /></span>
            <input
              id="report-assessment-search"
              type="search"
              placeholder="Search assessments"
              aria-label="Search assessments"
              value={assessmentSearch}
              onChange={(e) => setAssessmentSearch(e.target.value)}
              className={`h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 ${railReveal}`}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1.5">
          {shellLoading && !assessmentSidebarItems.length ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="mx-3 my-1.5 h-8 w-8 animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800" />
            ))
          ) : assessmentSidebarItems.length ? (
            assessmentSidebarItems.map((a) => {
              const active = String(a._id) === String(selectedAssessmentId);
              const status = reportAssessmentStatus(a, statusTime);
              const attempts = a.startedCount ?? a.submissionCount ?? 0;
              return (
                <button
                  key={a._id}
                  type="button"
                  onClick={(event) => { selectAssessmentReport(a, { openOverview: false }); event.currentTarget.blur(); }}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`${a.title || 'Untitled'}, ${status}, ${attempts} attempts`}
                  title={a.title || 'Untitled'}
                  className={`group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    active
                      ? 'bg-sky-50 text-sky-950 dark:bg-sky-900/20 dark:text-sky-100'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-900'
                  }`}
                >
                  <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-sky-50 group-hover:text-sky-600 dark:bg-gray-800 dark:text-gray-500'}`}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span aria-hidden="true" className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-gray-950 ${status === 'Live' ? 'bg-emerald-500' : status === 'Scheduled' ? 'bg-amber-400' : status === 'Completed' ? 'bg-sky-400' : 'bg-slate-300'}`} />
                  </span>
                  <div className={`min-w-0 flex-1 ${railReveal}`}>
                    <div className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-xs font-semibold">{a.title || 'Untitled'}</span><span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${reportAssessmentStatusClass[status]}`}>{status}</span></div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-gray-500">
                      <span className="truncate capitalize">{a.assessmentType || 'Mixed'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0 tabular-nums" title="Candidates who started the test">{attempts} attempted</span>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className={`mx-3 rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400 ${railReveal}`}>
              No assessments found
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-gray-950">
      {/* One compact bar: back, title, tabs and live controls (the page used to spend ~160px on two bars). */}
      <header data-page-header className="shrink-0 border-b border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-0 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => navigate(`${rolePrefix}/assessment`)}
            aria-label="Back to assessments"
            title="Back to assessments"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 items-center gap-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm shadow-sky-200 dark:shadow-none">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight text-slate-950 dark:text-white">Assessment Reports</h1>
              <p className="max-w-[16rem] truncate text-[11px] leading-tight text-slate-500 dark:text-gray-400" title={selectedAssessment?.title}>
                {selectedAssessment ? `${selectedAssessment.title} · ${roster.rows.length} candidates` : 'Choose an assessment'}
              </p>
            </div>
          </div>

          <nav aria-label="Report sections" className="order-last -mb-px flex w-full gap-0.5 overflow-x-auto self-stretch sm:order-none sm:ml-2 sm:w-auto">
            {tabsConfig.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition-colors ${active ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.id === 'violations' && stats.flaggedSessions > 0 && (
                    <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">
                      {stats.flaggedSessions}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-2 py-2">
            <div className="relative lg:hidden">
              <select
                value={selectedAssessmentId || ''}
                onChange={(e) => setSelectedAssessmentId(e.target.value)}
                aria-label="Choose assessment"
                className="h-8 w-44 rounded-lg border border-slate-200 bg-white py-1 pl-3 pr-8 text-xs text-slate-700 outline-none ring-sky-200 transition-all focus:border-sky-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-900"
              >
                <option value="">Choose assessment</option>
                {(allAssessments.length ? allAssessments : assessments).map((a) => (
                  <option key={a._id} value={a._id}>{a.title || 'Untitled'}</option>
                ))}
              </select>
              {selectedAssessmentId && (
                <button
                  type="button"
                  aria-label="Clear assessment"
                  onClick={() => setSelectedAssessmentId('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {selectedAssessment && (
              <>
                <LiveRefreshControl
                  roster={roster}
                  intervalMs={refreshIntervalMs}
                  onIntervalChange={changeRefreshInterval}
                  onRefresh={() => { void roster.refresh(); setShellVersion((value) => value + 1); }}
                />
                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-gray-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[56px_minmax(0,1fr)]">
        <aside className="relative hidden min-h-0 lg:block" aria-label="Assessments">
          {assessmentRail}
        </aside>

        <main className={`min-h-0 px-3 py-3 sm:px-4 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[1560px] ${activeTab === 'candidates' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {activeTab === 'overview' && !selectedAssessment && (
          <div className="flex min-h-[500px] items-center justify-center">
            <div className="max-w-md px-6 text-center">
              <div className="relative mx-auto flex h-36 w-36 items-center justify-center" aria-hidden="true">
                <div className="absolute inset-3 rounded-full bg-sky-200/70 blur-2xl dark:bg-sky-800/25" />
                <div className="relative flex h-28 w-28 items-center justify-center rounded-[28px] border border-sky-100 bg-white/90 p-2 shadow-xl shadow-sky-200/60 dark:border-sky-900/60 dark:bg-gray-900 dark:shadow-black/20">
                  <BarChart3 className="h-12 w-12 text-sky-700 dark:text-sky-300" />
                </div>
              </div>
              <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">Select an assessment</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-gray-400">Choose a test from the list to explore performance, candidate outcomes, and integrity insights.</p>
            </div>
          </div>
        )}

        {activeTab === 'overview' && selectedAssessment && roster.error && (
          <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {roster.error}{roster.rows.length ? ' Showing the last loaded data.' : ''}
          </div>
        )}

        {activeTab === 'overview' && selectedAssessment && (
          <div className="mb-4">
            <ReportOverview
              assessment={{ ...selectedAssessment, ...(reportAssessment || {}), passPercentage }}
              statusLabel={reportAssessmentStatus(selectedAssessment, statusTime)}
              statusClass={reportAssessmentStatusClass[reportAssessmentStatus(selectedAssessment, statusTime)]}
              stats={stats}
              deltas={kpiDeltas}
              passPercentage={passPercentage}
              release={releaseControl}
              rows={roster.rows}
              activity={roster.activity}
              now={statusTime}
              onOpenStudent={openStudentDetail}
              onOpenViolations={openViolationsFor}
              onShowCandidates={showCandidates}
              onOpenAnalysis={() => setActiveTab('analytics')}
            />
          </div>
        )}

        {/* ── Analysis: the Prep Analysis charts, scoped to this assessment, without leaving the report ── */}
        {analysisOpened && selectedAssessment && (
          <div className={activeTab === 'analytics' ? 'block' : 'hidden'}>
            <Suspense fallback={<div className="flex h-64 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading analysis…</div>}>
              <ReportAnalysis assessmentId={String(selectedAssessmentId)} title={selectedAssessment.title} />
            </Suspense>
          </div>
        )}

        {/* ── Compact integrity summary ── */}
        {activeTab === 'violations' && (
          <section className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="grid divide-y divide-slate-200 lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:divide-x lg:divide-y-0 dark:divide-gray-700">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-900/25 dark:text-sky-300">
                  <ShieldAlert className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Integrity events</p>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <strong className="text-xl leading-none text-slate-950 dark:text-white">{totalViolationEvents}</strong>
                    <span className="text-[10px] text-slate-500 dark:text-gray-400">{stats.flaggedSessions} flagged sessions</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0 dark:divide-gray-800">
                {violationLabels.map((label, index) => {
                  const count = violationData[index] || 0;
                  return (
                    <div key={label} className="min-w-0 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-semibold text-slate-500 dark:text-gray-400">{label}</span>
                        <strong className="text-xs tabular-nums text-slate-900 dark:text-white">{count}</strong>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                        <div
                          className="h-full rounded-full bg-sky-500 transition-[width] duration-500"
                          style={{ width: `${(count / highestViolationCategoryCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                  {(mostFlaggedCandidate?.name || '?').trim().charAt(0).toUpperCase() || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Most flagged candidate</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-800 dark:text-gray-200">
                    {mostFlaggedCandidate?.name || 'No flagged candidate'}
                  </p>
                </div>
                {mostFlaggedCandidate && (
                  <span className="shrink-0 rounded-md bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700 dark:bg-sky-900/25 dark:text-sky-300">
                    {mostFlaggedCandidate.count || 0} flags
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Active Filter Chips ── */}
        {activeTab !== 'overview' && activeChips.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />)}
            <button onClick={clearFilters} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">Clear all</button>
          </div>
        )}

        <div className={activeTab === 'analytics' || (activeTab === 'overview' && !selectedAssessment) ? 'hidden' : activeTab === 'candidates' ? 'flex min-h-0 flex-1 flex-col' : 'block'}>

          {/* ── Data Table ── */}
          <div className={activeTab === 'candidates' ? 'min-h-0 flex-1' : 'space-y-4'}>
            <div className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 ${activeTab === 'candidates' ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''}`}>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-gray-700">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-sky-600" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeTab === 'violations' ? 'Flagged Sessions' : 'Candidate Performance'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-gray-800 dark:text-gray-300">{visibleRows.length}</span>
                  {activeTab !== 'overview' && (
                    <div className="relative w-full sm:ml-2 sm:w-64 sm:max-w-[40vw]">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={rosterFilters.query}
                        onChange={(e) => updateRosterFilter('query', e.target.value)}
                        placeholder="Search name, roll no., email or ID"
                        aria-label="Search candidates"
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-600"
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFilterPanel(true)}
                    aria-haspopup="dialog"
                    aria-expanded={showFilterPanel}
                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors ${showFilterPanel || filtersActive ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                  >
                    <Filter className="h-3 w-3" />Filters{activeChips.length ? ` (${activeChips.length})` : ''}
                  </button>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-lime-200 bg-lime-50 px-2.5 text-xs font-medium text-lime-700 hover:bg-lime-100 dark:border-lime-800 dark:bg-lime-900/20 dark:text-lime-300 dark:hover:bg-lime-900/30"
                  >
                    <Download className="h-3 w-3" />
                    Excel
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowColumnMenu((p) => !p)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                      <SlidersHorizontal className="h-3 w-3" />Columns
                    </button>
                    {showColumnMenu && (
                      <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                        {Object.entries(visibleColumns)
                          .filter(([key]) => !ACADEMIC_DIMENSIONS.some((dimension) => dimension.key === key)
                            || roster.rows.some((row) => academicValue(row, key) !== ''))
                          .map(([key, visible]) => (
                          <label key={key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <input type="checkbox" checked={visible} onChange={() => setVisibleColumns((p) => ({ ...p, [key]: !p[key] }))} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                            {ROSTER_COLUMN_LABELS[key] || key}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page" className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
                  </select>
                </div>
              </div>

              <div role="tablist" aria-label="Candidate views" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-3 dark:border-gray-800">
                {QUICK_VIEWS.map((view) => {
                  const active = quickView === view.key;
                  return (
                    <button
                      key={view.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setQuickView(view.key)}
                      className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                      {view.label}
                      <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${active ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{quickViewCounts[view.key] || 0}</span>
                      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-sky-600" />}
                    </button>
                  );
                })}
              </div>

              {roster.error && activeTab !== 'overview' && (
                <div role="alert" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  {roster.error}{roster.rows.length ? ' Showing the last loaded data.' : ''}
                </div>
              )}

              <div className={activeTab === 'candidates' ? 'min-h-0 flex-1 overflow-auto' : 'overflow-x-auto'}>
                <table className="min-w-full text-left" style={{ '--serial-start': pageData.start }}>
                  <thead className={`${activeTab === 'candidates' ? 'sticky top-0 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(55,65,81,1)]' : ''} bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-gray-800 dark:text-gray-400`}>
                    <tr>
                      {TABLE_COLUMNS.filter((column) => visibleColumns[column.key]).map((column) => (
                        <ColumnHeader
                          key={column.key}
                          label={column.label}
                          sortKey={column.sortKey}
                          filterKey={column.filterKey}
                          align={column.align}
                          sort={sort}
                          onSort={handleSort}
                          onSortDirection={handleSortDirection}
                          filters={rosterFilters}
                          getFilter={getColumnFilter}
                          onFilter={setColumnFilter}
                          rows={tabRows}
                        />
                      ))}
                      <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {!selectedAssessmentId ? (
                      <TableEmpty title="Select an assessment" message="Choose an assessment to see its candidates." />
                    ) : roster.loading && !roster.rows.length ? (
                      Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    ) : pageData.rows.length === 0 ? (
                      <TableEmpty
                        title={roster.rows.length ? 'No candidates match' : 'No candidates yet'}
                        message={roster.rows.length ? 'Adjust your filters or search to see results.' : 'Assigned students appear here as soon as the roster loads.'}
                      />
                    ) : (
                      pageData.rows.map((row) => (
                        <TableRow
                          key={row.key}
                          row={row}
                          visibleColumns={visibleColumns}
                          highlighted={roster.recentlyChanged.has(row.key)}
                          openStudentDetail={openStudentDetail}
                          openViolationReport={openViolationReport}
                          toast={toast}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-gray-700">
                <span className="text-xs text-slate-500 dark:text-gray-400">
                  {visibleRows.length ? (
                    <>
                      Showing <span className="font-semibold text-slate-700 dark:text-gray-300">{pageData.start + 1}–{pageData.start + pageData.rows.length}</span> of{' '}
                      <span className="font-semibold text-slate-700 dark:text-gray-300">{visibleRows.length}</span>
                      {visibleRows.length !== tabRows.length ? ` (filtered from ${tabRows.length})` : ''} candidates
                    </>
                  ) : '0 candidates'}
                </span>
                <PageNav page={currentPage} totalPages={totalPages} onPage={setPage} />
              </div>
            </div>
          </div>
        </div>
        </main>
      </div>

      {/* ═══════════════════ STUDENT DETAIL DRAWER ═══════════════════ */}
      {showExportModal && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Export report</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                  Choose the columns for the main candidate sheet. Section performance and proctoring logs will be added as separate sheets when data exists.
                </p>
              </div>
              <button onClick={() => setShowExportModal(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Close</button>
            </div>
            <div className="px-5 py-4">
              <fieldset className="mb-4">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Candidates to include</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: 'view', title: 'What is on screen', detail: `${exportableInView} attempt${exportableInView === 1 ? '' : 's'} · all filters and the current view applied` },
                    { value: 'all', title: 'Everyone in this assessment', detail: `${exportableAll} attempt${exportableAll === 1 ? '' : 's'} · filters ignored` },
                  ].map((option) => (
                    <label key={option.value} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition-colors ${exportScope === option.value ? 'border-sky-500 bg-sky-50 dark:border-sky-600 dark:bg-sky-900/20' : 'border-slate-200 hover:border-slate-300 dark:border-gray-700'}`}>
                      <input type="radio" name="export-scope" value={option.value} checked={exportScope === option.value} onChange={() => setExportScope(option.value)} className="mt-0.5 h-3.5 w-3.5 text-sky-600 focus:ring-sky-500" />
                      <span>
                        <span className="block font-semibold text-slate-800 dark:text-gray-100">{option.title}</span>
                        <span className="block text-slate-500 dark:text-gray-400">{option.detail}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-gray-500">A file lists attempts. Candidates who have not started have no attempt, so they are counted on screen but not in the file.</p>
              </fieldset>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button onClick={() => setAllExportColumns(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Select All</button>
                <button onClick={() => setAllExportColumns(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Unselect All</button>
                <button onClick={saveExportPreferences} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/30">Save Preferred Export Settings</button>
              </div>
              <div className="grid max-h-[420px] gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-gray-700">
                {visibleExportDefs.length ? visibleExportDefs.map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={Boolean(exportColumns[key])} onChange={() => setExportColumns((prev) => ({ ...prev, [key]: !prev[key] }))} className="h-4 w-4 rounded border-slate-300 text-lime-600 focus:ring-lime-500" />
                    <span>{label}</span>
                  </label>
                )) : (
                  <div className="col-span-full py-8 text-center text-xs text-slate-500 dark:text-gray-400">
                    No exportable fields are available for the current assessment filters.
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-gray-700">
              <div className="text-xs text-slate-500 dark:text-gray-400">{visibleExportDefs.filter(({ key }) => exportColumns[key]).length} column(s) selected</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowExportModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={handlePdfExport} disabled={exportingExcel || !visibleExportDefs.some(({ key }) => exportColumns[key])} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">PDF</button>
                <button onClick={handleCsvExport} disabled={exportingExcel || !visibleExportDefs.some(({ key }) => exportColumns[key])} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">CSV</button>
                <button onClick={handleExcelExport} disabled={exportingExcel || !visibleExportDefs.some(({ key }) => exportColumns[key])} className="inline-flex items-center gap-1 rounded-lg bg-lime-600 px-4 py-2 text-xs font-semibold text-white hover:bg-lime-500 disabled:opacity-60">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {exportingExcel ? 'Preparing Excel...' : 'Download Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {releaseConfirm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="release-results-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <h2 id="release-results-title" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Megaphone className="h-4 w-4 text-sky-600" />
              {releaseConfirm === 'release' ? 'Release results to students?' : 'Withdraw released results?'}
            </h2>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-gray-300">
              {releaseConfirm === 'release'
                ? `Every candidate of "${selectedAssessment?.title || 'this assessment'}" will see their score and report once their attempt is evaluated.${stats.inProgress ? ` ${stats.inProgress} candidate${stats.inProgress === 1 ? ' is' : 's are'} still writing; they will see results after submitting.` : ''}${stats.evaluating ? ` ${stats.evaluating} attempt${stats.evaluating === 1 ? ' is' : 's are'} still being evaluated.` : ''}`
                : 'Students will see "Result not announced yet" again until you release results.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReleaseConfirm(null)} disabled={releaseBusy} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
              <button type="button" onClick={confirmReleaseChange} disabled={releaseBusy} className={`rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${releaseConfirm === 'release' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                {releaseBusy ? 'Saving…' : releaseConfirm === 'release' ? 'Release results' : 'Withdraw results'}
              </button>
            </div>
          </div>
        </div>
      )}

      <RosterFilterSheet
        open={showFilterPanel}
        filters={rosterFilters}
        rows={tabRows}
        statusCounts={statusCounts}
        matchCount={visibleRows.length}
        totalCount={tabRows.length}
        onChange={updateRosterFilter}
        onAcademicChange={setAcademicFilter}
        onToggleStatus={toggleStatusFilter}
        onClear={clearFilters}
        onClose={closeFilterPanel}
      />

      <ReportDetailDrawer
        student={selectedStudent ? toDrawerStudent(openRosterRow || selectedStudent) : null}
        loading={detailLoading}
        data={detailData}
        onClose={closeStudentDetail}
        openViolationReport={openViolationReport}
      />

      {/* ═══════════════════ VIOLATION MODAL ═══════════════════ */}
      <ReportViolationModal
        report={violationReport}
        loading={violationsLoading}
        onClose={() => setViolationReport(null)}
      />
    </div>
  );
}
