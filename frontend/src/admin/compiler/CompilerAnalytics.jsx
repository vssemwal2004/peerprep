import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Target,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../utils/api";
import { useToast } from "../../components/CustomToast";
import { LoadingPanel } from "./CompilerUi";

const TOPIC_COLORS = [
  "#0284c7",
  "#7c3aed",
  "#059669",
  "#ea580c",
  "#db2777",
  "#0891b2",
  "#4f46e5",
  "#65a30d",
  "#d97706",
  "#0f766e",
];
const FILTER_ARRAY_KEYS = [
  "studentIds",
  "semesters",
  "groups",
  "branches",
  "courses",
  "colleges",
  "uploadBatchIds",
  "assessmentIds",
  "topics",
  "difficulties",
  "problemStatuses",
  "languages",
  "problemIds",
];
const createEmptyFilters = () => ({
  studentIds: [],
  semesters: [],
  groups: [],
  branches: [],
  courses: [],
  colleges: [],
  uploadBatchIds: [],
  assessmentIds: [],
  topics: [],
  difficulties: [],
  problemStatuses: [],
  languages: [],
  problemIds: [],
  dateFrom: "",
  dateTo: "",
});
const percentage = (value) => `${Math.round(Number(value || 0) * 10) / 10}%`;
const sameValue = (left, right) => String(left) === String(right);

function MultiSelectField({ label, options, values, onChange, placeholder }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selectedLabels = options
    .filter((option) => values.some((value) => sameValue(value, option.value)))
    .map((option) => option.label);
  const toggle = (value) =>
    onChange(
      values.some((item) => sameValue(item, value))
        ? values.filter((item) => !sameValue(item, value))
        : [...values, value],
    );

  return (
    <div className="min-w-0">
      <span className="text-xs font-bold text-slate-600 dark:text-gray-300">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-2 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 outline-none hover:border-sky-300 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        <span
          className={
            selectedLabels.length
              ? "truncate font-semibold text-slate-800 dark:text-white"
              : "text-slate-500"
          }
        >
          {selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length <= 2
              ? selectedLabels.join(", ")
              : `${selectedLabels.length} selected`}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {selectedLabels.length > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              {selectedLabels.length}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {expanded && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          {options.length > 6 && (
            <div className="relative border-b border-slate-100 p-2 dark:border-gray-800">
              <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}`}
                className="h-9 w-full rounded-lg bg-slate-50 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-sky-100 dark:bg-gray-800"
              />
            </div>
          )}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[10px] font-bold dark:border-gray-800">
            <button
              type="button"
              onClick={() => onChange(options.map((option) => option.value))}
              className="text-sky-700 hover:text-sky-500"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={!values.length}
              className="text-slate-500 disabled:opacity-40"
            >
              Clear
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto p-1.5">
            {filteredOptions.map((option) => {
              const selected = values.some((value) =>
                sameValue(value, option.value),
              );
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${selected ? "bg-sky-50 font-semibold text-sky-800 dark:bg-sky-950/30 dark:text-sky-300" : "text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800"}`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 dark:border-gray-600"}`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
            {!filteredOptions.length && (
              <p className="px-3 py-5 text-center text-xs text-slate-400">
                No matching options
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TopicProficiencyChart({ data, ticks }) {
  const chartWidth = Math.max(920, data.length * 132);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const showTooltip = (event, item, rate, color) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth - 24);
    const estimatedHeight = 164;
    const gap = 12;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 12,
    );
    const preferredTop = rect.top - estimatedHeight - gap;
    const top = preferredTop >= 12
      ? preferredTop
      : Math.min(rect.bottom + gap, window.innerHeight - estimatedHeight - 12);
    setActiveTooltip({ item, rate, color, left, top, width });
  };
  return (
    <>
      <div className="flex min-w-0">
        <div className="relative z-10 w-24 shrink-0 bg-white dark:bg-gray-900">
        <div className="relative h-[420px] border-r border-slate-300 dark:border-gray-600">
          <span className="absolute -left-12 top-1/2 w-44 -translate-y-1/2 -rotate-90 text-center text-[11px] font-semibold text-slate-500">
            Students who solved (%)
          </span>
          {ticks.map((tick) => (
            <span
              key={tick}
              style={{ bottom: `calc(${tick}% - 8px)` }}
              className="absolute right-2 text-[11px] font-medium text-slate-500"
            >
              {tick}%
            </span>
          ))}
        </div>
        <div className="h-[104px] border-r border-slate-200 dark:border-gray-700" />
        </div>
        <div
          className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-2"
          onScroll={() => setActiveTooltip(null)}
        >
        <div style={{ width: chartWidth }}>
          <div className="relative h-[420px] border-b border-slate-300 dark:border-gray-600">
            {ticks.map((tick) => (
              <span
                key={tick}
                style={{ bottom: `${tick}%` }}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-200 dark:border-gray-700"
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {data.map((item, index) => {
                const rate = Math.max(0, Math.min(100, item.knowledgeRate));
                const color = TOPIC_COLORS[index % TOPIC_COLORS.length];
                return (
                  <div
                    key={item.topic}
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center px-4 focus-within:z-40 hover:z-40"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.topic}: ${percentage(rate)}, ${item.solvedStudents} of ${item.cohortSize} eligible students`}
                      onMouseEnter={(event) => showTooltip(event, item, rate, color)}
                      onMouseLeave={() => setActiveTooltip(null)}
                      onFocus={(event) => showTooltip(event, item, rate, color)}
                      onBlur={() => setActiveTooltip(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setActiveTooltip(null);
                      }}
                      className="relative w-full max-w-14 rounded-t-md outline-none transition-[filter,transform] duration-150 hover:-translate-y-0.5 hover:brightness-110 focus:-translate-y-0.5 focus:brightness-110 focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
                      style={{
                        height: `${rate > 0 ? Math.max(rate, 0.8) : 0}%`,
                        backgroundColor: color,
                      }}
                    >
                      <span
                        className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold"
                        style={{ color }}
                      >
                        {percentage(rate)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex h-20 border-b border-slate-100 dark:border-gray-800">
            {data.map((item) => (
              <div
                key={item.topic}
                className="flex min-w-0 flex-1 items-start justify-center border-r border-slate-100 px-2 pt-3 last:border-r-0 dark:border-gray-800"
              >
                <p
                  title={item.topic}
                  className="line-clamp-3 max-w-28 break-words text-center text-[11px] font-semibold leading-4 text-slate-600 dark:text-gray-300"
                >
                  {item.topic}
                </p>
              </div>
            ))}
          </div>
          <p className="h-6 pt-1.5 text-center text-[11px] font-semibold text-slate-500">
            Topics
          </p>
          </div>
        </div>
      </div>
      {activeTooltip && createPortal(
        <div
          role="tooltip"
          style={{
            left: activeTooltip.left,
            top: activeTooltip.top,
            width: activeTooltip.width,
          }}
          className="pointer-events-none fixed z-[200] rounded-xl border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-600 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <p className="break-words font-bold text-slate-950 dark:text-white">
            {activeTooltip.item.topic}
          </p>
          <p
            className="mt-1 text-xl font-bold"
            style={{ color: activeTooltip.color }}
          >
            {percentage(activeTooltip.rate)}
          </p>
          <p>
            {activeTooltip.item.solvedStudents} of {activeTooltip.item.cohortSize}{" "}
            eligible students solved this topic
          </p>
          <p className="mt-2 border-t border-slate-100 pt-2 dark:border-gray-800">
            {activeTooltip.item.problemCount} problem(s) ·{" "}
            {activeTooltip.item.attempts} attempts
          </p>
        </div>,
        document.body,
      )}
    </>
  );
}

function ChartCard({ title, description, icon: Icon, children }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-gray-800">
        <span className="rounded-lg bg-sky-50 p-2 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {title}
          </h3>
          <p className="text-[10px] text-slate-500">{description}</p>
        </div>
      </header>
      <div className="h-72 p-4">{children}</div>
    </section>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 dark:border-gray-700">
      No activity for this selection
    </div>
  );
}

function escapeCsv(value) {
  const rawText = String(value ?? "");
  const text = /^[=+\-@]/.test(rawText.trimStart()) ? `'${rawText}` : rawText;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const EXPORT_REPORTS = {
  topics: {
    label: "Topic summary",
    description: "One row for every topic in the filtered analysis",
    sheetName: "Topic proficiency",
    columns: [
      { key: "topic", label: "Topic" },
      { key: "knowledgeRate", label: "Students knowing topic %" },
      { key: "solvedStudents", label: "Students solved" },
      { key: "attemptedStudents", label: "Students attempted" },
      { key: "cohortSize", label: "Students in selected cohort" },
      { key: "participationRate", label: "Participation rate %" },
      { key: "successRate", label: "Success rate %" },
      { key: "masteryRate", label: "Mastery rate %" },
      { key: "problemCount", label: "Problems included" },
      { key: "attempts", label: "Attempts" },
    ],
  },
  students: {
    label: "Student details",
    description: "One row for every student in the filtered cohort",
    sheetName: "Student performance",
    columns: [
      { key: "name", label: "Student name" },
      { key: "studentCode", label: "Student ID" },
      { key: "email", label: "Email" },
      { key: "semester", label: "Semester" },
      { key: "group", label: "Student group" },
      { key: "branch", label: "Branch" },
      { key: "course", label: "Course" },
      { key: "college", label: "Campus / College" },
      { key: "totalAttempts", label: "Total attempts" },
      { key: "problemsSolved", label: "Problems solved" },
      { key: "acceptanceRate", label: "Acceptance rate %" },
      { key: "activityStatus", label: "Activity status" },
      { key: "lastActive", label: "Last active" },
    ],
  },
};

const DEFAULT_EXPORT_COLUMNS = Object.fromEntries(
  Object.entries(EXPORT_REPORTS).map(([key, report]) => [
    key,
    report.columns.map((column) => column.key),
  ]),
);

export default function CompilerAnalytics() {
  const toast = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState(createEmptyFilters);
  const [draftFilters, setDraftFilters] = useState(createEmptyFilters);
  const [yAxisStep, setYAxisStep] = useState(10);
  const [draftYAxisStep, setDraftYAxisStep] = useState(10);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSection, setFilterSection] = useState("cohort");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportReport, setExportReport] = useState("topics");
  const [exportColumns, setExportColumns] = useState(DEFAULT_EXPORT_COLUMNS);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoadError("");
        if (analytics) setRefreshing(true);
        else setLoading(true);
        const response = await api.getCompilerAnalytics(filters);
        if (active) setAnalytics(response);
      } catch (error) {
        if (active)
          setLoadError(error.message || "Failed to load coding analytics.");
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, reloadKey, toast]);

  const summary = analytics?.summary || {};
  const filterOptions = analytics?.filters || {};
  const cohortSize = Number(summary.cohortSize || 0);
  const chartData = (analytics?.topicMastery || []).map((item) => ({
    ...item,
    cohortSize,
    knowledgeRate: Number(
      item.knowledgeRate ??
        (cohortSize
          ? (Number(item.solvedStudents || 0) / cohortSize) * 100
          : 0),
    ),
  }));
  const yTicks = useMemo(() => {
    const ticks = [];
    for (let value = 0; value <= 100; value += yAxisStep) ticks.push(value);
    if (ticks[ticks.length - 1] !== 100) ticks.push(100);
    return ticks;
  }, [yAxisStep]);

  const selectedDraftAssessments = (filterOptions.assessments || []).filter(
    (assessment) =>
      draftFilters.assessmentIds.some((id) => sameValue(id, assessment._id)),
  );
  const assessmentIncludesEveryone = selectedDraftAssessments.some(
    (assessment) => assessment.studentIds === null,
  );
  const assessmentStudentIdSet = new Set(
    selectedDraftAssessments.flatMap((assessment) =>
      Array.isArray(assessment.studentIds) ? assessment.studentIds : [],
    ),
  );
  const draftCohortStudents = (filterOptions.students || []).filter(
    (student) =>
      !selectedDraftAssessments.length ||
      assessmentIncludesEveryone ||
      assessmentStudentIdSet.has(String(student._id)),
  );
  const cohortValues = (key, category) => {
    const usedValues = new Set(
      draftCohortStudents
        .map((student) => String(student[key] ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    return (filterOptions.masterData || [])
      .filter(
        (entry) =>
          entry.category === category &&
          usedValues.has(String(entry.name).trim().toLowerCase()),
      )
      .map((entry) => (category === "semester" ? Number(entry.name) : entry.name));
  };
  const semesterOptions = cohortValues("semester", "semester").map((item) => ({
    value: item,
    label: `Semester ${item}`,
  }));
  const groupOptions = [
    ...new Set(draftCohortStudents.map((student) => student.group).filter(Boolean)),
  ].map((item) => ({
    value: item,
    label: item,
  }));
  const studentOptions = draftCohortStudents.map((item) => ({
    value: item._id,
    label: `${item.name}${item.studentId ? ` (${item.studentId})` : ""}`,
  }));
  const branchOptions = cohortValues("branch", "branch").map((item) => ({
    value: item,
    label: item,
  }));
  const courseOptions = cohortValues("course", "course").map((item) => ({
    value: item,
    label: item,
  }));
  const collegeOptions = cohortValues("college", "campus").map((item) => ({
    value: item,
    label: item,
  }));
  const eligibleBatchIds = new Set(
    draftCohortStudents.flatMap((student) => student.uploadBatchIds || []),
  );
  const uploadBatchOptions = (filterOptions.uploadBatches || [])
    .filter(
      (item) =>
        !selectedDraftAssessments.length ||
        eligibleBatchIds.has(String(item._id)),
    )
    .map((item) => ({
      value: item._id,
      label: `${item.name || item.originalFileName} · ${item.studentCount} students`,
    }));
  const assessmentOptions = (filterOptions.assessments || []).map((item) => ({
    value: item._id,
    label: `${item.title} · ${item.studentCount} eligible`,
  }));
  const assessmentProblemIdSet = new Set(
    selectedDraftAssessments.flatMap((assessment) =>
      Array.isArray(assessment.problemIds) ? assessment.problemIds : [],
    ),
  );
  const draftScopedProblems = (filterOptions.problems || []).filter(
    (problem) =>
      !selectedDraftAssessments.length ||
      assessmentProblemIdSet.has(String(problem._id)),
  );
  const topicOptions = [
    ...new Set(
      draftScopedProblems
        .flatMap((problem) => problem.tags || [])
        .filter(Boolean),
    ),
  ].map((item) => ({
    value: item,
    label: item,
  }));
  const difficultyOptions = [
    ...new Set(
      draftScopedProblems.map((problem) => problem.difficulty).filter(Boolean),
    ),
  ].map((item) => ({
    value: item,
    label: item,
  }));
  const problemStatusOptions = [
    ...new Set(
      draftScopedProblems.map((problem) => problem.status).filter(Boolean),
    ),
  ].map((item) => ({
    value: item,
    label: item.charAt(0).toUpperCase() + item.slice(1),
  }));
  const languageOptions = (filterOptions.languages || []).map((item) => ({
    value: item,
    label:
      item === "cpp" ? "C++" : item.charAt(0).toUpperCase() + item.slice(1),
  }));
  const allProblemOptions = (filterOptions.problems || []).map((item) => ({
    value: item._id,
    label: item.title,
  }));
  const problemOptions = draftScopedProblems
    .filter(
      (problem) =>
        (!draftFilters.topics.length ||
          (problem.tags || []).some((tag) =>
            draftFilters.topics.some((topic) => sameValue(topic, tag)),
          )) &&
        (!draftFilters.difficulties.length ||
          draftFilters.difficulties.some((item) =>
            sameValue(item, problem.difficulty),
          )) &&
        (!draftFilters.problemStatuses.length ||
          draftFilters.problemStatuses.some((item) =>
            sameValue(item, problem.status),
          )),
    )
    .map((item) => ({ value: item._id, label: item.title }));
  const selectedFiltersCount =
    FILTER_ARRAY_KEYS.reduce((count, key) => count + filters[key].length, 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (yAxisStep !== 10 ? 1 : 0);
  const optionLabels = (source, values) =>
    source
      .filter((option) =>
        values.some((value) => sameValue(value, option.value)),
      )
      .map((option) => option.label);
  const filterLabels = [
    filters.studentIds.length &&
      `Students: ${filters.studentIds.length} selected`,
    filters.semesters.length &&
      `Semesters: ${optionLabels(semesterOptions, filters.semesters)
        .map((item) => item.replace("Semester ", ""))
        .join(", ")}`,
    filters.groups.length &&
      `Groups: ${optionLabels(groupOptions, filters.groups).join(", ")}`,
    filters.branches.length &&
      `Branches: ${optionLabels(branchOptions, filters.branches).join(", ")}`,
    filters.courses.length &&
      `Courses: ${optionLabels(courseOptions, filters.courses).join(", ")}`,
    filters.colleges.length &&
      `Colleges: ${optionLabels(collegeOptions, filters.colleges).join(", ")}`,
    filters.uploadBatchIds.length &&
      `Excel batches: ${filters.uploadBatchIds.length} selected`,
    filters.assessmentIds.length &&
      `Assessments: ${optionLabels(assessmentOptions, filters.assessmentIds).join(", ")}`,
    filters.topics.length &&
      `Topics: ${optionLabels(topicOptions, filters.topics).join(", ")}`,
    filters.difficulties.length &&
      `Difficulty: ${optionLabels(difficultyOptions, filters.difficulties).join(", ")}`,
    filters.problemStatuses.length &&
      `Problem status: ${optionLabels(problemStatusOptions, filters.problemStatuses).join(", ")}`,
    filters.languages.length &&
      `Languages: ${optionLabels(languageOptions, filters.languages).join(", ")}`,
    filters.problemIds.length &&
      `Problems: ${optionLabels(allProblemOptions, filters.problemIds).join(", ")}`,
    (filters.dateFrom || filters.dateTo) && "Custom date range",
    yAxisStep !== 10 && `Y-axis: ${yAxisStep}% steps`,
  ].filter(Boolean);

  const openFilters = () => {
    setDraftFilters({
      ...filters,
      ...Object.fromEntries(
        FILTER_ARRAY_KEYS.map((key) => [key, [...filters[key]]]),
      ),
    });
    setDraftYAxisStep(yAxisStep);
    setFilterSection("cohort");
    setFilterOpen(true);
  };
  const updateDraft = (key, value) =>
    setDraftFilters((current) => ({ ...current, [key]: value }));
  const selectRecentDays = (days) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    updateDraft("dateFrom", from.toISOString().slice(0, 10));
    updateDraft("dateTo", to.toISOString().slice(0, 10));
  };
  const clearFilters = () => {
    setFilters(createEmptyFilters());
    setYAxisStep(10);
  };
  const applyFilters = () => {
    if (
      draftFilters.dateFrom &&
      draftFilters.dateTo &&
      draftFilters.dateFrom > draftFilters.dateTo
    )
      return toast.error("From date must be earlier than the to date.");
    const allowedProblemIds = new Set(problemOptions.map((item) => item.value));
    const allowedStudentIds = new Set(
      studentOptions.map((item) => String(item.value)),
    );
    setFilters({
      ...draftFilters,
      studentIds: draftFilters.studentIds.filter((id) =>
        allowedStudentIds.has(String(id)),
      ),
      problemIds: draftFilters.problemIds.filter((id) =>
        allowedProblemIds.has(id),
      ),
    });
    setYAxisStep(Number(draftYAxisStep));
    setFilterOpen(false);
  };

  const topicExportRows = chartData.map((item) => ({
    ...item,
    knowledgeRate: Math.round(item.knowledgeRate * 100) / 100,
    participationRate: Math.round(Number(item.participationRate || 0) * 100) / 100,
    successRate: Math.round(Number(item.successRate || 0) * 100) / 100,
    masteryRate: Math.round(Number(item.masteryRate || 0) * 100) / 100,
  }));
  const studentExportMetadata = new Map(
    (filterOptions.students || []).map((student) => [String(student._id), student]),
  );
  const studentExportRows = (analytics?.studentPerformance || []).map((student) => {
    const metadata = studentExportMetadata.get(String(student.studentId)) || {};
    return {
      ...metadata,
      ...student,
      email: student.email || metadata.email || "",
      course: student.course || metadata.course || "",
      college: student.college || metadata.college || "",
      activityStatus: student.totalAttempts > 0 ? "Active" : "No activity",
      lastActive: student.lastActive
        ? new Date(student.lastActive).toLocaleString()
        : "Never",
    };
  });
  const activeExportConfig = EXPORT_REPORTS[exportReport];
  const selectedExportColumnKeys = exportColumns[exportReport] || [];
  const selectedExportColumns = activeExportConfig.columns.filter((column) =>
    selectedExportColumnKeys.includes(column.key),
  );
  const exportSourceRows = exportReport === "students"
    ? studentExportRows
    : topicExportRows;
  const reportRows = exportSourceRows.map((source) =>
    Object.fromEntries(
      selectedExportColumns.map((column) => [column.label, source[column.key] ?? ""]),
    ),
  );
  const toggleExportColumn = (key) => {
    setExportColumns((current) => {
      const selected = current[exportReport] || [];
      return {
        ...current,
        [exportReport]: selected.includes(key)
          ? selected.filter((item) => item !== key)
          : [...selected, key],
      };
    });
  };
  const setAllExportColumns = (selected) => {
    setExportColumns((current) => ({
      ...current,
      [exportReport]: selected
        ? activeExportConfig.columns.map((column) => column.key)
        : [],
    }));
  };
  const validateExport = () => {
    if (!selectedExportColumns.length) {
      toast.error("Select at least one column to export.");
      return false;
    }
    if (!reportRows.length) {
      toast.error(`No ${activeExportConfig.label.toLowerCase()} data is available for this filter.`);
      return false;
    }
    return true;
  };
  const downloadCsv = () => {
    if (!validateExport()) return;
    const columns = selectedExportColumns.map((column) => column.label);
    const csv = [
      columns.map(escapeCsv).join(","),
      ...reportRows.map((row) =>
        columns.map((column) => escapeCsv(row[column])).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `coding-${exportReport}-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };
  const downloadExcel = async () => {
    if (!validateExport()) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(reportRows, {
        header: selectedExportColumns.map((column) => column.label),
      });
      sheet["!cols"] = selectedExportColumns.map((column) => ({
        wch: Math.min(
          42,
          Math.max(
            column.label.length + 2,
            ...reportRows.map((row) => String(row[column.label] ?? "").length + 2),
          ),
        ),
      }));
      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        activeExportConfig.sheetName,
      );
      XLSX.writeFile(
        workbook,
        `coding-${exportReport}-analysis-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      setExportOpen(false);
    } catch (error) {
      toast.error(error.message || "Could not generate the Excel report.");
    }
  };

  if (loading) return <LoadingPanel label="Loading coding analytics..." />;
  if (loadError && !analytics)
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white p-6 text-center dark:border-rose-900 dark:bg-gray-900">
        <p className="font-bold text-slate-900 dark:text-white">
          Analytics could not be loaded
        </p>
        <p className="mt-1 text-sm text-slate-500">{loadError}</p>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white"
        >
          Try again
        </button>
      </div>
    );

  return (
    <div className="flex min-h-[calc(100vh-var(--app-navbar-height,5rem)-2rem)] flex-col gap-3">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-950 dark:text-white">
              Topic proficiency
            </h1>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Percentage of selected students who solved each topic
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openFilters}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-gray-700 dark:text-gray-200"
          >
            <Filter className="h-4 w-4" />
            Filters
            {selectedFiltersCount > 0 && (
              <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] text-white">
                {selectedFiltersCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={refreshing}
            aria-label="Refresh analytics"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-bold text-white hover:bg-sky-500"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </header>

      {filterLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filterLabels.map((label) => (
            <span
              key={label}
              className="max-w-full truncate rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
            >
              {label}
            </span>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-sky-700"
          >
            <RotateCcw className="h-3 w-3" />
            Clear all
          </button>
        </div>
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-gray-800 dark:bg-gray-800">
        {[
          ["Selected students", cohortSize],
          ["Students with activity", summary.activeStudents || 0],
          ["Topics shown", chartData.length],
          ["Problems included", summary.problemsCovered || 0],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-2.5 dark:bg-gray-900">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
              {label}
            </p>
            <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
              {value}
            </p>
          </div>
        ))}
      </section>

      <section className="flex min-h-[620px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Students who know each topic
            </h2>
            <p className="mt-0.5 text-[10px] text-slate-500">
              A student is counted after solving at least one problem in that
              topic.
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 dark:bg-gray-800 dark:text-gray-300">
            Y-axis interval: {yAxisStep}%
          </span>
        </div>
        <div className="min-h-0 flex-1 p-3 sm:p-5">
          {chartData.length ? (
            <TopicProficiencyChart data={chartData} ticks={yTicks} />
          ) : (
            <div className="flex h-full min-h-[540px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center dark:border-gray-700 dark:bg-gray-800/40">
              <p className="text-sm font-bold text-slate-700 dark:text-gray-200">
                No topic data for this selection
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Try removing one or more filters.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <ChartCard
          title="Submission activity"
          description="Attempt volume across the selected time range"
          icon={Activity}
        >
          {analytics?.charts?.submissionsOverTime?.some(
            (item) => item.count,
          ) ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={analytics.charts.submissionsOverTime}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="attemptArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  minTickGap={26}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Attempts"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  fill="url(#attemptArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard
          title="Success by difficulty"
          description="Accepted submissions as a percentage of attempts"
          icon={Target}
        >
          {analytics?.charts?.difficultyVsSuccessRate?.some(
            (item) => item.successRate,
          ) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.charts.difficultyVsSuccessRate}
                margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="difficulty"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                />
                <Tooltip
                  formatter={(value) => [percentage(value), "Success rate"]}
                />
                <Bar
                  dataKey="successRate"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={72}
                >
                  {analytics.charts.difficultyVsSuccessRate.map(
                    (item, index) => (
                      <Cell
                        key={item.difficulty}
                        fill={["#10b981", "#f59e0b", "#f43f5e"][index % 3]}
                      />
                    ),
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard
          title="Submission outcomes"
          description="Accepted, wrong-answer, and error distribution"
          icon={BarChart3}
        >
          {analytics?.charts?.verdictDistribution?.some(
            (item) => item.count,
          ) ? (
            <div className="flex h-full items-center gap-4">
              <div className="h-full min-w-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.charts.verdictDistribution}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={3}
                    >
                      {analytics.charts.verdictDistribution.map(
                        (item, index) => (
                          <Cell
                            key={item.label}
                            fill={["#10b981", "#f43f5e", "#f59e0b"][index % 3]}
                          />
                        ),
                      )}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-40 space-y-3">
                {analytics.charts.verdictDistribution.map((item, index) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="flex items-center gap-2 text-slate-600 dark:text-gray-300">
                      <i
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: ["#10b981", "#f43f5e", "#f59e0b"][
                            index % 3
                          ],
                        }}
                      />
                      {item.label}
                    </span>
                    <strong>{percentage(item.percentage)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard
          title="Language performance"
          description="Success rate for languages used by the selected cohort"
          icon={FileSpreadsheet}
        >
          {analytics?.charts?.languageDistribution?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={analytics.charts.languageDistribution}
                margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  horizontal={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                />
                <YAxis
                  type="category"
                  dataKey="language"
                  width={76}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  formatter={(value) => [percentage(value), "Success rate"]}
                />
                <Bar
                  dataKey="successRate"
                  fill="#6366f1"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </section>

      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex justify-end bg-slate-950/45 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            aria-label="Analytics filters"
          >
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close filters"
              onClick={() => setFilterOpen(false)}
            />
            <motion.section
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            >
              <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-sky-50 p-2 text-sky-700 dark:bg-sky-950/30">
                    <SlidersHorizontal className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                      Customize analysis
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      All charts update from the same group selection.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <nav className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-2 pt-2 dark:border-gray-800 dark:bg-gray-950/40">
                {[
                  ["cohort", "Cohort"],
                  ["activity", "Activity"],
                  ["questions", "Questions"],
                  ["display", "Display"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilterSection(value)}
                    className={`border-b-2 px-2 py-2.5 text-[11px] font-bold ${filterSection === value ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="flex-1 overflow-y-auto p-4">
                {filterSection === "cohort" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Eligible students
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Assessment selection automatically limits this list.
                        Choose one or many values.
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <MultiSelectField
                        label="Individual students"
                        options={studentOptions}
                        values={draftFilters.studentIds}
                        onChange={(value) => updateDraft("studentIds", value)}
                        placeholder={`All ${draftCohortStudents.length} eligible students`}
                      />
                    </div>
                    <MultiSelectField
                      label="Semesters"
                      options={semesterOptions}
                      values={draftFilters.semesters}
                      onChange={(value) => updateDraft("semesters", value)}
                      placeholder="All semesters"
                    />
                    <MultiSelectField
                      label="Student groups"
                      options={groupOptions}
                      values={draftFilters.groups}
                      onChange={(value) => updateDraft("groups", value)}
                      placeholder="All groups"
                    />
                    <MultiSelectField
                      label="Branches"
                      options={branchOptions}
                      values={draftFilters.branches}
                      onChange={(value) => updateDraft("branches", value)}
                      placeholder="All branches"
                    />
                    <MultiSelectField
                      label="Courses"
                      options={courseOptions}
                      values={draftFilters.courses}
                      onChange={(value) => updateDraft("courses", value)}
                      placeholder="All courses"
                    />
                    <div className="sm:col-span-2">
                      <MultiSelectField
                        label="Colleges"
                        options={collegeOptions}
                        values={draftFilters.colleges}
                        onChange={(value) => updateDraft("colleges", value)}
                        placeholder="All colleges"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <MultiSelectField
                        label="Excel upload batches"
                        options={uploadBatchOptions}
                        values={draftFilters.uploadBatchIds}
                        onChange={(value) =>
                          updateDraft("uploadBatchIds", value)
                        }
                        placeholder="All uploaded batches"
                      />
                    </div>
                  </div>
                )}

                {filterSection === "activity" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Assessment activity
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Selecting a test changes both eligible students and
                        included attempts.
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <MultiSelectField
                        label="Assessments"
                        options={assessmentOptions}
                        values={draftFilters.assessmentIds}
                        onChange={(value) =>
                          setDraftFilters((current) => ({
                            ...current,
                            assessmentIds: value,
                            studentIds: [],
                            semesters: [],
                            groups: [],
                            branches: [],
                            courses: [],
                            colleges: [],
                            uploadBatchIds: [],
                            topics: [],
                            difficulties: [],
                            problemStatuses: [],
                            problemIds: [],
                          }))
                        }
                        placeholder="All assessments"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <MultiSelectField
                        label="Submission languages"
                        options={languageOptions}
                        values={draftFilters.languages}
                        onChange={(value) => updateDraft("languages", value)}
                        placeholder="All languages"
                      />
                    </div>
                    <div className="border-t border-slate-100 pt-4 sm:col-span-2 dark:border-gray-800">
                      <p className="text-xs font-bold text-slate-600">
                        Quick date range
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[7, 30, 90, 180, 365].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => selectRecentDays(days)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700"
                          >
                            {days === 365 ? "Last year" : `Last ${days} days`}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setDraftFilters((current) => ({
                              ...current,
                              dateFrom: "",
                              dateTo: "",
                            }))
                          }
                          className="px-2 text-[10px] font-bold text-slate-500 hover:text-sky-700"
                        >
                          All time
                        </button>
                      </div>
                    </div>
                    <label className="text-xs font-bold text-slate-600 dark:text-gray-300">
                      From date
                      <input
                        type="date"
                        value={draftFilters.dateFrom}
                        onChange={(event) =>
                          updateDraft("dateFrom", event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900"
                      />
                    </label>
                    <label className="text-xs font-bold text-slate-600 dark:text-gray-300">
                      To date
                      <input
                        type="date"
                        value={draftFilters.dateTo}
                        onChange={(event) =>
                          updateDraft("dateTo", event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900"
                      />
                    </label>
                  </div>
                )}

                {filterSection === "questions" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Question scope
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Narrow the graph to topics or exact coding problems.
                      </p>
                    </div>
                    <MultiSelectField
                      label="Topics"
                      options={topicOptions}
                      values={draftFilters.topics}
                      onChange={(value) => updateDraft("topics", value)}
                      placeholder="All topics"
                    />
                    <MultiSelectField
                      label="Difficulty levels"
                      options={difficultyOptions}
                      values={draftFilters.difficulties}
                      onChange={(value) => updateDraft("difficulties", value)}
                      placeholder="All difficulties"
                    />
                    <div className="sm:col-span-2">
                      <MultiSelectField
                        label="Problem status"
                        options={problemStatusOptions}
                        values={draftFilters.problemStatuses}
                        onChange={(value) =>
                          updateDraft("problemStatuses", value)
                        }
                        placeholder="All statuses"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <MultiSelectField
                        label="Problems"
                        options={problemOptions}
                        values={draftFilters.problemIds}
                        onChange={(value) => updateDraft("problemIds", value)}
                        placeholder="All problems"
                      />
                    </div>
                  </div>
                )}

                {filterSection === "display" && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Graph display
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Choose how much percentage detail appears on the fixed
                        Y-axis.
                      </p>
                    </div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-gray-300">
                      Y-axis percentage interval
                      <select
                        value={draftYAxisStep}
                        onChange={(event) =>
                          setDraftYAxisStep(Number(event.target.value))
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900"
                      >
                        {[5, 10, 20, 25, 30, 50].map((step) => (
                          <option key={step} value={step}>
                            {step}% steps
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-5 text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">
                      The Y-axis remains fixed from 0% to 100%. Only topics
                      scroll horizontally.
                    </div>
                  </div>
                )}
              </div>

              <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setDraftFilters(createEmptyFilters());
                    setDraftYAxisStep(10);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 dark:border-gray-700 dark:text-gray-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset selections
                </button>
                <button
                  type="button"
                  onClick={applyFilters}
                  className="h-10 rounded-xl bg-sky-600 px-5 text-xs font-bold text-white"
                >
                  Apply filters
                </button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {exportOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Export analytics"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close export"
            onClick={() => setExportOpen(false)}
          />
          <section className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                  Build analysis export
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Current analysis filters apply automatically. Choose the report and Excel columns you need.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Report rows
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {Object.entries(EXPORT_REPORTS).map(([key, report]) => {
                  const selected = exportReport === key;
                  const rowCount = key === "students"
                    ? studentExportRows.length
                    : topicExportRows.length;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setExportReport(key)}
                      className={`rounded-xl border p-3 text-left transition ${selected ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100 dark:bg-sky-950/30 dark:ring-sky-900" : "border-slate-200 hover:border-sky-300 dark:border-gray-700"}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-slate-900 dark:text-white">
                          {report.label}
                        </strong>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-gray-800"}`}>
                          {rowCount} rows
                        </span>
                      </span>
                      <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                        {report.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Columns
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedExportColumns.length} of {activeExportConfig.columns.length} selected
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAllExportColumns(true)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllExportColumns(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:border-slate-300 dark:border-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 dark:border-gray-700 dark:bg-gray-950/40">
                {activeExportConfig.columns.map((column) => {
                  const selected = selectedExportColumnKeys.includes(column.key);
                  return (
                    <label
                      key={column.key}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-xs font-semibold transition ${selected ? "border-sky-200 bg-white text-sky-800 shadow-sm dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300" : "border-transparent text-slate-500 hover:bg-white dark:hover:bg-gray-900"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleExportColumn(column.key)}
                        className="h-4 w-4 rounded border-slate-300 accent-sky-600"
                      />
                      {column.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid shrink-0 gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-950/40">
              <button
                type="button"
                onClick={downloadCsv}
                disabled={!selectedExportColumns.length}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
              >
                <Download className="h-5 w-5 text-sky-600" />
                <span>
                  <strong className="block text-sm text-slate-900 dark:text-white">
                    CSV
                  </strong>
                  <span className="text-[10px] text-slate-500">
                    {reportRows.length} filtered rows · {selectedExportColumns.length} columns
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={downloadExcel}
                disabled={!selectedExportColumns.length}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
              >
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <span>
                  <strong className="block text-sm text-slate-900 dark:text-white">
                    Excel
                  </strong>
                  <span className="text-[10px] text-slate-500">
                    {reportRows.length} filtered rows · {selectedExportColumns.length} columns
                  </span>
                </span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
