import mongoose from 'mongoose';
import User from '../../models/User.js';
import Submission from '../../models/Submission.js';
import { PrepMate, PrepMateNudge } from '../../models/PeerNetwork.js';
import { authorizedStudentBaseFilter } from '../adminAnalytics/adminAnalytics.authorization.js';
import { normalizeRange } from './prepAnalysis.service.js';
import { studentHasFeature } from '../../services/studentFeatureAccess.js';
import { currentTenant } from '../../platform/tenantContext.js';
import { HttpError } from '../../utils/errors.js';

const MAX_STUDENTS = 50_000;
const MAX_PAGE = 10_000;
const id = (value) => String(value || '');
const day = (value) => new Date(value).toISOString().slice(0, 10);
const within = (value, range) => value && (!range.from || value >= range.from) && (!range.to || value <= range.to);
const sameCollege = (a, b) => currentTenant() || (String(a.college || '').trim().toLowerCase() && String(a.college || '').trim().toLowerCase() === String(b.college || '').trim().toLowerCase());

/** Prep Mates has its own live ledger. Report only current links and events that still have a record. */
export async function getPrepMatesAnalysis({ user, query = {} }) {
  const range = normalizeRange({ preset: query.range || '30d', from: query.from, to: query.to });
  const semester = query.semester ? Number(query.semester) : null;
  if (query.semester && (!Number.isInteger(semester) || semester < 1 || semester > 8)) throw new HttpError(400, 'Invalid semester.');
  const page = Math.max(1, Math.min(MAX_PAGE, Number.parseInt(query.page, 10) || 1));
  const search = String(query.search || '').trim().toLowerCase().slice(0, 100);
  const college = String(query.college || '').trim().toLowerCase().slice(0, 120);
  const all = await User.find(authorizedStudentBaseFilter(user))
    .select('_id role name email studentId semester branch section college isActive accessScope visibleToPeers featureAccess')
    .limit(MAX_STUDENTS + 1).lean();
  if (all.length > MAX_STUDENTS) throw new HttpError(422, 'This report currently supports university cohorts with up to 50,000 students.');

  const eligible = all.filter((student) => student.isActive !== false && student.accessScope !== 'assessment_only'
    && student.visibleToPeers !== false && studentHasFeature(student, 'peers') && (currentTenant() || String(student.college || '').trim()));
  const byId = new Map(eligible.map((student) => [id(student._id), student]));
  const selected = eligible.filter((student) => (!college || String(student.college || '').trim().toLowerCase() === college)
    && (!semester || student.semester === semester)
    && (!search || [student.name, student.email, student.studentId].some((value) => String(value || '').toLowerCase().includes(search))));
  const selectedIds = new Set(selected.map((student) => id(student._id)));
  const metrics = new Map(selected.map((student) => [id(student._id), { mates: 0, pendingSent: 0, pendingReceived: 0, requests: 0, pingsSent: 0, pingsReceived: 0, solved: 0, mateNames: [] }]));

  const [links, nudges] = await Promise.all([
    PrepMate.find({ status: { $in: ['accepted', 'pending', 'declined', 'cancelled', 'removed'] } })
      .select('fromId toId status requestedAt respondedAt').lean(),
    PrepMateNudge.find({ ...(range.from || range.to ? { sentAt: { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) } } : {}) })
      .select('fromId toId sentAt').lean(),
  ]);

  let acceptedLinks = 0;
  let pendingRequests = 0;
  let latestRequests = 0;
  const requestStatus = { pending: 0, accepted: 0, declined: 0, cancelled: 0, removed: 0 };
  const trend = new Map();
  const addTrend = (date, field) => {
    const key = day(date);
    const point = trend.get(key) || { day: key, requests: 0, pings: 0 };
    point[field] += 1;
    trend.set(key, point);
  };

  for (const link of links) {
    const from = byId.get(id(link.fromId));
    const to = byId.get(id(link.toId));
    if (!from || !to || !sameCollege(from, to)) continue;
    const fromSelected = selectedIds.has(id(from._id));
    const toSelected = selectedIds.has(id(to._id));
    if (!fromSelected && !toSelected) continue;
    const fromRow = metrics.get(id(from._id));
    const toRow = metrics.get(id(to._id));
    if (link.status === 'accepted') {
      acceptedLinks += 1;
      if (fromRow) { fromRow.mates += 1; fromRow.mateNames.push(to.name || to.studentId || 'Student'); }
      if (toRow) { toRow.mates += 1; toRow.mateNames.push(from.name || from.studentId || 'Student'); }
    }
    if (link.status === 'pending') {
      pendingRequests += 1;
      if (fromRow) fromRow.pendingSent += 1;
      if (toRow) toRow.pendingReceived += 1;
    }
    if (within(link.requestedAt, range)) {
      latestRequests += 1;
      requestStatus[link.status] += 1;
      if (fromRow) fromRow.requests += 1;
      addTrend(link.requestedAt, 'requests');
    }
  }

  let pings = 0;
  for (const nudge of nudges) {
    const from = byId.get(id(nudge.fromId));
    const to = byId.get(id(nudge.toId));
    if (!from || !to || !sameCollege(from, to)) continue;
    if (!selectedIds.has(id(from._id)) && !selectedIds.has(id(to._id))) continue;
    pings += 1;
    if (metrics.has(id(from._id))) metrics.get(id(from._id)).pingsSent += 1;
    if (metrics.has(id(to._id))) metrics.get(id(to._id)).pingsReceived += 1;
    addTrend(nudge.sentAt, 'pings');
  }

  // Count distinct locally submitted practice problems accepted in this period.
  const selectedObjectIds = selected.map((student) => new mongoose.Types.ObjectId(id(student._id)));
  if (selectedObjectIds.length) {
    const solved = await Submission.aggregate([
      { $match: { user: { $in: selectedObjectIds }, mode: 'submit', status: 'AC', assessmentId: null,
        ...(range.from || range.to ? { createdAt: { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) } } : {}) } },
      { $group: { _id: { user: '$user', problem: '$problem' } } },
      { $group: { _id: '$_id.user', solved: { $sum: 1 } } },
    ]).option({ maxTimeMS: 30_000, allowDiskUse: true });
    for (const row of solved) if (metrics.has(id(row._id))) metrics.get(id(row._id)).solved = row.solved;
  }

  const rows = selected.map((student) => ({
    id: id(student._id), name: student.name || 'Student', email: student.email || '', studentId: student.studentId || '',
    college: student.college || '', semester: student.semester || null, branch: student.branch || '', section: student.section || '',
    ...metrics.get(id(student._id)),
  }));
  rows.sort((a, b) => b.mates - a.mates || b.pingsSent - a.pingsSent || a.name.localeCompare(b.name));
  const connected = rows.filter((row) => row.mates > 0);
  const unconnected = rows.filter((row) => row.mates === 0);
  const average = (list) => list.length ? Math.round(10 * list.reduce((sum, row) => sum + row.solved, 0) / list.length) / 10 : 0;
  return {
    range, filters: { college, semester, search },
    options: { colleges: [...new Set(eligible.map((student) => String(student.college || '').trim()).filter(Boolean))].sort(),
      semesters: [...new Set(eligible.map((student) => student.semester).filter(Boolean))].sort((a, b) => a - b) },
    summary: { eligible: rows.length, connected: connected.length, acceptedLinks, pendingRequests, latestRequests, requestStatus, pings,
      averageSolvedConnected: average(connected), averageSolvedUnconnected: average(unconnected) },
    trend: [...trend.values()].sort((a, b) => a.day.localeCompare(b.day)),
    students: { rows: rows.slice((page - 1) * 25, page * 25), total: rows.length, page, pages: Math.ceil(rows.length / 25) },
    note: 'Connections and pending requests are current. Requests in the date range use the latest saved request for each pair; earlier requests are not retained.',
  };
}
