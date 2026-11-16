// QuickPrep attempt window (optional startsAt / endsAt): status, wording and <input type="datetime-local">
// conversion. Pure, no React, so admin pages, student pages and tests share the same rules.

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** ISO string / Date -> "YYYY-MM-DDTHH:mm" in the viewer's local time (what datetime-local expects). */
export function toLocalInput(value) {
  const date = toDate(value);
  if (!date) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * "YYYY-MM-DDTHH:mm" (local) -> ISO string, or null when empty/invalid. Built from its parts with the
 * Date(y, m, d, h, min) constructor, never by parsing the text (Safari rejects "YYYY-MM-DD HH:mm").
 */
export function fromLocalInput(value) {
  const match = LOCAL_INPUT.exec(String(value || '').trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second || 0, 0);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.toISOString();
}

/** 'upcoming' | 'open' | 'ended' at `now`. No window means always open. */
export function questWindowStatus(quest, now = new Date()) {
  const startsAt = toDate(quest?.startsAt);
  const endsAt = toDate(quest?.endsAt);
  if (startsAt && now < startsAt) return 'upcoming';
  if (endsAt && now > endsAt) return 'ended';
  return 'open';
}
export const hasWindow = (quest) => Boolean(toDate(quest?.startsAt) || toDate(quest?.endsAt));

export const WINDOW_LABELS = Object.freeze({ upcoming: 'Upcoming', open: 'Open', ended: 'Ended' });

const WHEN = { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' };
export function formatWhen(value) {
  const date = toDate(value);
  return date ? date.toLocaleString(undefined, WHEN) : '';
}

/** "12 Nov 2026, 10:00 – 20 Nov 2026, 18:00", "From …", "Until …" or "No time limit". */
export function windowText(quest) {
  const startsAt = toDate(quest?.startsAt);
  const endsAt = toDate(quest?.endsAt);
  if (startsAt && endsAt) return `${formatWhen(startsAt)} – ${formatWhen(endsAt)}`;
  if (startsAt) return `From ${formatWhen(startsAt)}`;
  if (endsAt) return `Until ${formatWhen(endsAt)}`;
  return 'No time limit';
}

/** Short student-facing line: "Opens …", "Ends …", "Ended …" or '' when there is nothing to say. */
export function windowNote(quest, now = new Date()) {
  const status = questWindowStatus(quest, now);
  if (status === 'upcoming') return `Opens ${formatWhen(quest.startsAt)}`;
  if (status === 'ended') return `Ended ${formatWhen(quest.endsAt)}`;
  return toDate(quest?.endsAt) ? `Ends ${formatWhen(quest.endsAt)}` : '';
}

/** Validation message for two datetime-local values, or '' when they are fine (both optional). */
export function windowError(startsInput, endsInput) {
  if (startsInput && !fromLocalInput(startsInput)) return 'Enter a valid start date and time.';
  if (endsInput && !fromLocalInput(endsInput)) return 'Enter a valid end date and time.';
  if (startsInput && endsInput && new Date(fromLocalInput(endsInput)) <= new Date(fromLocalInput(startsInput))) return 'The end must be after the start.';
  return '';
}

/** Open sheets first, then upcoming (soonest first), then ended (latest first). Stable otherwise. */
export function sortByWindow(quests, now = new Date()) {
  const rank = { open: 0, upcoming: 1, ended: 2 };
  return (Array.isArray(quests) ? quests : []).map((quest, index) => ({ quest, index, status: questWindowStatus(quest, now) }))
    .sort((a, b) => rank[a.status] - rank[b.status]
      || (a.status === 'upcoming' ? toDate(a.quest.startsAt) - toDate(b.quest.startsAt) : 0)
      || (a.status === 'ended' ? toDate(b.quest.endsAt) - toDate(a.quest.endsAt) : 0)
      || a.index - b.index)
    .map((entry) => entry.quest);
}
