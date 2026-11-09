// How a student worked on one practice question before submitting: when they opened it, how long
// the tab was actually in use, and how much code was pasted from outside the editor.
//
// The browser reports durations (not clock times), so a wrong device clock cannot move the start:
// the server places the start at `submittedAt - elapsedMs`. Every number is clamped, and nothing
// here is proof of copying. It only marks a solve "needs review" for a person to look at.

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

/** Server-side record from the browser's report, or undefined when nothing usable was sent. */
export function sanitizeEffort(raw, { now = new Date(), sourceCode = '' } = {}) {
  if (!raw || typeof raw !== 'object') return undefined;
  const elapsedMs = clamp(raw.elapsedMs, 0, 7 * DAY_MS);
  if (!elapsedMs) return undefined;
  return {
    startedAt: new Date(now.getTime() - elapsedMs),
    elapsedMs,
    // Missing active time (an older page) must not read as "0 s" and flag the solve as very fast.
    activeMs: raw.activeMs === undefined || raw.activeMs === null ? elapsedMs : clamp(raw.activeMs, 0, elapsedMs),
    pastes: clamp(raw.pastes, 0, 10000),
    pastedChars: clamp(raw.pastedChars, 0, 2_000_000),
    codeChars: String(sourceCode || '').length,
  };
}

// A solve is marked for review when either holds. Times are active (tab in use) time.
export const REVIEW_RULES = Object.freeze({
  // Less active time than this, from opening the question to the accepted submission.
  minActiveSeconds: { Easy: 45, Medium: 90, Hard: 150, default: 60 },
  // At least this share of the submitted code arrived by pasting from outside the editor…
  pastedShare: 0.5,
  // …and at least this many pasted characters (a pasted one-liner is not a concern).
  minPastedChars: 80,
});

/**
 * { solveMs, activeMs, pastedShare (0-100), reasons: ['fast' | 'pasted'] } for one accepted
 * submission, or null when it was not tracked (submitted before tracking existed).
 */
export function reviewOf(effort, difficulty, submittedAt) {
  if (!effort?.startedAt) return null;
  const solveMs = Math.max(0, new Date(submittedAt).getTime() - new Date(effort.startedAt).getTime());
  const activeMs = Math.min(solveMs, Number(effort.activeMs) || 0);
  const codeChars = Math.max(1, Number(effort.codeChars) || 0);
  const pastedChars = Number(effort.pastedChars) || 0;
  const share = Math.min(1, pastedChars / codeChars);
  const reasons = [];
  const minSeconds = REVIEW_RULES.minActiveSeconds[difficulty] ?? REVIEW_RULES.minActiveSeconds.default;
  if (activeMs < minSeconds * 1000) reasons.push('fast');
  if (share >= REVIEW_RULES.pastedShare && pastedChars >= REVIEW_RULES.minPastedChars) reasons.push('pasted');
  return { solveMs, activeMs, pastedShare: Math.round(share * 100), pastes: Number(effort.pastes) || 0, reasons };
}

export const REVIEW_REASON_LABELS = Object.freeze({ fast: 'Very fast', pasted: 'Mostly pasted' });
