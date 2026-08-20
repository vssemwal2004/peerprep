export const STATUS_STYLES = {
  Ready: {
    label: "Ready",
    tone: "emerald",
    description: "Placement preparation is in a strong zone.",
  },
  "Almost Ready": {
    label: "Almost Ready",
    tone: "sky",
    description: "Close to target. A few focused gaps remain.",
  },
  Improving: {
    label: "Improving",
    tone: "amber",
    description: "Momentum is building. Keep the routine steady.",
  },
  "Not Ready": {
    label: "Not Ready",
    tone: "rose",
    description: "The next step is focused practice and consistency.",
  },
};

export const ANALYTICS_SECTION_IDS = ["overview", "coding", "assessments", "interviews", "learning", "placement"];

export const CHART_COLORS = {
  sky: "#0ea5e9",
  skySoft: "#7dd3fc",
  emerald: "#10b981",
  emeraldSoft: "#86efac",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#0ea5e9",
  slate: "#0f172a",
};

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function round(value, digits = 0) {
  const number = Number(value) || 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

export function formatPercent(value, fallback = "0%") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return `${Math.round(Number(value))}%`;
}

export function formatNumber(value, fallback = "0") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return new Intl.NumberFormat().format(Number(value));
}

export function titleize(value = "") {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function statusLabel(score = 0) {
  const value = Number(score) || 0;
  if (value >= 85) return "Ready";
  if (value >= 70) return "Almost Ready";
  if (value >= 50) return "Improving";
  return "Not Ready";
}

export function averageValues(items = []) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + Number(item.value ?? item.score ?? 0), 0) / items.length;
}

export function normalizeTopicLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unknown";
  return raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function getScoreTone(score = 0) {
  const value = Number(score) || 0;
  if (value >= 80) return "emerald";
  if (value >= 60) return "sky";
  if (value >= 40) return "amber";
  return "rose";
}

export function getToneClasses(tone = "sky") {
  const tones = {
    sky: {
      panel: "border-sky-200/70 bg-sky-50/70 text-sky-800 dark:border-sky-400/15 dark:bg-sky-400/10 dark:text-sky-200",
      pill: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20",
      icon: "bg-sky-500 text-white shadow-sky-500/25",
      dot: "bg-sky-500",
      bar: "bg-sky-500",
      text: "text-sky-700 dark:text-sky-300",
    },
    emerald: {
      panel: "border-emerald-200/70 bg-emerald-50/70 text-emerald-800 dark:border-emerald-400/15 dark:bg-emerald-400/10 dark:text-emerald-200",
      pill: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20",
      icon: "bg-emerald-500 text-white shadow-emerald-500/25",
      dot: "bg-emerald-500",
      bar: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-300",
    },
    amber: {
      panel: "border-amber-200/70 bg-amber-50/70 text-amber-800 dark:border-amber-400/15 dark:bg-amber-400/10 dark:text-amber-200",
      pill: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20",
      icon: "bg-amber-500 text-white shadow-amber-500/25",
      dot: "bg-amber-500",
      bar: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-300",
    },
    rose: {
      panel: "border-rose-200/70 bg-rose-50/70 text-rose-800 dark:border-rose-400/15 dark:bg-rose-400/10 dark:text-rose-200",
      pill: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20",
      icon: "bg-rose-500 text-white shadow-rose-500/25",
      dot: "bg-rose-500",
      bar: "bg-rose-500",
      text: "text-rose-700 dark:text-rose-300",
    },
    violet: {
      panel: "border-sky-200/70 bg-sky-50/70 text-sky-800 dark:border-sky-400/15 dark:bg-sky-400/10 dark:text-sky-200",
      pill: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20",
      icon: "bg-sky-500 text-white shadow-sky-500/25",
      dot: "bg-sky-500",
      bar: "bg-sky-500",
      text: "text-sky-700 dark:text-sky-300",
    },
    slate: {
      panel: "border-slate-200/80 bg-slate-50/80 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
      pill: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
      icon: "bg-slate-800 text-white shadow-slate-900/20 dark:bg-slate-200 dark:text-slate-950",
      dot: "bg-slate-500",
      bar: "bg-slate-700 dark:bg-slate-300",
      text: "text-slate-700 dark:text-slate-300",
    },
  };

  return tones[tone] || tones.sky;
}

export function buildModuleScores({ problems, assessments, interviews, learning }) {
  return [
    {
      id: "problems",
      label: "Problems",
      value: Math.round(problems?.accuracy || 0),
      helper: "DSA accuracy",
      tone: "sky",
    },
    {
      id: "assessments",
      label: "Assessments",
      value: Math.round(assessments?.adjustedAvgScore ?? assessments?.avgScore ?? 0),
      helper: assessments?.integrityScore < 85 ? "Adjusted for integrity" : "Adjusted average",
      tone: getScoreTone(assessments?.adjustedAvgScore ?? assessments?.avgScore),
    },
    {
      id: "interviews",
      label: "Interviews",
      value: Math.round(interviews?.avgScore || 0),
      helper: "Feedback average",
      tone: "sky",
    },
    {
      id: "learning",
      label: "Learning",
      value: Math.round(learning?.completionPercent || 0),
      helper: "Completion",
      tone: "sky",
    },
  ];
}

export function buildTopicAnalytics(topics = []) {
  const normalized = [...topics]
    .map((topic) => ({
      topic: normalizeTopicLabel(topic.topic),
      attempts: Number(topic.attempts || 0),
      accuracy: clamp(topic.accuracy),
      level: topic.level || "medium",
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const active = normalized.filter((topic) => topic.attempts > 0);
  const strong = normalized.filter((topic) => topic.level === "strong" || topic.accuracy >= 75);
  const weak = active.filter((topic) => topic.level === "weak" || topic.accuracy < 55);
  const ignored = normalized.filter((topic) => topic.attempts === 0);
  const strongest = [...active].sort((a, b) => b.accuracy - a.accuracy)[0] || null;
  const weakest = [...active].sort((a, b) => a.accuracy - b.accuracy)[0] || null;
  const mostPracticed = [...normalized].sort((a, b) => b.attempts - a.attempts)[0] || null;
  const lowVolume = active
    .filter((topic) => topic.attempts <= 3)
    .sort((a, b) => a.attempts - b.attempts)
    .slice(0, 5);

  return { normalized, active, strong, weak, ignored, strongest, weakest, mostPracticed, lowVolume };
}

export function buildAssessmentMovement(progress = []) {
  const lastFive = progress.slice(-5);
  const previousFive = progress.slice(-10, -5);
  const recentAverage = averageValues(lastFive);
  const previousAverage = averageValues(previousFive);
  const movement = previousAverage
    ? Math.round(((recentAverage - previousAverage) / previousAverage) * 100)
    : null;
  const spread = progress.length
    ? Math.max(...progress.map((item) => Number(item.value || 0))) - Math.min(...progress.map((item) => Number(item.value || 0)))
    : 0;

  return { recentAverage, previousAverage, movement, spread };
}

export function toInterviewCategoryData(categoryScores = {}) {
  return Object.entries(categoryScores).map(([key, value]) => ({
    label: titleize(key),
    value: Math.round((Number(value) || 0) * 20),
  }));
}
