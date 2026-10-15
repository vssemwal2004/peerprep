import { api } from '../utils/api';

// The student's last practice language. The server copy (user.practiceLanguage from /auth/me) survives logout
// and other devices; this per-user copy covers changes made since the cached /auth/me response was fetched.
const sessionLanguages = new Map();
const preferredFor = (user) => sessionLanguages.get(String(user?._id || '')) || user?.practiceLanguage || '';

/** The language a problem opens in: the student's last one when the problem offers it, else `fallback`, else its first. */
export function pickPracticeLanguage(user, supportedLanguages = [], fallback = '') {
  const preferred = preferredFor(user);
  if (preferred && supportedLanguages.includes(preferred)) return preferred;
  if (fallback && supportedLanguages.includes(fallback)) return fallback;
  return supportedLanguages[0] || 'python';
}

/** Called on a practice run or submit; saves only when the language actually changed. SQL problems are SQL-only, so they never replace it. */
export function rememberPracticeLanguage(user, language) {
  if (!user?._id || user.role !== 'student' || !language || language === 'sql' || language === preferredFor(user)) return;
  sessionLanguages.set(String(user._id), language);
  void api.savePracticeLanguage(language).catch(() => {});
}
