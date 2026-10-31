import { FOLLOW_UP_ASK_LIMIT, newQuestion } from "../definition.js";
import { estimate } from "./structure.js";

export const DEFAULT_INTERVIEWER_NAME = "ANVI";

export const toInterviewer = (profile) => ({
  ...profile.data,
  profileId: profile._id,
  profileRevision: profile.revision,
});

// Every interview needs an interviewer profile snapshot. When the admin has not
// picked one, reuse (or create once) a plain "ANVI" profile so setup can finish.
export async function ensureDefaultInterviewer(api, language = "English") {
  const list = await api.resources("profiles", {
    active: "true",
    search: DEFAULT_INTERVIEWER_NAME,
  });
  const items = (list?.items || []).filter((item) => item.active !== false);
  const existing =
    items.find(
      (item) => item.name?.trim().toLowerCase() === DEFAULT_INTERVIEWER_NAME.toLowerCase(),
    ) || items.find((item) => item.data?.displayName === DEFAULT_INTERVIEWER_NAME);
  if (existing) return toInterviewer(existing);
  const profile = (name) =>
    api.saveResource("profiles", {
      name,
      data: {
        displayName: DEFAULT_INTERVIEWER_NAME,
        avatar: "annu",
        tone: "Professional",
        language,
        introduction: "",
        closing: "",
      },
    });
  try {
    return toInterviewer(await profile(DEFAULT_INTERVIEWER_NAME));
  } catch (error) {
    // An archived "ANVI" profile keeps its name; use a distinct one instead.
    if (error.response?.status !== 409) throw error;
    return toInterviewer(await profile("ANVI interviewer"));
  }
}

// The default follow-ups for new questions is an authoring preference, kept in
// this browser only: the interview definition has no field for it.
const FOLLOW_UPS_KEY = "peerprep.aiInterviews.defaultFollowUps";
export function readDefaultFollowUps() {
  try {
    const value = Number(window.localStorage.getItem(FOLLOW_UPS_KEY));
    return window.localStorage.getItem(FOLLOW_UPS_KEY) !== null &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= FOLLOW_UP_ASK_LIMIT
      ? value
      : 1;
  } catch {
    return 1;
  }
}
export function writeDefaultFollowUps(value) {
  try {
    window.localStorage.setItem(FOLLOW_UPS_KEY, String(value));
  } catch {
    // Storage can be unavailable (private mode); the default still applies this session.
  }
}

export const blankQuestion = (extra = {}) => ({
  ...newQuestion(),
  followUpLimit: readDefaultFollowUps(),
  ...extra,
});

export const SAMPLE_STUDENT = "Priya";
// Renders an intro/closing script with sample values, matching the server's
// fillScript fallbacks ({duration} already includes the word "minutes").
export function renderScript(template, data) {
  const counts = estimate(data);
  const minutes = counts.unlimited ? 0 : counts.minutes;
  const values = {
    name: SAMPLE_STUDENT,
    role: data.role?.trim() || "this role",
    company: data.companyName?.trim() || "our company",
    count: String(counts.total),
    duration: minutes
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : "a few minutes",
  };
  return template.replace(
    /\{(name|role|company|count|duration)\}/gi,
    (_, key) => values[key.toLowerCase()],
  );
}

// "That completes our interview" is reserved by the runtime, so suggestions avoid it.
export const suggestedScripts = (data) => ({
  introduction: `Hi {name}, I'm ANVI. Today we'll practise a {role} interview${data.companyName ? " for {company}" : ""}. I'll ask {count} questions, and it should take about {duration}. Take your time and think aloud. Shall we begin?`,
  closing:
    "Thank you, {name}. It was great talking with you. Your report will be ready shortly.",
});

