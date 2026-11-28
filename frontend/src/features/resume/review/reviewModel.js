// Prep Resume check (ANVI): pure logic shared by the review panel, the grammar
// engine and the tests. Nothing here touches the DOM or the network.
import { FIXED_SECTION_META, getSectionData, getSectionTitle, visibleSectionKeys } from '../resumeUtils';
import { TECH_TERMS, nearestTechTerm, typoDistance } from './techVocabulary';

export { TECH_TERMS, nearestTechTerm };

// ───────────── where text lives ─────────────

const DETAIL_NOUN = { experience: 'Experience', projects: 'Project', achievements: 'Achievement' };

const sectionLabelOf = (resume, key) => (key === 'basics'
  ? 'Basic details'
  : key.startsWith('custom:')
    ? getSectionTitle(resume, key).toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
    : FIXED_SECTION_META[key]?.label || key);

/**
 * Every line the check reads, with its exact place in the resume.
 * `scope: 'spelling'` lines (names, titles, degree) only get spelling checks;
 * `scope: 'skills'` lines (skill lists, tech stacks) get spelling and tech-name checks per item.
 */
export function collectTextUnits(resume) {
  const units = [];
  const add = (unit) => { if (String(unit.raw || '').trim()) units.push(unit); };
  add({ id: 'basics|headline', section: 'basics', sectionLabel: 'Basic details', entryIndex: null, entryLabel: 'Headline', field: 'headline', bulletIndex: null, raw: resume.basics?.headline || '', scope: 'all' });
  visibleSectionKeys(resume).forEach((key) => {
    const custom = key.startsWith('custom:');
    const sectionLabel = sectionLabelOf(resume, key);
    if (key === 'education') {
      getSectionData(resume, key).forEach((entry, entryIndex) => {
        const entryLabel = String(entry.degree || entry.institute || `Education ${entryIndex + 1}`).trim();
        add({ id: `education|${entryIndex}|degree`, section: key, sectionLabel, entryIndex, entryLabel, field: 'degree', bulletIndex: null, raw: entry.degree || '', scope: 'spelling' });
      });
      return;
    }
    if (key === 'skills') {
      getSectionData(resume, key).forEach((entry, entryIndex) => {
        const entryLabel = String(entry.category || `Skills ${entryIndex + 1}`).trim();
        const base = { section: key, sectionLabel, entryIndex, entryLabel, bulletIndex: null };
        add({ ...base, id: `skills|${entryIndex}|category`, field: 'category', raw: entry.category || '', scope: 'spelling' });
        add({ ...base, id: `skills|${entryIndex}|skills`, field: 'skills', raw: entry.skills || '', scope: 'skills' });
      });
      return;
    }
    getSectionData(resume, key).forEach((entry, entryIndex) => {
      const entryLabel = String(entry.title || entry.subtitle || `${DETAIL_NOUN[key] || 'Entry'} ${entryIndex + 1}`).trim();
      const base = { section: key, sectionLabel, entryIndex, entryLabel };
      add({ ...base, id: `${key}|${entryIndex}|title`, field: 'title', bulletIndex: null, raw: entry.title || '', scope: key === 'achievements' || custom ? 'all' : 'spelling' });
      add({ ...base, id: `${key}|${entryIndex}|subtitle`, field: 'subtitle', bulletIndex: null, raw: entry.subtitle || '', scope: 'spelling' });
      if (custom) add({ ...base, id: `${key}|${entryIndex}|paragraph`, field: 'paragraph', bulletIndex: null, raw: entry.technologies || '', scope: 'all' });
      else add({ ...base, id: `${key}|${entryIndex}|technologies`, field: 'technologies', bulletIndex: null, raw: entry.technologies || '', scope: 'skills' });
      (entry.bullets || []).forEach((bullet, bulletIndex) => {
        add({ ...base, id: `${key}|${entryIndex}|bullet|${bulletIndex}`, field: 'bullet', bulletIndex, raw: String(bullet?.text ?? bullet ?? ''), scope: 'all' });
      });
    });
  });
  return units;
}

const FIELD_KEY = { title: 'title', subtitle: 'subtitle', paragraph: 'technologies', technologies: 'technologies', degree: 'degree', category: 'category', skills: 'skills' };

export function readUnitRaw(resume, unit) {
  if (unit.field === 'headline') return resume.basics?.headline || '';
  const entry = getSectionData(resume, unit.section)[unit.entryIndex];
  if (!entry) return null;
  if (unit.field === 'bullet') { const bullet = entry.bullets?.[unit.bulletIndex]; return bullet === undefined ? null : String(bullet?.text ?? bullet ?? ''); }
  return entry[FIELD_KEY[unit.field]] ?? null;
}

/** A new resume with one line replaced; everything else untouched. */
export function writeUnitRaw(resume, unit, raw) {
  if (unit.field === 'headline') return { ...resume, basics: { ...resume.basics, headline: raw } };
  const patchEntry = (entry) => (unit.field === 'bullet'
    ? { ...entry, bullets: (entry.bullets || []).map((bullet, index) => (index === unit.bulletIndex ? { text: raw } : bullet)) }
    : { ...entry, [FIELD_KEY[unit.field]]: raw });
  const patchList = (list) => list.map((entry, index) => (index === unit.entryIndex ? patchEntry(entry) : entry));
  if (unit.section.startsWith('custom:')) {
    const id = unit.section.slice(7);
    return { ...resume, customSections: resume.customSections.map((section) => (section.id === id ? { ...section, entries: patchList(section.entries || []) } : section)) };
  }
  return { ...resume, [unit.section]: patchList(resume[unit.section] || []) };
}

// ───────────── formatting markers → plain text ─────────────

const MARKERS = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g;

/** Plain text for checking plus `map[plainIndex] = rawIndex` (and map[length] = raw length). */
export function toPlain(raw) {
  const source = String(raw || '');
  let text = '';
  const map = [];
  let last = 0;
  const copy = (from, to) => { for (let index = from; index < to; index += 1) { text += source[index]; map.push(index); } };
  for (const match of source.matchAll(MARKERS)) {
    const width = match[0].startsWith('**') || match[0].startsWith('__') ? 2 : 1;
    if (match[0].length <= width * 2) continue;
    copy(last, match.index);
    copy(match.index + width, match.index + match[0].length - width);
    last = match.index + match[0].length;
  }
  copy(last, source.length);
  map.push(source.length);
  return { text, map };
}

/** Replaces plain range [start, end) inside the raw (formatted) string. */
export function replaceInRaw(raw, plainInfo, start, end, replacement) {
  const rawStart = plainInfo.map[start];
  const rawEnd = end > start ? plainInfo.map[end - 1] + 1 : rawStart;
  return `${raw.slice(0, rawStart)}${replacement}${raw.slice(rawEnd)}`;
}

// ───────────── ANVI's resume rules (on top of harper) ─────────────

// Correct spellings of tech names live in techVocabulary.js (ATS keyword match and recruiter polish).
const TECH_VARIANTS = [
  [/\bnode\s?js\b|\bnode\.?js\b|\bnodejs\b/gi, 'Node.js'], [/\breact\s?js\b|\breact\.js\b/gi, 'React'], [/\bnext\s?js\b|\bnextjs\b/gi, 'Next.js'], [/\bvue\s?js\b|\bvuejs\b/gi, 'Vue.js'],
  [/\bexpress\s?js\b|\bexpressjs\b/gi, 'Express.js'], [/\bjava\s?script\b/gi, 'JavaScript'], [/\btype\s?script\b/gi, 'TypeScript'], [/\bmongo\s?db\b/gi, 'MongoDB'],
  [/\bpostgre\s?sql\b|\bpostgres\b/gi, 'PostgreSQL'], [/\bmy\s?sql\b/gi, 'MySQL'], [/\bgit\s?hub\b/gi, 'GitHub'], [/\blinked\s?in\b/gi, 'LinkedIn'], [/\bfire\s?base\b/gi, 'Firebase'],
  [/\btensor\s?flow\b/gi, 'TensorFlow'], [/\bpy\s?torch\b/gi, 'PyTorch'], [/\bnum\s?py\b/gi, 'NumPy'], [/\bfast\s?api\b/gi, 'FastAPI'], [/\bgraph\s?ql\b/gi, 'GraphQL'],
  [/\bleet\s?code\b/gi, 'LeetCode'], [/\bpower\s?bi\b/gi, 'Power BI'],
];
const SHORT_UPPER = new Set(['html', 'css', 'aws', 'gcp', 'sql', 'api', 'apis', 'json', 'dsa', 'dbms', 'oop', 'mern', 'iot']);

const AGREEMENT_VERBS = ['help', 'give', 'allow', 'make', 'provide', 'enable', 'support', 'reduce', 'increase', 'improve', 'track', 'show', 'let', 'handle', 'manage', 'generate', 'process', 'store', 'run', 'use', 'predict', 'detect', 'send', 'display', 'create', 'convert', 'automate', 'monitor', 'recommend', 'connect', 'calculate', 'analyse', 'analyze', 'collect', 'fetch', 'sync', 'serve', 'host', 'match', 'notify', 'schedule', 'validate', 'visualize', 'visualise'];
const thirdPerson = (verb) => (/(s|sh|ch|x|z)$/.test(verb) ? `${verb}es` : /[^aeiou]y$/.test(verb) ? `${verb.slice(0, -1)}ies` : `${verb}s`);
export const WEAK_OPENER = /^(responsible for|worked on|helped( with| in| to)?|involved in|participated in|assisted( with| in)?|tasked with|duties included|handled the)\b/i;

const issue = (ruleId, kind, category, message, start, end, suggestions = [], source = 'anvi') => ({ ruleId, kind, category, message, start, end, suggestions, source });

/** ANVI's own checks for one line (plain text). */
export function anviRules(text, unit) {
  const found = [];
  if (!text.trim()) return found;
  // The whole whitespace-separated token around a match decides whether it is a link or address.
  const insideLink = (index) => {
    const start = text.slice(0, index).search(/\S*$/);
    const token = text.slice(start).split(/\s/)[0] || '';
    return /https?:\/\/|www\.|\.(com|in|io|dev|org|net|app)\b|@|\//i.test(token);
  };
  // 1. tech names written the way their makers do
  const claimed = [];
  TECH_VARIANTS.forEach(([pattern, canonical]) => {
    for (const match of text.matchAll(pattern)) {
      if (match[0] === canonical || insideLink(match.index)) continue;
      claimed.push([match.index, match.index + match[0].length]);
      found.push(issue('anvi.techName', 'Spelling', 'spelling', `Write “${canonical}” the way its makers do; recruiters and ATS keyword lists use this spelling.`, match.index, match.index + match[0].length, [canonical]));
    }
  });
  const skillList = unit.scope === 'skills';
  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9.+#/-]*[A-Za-z0-9+#]|[A-Za-z]/g)) {
    const word = match[0].replace(/[.]+$/, '');
    const start = match.index; const end = start + word.length;
    if (insideLink(match.index) || claimed.some(([a, b]) => start < b && end > a)) continue;
    const canonical = TECH_TERMS[word.toLowerCase()];
    if (!canonical) {
      // "JavaSrcipt", "TensorFLow": mixed case says a tech name was meant; the spell checker skips these.
      const near = /[a-z][A-Z]|[A-Z]{2}[a-z]/.test(word) && /^[A-Za-z]+$/.test(word) ? nearestTechTerm(word) : null;
      if (near) found.push(issue('anvi.techSpelling', 'Spelling', 'spelling', `“${word}” looks like a misspelling of “${near}”. ATS keyword search will miss it as written.`, start, end, [near]));
      continue;
    }
    if (canonical === word) continue;
    // In prose a lowercase "react" may be an ordinary word; in a skills list it is the tool.
    if (!skillList && !SHORT_UPPER.has(word.toLowerCase()) && word.toLowerCase() === word && ['java', 'python', 'react', 'rust', 'swift', 'dart', 'git', 'excel', 'linux', 'flutter', 'docker'].includes(word) === false) continue;
    found.push(issue('anvi.techName', 'Spelling', 'spelling', `Write “${canonical}” with its standard capitalisation.`, start, end, [canonical]));
  }
  if (unit.scope === 'spelling' || skillList) return found;
  // 2. "a dashboard that help" -> "helps"
  // The noun may follow up to two describing words: "a web app that help".
  const agreement = new RegExp(`\\b(a|an|the|this|one)\\s+((?:[A-Za-z-]+\\s+){0,2}[A-Za-z-]+)\\s+(that|which|who)\\s+(${AGREEMENT_VERBS.join('|')})\\b`, 'gi');
  for (const match of text.matchAll(agreement)) {
    const noun = match[2].split(/\s+/).pop().toLowerCase();
    if (/s$/.test(noun) && !/ss$/.test(noun)) continue;
    const verb = match[4];
    const start = match.index + match[0].length - verb.length;
    found.push(issue('anvi.agreement', 'Agreement', 'grammar', `“${match[2].split(/\s+/).pop()}” is singular, so the verb needs an -s: “${thirdPerson(verb.toLowerCase())}”.`, start, start + verb.length, [thirdPerson(verb.toLowerCase())]));
  }
  if (unit.field === 'bullet' || unit.field === 'headline') {
    // 3. first letter capital
    const first = text.search(/\S/);
    if (first >= 0 && /[a-z]/.test(text[first]) && !TECH_TERMS[text.slice(first).split(/\s/)[0].toLowerCase()]) {
      found.push(issue('anvi.capitalStart', 'Capitalization', 'grammar', 'Start each line with a capital letter.', first, first + 1, [text[first].toUpperCase()]));
    }
  }
  if (unit.field === 'bullet') {
    // 4. "Lead a team" for finished work
    const lead = text.match(/^\s*(Lead)\b/);
    if (lead) found.push(issue('anvi.ledPast', 'Grammar', 'grammar', 'For work you have finished, the past tense is “Led” (rhymes with red).', lead.index + lead[0].length - 4, lead.index + lead[0].length, ['Led']));
    // 5. weak opener
    const weak = text.trimStart().match(WEAK_OPENER);
    if (weak) {
      const start = text.length - text.trimStart().length;
      found.push(issue('anvi.weakOpener', 'Style', 'style', `“${weak[0]}” describes a duty. Open with what you did and its result, e.g. “Built…”, “Reduced…”, “Led…”.`, start, start + weak[0].length, []));
    }
    // 6. first person
    for (const match of text.matchAll(/\b(I|my|me|we|our)\b/g)) {
      if (match[0] === 'me' || match[0] === 'our' || match[0] === 'we' || match[0] === 'my' || match[0] === 'I') {
        if (/^(I)$/.test(match[0]) && /\bI[A-Z]/.test(text.slice(match.index, match.index + 2))) continue;
        found.push(issue('anvi.firstPerson', 'Style', 'style', 'Resume bullets leave out “I”, “my” and “we”: start with the action instead.', match.index, match.index + match[0].length, []));
        break;
      }
    }
  }
  // 7. doubled spaces
  for (const match of text.matchAll(/ {2,}/g)) found.push(issue('anvi.spaces', 'Formatting', 'grammar', 'Use a single space here.', match.index, match.index + match[0].length, [' ']));
  return found;
}

/** Bullets should all end with a full stop, or none should. */
export function punctuationConsistency(units) {
  const bullets = units.filter((unit) => unit.field === 'bullet').map((unit) => ({ unit, plain: toPlain(unit.raw) })).filter(({ plain }) => plain.text.trim().length > 12);
  if (bullets.length < 3) return [];
  const withStop = bullets.filter(({ plain }) => /[.!?]\s*$/.test(plain.text));
  const ratio = withStop.length / bullets.length;
  if (ratio > 0 && ratio < 0.5) {
    return withStop.map(({ unit, plain }) => {
      const end = plain.text.replace(/\s+$/, '').length;
      return { unit, plain, issue: issue('anvi.bulletStops', 'Formatting', 'style', `Most of your bullets end without a full stop. Drop it here so every bullet matches.`, end - 1, end, ['']) };
    });
  }
  if (ratio >= 0.5 && ratio < 1) {
    return bullets.filter((item) => !withStop.includes(item)).map(({ unit, plain }) => {
      const end = plain.text.replace(/\s+$/, '').length;
      return { unit, plain, issue: issue('anvi.bulletStops', 'Formatting', 'style', 'Most of your bullets end with a full stop. Add one here so every bullet matches.', end - 1, end, [`${plain.text[end - 1]}.`]) };
    });
  }
  return [];
}

// ───────────── harper results → issues ─────────────

const CATEGORY_OF_KIND = {
  Spelling: 'spelling', Typo: 'spelling',
  Agreement: 'grammar', Grammar: 'grammar', WordOrder: 'grammar', Usage: 'grammar', Malapropism: 'grammar', Eggcorn: 'grammar', Miscellaneous: 'grammar', BoundaryError: 'grammar', Nonstandard: 'grammar', Punctuation: 'grammar', Capitalization: 'grammar', Formatting: 'grammar',
  Style: 'style', Readability: 'style', Redundancy: 'style', Repetition: 'grammar', WordChoice: 'style', Enhancement: 'style', Regionalism: 'style',
};
export const categoryOfKind = (kind) => CATEGORY_OF_KIND[kind] || 'grammar';

/**
 * Keeps harper's useful findings and drops noise seen on resume text: unit
 * letters after numbers ("9 s"), tech names it does not know, and the
 * "insert to" suggestion before -ing words.
 */
export function keepHarperLint({ kind, message, problem, text, start, end }, unit, dictionary = new Set()) {
  if ((unit.scope === 'spelling' || unit.scope === 'skills') && !['Spelling', 'Typo'].includes(kind)) return false;
  const word = problem.trim();
  if (!word) return /insert|add|missing/i.test(message);
  if (kind === 'Spelling' || kind === 'Typo') {
    if (word.length <= 2) return false;
    if (TECH_TERMS[word.toLowerCase()] || dictionary.has(word.toLowerCase())) return false;
    if (/\d/.test(word) || /[A-Z].*[A-Z]/.test(word) || /[./@:#+]/.test(word)) return false; // codes, acronyms, URLs, versions
  }
  if (/complete the infinitive/i.test(message) && /^\s*\w+ing\b/.test(text.slice(start))) return false;
  if (start > 0 && /\d\s*$/.test(text.slice(0, start)) && word.length <= 3 && /^[a-z]+$/i.test(word)) return false; // "9 s", "600 m", "2 hrs"
  return end > start || /insert|add/i.test(message);
}

// ───────────── issue identity, ordering, ignore ─────────────

export function hashText(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

export function buildIssue(unit, plain, finding) {
  const problem = plain.text.slice(finding.start, finding.end);
  return {
    confidence: 'high',
    ...finding,
    id: `${unit.id}|${finding.ruleId}|${finding.start}|${hashText(problem)}`,
    ignoreKey: `${finding.ruleId}|${problem.toLowerCase()}|${hashText(plain.text)}`,
    unitId: unit.id,
    unit: { id: unit.id, section: unit.section, sectionLabel: unit.sectionLabel, entryIndex: unit.entryIndex, entryLabel: unit.entryLabel, field: unit.field, bulletIndex: unit.bulletIndex },
    plainText: plain.text,
    problem,
  };
}

const FIELD_LABEL = { title: 'Title', subtitle: 'Subtitle', paragraph: 'Paragraph', technologies: 'Tech stack', degree: 'Degree', category: 'Group name', skills: 'Skills' };
export const locationLabel = (unit) => [
  unit.sectionLabel,
  unit.field === 'headline' ? 'Headline' : unit.entryLabel,
  unit.field === 'bullet' ? `Bullet ${unit.bulletIndex + 1}` : FIELD_LABEL[unit.field] || '',
].filter(Boolean);

/**
 * How sure the checker is that a flagged spelling is a mistake. "low": a capitalised word in the
 * middle of a line or in a title (likely a company, product or place name the dictionary does not
 * know). Low-confidence findings are shown with "It's a name" and weigh less in the score.
 */
export function spellingConfidence({ problem, text, start, unit, techSuggestion = false, suggestions = [] }) {
  if (techSuggestion) return 'high';
  const word = String(problem || '');
  if (!/^[A-Z]/.test(word)) return 'high';
  // One slip away from a dictionary word with the same first letter ("Sovling" -> "Solving",
  // "Attendence" -> "Attendance") is a typo, not a name. "Zomato" -> "Tomato" stays unsure.
  const lower = word.toLowerCase();
  if (lower.length >= 5 && suggestions.slice(0, 3).some((item) => item[0]?.toLowerCase() === lower[0] && typoDistance(lower, item.toLowerCase()) <= 1)) return 'high';
  const before = String(text || '').slice(0, start).trimEnd();
  const startsSentence = before === '' || /[.!?:]$/.test(before);
  if (unit?.scope === 'spelling' || unit?.scope === 'skills' || !startsSentence) return 'low';
  return 'high';
}

/** Issues grouped section → entry, in resume order. */
export function groupIssues(issues, resume) {
  const order = ['basics', ...visibleSectionKeys(resume)];
  const groups = new Map();
  issues.forEach((item) => {
    const sectionKey = item.unit.section;
    if (!groups.has(sectionKey)) groups.set(sectionKey, { key: sectionKey, label: item.unit.sectionLabel, entries: new Map() });
    const entryKey = item.unit.entryIndex ?? -1;
    const section = groups.get(sectionKey);
    if (!section.entries.has(entryKey)) section.entries.set(entryKey, { index: entryKey, label: item.unit.field === 'headline' ? 'Headline' : item.unit.entryLabel, issues: [] });
    section.entries.get(entryKey).issues.push(item);
  });
  return [...groups.values()]
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((section) => ({ ...section, entries: [...section.entries.values()].sort((a, b) => a.index - b.index).map((entry) => ({ ...entry, issues: entry.issues.sort((x, y) => (x.unit.bulletIndex ?? -1) - (y.unit.bulletIndex ?? -1) || x.start - y.start) })) }));
}

/** Signature of the text the grammar check read; edits change it. */
export const grammarSignature = (resume) => hashText(JSON.stringify([
  dictionaryWords(resume), collectTextUnits(resume).map(unit => [unit.id, unit.raw]),
]));

/** Signature of everything that shapes the exported PDF. */
const NOT_CONTENT = new Set(['exists', 'updatedAt', 'completion', 'previousVersion', '_id', '__v', 'createdAt', 'student', 'sample']);
export function atsSignature(resume) {
  const content = Object.fromEntries(Object.entries(resume || {}).filter(([key]) => !NOT_CONTENT.has(key)));
  return hashText(JSON.stringify(content));
}

// ───────────── ATS rules: names, places, ranking ─────────────

export const ATS_CATEGORY_LABELS = {
  parse: 'Readable by ATS', contact: 'Contact details', structure: 'Section headings', format: 'Layout & format', content: 'Content strength', integrity: 'Integrity', writing: 'Writing', privacy: 'Privacy',
};

const ATS_RULES = {
  'integrity.promptInjection': ['No hidden AI instructions', 'basics'], 'integrity.hiddenText': ['No hidden text', 'basics'], 'integrity.copiedPosting': ['Your own words', 'experience'],
  'integrity.invisibleCharacters': ['No invisible characters', 'experience'], 'integrity.homoglyphs': ['No look-alike letters', 'experience'], 'integrity.keywordStuffing': ['No keyword stuffing', 'skills'],
  'parse.text': ['Text the ATS can read', 'template'], 'parse.imageOnly': ['A real text layer', 'template'], 'parse.roles': ['Work history recognised', 'experience'],
  'parse.roleCompleteness': ['Complete role details', 'experience'], 'parse.contact': ['Contact details recognised', 'basics'],
  'contact.email': ['Email address', 'basics'], 'contact.position': ['Contact details at the top', 'template'], 'privacy.dateOfBirth': ['No date of birth', 'basics'],
  'structure.experience': ['Experience heading', 'experience'], 'structure.education': ['Education heading', 'education'], 'structure.skills': ['Skills heading', 'skills'],
  'content.metrics': ['Measurable results', 'bullets'], 'content.verbs': ['Action verbs', 'bullets'], 'content.buzzwords': ['Little filler language', 'bullets'],
  'content.timeline': ['Consistent dates', 'experience'], 'content.skillEvidence': ['Skills backed by your work', 'bullets'],
  'format.length': ['Reasonable length', 'bullets'], 'format.letterSpacing': ['Headings read as words', 'template'], 'format.columns': ['Single-column reading order', 'template'],
  'format.tables': ['No tables', 'template'], 'format.photo': ['No photo', 'template'],
  'writing.firstPerson': ['No first person', 'bullets'], 'writing.passiveVoice': ['Active voice', 'bullets'], 'writing.weakOpeners': ['Strong bullet openers', 'bullets'],
  'writing.tense': ['Past roles in past tense', 'experience'], 'writing.bulletLength': ['Short bullets', 'bullets'], 'writing.bulletsPerRole': ['2–8 bullets per role', 'experience'],
  'writing.repeatedOpeners': ['Varied bullet openers', 'bullets'], 'writing.dateFormats': ['One date format', 'experience'],
};

/** Human title and where in Prep Resume a failed ATS check is fixed. */
export function atsRuleInfo(id, resume = null) {
  const short = String(id || '').replace(/^ats-v\d+\./, '');
  const [title, where] = ATS_RULES[short] || [short.split('.').pop().replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase()), 'experience'];
  let section = where;
  if (where === 'bullets') {
    const visible = resume ? visibleSectionKeys(resume) : [];
    section = visible.includes('experience') ? 'experience' : visible.includes('projects') ? 'projects' : 'experience';
  }
  return { title, section, template: where === 'template' };
}

export const SECTION_LABEL = (resume, key) => (key === 'template' ? 'Template' : sectionLabelOf(resume, key));

export function verdictFor(score) {
  if (score === null || score === undefined) return { label: 'Not checked', tone: 'slate' };
  if (score >= 85) return { label: 'Strong', tone: 'emerald' };
  if (score >= 70) return { label: 'Good', tone: 'sky' };
  if (score >= 50) return { label: 'Needs work', tone: 'amber' };
  return { label: 'At risk', tone: 'rose' };
}

/** The three things to fix first, across ATS and grammar, with where to fix them. */
export function fixFirst({ report = null, issues = [], resume }) {
  const candidates = [];
  (report?.failedChecks || []).forEach((check) => {
    const info = atsRuleInfo(check.id, resume);
    const weight = (check.scoreImpact || 0) * (check.severity === 'error' ? 1.5 : check.severity === 'warning' ? 1 : 0.5);
    candidates.push({ key: `ats:${check.id}`, source: 'ats', weight, title: info.title, detail: check.fix, evidence: check.evidence, target: { section: info.section, template: info.template }, impact: check.scoreImpact });
  });
  const byCategory = { spelling: 7, grammar: 6, style: 2.5 };
  // A misspelt skill outranks everything: an ATS keyword search will not find it.
  const weightOf = (item) => (item.confidence === 'low' ? 1.5 : item.category === 'spelling' && ['skills', 'technologies'].includes(item.unit?.field) ? 9 : byCategory[item.category] || 2);
  issues.forEach((item) => {
    candidates.push({ key: `grammar:${item.id}`, source: 'grammar', weight: weightOf(item), title: item.category === 'spelling' ? `Spelling: “${item.problem}”` : item.message.split(/[.:]/)[0].slice(0, 70), detail: item.category === 'spelling' && item.suggestions[0] ? `Change “${item.problem}” to “${item.suggestions[0]}”.` : item.suggestions[0] ? `${item.message.split(/(?<=\.)\s/)[0]} Hint: “${item.suggestions[0]}”. Edit the line yourself.` : item.message, evidence: item.plainText, target: { ...item.unit }, issueId: item.id });
  });
  return candidates.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

// ───────────── payload for "Explain with ANVI" ─────────────

export function explainPayload({ resume, report, issues }) {
  const outline = visibleSectionKeys(resume).map((key) => ({
    key,
    entries: getSectionData(resume, key).slice(0, 30).map((entry) => {
      if (key === 'education') return { title: [entry.degree, entry.institute].filter(Boolean).join(', '), lines: [entry.year, entry.score].filter(Boolean) };
      if (key === 'skills') return { title: entry.category || 'Skills', lines: [entry.skills].filter(Boolean) };
      return { title: [entry.title, entry.subtitle].filter(Boolean).join(' — '), lines: (entry.bullets || []).map((bullet) => toPlain(String(bullet?.text ?? bullet ?? '')).text) };
    }),
  }));
  if (resume.basics?.headline) outline.unshift({ key: 'basics', entries: [{ title: 'Headline', lines: [resume.basics.headline] }] });
  return {
    outline,
    ats: report ? {
      failedChecks: report.failedChecks.slice(0, 20).map((check) => {
        const { title, section } = atsRuleInfo(check.id, resume);
        return { title, section, evidence: check.evidence, fix: check.fix, scoreImpact: check.scoreImpact };
      }),
      missingKeywords: report.job?.missingKeywords || [],
    } : {},
    grammar: issues.filter((item) => item.category !== 'style').slice(0, 15).map((item) => ({
      title: item.category === 'spelling' ? 'Fix spelling' : 'Fix grammar',
      // A pointer at the words, never a rewritten line: the student writes the fix.
      section: item.unit.section, entryIndex: item.unit.entryIndex, bulletIndex: item.unit.bulletIndex, message: item.message, original: item.plainText,
      suggestion: item.suggestions[0] ? (item.category === 'spelling' ? `Change “${item.problem}” to “${item.suggestions[0]}”.` : `Rework “${item.problem}” in your own words (hint: “${item.suggestions[0]}”).`) : '',
    })),
  };
}

// Organisation abbreviations that are not dictionary words.
const ORG_WORDS = ['Pvt', 'Ltd', 'LLP', 'Inc', 'Corp', 'Govt', 'Dept', 'Univ', 'Hons', 'CGPA', 'SGPA', 'CBSE', 'ICSE'];

/**
 * Words added to the grammar dictionary: proper nouns in fields that are never
 * spell-checked or that hold organisation names (student name, places, institutes,
 * employers, issuers). Skills, tech stacks, degrees, project titles, roles and
 * bullets are NOT imported: a typo there ("Pyhton") must stay visible, and a
 * word imported from one field would be accepted everywhere.
 */
export function dictionaryWords(resume) {
  const sources = [
    resume.basics?.name, resume.basics?.location,
    ...(resume.education || []).map((entry) => entry.institute),
    ...['experience', 'projects', 'achievements'].flatMap((key) => (resume[key] || []).map((entry) => entry.location)),
    ...(resume.experience || []).map((entry) => entry.title),
    ...(resume.achievements || []).map((entry) => entry.subtitle),
    ...(resume.customSections || []).flatMap((section) => (section.entries || []).map((entry) => entry.subtitle)),
    ORG_WORDS.join(' '),
  ];
  const words = new Set();
  sources.forEach((value) => String(value || '').split(/[^A-Za-z0-9.+#-]+/).forEach((word) => {
    const clean = word.replace(/^[.-]+|[.-]+$/g, '');
    if (clean.length > 1 && /[A-Za-z]/.test(clean)) words.add(clean);
  }));
  Object.values(TECH_TERMS).forEach((term) => term.split(/\s+/).forEach((word) => words.add(word)));
  return [...words];
}
