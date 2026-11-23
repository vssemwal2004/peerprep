// Prep Resume check: score the exported PDF and explain the scan findings.
import { check, ENGINE_VERSION } from '@veriworkly/ats-engine';
import { HttpError } from '../../utils/errors.js';
import { sharedExtractor } from './resumeReview.extractor.js';

export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_JOB_CHARS = 12_000;
const MAX_TEXT_CHARS = 15_000;

const clean = (value, max = 2000) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);

const roleOf = (role = {}) => ({
  title: role.title || '',
  employer: role.employer || '',
  start: role.start || null,
  end: role.end || null,
  current: Boolean(role.current),
});

/** The parts of an engine report the review panel shows. */
export function shapeAtsReport(report, { text = '', layout = null, jobDescription = '' } = {}) {
  const parsed = report.parsed || {};
  return {
    engineVersion: report.engine?.version || ENGINE_VERSION,
    readinessScore: report.readinessScore,
    checksPassed: report.checksPassed,
    checksTotal: report.checksTotal,
    wordCount: report.wordCount,
    categories: (report.categories || []).map(({ category, score, passed, total, lost }) => ({ category, score, passed, total, lost })),
    failedChecks: (report.failedChecks || [])
      .map(({ id, category, severity, evidence, fix, scoreImpact }) => ({ id, category, severity, evidence, fix, scoreImpact }))
      .sort((a, b) => (b.scoreImpact || 0) - (a.scoreImpact || 0)),
    passedChecks: (report.rules || []).filter((rule) => rule.passed).map(({ id, category, evidence }) => ({ id, category, evidence })),
    strengths: report.strengths || [],
    parsingWarnings: report.parsingWarnings || [],
    prioritizedFixes: report.prioritizedFixes || [],
    parsed: {
      name: parsed.name || '',
      email: parsed.email || '',
      phone: parsed.phone || '',
      links: parsed.links || [],
      roles: (parsed.roles || []).map(roleOf),
      education: (parsed.education || []).map(({ school, credential, end }) => ({ school: school || '', credential: credential || '', end: end || null })),
      skills: parsed.skills || [],
      certifications: (parsed.certifications || []).map((item) => (typeof item === 'string' ? item : item?.name || '')).filter(Boolean),
      spokenLanguages: (parsed.spokenLanguages || []).map((item) => (typeof item === 'string' ? item : item?.language || item?.name || '')).filter(Boolean),
      monthsOfExperience: parsed.monthsOfExperience ?? null,
    },
    job: jobDescription ? {
      score: report.jobMatchScore ?? null,
      requirements: (report.requirements || []).map(({ text: requirement, importance, kind, status, terms, evidence, detail }) => ({ text: requirement, importance, kind, status, terms: terms || [], evidence: (evidence || []).slice(0, 2), detail: detail || '' })),
      matchedKeywords: report.matchedKeywords || [],
      missingKeywords: report.missingKeywords || [],
    } : null,
    layout: layout ? { pageCount: layout.pageCount ?? null, columnRatio: layout.columnRatio ?? null, tableCount: layout.tableCount ?? 0, imageCount: layout.imageCount ?? 0 } : null,
    text: String(text || '').slice(0, MAX_TEXT_CHARS),
  };
}

export function validateResumePdf(buffer) {
  if (!buffer?.length) throw new HttpError(400, 'Send the exported resume PDF in the "file" field.', { code: 'RESUME_PDF_REQUIRED' });
  if (buffer.length > MAX_PDF_BYTES) throw new HttpError(413, 'The exported PDF is larger than 3 MB.', { code: 'RESUME_PDF_TOO_LARGE' });
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'The file is not a PDF.', { code: 'RESUME_PDF_INVALID' });
}

export function scoreExtractedResume({ text, layout }, bytes, { now, jobDescription }) {
  const report = check(text, undefined, { layout, file: { format: 'pdf', bytes }, now, ...(jobDescription ? { jobDescription } : {}) });
  return shapeAtsReport(report, { text, layout, jobDescription });
}

/** Keep PDF parsing, ATS scoring and job matching off the API event loop. */
export async function checkResumePdf(buffer, { jobDescription = '', extractor = sharedExtractor(), now = new Date() } = {}) {
  validateResumePdf(buffer);
  const options = { jobDescription: clean(jobDescription, MAX_JOB_CHARS), now };
  if (extractor.scanPdf) return extractor.scanPdf(buffer, options);
  return scoreExtractedResume(await extractor.extractPdf(buffer), buffer.length, options);
}

// ───────────── Explain with ANVI ─────────────

const SECTION_KEY = /^(basics|education|experience|projects|skills|achievements|template|custom:[A-Za-z0-9_-]{1,80})$/;
const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
const stem = (word) => (word.length > 4 ? word.replace(/(ing|ies|es|ed|s)$/, '') : word);
const stems = (value) => normalize(value).replace(/\.(?=\s|$)/g, '').split(' ').filter(Boolean).map(stem).join(' ');

/** Bounded, cleaned copy of what the client sends (its own resume and scan). */
export function sanitizeExplainInput(body = {}) {
  const outline = (Array.isArray(body.outline) ? body.outline : []).slice(0, 20).map((section) => ({
    key: clean(section?.key, 90),
    entries: (Array.isArray(section?.entries) ? section.entries : []).slice(0, 30).map((entry) => ({
      title: clean(entry?.title, 220),
      lines: (Array.isArray(entry?.lines) ? entry.lines : []).slice(0, 20).map((line) => clean(line, 500)),
    })),
  })).filter((section) => SECTION_KEY.test(section.key));
  const ats = body.ats || {};
  return {
    outline,
    ats: {
      failedChecks: (Array.isArray(ats.failedChecks) ? ats.failedChecks : []).slice(0, 25).map((item) => ({
        title: clean(item?.title, 90), evidence: clean(item?.evidence, 400), fix: clean(item?.fix, 400), scoreImpact: Number(item?.scoreImpact) || 0, section: clean(item?.section, 90),
      })),
      missingKeywords: (Array.isArray(ats.missingKeywords) ? ats.missingKeywords : []).slice(0, 25).map((item) => clean(item, 60)).filter(Boolean),
    },
    grammar: (Array.isArray(body.grammar) ? body.grammar : []).slice(0, 20).map((item) => ({
      section: clean(item?.section, 90), entryIndex: Number.isInteger(item?.entryIndex) ? item.entryIndex : null, bulletIndex: Number.isInteger(item?.bulletIndex) ? item.bulletIndex : null,
      title: clean(item?.title, 90), message: clean(item?.message, 300), original: clean(item?.original, 500), suggestion: clean(item?.suggestion, 500),
    })),
  };
}

/** Summarizes existing findings without calling a model or external service. */
export function explainReview(body) {
  const input = sanitizeExplainInput(body);
  const sections = new Map(input.outline.map((section) => [section.key, section]));
  const validSection = (key) => SECTION_KEY.test(key) && (!key.startsWith('custom:') || sections.has(key));
  const atsFixes = input.ats.failedChecks.filter((item) => item.fix)
    .sort((a, b) => b.scoreImpact - a.scoreImpact)
    .map((item) => ({
      title: item.title || 'Improve ATS readiness',
      why: item.evidence,
      action: item.fix,
      source: 'ats',
      section: validSection(item.section) ? item.section : '',
      entryIndex: null,
      bulletIndex: null,
      evidence: '',
    }));
  const grammarFixes = input.grammar.filter((item) => item.suggestion || item.message).map((item) => {
    const entry = sections.get(item.section)?.entries[item.entryIndex];
    const bulletIndex = entry?.lines[item.bulletIndex] === item.original && item.original ? item.bulletIndex : null;
    return {
      title: item.title || 'Fix grammar',
      why: item.suggestion ? item.message : '',
      action: item.suggestion || item.message,
      source: 'grammar',
      section: validSection(item.section) ? item.section : '',
      entryIndex: entry ? item.entryIndex : null,
      bulletIndex,
      evidence: item.original,
    };
  });
  const fixes = [...atsFixes, ...grammarFixes].slice(0, 3);
  // Compare word stems so "unit testing" matches "unit tests".
  const resumeStems = ` ${stems(input.outline.flatMap((section) => section.entries.flatMap((entry) => [entry.title, ...entry.lines])).join(' '))} `;
  const skillNotes = input.ats.missingKeywords.slice(0, 8).map((skill) => ({
    skill,
    foundInResume: Boolean(stems(skill)) && resumeStems.includes(` ${stems(skill)} `),
  }));
  let summary = 'Your check found no issues to fix. Run it again after editing your resume.';
  if (atsFixes.length) summary = 'Start with the ATS fixes that had the biggest impact on your score.';
  else if (grammarFixes.length) summary = 'Start with the wording fixes below.';
  else if (skillNotes.length) summary = 'Review the skills from the job description and use examples from your own experience.';
  return { summary, fixes, skillNotes };
}
