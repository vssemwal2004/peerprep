// Prep Resume Score: one number a student can trust, built from three parts.
//   ATS (30%)      — can an applicant tracking system read the exported PDF (open-source engine).
//   Content (40%)  — what a recruiter reads: real work, results, clear bullets (resumeStrength).
//   Language (30%) — spelling, grammar and style mistakes, by density (per ~300 words).
// Hard caps stop a clean layout from hiding mistakes: a misspelt skill or 5+ mistakes keeps the
// score below 70 however readable the PDF is. Pure logic, shared by the panel, the hub and tests.
import { resumeStrength } from './resumeStrength';
import { collectTextUnits, toPlain } from './reviewModel';

export const SCORE_WEIGHTS = { ats: 0.3, content: 0.4, language: 0.3 };
export const PART_LABELS = { ats: 'ATS', content: 'Content', language: 'Language' };
// Points one finding costs on a ~300-word résumé. Low confidence (maybe a name) costs little.
const ISSUE_COST = { spelling: 12, grammar: 10, style: 3 };
const LOW_CONFIDENCE_COST = 4;

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const isSkillField = (issue) => ['skills', 'technologies'].includes(issue?.unit?.field);
export const isSure = (issue) => issue.confidence !== 'low';

/** Words of résumé text the language check read. */
export function resumeWordCount(resume) {
  return collectTextUnits(resume).reduce((sum, unit) => sum + toPlain(unit.raw).text.split(/\s+/).filter(Boolean).length, 0);
}

export function issueCounts(issues = []) {
  const sure = issues.filter(isSure);
  return {
    spelling: sure.filter((item) => item.category === 'spelling').length,
    grammar: sure.filter((item) => item.category === 'grammar').length,
    style: sure.filter((item) => item.category === 'style').length,
    unsure: issues.length - sure.length,
    skillTypos: sure.filter((item) => item.category === 'spelling' && isSkillField(item)).length,
    total: issues.length,
  };
}

/** 100 with no mistakes; each sure spelling mistake costs ~12 points on a 300-word résumé. */
export function languageScore(issues = [], words = 300) {
  const cost = issues.reduce((sum, item) => sum + (isSure(item) ? ISSUE_COST[item.category] ?? 8 : LOW_CONFIDENCE_COST), 0);
  return clamp(100 - cost * (300 / Math.max(words, 150)));
}

export function scoreVerdict(score) {
  if (score === null || score === undefined) return { label: 'Not checked', tone: 'slate' };
  if (score >= 85) return { label: 'Ready to apply', tone: 'emerald' };
  if (score >= 70) return { label: 'Good, polish it', tone: 'sky' };
  if (score >= 50) return { label: 'Needs work', tone: 'amber' };
  return { label: 'Fix before applying', tone: 'rose' };
}

/**
 * `atsReport`: the engine report (null if the PDF check has not run). `issues`: visible writing
 * findings (null if the grammar check has not run). Returns the overall score (null until at least
 * one check ran), the three parts, the caps that applied and the issue counts.
 */
export function resumeScore({ resume, atsReport = null, issues = null }) {
  const strength = resumeStrength(resume);
  const words = atsReport?.wordCount || resumeWordCount(resume);
  const parts = {
    ats: atsReport ? clamp(atsReport.readinessScore) : null,
    content: strength.score,
    language: issues ? languageScore(issues, words) : null,
  };
  const counts = issueCounts(issues || []);
  const caps = [];
  if (issues) {
    const mistakes = counts.spelling + counts.grammar;
    if (mistakes >= 10) caps.push({ limit: 49, reason: `${mistakes} spelling and grammar mistakes. Recruiters reject résumés with this many.`, tool: 'issues' });
    else if (mistakes >= 5) caps.push({ limit: 69, reason: `${mistakes} spelling and grammar mistakes. Fix them before you apply.`, tool: 'issues' });
    if (counts.skillTypos) caps.push({ limit: 69, reason: `${counts.skillTypos} misspelt skill${counts.skillTypos === 1 ? '' : 's'}. An ATS searching for the right spelling will not find ${counts.skillTypos === 1 ? 'it' : 'them'}.`, tool: 'issues' });
  }
  if (parts.ats !== null && parts.ats < 50) caps.push({ limit: 59, reason: 'An ATS cannot read this PDF reliably. Switch to an ATS-friendly template.', tool: 'ats' });

  const available = Object.entries(parts).filter(([, value]) => value !== null);
  const ran = parts.ats !== null || parts.language !== null;
  let overall = null;
  let appliedCaps = [];
  if (ran) {
    const weight = available.reduce((sum, [key]) => sum + SCORE_WEIGHTS[key], 0);
    const raw = clamp(available.reduce((sum, [key, value]) => sum + SCORE_WEIGHTS[key] * value, 0) / weight);
    // Only caps that actually lowered the score are shown.
    appliedCaps = caps.filter((cap) => cap.limit < raw).sort((a, b) => a.limit - b.limit);
    overall = Math.min(raw, ...appliedCaps.map((cap) => cap.limit));
  }
  return {
    overall,
    verdict: scoreVerdict(overall),
    parts,
    partial: parts.ats === null || parts.language === null,
    caps: appliedCaps,
    counts,
    strength,
    words,
  };
}
