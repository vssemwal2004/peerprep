// iCalendar (RFC 5545) file for one ANVI booking. The UID is stable per booking and SEQUENCE is the
// booking's reschedule count, so a calendar updates the same entry after a reschedule or cancel.
const CRLF = "\r\n";
const MAX_OCTETS = 75;

/** TEXT value escaping: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 octets (UTF-8), never inside a multi-byte character. */
export function foldIcsLine(line) {
  const text = String(line);
  if (Buffer.byteLength(text, "utf8") <= MAX_OCTETS) return text;
  const parts = [];
  let current = "";
  let octets = 0;
  // The first line holds 75 octets; each continuation starts with a space, leaving 74.
  let limit = MAX_OCTETS;
  for (const char of text) {
    const size = Buffer.byteLength(char, "utf8");
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = MAX_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  if (current) parts.push(current);
  return parts.join(`${CRLF} `);
}

const icsDate = (value) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * booking: { _id, startsAt, endsAt, status, rescheduleCount }; assignment: { title, role }.
 * A cancelled booking produces STATUS:CANCELLED with the same UID, so importing it removes the entry.
 */
export function buildAnviBookingIcs({ booking, assignment, url = "", now = new Date() }) {
  const cancelled = ["cancelled", "no_show"].includes(booking.status);
  const title = `${assignment.title || "AI interview"} (ANVI)`;
  const description = [
    `AI interview scheduled by your institution${assignment.role ? ` for the ${assignment.role} role` : ""}.`,
    "Join from PeerPrep during your slot. Times are in IST (Asia/Kolkata).",
    url ? `Open: ${url}` : "",
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PeerPrep//ANVI Interview//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:anvi-booking-${booking._id}@peerprep`,
    `SEQUENCE:${Math.max(0, Number(booking.rescheduleCount) || 0)}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(booking.startsAt)}`,
    `DTEND:${icsDate(booking.endsAt)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    ...(url ? [`URL:${url}`] : []),
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(cancelled ? [] : [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(title)}`,
      "TRIGGER:-PT10M",
      "END:VALARM",
    ]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
