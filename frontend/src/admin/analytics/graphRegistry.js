import {
  Activity,
  BarChart3,
  CalendarDays,
  ChartNoAxesCombined,
  CircleGauge,
  GitCompareArrows,
  Grid3X3,
  Layers3,
  ListFilter,
  Radar,
  ScatterChart,
  Target,
  TrendingUp,
  Trophy,
  Waypoints,
} from "lucide-react";

export const GRAPH_GROUPS = ["Overview", "Students", "Topics", "Assessments", "Learning", "Coding"];

export const GRAPH_REGISTRY = [
  { id: "activity-trend", title: "Activity trend", description: "Solved, completed and attempted evidence over time.", group: "Overview", icon: TrendingUp, size: "wide", renderer: "trend" },
  { id: "student-ranking", title: "Student ranking", description: "Top or bottom eligible students for the selected metric.", group: "Students", icon: Trophy, renderer: "ranking" },
  { id: "topic-student-heatmap", title: "Topic × student heatmap", description: "Strength and risk patterns across students and topics.", group: "Topics", icon: Grid3X3, size: "wide", renderer: "heatmap" },
  { id: "topic-performance", title: "Topic performance", description: "Outcome rate and evidence volume by topic.", group: "Topics", icon: BarChart3, renderer: "topic" },
  { id: "difficulty-analysis", title: "Difficulty analysis", description: "Easy, medium and hard outcomes topic by topic.", group: "Coding", icon: Layers3, renderer: "difficulty" },
  { id: "assessment-topic-analysis", title: "Assessment topic analysis", description: "Normalized score and participation by tagged topic.", group: "Assessments", icon: Target, renderer: "assessmentTopic" },
  { id: "skill-radar", title: "Skill profile", description: "Evidence-backed skill profile for this scope.", group: "Overview", icon: Radar, renderer: "radar" },
  { id: "mastery-funnel", title: "Mastery funnel", description: "Eligible → learned → practiced → solved → assessed → mastered.", group: "Overview", icon: Waypoints, size: "wide", renderer: "funnel" },
  { id: "performance-distribution", title: "Performance distribution", description: "Students grouped into normalized score bands.", group: "Students", icon: ChartNoAxesCombined, renderer: "distribution" },
  { id: "cohort-comparison", title: "Cohort comparison", description: "Compare the selected KPI across cohort dimensions.", group: "Overview", icon: GitCompareArrows, renderer: "comparison" },
  { id: "assessment-score-trend", title: "Assessment score trend", description: "Average and median scores across assessments or time.", group: "Assessments", icon: Activity, renderer: "assessmentTrend" },
  { id: "learning-hierarchy", title: "Learning completion", description: "Completion and engagement across the learning hierarchy.", group: "Learning", icon: ListFilter, renderer: "hierarchy" },
  { id: "question-conversion", title: "Question conversion", description: "Attempt-to-success conversion and the largest gaps.", group: "Coding", icon: CircleGauge, renderer: "conversion" },
  { id: "engagement-calendar", title: "Engagement calendar", description: "Daily active-student intensity for the selected window.", group: "Students", icon: CalendarDays, size: "wide", renderer: "calendar" },
  { id: "score-effort-scatter", title: "Score vs effort", description: "Relationship between performance and effort, with outliers.", group: "Students", icon: ScatterChart, renderer: "scatter" },
];

export const GRAPH_BY_ID = Object.fromEntries(GRAPH_REGISTRY.map((graph) => [graph.id, graph]));

export function getGraphState(definition, serverGraph) {
  if (!serverGraph) return { status: "not_requested", reason: "Apply filters to evaluate this graph." };
  const status = serverGraph.status || (Array.isArray(serverGraph.data) && serverGraph.data.length ? "ready" : "empty");
  return { status, reason: serverGraph.reason || (status === "empty" ? "No qualifying evidence in this scope." : "") };
}

export function getVisibleGraphs({ mode, selectedIds, graphs }) {
  const byId = Object.fromEntries((graphs || []).map((graph) => [graph.id, graph]));
  const serverSelectedIds = (graphs || []).filter((graph) => graph.selected).map((graph) => graph.id);
  const activeIds = mode === "custom" ? selectedIds : serverSelectedIds;
  const candidates = GRAPH_REGISTRY.filter((graph) => activeIds.includes(graph.id));
  return candidates
    .map((definition) => ({ definition, payload: byId[definition.id], ...getGraphState(definition, byId[definition.id]) }))
    .filter((item) => item.status === "ready" || item.status === "partial");
}
