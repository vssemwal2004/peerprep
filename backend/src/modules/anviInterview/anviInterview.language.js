// Deterministic checks that a piece of speech (ANVI's Live output transcription, or a candidate's answer
// transcript) is in another language than a strict interview's own. They only count words, so they are cheap,
// repeatable and testable, and they are deliberately conservative:
// - Hindi is recognised by Devanagari script, or by a run of common romanised Hindi words. Romanised Hindi
//   is a heuristic: only frequent function words count, and words that are also English or common names
//   ("to", "do", "main", "me", "par", "the", "hi", "tab", "Diya", "Abhi") never do, so a stray "Achha" or an
//   Indian name is not a language switch. Unusual spellings of Hindi words are missed.
// - English inside a Hindi interview is recognised by English function words; technical terms are not.
// - Hinglish mixes both by definition, so nothing is ever off-language in a Hinglish interview, and other
//   Indian languages written in their own scripts are not detected for a Hindi interview.
// A check never changes a score: the conductor only corrects ANVI and flags an answer for the report.
import { CLOSING_PHRASE } from "./anviInterview.prompts.js";

const DEVANAGARI = /[ऀ-ॿ]/u;
const ROMAN_HINDI = new Set(`
  hai hain hoon hun ho hota hoti hote tha thi raha rahe rahi rha rhe rhi hoga hogi honge
  ka ki ke ko se mein mai ek aisa aise wahi yaad mujhe mera meri mere hum humne hamara hamari maine aap aapka aapki aapke tum tumhara
  yeh ye woh wo voh vo yahan wahan isme usme iska uska iski uski iske uske inka unka apna apni apne
  aur lekin magar kyunki kyonki kyuki agar toh bhi sirf phir pehle baad
  nahi nahin nhi kya kyun kyon kaise kaisa kaisi kahan kaun kitna kitne kitni kuch koi sab sabhi dono bahut zyada thoda
  kar karna karte karta karti karke karo kariye kijiye kiya kiye kiyi karenge karunga karungi sakta sakte sakti chahiye
  jata jaata jati jaati jate jaate jayega jaayega jaenge diye dena dete deta deti dijiye liye lena lete leta
  batao bataiye batana bataun samajh samjha samjhe samjho dekho dekhiye dekhte chaliye shuru baat sawal sawaal jawab
  achha accha acha theek thik haan ji matlab yaani jaise waise wala wali wale
  aapko unko unke inko inke usko isko humko tumko mujhko sabko taaki taki saare sare padega padta padti padte jaaye wajah
`.trim().split(/\s+/));
const ENGLISH_FUNCTION = new Set(`
  the is are was were be been being am a an and or but so because if then than that this these those
  it its we our you your they their he she his her i my me of to in on at for with from by about into
  can could will would should shall may might must do does did have has had not no there here what which
  who how when where why
`.trim().split(/\s+/));
// The conductor's fixed English phrases are spoken in every language and never count.
const FIXED_PHRASES = [new RegExp(CLOSING_PHRASE.source, "gi"), /\bquestion\s+\d{1,3}\s*[:.,-]?/gi];
// At least this many words in the other language, making up at least this share of the words.
const MIN_OTHER_WORDS = 3;
const MIN_OTHER_SHARE = 0.3;
// English inside Hindi: enough English function words and almost no Hindi.
const MIN_ENGLISH_WORDS = 6;
const MIN_ENGLISH_SHARE = 0.25;
const MAX_HINDI_SHARE = 0.15;

/** Word counts of a text: { words, hindi, english } (Devanagari or romanised Hindi words, English function words). */
export function languageCounts(text) {
  let clean = String(text || "").normalize("NFKC");
  for (const phrase of FIXED_PHRASES) clean = clean.replace(phrase, " ");
  const tokens = clean.toLowerCase().match(/[\p{L}\p{M}']+/gu) || [];
  let hindi = 0;
  let english = 0;
  for (const token of tokens) {
    if (DEVANAGARI.test(token) || ROMAN_HINDI.has(token)) hindi += 1;
    else if (ENGLISH_FUNCTION.has(token)) english += 1;
  }
  return { words: tokens.length, hindi, english };
}

/**
 * Whether `text` is clearly in another language than the interview `language` ("English" | "Hindi" |
 * "Hinglish"). A short reply, a borrowed word or technical terms are not; Hinglish never is.
 */
export function isOffLanguage(text, language) {
  const { words, hindi, english } = languageCounts(text);
  if (!words) return false;
  if (language === "English") return hindi >= MIN_OTHER_WORDS && hindi / words >= MIN_OTHER_SHARE;
  if (language === "Hindi") return english >= MIN_ENGLISH_WORDS && english / words >= MIN_ENGLISH_SHARE && hindi / words < MAX_HINDI_SHARE;
  return false;
}
