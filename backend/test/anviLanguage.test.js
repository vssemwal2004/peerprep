import assert from "node:assert/strict";
import { test } from "node:test";
import { isOffLanguage, languageCounts } from "../src/modules/anviInterview/anviInterview.language.js";

test("an English interview: Devanagari or a clear run of romanised Hindi is another language", () => {
  assert.equal(isOffLanguage("Closure ek aisa function hai jo apne scope ko yaad rakhta hai.", "English"), true);
  assert.equal(isOffLanguage("Achha, theek hai. Ab batao, how would you design this?", "English"), true);
  assert.equal(isOffLanguage("क्लोज़र एक फ़ंक्शन है जो स्कोप याद रखता है", "English"), true);
  // A borrowed word, an Indian name or English words that are also Hindi spellings are not.
  assert.equal(isOffLanguage("Achha, okay. Tell me more about how you handle state in React.", "English"), false);
  assert.equal(isOffLanguage("Thank you Abhi and Diya, the main idea is to do it on the tab.", "English"), false);
  assert.equal(isOffLanguage("Question 2: What is a closure?", "English"), false);
  assert.equal(isOffLanguage("hai", "English"), false, "one word is never a language switch");
  assert.equal(isOffLanguage("", "English"), false);
});

test("a technical Hinglish answer full of English terms is still another language in an English interview", () => {
  // The transcript of a Hinglish answer from a real-Gemini end-to-end run (2026-10-22). Its Hindi share was
  // 13/44 before pronoun and connector forms such as "aapko", "unke", "taaki" and "padega" were counted.
  const answer = "aapko weekly attendance report nikalne ke liye SQL join ka use karna padega members table aur check-in logs table ko left join karte hain user ID ke basis par taaki sare members ka data aur unke logs ek hi query mein mil jaye.";
  assert.equal(languageCounts(answer).hindi, 18);
  assert.equal(isOffLanguage(answer, "English"), true);
  // The same forms never appear in an English answer.
  assert.equal(isOffLanguage("I joined the members table with the check-in logs table so that the weekly report has every member.", "English"), false);
});

test("a Hindi interview: English sentences are another language, technical terms are not", () => {
  assert.equal(isOffLanguage("Okay, so can you tell me how the virtual DOM works in React?", "Hindi"), true);
  assert.equal(isOffLanguage("Ab bataiye, React mein virtual DOM kaise kaam karta hai?", "Hindi"), false);
  assert.equal(isOffLanguage("अब बताइए, React में virtual DOM कैसे काम करता है?", "Hindi"), false);
  // The fixed English phrases never count.
  assert.equal(isOffLanguage("That completes our interview. Aapka bahut dhanyavaad, aapki report jaldi taiyaar hogi.", "Hindi"), false);
  assert.equal(isOffLanguage("Yes I think so", "Hindi"), false, "too short to judge");
});

test("a Hinglish interview mixes both languages, so nothing is off-language", () => {
  assert.equal(isOffLanguage("Okay, so can you tell me how the virtual DOM works in React?", "Hinglish"), false);
  assert.equal(isOffLanguage("क्लोज़र एक फ़ंक्शन है जो स्कोप याद रखता है", "Hinglish"), false);
  assert.deepEqual(languageCounts("Question 3: yeh kya hai? That completes our interview."), { words: 3, hindi: 3, english: 0 });
});
