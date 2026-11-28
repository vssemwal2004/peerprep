// Résumé strength: how good the content is, separate from "ATS readability" (whether a machine can
// read the PDF). The ATS engine mostly checks layout and parsing, so a thin résumé in a clean
// template can read 98/100 there; this score looks at what a recruiter reads. Pure logic (no
// imports) so the review panel, the hub and the tests share it.

const DETAIL_SECTIONS = ['experience', 'projects'];
// Words that open a bullet with something the student did.
const ACTION_VERBS = new Set(('achieved analysed analyzed architected automated boosted built championed coded collaborated completed configured conducted '
  + 'contributed coordinated created cut debugged decreased delivered deployed designed developed directed drove enabled engineered enhanced established '
  + 'evaluated executed expanded facilitated founded generated grew guided handled headed identified implemented improved increased initiated integrated '
  + 'introduced launched led maintained managed mentored migrated modelled modeled monitored optimised optimized organised organized overhauled owned '
  + 'participated performed planned presented produced programmed published raised redesigned reduced refactored resolved restructured revamped saved '
  + 'scaled secured shipped simplified solved spearheaded streamlined strengthened supported tested trained transformed tuned upgraded won wrote').split(' '));

const text = (value) => String(value?.text ?? value ?? '').trim();
const wordsIn = (value) => text(value).split(/\s+/).filter(Boolean);
const shown = (resume, key) => !(resume.hiddenSections || []).includes(key);
const meaningful = (entry = {}) => Boolean(text(entry.title) || text(entry.subtitle) || (entry.bullets || []).some((bullet) => text(bullet)));
const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Every bullet of experience, projects and custom detail sections, with its builder target. */
function bulletsOf(resume) {
  const out = [];
  const add = (key, entries) => (entries || []).forEach((entry, entryIndex) => (entry.bullets || []).forEach((bullet, bulletIndex) => {
    if (text(bullet)) out.push({ text: text(bullet), target: { section: key, entryIndex, field: 'bullet', bulletIndex } });
  }));
  DETAIL_SECTIONS.forEach((key) => shown(resume, key) && add(key, resume[key]));
  (resume.customSections || []).forEach((section) => section.format !== 'skills' && shown(resume, `custom:${section.id}`) && add(`custom:${section.id}`, section.entries));
  return out;
}

export const opensWithAction = (bullet) => {
  const first = (wordsIn(bullet)[0] || '').toLowerCase().replace(/[^a-z]/g, '');
  return ACTION_VERBS.has(first) || (first.endsWith('ed') && first.length > 4);
};

/**
 * { score 0-100, label, checks: [{ id, title, passed, weight, earned, detail, fix, target }] }.
 * Weights favour what recruiters read first: real work, measurable results and clear bullets.
 */
/** A headline that names a role or skills: 4+ words, not just repeated words or a link label. */
export function headlineQuality(value) {
  const words = wordsIn(value).map((word) => word.toLowerCase().replace(/[^a-z0-9+#.]/g, '')).filter(Boolean);
  if (!words.length) return 0;
  const distinct = new Set(words);
  const junk = words.every((word) => ['github', 'linkedin', 'portfolio', 'resume', 'cv', 'http', 'https', 'www'].includes(word) || /\.(com|io|in|dev)$/.test(word));
  if (junk || distinct.size < 2) return 0;
  return distinct.size >= 4 ? 1 : 0.4;
}

/**
 * `writingIssues`: grammar/spelling issues from the writing check, or null when it has not run
 * (then that check is left out and the rest are scaled to 100).
 */
export function resumeStrength(resume = {}, { writingIssues = null } = {}) {
  const basics = resume.basics || {};
  const entries = DETAIL_SECTIONS.flatMap((key) => (shown(resume, key) ? (resume[key] || []).filter(meaningful).map((entry, index) => ({ key, entry, index })) : []));
  const bullets = bulletsOf(resume);
  const customs = (resume.customSections || []).filter((section) => shown(resume, `custom:${section.id}`));
  const split = (value) => text(value).split(/[,|;•\n]/).map((item) => item.trim()).filter(Boolean);
  // Skills may also sit in a custom "skills" section (e.g. "Tools"): they count too.
  const customSkillEntries = customs.filter((section) => section.format === 'skills').flatMap((section) => section.entries || []);
  const skills = [
    ...(shown(resume, 'skills') ? (resume.skills || []).flatMap((group) => split(group.skills)) : []),
    ...customSkillEntries.flatMap((entry) => split(entry.technologies || entry.subtitle || entry.title)),
  ];
  const skillGroups = (shown(resume, 'skills') ? (resume.skills || []).filter((group) => text(group.skills)).length : 0) + customSkillEntries.filter((entry) => text(entry.technologies || entry.subtitle || entry.title)).length;
  const education = shown(resume, 'education') ? (resume.education || []).filter((row) => text(row.degree) || text(row.institute)) : [];
  // Achievements: the achievements section plus visible custom detail sections (certifications, awards…).
  const achievements = [...(shown(resume, 'achievements') ? resume.achievements || [] : []), ...customs.filter((section) => section.format !== 'skills').flatMap((section) => section.entries || [])].filter(meaningful);
  const links = ['linkedin', 'github', 'portfolio'].filter((key) => text(basics[key]) && resume.basicsVisibility?.[key] !== false);
  const allWords = [basics.headline, ...entries.flatMap(({ entry }) => [entry.title, entry.subtitle, entry.technologies]), ...bullets.map((bullet) => bullet.text), ...skills, ...achievements.map((entry) => entry.title)]
    .reduce((sum, value) => sum + wordsIn(value).length, 0);

  const withNumbers = bullets.filter((bullet) => /\d/.test(bullet.text));
  const withAction = bullets.filter((bullet) => opensWithAction(bullet.text));
  const goodLength = bullets.filter((bullet) => { const count = wordsIn(bullet.text).length; return count >= 8 && count <= 32; });
  const bulletCount = ({ entry }) => (entry.bullets || []).filter((bullet) => text(bullet)).length;
  const thinEntries = entries.filter((item) => bulletCount(item) < 3);
  const headline = headlineQuality(basics.headline);
  const ratio = (part, whole) => (whole ? part.length / whole : 0);
  const firstMiss = (list, test) => list.find((item) => !test(item))?.target || null;

  const checks = [
    { id: 'depth', title: 'Projects and experience', weight: 15,
      earned: 15 * (0.5 * clamp01(entries.length / 3) + 0.5 * clamp01(bullets.length / 10)),
      detail: `${entries.length} project or experience entr${entries.length === 1 ? 'y' : 'ies'}, ${bullets.length} bullet${bullets.length === 1 ? '' : 's'} in all.`,
      fix: 'Show at least 3 projects, internships or roles and about 10 bullets in all.', target: { section: entries.length ? entries[0].key : 'projects' } },
    { id: 'bulletsPerEntry', title: 'Bullets under each entry', weight: 10,
      earned: entries.length ? 10 * (entries.reduce((sum, item) => sum + clamp01(bulletCount(item) / 3), 0) / entries.length) : 0,
      detail: thinEntries.length ? `${thinEntries.length} entr${thinEntries.length === 1 ? 'y has' : 'ies have'} fewer than 3 bullets.` : 'Every entry has 3 or more bullets.',
      fix: 'Give each project or role 3–5 bullets: what you did, how, and the result.', target: thinEntries[0] ? { section: thinEntries[0].key, entryIndex: thinEntries[0].index } : null },
    { id: 'metrics', title: 'Measurable results', weight: 15,
      earned: 15 * clamp01(ratio(withNumbers, bullets.length) / 0.6),
      detail: `${withNumbers.length} of ${bullets.length} bullets have a number.`,
      fix: 'Add numbers to most bullets: users, %, time saved, scale, rank.', target: firstMiss(bullets, (bullet) => /\d/.test(bullet.text)) },
    { id: 'actionVerbs', title: 'Bullets start with an action', weight: 10,
      earned: 10 * clamp01(ratio(withAction, bullets.length) / 0.8),
      detail: `${withAction.length} of ${bullets.length} bullets open with an action word.`,
      fix: 'Start each bullet with what you did: “Built…”, “Reduced…”, “Led…” — not a tool list or a duty.', target: firstMiss(bullets, (bullet) => opensWithAction(bullet.text)) },
    { id: 'bulletLength', title: 'Clear, one-idea bullets', weight: 5,
      earned: 5 * clamp01(ratio(goodLength, bullets.length) / 0.8),
      detail: `${goodLength.length} of ${bullets.length} bullets are 8–32 words.`,
      fix: 'Keep each bullet to one or two lines; split long ones and expand one-liners.', target: firstMiss(bullets, (bullet) => { const count = wordsIn(bullet.text).length; return count >= 8 && count <= 32; }) },
    { id: 'skills', title: 'Skills', weight: 8,
      earned: 8 * (0.7 * clamp01(skills.length / 10) + 0.3 * clamp01(skillGroups / 2)),
      detail: `${skills.length} skills in ${skillGroups} group${skillGroups === 1 ? '' : 's'}.`,
      fix: 'List around 10 skills you can defend, grouped (Languages, Frameworks, Tools).', target: { section: 'skills' } },
    { id: 'headline', title: 'Headline', weight: 5,
      earned: 5 * headline,
      detail: text(basics.headline) ? `“${text(basics.headline).slice(0, 60)}”${headline < 1 ? ' does not say your role or skills.' : ''}` : 'No headline.',
      fix: 'Write a headline with your target role and strongest skills, e.g. “Full-stack developer · React, Node.js, AWS”.', target: { section: 'basics', field: 'headline' } },
    { id: 'links', title: 'Profile links', weight: 4,
      earned: links.length >= 2 ? 4 : links.length ? 2.5 : 0,
      detail: links.length ? `Shows ${links.join(', ')}.` : 'No LinkedIn, GitHub or portfolio link.',
      fix: 'Add LinkedIn and GitHub (or a portfolio) so recruiters can see your work.', target: { section: 'basics', field: links.includes('linkedin') ? 'github' : 'linkedin' } },
    { id: 'education', title: 'Education details', weight: 4,
      earned: education.length ? 4 * ((text(education[0].degree) && text(education[0].institute) ? 0.6 : 0.3) + (text(education[0].score) ? 0.2 : 0) + (text(education[0].year) ? 0.2 : 0)) : 0,
      detail: education.length ? 'Degree, college, score and year are checked.' : 'No education entry.',
      fix: 'Show degree, college, CGPA or % and the year.', target: { section: 'education', entryIndex: 0 } },
    { id: 'achievements', title: 'Achievements or certifications', weight: 4,
      earned: achievements.length ? 4 : 0,
      detail: achievements.length ? `${achievements.length} listed.` : 'None listed.',
      fix: 'Add a hackathon, rank, certification or award, with a number if you can.', target: { section: 'achievements' } },
    { id: 'length', title: 'Enough detail', weight: 5,
      earned: allWords >= 250 && allWords <= 900 ? 5 : allWords >= 150 ? 3 : allWords > 900 ? 3 : 0,
      detail: `About ${allWords} words of content.`,
      fix: allWords > 900 ? 'Trim to one page: cut older or weaker points.' : 'Add detail: aim for about 300–700 words on one page.', target: null },
    // Grammar and spelling, once the writing check has run (each issue costs 1.5 of 10).
    ...(Number.isFinite(writingIssues) ? [{ id: 'writing', title: 'Grammar and spelling', weight: 10,
      earned: Math.max(0, 10 - 1.5 * writingIssues),
      detail: writingIssues ? `${writingIssues} writing issue${writingIssues === 1 ? '' : 's'} found.` : 'No writing issues found.',
      fix: 'Open Grammar fixes and correct each issue; recruiters notice every mistake.', target: null, tool: 'grammar' }] : []),
  ].map((check) => ({ ...check, earned: Math.round(check.earned * 10) / 10, passed: check.earned >= check.weight * 0.85 }));

  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = Math.round((checks.reduce((sum, check) => sum + check.earned, 0) / total) * 100);
  return {
    score,
    label: score >= 85 ? 'Strong' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'Thin',
    checks,
    improvements: checks.filter((check) => !check.passed).sort((a, b) => (b.weight - b.earned) - (a.weight - a.earned)),
  };
}
