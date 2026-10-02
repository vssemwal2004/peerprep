export const ARRAY_FILTER_KEYS = [
  "studentIds", "semesters", "groups", "branches", "courses", "colleges", "uploadBatchIds",
  "assessmentIds", "assessmentTypes", "questionTypes", "sections", "assessmentTopics", "setNumbers",
  "subjectIds", "chapterIds", "learningTopicIds", "codingTopics", "difficulties", "languages", "verdicts", "problemIds",
];

export const createDefaultAnalyticsQuery = () => ({
  population: {
    studentIds: [], semesters: [], groups: [], branches: [], courses: [], colleges: [], uploadBatchIds: [],
    status: [], rankSegment: "top", rankN: 25, rankMetric: "overall", minimumEvidence: true,
  },
  activity: {
    sources: ["coding", "assessments", "learning"], datePreset: "90d", dateFrom: "", dateTo: "",
    codingMode: "both", assessmentIds: [], assessmentTypes: [], questionTypes: [], sections: [], assessmentTopics: [], setNumbers: [],
    subjectIds: [], chapterIds: [], learningTopicIds: [], codingTopics: [], difficulties: [], languages: [], verdicts: [], problemIds: [],
  },
  comparison: { compareBy: "none", timeGrain: "auto", scoreMode: "percentage" },
  graphs: { mode: "recommended", selectedIds: [] },
});

const OPTION_LABELS = {
  studentIds: "Students", semesters: "Semesters", groups: "Groups", branches: "Branches", courses: "Courses",
  colleges: "Campuses", uploadBatchIds: "Upload batches", assessmentIds: "Assessments", subjectIds: "Subjects",
  chapterIds: "Chapters", learningTopicIds: "Learning topics", codingTopics: "Coding topics", difficulties: "Difficulty",
  languages: "Languages", verdicts: "Verdicts", problemIds: "Problems", assessmentTypes: "Assessment types",
  questionTypes: "Question types", sections: "Sections", assessmentTopics: "Question topics", setNumbers: "Sets",
};

export function countActiveFilters(query) {
  const sections = [query.population, query.activity];
  let count = 0;
  sections.forEach((section) => ARRAY_FILTER_KEYS.forEach((key) => { if (section[key]?.length) count += 1; }));
  if (query.activity.datePreset !== "90d" || query.activity.dateFrom || query.activity.dateTo) count += 1;
  if (query.comparison.compareBy !== "none") count += 1;
  return count;
}

export function getScopeChips(query, optionLabels = {}) {
  const chips = [];
  [query.population, query.activity].forEach((section) => {
    ARRAY_FILTER_KEYS.forEach((key) => {
      if (!section[key]?.length) return;
      const labels = section[key].map((value) => optionLabels[`${key}:${value}`] || String(value));
      chips.push({ key, label: OPTION_LABELS[key] || key, value: labels.length < 3 ? labels.join(", ") : `${labels.length} selected` });
    });
  });
  chips.push({ key: "datePreset", label: "Window", value: query.activity.datePreset === "custom" ? `${query.activity.dateFrom || "…"} – ${query.activity.dateTo || "…"}` : query.activity.datePreset.toUpperCase() });
  if (query.comparison.compareBy !== "none") chips.push({ key: "compareBy", label: "Compare", value: query.comparison.compareBy });
  return chips;
}

export function removeScopeFilter(query, key) {
  const next = structuredClone(query);
  if (key === "datePreset") Object.assign(next.activity, { datePreset: "90d", dateFrom: "", dateTo: "" });
  else if (key === "compareBy") next.comparison.compareBy = "none";
  else if (Object.hasOwn(next.population, key)) next.population[key] = [];
  else if (Object.hasOwn(next.activity, key)) next.activity[key] = [];
  return next;
}

export function buildDependencies(query, type) {
  const dependencies = {};
  const parentMap = {
    groups: ["semesters", "branches", "courses", "colleges"], studentIds: ["semesters", "groups", "branches", "courses", "colleges", "uploadBatchIds"],
    assessmentTypes: ["assessmentIds"], questionTypes: ["assessmentIds"], sections: ["assessmentIds"], assessmentTopics: ["assessmentIds"], setNumbers: ["assessmentIds"],
    subjectIds: ["semesters"], chapterIds: ["semesters", "subjectIds"], learningTopicIds: ["semesters", "subjectIds", "chapterIds"],
    problemIds: ["codingTopics", "difficulties"],
  };
  (parentMap[type] || []).forEach((key) => {
    const values = query.population[key] || query.activity[key];
    if (values?.length) dependencies[key] = values;
  });
  return dependencies;
}

export function serializeAnalyticsQuery(query) {
  const next = structuredClone(query);
  next.activity.sources = (next.activity.sources || []).map((source) => source === "assessments" ? "assessment" : source);
  if (next.activity.datePreset !== "custom" && /^(7|30|90|180|365)d$/.test(next.activity.datePreset || "")) {
    const days = Number(next.activity.datePreset.slice(0, -1));
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    next.activity.dateFrom = from.toISOString().slice(0, 10);
    next.activity.dateTo = to.toISOString().slice(0, 10);
  }
  if (next.comparison.scoreMode === "volume") next.comparison.scoreMode = "absolute";
  next.population.rankN = Math.min(250, Math.max(1, Number(next.population.rankN) || 25));
  return next;
}
