// Deterministic voice intents for the hybrid runtime, read from a candidate turn's transcript before
// any model call. Interviews are English, but candidates may still answer in Hinglish or Hindi, so every
// pattern set is always checked. Skips follow the conductor's own rule (skipRequestOf) exactly.
import { skipRequestOf } from "./anviInterview.conductor.js";
import { SKIP_CONTENT_WORDS } from "./anviInterview.hybridRuntime.js";

export const INTENTS = Object.freeze(["repeat", "skip", "end_request", "clarify_request", "think_time", "dont_know", "off_topic", "wellbeing", "none"]);

// A match is "clear" only for a short utterance that is mostly the phrase itself.
export const CLEAR_MAX_WORDS = 8;
const CLEAR_MAX_OTHER_WORDS = 2;
// Requests for answers, scores or instructions run a little longer ("can you please tell me the answer").
const OFF_TOPIC_MAX_WORDS = 12;
// A clear wellbeing phrase anywhere in a turn this short is acted on; a longer turn is left to the model.
export const WELLBEING_MAX_WORDS = 15;

// Copied from the conductor (not exported there).
const END_REQUEST = /\b(?:(?:end|finish|stop|close|wrap up|quit)\s+(?:the\s+|this\s+)?(?:interview|session|call|here|now|it)|i (?:want|would like|wanna|need) to (?:end|stop|finish|quit|leave)|(?:let's|lets|let us|can we|could we|please) (?:end|stop|finish|wrap up)|khatam kar|band kar|bas kar)/i;
const INJECTION_ATTEMPT = /\b(ignore (all |any |the |your )?(previous |earlier )?(instructions|rules)|reveal (the )?(answer|key points)|(give|award) me (full|perfect|10|ten|100)|change (my )?(score|marks)|system prompt)\b/i;

// \b does not work around Devanagari, so those phrases use explicit boundaries.
const DEV_START = "(?<![\\p{L}\\p{M}])";
const DEV_END = "(?![\\p{L}\\p{M}])";
const dev = (body) => new RegExp(`${DEV_START}(?:${body})${DEV_END}`, "gu");

const PATTERNS = {
  repeat: [
    /\b(?:can|could|would|will) you (?:please )?(?:repeat|say)\b(?: (?:that|it|the question|this|again|once more))*/gi,
    /\brepeat\b(?:\s+(?:the|that|your|this|it|question|again|once|more|please|kijiye|kariye|karo|karein|kar do|kar dijiye|karenge|kar sakte|ho|sakta|hai|na)\b)*/gi,
    /\b(?:say|ask|read) (?:that|it|the question|this|this question)? ?(?:again|once more|one more time)\b/gi,
    /\b(?:pardon(?: me)?|come again)\b/gi,
    /^(?:(?:sorry|please|okay|ok),? )*(?:one more time|once again|once more)(?: please)?[.?!]*$/gi,
    /\bi (?:did not|didn't|didnt|could not|couldn't|couldnt|can not|cannot|can't|cant) (?:hear|catch|get)\b(?: (?:you|that|it|the question|this|properly|clearly))*/gi,
    /\bwhat was the question\b/gi,
    /\b(?:dobara|dubara|dobaara)\b(?: (?:se|boliye|bolo|bolenge|bol do|bataiye|batao|batayenge|puchiye|poochiye|pucho|poocho|sunaiye|sunao|repeat|kahiye|kaho|kijiye|karo|please))*/gi,
    /\b(?:phir|fir) se (?:boliye|bolo|bolenge|bol do|bataiye|batao|puchiye|poochiye|pucho|poocho|sunaiye|sunao|repeat|kahiye|kaho)\b(?: (?:karo|kijiye|please|na))*/gi,
    /\b(?:phir|fir) se\s*\?/gi,
    /\bek (?:baar|bar) (?:aur|phir|fir)\b(?: (?:se|boliye|bolo|bataiye|batao|repeat|please|kijiye|karo))*/gi,
    /\b(?:sunai|sunayi) (?:nahi|nahin|nhi) (?:diya|di|de|aaya|aya)\b/gi,
    /\b(?:suna|sun) (?:nahi|nahin|nhi)\b/gi,
    dev("फिर से(?: (?:बोलिए|बोलो|बताइए|बताओ|पूछिए|सुनाइए|कहिए))?|दोबारा(?: (?:बोलिए|बोलो|बताइए|बताओ|पूछिए|सुनाइए|कहिए))?|सुनाई नहीं (?:दिया|दी|दे)|एक बार (?:और|फिर)|रिपीट(?: (?:कीजिए|करिए|करो|करें))?"),
  ],
  clarify_request: [
    /\bi (?:did not|didn't|didnt|do not|don't|dont) (?:understand|follow)\b(?: (?:the|that|this|it|question|properly|what you mean|you))*/gi,
    /\bwhat do you mean\b(?: (?:by that|by this|exactly))?/gi,
    /\b(?:can|could) you (?:please )?(?:rephrase|explain|clarify)\b(?: (?:the|that|this|it|question|again|a bit|a little|more))*/gi,
    /\b(?:rephrase|clarify)\b(?: (?:the|that|this|it|question|please))*/gi,
    /\bnot (?:clear|sure what you mean)\b/gi,
    /\b(?:samajh|samjh|samaj) (?:nahi|nahin|nhi|na) (?:aaya|aya|aayi|aai|paaya|paya)\b/gi,
    /\b(?:matlab|mtlb) (?:kya|samjhaiye|samjhao)\b(?: (?:hai|hua))?/gi,
    /\b(?:samjhaiye|samjhao|samjha do|samjha dijiye)\b/gi,
    dev("समझ नहीं (?:आया|आई|पाया)|मतलब(?: क्या(?: है)?)?|समझाइए|समझाओ"),
  ],
  think_time: [
    /\b(?:give me|can i (?:have|get|take)|i need|let me (?:have|take)) (?:a|one|some|few|a few|two|a couple of) ?(?:moment|minute|second|sec|seconds|minutes|moments|time)\b/gi,
    /\blet me (?:think|recall|remember)\b(?: (?:about it|for a (?:moment|second|minute)|a bit|once))*/gi,
    /\b(?:one|just a|wait a|hold on a) (?:moment|minute|second|sec)\b/gi,
    /^(?:(?:sorry|okay|ok|um|uh|hmm),? )*(?:hold on|wait)\b(?: (?:please|a bit))*/gi,
    /\bthoda (?:ruko|rukiye|ruk jao|ruk jaiye|time|samay|wait)\b(?: (?:dijiye|do|chahiye|please|karo))*/gi,
    /\bek (?:minute|min|second|sec|pal)\b(?: (?:ruko|rukiye|dijiye|do|please))*/gi,
    /\bsoch(?:ne)? (?:do|dijiye|de|ke batata|ke batati|kar batata|kar batati|ke bataunga|ke bataungi)\b/gi,
    dev("थोड़ा रुको|थोड़ा रुकिए|एक मिनट|सोचने दो|सोचने दीजिए|रुकिए|रुको"),
  ],
  dont_know: [
    /\bi (?:do not|don't|dont|really don't) (?:know|remember|recall)\b(?: (?:this|that|it|the answer|this one|sorry))*/gi,
    /\b(?:i have |i've |i got )?no idea\b(?: (?:about (?:this|that|it)|sorry))*/gi,
    /\bi(?:'m| am) not sure\b(?: (?:about (?:this|that|it)|sorry))*/gi,
    /\bi (?:can not|cannot|can't|cant) (?:answer|recall|remember)\b(?: (?:this|that|it))*/gi,
    /\b(?:mujhe |mereko |muje )?(?:pata|maloom|malum|maalum) (?:nahi|nahin|nhi)\b(?: (?:hai|hain|sir|maam))*/gi,
    /\b(?:nahi|nahin|nhi) (?:pata|aata|maloom|malum)\b(?: (?:hai|mujhe))*/gi,
    dev("(?:मुझे )?(?:पता|मालूम) नहीं(?: है)?|नहीं पता"),
  ],
  // Answers, hints, scores, instructions, other students' data or something unrelated: declined, never answered.
  off_topic: [
    /\b(?:tell|give|show|share|send) me the (?:correct |right |expected |exact |model |full |actual |ideal )?(?:answer|answers|solution|key points)\b(?: (?:to|for|of) (?:this|that|it|the question|this question))*/gi,
    /\bwhat(?:'s| is| was) the (?:correct |right |expected |exact |model |ideal )?(?:answer|solution)\b(?: (?:to|for|of) (?:this|that|it|the question|this question))*/gi,
    /\b(?:the )?expected answer\b/gi,
    /\b(?:answer|solution|jawab|uttar) (?:batao|bata do|bataiye|bata dijiye|bolo|bol do|do|de do|dijiye)\b/gi,
    /\b(?:give|tell|show) me (?:a |some |one |any |a small |a little )?(?:hint|hints|clue|clues)\b/gi,
    /\b(?:can|could|may) i (?:get|have) (?:a |some |one |any )?(?:hint|hints|clue|clues)\b/gi,
    /^(?:(?:please|sorry|okay|ok),? )*(?:(?:any|a|one|some) )?(?:hint|hints|clue)(?: please)?[?.!]*$/gi,
    /\b(?:hint|hints) (?:do|de do|dijiye|chahiye|milega|milegi|mil sakta|mil sakti)\b(?: (?:hai|please|kya))*/gi,
    /\bwhat(?:'s| is| was| are) my (?:score|scores|marks|grade|result|rating)\b(?: (?:so far|now|till now))*/gi,
    /\bhow (?:much|many) (?:marks|points) (?:did i|have i|will i) (?:get|got|score|scored)\b/gi,
    /\bhow much did i score\b/gi,
    /\b(?:mera|mere|apna) (?:score|marks|result|number|numbers) (?:kya|kitna|kitne|batao|bataiye)\b(?: (?:hai|hain|aaya|aaye|hua|hue))*/gi,
    /\bkitne (?:marks|number|numbers) (?:mile|milenge|aaye|aayenge)\b(?: (?:hai|hain|mujhe))*/gi,
    /\b(?:give|award) me (?:full|perfect|good|high|maximum|max|10|ten|100) ?(?:marks|score|points|rating)?\b/gi,
    /\bchange (?:my )?(?:score|marks)\b/gi,
    /\bignore (?:all |any |the |your )?(?:previous |earlier |prior |above )?(?:instructions|rules)\b/gi,
    /\b(?:your |the )?system prompt\b/gi,
    /\b(?:show|tell|reveal|give|share|read|print|what (?:are|is|were)) (?:me )?(?:your|the) (?:prompt|instructions|rules|guidelines|configuration)\b/gi,
    /\breveal (?:your |the )?(?:answers?|key points|prompt|instructions|rules|plan)\b/gi,
    /\bpretend (?:to be|you are|you're)\b/gi,
    /\b(?:other|another) (?:students?|candidates?)(?:'s|')? (?:answers?|scores?|marks|results?|data|details|reports?|numbers?)\b/gi,
    /\b(?:answers?|scores?|marks|results?|details|data) of (?:other|another) (?:students?|candidates?)\b/gi,
    /\btell me a joke\b/gi,
    /\b(?:sing|play) (?:me )?a song\b/gi,
    /\bwhat(?:'s| is) the weather\b(?: (?:today|like))*/gi,
    /\bhelp me cheat\b|\bhow (?:can|do) i cheat\b/gi,
  ],
};

// Unwell, ill or an emergency (English and common Roman Hinglish). Acted on anywhere in a short turn.
const WELLBEING = [
  /\b(?:i am|i'm|im|i feel|i am feeling|i'm feeling|feeling) (?:not well(?![- ](?:versed|prepared|aware|known|read|equipped|suited|defined|structured))|unwell|ill(?!-)|dizzy|nauseous|feverish|very weak|sick(?! of))\b/i,
  /\b(?:not|don't|dont|didn't|didnt) feel(?:ing)? (?:well|good|ok|okay|fine)\b(?! (?:about|with|that))/i,
  /\b(?:i (?:have|have got|got)|i've got|i'm having|i am having|having) (?:a |an |high |mild |bad |slight |severe |terrible |very )*(?:fever|headache|migraine|stomach ?ache|stomach pain|chest pain|body ache|flu|temperature)\b/i,
  /\b(?:family|personal) emergency\b/i,
  /\b(?:i have|i've got|i got|there(?:'s| is)|it's|it is|we have|i'm having|i am having) an? (?:urgent |medical |health |family |personal )?emergency\b/i,
  /\b(?:tabiyat|tabiyet|tabeeyat|tabyat|tabiat) (?:theek|thik|thick|sahi|achhi|acchi|achchi) (?:nahi|nahin|nhi|na)\b/i,
  /\b(?:tabiyat|tabiyet|tabeeyat|tabyat|tabiat) (?:kharab|kharaab|bigad|bigdi|bigad gayi)\b/i,
  /\b(?:main|mai|mein|me) (?:theek|thik|thick) (?:nahi|nahin|nhi) (?:hoon|hun|hu|hoo)\b/i,
  /\b(?:mujhe|muje|mereko|mujko) (?:bukhar|bukhaar|fever|headache|sar dard|sir dard|chakkar)\b/i,
  /\b(?:sar|sir) (?:mein |me |mai )?dard (?:hai|ho raha|ho rha)\b/i,
  /\bghar (?:par|pe|mein|me) (?:emergency|koi emergency)\b/i,
  new RegExp(`${DEV_START}(?:तबीयत (?:ठीक नहीं|खराब)|मैं ठीक नहीं (?:हूँ|हूं)|बुखार|सिर (?:में )?दर्द|सर (?:में )?दर्द)${DEV_END}`, "u"),
];

// A short "yes, let's continue" after ANVI's wellbeing line: only these words, at least one of them a yes.
const CONTINUE_YES = new Set(["yes", "yeah", "yep", "yup", "sure", "okay", "ok", "haan", "han", "ha", "continue", "proceed", "chaliye", "alright", "fine", "carry", "go"]);
const CONTINUE_WORDS = new Set([
  ...CONTINUE_YES, "please", "ji", "sir", "ma'am", "maam", "madam", "i", "i'm", "im", "am", "i'll", "i'd", "will", "would", "like", "want",
  "to", "can", "we", "let's", "lets", "let", "us", "ahead", "on", "keep", "going", "with", "the", "interview", "it", "now", "for",
  "good", "theek", "thik", "hai", "karte", "hain", "kar", "lete", "karenge", "karo", "kijiye", "main", "mai", "hoon", "hun", "hu",
  "thank", "thanks", "you", "right", "just", "a", "bit", "better",
]);
const CONTINUE_MAX_WORDS = 10;
// A short "no" to continuing after the wellbeing line: only these words, at least one of them a no.
const DECLINE_NO = new Set(["no", "nope", "nah", "nahi", "nahin", "nhi", "not", "don't", "dont", "can't", "cant", "cannot"]);
const DECLINE_WORDS = new Set([
  ...DECLINE_NO, "i", "i'm", "im", "am", "really", "want", "to", "continue", "now", "right", "today", "sorry", "please", "sir", "ma'am",
  "maam", "madam", "ji", "thanks", "thank", "you", "able", "think", "can", "do", "the", "interview", "it", "this", "anymore", "abhi",
  "main", "mai", "kar", "paunga", "paungi", "payega", "payegi", "hoga", "ho", "hai", "sakta", "sakti", "okay", "ok", "actually",
]);
const NEGATION = new Set(["not", "don't", "dont", "can't", "cant", "cannot"]);

const PHRASE_INTENTS = ["off_topic", "repeat", "clarify_request", "think_time", "dont_know"];

// Politeness and hedge words that do not change what a short request means.
const FILLER = new Set([
  "please", "pls", "plz", "kindly", "sorry", "sir", "ma'am", "maam", "madam", "mam", "ji", "ok", "okay", "um", "umm", "uh",
  "uhh", "hmm", "hm", "erm", "ah", "oh", "so", "actually", "basically", "well", "yeah", "yes", "no", "haan", "han", "achha",
  "acha", "theek", "hai", "na", "can", "could", "would", "you", "me", "i", "the", "a", "that", "this", "it", "question",
  "again", "just", "once", "aap", "kya", "zara", "jara", "thoda", "bit", "little", "really", "hi", "hello",
  "कृपया", "जी", "सर", "मैम", "आप", "क्या", "ज़रा", "जरा", "प्लीज़", "प्लीज", "है",
]);

const normalize = (text) => String(text || "").normalize("NFKC").replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
const tokensOf = (text) => normalize(text).toLowerCase().match(/[\p{L}\p{M}\p{N}']+/gu) || [];

// Words left once every match of the intent's phrases and the filler words are removed.
function otherWords(text, patterns) {
  let rest = normalize(text).toLowerCase();
  for (const pattern of patterns) rest = rest.replace(pattern, " ");
  return tokensOf(rest).filter((token) => !FILLER.has(token)).length;
}

function matches(text, patterns) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    const hit = pattern.test(text);
    pattern.lastIndex = 0;
    return hit;
  });
}

function phraseIntent(clean, intent) {
  const patterns = PATTERNS[intent];
  if (!matches(clean, patterns)) return null;
  const maxWords = intent === "off_topic" ? OFF_TOPIC_MAX_WORDS : CLEAR_MAX_WORDS;
  const clear = tokensOf(clean).length <= maxWords && otherWords(clean, patterns) <= CLEAR_MAX_OTHER_WORDS;
  return { intent, clear };
}

/** The candidate said they are unwell, ill or have an emergency (anywhere in the text). */
export const isWellbeingConcern = (text) => {
  const clean = normalize(text).toLowerCase();
  return Boolean(clean) && WELLBEING.some((pattern) => pattern.test(clean));
};

/** A short "yes, let's continue" (the reply to ANVI's wellbeing line). */
export function isContinueReply(text) {
  const tokens = tokensOf(text);
  return tokens.length > 0 && tokens.length <= CONTINUE_MAX_WORDS && tokens.every((token) => CONTINUE_WORDS.has(token)) && tokens.some((token) => CONTINUE_YES.has(token));
}

/**
 * A short "no" to continuing (the reply to ANVI's wellbeing line): "no", "nahi", "not now", "I don't want
 * to continue", "I can't continue". "No, I can continue" (continue with no negation) is not a decline.
 */
export function isDeclineReply(text) {
  const tokens = tokensOf(text);
  if (!tokens.length || tokens.length > CONTINUE_MAX_WORDS || !tokens.every((token) => DECLINE_WORDS.has(token))) return false;
  if (!tokens.some((token) => DECLINE_NO.has(token))) return false;
  return !tokens.includes("continue") || tokens.some((token) => NEGATION.has(token));
}

/** The candidate asked to end the interview (the conductor's END_REQUEST). */
export const isEndRequest = (text) => END_REQUEST.test(normalize(text));

/** The candidate tried to steer scoring or instructions (the conductor's INJECTION_ATTEMPT). */
export const isInjectionAttempt = (text) => INJECTION_ATTEMPT.test(normalize(text));

/**
 * The voice intent of one candidate turn: { intent, clear }. `intent` is one of INTENTS; `clear` is true
 * only when the runtime may act on it without the decision model (a short utterance that is mostly the
 * phrase). A skip is clear exactly when the conductor would take the turn as a skip. `off_topic` (answers,
 * hints, scores, instructions, other students' data, unrelated asks) and `wellbeing` (unwell or an
 * emergency, anywhere in a turn of at most WELLBEING_MAX_WORDS) are acted on with fixed template lines.
 * `language` is the interview language; it does not narrow the patterns.
 */
export function detectIntent(text, language = "English") { // eslint-disable-line no-unused-vars
  const clean = normalize(text);
  if (!clean) return { intent: "none", clear: false };
  // Unwell or an emergency comes first, even with an end request in the same turn (the runtime still
  // ends by voice only where the interview allows it).
  const wellbeing = isWellbeingConcern(clean);
  if (wellbeing && tokensOf(clean).length <= WELLBEING_MAX_WORDS) return { intent: "wellbeing", clear: true };
  if (END_REQUEST.test(clean)) {
    const rest = tokensOf(clean.replace(new RegExp(END_REQUEST.source, "gi"), " ")).filter((token) => !FILLER.has(token)).length;
    return { intent: "end_request", clear: tokensOf(clean).length <= CLEAR_MAX_WORDS && rest <= CLEAR_MAX_OTHER_WORDS };
  }
  const skip = skipRequestOf(clean);
  if (skip.requested) return { intent: "skip", clear: skip.content <= SKIP_CONTENT_WORDS };
  for (const intent of PHRASE_INTENTS) {
    const found = phraseIntent(clean, intent);
    if (found?.clear) return found;
  }
  // Nothing clear: report the first ambiguous match so the decision model sees it (an answer that only
  // mentions "the expected answer" is reported last).
  for (const intent of [...PHRASE_INTENTS.slice(1), "off_topic"]) {
    const found = phraseIntent(clean, intent);
    if (found) return found;
  }
  if (wellbeing) return { intent: "wellbeing", clear: false };
  return { intent: "none", clear: false };
}
