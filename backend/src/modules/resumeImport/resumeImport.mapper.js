import { DEFAULT_POLICY, parseResume } from '@veriworkly/ats-engine';
import { normalizeResume } from '../../controllers/resumeController.js';

import { sectionKind } from './resumeImport.sections.js';

const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const year = '(?:19|20)\\d{2}';
const oneDate = '(?:' + month + '\\s+)?' + year;
const dateRe = new RegExp('\\b' + oneDate + '(?:\\s*(?:[–—−-]|to)\\s*(?:' + oneDate + '|present|current|ongoing|now))?\\b', 'i');
const emailRe = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i;
const phoneRe = /(?:\+\d{1,3}[\s()-]*)?(?:\(?\d{3,5}\)?[\s.-]*){1,2}\d{4,5}\b/;
const urlRe = /(?:https?:\/\/|www\.|(?:github|linkedin)\.com\/)[^\s|<>]+/gi;
const plain = (text) => text.replace(/[ \t]+/g, ' ').trim();
const trimSeparators = (s) => s.replace(/^[\s|,;–—-]+|[\s|,;–—-]+$/g, '').trim();
const website = (s) => s.replace(/[),.;]+$/, '').replace(/^(?!https?:\/\/)/i, 'https://');
const bulletRe = /^\s*(?:[•●▪◦‣]|[-*](?=\s))\s*/;
const parts = (s) => s.split(/\t+|\s*\|\s*|\s+[–—-]\s+/).map(trimSeparators).filter(Boolean);
const degreeRe = /\b(?:b\.?\s?tech|m\.?\s?tech|b\.?sc|m\.?sc|bachelor|master|ph\.?d|b\.?e\.?\b|class\s+(?:xii|xi|x|10|12)|diploma|certificate in|associate of|higher secondary|high school diploma)\b/i;
const schoolRe = /\b(?:university|college|institute|school|polytechnic|academy|iiit|iit)\b/i;
const roleRe = /\b(?:intern|engineer|manager|analyst|designer|lead|officer|assistant|developer|consultant|director|specialist|associate|coordinator)\b/i;
const scoreRe = /\b(?:(?:CGPA|GPA|percentage|grade)\s*[:=-]?\s*[\d.]+(?:\s*\/\s*\d+)?%?|\d{1,3}(?:\.\d+)?%)/i;
const customHeading = (line) => /^(?:publications?|volunteer(?:ing| experience)?|leadership(?: experience)?|positions? of responsibility|activities|spoken languages|languages|interests|hobbies|coursework|training|research|references|memberships|professional affiliations|extracurricular activities):?$/i.test(line);

function contactDetails(lines, parsed) {
  const text = lines.join('\n');
  const urls = (text.match(urlRe) || []).map(website);
  const email = text.match(emailRe)?.[0] || '';
  const phone = text.match(/tel:([+\d-]+)/i)?.[1] || parsed.phone || text.match(phoneRe)?.[0] || '';
  const basics = { name: parsed.name || '', email, mobile: phone.trim(), linkedin: '', github: '', portfolio: '' };
  for (const url of urls) {
    try {
      const { hostname, pathname } = new URL(url);
      if (/(^|\.)linkedin\.com$/i.test(hostname)) basics.linkedin ||= url;
      else if (/(^|\.)github\.com$/i.test(hostname) && pathname.split('/').filter(Boolean).length <= 1) basics.github ||= url;
      else basics.portfolio ||= url;
    } catch { /* A malformed link is left for review. */ }
  }
  const entries = lines.flatMap((line) => line.split(/\s*[|•]\s*|\t+/)).map((s) => s.trim()).filter(Boolean);
  const labels = /^(?:email|mobile|phone|address|linkedin|github|website|portfolio|location|contact|resume|résumé|CV)\s*:?$/i;
  const clean = entries.filter((e) => !emailRe.test(e) && !/\b(?:https?:|www\.|mailto:|tel:|github\.com|linkedin\.com)/i.test(e) && !phoneRe.test(e) && !labels.test(e));
  if (!basics.name && clean[0]?.length < 90) basics.name = clean[0];
  const rest = clean.filter((v) => v !== basics.name);
  const location = rest.find((v) => /^location\s*:/i.test(v) || (v.includes(',') && v.length < 70 && !roleRe.test(v)));
  basics.location = location?.replace(/^location\s*:\s*/i, '') || '';
  basics.headline = rest.find((v) => v !== location && v.length <= 100 && !labels.test(v)) || '';
  return basics;
}

function educationEntries(lines) {
  const entries = [];
  let item = {};
  let previousSchool = '';
  const flush = () => {
    if (Object.values(item).some(Boolean)) entries.push(item);
    if (item.institute) previousSchool = item.institute;
    item = {};
  };
  for (const source of lines) {
    const lineDate = source.match(dateRe)?.[0];
    const line = lineDate ? source.replace(lineDate, '') : source;
    const values = parts(line.replace(bulletRe, '')).flatMap((v) => v.split(/,\s*(?=(?:B\.?Tech|M\.?Tech|Bachelor|Master|CGPA|GPA|\d{4}\b))/i));
    const school = values.find((v) => schoolRe.test(v) && (!degreeRe.test(v) || !/^high school diploma/i.test(v)));
    const degree = values.find((v) => degreeRe.test(v));
    if ((school && item.institute && item.degree) || (degree && item.degree)) flush();
    if (lineDate) item.year = lineDate;
    for (let v of values) {
      const score = v.match(scoreRe)?.[0];
      if (score) { item.score = score; v = v.replace(score, ''); }
      v = trimSeparators(v);
      if (!v) continue;
      if (degreeRe.test(v)) item.degree = plain([item.degree, v].filter(Boolean).join(' '));
      else if (schoolRe.test(v)) item.institute = v;
      else if (!item.degree && !item.institute) item.institute = v;
      else if (!item.degree) item.degree = v;
    }
    if (degree && !item.institute && /\bclass\s/i.test(degree) && previousSchool) item.institute = previousSchool;
  }
  flush();
  return entries;
}

function detailEntries(lines, kind, roles) {
  const entries = [];
  let entry;
  let continuing = '';
  for (const source of lines) {
    const linked = source.match(urlRe)?.[0];
    const text = trimSeparators(source.replace(urlRe, '').replace(/\s*[|]\s*(?:Live|GitHub|Demo|Repository|Link)\b/gi, ' '));
    if (entry && /^(?:tech(?:nologies)?|tech stack|tools|stack)\s*:/i.test(text)) {
      entry.technologies = text.replace(/^[^:]+:\s*/, ''); continuing = 'technologies'; continue;
    }
    const bullet = bulletRe.test(source);
    const date = text.match(dateRe)?.[0] || '';
    const followsFinishedBullet = /[.!?]$/.test(entry?.bullets.at(-1)?.text || '');
    const looksLikeTitle = followsFinishedBullet && text.length < 85 && !/[.!?,:]$/.test(text) && /^[A-Z]/.test(text);
    const header = !entry || (!bullet && (linked || (date && text.length < 150) || looksLikeTitle));
    if (header && text) {
      const chunks = parts(trimSeparators(text.replace(date, '')));
      let [title = '', ...extra] = chunks;
      let subtitle = extra.join(' - ');
      if (kind === 'experience') {
        const found = roles.find((r) => r.employer && r.title && text.includes(r.employer) && text.includes(r.title));
        if (found) { title = found.employer; subtitle = found.title; }
        else {
          if (!subtitle && title.includes(',')) [title, subtitle] = title.split(/,\s*(.+)/);
          if (subtitle && roleRe.test(title) && !roleRe.test(subtitle)) [title, subtitle] = [subtitle, title];
        }
      }
      entry = { title, subtitle, date, link: linked ? website(linked) : '', bullets: [] };
      entries.push(entry); continuing = ''; continue;
    }
    if (!entry) continue;
    if (linked && !entry.link) entry.link = website(linked);
    if (!text) continue;
    if (kind === 'experience' && !bullet && !entry.bullets.length && !entry.technologies && source.includes('\t')) {
      const [team, city] = parts(text);
      if (team && city) { entry.technologies = team; entry.location = city; continue; }
    }
    if (bullet) { entry.bullets.push({ text: source.replace(bulletRe, '') }); continuing = 'bullet'; }
    else if (continuing === 'technologies' && /,$/.test(entry.technologies)) entry.technologies += ' ' + text;
    else if (continuing === 'bullet' && entry.bullets.length && !/[.!?]$/.test(entry.bullets.at(-1).text)) entry.bullets.at(-1).text += ' ' + text;
    else { entry.bullets.push({ text }); continuing = 'bullet'; }
  }
  return entries;
}

function skillsEntries(lines) {
  const rows = [];
  for (const line of lines.flatMap((v) => v.split(/\s*\|\s*(?=[^|:]{2,55}:)/))) {
    const label = line.match(/^([^:]{1,65}):\s*(.*)$/);
    if (label || !rows.length) rows.push({ category: label?.[1] || '', skills: label?.[2] || line });
    else rows.at(-1).skills += (/[,;]$/.test(rows.at(-1).skills) ? ' ' : ', ') + line;
  }
  return rows;
}

function achievementEntries(lines) {
  const entries = [];
  for (const line of lines) {
    if (entries.length && !bulletRe.test(line) && !/[.!?]$/.test(entries.at(-1))) entries[entries.length - 1] += ' ' + line;
    else entries.push(line.replace(bulletRe, ''));
  }
  return entries.flatMap((line) => line.split(/;\s+(?=[A-Z][a-z]+ (?:Finalist|Winner|Award))/))
    .map((text) => {
      let [title, detail] = text.split(/(?::\s+|\s+[–—-]\s+(?=[a-z]))(.+)/);
      const date = title.match(dateRe)?.[0] || '';
      title = trimSeparators(title.replace(date, '').replace(/,\s*\)/g, ')').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' '));
      if (title.length <= 220) return { title, date, bullets: detail ? [{ text: detail }] : [] };
      return { bullets: [{ text }] };
    });
}

// The editor limits each rich paragraph to 1,000 characters and each section to 30 entries.
function addParagraphs(resume, title, text) {
  const paragraphs = text.trim().match(/[\s\S]{1,950}(?:\s|$)|[\s\S]{1,950}/g) || [];
  for (let i = 0; i < paragraphs.length; i += 30) {
    const id = 'import-' + (resume.customSections.length + 1);
    const entries = paragraphs.slice(i, i + 30).map((technologies) => ({ technologies: technologies.trim() }));
    resume.customSections.push({ id, title, entries });
    resume.sectionOrder.push('custom:' + id);
  }
}

// Preserve text exceeding a native editor field or row limit in an editable custom section.
function collectOverflow(source, saved, out) {
  if (typeof source === 'string') {
    const full = source.trim();
    if (full && (saved === undefined || (saved && full.startsWith(saved) && full.length > saved.length))) out.push(full);
    return;
  }
  if (!source || typeof source !== 'object') return;
  for (const [key, value] of Object.entries(source)) {
    if (key !== 'id' && key !== 'format') collectOverflow(value, saved?.[key], out);
  }
}

export function mapImport(lines, hints = []) {
  const blocks = [];
  let block = { kind: 'header', lines: [] };
  blocks.push(block);
  const hintsByLine = new Map(hints.map((h) => [h.line, h]));
  for (const [index, line] of lines.entries()) {
    const hint = hintsByLine.get(index);
    const known = sectionKind(line);
    const custom = (blocks.length > 1 || index > 1) && customHeading(line);
    if (known || hint || custom) {
      block = { kind: known || hint?.kind || 'custom', label: line, lines: [] };
      blocks.push(block);
      if (known || custom || hint?.heading) continue;
    }
    block.lines.push(line);
  }
  const parsed = parseResume(lines, DEFAULT_POLICY);
  const resume = { basics: contactDetails(blocks[0].lines, parsed), education: [], skills: [], experience: [], projects: [], achievements: [], customSections: [], sectionOrder: [] };
  const warnings = [];
  const profileNotes = blocks[0].lines.filter((line) => line !== resume.basics.headline && line.length > 70 && !emailRe.test(line) && !/https?:|mailto:|tel:/i.test(line));
  if (blocks.length > 1 && profileNotes.length) addParagraphs(resume, 'Profile', profileNotes.join(' '));
  for (const section of blocks.slice(1)) {
    const { kind, lines: content } = section;
    if (!content.length) continue;
    if (kind === 'summary' || kind === 'custom') {
      addParagraphs(resume, kind === 'summary' ? 'Professional Summary' : section.label, content.join(' '));
      continue;
    }
    const rows = kind === 'education' ? educationEntries(content) : kind === 'skills' ? skillsEntries(content) :
      kind === 'achievements' ? achievementEntries(content) : detailEntries(content, kind, parsed.roles);
    resume[kind].push(...rows);
    if (!resume.sectionOrder.includes(kind)) resume.sectionOrder.push(kind);
  }
  if (blocks.length === 1 && lines.length > 1) {
    addParagraphs(resume, 'Imported details', lines.slice(1).join('\n'));
    warnings.push('Review Imported details and move each item into its résumé section.');
  }
  if (!resume.basics.name) warnings.push('Check your name in Basic Details.');
  if (resume.education.some((e) => !e.degree || !e.institute)) warnings.push('Review the degree and institution in Education.');
  if (resume.experience.some((e) => !e.title || !e.subtitle)) warnings.push('Review the company and role in Experience.');
  const normalized = normalizeResume(resume);
  const overflow = [];
  for (const key of ['basics', 'education', 'experience', 'projects', 'skills', 'achievements', 'customSections']) {
    collectOverflow(resume[key], normalized[key], overflow);
  }
  if (!overflow.length) return { resume: normalized, warnings };
  if (normalized.customSections.length < 12) {
    addParagraphs(normalized, 'Additional imported details', overflow.join('\n'));
    warnings.push('Some text exceeded the editor field sizes. Review Additional imported details against your original.');
  } else {
    warnings.push('This résumé exceeds the editor section limits. Review the imported sections against your original.');
  }
  return { resume: normalizeResume(normalized), warnings };
}

