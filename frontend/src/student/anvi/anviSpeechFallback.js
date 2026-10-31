// ANVI hybrid: when a prompt's cached audio is missing (TTS quota, R2 or network down), the room speaks
// the prompt's text with the browser's own speech voice instead of staying silent. Free and on-device for
// most system voices; the text never leaves the page through this module. Prefers an Indian English
// female voice, then any English female voice, then any English voice.

/** Mirrors the server's ack templates, for the acknowledgement after an answer when no ack clip is ready. */
export const ACK_LINES = Object.freeze(["Okay.", "Right.", "Thank you.", "Got it.", "Alright."]);

const FEMALE = /female|heera|neerja|swara|kalpana|zira|aria|jenny|samantha|susan|hazel|libby|sonia|natasha|google uk english female/i;
const MALE = /\bmale\b|ravi|prabhat|david|mark|george|guy|ryan|daniel|google uk english male/i;

/** The best voice for ANVI from `voices` (SpeechSynthesisVoice-like: { name, lang }), or null. */
export function pickVoice(voices = []) {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(String(voice?.lang || "")));
  const indian = english.filter((voice) => /^en[-_]in$/i.test(voice.lang));
  const female = (list) => list.find((voice) => FEMALE.test(voice.name) && !MALE.test(voice.name));
  return female(indian) || female(english) || indian.find((voice) => !MALE.test(voice.name)) || indian[0] || english[0] || null;
}

/**
 * `createSpeechFallback(win)`: { available, speak(text, { rate }) -> Promise<boolean>, cancel(), speaking() }.
 * `speak` resolves true when the line was spoken to its end, false when it was cancelled or failed.
 */
export function createSpeechFallback(win = globalThis.window) {
  const synth = win?.speechSynthesis;
  const Utterance = win?.SpeechSynthesisUtterance;
  const available = Boolean(synth && typeof Utterance === "function");
  let voice = null;
  let current = null;
  const loadVoices = () => { try { voice = pickVoice(synth.getVoices?.() || []) || voice; } catch { /* No voices yet. */ } };
  if (available) {
    loadVoices();
    try { synth.addEventListener?.("voiceschanged", loadVoices); } catch { /* Older browsers. */ }
  }

  const cancel = () => {
    const active = current;
    current = null;
    active?.finish(false);
    try { if (available) synth.cancel(); } catch { /* Nothing speaking. */ }
  };

  const speak = (text, { rate = 1 } = {}) => {
    const line = String(text || "").trim();
    if (!available || !line) return Promise.resolve(false);
    cancel();
    if (!voice) loadVoices();
    return new Promise((resolve) => {
      let settled = false;
      const entry = {
        finish: (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(entry.guard);
          if (current === entry) current = null;
          resolve(ok);
        },
      };
      try {
        const utterance = new Utterance(line);
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || "en-IN";
        utterance.rate = Math.min(1.3, Math.max(0.7, Number(rate) || 1));
        utterance.onend = () => entry.finish(true);
        utterance.onerror = () => entry.finish(false);
        current = entry;
        // Some engines never fire onend: a generous guard from the line's length.
        entry.guard = setTimeout(() => entry.finish(true), 4000 + line.length * 90);
        synth.speak(utterance);
      } catch {
        entry.finish(false);
      }
    });
  };

  return { available, speak, cancel, speaking: () => Boolean(current) };
}
