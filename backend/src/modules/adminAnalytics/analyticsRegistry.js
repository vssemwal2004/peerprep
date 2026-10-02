import { percentage, roundMetric } from './analyticsFormulas.js';
import { ANALYTICS_LIMITS, GRAPH_IDS } from './adminAnalytics.validation.js';

const LABELS = Object.freeze({
  'activity-trend': 'Multi-line activity trend',
  'student-ranking': 'Student ranking',
  'topic-student-heatmap': 'Topic × student heatmap',
  'topic-performance': 'Topic performance',
  'difficulty-analysis': 'Difficulty analysis',
  'assessment-topic-analysis': 'Assessment topic analysis',
  'skill-radar': 'Skill profile',
  'mastery-funnel': 'Mastery funnel',
  'performance-distribution': 'Performance distribution',
  'cohort-comparison': 'Cohort comparison',
  'assessment-score-trend': 'Assessment score trend',
  'learning-hierarchy': 'Learning completion hierarchy',
  'question-conversion': 'Question conversion',
  'engagement-calendar': 'Engagement calendar',
  'score-effort-scatter': 'Score vs effort',
});

function ready(id, data, config = {}) {
  return { id, title: LABELS[id], status: Array.isArray(data) && !data.length ? 'empty' : 'ready', config, data };
}

function unavailable(id, reason, status = 'not_relevant') {
  return { id, title: LABELS[id], status, reason, config: {}, data: [] };
}

function dateKey(date, grain) {
  const value = new Date(date);
  if (grain === 'month') return value.toISOString().slice(0, 7);
  if (grain === 'week') {
    const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return start.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return roundMetric(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

function resolveGrain(query) {
  if (query.timeGrain !== 'auto') return query.timeGrain;
  if (query.date.spanDays > 180) return 'month';
  if (query.date.spanDays > 45) return 'week';
  return 'day';
}

function metricForStudent(row, metric) {
  if (metric === 'coding') return row.coding.mastery ?? row.coding.acceptanceRate;
  if (metric === 'assessment') return row.assessment.normalizedScore;
  if (metric === 'learning') return row.learning.completionRate;
  if (metric === 'consistency') return row.consistency;
  return row.overall.value;
}

function buildActivityTrend(context) {
  const { coding, assessment, learning, query } = context;
  const grain = resolveGrain(query);
  const buckets = new Map();
  const ensure = (key) => {
    if (!buckets.has(key)) buckets.set(key, { bucket: key, codingSolved: 0, learningCompleted: 0, assessmentsAttempted: 0 });
    return buckets.get(key);
  };
  const firstSolved = new Map();
  for (const row of coding?.activity || []) {
    if (row.kind !== 'solved') continue;
    const pair = `${row.studentId}:${row.problemId}`;
    const previous = firstSolved.get(pair);
    if (!previous || row.at < previous) firstSolved.set(pair, row.at);
  }
  for (const at of firstSolved.values()) ensure(dateKey(at, grain)).codingSolved += 1;
  for (const row of learning?.activity || []) if (row.kind === 'learned') ensure(dateKey(row.at, grain)).learningCompleted += 1;
  for (const row of assessment?.activity || []) ensure(dateKey(row.at, grain)).assessmentsAttempted += 1;
  const data = [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  return data.length ? ready('activity-trend', data, { grain, labelKey: 'bucket', series: [{ key: 'codingSolved', label: 'Problems solved' }, { key: 'learningCompleted', label: 'Topics completed' }, { key: 'assessmentsAttempted', label: 'Assessments attempted' }] }) : unavailable('activity-trend', 'No meaningful activity exists in the selected window.', 'empty');
}

function buildRanking({ students, studentMetrics, query }) {
  const metric = query.population.rank.metric;
  let data = students.map((student) => {
    const metrics = studentMetrics.get(String(student._id));
    return { studentId: String(student._id), name: student.name || 'Student', studentCode: student.studentId || '', value: metricForStudent(metrics, metric), evidence: metrics.evidence };
  }).filter((row) => row.value !== null && (!query.population.rank.minimumEvidence || row.evidence[metric] !== false));
  const multiplier = query.population.rank.direction === 'bottom' ? 1 : -1;
  data.sort((a, b) => multiplier * (a.value - b.value) || a.name.localeCompare(b.name) || a.studentId.localeCompare(b.studentId));
  data = data.slice(0, query.population.rank.n);
  return data.length >= 2 ? ready('student-ranking', data, { metric, direction: query.population.rank.direction, labelKey: 'name', valueKey: 'value', valueLabel: `${metric} score` }) : unavailable('student-ranking', 'At least two students with sufficient evidence are required.');
}

function buildHeatmap({ students, coding, learning }) {
  const hasCoding = coding?.topicStats?.size > 0;
  const hasLearning = learning?.perTopic?.size > 0;
  if (hasCoding && hasLearning) return unavailable('topic-student-heatmap', 'Combined heatmap requires an explicit cross-source topic mapping. Select one source.');
  if (students.length > ANALYTICS_LIMITS.maxHeatmapStudents) return unavailable('topic-student-heatmap', `Heatmap is limited to ${ANALYTICS_LIMITS.maxHeatmapStudents} students. Narrow the population.`);
  if (hasCoding) {
    const topics = [...coding.topicStats.values()].sort((a, b) => b.attempts - a.attempts).slice(0, ANALYTICS_LIMITS.maxHeatmapTopics);
    const rows = students.map((student) => ({
      studentId: String(student._id), name: student.name || 'Student',
      cells: topics.map((topic) => {
        const prefix = `${student._id}:`;
        const pairs = [...topic.pairs.entries()].filter(([key]) => key.startsWith(prefix));
        return { topic: topic.topic, value: pairs.length ? percentage(pairs.filter(([, solved]) => solved).length, pairs.length) : null };
      }),
    }));
    return ready('topic-student-heatmap', { rows, columns: topics.map((topic) => topic.topic) }, { source: 'coding', labelKey: 'name' });
  }
  if (hasLearning) {
    const byId = new Map(learning.topics.map((topic) => [topic.topicId, topic]));
    const topics = [...learning.perTopic.entries()].sort((a, b) => b[1].engagedStudents.size - a[1].engagedStudents.size).slice(0, ANALYTICS_LIMITS.maxHeatmapTopics);
    const rows = students.map((student) => ({ studentId: String(student._id), name: student.name || 'Student', cells: topics.map(([id, stats]) => ({ topic: byId.get(id)?.topic || 'Topic', value: stats.eligibleStudents.has(String(student._id)) ? (stats.completedStudents.has(String(student._id)) ? 100 : 0) : null })) }));
    return ready('topic-student-heatmap', { rows, columns: topics.map(([id]) => byId.get(id)?.topic || 'Topic') }, { source: 'learning', labelKey: 'name' });
  }
  return unavailable('topic-student-heatmap', 'No topic-level coding or learning evidence is available.');
}

function buildTopicPerformance({ coding, learning }) {
  const data = [];
  for (const stats of coding?.topicStats?.values() || []) data.push({ source: 'coding', topic: stats.topic, attempts: stats.attempts, participants: stats.students.size, completed: stats.solvedStudents.size, rate: percentage([...stats.pairs.values()].filter(Boolean).length, stats.pairs.size) });
  const learningById = new Map((learning?.topics || []).map((topic) => [topic.topicId, topic]));
  for (const [id, stats] of learning?.perTopic || []) data.push({ source: 'learning', topic: learningById.get(id)?.topic || 'Topic', attempts: stats.engagedStudents.size, participants: stats.engagedStudents.size, completed: stats.completedStudents.size, rate: percentage(stats.completedStudents.size, stats.eligibleStudents.size) });
  data.sort((a, b) => b.attempts - a.attempts || a.topic.localeCompare(b.topic));
  return data.length ? ready('topic-performance', data.slice(0, 50), { labelKey: 'topic', series: [{ key: 'rate', label: 'Outcome rate (%)' }] }) : unavailable('topic-performance', 'No mapped topics have evidence.');
}

function buildDifficulty({ coding }) {
  if (!coding?.topicStats?.size) return unavailable('difficulty-analysis', 'Coding topic difficulty metadata is required.');
  const data = [];
  for (const stats of coding.topicStats.values()) {
    const row = { topic: stats.topic };
    for (const [difficulty, values] of stats.difficulty) row[difficulty] = percentage(values.accepted, values.attempts);
    data.push(row);
  }
  return ready('difficulty-analysis', data.slice(0, 30), { labelKey: 'topic', series: [{ key: 'Easy', label: 'Easy success (%)' }, { key: 'Medium', label: 'Medium success (%)' }, { key: 'Hard', label: 'Hard success (%)' }] });
}

function buildDistribution({ studentMetrics }) {
  const scores = [...studentMetrics.values()].map((row) => row.overall.value).filter(Number.isFinite);
  if (scores.length < 5) return unavailable('performance-distribution', 'At least five eligible scored students are required.');
  const bands = [{ band: '0–20', min: 0, max: 20 }, { band: '21–40', min: 20, max: 40 }, { band: '41–60', min: 40, max: 60 }, { band: '61–80', min: 60, max: 80 }, { band: '81–100', min: 80, max: 101 }];
  return ready('performance-distribution', bands.map((band, index) => ({ label: band.band, count: scores.filter((score) => score >= band.min && (index === 0 ? score <= band.max : score > band.min) && score <= band.max).length })), { labelKey: 'label', series: [{ key: 'count', label: 'Students' }] });
}

function buildComparison({ students, studentMetrics, query }) {
  const dimension = query.comparison.by;
  if (dimension === 'none' || ['assessment', 'learningSubject', 'topic'].includes(dimension)) return unavailable('cohort-comparison', 'Select semester, branch, course, group, college, or upload batch comparison.');
  const groups = new Map();
  for (const student of students) {
    const value = dimension === 'uploadBatch' ? student.uploadBatchIds?.[0] : student[dimension];
    if (value === undefined || value === null || value === '') continue;
    const key = String(value);
    const score = metricForStudent(studentMetrics.get(String(student._id)), query.population.rank.metric);
    if (score === null) continue;
    const group = groups.get(key) || [];
    group.push(score); groups.set(key, group);
  }
  if (groups.size < 2 || groups.size > 12) return unavailable('cohort-comparison', 'Comparison requires between 2 and 12 populated groups.');
  return ready('cohort-comparison', [...groups].map(([group, values]) => ({ label: group, students: values.length, value: roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length) })), { dimension, labelKey: 'label', series: [{ key: 'value', label: 'Average score' }] });
}

function buildAssessmentTrend({ assessment, students }) {
  if (!assessment?.perAssessment?.size) return unavailable('assessment-score-trend', 'At least two completed assessments or time buckets are required.');
  const definitions = new Map(assessment.definitions.map((item) => [String(item._id), item]));
  const cohortIds = new Set(students.map((student) => String(student._id)));
  const data = [...assessment.perAssessment.values()].map((entry) => {
    const definition = definitions.get(entry.assessmentId);
    const percentages = entry.attempts.map((row) => percentage(row.score, row.maxMarks)).filter(Number.isFinite);
    const eligible = definition?.targetType === 'selected' ? (definition.assignedStudents || []).map(String).filter((id) => cohortIds.has(id)).length : students.length;
    return { assessmentId: entry.assessmentId, title: definition?.title || 'Assessment', average: roundMetric(percentages.reduce((sum, value) => sum + value, 0) / percentages.length), median: median(percentages), participants: new Set(entry.attempts.map((row) => row.studentId)).size, eligible, participationRate: percentage(new Set(entry.attempts.map((row) => row.studentId)).size, eligible) };
  }).sort((a, b) => a.title.localeCompare(b.title));
  return data.length >= 2 ? ready('assessment-score-trend', data, { labelKey: 'title', series: [{ key: 'average', label: 'Average score (%)' }, { key: 'median', label: 'Median score (%)' }, { key: 'participationRate', label: 'Participation (%)' }] }) : unavailable('assessment-score-trend', 'At least two completed assessments or time buckets are required.');
}

function buildLearningHierarchy({ learning }) {
  if (!learning?.perTopic?.size) return unavailable('learning-hierarchy', 'No assigned learning topics have meaningful evidence.');
  const metadata = new Map(learning.topics.map((topic) => [topic.topicId, topic]));
  const groups = new Map();
  for (const [id, stats] of learning.perTopic) {
    const topic = metadata.get(id); if (!topic) continue;
    const group = groups.get(topic.subjectId) || { subjectId: topic.subjectId, subject: topic.subject, eligiblePairs: 0, completedPairs: 0, engagedPairs: 0, topics: 0 };
    group.eligiblePairs += stats.eligibleStudents.size; group.completedPairs += stats.completedStudents.size; group.engagedPairs += stats.engagedStudents.size; group.topics += 1;
    groups.set(topic.subjectId, group);
  }
  return ready('learning-hierarchy', [...groups.values()].map((group) => ({ ...group, label: group.subject, completionRate: percentage(group.completedPairs, group.eligiblePairs), engagementRate: percentage(group.engagedPairs, group.eligiblePairs) })), { labelKey: 'label', series: [{ key: 'completionRate', label: 'Completion (%)' }, { key: 'engagementRate', label: 'Engagement (%)' }] });
}

function buildConversion({ coding }) {
  if (!coding?.problemStats?.size) return unavailable('question-conversion', 'No attempted coding problems are available.');
  const data = [...coding.problemStats.values()].map((row) => ({ problemId: row.problemId, title: row.title, attempts: row.attempts, attemptedStudents: row.students.size, solvedStudents: row.solvedStudents.size, conversionRate: percentage(row.solvedStudents.size, row.students.size) })).sort((a, b) => a.conversionRate - b.conversionRate || b.attempts - a.attempts).slice(0, 30);
  return ready('question-conversion', data, { labelKey: 'title', series: [{ key: 'conversionRate', label: 'Student conversion (%)' }] });
}

function buildCalendar({ coding, assessment, learning, query }) {
  if (query.date.spanDays > 366) return unavailable('engagement-calendar', 'Calendar range cannot exceed one year.');
  const days = new Map();
  for (const source of [coding, assessment, learning]) for (const event of source?.activity || []) {
    if (event.kind === 'learning-engagement' || event.kind === 'learned' || event.kind === 'assessment' || event.kind === 'attempted' || event.kind === 'solved') {
      const key = new Date(event.at).toISOString().slice(0, 10);
      const students = days.get(key) || new Set(); students.add(event.studentId); days.set(key, students);
    }
  }
  const data = [...days].map(([date, ids]) => ({ date, activeStudents: ids.size })).sort((a, b) => a.date.localeCompare(b.date));
  return data.length ? ready('engagement-calendar', data, { labelKey: 'date', valueKey: 'activeStudents', valueLabel: 'Active students' }) : unavailable('engagement-calendar', 'No meaningful activity exists in this window.', 'empty');
}

function buildScatter({ students, studentMetrics }) {
  const data = students.map((student) => {
    const row = studentMetrics.get(String(student._id));
    return { studentId: String(student._id), name: student.name || 'Student', score: row.overall.value, effort: row.effortEvents };
  }).filter((row) => Number.isFinite(row.score) && row.effort > 0).slice(0, ANALYTICS_LIMITS.maxScatterPoints);
  return data.length >= 5 ? ready('score-effort-scatter', data, { labelKey: 'name', xKey: 'effort', yKey: 'score', xLabel: 'Evidence events', yLabel: 'Score (%)', effortMeasure: 'evidence events', sampled: students.length > ANALYTICS_LIMITS.maxScatterPoints }) : unavailable('score-effort-scatter', 'At least five students need both score and effort evidence.');
}

export function buildAnalyticsGraphs(context) {
  const graphMap = {
    'activity-trend': buildActivityTrend(context),
    'student-ranking': buildRanking(context),
    'topic-student-heatmap': buildHeatmap(context),
    'topic-performance': buildTopicPerformance(context),
    'difficulty-analysis': buildDifficulty(context),
    'assessment-topic-analysis': unavailable('assessment-topic-analysis', 'Per-question awarded marks are not persisted; assessment topic scores cannot be calculated safely.'),
    'skill-radar': unavailable('skill-radar', 'A canonical cross-source skill taxonomy is not configured.'),
    'mastery-funnel': unavailable('mastery-funnel', 'A reliable learning-to-coding-to-assessment topic mapping is required.'),
    'performance-distribution': buildDistribution(context),
    'cohort-comparison': buildComparison(context),
    'assessment-score-trend': buildAssessmentTrend(context),
    'learning-hierarchy': buildLearningHierarchy(context),
    'question-conversion': buildConversion(context),
    'engagement-calendar': buildCalendar(context),
    'score-effort-scatter': buildScatter(context),
  };
  return GRAPH_IDS.map((id) => graphMap[id]);
}

export function selectRecommendedGraphs(graphs = [], query = {}) {
  const sourceBonus = { coding: ['difficulty-analysis', 'question-conversion', 'topic-performance'], assessment: ['assessment-score-trend', 'performance-distribution'], learning: ['learning-hierarchy', 'topic-performance'] };
  return graphs.filter((graph) => graph.status === 'ready').map((graph) => {
    let score = ['activity-trend', 'student-ranking', 'performance-distribution'].includes(graph.id) ? 2 : 1;
    for (const source of query.sources || []) if (sourceBonus[source]?.includes(graph.id)) score += 3;
    if (query.comparison?.by !== 'none' && graph.id === 'cohort-comparison') score += 2;
    if (query.population?.studentIds?.length && ['topic-student-heatmap', 'score-effort-scatter'].includes(graph.id)) score += 2;
    return { id: graph.id, score };
  }).sort((a, b) => b.score - a.score || GRAPH_IDS.indexOf(a.id) - GRAPH_IDS.indexOf(b.id)).slice(0, 10).map((entry) => entry.id);
}
