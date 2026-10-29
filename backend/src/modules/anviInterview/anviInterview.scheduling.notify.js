import User from "../../models/User.js";
import { notifyOnce } from "../../services/notificationService.js";
import { enqueueMailJobs } from "../../services/mailQueueService.js";
import { currentTenant } from "../../platform/tenantContext.js";

// In-app notifications and queued emails for scheduled ANVI interviews. Both are idempotent: the
// in-app dedupe key and the mail idempotency key include the booking and its slot start, so a
// sweeper that runs twice sends nothing new while a reschedule still notifies again.
export const MAIL_TYPE = "anvi_interview";
export const NOTIFICATION_TYPE = "AI_INTERVIEW";
const PARALLEL = 25;
const MAIL_CHUNK = 500;
const LIST_URL = "/student/ai-interviews";
// The 10-minute reminder and the missed notice are in-app only.
const EMAILED = new Set(["assigned", "invite_reminder", "booked", "rescheduled", "cancelled", "needs_reschedule", "assignment_cancelled", "reminder:24h", "reminder:1h", "window_reminder:24h", "released"]);
const REMINDER_TEXT = { "24h": "24 hours", "1h": "1 hour", "10m": "10 minutes" };

export const formatIst = (value) => `${new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST`;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function studentUrl(path = LIST_URL) {
  const origin = (process.env.FRONTEND_ORIGIN || "https://peerprep.co.in").split(",")[0].trim().replace(/\/$/, "");
  const tenant = currentTenant();
  return `${origin}${tenant ? `/u/${tenant.universityId}` : ""}${path}`;
}

const iso = (value) => (value ? new Date(value).toISOString() : "");
const slotsMode = (assignment) => assignment.slotPolicy?.mode === "slots";

/** Title, message and dedupe key for one event and recipient. */
export function describe(event, { assignment, booking = null, label = null, by = "student", attemptId = null, studentId, sequence = null }) {
  const name = assignment.title || "AI interview";
  const when = booking ? formatIst(booking.startsAt) : "";
  const opens = formatIst(assignment.window.opensAt);
  const closes = formatIst(assignment.window.closesAt);
  // The reschedule count makes each version of a booking its own key: a booking moved back to a time it
  // held before (A to B, back to A, then B again) is still announced.
  const bookingKey = booking ? `${booking._id}:r${Number(booking.rescheduleCount) || 0}:${iso(booking.startsAt)}` : `${assignment._id}:${studentId}`;
  switch (event) {
    case "assigned":
      return {
        title: "AI interview scheduled",
        message: slotsMode(assignment)
          ? `${name}: book a slot between ${opens} and ${closes}.`
          : `${name}: take it any time between ${opens} and ${closes}.`,
        dedupeKey: `anvi-assigned:${assignment._id}:${studentId}`,
      };
    // An admin's "Resend invite": each send has its own key (the send time), so it is delivered again.
    case "invite_reminder":
      return {
        title: "Reminder: AI interview assigned",
        message: booking
          ? `${name}: your slot is on ${when}. You can join ${assignment.bookingPolicy?.earlyJoinMinutes ?? 10} minutes early.`
          : slotsMode(assignment)
            ? `${name}: book a slot before ${closes}.`
            : `${name}: take it any time before ${closes}.`,
        dedupeKey: `anvi-invite:${assignment._id}:${studentId}:${sequence || iso(Date.now())}`,
      };
    case "booked":
      return { title: "Interview slot booked", message: `${name} on ${when}.`, dedupeKey: `anvi-booked:${bookingKey}` };
    case "rescheduled":
      return {
        title: "Interview slot changed",
        message: `${name} is now on ${when}${by === "admin" ? " (changed by your institution)" : ""}.`,
        dedupeKey: `anvi-rescheduled:${bookingKey}`,
      };
    case "cancelled":
      return {
        title: "Interview booking cancelled",
        message: `Your ${name} slot on ${when} was cancelled${by === "admin" ? " by your institution" : ""}.`,
        dedupeKey: `anvi-cancelled:${bookingKey}`,
      };
    case "needs_reschedule":
      return {
        title: "Choose a new interview slot",
        message: `Your ${name} slot on ${when} is no longer available. Book a new slot before ${closes}.`,
        dedupeKey: `anvi-needs-reschedule:${bookingKey}`,
      };
    case "reminder":
      return {
        title: `Interview in ${REMINDER_TEXT[label] || label}`,
        message: `${name} starts at ${when}. You can join ${assignment.bookingPolicy?.earlyJoinMinutes ?? 10} minutes early.`,
        dedupeKey: `anvi-reminder-${label}:${bookingKey}`,
      };
    case "window_reminder":
      return {
        title: "Interview closes soon",
        message: `${name} closes at ${closes}. ${slotsMode(assignment) ? "Book a slot" : "Start it"} before then.`,
        dedupeKey: `anvi-window-reminder-${label}:${assignment._id}:${studentId}:${iso(assignment.window.closesAt)}`,
      };
    case "missed":
      return {
        title: "Interview missed",
        message: booking ? `You did not join ${name} on ${when}.` : `The window for ${name} closed before you took it.`,
        dedupeKey: `anvi-missed:${bookingKey}`,
      };
    case "released":
      return {
        title: "Interview report ready",
        message: `Your ${name} report is available.`,
        dedupeKey: `anvi-released:${assignment._id}:${attemptId || studentId}`,
        actionUrl: attemptId ? `/student/ai-interviews/room/${attemptId}` : LIST_URL,
      };
    case "assignment_cancelled":
      return {
        title: "Interview cancelled",
        message: `${name}, scheduled by your institution, was cancelled.`,
        dedupeKey: `anvi-assignment-cancelled:${assignment._id}:${studentId}`,
      };
    default:
      throw new Error(`Unknown ANVI scheduling event: ${event}`);
  }
}

/** Default email: fixed HTML (no DB template), every dynamic value escaped. */
export function buildEmail({ title, message, assignment, booking, actionPath }) {
  const rows = [
    ["Interview", assignment.title || "AI interview"],
    ...(assignment.role ? [["Role", assignment.role]] : []),
    ...(booking ? [["Slot", formatIst(booking.startsAt)]] : [["Window", `${formatIst(assignment.window.opensAt)} to ${formatIst(assignment.window.closesAt)}`]]),
  ];
  const url = studentUrl(actionPath || LIST_URL);
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
<tr><td style="background:#6d28d9;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:bold;">${escapeHtml(title)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.5;">
<p style="margin:0 0 16px;">${escapeHtml(message)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
${rows.map(([key, value]) => `<tr><td style="padding:8px 0;color:#64748b;width:120px;">${escapeHtml(key)}</td><td style="padding:8px 0;font-weight:bold;">${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">Open AI interviews</a>
<p style="margin:20px 0 0;color:#64748b;font-size:12px;">All times are India Standard Time (IST).</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: `${title}: ${assignment.title || "AI interview"}`.slice(0, 200), html };
}

async function inBatches(items, size, work) {
  for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(work));
}

const defaultFindUsers = (ids) => User.find({ _id: { $in: ids } }).select("_id email name").lean();

/**
 * send(event, { assignment, recipients: [{ studentId, booking?, attemptId? }], label?, by? }).
 * Never throws: a notification failure must not undo a booking.
 */
export function createSchedulingNotifier({ notify = notifyOnce, enqueue = enqueueMailJobs, findUsers = defaultFindUsers, clock = Date, log = console } = {}) {
  async function send(event, { assignment, recipients = [], label = null, by = "student" }) {
    if (!assignment || !recipients.length) return { notified: 0, emailed: 0 };
    const now = new Date(clock.now());
    const described = recipients.map((recipient) => ({
      recipient,
      note: describe(event, { assignment, label, by, ...recipient }),
    }));
    let notified = 0;
    try {
      await inBatches(described, PARALLEL, async ({ recipient, note }) => {
        const created = await notify({
          userId: recipient.studentId,
          dedupeKey: note.dedupeKey,
          title: note.title,
          message: note.message,
          type: NOTIFICATION_TYPE,
          actionUrl: note.actionUrl || LIST_URL,
          referenceId: assignment._id,
          now,
        });
        if (created) notified += 1;
      });
    } catch (error) {
      log.warn?.(`[ANVI] Schedule notification failed (${error?.name || "Error"}).`);
    }
    const key = label ? `${event}:${label}` : event;
    if (!EMAILED.has(key) || process.env.EMAIL_ENABLED === "false") return { notified, emailed: 0 };
    let emailed = 0;
    try {
      for (let index = 0; index < described.length; index += MAIL_CHUNK) {
        const chunk = described.slice(index, index + MAIL_CHUNK);
        const users = await findUsers(chunk.map(({ recipient }) => recipient.studentId));
        const byId = new Map(users.filter((user) => user.email).map((user) => [String(user._id), user]));
        const jobs = chunk.flatMap(({ recipient, note }) => {
          const user = byId.get(String(recipient.studentId));
          if (!user) return [];
          const email = buildEmail({ title: note.title, message: note.message, assignment, booking: recipient.booking, actionPath: note.actionUrl });
          return [{
            type: MAIL_TYPE,
            to: user.email,
            recipientId: user._id,
            targetType: "ANVI_ASSIGNMENT",
            targetId: assignment._id,
            idempotencyKey: `anvi:${note.dedupeKey}:${user._id}`,
            payload: { to: user.email, subject: email.subject, html: email.html },
          }];
        });
        if (jobs.length) {
          await enqueue(jobs, { requestedBy: assignment.ownerId });
          emailed += jobs.length;
        }
      }
    } catch (error) {
      log.warn?.(`[ANVI] Schedule email queueing failed (${error?.name || "Error"}).`);
    }
    return { notified, emailed };
  }
  return { send };
}
