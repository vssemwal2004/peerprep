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

const MAX_QUERY_MS = 30000;
const IN_LIST_LIMIT = 5000;

export async function loadQuickPrepSheets() {
  const definitions = isUniversity()
    ? (await sharedQuests()) || []
    : await Quest.find({ status: { $ne: 'archived' } }).select('_id title semesters status items').maxTimeMS(MAX_QUERY_MS).lean();
  return new Map(definitions.map((quest) => [String(quest._id), {
    id: String(quest._id),
    title: String(quest.title || 'Quick Prep sheet').trim(),
    semesters: (quest.semesters || []).map(Number).filter((value) => value > 0),
    published: quest.status === undefined || quest.status === 'published',
    items: (quest.items || []).length,
  }]));
}

/** True when a student in `semester` can see this sheet (no semesters means everyone). */
export const sheetVisibleTo = (sheet, semester) => !sheet.semesters.length || sheet.semesters.includes(Number(semester));

export async function loadQuickPrepFacts({ studentIds, range }) {
  const cohort = new Set(studentIds);
  const sheets = await loadQuickPrepSheets();
  if (!studentIds.length || !sheets.size) return { sheets, byStudent: new Map() };
  const match = { questId: { $in: [...sheets.keys()].map((id) => new mongoose.Types.ObjectId(id)) } };
  if (isUniversity()) match.tenantKey = engagementTenant({});
  if (studentIds.length <= IN_LIST_LIMIT) match.studentId = { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (range.from || range.to) {
    const window = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
    match.$or = [{ lastViewedAt: window }, { startedAt: window }, { completedAt: window }];
  }
  const rows = await QuestEnrollment.find(match)
    .select('studentId questId solvedCount totalCount startedAt completedAt lastViewedAt')
    .maxTimeMS(MAX_QUERY_MS)
    .lean();
  const byStudent = new Map();
  for (const row of rows) {
    const studentId = String(row.studentId);
    const sheet = sheets.get(String(row.questId));
    if (!cohort.has(studentId) || !sheet) continue;
    const total = Math.max(0, Number(row.totalCount) || sheet.items);
    const list = byStudent.get(studentId) || [];
    list.push({
      sheetId: sheet.id,
      solved: Math.min(total, Math.max(0, Number(row.solvedCount) || 0)),
      total,
      finished: Boolean(row.completedAt),
      startedAt: row.startedAt || null,
      lastViewedAt: row.lastViewedAt || row.startedAt || null,
    });
    byStudent.set(studentId, list);
  }
  return { sheets, byStudent };
}
