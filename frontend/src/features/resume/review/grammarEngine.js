// Grammar and spelling for Prep Resume: harper.js (runs entirely in the
// browser, in a Web Worker) plus ANVI's resume-specific rules. The ~20 MB
// WebAssembly engine is fetched only when a student first runs a check, then
// cached by the browser.
import {
  anviRules,
  buildIssue,
  categoryOfKind,
  collectTextUnits,
  dictionaryWords,
  grammarSignature,
  keepHarperLint,
  punctuationConsistency,
  toPlain,
} from './reviewModel';

let enginePromise = null;

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

const ENDINGS = ['ing', 'ed', 'es', 's', 'ly', 'tion', 'ment'];
/** Spelling candidates ordered by closeness, keeping the word's ending ("maintaing" -> "maintaining"). */
export function rankSpelling(problem, candidates) {
  const word = String(problem || '').toLowerCase();
  const ending = ENDINGS.find((suffix) => word.endsWith(suffix));
  return [...candidates]
    .map((candidate, order) => {
      const lower = candidate.toLowerCase();
      const keepsEnding = ending ? lower.endsWith(ending) : true;
      return { candidate, score: editDistance(word, lower) - (keepsEnding ? 1.5 : 0) + order * 0.01 };
    })
    .sort((a, b) => a.score - b.score)
    .map((item) => item.candidate);
}

/** The shared linter; `createLinter` lets tests pass a Node LocalLinter. */
export function loadGrammarEngine(createLinter = null) {
  if (!enginePromise) {
    enginePromise = (async () => {
      if (createLinter) return createLinter();
      const [{ WorkerLinter, Dialect }, { binary }] = await Promise.all([import('harper.js'), import('harper.js/binary')]);
      const linter = new WorkerLinter({ binary, dialect: Dialect.Indian });
      await linter.setup();
      return linter;
    })().catch((error) => { enginePromise = null; throw error; });
  }
  return enginePromise;
}

export const grammarEngineLoaded = () => Boolean(enginePromise);

/**
 * Harper suggests stems ("maintain") for an inflected typo ("maintaing").
 * Adds the stem's matching inflection when harper itself accepts the spelling.
 */
async function withInflections(linter, problem, suggestions) {
  const word = String(problem || '');
  const ending = ['ing', 'ed', 's'].find((suffix) => word.toLowerCase().endsWith(suffix));
  if (!ending || suggestions.some((candidate) => candidate.toLowerCase().endsWith(ending))) return suggestions;
  const variants = new Set();
  suggestions.slice(0, 4).forEach((stem) => {
    if (!/^[A-Za-z]+$/.test(stem)) return;
    variants.add(`${stem}${ending}`);
    if (ending !== 's' && stem.endsWith('e')) variants.add(`${stem.slice(0, -1)}${ending}`);
    if (ending !== 's' && /[^aeiou][aeiou][bdgmnprt]$/.test(stem)) variants.add(`${stem}${stem.slice(-1)}${ending}`);
  });
  const accepted = [];
  for (const candidate of variants) {
    const lints = await linter.lint(candidate, { language: 'plaintext' });
    if (!lints.some((lint) => ['Spelling', 'Typo'].includes(lint.lint_kind()))) accepted.push(candidate);
  }
  return [...accepted, ...suggestions];
}

/** Issues for one line of text. */
export async function lintUnit(linter, unit, dictionary = new Set()) {
  const plain = toPlain(unit.raw);
  if (!plain.text.trim()) return [];
  const ours = anviRules(plain.text, unit);
  const lints = await linter.lint(plain.text, { language: 'plaintext' });
  const theirs = [];
  for (const lint of lints) {
    const span = lint.span();
    const kind = lint.lint_kind();
    const problem = plain.text.slice(span.start, span.end);
    const message = lint.message().replace(/`([^`]+)`/g, '“$1”');
    const finding = { ruleId: `harper.${kind}`, kind, category: categoryOfKind(kind), message, start: span.start, end: span.end, suggestions: [], source: 'harper' };
    if (!keepHarperLint({ ...finding, problem, text: plain.text }, unit, dictionary)) continue;
    // ANVI's own finding wins where both flag the same words.
    if (ours.some((own) => finding.start < own.end && finding.end > own.start)) continue;
    let suggestions = lint.suggestions().map((suggestion) => suggestion.get_replacement_text()).filter((text, index, list) => list.indexOf(text) === index).slice(0, 10);
    if (kind === 'Spelling' || kind === 'Typo') suggestions = rankSpelling(problem, await withInflections(linter, problem, suggestions));
    theirs.push({ ...finding, suggestions: suggestions.slice(0, 3) });
  }
  return [...ours, ...theirs].map((finding) => buildIssue(unit, plain, finding));
}

/**
 * Checks every line of the resume. `onProgress(done, total)` reports lines checked.
 * Returns { issues, signature, lineCount }.
 */
export async function checkGrammar(resume, { onProgress = () => {}, createLinter = null, signal } = {}) {
  signal?.throwIfAborted();
  const linter = await loadGrammarEngine(createLinter);
  signal?.throwIfAborted();
  const words = dictionaryWords(resume);
  if (words.length && linter.importWords) await linter.importWords(words);
  const dictionary = new Set(words.map((word) => word.toLowerCase()));
  const units = collectTextUnits(resume);
  const issues = [];
  for (let index = 0; index < units.length; index += 1) {
    signal?.throwIfAborted();
    issues.push(...await lintUnit(linter, units[index], dictionary));
    onProgress(index + 1, units.length);
  }
  punctuationConsistency(units).forEach(({ unit, plain, issue }) => {
    if (!issues.some((item) => item.unitId === unit.id && item.start < issue.end && item.end > issue.start)) issues.push(buildIssue(unit, plain, issue));
  });
  return { issues, signature: grammarSignature(resume), lineCount: units.length };
}
