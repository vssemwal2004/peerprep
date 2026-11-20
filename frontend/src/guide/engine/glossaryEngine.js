// A glossary: words with one plain definition each. `parts(text)` splits text into plain strings
// and glossary words, so the words can get a dotted underline and a hover card (GlossaryText).
// entries: [{ key, term, aliases?: [], text }]

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function makeGlossary(entries) {
  const words = entries.flatMap((entry) => [entry.term, ...(entry.aliases || [])].map((word) => ({ word, entry })))
    .sort((left, right) => right.word.length - left.word.length);
  const pattern = words.length
    ? new RegExp(`(^|[^A-Za-z])(${words.map((item) => escape(item.word)).join("|")})(?=$|[^A-Za-z])`, "g")
    : null;
  const byWord = new Map(words.map((item) => [item.word, item.entry]));

  /**
   * [{ text }, { text, entry }]. Each entry is marked once per text (its first use) unless
   * once: false, so a sentence is not underlined all over.
   */
  function parts(text, { once = true } = {}) {
    const value = String(text ?? "");
    if (!pattern) return [{ text: value }];
    const result = [];
    const used = new Set();
    let last = 0;
    for (const match of value.matchAll(pattern)) {
      const word = match[2];
      const start = match.index + match[1].length;
      const entry = byWord.get(word);
      if (!entry || (once && used.has(entry.key))) continue;
      used.add(entry.key);
      if (start > last) result.push({ text: value.slice(last, start) });
      result.push({ text: word, entry });
      last = start + word.length;
    }
    if (last < value.length) result.push({ text: value.slice(last) });
    return result;
  }

  return { entries, parts };
}
