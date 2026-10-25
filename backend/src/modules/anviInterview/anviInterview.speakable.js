// The lines of a published interview that are identical for every student, so their audio can be
// generated once at publish time (user decision 5, 2026-10-23). Per-student lines (ANVI-prompt topics,
// topic questions, resume questions) are never listed here: they are voiced per attempt and never shared.
import { ANVI_LANGUAGE } from "../../services/aiInterviewDefinition.js";
import {
  WARMUP_QID, WARMUP_TEXT, authoredFollowUpsOf, genericResumeQuestions, normalizeResumeSettings, normalizeWarmup, questionText,
  specificQuestionText, textHashOf,
} from "./anviInterview.plan.js";

export { normalizeSpokenText, textHashOf } from "./anviInterview.plan.js";

// English only (DECISIONS #0): any other language asked for is ignored.
const SPOKEN_LANGUAGES = Object.freeze([ANVI_LANGUAGE]);
const resumeFallbackId = (i) => `resume-fallback-${i + 1}`;

const hasResumeQuestions = (data) => (data.sections || []).some((section) => (section.groups || [])
  .some((group) => group.source !== "annu" && (group.questions || []).some((question) => question.kind === "resume")));

/**
 * Static speakable lines of a snapshot (normalizeDefinition shape), one per language:
 * `[{ id, questionId, kind, language, voice, text, textHash }]`.
 * - kind "question": a manual specific question with its "(a) ..." parts, exactly as the plan speaks it;
 * - kind "follow_up": an authored follow-up, id `${questionId}:f${i}` (i = its index in item.authoredFollowUps);
 * - kind "warmup": the scored "Tell me about yourself" (only when it is a planned question);
 * - kind "resume_fallback": the generic resume questions, when the interview can ask resume questions.
 * Topic, ANVI-prompt (annu) and resume questions are skipped; "Question n:" labels are stripped.
 */
export function staticSpeakableItems(data, languages = SPOKEN_LANGUAGES, voice = "") {
  const snapshot = data || {};
  const wanted = (Array.isArray(languages) ? languages : [languages]).filter((language) => SPOKEN_LANGUAGES.includes(language));
  const spoken = wanted.length ? [...new Set(wanted)] : [...SPOKEN_LANGUAGES];
  const lines = [];
  const add = (id, questionId, kind, text) => {
    if (text) lines.push({ id, questionId, kind, text });
  };

  const warmup = normalizeWarmup(snapshot.anvi?.warmup);
  if (warmup.enabled && warmup.tellMeAboutYourself && warmup.scored) add(WARMUP_QID, WARMUP_QID, "warmup", WARMUP_TEXT);

  for (const section of snapshot.sections || []) {
    for (const group of section.groups || []) {
      if (group.source === "annu") continue;
      for (const question of group.questions || []) {
        if (!question?.id || question.kind === "resume") continue;
        // The plan skips a question without a main prompt, so it has no audio either.
        if (question.kind !== "topic" && questionText(question.prompt))
          add(String(question.id), String(question.id), "question", specificQuestionText(question));
        // Authored follow-ups are the same for everyone, also on a topic question.
        authoredFollowUpsOf(question).forEach((text, i) => add(`${question.id}:f${i}`, String(question.id), "follow_up", text));
      }
    }
  }

  const resume = normalizeResumeSettings(snapshot);
  if ((resume.mode !== "none" && resume.questionCount > 0) || hasResumeQuestions(snapshot))
    genericResumeQuestions().forEach((text, i) => add(resumeFallbackId(i), resumeFallbackId(i), "resume_fallback", text));

  const seen = new Set();
  const out = [];
  for (const language of spoken) {
    for (const line of lines) {
      const key = `${language}:${line.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...line, language, voice: String(voice || ""), textHash: textHashOf(line.text) });
    }
  }
  return out;
}
