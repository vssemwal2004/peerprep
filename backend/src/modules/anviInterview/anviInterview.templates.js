// Fixed lines ANVI speaks in the hybrid runtime. They are the same for every student, so their audio is
// generated once per tenant, voice and schema version and shared. Nothing here holds a name or any other
// student detail: the intro and closing are generic, and the student's name is shown as text only.
// Interviews are English only, so every template has English text; `text` stays keyed by language so a
// reviewed translation can be added later without a schema change.

/** Bump when any template text changes: it is part of every template audio hash and R2 path. */
export const TEMPLATE_SCHEMA_VERSION = 1;

export const TEMPLATE_KINDS = Object.freeze(["clarify", "nudge", "intro", "closing", "ack", "transition", "move_on", "number", "decline", "wellbeing"]);
export const MAX_NUMBER_CLIP = 40;

const NUMBER_WORDS = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = { 20: "twenty", 30: "thirty", 40: "forty" };
const numberWord = (n) => (n < 20 ? NUMBER_WORDS[n] : `${TENS[n - (n % 10)]}${n % 10 ? `-${NUMBER_WORDS[n % 10]}` : ""}`);

const entry = (id, kind, English, extra = {}) => Object.freeze({ id, kind, text: Object.freeze({ English }), reviewed: true, ...extra });

const FIXED = [
  // The spec's clarification templates (also offered to the decision model as cached follow-ups).
  entry("clarify.example", "clarify", "Please answer using an example."),
  entry("clarify.think", "clarify", "You can take a few seconds to think."),
  entry("clarify.main_idea", "clarify", "Please explain the main idea first."),
  entry("clarify.complexity", "clarify", "Can you describe the time complexity?"),
  entry("clarify.trade_off", "clarify", "What trade-off would you consider?"),
  entry("clarify.scale", "clarify", "How would this behave at scale?"),
  // The answer to "what do you mean?": the question itself is not reworded.
  entry("clarify.own_words", "clarify", "Sure. Tell me what you understand about it, in your own words, and we can build from there."),
  entry("nudge.think_time", "nudge", "You can take a few seconds to think."),
  entry("nudge.take_time", "nudge", "Sure, take a moment. Start whenever you are ready."),
  entry("move_on.next", "move_on", "Let's move to the next one."),
  entry("move_on.skip", "move_on", "No problem. Let's move to the next one."),
  entry("transition.follow_up", "transition", "One quick follow-up on that."),
  // Off-topic, answer, score or instruction requests: declined in one line, then the same question again.
  entry("decline.off_topic", "decline", "Sorry, I can't help with that. Let's continue with the interview."),
  // The candidate is unwell or has an emergency: ANVI never ends the interview herself.
  entry("wellbeing.reschedule", "wellbeing", "I'm sorry to hear that. If you're not feeling well, you can end the interview using the End interview button, and ask your coordinator or admin to reschedule it for you. Would you like to continue for now?"),
  // Their "no" to continuing: ANVI points to the button and waits on the same question.
  entry("wellbeing.end_hint", "wellbeing", "No problem. Please use the End interview button to finish now, and your coordinator or admin can reschedule your interview. Take care."),
  entry("ack.okay", "ack", "Okay."),
  entry("ack.right", "ack", "Right."),
  entry("ack.thank_you", "ack", "Thank you."),
  entry("ack.got_it", "ack", "Got it."),
  entry("ack.alright", "ack", "Alright."),
  entry("intro.default", "intro", "Hello, and welcome. I am ANVI, and I will be your interviewer today. I will ask you a few questions, one at a time. Take your time, and answer in your own words. Let's begin."),
  entry("closing.default", "closing", "That brings us to the end of the interview. Thank you for your time. Your detailed report will be ready shortly. All the best."),
  entry("closing.time", "closing", "We have reached the end of our time, so let's stop here. Thank you for your time. Your detailed report will be ready shortly. All the best."),
];

const NUMBERS = Array.from({ length: MAX_NUMBER_CLIP }, (_, index) => {
  const n = index + 1;
  return entry(`number.${n}`, "number", `Question ${numberWord(n)}.`, { n });
});

/** The whole catalogue, frozen. */
export const TEMPLATES = Object.freeze([...FIXED, ...NUMBERS]);
const BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));

export const templateById = (id) => BY_ID.get(String(id || "")) || null;
export const templatesOfKind = (kind) => TEMPLATES.filter((template) => template.kind === kind);
/** The ids the decision model may name for a cached follow-up or a clarification. */
export const CLARIFY_TEMPLATE_IDS = Object.freeze(templatesOfKind("clarify").map((template) => template.id));
export const ACK_TEMPLATE_IDS = Object.freeze(templatesOfKind("ack").map((template) => template.id));

/** The template's text in `language`, else its English text; null for an unknown id. */
export function templateText(id, language = "English") {
  const template = templateById(id);
  if (!template) return null;
  return template.text[language] || template.text.English;
}

/** The clip id for "Question n.", or null outside 1..MAX_NUMBER_CLIP (the prompt is then text only). */
export function numberClipId(n) {
  const value = Number(n);
  return Number.isInteger(value) && value >= 1 && value <= MAX_NUMBER_CLIP ? `number.${value}` : null;
}

/**
 * Templates to generate audio for ahead of time: reviewed entries that have text in one of `languages`.
 * Returns [{ id, kind, language, text }].
 */
export function pregenTemplates(languages = ["English"]) {
  const wanted = (Array.isArray(languages) ? languages : [languages]).filter(Boolean);
  const out = [];
  for (const template of TEMPLATES) {
    if (!template.reviewed) continue;
    for (const language of wanted) {
      if (template.text[language]) out.push({ id: template.id, kind: template.kind, language, text: template.text[language] });
    }
  }
  return out;
}

/** The next acknowledgement clip: rotated, never the same one twice in a row. `random` returns [0, 1). */
export function pickAck(previousId, random = Math.random) {
  const choices = ACK_TEMPLATE_IDS.filter((id) => id !== previousId);
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(Number(random()) * choices.length) || 0));
  return choices[index];
}
