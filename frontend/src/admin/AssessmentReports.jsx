import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import {
  ArrowLeft, ArrowRight, BarChart3, Download, FileSpreadsheet,
  GraduationCap, Layers, LayoutDashboard, RotateCcw, Search,
  ShieldAlert, SlidersHorizontal, Target, TrendingUp, Users, X,
} from 'lucide-react';
import { Sparkline } from './reports/ReportCharts';
import {
  TrendBadge, StatusBadge, KpiCard, FilterChip, SortHeader,
  AssessmentListItem, TableEmpty, TableRow, SkeletonRow,
  formatDuration, formatDateTime,
} from './reports/ReportComponents';
import ReportDetailDrawer from './reports/ReportDetailDrawer';
import ReportViolationModal from './reports/ReportViolationModal';
import CompilerAnalytics from './compiler/CompilerAnalytics';

const PAGE_SIZES = [25, 50, 100, 250];

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

function getRollingYearMonths() {
  const months = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(cursor);
    date.setMonth(cursor.getMonth() - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      year: date.getFullYear(),
    });
  }
  return months;
}

function getRollingYearDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 364; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    days.push(date);
  }
  return days;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function activityTone(value, max) {
  const ratio = max > 0 ? value / max : 0;
  if (!value) return 'bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700';
  if (ratio > 0.75) return 'bg-sky-700 dark:bg-sky-300';
  if (ratio > 0.45) return 'bg-sky-500 dark:bg-sky-500';
  if (ratio > 0.22) return 'bg-sky-300 dark:bg-sky-700';
  return 'bg-sky-100 dark:bg-sky-900';
}

export function YearlyAssessmentActivity({ calendar = [], monthly = [], onSelectAssessment }) {
  const [hoveredDay, setHoveredDay] = useState(null);
  const [pinnedDay, setPinnedDay] = useState(null);
  const activityMap = useMemo(() => {
    const map = new Map();
    calendar.forEach((item) => map.set(item.date, item));
    return map;
  }, [calendar]);
  const days = useMemo(() => getRollingYearDays(), []);
  const monthBars = useMemo(() => getRollingYearMonths(), []);
  const calendarMonths = useMemo(() => {
    const groups = [];
    days.forEach((day) => {
      const key = monthKey(day);
      let group = groups.find((item) => item.key === key);
      if (!group) {
        group = {
          key,
          label: day.toLocaleDateString('en-US', { month: 'short' }),
          year: day.getFullYear(),
          leadingBlanks: day.getDay(),
          days: [],
        };
        groups.push(group);
      }
      group.days.push(day);
    });
    return groups;
  }, [days]);
  const maxDaily = Math.max(...calendar.map((item) => Number(item.count || 0)), 1);
  const monthlyMap = useMemo(() => {
    const map = new Map();
    monthly.forEach((item) => map.set(item.month, item));
    return map;
  }, [monthly]);
  const monthMax = Math.max(...monthly.map((item) => Number(item.count || 0)), 1);
  const activeDays = calendar.filter((item) => Number(item.count || 0) > 0).length;
  const totalAssessments = calendar.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const totalViolations = calendar.reduce((sum, item) => sum + Number(item.violations || 0), 0);
  const questionRows = calendar.filter((item) => Number(item.totalQuestions || 0) > 0);
  const avgQuestions = questionRows.length
    ? questionRows.reduce((sum, item) => sum + Number(item.totalQuestions || 0), 0) / totalAssessments
    : 0;
  const activeDay = pinnedDay || hoveredDay;
  const activeAssessments = activeDay?.assessments || [];
  const makeDayPayload = (day, item) => ({
    date: dateKey(day),
    label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    ...(item || { count: 0, assessments: [] }),
  });

  return (
    <div className="relative min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-300">Yearly assessment system</div>
          <h2 className="mt-1 text-base font-black text-slate-950 dark:text-white">Assessment creation calendar</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Day-wise assessment creation activity. Hover a day to inspect assessments, then click a card to open that assessment report.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Active days', activeDays],
            ['Assessments', totalAssessments],
            ['Avg Qs', avgQuestions.toFixed(1)],
            ['Violations', totalViolations],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-center dark:border-gray-800 dark:bg-gray-800">
              <div className="text-sm font-black text-slate-900 dark:text-white">{value}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div
          className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/30 sm:p-4"
          onMouseLeave={() => setHoveredDay(null)}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600 dark:text-gray-300">
              <span className="text-xl font-black text-slate-950 dark:text-white">{totalAssessments}</span>
              <span className="ml-1">assessments in the past one year</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-gray-400">
              <span>Total active days: <b className="text-slate-800 dark:text-gray-100">{activeDays}</b></span>
              <span>Peak day: <b className="text-slate-800 dark:text-gray-100">{Math.max(...calendar.map((item) => Number(item.count || 0)), 0)}</b></span>
            </div>
          </div>

          <div className="max-w-full overflow-x-auto overflow-y-hidden pb-2 pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-700">
          <div className="w-max max-w-none">
            <div className="flex items-start gap-5 sm:gap-7">
              {calendarMonths.map((month) => (
                <div key={month.key} className="shrink-0">
                  <div className="grid grid-flow-col grid-rows-7 gap-1.5">
                    {Array.from({ length: month.leadingBlanks }).map((_, index) => (
                      <span key={`${month.key}-blank-${index}`} className="h-3 w-3" />
                    ))}
                    {month.days.map((day) => {
                      const key = dateKey(day);
                      const item = activityMap.get(key);
                      const count = Number(item?.count || 0);
                      const assessmentLabel = count === 1 ? 'assessment' : 'assessments';
                      const isPinned = pinnedDay?.date === key;
                      const isHovered = hoveredDay?.date === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseEnter={() => setHoveredDay(makeDayPayload(day, item))}
                          onFocus={() => setHoveredDay(makeDayPayload(day, item))}
                          onClick={() => setPinnedDay(makeDayPayload(day, item))}
                          title={`${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: ${count} ${assessmentLabel}`}
                          className={`h-3 w-3 cursor-pointer rounded-[4px] transition-all hover:scale-125 hover:ring-2 hover:ring-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                            isPinned
                              ? 'scale-125 ring-2 ring-sky-600 ring-offset-2 ring-offset-slate-50 dark:ring-offset-gray-950'
                              : isHovered
                                ? 'ring-2 ring-sky-400'
                                : ''
                          } ${activityTone(count, maxDaily)}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 text-center text-xs font-medium text-slate-400 dark:text-gray-500">
                    {month.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 text-[10px] font-medium text-slate-400">
            Less
            <span className="h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-200 dark:bg-gray-800 dark:ring-gray-700" />
            <span className="h-3 w-3 rounded bg-sky-100 dark:bg-sky-900" />
            <span className="h-3 w-3 rounded bg-sky-300 dark:bg-sky-700" />
            <span className="h-3 w-3 rounded bg-sky-500" />
            <span className="h-3 w-3 rounded bg-sky-700 dark:bg-sky-300" />
            More
          </div>

          {activeDay && (
            <div className="absolute inset-x-3 top-16 z-30 max-h-[calc(100%-4.75rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-300/40 backdrop-blur dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/40 sm:left-auto sm:right-4 sm:top-4 sm:w-[min(22rem,calc(100%-2rem))] sm:max-h-[calc(100%-2rem)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
                    {pinnedDay ? 'Selected day' : 'Hover preview'}
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{activeDay.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{activeAssessments.length} assessment(s) created on this day</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                    {activeDay.count || 0}
                  </span>
                  {pinnedDay && (
                    <button
                      type="button"
                      onClick={() => setPinnedDay(null)}
                      className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      aria-label="Close selected day"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {activeAssessments.length ? (
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 sm:max-h-72">
                  {activeAssessments.map((assessment) => (
                    <button
                      key={assessment._id}
                      type="button"
                      onClick={() => {
                        setPinnedDay(null);
                        onSelectAssessment?.(assessment);
                      }}
                      className="group w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 hover:shadow-md hover:shadow-sky-100 dark:border-gray-800 dark:bg-gray-800 dark:hover:border-sky-800 dark:hover:bg-sky-900/20 dark:hover:shadow-black/20"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900 group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-300">
                            {assessment.title || 'Untitled'}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-gray-400">
                            <span className="rounded bg-white px-1.5 py-0.5 font-semibold dark:bg-gray-900">{assessment.assessmentType || 'mixed'}</span>
                            <span>{assessment.totalQuestions || 0} Qs</span>
                            <span>{assessment.submissionCount || 0} attempts</span>
                            <span>{Number(assessment.avgScore || 0).toFixed(1)}% avg</span>
                          </div>
                        </div>
                        <span className="rounded-full bg-lime-50 px-2 py-0.5 text-[10px] font-bold text-lime-700 dark:bg-lime-900/30 dark:text-lime-300">
                          {assessment.lifecycleBucket || 'current'}
                        </span>
                      </div>
                      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-sky-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-sky-300">
                        Open assessment report
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-400 dark:border-gray-700 dark:bg-gray-800">
                  No assessments were created on this day.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/30">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">Monthly assessments</div>
            <div className="text-[10px] text-slate-400">Last 12 months</div>
          </div>
          <div className="flex h-44 items-end gap-2">
            {monthBars.map((month) => {
              const item = monthlyMap.get(month.key);
              const count = Number(item?.count || 0);
              const attempts = Number(item?.attempts || 0);
              const height = monthMax > 0 ? Math.max(6, (count / monthMax) * 100) : 6;
              return (
                <div key={month.key} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end rounded-full bg-slate-100 p-1 dark:bg-gray-800" title={`${month.label} ${month.year}: ${count} assessments, ${attempts} attempts`}>
                    <div
                      className="w-full rounded-full bg-gradient-to-t from-sky-600 to-cyan-300 shadow-sm transition-all"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">{month.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const searchRef = useRef(null);
  const initialAssessmentId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('assessmentId') || ''
    : '';

  /* View state */
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');

  /* Filters */
  const [filters, setFilters] = useState({
    assessmentId: initialAssessmentId, assessmentType: '', studentQuery: '', status: '',
    createdBy: '', tag: '', department: '', difficulty: '',
    from: '', to: '', scoreMin: '', scoreMax: '',
    completionRateMin: '', completionRateMax: '', attemptsMin: '', attemptsMax: '',
    assessmentWindow: 'all',
  });
  const [assessmentSearch, setAssessmentSearch] = useState('');

  /* Data */
  const [assessments, setAssessments] = useState([]);
  const [allAssessments, setAllAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState({ key: 'attemptDate', dir: 'desc' });

  /* Detail drawer */
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);

  /* Violation modal */
  const [violationReport, setViolationReport] = useState(null);
  const [violationsLoading, setViolationsLoading] = useState(false);

  /* Column visibility */
  const [visibleColumns, setVisibleColumns] = useState({
    student: true, attemptDate: true, attempts: true, score: true,
    accuracy: true, time: true, violations: true, status: true,
    rank: false, percentile: false, sectionBreakdown: false,
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportColumns, setExportColumns] = useState(loadSavedExportColumns);
  const [availableExportKeys, setAvailableExportKeys] = useState([]);
  const [loadingExportMeta, setLoadingExportMeta] = useState(false);

  const selectedAssessment = useMemo(
    () => allAssessments.find((a) => String(a._id) === String(selectedAssessmentId))
      || assessments.find((a) => String(a._id) === String(selectedAssessmentId)),
    [allAssessments, assessments, selectedAssessmentId]
  );

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const selectAssessmentReport = useCallback((assessmentOrId, options = {}) => {
    const id = typeof assessmentOrId === 'object'
      ? assessmentOrId?._id || assessmentOrId?.id
      : assessmentOrId;
    if (!id) return;

    setSelectedAssessmentId(id);
    setFilters((prev) => ({ ...prev, assessmentId: id }));
    setPagination((p) => ({ ...p, page: 1 }));
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

  useEffect(() => {
    setSelectedAssessmentId(filters.assessmentId || '');
  }, [filters.assessmentId]);

  /* ── Load reports (debounced) ── */
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const params = { ...filters, page: pagination.page, limit: pagination.limit, sortKey: sort.key, sortDir: sort.dir };
        if (activeTab === 'violations') params.hasViolations = 'true';
        const data = await api.getAssessmentReports(params);
        if (!active) return;
        // Handle different data structures
        const assessments = data.assessments || data || [];
        const students = data.students || data.reports || [];
        const summary = data.summary || data.analytics || {};
        const total = data.pagination?.total || data.total || 0;
        setAssessments(Array.isArray(assessments) ? assessments : []);
        setStudents(Array.isArray(students) ? students : []);
        setSummary(summary);
        setPagination((prev) => ({ ...prev, total }));
      } catch (err) {
        console.error('Error loading reports:', err);
        toast.error(err.message || 'Failed to load reports');
        // Set empty data on error to prevent UI from hanging
        setAssessments([]);
        setStudents([]);
        setSummary({});
        setPagination((prev) => ({ ...prev, total: 0 }));
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => { active = false; clearTimeout(timeout); };
  }, [filters, pagination.page, pagination.limit, sort, activeTab, toast]);

  useEffect(() => {
    if (!selectedAssessmentId) return;
    const source = allAssessments.length ? allAssessments : assessments;
    if (!source.length) {
      if (selectedAssessmentId) setSelectedAssessmentId('');
      return;
    }
    const selectedStillExists = source.some((a) => String(a._id) === String(selectedAssessmentId));
    if (!selectedStillExists) {
      setSelectedAssessmentId('');
      setFilters((prev) => ({ ...prev, assessmentId: '' }));
    }
  }, [allAssessments, assessments, selectedAssessmentId]);

  /* ── Load student detail ── */
  const openStudentDetail = useCallback(async (studentRow) => {
    setSelectedStudent(studentRow);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const data = await api.getStudentAssessmentReport(studentRow._id);
      setDetailData(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load student report');
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

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

  const setAllExportColumns = useCallback((checked) => {
    setExportColumns((prev) => ({
      ...prev,
      ...Object.fromEntries(
        EXPORT_COLUMN_DEFS
          .filter(({ key }) => !availableExportKeys.length || availableExportKeys.includes(key))
          .map(({ key }) => [key, checked]),
      ),
    }));
  }, [availableExportKeys]);

  const visibleExportDefs = useMemo(() => {
    if (!availableExportKeys.length) return EXPORT_COLUMN_DEFS;
    const availableSet = new Set(availableExportKeys);
    return EXPORT_COLUMN_DEFS.filter(({ key }) => availableSet.has(key));
  }, [availableExportKeys]);

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
      const exportParams = { ...filters };
      if (selectedAssessmentId) exportParams.assessmentId = selectedAssessmentId;
      exportParams.columns = selectedDefs.map(({ key }) => key).join(',');
      const payload = await api.getAssessmentReportsExportData(exportParams);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const sectionRows = Array.isArray(payload?.sectionRows) ? payload.sectionRows : [];
      const summary = payload?.summary || {};

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
        ['Candidates', summary.totalCandidates || rows.length || 0, palette.blue, palette.sky],
        ['Average score', summary.avgScore || 0, palette.navy, 'FFE8EEF5'],
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
        ['Highest score', summary.maxScore || 0],
        ['Lowest score', summary.minScore || 0],
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
  }, [buildExportValue, exportColumns, filters, selectedAssessment, selectedAssessmentId, toast, visibleExportDefs]);

  const handleCsvExport = useCallback(async () => {
    const selectedDefs = visibleExportDefs.filter(({ key }) => exportColumns[key]);
    if (!selectedDefs.length) {
      toast.error('Select at least one column for CSV export.');
      return;
    }
    setExportingExcel(true);
    try {
      const exportParams = { ...filters };
      if (selectedAssessmentId) exportParams.assessmentId = selectedAssessmentId;
      exportParams.columns = selectedDefs.map(({ key }) => key).join(',');
      const payload = await api.getAssessmentReportsExportData(exportParams);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
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
  }, [buildExportValue, exportColumns, filters, selectedAssessmentId, toast, visibleExportDefs]);

  const handlePdfExport = useCallback(async () => {
    const selectedDefs = visibleExportDefs.filter(({ key }) => exportColumns[key]);
    if (!selectedDefs.length) {
      toast.error('Select at least one column for PDF export.');
      return;
    }
    setExportingExcel(true);
    try {
      const exportParams = { ...filters };
      if (selectedAssessmentId) exportParams.assessmentId = selectedAssessmentId;
      exportParams.columns = selectedDefs.map(({ key }) => key).join(',');
      const payload = await api.getAssessmentReportsExportData(exportParams);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
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
              <div class="card"><div class="label">Candidates</div><div class="value">${payload?.summary?.totalCandidates || rows.length}</div></div>
              <div class="card"><div class="label">Average Score</div><div class="value">${payload?.summary?.avgScore || 0}</div></div>
              <div class="card"><div class="label">Passed</div><div class="value">${payload?.summary?.passCount || 0}</div></div>
              <div class="card"><div class="label">Violations</div><div class="value">${payload?.summary?.violationCount || 0}</div></div>
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
  }, [buildExportValue, exportColumns, filters, selectedAssessment, selectedAssessmentId, toast, visibleExportDefs]);

  useEffect(() => {
    if (!showExportModal) return;
    let active = true;
    const loadExportMeta = async () => {
      setLoadingExportMeta(true);
      try {
        const exportParams = { ...filters };
        if (selectedAssessmentId) exportParams.assessmentId = selectedAssessmentId;
        const payload = await api.getAssessmentReportsExportData(exportParams);
        if (!active) return;
        const keys = Array.isArray(payload?.availableColumns) ? payload.availableColumns : [];
        setAvailableExportKeys(keys);
        if (keys.length) {
          const allowed = new Set(keys);
          setExportColumns((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((key) => {
              if (!allowed.has(key)) next[key] = false;
            });
            return next;
          });
        }
      } catch (err) {
        if (!active) return;
        toast.error(err.message || 'Failed to load export fields');
        setAvailableExportKeys([]);
      } finally {
        if (active) setLoadingExportMeta(false);
      }
    };
    void loadExportMeta();
    return () => { active = false; };
  }, [showExportModal, filters, selectedAssessmentId, toast]);

  /* ── Sorting ── */
  const handleSort = useCallback((key) => {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  }, []);

  /* ── Clear ── */
  const clearFilters = useCallback(() => {
    setFilters({
      assessmentId: '', assessmentType: '', studentQuery: '', status: '', createdBy: '', tag: '',
      department: '', difficulty: '', from: '', to: '', scoreMin: '', scoreMax: '',
      completionRateMin: '', completionRateMax: '', attemptsMin: '', attemptsMax: '',
      assessmentWindow: 'all',
    });
    setSelectedAssessmentId('');
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  /* ── Active chips ── */
  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.assessmentId) {
      const a = allAssessments.find((x) => String(x._id) === String(filters.assessmentId))
        || assessments.find((x) => String(x._id) === String(filters.assessmentId));
      chips.push({ key: 'assessmentId', label: `Assessment: ${a?.title || filters.assessmentId}`, clear: () => updateFilter('assessmentId', '') });
    }
    if (filters.assessmentType) chips.push({ key: 'assessmentType', label: `Type: ${filters.assessmentType}`, clear: () => updateFilter('assessmentType', '') });
    if (filters.status) chips.push({ key: 'status', label: `Status: ${filters.status}`, clear: () => updateFilter('status', '') });
    if (filters.studentQuery) chips.push({ key: 'studentQuery', label: `Search: ${filters.studentQuery}`, clear: () => updateFilter('studentQuery', '') });
    if (filters.createdBy) chips.push({ key: 'createdBy', label: `Created: ${filters.createdBy}`, clear: () => updateFilter('createdBy', '') });
    if (filters.tag) chips.push({ key: 'tag', label: `Tag: ${filters.tag}`, clear: () => updateFilter('tag', '') });
    if (filters.department) chips.push({ key: 'department', label: `Dept: ${filters.department}`, clear: () => updateFilter('department', '') });
    if (filters.difficulty) chips.push({ key: 'difficulty', label: `Difficulty: ${filters.difficulty}`, clear: () => updateFilter('difficulty', '') });
    if (filters.assessmentWindow && filters.assessmentWindow !== 'all') chips.push({ key: 'assessmentWindow', label: `Window: ${filters.assessmentWindow}`, clear: () => updateFilter('assessmentWindow', 'all') });
    if (filters.from || filters.to) chips.push({ key: 'dateRange', label: `Date: ${filters.from || '…'} → ${filters.to || '…'}`, clear: () => { setFilters((p) => ({ ...p, from: '', to: '' })); } });
    if (filters.scoreMin || filters.scoreMax) chips.push({ key: 'scoreRange', label: `Score: ${filters.scoreMin || 0} - ${filters.scoreMax || '∞'}`, clear: () => { setFilters((p) => ({ ...p, scoreMin: '', scoreMax: '' })); } });
    return chips;
  }, [filters, allAssessments, assessments, updateFilter]);

  /* ── KPI data ── */
  const kpiData = useMemo(() => {
    const s = summary || {};
    const totalStudents = pagination.total || 0;
    const uniqueCandidates = new Set(students.map((st) => st.studentId)).size;
    const passCount = Number(s.passCount) || 0;
    const failCount = Number(s.failCount) || Math.max(0, totalStudents - passCount);
    const totalForPassRate = passCount + failCount;
    const passRate = totalForPassRate > 0 ? (passCount / totalForPassRate) * 100 : 0;
    const avgScore = Number(s.avgScore) || 0;
    const avgTimeSec = Number(s.avgTimeSec) || 0;
    const violationCount = Number(s.violationCount) || 0;

    const baseKPIs = [
      {
        icon: Layers, label: 'Questions', value: selectedAssessment?.totalQuestions || 0,
        insight: `${selectedAssessment?.totalMarks || 0} total marks`,
        trend: s.assessmentGrowth, tone: 'sky',
      },
      {
        icon: GraduationCap, label: 'Total Attempts', value: totalStudents,
        insight: uniqueCandidates ? `${uniqueCandidates} unique candidates` : undefined,
        trend: s.attemptGrowth, tone: 'lime',
        chart: Array.isArray(s.attemptTrend) && s.attemptTrend.length > 1 ? <Sparkline data={s.attemptTrend} stroke="#84cc16" /> : null,
      },
      {
        icon: TrendingUp, label: 'Avg Score', value: `${avgScore.toFixed(1)}%`,
        sub: `of ${s.maxScore || 100} max`, insight: s.medianScore ? `Median: ${s.medianScore}%` : undefined,
        trend: s.scoreGrowth, tone: 'lime',
        chart: Array.isArray(s.scoreTrend) && s.scoreTrend.length > 1 ? <Sparkline data={s.scoreTrend} stroke="#84cc16" /> : null,
      },
      {
        icon: BarChart3, label: 'Pass Rate', value: `${passRate.toFixed(1)}%`,
        insight: totalForPassRate > 0 ? `${passCount} passed, ${failCount} failed` : undefined,
        trend: s.passRateGrowth, tone: 'lime',
      },
      {
        icon: Search, label: 'Avg Time', value: formatDuration(avgTimeSec),
        insight: s.fastestTime ? `Fastest: ${formatDuration(Number(s.fastestTime))}` : undefined, tone: 'sky',
      },
      {
        icon: ShieldAlert, label: 'Violations', value: violationCount,
        insight: totalStudents > 0 ? `${((violationCount / totalStudents)).toFixed(1)} per session` : undefined,
        trend: s.violationGrowth, tone: 'sky', invert: true,
      },
    ];

    // For violations tab, show violation-specific KPIs
    if (activeTab === 'violations') {
      return [
        {
          icon: ShieldAlert, label: 'Total Violations', value: s.violationCount || 0,
          insight: s.violationRate ? `${s.violationRate}% violation rate` : undefined,
          tone: 'sky',
        },
        {
          icon: GraduationCap, label: 'Flagged Sessions', value: pagination.total || 0,
          insight: 'Sessions with security violations', tone: 'lime',
        },
        {
          icon: Search, label: 'Tab Switches', value: s.tabSwitches || 0,
          insight: 'Total tab switch events', tone: 'sky',
        },
        {
          icon: BarChart3, label: 'Fullscreen Exits', value: s.fullscreenExits || 0,
          insight: 'Fullscreen mode violations', tone: 'sky',
        },
        {
          icon: TrendingUp, label: 'Camera Flags', value: s.cameraFlags || 0,
          insight: 'Camera monitoring violations', tone: 'sky',
        },
        {
          icon: Users, label: 'Unique Candidates', value: s.uniqueCandidates || 0,
          insight: 'Students with violations', tone: 'lime',
        },
      ];
    }

    return baseKPIs;
  }, [summary, selectedAssessment, pagination.total, activeTab, students]);

  const distributionLabels = ['0-25', '26-50', '51-75', '76-90', '91-100'];
  const distributionData = useMemo(() => {
    const sd = summary?.scoreDistribution;
    if (Array.isArray(sd) && sd.length === 5) return sd;
    // Fallback: compute from student scores
    const buckets = [0, 0, 0, 0, 0];
    students.forEach((st) => {
      const score = Number(st.score) || 0;
      if (score < 26) buckets[0]++;
      else if (score < 51) buckets[1]++;
      else if (score < 76) buckets[2]++;
      else if (score < 91) buckets[3]++;
      else buckets[4]++;
    });
    return buckets;
  }, [summary, students]);

  const distributionMaximum = Math.max(1, ...distributionData);
  const overviewPassCount = Number(summary?.passCount || 0);
  const overviewReviewCount = Number(summary?.failCount || 0);
  const overviewOutcomeTotal = overviewPassCount + overviewReviewCount;
  const overviewPassRate = overviewOutcomeTotal > 0
    ? Math.round((overviewPassCount / overviewOutcomeTotal) * 100)
    : 0;

  // Violation-specific chart data
  const violationLabels = ['Tab Switch', 'Fullscreen Exit', 'Camera Off', 'Copy/Paste'];
  const violationData = useMemo(() => {
    // Use backend summary if it has data
    const backendData = [
      Number(summary?.tabSwitches) || 0,
      Number(summary?.fullscreenExits) || 0,
      Number(summary?.cameraFlags) || 0,
      Number(summary?.copyPasteCount) || 0,
    ];

    // If backend has no violation data, compute from student rows
    if (backendData.every(v => v === 0) && students.length > 0) {
      const computed = [
        students.reduce((sum, st) => sum + (Number(st.tabSwitches) || 0), 0),
        students.reduce((sum, st) => sum + (Number(st.fullscreenExits) || 0), 0),
        students.reduce((sum, st) => sum + (Number(st.cameraFlags) || 0), 0),
        students.reduce((sum, st) => sum + (Number(st.copyPasteCount) || 0), 0),
      ];
      return computed;
    }

    return backendData;
  }, [summary, students]);
  const totalViolationEvents = violationData.reduce((total, count) => total + count, 0)
    || Number(summary?.violationCount)
    || 0;
  const highestViolationCategoryCount = Math.max(1, ...violationData);
  const mostFlaggedCandidate = summary?.topViolators?.[0] || null;

  const assessmentSidebarItems = useMemo(() => {
    const now = Date.now();
    const source = allAssessments.length ? allAssessments : assessments;
    const getBucket = (assessment) => {
      if (assessment.lifecycleBucket) return assessment.lifecycleBucket;
      const start = assessment.startTime ? new Date(assessment.startTime).getTime() : null;
      const end = assessment.endTime ? new Date(assessment.endTime).getTime() : null;
      if (start && start > now) return 'upcoming';
      if (end && end < now) return 'completed';
      return 'current';
    };
    const search = assessmentSearch.trim().toLowerCase();
    return source
      .map((assessment) => ({ ...assessment, lifecycleBucket: getBucket(assessment) }))
      .filter((assessment) => {
        const matchesWindow = filters.assessmentWindow === 'all' || assessment.lifecycleBucket === filters.assessmentWindow;
        const haystack = `${assessment.title || ''} ${assessment.assessmentType || ''} ${assessment.assessmentId || ''}`.toLowerCase();
        return matchesWindow && (!search || haystack.includes(search));
      })
      .sort((a, b) => {
        const aTime = new Date(a.startTime || a.createdAt || 0).getTime();
        const bTime = new Date(b.startTime || b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 24);
  }, [allAssessments, assessments, assessmentSearch, filters.assessmentWindow]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit));

  const assessmentRail = (
    <div className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="shrink-0 border-b border-slate-200 p-3 dark:border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            id="report-assessment-search"
            type="search"
            placeholder="Search assessments"
            value={assessmentSearch}
            onChange={(e) => setAssessmentSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div>
          {loading && !assessments.length ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-slate-100 dark:bg-gray-800" />
            ))
          ) : assessmentSidebarItems.length ? (
            assessmentSidebarItems.map((a) => {
              const active = String(a._id) === String(selectedAssessmentId);
              return (
                <button
                  key={a._id}
                  type="button"
                  onClick={() => selectAssessmentReport(a, { openOverview: false })}
                  className={`group flex w-full items-center gap-2.5 border-b border-slate-200/80 px-2.5 py-3 text-left transition-colors last:border-b-0 dark:border-gray-800 ${
                    active
                      ? 'rounded-lg bg-sky-50 text-sky-950 dark:bg-sky-900/20 dark:text-sky-100'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-900'
                  }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-sky-50 group-hover:text-sky-600 dark:bg-gray-800 dark:text-gray-500'}`}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{a.title || 'Untitled'}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-gray-500">
                      <span className="truncate">{a.assessmentType || 'Mixed'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{a.submissionCount || 0} attempts</span>
                    </div>
                  </div>
                  {active && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-label="Selected" />}
                </button>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400">
              No assessments found
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden bg-[#f5fbff] text-slate-900 dark:bg-gray-950">
      <div className="shrink-0 border-b border-sky-100 bg-white/95 shadow-sm shadow-sky-950/5 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`${rolePrefix}/assessment`)}
              aria-label="Back to assessments"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Assessments</span>
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm shadow-sky-200 dark:shadow-none">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-950 dark:text-white">Assessment Reports</h1>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {selectedAssessment ? `${selectedAssessment.title} · ${pagination.total || 0} candidate records` : 'Choose an assessment to view its report'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className={`relative hidden sm:block ${activeTab === 'analytics' || (activeTab === 'overview' && !selectedAssessment) ? 'lg:hidden' : ''}`}>
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={filters.studentQuery}
                  onChange={(e) => updateFilter('studentQuery', e.target.value)}
                  placeholder="Search candidates..."
                  className="h-9 w-56 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none ring-sky-200 transition-all placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:ring-sky-900"
                />
              </div>

              <div className="relative lg:hidden">
                <select
                  value={filters.assessmentId || ''}
                  onChange={(e) => updateFilter('assessmentId', e.target.value)}
                  className="h-9 w-48 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs text-slate-700 outline-none ring-sky-200 transition-all focus:border-sky-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-900"
                >
                  <option value="">Choose assessment</option>
                  {(allAssessments.length ? allAssessments : assessments).map((a) => (
                    <option key={a._id} value={a._id}>{a.title || 'Untitled'}</option>
                  ))}
                </select>
                {filters.assessmentId && (
                  <button
                    onClick={() => updateFilter('assessmentId', '')}
                    className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {activeTab !== 'analytics' && (activeTab !== 'overview' || selectedAssessment) && <div className="flex items-center gap-2">
              <button onClick={() => setPagination((p) => ({ ...p, page: 1 }))} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700" title="Refresh">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => setShowExportModal(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-lime-200 bg-lime-50 px-3 text-xs font-semibold text-lime-700 transition-colors hover:bg-lime-100 dark:border-lime-800 dark:bg-lime-900/20 dark:text-lime-300 dark:hover:bg-lime-900/30"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Excel</span>
              </button>
            </div>}
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="border-t border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
            <div className="flex gap-1">
              {tabsConfig.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${active ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-300'}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    {tab.id === 'violations' && (summary?.violationCount || 0) > 0 && (
                      <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-bold text-white">
                        {summary.violationCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid h-[calc(100vh-113px)] max-w-[1600px] grid-cols-1 overflow-hidden lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 lg:block">
          {assessmentRail}
        </aside>

        <main className={`min-h-0 px-4 py-4 sm:px-5 ${activeTab === 'candidates' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {activeTab === 'overview' && !selectedAssessment && (
          <div className="flex min-h-[500px] items-center justify-center">
            <div className="max-w-md px-6 text-center">
              <div className="relative mx-auto flex h-36 w-36 items-center justify-center" aria-hidden="true">
                <div className="absolute inset-3 rounded-full bg-sky-200/70 blur-2xl dark:bg-sky-800/25" />
                <div className="relative flex h-28 w-28 items-center justify-center rounded-[28px] border border-sky-100 bg-white/90 p-2 shadow-xl shadow-sky-200/60 dark:border-sky-900/60 dark:bg-gray-900 dark:shadow-black/20">
                  <img src="/images/peerprep-analytics-icon.png" alt="" className="h-full w-full object-contain" />
                </div>
              </div>
              <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">Select an assessment</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-gray-400">Choose a test from the list to explore performance, candidate outcomes, and integrity insights.</p>
            </div>
          </div>
        )}

        {activeTab === 'overview' && selectedAssessment && (
          <section className="mb-3 flex flex-col gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3 shadow-sm dark:border-sky-900/40 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">{selectedAssessment.title || 'Untitled assessment'}</h2>
                <StatusBadge value={selectedAssessment.lifecycleStatus || 'draft'} type="assessment" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-gray-500">
                <span>{selectedAssessment.assessmentType || selectedAssessment.testType || 'Mixed'}</span>
                <span aria-hidden="true">·</span>
                <span>ID {selectedAssessment.assessmentId || '—'}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-5 text-xs">
              <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Starts</div><div className="mt-0.5 font-semibold text-slate-700 dark:text-gray-200">{formatDateTime(selectedAssessment.startTime)}</div></div>
              <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Duration</div><div className="mt-0.5 font-semibold text-slate-700 dark:text-gray-200">{selectedAssessment.duration ? `${selectedAssessment.duration} min` : 'Not set'}</div></div>
            </div>
          </section>
        )}

        {/* ── KPI Cards ── */}
        {activeTab === 'overview' && selectedAssessment && (
          <div className="mb-4 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpiData.map((k, i) => <KpiCard key={k.label} {...k} delay={i * 50} />)}
          </div>
        )}

        {/* ── Compact performance insights ── */}
        {activeTab === 'overview' && selectedAssessment && (
          <section className="mb-3 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm lg:grid-cols-3 dark:border-gray-700 dark:bg-gray-700">
            <article className="flex min-h-44 flex-col bg-white dark:bg-gray-900">
              <header className="flex h-11 items-center justify-between border-b border-slate-100 px-4 dark:border-gray-800">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <TrendingUp className="h-3.5 w-3.5 text-sky-600" />Score distribution
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Candidates</span>
              </header>
              <div className="grid flex-1 grid-cols-5 items-end gap-2 px-4 pb-3 pt-4">
                {distributionLabels.map((label, index) => {
                  const count = Number(distributionData[index] || 0);
                  return (
                    <div key={label} className="flex min-w-0 flex-col items-center">
                      <strong className="mb-1 text-xs tabular-nums text-slate-900 dark:text-white">{count}</strong>
                      <div className="flex h-16 w-full max-w-10 items-end overflow-hidden rounded-t bg-slate-50 dark:bg-gray-800">
                        <div
                          className="w-full rounded-t bg-sky-500 transition-[height] duration-500"
                          style={{ height: `${count ? Math.max(10, (count / distributionMaximum) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="mt-1.5 truncate text-[9px] font-medium text-slate-400">{label}%</span>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="flex min-h-44 flex-col bg-white dark:bg-gray-900">
              <header className="flex h-11 items-center border-b border-slate-100 px-4 dark:border-gray-800">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <BarChart3 className="h-3.5 w-3.5 text-sky-600" />Score range
                </span>
              </header>
              <div className="grid flex-1 grid-cols-3 items-center divide-x divide-slate-100 px-2 dark:divide-gray-800">
                {[
                  ['Lowest', summary?.minScore],
                  ['Average', summary?.avgScore],
                  ['Highest', summary?.maxScore],
                ].map(([label, value]) => (
                  <div key={label} className="px-2 text-center">
                    <strong className="text-xl tabular-nums text-slate-950 dark:text-white">{Math.round(Number(value || 0) * 10) / 10}%</strong>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="flex min-h-44 flex-col bg-white dark:bg-gray-900">
              <header className="flex h-11 items-center justify-between border-b border-slate-100 px-4 dark:border-gray-800">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <Target className="h-3.5 w-3.5 text-lime-600" />Completion outcome
                </span>
                <strong className="text-xs text-lime-600 dark:text-lime-400">{overviewPassRate}% pass</strong>
              </header>
              <div className="flex flex-1 flex-col justify-center px-4 py-4">
                <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                  {overviewOutcomeTotal > 0 ? (
                    <>
                      <span className="h-full bg-lime-500" style={{ width: `${overviewPassRate}%` }} />
                      <span className="h-full flex-1 bg-sky-500" />
                    </>
                  ) : (
                    <span className="h-full w-full bg-slate-200 dark:bg-gray-700" />
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-lime-50 px-3 py-2 dark:bg-lime-900/15">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-lime-700 dark:text-lime-400">Passed</p>
                    <strong className="mt-0.5 block text-lg text-slate-950 dark:text-white">{overviewPassCount}</strong>
                  </div>
                  <div className="rounded-lg bg-sky-50 px-3 py-2 dark:bg-sky-900/15">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400">Needs review</p>
                    <strong className="mt-0.5 block text-lg text-slate-950 dark:text-white">{overviewReviewCount}</strong>
                  </div>
                </div>
              </div>
            </article>
          </section>
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
                    <span className="text-[10px] text-slate-500 dark:text-gray-400">{pagination.total || 0} flagged sessions</span>
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
                  {(mostFlaggedCandidate?.studentName || '?').trim().charAt(0).toUpperCase() || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Most flagged candidate</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-800 dark:text-gray-200">
                    {mostFlaggedCandidate?.studentName || 'No flagged candidate'}
                  </p>
                </div>
                {mostFlaggedCandidate && (
                  <span className="shrink-0 rounded-md bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700 dark:bg-sky-900/25 dark:text-sky-300">
                    {mostFlaggedCandidate.violationCount || 0} flags
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Active Filter Chips ── */}
        {activeChips.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />)}
            <button onClick={clearFilters} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">Clear all</button>
          </div>
        )}

        {activeTab === 'analytics' && (
          <CompilerAnalytics
            assessmentId={selectedAssessmentId}
            assessmentTitle={selectedAssessment?.title || ''}
            embedded
          />
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
                  {selectedAssessment && <span className="text-xs text-slate-400 dark:text-gray-500">- {selectedAssessment.title}</span>}
                  {activeTab === 'candidates' && (
                    <div className="relative w-full sm:ml-2 sm:w-64 sm:max-w-[40vw]">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={filters.studentQuery}
                        onChange={(e) => updateFilter('studentQuery', e.target.value)}
                        placeholder="Search name, ID or email"
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-600"
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
                        {Object.entries(visibleColumns).map(([key, visible]) => (
                          <label key={key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                            <input type="checkbox" checked={visible} onChange={() => setVisibleColumns((p) => ({ ...p, [key]: !p[key] }))} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <select value={pagination.limit} onChange={(e) => setPagination((p) => ({ ...p, page: 1, limit: Number(e.target.value) }))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
                  </select>
                </div>
              </div>

              <div className={activeTab === 'candidates' ? 'min-h-0 flex-1 overflow-auto' : 'overflow-x-auto'}>
                <table className="min-w-full text-left" style={{ '--serial-start': (pagination.page - 1) * pagination.limit }}>
                  <thead className={`${activeTab === 'candidates' ? 'sticky top-0 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(55,65,81,1)]' : ''} bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-gray-800 dark:text-gray-400`}>
                    <tr>
                      {visibleColumns.student && <SortHeader label="Candidate" sortKey="studentName" currentSort={sort} onSort={handleSort} />}
                      {visibleColumns.attemptDate && <SortHeader label="Attempted" sortKey="attemptDate" currentSort={sort} onSort={handleSort} />}
                      {visibleColumns.attempts && <SortHeader label="Tries" sortKey="attempts" currentSort={sort} onSort={handleSort} align="center" />}
                      {visibleColumns.score && <SortHeader label="Score" sortKey="score" currentSort={sort} onSort={handleSort} align="right" />}
                      {visibleColumns.accuracy && <SortHeader label="Accuracy" sortKey="accuracy" currentSort={sort} onSort={handleSort} align="center" />}
                      {visibleColumns.time && <SortHeader label="Time" sortKey="timeTakenSec" currentSort={sort} onSort={handleSort} align="right" />}
                      {visibleColumns.violations && <SortHeader label="Flags" sortKey="violationCount" currentSort={sort} onSort={handleSort} align="center" />}
                      {visibleColumns.status && <th className="px-4 py-3 text-center">Status</th>}
                      {visibleColumns.rank && <SortHeader label="Rank" sortKey="rank" currentSort={sort} onSort={handleSort} align="center" />}
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    ) : students.length === 0 ? (
                      <TableEmpty />
                    ) : (
                      students.map((row) => (
                        <TableRow
                          key={row._id}
                          row={row}
                          visibleColumns={visibleColumns}
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
                  Showing <span className="font-semibold text-slate-700 dark:text-gray-300">{students.length}</span> of{' '}
                  <span className="font-semibold text-slate-700 dark:text-gray-300">{pagination.total}</span> results
                </span>
                <div className="flex items-center gap-1.5">
                  <button type="button" disabled={pagination.page <= 1} onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                    <ArrowLeft className="h-3 w-3" />Prev
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                      let p;
                      if (totalPages <= 7) p = i + 1;
                      else if (pagination.page <= 4) p = i + 1;
                      else if (pagination.page >= totalPages - 3) p = totalPages - 6 + i;
                      else p = pagination.page - 3 + i;
                      return (
                        <button key={p} onClick={() => setPagination((prev) => ({ ...prev, page: p }))} className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${p === pagination.page ? 'bg-sky-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" disabled={pagination.page >= totalPages} onClick={() => setPagination((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                    Next<ArrowRight className="h-3 w-3" />
                  </button>
                </div>
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
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Excel Export Settings</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                  Choose the columns for the main candidate sheet. Section performance and proctoring logs will be added as separate sheets when data exists.
                </p>
              </div>
              <button onClick={() => setShowExportModal(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Close</button>
            </div>
            <div className="px-5 py-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button onClick={() => setAllExportColumns(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Select All</button>
                <button onClick={() => setAllExportColumns(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Unselect All</button>
                <button onClick={saveExportPreferences} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/30">Save Preferred Export Settings</button>
              </div>
              <div className="grid max-h-[420px] gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-gray-700">
                {loadingExportMeta ? (
                  <div className="col-span-full py-8 text-center text-xs text-slate-500 dark:text-gray-400">
                    Loading available fields from the selected assessment...
                  </div>
                ) : visibleExportDefs.length ? visibleExportDefs.map(({ key, label }) => (
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
                <button onClick={handlePdfExport} disabled={exportingExcel || loadingExportMeta || !visibleExportDefs.some(({ key }) => exportColumns[key])} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">PDF</button>
                <button onClick={handleCsvExport} disabled={exportingExcel || loadingExportMeta || !visibleExportDefs.some(({ key }) => exportColumns[key])} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">CSV</button>
                <button onClick={handleExcelExport} disabled={exportingExcel || loadingExportMeta || !visibleExportDefs.some(({ key }) => exportColumns[key])} className="inline-flex items-center gap-1 rounded-lg bg-lime-600 px-4 py-2 text-xs font-semibold text-white hover:bg-lime-500 disabled:opacity-60">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {exportingExcel ? 'Preparing Excel...' : 'Download Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReportDetailDrawer
        student={selectedStudent}
        loading={detailLoading}
        data={detailData}
        onClose={() => { setSelectedStudent(null); setDetailData(null); }}
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
