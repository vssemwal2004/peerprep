import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import DateTimePicker from '../components/DateTimePicker';
import {
  ArrowLeft, ArrowRight, BarChart3, Calendar, Download, Filter,
  GraduationCap, Layers, LayoutDashboard, RotateCcw, Save, Search,
  ShieldAlert, SlidersHorizontal, Sparkles, TrendingUp, Users, X,
} from 'lucide-react';
import { Sparkline, MiniBarChart } from './reports/ReportCharts';
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
  });
  const [showFilters, setShowFilters] = useState(false);
  const [savedFilterName, setSavedFilterName] = useState('');
  const [savedFilters, setSavedFilters] = useState(() => {
    try { return JSON.parse(localStorage.getItem('peerprep_report_filters') || '[]'); }
    catch { return []; }
  });

  /* Data */
  const [assessments, setAssessments] = useState([]);
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

  const selectedAssessment = useMemo(
    () => assessments.find((a) => String(a._id) === String(selectedAssessmentId)),
    [assessments, selectedAssessmentId]
  );

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

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
        console.log('Reports data:', data); // Debug log
        // Handle different data structures
        const assessments = data.assessments || data || [];
        const students = data.students || data.reports || [];
        const summary = data.summary || data.analytics || {};
        const total = data.pagination?.total || data.total || 0;
        setAssessments(Array.isArray(assessments) ? assessments : []);
        setStudents(Array.isArray(students) ? students : []);
        setSummary(summary);
        setPagination((prev) => ({ ...prev, total }));
        if (!selectedAssessmentId && assessments.length > 0) {
          setSelectedAssessmentId(assessments[0]._id || assessments[0].id);
        }
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
    if (!assessments.length) {
      if (selectedAssessmentId) setSelectedAssessmentId('');
      return;
    }
    const selectedStillExists = assessments.some((a) => String(a._id) === String(selectedAssessmentId));
    if (!selectedStillExists) {
      const nextId = assessments[0]?._id || '';
      setSelectedAssessmentId(nextId);
      setFilters((prev) => ({ ...prev, assessmentId: nextId }));
    }
  }, [assessments, selectedAssessmentId]);

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
    setExportColumns(Object.fromEntries(EXPORT_COLUMN_DEFS.map(({ key }) => [key, checked])));
  }, []);

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
    const selectedDefs = EXPORT_COLUMN_DEFS.filter(({ key }) => exportColumns[key]);
    if (!selectedDefs.length) {
      toast.error('Select at least one column for Excel export.');
      return;
    }

    setExportingExcel(true);
    try {
      const exportParams = { ...filters };
      if (selectedAssessmentId) exportParams.assessmentId = selectedAssessmentId;
      const payload = await api.getAssessmentReportsExportData(exportParams);
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const sectionRows = Array.isArray(payload?.sectionRows) ? payload.sectionRows : [];
      const proctoringRows = Array.isArray(payload?.proctoringRows) ? payload.proctoringRows : [];
      const summary = payload?.summary || {};

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

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
      const summarySheet = XLSX.utils.json_to_sheet(summarySheetRows);
      summarySheet['!cols'] = [{ wch: 24 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      const candidateRows = rows.map((row) => Object.fromEntries(
        selectedDefs.map(({ key, label }) => [label, buildExportValue(row, key)]),
      ));
      const candidateSheet = XLSX.utils.json_to_sheet(candidateRows);
      candidateSheet['!autofilter'] = { ref: candidateSheet['!ref'] || 'A1' };
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
      XLSX.writeFile(workbook, `assessment-report-${dateStamp}.xlsx`);
      setShowExportModal(false);
      toast.success('Excel exported successfully');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error(err.message || 'Excel export failed');
    } finally {
      setExportingExcel(false);
    }
  }, [api, buildExportValue, exportColumns, filters, selectedAssessmentId, toast]);

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
    });
    setSelectedAssessmentId('');
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  /* ── Active chips ── */
  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.assessmentId) {
      const a = assessments.find((x) => String(x._id) === String(filters.assessmentId));
      chips.push({ key: 'assessmentId', label: `Assessment: ${a?.title || filters.assessmentId}`, clear: () => updateFilter('assessmentId', '') });
    }
    if (filters.assessmentType) chips.push({ key: 'assessmentType', label: `Type: ${filters.assessmentType}`, clear: () => updateFilter('assessmentType', '') });
    if (filters.status) chips.push({ key: 'status', label: `Status: ${filters.status}`, clear: () => updateFilter('status', '') });
    if (filters.studentQuery) chips.push({ key: 'studentQuery', label: `Search: ${filters.studentQuery}`, clear: () => updateFilter('studentQuery', '') });
    if (filters.createdBy) chips.push({ key: 'createdBy', label: `Created: ${filters.createdBy}`, clear: () => updateFilter('createdBy', '') });
    if (filters.tag) chips.push({ key: 'tag', label: `Tag: ${filters.tag}`, clear: () => updateFilter('tag', '') });
    if (filters.department) chips.push({ key: 'department', label: `Dept: ${filters.department}`, clear: () => updateFilter('department', '') });
    if (filters.difficulty) chips.push({ key: 'difficulty', label: `Difficulty: ${filters.difficulty}`, clear: () => updateFilter('difficulty', '') });
    if (filters.from || filters.to) chips.push({ key: 'dateRange', label: `Date: ${filters.from || '…'} → ${filters.to || '…'}`, clear: () => { setFilters((p) => ({ ...p, from: '', to: '' })); } });
    if (filters.scoreMin || filters.scoreMax) chips.push({ key: 'scoreRange', label: `Score: ${filters.scoreMin || 0} - ${filters.scoreMax || '∞'}`, clear: () => { setFilters((p) => ({ ...p, scoreMin: '', scoreMax: '' })); } });
    return chips;
  }, [filters, assessments, updateFilter]);

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
        icon: Users, label: 'Total Assessments', value: assessments.length || 0,
        insight: assessments.length ? `${assessments.length} published assessments` : undefined,
        trend: s.assessmentGrowth, tone: 'sky',
        chart: <Sparkline data={s.assessmentTrend || [30, 45, 35, 50, 42, 60, 55]} stroke="#0ea5e9" />,
      },
      {
        icon: GraduationCap, label: 'Total Attempts', value: totalStudents,
        insight: uniqueCandidates ? `${uniqueCandidates} unique candidates` : undefined,
        trend: s.attemptGrowth, tone: 'violet',
        chart: <Sparkline data={s.attemptTrend || [120, 150, 130, 180, 200, 220, 250]} stroke="#8b5cf6" />,
      },
      {
        icon: TrendingUp, label: 'Avg Score', value: `${avgScore.toFixed(1)}%`,
        sub: `of ${s.maxScore || 100} max`, insight: s.medianScore ? `Median: ${s.medianScore}%` : undefined,
        trend: s.scoreGrowth, tone: 'emerald',
        chart: <Sparkline data={s.scoreTrend || [60, 62, 58, 65, 63, 68, 70]} stroke="#10b981" />,
      },
      {
        icon: BarChart3, label: 'Pass Rate', value: `${passRate.toFixed(1)}%`,
        insight: totalForPassRate > 0 ? `${passCount} passed, ${failCount} failed` : undefined,
        trend: s.passRateGrowth, tone: 'emerald',
      },
      {
        icon: Search, label: 'Avg Time', value: formatDuration(avgTimeSec),
        insight: s.fastestTime ? `Fastest: ${formatDuration(Number(s.fastestTime))}` : undefined, tone: 'amber',
      },
      {
        icon: ShieldAlert, label: 'Violations', value: violationCount,
        insight: totalStudents > 0 ? `${((violationCount / totalStudents)).toFixed(1)} per session` : undefined,
        trend: s.violationGrowth, tone: 'rose', invert: true,
      },
    ];

    // For violations tab, show violation-specific KPIs
    if (activeTab === 'violations') {
      return [
        {
          icon: ShieldAlert, label: 'Total Violations', value: s.violationCount || 0,
          insight: s.violationRate ? `${s.violationRate}% violation rate` : undefined,
          tone: 'rose',
        },
        {
          icon: GraduationCap, label: 'Flagged Sessions', value: pagination.total || 0,
          insight: 'Sessions with security violations', tone: 'amber',
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
          insight: 'Camera monitoring violations', tone: 'rose',
        },
        {
          icon: Users, label: 'Unique Candidates', value: s.uniqueCandidates || 0,
          insight: 'Students with violations', tone: 'violet',
        },
      ];
    }

    return baseKPIs;
  }, [summary, assessments, pagination.total, activeTab]);

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
    if (sorted.length === 0) return [100, 120, 115, 140, 180, 200, 220, 250, 280, 300];
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

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      {/* ── Fixed Header (not sticky to avoid hiding content) ── */}
      <div className="border-b border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Assessment Reports</h1>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Enterprise analytics · {pagination.total || 0} records · {assessments.length} assessments
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
                  {assessments.map((a) => (
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
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
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
                      <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
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

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
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
                <BarChart3 className="h-4 w-4 text-emerald-600" />Attempt Trends
              </div>
              <div className="mt-4"><Sparkline data={attemptTrend} width={320} height={70} stroke="#10b981" fill="rgba(16,185,129,0.06)" strokeWidth={2} /></div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                <span>Last {attemptTrend.length} days</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{attemptTrend.length > 1 ? `${((attemptTrend[attemptTrend.length - 1] - attemptTrend[0]) / Math.max(1, attemptTrend[0]) * 100).toFixed(0)}%` : ''}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <GraduationCap className="h-4 w-4 text-amber-500" />Top Performing
              </div>
              <div className="mt-4 space-y-3">
                {(summary?.topAssessments || assessments.slice(0, 5)).map((a, i) => (
                  <div key={a._id || i} className="flex items-center gap-3">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${i < 3 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' : 'bg-slate-50 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{i + 1}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-800 dark:text-gray-200">{a.title || 'Untitled'}</div></div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{a.avgScore?.toFixed?.(0) || a.attempted || 0}%</div>
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
                  <ShieldAlert className="h-4 w-4 text-rose-600" />Violation Types
                </div>
                <span className="text-[10px] text-slate-400 dark:text-gray-500">by category</span>
              </div>
              <div className="mt-4"><MiniBarChart data={violationData} labels={violationLabels.map(l => l.split(' ')[0])} width={320} height={60} barColor="#ef4444" /></div>
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
                <BarChart3 className="h-4 w-4 text-amber-600" />Violation Trend
              </div>
              <div className="mt-4"><Sparkline data={violationTrend} width={320} height={70} stroke="#f59e0b" fill="rgba(245,158,11,0.06)" strokeWidth={2} /></div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                <span>Last {violationTrend.length} days</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{violationTrend.length > 1 ? `${((violationTrend[violationTrend.length - 1] - violationTrend[0]) / Math.max(1, violationTrend[0]) * 100).toFixed(0)}%` : ''}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <GraduationCap className="h-4 w-4 text-violet-600" />Top Violators
              </div>
              <div className="mt-4 space-y-3">
                {(summary?.topViolators || []).slice(0, 5).map((v, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${i < 3 ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-slate-50 text-slate-500 dark:bg-gray-800 dark:text-gray-400'}`}>{i + 1}</div>
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
              <DateTimePicker value={filters.from} onChange={(iso) => updateFilter('from', iso)} placeholder="From Date" className="text-xs" />
              <DateTimePicker value={filters.to} onChange={(iso) => updateFilter('to', iso)} min={filters.from || undefined} placeholder="To Date" className="text-xs" />
              <input type="number" value={filters.scoreMin} onChange={(e) => updateFilter('scoreMin', e.target.value)} placeholder="Min Score %" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
              <input type="number" value={filters.scoreMax} onChange={(e) => updateFilter('scoreMax', e.target.value)} placeholder="Max Score %" className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
            </div>

            {savedFilters.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-gray-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">Saved:</span>
                {savedFilters.map((sf, i) => (
                  <button key={i} onClick={() => applySavedFilter(sf)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 transition-colors hover:border-sky-200 hover:bg-sky-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-800 dark:hover:bg-sky-900/20">
                    <Sparkles className="h-3 w-3 text-amber-500" />{sf.name}
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
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* ── Professional Assessment Sidebar ── */}
          <div className="hidden lg:block">
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
                  {assessments.length}
                </span>
              </div>

              {/* Search Filter */}
              <div className="mb-3 relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assessments..."
                  value={filters.search || ''}
                  onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
                />
              </div>

              {/* Date Filter */}
              <div className="mb-4 space-y-2">
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <DateTimePicker
                    value={filters.from}
                    onChange={(v) => setFilters((p) => ({ ...p, from: v }))}
                    placeholder="From date"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <DateTimePicker
                    value={filters.to}
                    onChange={(v) => setFilters((p) => ({ ...p, to: v }))}
                    placeholder="To date"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
                  />
                </div>
              </div>

              {/* Assessment List */}
              <div className="space-y-2">
                {loading && !assessments.length ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-gradient-to-r from-slate-100 to-slate-50 dark:from-gray-800 dark:to-gray-800/50" />
                  ))
                ) : (
                  assessments.map((a) => (
                    <button
                      key={a._id}
                      onClick={() => {
                        setSelectedAssessmentId(a._id);
                        setFilters((prev) => ({ ...prev, assessmentId: a._id }));
                      }}
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
                            <span>·</span>
                            <span>{a.totalQuestions || 0} Qs</span>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          a.lifecycleStatus === 'published'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
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

                      {/* Hover expand effect - mini sparkline */}
                      <div className="h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:h-6 group-hover:opacity-100">
                        <Sparkline
                          data={a.trend || [30, 45, 35, 50, 42, 60, 55]}
                          width={220}
                          height={20}
                          stroke={String(a._id) === String(selectedAssessmentId) ? '#0ea5e9' : '#94a3b8'}
                          strokeWidth={1.5}
                        />
                      </div>
                    </button>
                  ))
                )}
                {!loading && !assessments.length && (
                  <div className="py-8 text-center">
                    <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-gray-600" />
                    <p className="mt-2 text-xs text-slate-400 dark:text-gray-500">No assessments found</p>
                  </div>
                )}
              </div>
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
                  {selectedAssessment && <span className="text-xs text-slate-400 dark:text-gray-500">· {selectedAssessment.title}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
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
                {EXPORT_COLUMN_DEFS.map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">
                    <input type="checkbox" checked={Boolean(exportColumns[key])} onChange={() => setExportColumns((prev) => ({ ...prev, [key]: !prev[key] }))} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-gray-700">
              <div className="text-xs text-slate-500 dark:text-gray-400">{EXPORT_COLUMN_DEFS.filter(({ key }) => exportColumns[key]).length} column(s) selected</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowExportModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={handleExcelExport} disabled={exportingExcel} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">{exportingExcel ? 'Preparing Excel...' : 'Download Excel'}</button>
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
