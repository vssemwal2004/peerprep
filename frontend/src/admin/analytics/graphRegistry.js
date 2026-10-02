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
  PieChart,
  Radar,
  ScatterChart,
  Target,
  TrendingUp,
  Trophy,
  Waypoints,
} from "lucide-react";

export const GRAPH_GROUPS = ["Overview", "Students", "Topics", "Assessments", "Learning", "Coding"];

export const GRAPH_REGISTRY = [
  { id: "activity-trend", title: "Activity trend", question: "How is student activity changing over time?", description: "Compares coding, learning and assessment activity in each time period.", group: "Overview", chartType: "Line chart", xAxis: "Time period", yAxis: "Activity events", unit: "events", layout: "wide", read: "Rising lines indicate growing activity; compare line direction and gaps between sources.", icon: TrendingUp, renderer: "trend" },
  { id: "student-ranking", title: "Student ranking", question: "Who is performing strongest, and who may need support?", description: "Ranks eligible students using the selected normalized performance metric.", group: "Students", chartType: "Ranked bars", xAxis: "Performance score", yAxis: "Students", unit: "score", read: "Longer bars indicate stronger performance. Ranking direction follows the selected Top or Bottom filter.", icon: Trophy, renderer: "ranking" },
  { id: "topic-student-heatmap", title: "Topic × student heatmap", question: "Which student-topic combinations are strong or at risk?", description: "Maps each student's evidence-backed outcome rate across available topics.", group: "Topics", chartType: "Heatmap", xAxis: "Topics", yAxis: "Students", unit: "%", layout: "wide", read: "Green cells are stronger outcomes; amber and red cells identify areas needing attention. Gray means insufficient evidence.", icon: Grid3X3, renderer: "heatmap" },
  { id: "topic-performance", title: "Topic performance", question: "Which topics have the highest and lowest outcomes?", description: "Compares the overall evidence-backed outcome rate for each topic.", group: "Topics", chartType: "Horizontal bars", xAxis: "Outcome rate", yAxis: "Topics", unit: "%", read: "Longer bars indicate stronger topic outcomes. Use the lowest bars to prioritize intervention.", icon: BarChart3, renderer: "topic" },
  { id: "difficulty-analysis", title: "Difficulty analysis", question: "How does success change from Easy to Hard questions?", description: "Compares success rates by difficulty within each coding topic.", group: "Coding", chartType: "Grouped bars", xAxis: "Topics", yAxis: "Success rate", unit: "%", read: "Compare colors inside each topic. A large Easy-to-Hard drop highlights a difficulty progression gap.", icon: Layers3, renderer: "difficulty" },
  { id: "assessment-topic-analysis", title: "Assessment topic analysis", question: "Which assessed topics are strongest and weakest?", description: "Compares normalized score and participation across tagged assessment topics.", group: "Assessments", chartType: "Horizontal bars", xAxis: "Score / participation", yAxis: "Topics", unit: "%", read: "Read score and participation together; high scores based on low participation need cautious interpretation.", icon: Target, renderer: "assessmentTopic" },
  { id: "skill-radar", title: "Skill profile", question: "How balanced is this cohort across its evidence dimensions?", description: "Compares coding mastery, assessment, learning and consistency without inventing unsupported subject skills.", group: "Overview", chartType: "Radar chart", xAxis: "Evidence dimensions", yAxis: "Normalized score", unit: "%", read: "A larger, more balanced shape indicates broader evidence strength; inward points expose the dimensions needing attention.", icon: Radar, renderer: "radar" },
  { id: "mastery-funnel", title: "Mastery funnel", question: "Where do students drop between learning and mastery?", description: "Tracks eligible students through learning, practice, assessment and mastery stages.", group: "Overview", chartType: "Conversion funnel", xAxis: "Progress stage", yAxis: "Students retained", unit: "students", read: "The largest narrowing between two stages is the highest-priority conversion gap.", icon: Waypoints, renderer: "funnel" },
  { id: "performance-distribution", title: "Performance distribution", question: "How are students distributed across score bands?", description: "Groups eligible students into normalized performance bands.", group: "Students", chartType: "Column chart", xAxis: "Score band", yAxis: "Students", unit: "students", read: "Tall bars show where most students sit; concentration in lower bands signals cohort-wide support needs.", icon: ChartNoAxesCombined, renderer: "distribution" },
  { id: "cohort-comparison", title: "Cohort comparison", question: "How do selected cohort groups compare?", description: "Compares average normalized performance across the selected cohort dimension.", group: "Overview", chartType: "Column chart", xAxis: "Cohort groups", yAxis: "Average score", unit: "score", read: "Compare bar heights to identify meaningful group gaps; check cohort size before drawing conclusions.", icon: GitCompareArrows, renderer: "comparison" },
  { id: "assessment-score-trend", title: "Assessment score trend", question: "Are assessment outcomes improving over time?", description: "Tracks average, median and participation across completed assessments.", group: "Assessments", chartType: "Trend chart", xAxis: "Assessments", yAxis: "Score / participation", unit: "%", read: "Average and median moving together indicate a broad shift; participation explains how representative it is.", icon: Activity, renderer: "assessmentTrend" },
  { id: "learning-hierarchy", title: "Learning completion", question: "Which learning areas have completion or engagement gaps?", description: "Compares completion and engagement across assigned learning areas.", group: "Learning", chartType: "Horizontal bars", xAxis: "Completion / engagement", yAxis: "Learning areas", unit: "%", read: "A large gap between engagement and completion suggests students start content but do not finish it.", icon: ListFilter, renderer: "hierarchy" },
  { id: "question-conversion", title: "Question conversion", question: "Which coding problems lose the most students after an attempt?", description: "Shows the percentage of attempting students who achieved a successful result.", group: "Coding", chartType: "Horizontal bars", xAxis: "Successful conversion", yAxis: "Coding problems", unit: "%", read: "Short bars reveal problems with the largest attempt-to-success gap and may need review or remediation.", icon: CircleGauge, renderer: "conversion" },
  { id: "engagement-calendar", title: "Engagement calendar", question: "On which days is student engagement highest or lowest?", description: "Shows daily active-student intensity across the selected time window.", group: "Students", chartType: "Calendar heatmap", xAxis: "Calendar date", yAxis: "Day of week", unit: "active students", layout: "wide", read: "Darker cells represent more active students. Repeating light periods expose engagement gaps.", icon: CalendarDays, renderer: "calendar" },
  { id: "score-effort-scatter", title: "Score vs effort", question: "Does higher effort translate into stronger performance?", description: "Plots each eligible student by evidence volume and normalized score.", group: "Students", chartType: "Scatter plot", xAxis: "Evidence events", yAxis: "Performance score", unit: "%", read: "Top-right is high effort/high score; bottom-right highlights high effort with low outcomes and possible support needs.", icon: ScatterChart, renderer: "scatter" },
  { id: "source-mix", title: "Evidence source mix", question: "What proportion of analyzed activity comes from each source?", description: "Shows the relative contribution of coding, assessment and learning evidence.", group: "Overview", chartType: "Donut chart", xAxis: "Evidence source", yAxis: "Share of activity", unit: "events", read: "Larger segments contribute more evidence. A highly dominant segment means the overall analysis is being driven mainly by that source.", icon: PieChart, renderer: "donut" },
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
