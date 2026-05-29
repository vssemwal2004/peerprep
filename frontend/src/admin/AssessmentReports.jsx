import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import DateTimePicker from '../components/DateTimePicker';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Calendar, CheckCircle2, ChevronDown, Clock, Download, FileSpreadsheet, Filter,
  GraduationCap, Layers, LayoutDashboard, RotateCcw, Save, Search,
  ShieldAlert, SlidersHorizontal, Sparkles, Target, TrendingUp, Users, X,
} from 'lucide-react';
import { AreaChart, Heatmap, PieChart, Sparkline, MiniBarChart } from './reports/ReportCharts';
import {
  TrendBadge, StatusBadge, KpiCard, FilterChip, SortHeader,
  AssessmentListItem, TableEmpty, TableRow, SkeletonRow,
  formatDuration, formatDateTime,
} from './reports/ReportComponents';
import ReportDetailDrawer from './reports/ReportDetailDrawer';
import ReportViolationModal from './reports/ReportViolationModal';

const PAGE_SIZES = [25, 50, 100, 250];

const tabsConfig = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'candidates', label: 'Candidates', icon: GraduationCap },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
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

function YearlyAssessmentActivity({ calendar = [], monthly = [], onSelectAssessment }) {
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
  const searchRef = useRef(null);

  /* View state */
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');

  /* Filters */
  const [filters, setFilters] = useState({
    assessmentId: '', assessmentType: '', studentQuery: '', status: '',
    createdBy: '', tag: '', department: '', difficulty: '',
    from: '', to: '', scoreMin: '', scoreMax: '',
    completionRateMin: '', completionRateMax: '', attemptsMin: '', attemptsMax: '',
    assessmentWindow: 'all',
  });
  const [assessmentSearch, setAssessmentSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState({ scope: true, schedule: true, list: false });
  const [showFilters, setShowFilters] = useState(false);
  const [savedFilterName, setSavedFilterName] = useState('');
  const [savedFilters, setSavedFilters] = useState(() => {
    try { return JSON.parse(localStorage.getItem('peerprep_report_filters') || '[]'); }
    catch { return []; }
  });

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const proctoringRows = Array.isArray(payload?.proctoringRows) ? payload.proctoringRows : [];
      const summary = payload?.summary || {};

      if (!rows.length) {
        toast.error('No candidate report data found for the selected assessment and filters.');
        return;
      }

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      const selectedTitle = selectedAssessment?.title || 'All Assessments';
      const reportHeader = [
        ['PeerPrep Assessment Analytics Report'],
        ['Assessment', selectedTitle],
        ['Generated At', formatDateTime(payload?.generatedAt)],
        ['Filters', Object.entries(exportParams).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' | ') || 'None'],
        [],
      ];
      const candidateRows = rows.map((row) => Object.fromEntries(
        selectedDefs.map(({ key, label }) => [label, buildExportValue(row, key)]),
      ));
      const candidateSheet = XLSX.utils.aoa_to_sheet(reportHeader);
      XLSX.utils.sheet_add_json(candidateSheet, candidateRows, { origin: 'A6' });
      candidateSheet['!autofilter'] = { ref: candidateSheet['!ref'] || 'A1' };
      candidateSheet['!freeze'] = { xSplit: 0, ySplit: 6 };
      candidateSheet['!cols'] = selectedDefs.map(({ key, label }) => {
        const maxValueLength = Math.max(
          label.length,
          ...candidateRows.map((row) => String(row[label] ?? '').length),
        );
        if (['sectionScores', 'sectionPerformance', 'proctoringFlags', 'userAgent', 'securityHeartbeat', 'location'].includes(key)) {
          return { wch: Math.min(48, Math.max(18, maxValueLength)) };
        }
        return { wch: Math.min(28, Math.max(14, maxValueLength)) };
      });
      XLSX.utils.book_append_sheet(workbook, candidateSheet, 'Candidates');

      const summarySheetRows = [
        { Metric: 'Generated At', Value: formatDateTime(payload?.generatedAt) },
        { Metric: 'Total Assessments', Value: summary.totalAssessments || 0 },
        { Metric: 'Total Candidates', Value: summary.totalCandidates || 0 },
        { Metric: 'Average Score', Value: summary.avgScore || 0 },
        { Metric: 'Max Score', Value: summary.maxScore || 0 },
        { Metric: 'Min Score', Value: summary.minScore || 0 },
        { Metric: 'Pass Count', Value: summary.passCount || 0 },
        { Metric: 'Fail Count', Value: summary.failCount || 0 },
        { Metric: 'Violation Count', Value: summary.violationCount || 0 },
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet([
        ['PeerPrep Assessment Report Summary'],
        ['Assessment', selectedTitle],
        [],
      ]);
      XLSX.utils.sheet_add_json(summarySheet, summarySheetRows, { origin: 'A4' });
      summarySheet['!cols'] = [{ wch: 24 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      if (sectionRows.length) {
        const sectionSheet = XLSX.utils.json_to_sheet(sectionRows);
        sectionSheet['!autofilter'] = { ref: sectionSheet['!ref'] || 'A1' };
        sectionSheet['!cols'] = Object.keys(sectionRows[0] || {}).map((key) => ({ wch: key.includes('Name') ? 24 : 16 }));
        XLSX.utils.book_append_sheet(workbook, sectionSheet, 'Section Performance');
      }

      if (proctoringRows.length) {
        const proctoringSheet = XLSX.utils.json_to_sheet(proctoringRows);
        proctoringSheet['!autofilter'] = { ref: proctoringSheet['!ref'] || 'A1' };
        proctoringSheet['!cols'] = Object.keys(proctoringRows[0] || {}).map((key) => (
          { wch: key === 'meta' ? 40 : key === 'message' ? 36 : 18 }
        ));
        XLSX.utils.book_append_sheet(workbook, proctoringSheet, 'Proctoring Logs');
      }

      const dateStamp = new Date().toISOString().slice(0, 10);
      const safeAssessmentName = selectedTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'all-assessments';
      XLSX.writeFile(workbook, `assessment-report-${safeAssessmentName}-${dateStamp}.xlsx`);
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

  /* ── Saved filters ── */
  const saveCurrentFilter = useCallback(() => {
    if (!savedFilterName.trim()) return;
    const next = [...savedFilters, { name: savedFilterName.trim(), filters: { ...filters }, createdAt: Date.now() }];
    setSavedFilters(next);
    localStorage.setItem('peerprep_report_filters', JSON.stringify(next));
    setSavedFilterName('');
    toast.success('Filter saved');
  }, [savedFilters, savedFilterName, filters, toast]);

  const applySavedFilter = useCallback((saved) => {
    setFilters((prev) => ({ ...prev, ...saved.filters }));
    setPagination((p) => ({ ...p, page: 1 }));
    toast.info(`Applied: ${saved.name}`);
  }, [toast]);

  const removeSavedFilter = useCallback((index) => {
    const next = savedFilters.filter((_, i) => i !== index);
    setSavedFilters(next);
    localStorage.setItem('peerprep_report_filters', JSON.stringify(next));
  }, [savedFilters]);

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
        icon: Users, label: 'Total Assessments', value: summary?.totalAssessments || allAssessments.length || assessments.length || 0,
        insight: allAssessments.length ? `${allAssessments.length} published assessments` : undefined,
        trend: s.assessmentGrowth, tone: 'sky',
        chart: Array.isArray(s.assessmentTrend) && s.assessmentTrend.length > 1 ? <Sparkline data={s.assessmentTrend} stroke="#0ea5e9" /> : null,
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
  }, [summary, allAssessments.length, assessments, pagination.total, activeTab, students]);

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

  // Compute attempt trend from student submission dates (last 10 days)
  const attemptTrend = useMemo(() => {
    const trend = summary?.attemptTrend;
    if (Array.isArray(trend) && trend.length > 0) return trend;
    // Compute from student attemptDate
    const dateMap = new Map();
    students.forEach((st) => {
      const date = st.attemptDate ? new Date(st.attemptDate).toISOString().slice(0, 10) : null;
      if (date) dateMap.set(date, (dateMap.get(date) || 0) + 1);
    });
    const sorted = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
    if (sorted.length === 0) return [];
    return sorted.map(([, count]) => count);
  }, [summary, students]);

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

  // Compute violation trend from student data (last 10 days)
  const violationTrend = useMemo(() => {
    const trend = summary?.violationTrend;
    if (Array.isArray(trend) && trend.length > 0 && trend.some(v => v > 0)) return trend;

    // Fallback: compute from student data
    const dateMap = new Map();
    students.forEach((st) => {
      const date = st.attemptDate ? new Date(st.attemptDate).toISOString().slice(0, 10) : null;
      const vCount = Number(st.violationCount) || 0;
      if (date && vCount > 0) dateMap.set(date, (dateMap.get(date) || 0) + vCount);
    });
    const sorted = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
    if (sorted.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
    return sorted.map(([, count]) => count);
  }, [summary?.violationTrend, students]);

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
      });
  }, [allAssessments, assessments, assessmentSearch, filters.assessmentWindow]);

  const assessmentWindowTabs = useMemo(() => {
    const now = Date.now();
    const source = allAssessments.length ? allAssessments : assessments;
    const counts = source.reduce((acc, assessment) => {
      const start = assessment.startTime ? new Date(assessment.startTime).getTime() : null;
      const end = assessment.endTime ? new Date(assessment.endTime).getTime() : null;
      const bucket = assessment.lifecycleBucket || (start && start > now ? 'upcoming' : end && end < now ? 'completed' : 'current');
      acc.all += 1;
      if (bucket === 'current') acc.current += 1;
      if (bucket === 'upcoming') acc.upcoming += 1;
      if (bucket === 'completed') acc.completed += 1;
      return acc;
    }, { all: 0, current: 0, upcoming: 0, completed: 0 });
    return [
      { id: 'all', label: 'All Assessments', count: counts.all, icon: Layers },
      { id: 'current', label: 'Current Assessments', count: counts.current, icon: Activity },
      { id: 'upcoming', label: 'Upcoming Assessments', count: counts.upcoming, icon: Clock },
      { id: 'completed', label: 'Completed Assessments', count: counts.completed, icon: CheckCircle2 },
    ];
  }, [allAssessments, assessments]);
  const activeAssessmentWindowTab = useMemo(
    () => assessmentWindowTabs.find((tab) => tab.id === filters.assessmentWindow) || assessmentWindowTabs[0],
    [assessmentWindowTabs, filters.assessmentWindow],
  );
  const ActiveAssessmentWindowIcon = activeAssessmentWindowTab?.icon || Layers;

  const subjectPerformanceRows = useMemo(() => (
    (summary?.subjectPerformance || assessments || []).slice(0, 6).map((item) => ({
      label: item.title || item.subject || item.assessmentType || 'Assessment',
      value: Number(item.avgScore || item.score || item.attempted || 0),
    }))
  ), [summary?.subjectPerformance, assessments]);

  const heatmapRows = useMemo(() => {
    const byAssessment = assessmentSidebarItems.slice(0, 5).map((assessment) => ({
      label: assessment.title || 'Untitled',
      values: [
        Number(assessment.submissionCount || assessment.attempts || 0),
        Number(assessment.completedCount || assessment.submissions || 0),
        Number(assessment.violationCount || 0),
        Number(assessment.avgScore || 0),
        Number(assessment.totalQuestions || 0),
        Number(assessment.duration || 0),
        Number(assessment.maxScore || 0),
      ],
    }));
    return byAssessment;
  }, [assessmentSidebarItems]);

  const yearlyActivity = useMemo(
    () => Array.isArray(summary?.assessmentCalendar) ? summary.assessmentCalendar : [],
    [summary?.assessmentCalendar],
  );

  const monthlyActivity = useMemo(
    () => Array.isArray(summary?.monthlyAssessments) ? summary.monthlyAssessments : [],
    [summary?.monthlyAssessments],
  );

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit));

  const assessmentRail = (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-950/5 dark:border-sky-900/40 dark:bg-gray-900">
      <div className="shrink-0 border-b border-sky-100 px-4 py-4 dark:border-sky-900/40">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Report Scope</div>
            <h2 className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">Assessments</h2>
          </div>
          <span className="rounded-full bg-lime-50 px-2.5 py-1 text-[11px] font-semibold text-lime-700 ring-1 ring-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:ring-lime-800">
            {allAssessments.length || assessments.length}
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 dark:border-gray-800 dark:bg-gray-950/40">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => ({ ...prev, scope: !prev.scope }))}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ActiveAssessmentWindowIcon className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-800 dark:text-gray-100">
                  {activeAssessmentWindowTab?.label || 'All Assessments'}
                </span>
                <span className="block text-[10px] font-medium text-slate-400 dark:text-gray-500">Assessment filters</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {activeAssessmentWindowTab?.count ?? 0}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${sidebarCollapsed.scope ? '-rotate-90' : ''}`} />
            </span>
          </button>

          {!sidebarCollapsed.scope && (
            <div className="border-t border-slate-200 p-2 dark:border-gray-800">
              <div className="grid gap-2">
                {assessmentWindowTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = filters.assessmentWindow === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => updateFilter('assessmentWindow', tab.id)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                        active
                          ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-900/25 dark:text-sky-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-sky-800 dark:hover:bg-sky-900/10'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-sky-600 dark:text-sky-300' : 'text-slate-400'}`} />
                        <span className="truncate">{tab.label}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-sky-600 text-white' : 'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assessments"
                  value={assessmentSearch}
                  onChange={(e) => setAssessmentSearch(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/40"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-sky-100 px-4 py-3 dark:border-sky-900/40">
        <button
          type="button"
          onClick={() => setSidebarCollapsed((prev) => ({ ...prev, schedule: !prev.schedule }))}
          className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400"
        >
          Date Range
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed.schedule ? '-rotate-90' : ''}`} />
        </button>
        {!sidebarCollapsed.schedule && (
          <div className="mt-3 space-y-2">
            <DateTimePicker
              value={filters.from}
              onChange={(v) => setFilters((p) => ({ ...p, from: v }))}
              placeholder="From date"
              autoSelectToday={false}
              allowPast
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
            />
            <DateTimePicker
              value={filters.to}
              onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
              placeholder="To date"
              autoSelectToday={false}
              allowPast
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400">Directory</span>
          <button
            type="button"
            onClick={() => updateFilter('assessmentId', '')}
            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-300"
          >
            All
          </button>
        </div>

        <div className="space-y-2">
          {loading && !assessments.length ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-gray-800" />
            ))
          ) : assessmentSidebarItems.length ? (
            assessmentSidebarItems.map((a) => {
              const active = String(a._id) === String(selectedAssessmentId);
              return (
                <button
                  key={a._id}
                  type="button"
                  onClick={() => selectAssessmentReport(a, { openOverview: false })}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-sky-300 bg-sky-50 text-sky-950 ring-1 ring-sky-100 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-100 dark:ring-sky-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50/50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-sky-800'
                  }`}
                >
                  <div className="truncate text-xs font-semibold">{a.title || 'Untitled'}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-gray-400">
                    <span className="rounded bg-lime-50 px-1.5 py-0.5 font-semibold text-lime-700 dark:bg-lime-900/20 dark:text-lime-300">{a.assessmentType || 'mixed'}</span>
                    <span>{a.totalQuestions || 0} Qs</span>
                    <span>{a.submissionCount || 0} attempts</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, Math.max(0, Number(a.avgScore || 0)))}%` }} />
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400">
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm shadow-sky-200 dark:shadow-none">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-950 dark:text-white">Assessment Reports</h1>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                {pagination.total || 0} candidate records across {allAssessments.length || assessments.length} assessments
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={filters.studentQuery}
                  onChange={(e) => updateFilter('studentQuery', e.target.value)}
                  placeholder="Search candidates..."
                  className="h-9 w-56 rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none ring-sky-200 transition-all placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:ring-sky-900"
                />
              </div>

              <div className="relative">
                <select
                  value={filters.assessmentId || ''}
                  onChange={(e) => updateFilter('assessmentId', e.target.value)}
                  className="h-9 w-48 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs text-slate-700 outline-none ring-sky-200 transition-all focus:border-sky-400 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-900"
                >
                  <option value="">All Assessments</option>
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters((p) => !p)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                  showFilters || activeChips.length
                    ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filters</span>
                {activeChips.length > 0 && (
                  <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sky-600 text-[9px] font-bold text-white">
                    {activeChips.length}
                  </span>
                )}
              </button>

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
            </div>
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

      <div className="mx-auto grid h-[calc(100vh-113px)] max-w-[1600px] grid-cols-1 gap-4 overflow-hidden px-4 py-4 sm:px-6 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 lg:block">
          {assessmentRail}
        </aside>

        <main className="min-h-0 overflow-y-auto pr-1">
        {/* ── KPI Cards ── */}
        {(activeTab === 'overview' || activeTab === 'analytics') && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpiData.map((k, i) => <KpiCard key={k.label} {...k} delay={i * 50} />)}
          </div>
        )}

        {/* Charts Row */}
        {(activeTab === 'overview' || activeTab === 'analytics') && (
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <TrendingUp className="h-4 w-4 text-sky-600" />Score Distribution
                </div>
                <span className="text-[10px] text-slate-400 dark:text-gray-500">% of candidates</span>
              </div>
              <div className="mt-4"><MiniBarChart data={distributionData} labels={distributionLabels} width={320} height={60} barColor="#0ea5e9" /></div>
              <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                {distributionLabels.map((l, i) => (
                  <div key={l}>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{distributionData[i]}</div>
                    <div className="text-[10px] text-slate-400 dark:text-gray-500">{l}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <BarChart3 className="h-4 w-4 text-lime-600" />Attempt Trends
              </div>
              <div className="mt-4"><Sparkline data={attemptTrend} width={320} height={70} stroke="#84cc16" fill="rgba(132,204,22,0.08)" strokeWidth={2} /></div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                <span>Last {attemptTrend.length} days</span>
                <span className="font-semibold text-lime-600 dark:text-lime-400">{attemptTrend.length > 1 ? `${((attemptTrend[attemptTrend.length - 1] - attemptTrend[0]) / Math.max(1, attemptTrend[0]) * 100).toFixed(0)}%` : ''}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <GraduationCap className="h-4 w-4 text-lime-600" />Top Performing
              </div>
              <div className="mt-4 space-y-3">
                {(summary?.topAssessments || assessments.slice(0, 5)).map((a, i) => (
                  <div key={a._id || i} className="flex items-center gap-3">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${i < 3 ? 'bg-lime-50 text-lime-700 dark:bg-lime-900/20 dark:text-lime-300' : 'bg-slate-50 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{i + 1}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-800 dark:text-gray-200">{a.title || 'Untitled'}</div></div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{a.avgScore?.toFixed?.(0) || a.attempted || 0}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {(activeTab === 'overview' || activeTab === 'analytics') && (
          <div className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Activity className="h-4 w-4 text-sky-600" />
                  Real-time Activity
                </div>
                <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">Live trend</span>
              </div>
              <div className="mt-4">
                <AreaChart data={attemptTrend} stroke="#0ea5e9" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Target className="h-4 w-4 text-lime-600" />
                Completion Outcome
              </div>
              <div className="mt-4 flex items-center gap-4">
                <PieChart
                  data={[
                    { label: 'Pass', value: Number(summary?.passCount || 0) },
                    { label: 'Needs review', value: Number(summary?.failCount || 0) },
                  ]}
                  colors={['#84cc16', '#0ea5e9']}
                />
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-gray-300"><span className="h-2.5 w-2.5 rounded-full bg-lime-500" />Pass: {summary?.passCount || 0}</div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-gray-300"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Needs review: {summary?.failCount || 0}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <BarChart3 className="h-4 w-4 text-sky-600" />
                Subject-wise Performance
              </div>
              <div className="mt-4 space-y-3">
                {subjectPerformanceRows.map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="max-w-[180px] truncate font-semibold text-slate-600 dark:text-gray-300">{row.label}</span>
                      <span className="font-bold text-slate-900 dark:text-white">{Number(row.value || 0).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-lime-400" style={{ width: `${Math.min(100, Number(row.value || 0))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Violations Charts Row ── */}
        {activeTab === 'violations' && (
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <ShieldAlert className="h-4 w-4 text-sky-600" />Violation Types
                </div>
                <span className="text-[10px] text-slate-400 dark:text-gray-500">by category</span>
              </div>
              <div className="mt-4"><MiniBarChart data={violationData} labels={violationLabels.map(l => l.split(' ')[0])} width={320} height={60} barColor="#0ea5e9" /></div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                {violationLabels.map((l, i) => (
                  <div key={l}>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{violationData[i]}</div>
                    <div className="text-[10px] text-slate-400 dark:text-gray-500">{l.split(' ')[0]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <BarChart3 className="h-4 w-4 text-sky-600" />Violation Trend
              </div>
              <div className="mt-4"><Sparkline data={violationTrend} width={320} height={70} stroke="#0ea5e9" fill="rgba(14,165,233,0.08)" strokeWidth={2} /></div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                <span>Last {violationTrend.length} days</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400">{violationTrend.length > 1 ? `${((violationTrend[violationTrend.length - 1] - violationTrend[0]) / Math.max(1, violationTrend[0]) * 100).toFixed(0)}%` : ''}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <GraduationCap className="h-4 w-4 text-sky-600" />Top Violators
              </div>
              <div className="mt-4 space-y-3">
                {(summary?.topViolators || []).slice(0, 5).map((v, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${i < 3 ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300' : 'bg-slate-50 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{i + 1}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-800 dark:text-gray-200">{v.studentName || 'Unknown'}</div></div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{v.violationCount || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Filter Panel ── */}
        {showFilters && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-500">
                <Filter className="h-3.5 w-3.5" />Advanced Filters
              </div>
              <button onClick={clearFilters} className="text-[11px] font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400">Reset all</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <select value={filters.assessmentType} onChange={(e) => updateFilter('assessmentType', e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <option value="">All Types</option>
                <option value="mcq">MCQ</option>
                <option value="short">Short Answer</option>
                <option value="one_line">One Line</option>
                <option value="coding">Coding</option>
                <option value="mixed">Mixed</option>
              </select>
              <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <option value="">All Statuses</option>
                <option value="submitted">Completed</option>
                <option value="violation">Violation</option>
                <option value="in_progress">In Progress</option>
                <option value="expired">Expired</option>
                <option value="incomplete">Incomplete</option>
              </select>
              <select value={filters.difficulty} onChange={(e) => updateFilter('difficulty', e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <option value="">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <input value={filters.department} onChange={(e) => updateFilter('department', e.target.value)} placeholder="Department" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
              <DateTimePicker value={filters.from} onChange={(iso) => updateFilter('from', iso)} placeholder="From Date" className="text-xs" autoSelectToday={false} allowPast />
              <DateTimePicker value={filters.to} onChange={(iso) => updateFilter('to', iso)} min={filters.from || undefined} placeholder="To Date" className="text-xs" autoSelectToday={false} allowPast />
              <input type="number" value={filters.scoreMin} onChange={(e) => updateFilter('scoreMin', e.target.value)} placeholder="Min Score %" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
              <input type="number" value={filters.scoreMax} onChange={(e) => updateFilter('scoreMax', e.target.value)} placeholder="Max Score %" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
            </div>

            {savedFilters.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-gray-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">Saved:</span>
                {savedFilters.map((sf, i) => (
                  <button key={i} onClick={() => applySavedFilter(sf)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 transition-colors hover:border-sky-200 hover:bg-sky-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-800 dark:hover:bg-sky-900/20">
                    <Sparkles className="h-3 w-3 text-lime-500" />{sf.name}
                    <span onClick={(e) => { e.stopPropagation(); removeSavedFilter(i); }} className="ml-0.5 cursor-pointer rounded p-0.5 hover:bg-slate-200 dark:hover:bg-gray-700"><SlidersHorizontal className="h-3 w-3" /></span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <input value={savedFilterName} onChange={(e) => setSavedFilterName(e.target.value)} placeholder="Save current filters..." className="h-8 w-48 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" onKeyDown={(e) => e.key === 'Enter' && saveCurrentFilter()} />
              <button onClick={saveCurrentFilter} disabled={!savedFilterName.trim()} className="inline-flex h-8 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-40 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/30">
                <Save className="h-3 w-3" />Save
              </button>
            </div>
          </div>
        )}

        {/* ── Active Filter Chips ── */}
        {activeChips.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />)}
            <button onClick={clearFilters} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">Clear all</button>
          </div>
        )}

        {/* ══════════════════════ MAIN CONTENT ══════════════════════ */}
        {activeTab === 'analytics' && (
          <div className="mb-6 space-y-4">
            <YearlyAssessmentActivity
              calendar={yearlyActivity}
              monthly={monthlyActivity}
              onSelectAssessment={selectAssessmentReport}
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Assessment Health Matrix</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Attempts, completion, violations, score, questions, duration, and peak score by assessment.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-300">Dynamic signals</span>
              </div>
              {heatmapRows.length ? (
                <Heatmap rows={heatmapRows} />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400 dark:border-gray-700 dark:bg-gray-800/40">
                  No assessment signal data is available for the selected filters yet.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => ({ ...prev, scope: !prev.scope }))}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ActiveAssessmentWindowIcon className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
              <span className="truncate text-xs font-bold text-slate-800 dark:text-gray-100">
                {activeAssessmentWindowTab?.label || 'All Assessments'}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {activeAssessmentWindowTab?.count ?? 0}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${sidebarCollapsed.scope ? '-rotate-90' : ''}`} />
            </span>
          </button>
          {!sidebarCollapsed.scope && (
            <div className="grid gap-2 border-t border-slate-200 p-2 dark:border-gray-800">
              {assessmentWindowTabs.map((tab) => {
                const Icon = tab.icon;
                const active = filters.assessmentWindow === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => updateFilter('assessmentWindow', tab.id)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${active ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    <span className={active ? 'text-sky-600 dark:text-sky-300' : 'text-slate-400'}>{tab.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="block">
          {/* ── Professional Assessment Sidebar ── */}
          <div className="hidden">
            <div className="sticky top-[136px] max-h-[calc(100vh-160px)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-lg shadow-slate-200/50 backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-900/90 dark:shadow-gray-900/50">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-white">Assessments</span>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-400">
                  {allAssessments.length || assessments.length}
                </span>
              </div>

              <div className="mb-4 grid gap-2">
                {assessmentWindowTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = filters.assessmentWindow === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => updateFilter('assessmentWindow', tab.id)}
                      className={`group flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all duration-300 ${
                        active
                          ? 'border-sky-200 bg-sky-50 text-sky-800 shadow-sm shadow-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200'
                          : 'border-transparent bg-slate-50/70 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-bold">
                        <Icon className={`h-3.5 w-3.5 ${active ? 'text-sky-600 dark:text-sky-300' : 'text-slate-400 group-hover:text-sky-500'}`} />
                        {tab.label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 dark:bg-gray-900 dark:text-gray-400'}`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Filter */}
              <div className="mb-3 relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assessments..."
                  value={assessmentSearch}
                  onChange={(e) => setAssessmentSearch(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
                />
              </div>

              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => ({ ...prev, schedule: !prev.schedule }))}
                className="mb-2 flex w-full items-center justify-between rounded-lg px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                Quick date filters
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed.schedule ? '-rotate-90' : ''}`} />
              </button>
              {!sidebarCollapsed.schedule && <div className="mb-4 space-y-2">
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <DateTimePicker
                    value={filters.from}
                    onChange={(v) => setFilters((p) => ({ ...p, from: v }))}
                    placeholder="From date"
                    autoSelectToday={false}
                    allowPast
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <DateTimePicker
                    value={filters.to}
                    onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
                    placeholder="To date"
                    autoSelectToday={false}
                    allowPast
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
                  />
                </div>
              </div>}

              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => ({ ...prev, list: !prev.list }))}
                className="mb-2 flex w-full items-center justify-between rounded-lg px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400"
              >
                Assessment directory
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed.list ? '-rotate-90' : ''}`} />
              </button>

              {/* Assessment List */}
              {!sidebarCollapsed.list && <div className="space-y-2">
                {loading && !assessments.length ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-gradient-to-r from-slate-100 to-slate-50 dark:from-gray-800 dark:to-gray-800/50" />
                  ))
                ) : (
                  assessmentSidebarItems.map((a) => (
                    <button
                      key={a._id}
                      onClick={() => selectAssessmentReport(a, { openOverview: false })}
                      className={`group relative flex w-full flex-col gap-2.5 rounded-xl border p-3.5 text-left transition-all duration-300 ease-out ${
                        String(a._id) === String(selectedAssessmentId)
                          ? 'border-sky-300 bg-gradient-to-br from-sky-50 to-blue-50/50 shadow-md shadow-sky-100/50 dark:border-sky-600/50 dark:from-sky-900/20 dark:to-blue-900/10 dark:shadow-sky-900/20'
                          : 'border-slate-100/80 bg-white/80 hover:border-sky-200 hover:bg-gradient-to-br hover:from-slate-50 hover:to-sky-50/30 hover:shadow-md hover:shadow-slate-200/30 hover:-translate-y-0.5 dark:border-gray-800 dark:bg-gray-900/80 dark:hover:border-sky-800 dark:hover:from-gray-800 dark:hover:to-sky-900/10 dark:hover:shadow-gray-900/30'
                      }`}
                    >
                      {/* Active indicator */}
                      {String(a._id) === String(selectedAssessmentId) && (
                        <div className="absolute -left-0.5 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-sky-400 to-blue-500" />
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-800 group-hover:text-sky-700 dark:text-gray-200 dark:group-hover:text-sky-300 transition-colors">
                            {a.title || 'Untitled'}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-gray-500">
                            <span className="rounded bg-slate-100 px-1 py-0.5 font-medium dark:bg-gray-800">{a.assessmentType || 'N/A'}</span>
                            <span>-</span>
                            <span>{a.totalQuestions || 0} Qs</span>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          a.lifecycleStatus === 'published'
                            ? 'bg-lime-50 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300'
                            : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                        }`}>
                          {a.lifecycleStatus || 'draft'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-gray-500">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span className="font-semibold text-slate-700 dark:text-gray-300">{a.submissionCount || 0}</span>
                          <span>attempts</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          <span className="font-semibold text-slate-700 dark:text-gray-300">
                            {a.avgScore ? `${Number(a.avgScore).toFixed(1)}%` : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {Array.isArray(a.trend) && a.trend.length > 1 && (
                        <div className="h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:h-6 group-hover:opacity-100">
                          <Sparkline
                            data={a.trend}
                            width={220}
                            height={20}
                            stroke={String(a._id) === String(selectedAssessmentId) ? '#0ea5e9' : '#94a3b8'}
                            strokeWidth={1.5}
                          />
                        </div>
                      )}
                    </button>
                  ))
                )}
                {!loading && !assessmentSidebarItems.length && (
                  <div className="py-8 text-center">
                    <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-gray-600" />
                    <p className="mt-2 text-xs text-slate-400 dark:text-gray-500">No assessments found</p>
                  </div>
                )}
              </div>}
            </div>
          </div>

          {/* ── Data Table ── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-sky-600" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeTab === 'violations' ? 'Flagged Sessions' : 'Candidate Performance'}
                  </span>
                  {selectedAssessment && <span className="text-xs text-slate-400 dark:text-gray-500">- {selectedAssessment.title}</span>}
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

              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3">#</th>
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
                      students.map((row, idx) => (
                        <TableRow
                          key={row._id}
                          row={row}
                          idx={idx}
                          pagination={pagination}
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

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-gray-700">
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
