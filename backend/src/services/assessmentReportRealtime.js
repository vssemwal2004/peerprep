import mongoose from 'mongoose';
import User from '../models/User.js';
import { getIo } from '../utils/io.js';
import { currentTenant, runForPlatform, runForTenant } from '../platform/tenantContext.js';
import { getTenant } from '../platform/tenantConnections.js';
import { authorizeAssessmentReportAccess } from './assessmentReportAccess.js';

export const ASSESSMENT_REPORT_CHANGED_EVENT = 'assessment-report:changed';
export const ASSESSMENT_REPORT_SUBSCRIBE_EVENT = 'assessment-report:subscribe';
export const ASSESSMENT_REPORT_UNSUBSCRIBE_EVENT = 'assessment-report:unsubscribe';
export const ASSESSMENT_REPORT_KINDS = Object.freeze(['started', 'answers', 'submitted', 'violation', 'expired', 'evaluation']);
const ROOM_PREFIX = 'assessment-report:';
const MAX_REPORT_ROOMS_PER_SOCKET = 5;
const COALESCE_MS = 2000;

const tenantKeyOf = (tenant = currentTenant()) => (tenant?.universityId ? String(tenant.universityId) : 'platform');

export function assessmentReportRoom(assessmentId, tenantKey = tenantKeyOf()) {
  return `${ROOM_PREFIX}${tenantKey}:${assessmentId}`;
}

/**
 * Per-process coalescing of "the live report changed" hints. The first change
 * after a quiet period is sent at once; later ones within the window are merged
 * (kinds unioned) into a single trailing event. Hints carry no data: clients
 * refetch the roster delta. Nothing here may throw into or delay a request.
 */
export function createAssessmentReportNotifier({
  windowMs = COALESCE_MS,
  now = () => Date.now(),
  setTimer = (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref?.(); return timer; },
  emit = (room, payload) => { getIo()?.to(room).emit(ASSESSMENT_REPORT_CHANGED_EVENT, payload); },
} = {}) {
  const rooms = new Map(); // room -> { assessmentId, lastEmitAt, kinds: Set|null, timer }
  let lastRev = 0;
  const nextRev = () => { lastRev = Math.max(lastRev + 1, now()); return lastRev; };

  const send = (room, entry, kinds) => {
    entry.lastEmitAt = now();
    try {
      emit(room, { assessmentId: entry.assessmentId, rev: nextRev(), kinds: [...kinds].sort() });
    } catch { /* realtime is a hint; the roster endpoint stays authoritative */ }
  };

  const flush = (room) => {
    const entry = rooms.get(room);
    if (!entry) return;
    entry.timer = null;
    const kinds = entry.kinds;
    entry.kinds = null;
    if (kinds?.size) send(room, entry, kinds);
  };

  function notify(assessmentId, kind) {
    try {
      const id = String(assessmentId?._id || assessmentId || '');
      if (!mongoose.isValidObjectId(id) || !ASSESSMENT_REPORT_KINDS.includes(kind)) return;
      const room = assessmentReportRoom(id);
      const entry = rooms.get(room) || { assessmentId: id, lastEmitAt: -Infinity, kinds: null, timer: null };
      rooms.set(room, entry);
      const elapsed = now() - entry.lastEmitAt;
      if (!entry.timer && elapsed >= windowMs) {
        send(room, entry, new Set([kind]));
        return;
      }
      (entry.kinds ||= new Set()).add(kind);
      if (!entry.timer) entry.timer = setTimer(() => flush(room), Math.max(0, windowMs - elapsed));
      // Idle rooms are forgotten so the map stays bounded by live exams.
      if (rooms.size > 5000) {
        for (const [key, value] of rooms) if (!value.timer && now() - value.lastEmitAt > windowMs) rooms.delete(key);
      }
    } catch { /* never surface into the write path */ }
  }

  return { notify, flush, rooms };
}

const defaultNotifier = createAssessmentReportNotifier();

export function notifyAssessmentReportChanged(assessmentId, kind) {
  defaultNotifier.notify(assessmentId, kind);
}

async function runInSocketTenant(socket, work) {
  const tenant = socket.universityId && socket.universityId !== 'platform' ? await getTenant(socket.universityId) : null;
  if (socket.universityId && socket.universityId !== 'platform' && !tenant) throw Object.assign(new Error('Tenant unavailable'), { status: 403, code: 'FORBIDDEN' });
  return tenant ? runForTenant(tenant, work) : runForPlatform(work);
}

const reportRoomsOf = (socket) => [...socket.rooms].filter((room) => room.startsWith(ROOM_PREFIX));

/**
 * Socket subscription to one assessment's live report. Authorisation is the
 * same helper the HTTP roster uses, evaluated against the user's current
 * record (permissions may have changed since the socket connected).
 */
export function registerAssessmentReportSocketHandlers(io, {
  authorize = authorizeAssessmentReportAccess,
  loadUser = (userId) => User.findById(userId).select('_id role isActive coordinatorPermissions coordinatorDataScope').lean(),
  runInTenant = runInSocketTenant,
} = {}) {
  io.on('connection', (socket) => {
    socket.on(ASSESSMENT_REPORT_SUBSCRIBE_EVENT, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const assessmentId = String(payload?.assessmentId || '');
        if (!/^[a-f\d]{24}$/i.test(assessmentId)) return reply({ ok: false, error: 'INVALID_ASSESSMENT_ID' });
        const room = assessmentReportRoom(assessmentId, socket.universityId || 'platform');
        if (socket.rooms.has(room)) return reply({ ok: true });
        if (reportRoomsOf(socket).length >= MAX_REPORT_ROOMS_PER_SOCKET) return reply({ ok: false, error: 'TOO_MANY_SUBSCRIPTIONS' });
        await runInTenant(socket, async () => {
          const user = await loadUser(socket.userId);
          await authorize(user, assessmentId);
        });
        if (socket.disconnected) return undefined;
        socket.join(room);
        return reply({ ok: true });
      } catch (error) {
        return reply({ ok: false, error: error?.code && error?.status ? error.code : 'SUBSCRIBE_FAILED' });
      }
    });
    socket.on(ASSESSMENT_REPORT_UNSUBSCRIBE_EVENT, (payload, ack) => {
      const assessmentId = String(payload?.assessmentId || '');
      if (/^[a-f\d]{24}$/i.test(assessmentId)) socket.leave(assessmentReportRoom(assessmentId, socket.universityId || 'platform'));
      if (typeof ack === 'function') ack({ ok: true });
    });
  });
}
