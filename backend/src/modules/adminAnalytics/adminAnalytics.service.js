import crypto from 'crypto';
import User from '../../models/User.js';
import Assessment from '../../models/Assessment.js';
import Problem from '../../models/Problem.js';
import StudentUploadBatch from '../../models/StudentUploadBatch.js';
import Semester from '../../models/Subject.js';
import {
  assessmentMetrics, buildFormulaMetadata, codingMetrics, combinedScore,
  consistencyScore, FORMULA_VERSION, learningMetrics, percentage, roundMetric,
} from './analyticsFormulas.js';
import { resolveAuthorizedCohort, authorizedLearningFilter, authorizedOwnedFilter, authorizedStudentBaseFilter } from './adminAnalytics.authorization.js';
import { buildAnalyticsGraphs, selectRecommendedGraphs } from './analyticsRegistry.js';
import { collectCodingEvidence } from './pipelines/coding.pipeline.js';
import { collectAssessmentEvidence } from './pipelines/assessment.pipeline.js';
import { collectLearningEvidence } from './pipelines/learning.pipeline.js';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function fingerprintQuery(query, user) {
  const scope = user?.role === 'coordinator' ? `${user._id}:${user.coordinatorDataScope}:${user.coordinatorId}` : String(user?.role || 'unknown');
  return crypto.createHash('sha256').update(JSON.stringify({ query: stable(query), scope, formulaVersion: FORMULA_VERSION })).digest('hex').slice(0, 24);
}

export function buildStudentMetricRows(students, query, coding, assessment, learning) {
  const map = new Map();
  for (const student of students) {
    const id = String(student._id);
    const codingRow = coding?.perStudent.get(id);
    const assessmentRow = assessment?.perStudent.get(id);
    const learningRow = learning?.perStudent.get(id);
    const codingValue = codingMetrics({
      attempts: codingRow?.attempts || 0,
      acceptedAttempts: codingRow?.acceptedAttempts || 0,
      distinctProblems: codingRow?.attemptedProblems.size || 0,
      solvedProblems: codingRow?.solvedProblems.size || 0,
      eligibleProblems: coding?.problems.length || 0,
    });
    const assessmentValue = assessmentMetrics(assessmentRow?.attempts || []);
    const learningValue = learningMetrics({
      eligibleTopics: learningRow?.eligibleTopics?.size || 0,
      completedTopics: learningRow?.completedTopics.size || 0,
      engagedTopics: learningRow?.engagedTopics.size || 0,
      watchedSeconds: learningRow?.watchedSeconds || 0,
    });
    const activeDays = new Set([
      ...(codingRow?.activeDays || []), ...(assessmentRow?.activeDays || []), ...(learningRow?.activeDays || []),
    ]);
    const hasActivityEvidence = Boolean(codingRow || assessmentRow || learningRow?.engagedTopics?.size);
    const consistency = hasActivityEvidence ? consistencyScore(activeDays.size, query.date.spanDays) : null;
    const overall = combinedScore({
      coding: { value: codingValue.mastery ?? codingValue.acceptanceRate, sufficientEvidence: codingValue.sufficientEvidence },
      assessment: { value: assessmentValue.normalizedScore, sufficientEvidence: assessmentValue.sufficientEvidence },
      learning: { value: learningValue.completionRate, sufficientEvidence: learningValue.sufficientEvidence },
      consistency: { value: consistency, sufficientEvidence: hasActivityEvidence },
    }, { requireMinimumEvidence: query.population.rank.minimumEvidence });
    map.set(id, {
      coding: codingValue, assessment: assessmentValue, learning: learningValue, consistency, overall,
      activeDays: activeDays.size,
      effortEvents: (codingRow?.attempts || 0) + (assessmentRow?.attempts.length || 0) + (learningRow?.engagedTopics.size || 0),
      evidence: {
        coding: codingValue.sufficientEvidence,
        assessment: assessmentValue.sufficientEvidence,
        learning: learningValue.sufficientEvidence,
        consistency: hasActivityEvidence,
        overall: overall.isOverall,
      },
    });
  }
  return map;
}

function metricForPopulation(row, metric) {
  if (metric === 'coding') return row.coding.mastery ?? row.coding.acceptanceRate;
  if (metric === 'assessment') return row.assessment.normalizedScore;
  if (metric === 'learning') return row.learning.completionRate;
  if (metric === 'consistency') return row.consistency;
  return row.overall.value;
}

export function selectPopulationSegment(students, studentMetrics, population) {
  const mode = population.selectionMode || 'all';
  if (mode === 'all' || mode === 'selected') return students;
  if (mode === 'coding-active') return students.filter((student) => studentMetrics.get(String(student._id))?.coding?.attempts > 0);
  if (mode === 'assessment-active') return students.filter((student) => studentMetrics.get(String(student._id))?.assessment?.completedAttempts > 0);
  if (mode === 'learning-active') return students.filter((student) => studentMetrics.get(String(student._id))?.learning?.engagedTopics > 0);
  if (mode === 'multi-source') {
    return students.filter((student) => {
      const row = studentMetrics.get(String(student._id));
      return [row?.coding?.attempts > 0, row?.assessment?.completedAttempts > 0, row?.learning?.engagedTopics > 0].filter(Boolean).length >= 2;
    });
  }
  const direction = mode === 'bottom' ? 1 : -1;
  return students.map((student) => {
    const row = studentMetrics.get(String(student._id));
    return { student, row, value: metricForPopulation(row, population.rank.metric) };
  }).filter(({ row, value }) => Number.isFinite(value) && (!population.rank.minimumEvidence || row.evidence[population.rank.metric] !== false))
    .sort((left, right) => direction * (left.value - right.value) || String(left.student.name || '').localeCompare(String(right.student.name || '')))
    .slice(0, population.rank.n)
    .map(({ student }) => student);
}

function assessmentEligiblePairs(definitions, students) {
  const cohort = new Set(students.map((student) => String(student._id)));
  return definitions.reduce((sum, assessment) => {
    if (assessment.targetType !== 'selected') return sum + students.length;
    return sum + (assessment.assignedStudents || []).map(String).filter((id) => cohort.has(id)).length;
  }, 0);
}

export function buildAnalyticsSummary(students, studentMetrics, coding, assessment, learning) {
  const codingAttempts = coding?.submissions.length || 0;
  const acceptedAttempts = coding?.submissions.filter((row) => row.status === 'AC').length || 0;
  const assessmentRows = assessment?.submissions || [];
  const assessmentAggregate = assessmentMetrics(assessmentRows);
  const eligibleAssessmentPairs = assessmentEligiblePairs(assessment?.definitions || [], students);
  const participantPairs = new Set(assessmentRows.map((row) => `${row.studentId}:${row.assessmentId}`)).size;
  let eligibleLearningPairs = 0; let completedLearningPairs = 0;
  for (const row of learning?.perStudent?.values() || []) {
    eligibleLearningPairs += row.eligibleTopics?.size || 0;
    completedLearningPairs += row.completedTopics?.size || 0;
  }
  const overallScores = [...studentMetrics.values()].filter((row) => row.overall.isOverall).map((row) => row.overall.value);
  const cards = [
    { id: 'cohort', label: 'Students in scope', value: students.length, unit: 'students' },
  ];
  if (coding) cards.push({ id: 'coding-acceptance', label: 'Coding acceptance', value: percentage(acceptedAttempts, codingAttempts), unit: '%', evidence: { attempts: codingAttempts, accepted: acceptedAttempts } });
  if (assessment) cards.push({ id: 'assessment-score', label: 'Assessment score', value: assessmentAggregate.normalizedScore, unit: '%', evidence: { completed: assessmentAggregate.completedAttempts } }, { id: 'assessment-participation', label: 'Assessment participation', value: percentage(participantPairs, eligibleAssessmentPairs), unit: '%', evidence: { participantPairs, eligiblePairs: eligibleAssessmentPairs } });
  if (learning) cards.push({ id: 'learning-completion', label: 'Learning completion', value: percentage(completedLearningPairs, eligibleLearningPairs), unit: '%', evidence: { completedPairs: completedLearningPairs, eligiblePairs: eligibleLearningPairs } });
  if (overallScores.length) cards.push({ id: 'overall', label: 'Average overall score', value: roundMetric(overallScores.reduce((sum, value) => sum + value, 0) / overallScores.length), unit: '%', evidence: { eligibleStudents: overallScores.length } });
  return cards.filter((card) => card.value !== null);
}

export async function executeAnalyticsQuery({ user, query }) {
  const startedAt = Date.now();
  const { cohort, students, coding, assessment, learning, studentMetrics } = await collectAnalyticsContext({ user, query });
  let graphs = buildAnalyticsGraphs({ students, studentMetrics, query, coding, assessment, learning });
  const truncatedSources = [coding, assessment, learning].filter((source) => source?.truncated).map((source) => source.source);
  if (truncatedSources.length) {
    graphs = graphs.map((graph) => graph.status === 'ready' ? { ...graph, status: 'partial', reason: `Recent ${truncatedSources.join(', ')} evidence was capped for interactive analysis; use a narrower scope.` } : graph);
  }
  const recommendedGraphIds = selectRecommendedGraphs(graphs, query);
  const selected = query.graphs.mode === 'custom' ? query.graphs.ids : recommendedGraphIds;
  graphs = graphs.map((graph) => ({ ...graph, selected: selected.includes(graph.id) }));
  const warnings = [];
  if (cohort.truncated) warnings.push(`Cohort was capped at ${students.length} students. Narrow the population for complete results.`);
  if (truncatedSources.length) warnings.push(`Interactive ${truncatedSources.join(', ')} rows use a recent bounded sample and must not be treated as complete totals.`);
  if (query.population.selectionMode !== 'all' && query.population.selectionMode !== 'selected') warnings.push(`Population mode “${query.population.selectionMode}” selected ${students.length} of ${cohort.baseSize} eligible students before graph calculation.`);
  if (query.sources.length > 1) warnings.push('Cross-source topic charts require canonical mappings; unsupported combined charts are withheld.');
  if (query.assessments.questionTypes.length || query.assessments.sections.length || query.assessments.topics.length) {
    warnings.push('Assessment question, section, and topic filters select whole completed attempts containing those items; persisted scores remain whole-assessment scores.');
  }
  return {
    meta: {
      formulaVersion: FORMULA_VERSION,
      formula: buildFormulaMetadata(),
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      queryFingerprint: fingerprintQuery(query, user),
      cohortSize: students.length,
      baseCohortSize: cohort.baseSize,
      selectionMode: query.population.selectionMode,
      evidence: {
        codingSubmissions: coding?.submissions.length || 0,
        assessmentAttempts: assessment?.submissions.length || 0,
        learningAssignments: learning?.progress.length || 0,
      },
      evidenceCount: (coding?.submissions.length || 0) + (assessment?.submissions.length || 0) + (learning?.progress.length || 0),
      warnings,
      recommendedGraphIds,
      durationMs: Date.now() - startedAt,
    },
    summary: buildAnalyticsSummary(students, studentMetrics, coding, assessment, learning),
    graphs,
  };
}

export async function collectAnalyticsContext({ user, query }) {
  const cohort = await resolveAuthorizedCohort(user, query.population);
  const collectEvidence = async (students) => {
    const studentIds = students.map((student) => student._id);
    const [coding, assessment, learning] = await Promise.all([
      query.sources.includes('coding') ? collectCodingEvidence({ user, studentIds, query }) : null,
      query.sources.includes('assessment') ? collectAssessmentEvidence({ user, studentIds, query }) : null,
      query.sources.includes('learning') ? collectLearningEvidence({ user, studentIds, query }) : null,
    ]);
    return { coding, assessment, learning, studentMetrics: buildStudentMetricRows(students, query, coding, assessment, learning) };
  };

  const baseStudents = cohort.students;
  let evidence = await collectEvidence(baseStudents);
  const students = selectPopulationSegment(baseStudents, evidence.studentMetrics, query.population);
  if (students.length !== baseStudents.length || students.some((student, index) => String(student._id) !== String(baseStudents[index]?._id))) {
    evidence = await collectEvidence(students);
  }
  cohort.baseSize = baseStudents.length;
  cohort.selectionMode = query.population.selectionMode;
  return { cohort, students, ...evidence };
}

export async function estimateAnalyticsQuery({ user, query }) {
  const { count } = await resolveAuthorizedCohort(user, query.population, { countOnly: true });
  const selectedEstimate = ['top', 'bottom'].includes(query.population.selectionMode) ? Math.min(count, query.population.rank.n) : count;
  return {
    cohortSize: selectedEstimate,
    baseCohortSize: count,
    selectionMode: query.population.selectionMode,
    capped: count > 5000,
    requestedSources: query.sources,
    requestedGraphs: query.graphs.mode === 'custom' ? query.graphs.ids.length : 'recommended',
    warnings: count > 5000 ? ['Interactive analysis is capped at 5,000 students; narrow the scope.'] : [],
  };
}

function searchRegex(q) {
  return q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
}

const OPTION_ALIASES = Object.freeze({
  studentIds: 'students', uploadBatchIds: 'upload-batches', codingTopics: 'coding-topics',
  subjectIds: 'learning-subjects', chapterIds: 'learning-chapters', learningTopicIds: 'learning-topics',
  assessmentIds: 'assessments', problemIds: 'problems', semesters: 'semesters', branches: 'branches',
  courses: 'courses', groups: 'groups', colleges: 'colleges',
});

export function normalizeOptionType(type) {
  return OPTION_ALIASES[type] || type;
}

export async function getAnalyticsOptions({ user, options }) {
  const type = normalizeOptionType(options.type);
  const regex = searchRegex(options.q);
  const dependencies = options.dependencies || {};
  let items = [];
  if (type === 'students') {
    const filter = authorizedStudentBaseFilter(user);
    if (dependencies.semesters?.length) filter.semester = { $in: dependencies.semesters.map(Number) };
    if (dependencies.groups?.length) filter.group = { $in: dependencies.groups };
    if (dependencies.branches?.length) filter.branch = { $in: dependencies.branches };
    if (dependencies.courses?.length) filter.course = { $in: dependencies.courses };
    if (dependencies.colleges?.length) filter.college = { $in: dependencies.colleges };
    if (dependencies.uploadBatchIds?.length) filter.uploadBatchIds = { $in: dependencies.uploadBatchIds };
    if (regex) filter.$or = [{ name: regex }, { email: regex }, { studentId: regex }];
    items = (await User.find(filter).select('_id name email studentId semester branch group').sort({ name: 1, _id: 1 }).skip(options.cursor).limit(options.limit + 1).lean()).map((row) => ({ id: String(row._id), label: row.name || row.studentId || 'Student', description: [row.studentId, row.email].filter(Boolean).join(' · '), meta: { semester: row.semester, branch: row.branch, group: row.group } }));
  } else if (type === 'assessments') {
    const filter = { ...authorizedOwnedFilter(user), $or: [{ manuallyCompletedAt: { $type: 'date' } }, { lifecycleStatus: 'published', endTime: { $lte: new Date() } }] }; if (regex) filter.title = regex;
    items = (await Assessment.find(filter).select('_id title assessmentType endTime manuallyCompletedAt lifecycleStatus').sort({ endTime: -1, _id: 1 }).skip(options.cursor).limit(options.limit + 1).lean()).map((row) => ({ id: String(row._id), label: row.title || 'Assessment', description: row.assessmentType || '' }));
  } else if (type === 'upload-batches') {
    const filter = { status: 'active', entityType: 'student' }; if (user.role === 'coordinator' && user.coordinatorDataScope !== 'all') filter.uploadedBy = user._id; if (regex) filter.name = regex;
    items = (await StudentUploadBatch.find(filter).select('_id name originalFileName studentIds').sort({ createdAt: -1 }).skip(options.cursor).limit(options.limit + 1).lean()).map((row) => ({ id: String(row._id), label: row.name, description: `${row.studentIds?.length || 0} students` }));
  } else if (type === 'problems') {
    const filter = authorizedOwnedFilter(user); if (regex) filter.title = regex;
    if (dependencies.codingTopics?.length) filter.tags = { $in: dependencies.codingTopics };
    if (dependencies.difficulties?.length) filter.difficulty = { $in: dependencies.difficulties };
    items = (await Problem.find(filter).select('_id title difficulty tags').sort({ title: 1 }).skip(options.cursor).limit(options.limit + 1).lean()).map((row) => ({ id: String(row._id), label: row.title, description: row.difficulty || '' }));
  } else if (type === 'coding-topics') {
    const values = await Problem.distinct('tags', authorizedOwnedFilter(user));
    items = values.filter((value) => value && (!regex || regex.test(value))).sort((a, b) => a.localeCompare(b)).slice(options.cursor, options.cursor + options.limit + 1).map((value) => ({ id: value, label: value }));
  } else if (['learning-subjects', 'learning-chapters', 'learning-topics'].includes(type)) {
    const semesters = await Semester.find(authorizedLearningFilter(user)).select('_id semesterName subjects').lean();
    const flattened = [];
    for (const semester of semesters) {
      if (dependencies.semesters?.length && !dependencies.semesters.map(String).includes(String(semester._id)) && !dependencies.semesters.includes(semester.semesterName)) continue;
      for (const subject of semester.subjects || []) {
      if (dependencies.subjectIds?.length && !dependencies.subjectIds.map(String).includes(String(subject._id))) continue;
      if (type === 'learning-subjects') flattened.push({ id: String(subject._id), label: subject.subjectName, description: semester.semesterName });
      else for (const chapter of subject.chapters || []) {
        if (dependencies.chapterIds?.length && !dependencies.chapterIds.map(String).includes(String(chapter._id))) continue;
        if (type === 'learning-chapters') flattened.push({ id: String(chapter._id), label: chapter.chapterName, description: subject.subjectName, meta: { subjectId: String(subject._id) } });
        else for (const topic of chapter.topics || []) flattened.push({ id: String(topic._id), label: topic.topicName, description: `${subject.subjectName} · ${chapter.chapterName}`, meta: { chapterId: String(chapter._id), subjectId: String(subject._id) } });
      }
    }
    }
    items = flattened.filter((row) => !regex || regex.test(row.label)).sort((a, b) => a.label.localeCompare(b.label)).slice(options.cursor, options.cursor + options.limit + 1);
  } else if (['semesters', 'branches', 'courses', 'groups', 'colleges'].includes(type)) {
    const field = type === 'semesters' ? 'semester' : type.slice(0, -1);
    const values = await User.distinct(field, authorizedStudentBaseFilter(user));
    items = values.filter((value) => value !== null && value !== undefined && String(value).trim() && (!regex || regex.test(String(value)))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })).slice(options.cursor, options.cursor + options.limit + 1).map((value) => ({ id: String(value), label: String(value) }));
  } else if (type === 'status') {
    items = [{ id: 'active', label: 'Active' }, { id: 'inactive', label: 'Inactive' }];
  } else if (type === 'difficulties') {
    items = ['Easy', 'Medium', 'Hard'].map((value) => ({ id: value, label: value }));
  } else if (type === 'languages') {
    items = ['c', 'cpp', 'java', 'javascript', 'python', 'typescript', 'csharp', 'go', 'rust', 'sql'].map((value) => ({ id: value, label: value }));
  } else if (type === 'verdicts') {
    items = ['AC', 'WA', 'TLE', 'RE', 'CE'].map((value) => ({ id: value, label: value }));
  } else if (type === 'questionTypes') {
    items = ['mcq', 'short', 'one_line', 'coding'].map((value) => ({ id: value, label: value.replace('_', ' ') }));
  } else if (['assessmentTypes', 'sections', 'assessmentTopics', 'setNumbers'].includes(type)) {
    const filter = authorizedOwnedFilter(user);
    if (dependencies.assessmentIds?.length) filter._id = { $in: dependencies.assessmentIds };
    const definitions = await Assessment.find(filter).select('assessmentType sections questionSets').limit(500).lean();
    const values = new Set();
    definitions.forEach((definition) => {
      if (type === 'assessmentTypes' && definition.assessmentType) values.add(definition.assessmentType);
      const sectionLists = [definition.sections || [], ...(definition.questionSets || []).map((set) => set.sections || [])];
      if (type === 'setNumbers') (definition.questionSets || []).forEach((set) => values.add(String(set.setNumber)));
      sectionLists.flat().forEach((section) => {
        if (type === 'sections' && section.sectionName) values.add(section.sectionName);
        if (type === 'assessmentTopics') (section.questions || []).forEach((question) => (question.tags || []).forEach((tag) => values.add(tag)));
      });
    });
    items = [...values].filter((value) => !regex || regex.test(value)).sort().slice(options.cursor, options.cursor + options.limit + 1).map((value) => ({ id: value, label: value }));
  }
  const hasMore = items.length > options.limit;
  return { items: items.slice(0, options.limit), nextCursor: hasMore ? String(options.cursor + options.limit) : null, hasMore };
}
