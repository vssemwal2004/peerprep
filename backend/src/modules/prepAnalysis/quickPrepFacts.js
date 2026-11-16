// Loads Quick Prep evidence: the sheets (QuickPreps) students can open and each
// student's enrollment in them. Solved/total counts come from the enrollment,
// which the student's own sheet page keeps up to date, so analysis matches what
// the student sees. University deployments read sheet definitions from the
// central feed and only their own enrollments (tenantKey).

import mongoose from 'mongoose';
import { Quest, QuestEnrollment } from '../../models/AdaptiveEngagement.js';
import { isUniversity } from '../../platform/deployment.js';
import { sharedQuests } from '../../platform/sharedContent.js';
import { engagementTenant } from '../../services/engagementPolicyService.js';
import { cohortQuestProgress } from '../../services/questService.js';

const MAX_QUERY_MS = 30000;
const IN_LIST_LIMIT = 5000;

async function loadDefinitions() {
  return isUniversity()
    ? (await sharedQuests()) || []
    : Quest.find({ status: { $ne: 'archived' } }).select('_id title slug semesters status items startsAt endsAt').maxTimeMS(MAX_QUERY_MS).lean();
}

export async function loadQuickPrepSheets(definitions = null) {
  return sheetMap(definitions || await loadDefinitions());
}

function sheetMap(definitions) {
  return new Map(definitions.map((quest) => [String(quest._id), {
    id: String(quest._id),
    title: String(quest.title || 'Quick Prep sheet').trim(),
    slug: quest.slug ? String(quest.slug) : null,
    semesters: (quest.semesters || []).map(Number).filter((value) => value > 0),
    published: quest.status === undefined || quest.status === 'published',
    items: (quest.items || []).length,
    // 'local:<problemId>' / 'shared:<questionId>', matching loadSolveEfforts keys.
    itemKeys: new Set((quest.items || []).filter((item) => item?.problemId).map((item) => `${item.source === 'shared' ? 'shared' : 'local'}:${item.problemId}`)),
  }]));
}

/** True when a student in `semester` can see this sheet (no semesters means everyone). */
export const sheetVisibleTo = (sheet, semester) => !sheet.semesters.length || sheet.semesters.includes(Number(semester));

/**
 * Replaces each sheet's item count and keys with what students can actually open (the same rule as
 * their sheet page). A sheet with no openable question is hidden from students, so it is not "open".
 */
function applyLiveItems(sheets, progress) {
  for (const [id, sheet] of sheets) {
    const live = progress.sheets.get(id) || { keys: [], evidence: [] };
    sheet.items = live.keys.length;
    sheet.itemKeys = new Set(live.evidence);
    // Each openable question with its title and difficulty, in sheet order (question-level charts).
    sheet.questions = live.keys.map((key) => ({ key, ...(progress.meta?.get(key) || { title: 'Question', difficulty: '' }) }));
    if (!live.keys.length) sheet.published = false;
  }
}

export async function loadQuickPrepFacts({ studentIds, range }) {
  const cohort = new Set(studentIds);
  const definitions = await loadDefinitions();
  const sheets = sheetMap(definitions);
  if (!studentIds.length || !sheets.size) {
    if (sheets.size) applyLiveItems(sheets, await cohortQuestProgress([], definitions));
    return { sheets, byStudent: new Map() };
  }
  const match = { questId: { $in: [...sheets.keys()].map((id) => new mongoose.Types.ObjectId(id)) } };
  if (isUniversity()) match.tenantKey = engagementTenant({});
  if (studentIds.length <= IN_LIST_LIMIT) match.studentId = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (range.from || range.to) {
    const window = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    match.$or = [{ lastViewedAt: window }, { startedAt: window }, { completedAt: window }];
  }
  const rows = (await QuestEnrollment.find(match)
    .select('studentId questId startedAt completedAt lastViewedAt')
    .maxTimeMS(MAX_QUERY_MS)
    .lean()).filter((row) => cohort.has(String(row.studentId)) && sheets.has(String(row.questId)));
  // Solved counts are read live from submissions and practice attempts: the stored enrollment counts
  // only change when the student opens the sheet, so solving from the problem page left them stale.
  const progress = await cohortQuestProgress([...new Set(rows.map((row) => String(row.studentId)))], definitions);
  applyLiveItems(sheets, progress);
  const byStudent = new Map();
  for (const row of rows) {
    const studentId = String(row.studentId);
    const sheet = sheets.get(String(row.questId));
    const keys = progress.sheets.get(sheet.id)?.keys || [];
    const total = keys.length;
    // A sheet with an attempt window counts only solves inside it (questService.cohortQuestProgress).
    const solvedKeys = keys.filter((key) => progress.isSolved(studentId, key, sheet.id));
    const solved = solvedKeys.length;
    const list = byStudent.get(studentId) || [];
    list.push({
      sheetId: sheet.id,
      solved,
      total,
      solvedKeys,
      // QuickPrep's own completion, or every openable question solved now.
      finished: Boolean(row.completedAt) || (total > 0 && solved >= total),
      completedAt: row.completedAt || null,
      startedAt: row.startedAt || null,
      lastViewedAt: row.lastViewedAt || row.startedAt || null,
    });
    byStudent.set(studentId, list);
  }
  return { sheets, byStudent };
}
