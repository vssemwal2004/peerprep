import { DEFAULT_TEMPLATE_ID, RESUME_TEMPLATE_CATALOG, RESUME_TEMPLATE_IDS } from './templates/catalog';

export const FIXED_SECTION_META = {
  // "Education" (not "Academic Details"): applicant tracking systems look for this heading.
  education: { title: 'EDUCATION', label: 'Education' },
  experience: { title: 'EXPERIENCE', label: 'Experience' },
  projects: { title: 'PROJECTS', label: 'Projects' },
  skills: { title: 'TECHNICAL SKILLS', label: 'Technical Skills' },
  achievements: { title: 'ACHIEVEMENTS', label: 'Achievements' },
};

export const DEFAULT_SECTION_ORDER = Object.keys(FIXED_SECTION_META);

// Templates only change design; content is shared by all of them.
export const RESUME_TEMPLATES = RESUME_TEMPLATE_CATALOG;
const TEMPLATE_ID_SET = new Set(RESUME_TEMPLATE_IDS);

export const createEmptyDetailEntry = () => ({
  title: '', subtitle: '', location: '', date: '', link: '', technologies: '', bullets: [],
});

export const createEmptyResume = () => ({
  exists: false,
  template: DEFAULT_TEMPLATE_ID,
  basics: { name: '', headline: '', location: '', email: '', mobile: '', linkedin: '', github: '', portfolio: '' },
  basicsVisibility: { location: true, email: true, mobile: true, linkedin: true, github: true, portfolio: true },
  education: [],
  experience: [],
  projects: [],
  skills: [],
  achievements: [],
  customSections: [],
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  hiddenSections: [],
  completion: 0,
});

export const normalizeClientResume = (value = {}) => {
  const base = createEmptyResume();
  const customSections = Array.isArray(value.customSections)
    ? value.customSections.map((section) => ({ ...section, format: 'details' }))
    : [];
  const validSectionKeys = [
    ...DEFAULT_SECTION_ORDER,
    ...customSections.map((section) => `custom:${section.id}`),
  ];
  const requestedSectionOrder = (Array.isArray(value.sectionOrder) ? value.sectionOrder : [])
    .filter((key, index, keys) => validSectionKeys.includes(key) && keys.indexOf(key) === index);
  const sectionOrder = [
    ...requestedSectionOrder,
    ...validSectionKeys.filter((key) => !requestedSectionOrder.includes(key)),
  ];
  return {
    ...base,
    ...value,
    template: TEMPLATE_ID_SET.has(value.template) ? value.template : base.template,
    basics: { ...base.basics, ...(value.basics || {}) },
    basicsVisibility: { ...base.basicsVisibility, ...(value.basicsVisibility || {}) },
    education: Array.isArray(value.education) ? value.education : [],
    experience: Array.isArray(value.experience) ? value.experience : [],
    projects: Array.isArray(value.projects) ? value.projects : [],
    skills: Array.isArray(value.skills) ? value.skills : [],
    achievements: Array.isArray(value.achievements) ? value.achievements : [],
    customSections,
    // Older drafts may contain only "basics", unknown keys, or an incomplete
    // order. Always retain the student's valid order and append every missing
    // fixed/custom section so entered data can never be omitted from preview.
    sectionOrder,
    hiddenSections: (Array.isArray(value.hiddenSections) ? value.hiddenSections : [])
      .filter((key, index, keys) => validSectionKeys.includes(key) && keys.indexOf(key) === index),
  };
};

// Saving intentionally strips empty rows on the server. Keep those rows in the
// live editor so a newly opened form does not disappear before the student has
// had a chance to type into it; only merge metadata returned by the save.
export const mergeSavedResumeMetadata = (draft, saved = {}) => {
  const normalizedDraft = normalizeClientResume(draft);
  return {
    ...normalizedDraft,
    exists: true,
    createdAt: saved.createdAt || normalizedDraft.createdAt,
    updatedAt: saved.updatedAt || normalizedDraft.updatedAt,
    completion: typeof saved.completion === 'number'
      ? saved.completion
      : normalizedDraft.completion,
  };
};

export const isDetailEntryMeaningful = (entry = {}) => Boolean(
  entry.title || entry.subtitle || entry.location || entry.date || entry.link
  || entry.technologies || entry.bullets?.some((bullet) => String(bullet?.text || bullet || '').trim()),
);

export const getSectionData = (resume, key) => {
  if (key.startsWith('custom:')) {
    return resume.customSections.find((section) => `custom:${section.id}` === key)?.entries || [];
  }
  return resume[key] || [];
};

export const getSectionTitle = (resume, key) => {
  if (key.startsWith('custom:')) {
    return resume.customSections.find((section) => `custom:${section.id}` === key)?.title || 'CUSTOM SECTION';
  }
  return FIXED_SECTION_META[key]?.title || key.toUpperCase();
};

export const visibleSectionKeys = (resume) => resume.sectionOrder.filter((key) => {
  if (resume.hiddenSections.includes(key)) return false;
  if (key === 'skills') return getSectionData(resume, key).some((entry) => entry.category || entry.skills);
  if (key === 'education') return getSectionData(resume, key).some((entry) => entry.year || entry.degree || entry.institute || entry.score);
  return getSectionData(resume, key).some(isDetailEntryMeaningful);
});

const estimateEntryUnits = (entry = {}) => 2.4
  + (entry.subtitle ? 0.6 : 0)
  + (entry.technologies ? 0.8 : 0)
  + (entry.bullets || []).reduce((sum, bullet) => sum + Math.max(0.9, String(bullet?.text || bullet || '').length / 100), 0);

/** Rough page count used only until the preview has measured the real layout. */
export const estimatePageCount = (resume) => {
  const units = visibleSectionKeys(resume).reduce((sum, key) => {
    const data = getSectionData(resume, key);
    if (key === 'education') return sum + 2 + data.length * 1.4;
    if (key === 'skills') return sum + 2 + data.length * 1.2;
    return sum + 2 + data.reduce((total, entry) => total + estimateEntryUnits(entry), 0);
  }, 6);
  return Math.max(1, Math.ceil(units / 62));
};

export const hasResumeContent = (resume) => {
  const basics = resume.basics || {};
  const visibility = resume.basicsVisibility || {};
  const visibleBasics = Boolean(String(basics.name || '').trim()) || ['location', 'email', 'mobile', 'linkedin', 'github', 'portfolio']
    .some((key) => visibility[key] !== false && String(basics[key] || '').trim());
  return Boolean(visibleBasics || visibleSectionKeys(resume).length);
};

/** Check fields together on the same visible entry, just as they appear on the PDF. */
export function getResumeRequirements(resume = {}) {
  const basics = resume?.basics || {};
  const shown = (section) => !resume?.hiddenSections?.includes(section);
  const hasWords = (value) => /[\p{L}\p{N}]/u.test(String(value ?? ''));
  const contactVisible = (field) => resume?.basicsVisibility?.[field] !== false;
  const email = String(basics.email || '').trim();
  const phone = String(basics.mobile || '').trim();
  const contact = (contactVisible('email') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || (contactVisible('mobile') && /^[+\d ().-]+$/.test(phone) && /^\d{7,15}$/.test(phone.replace(/\D/g, '')));
  const missing = [];
  function requireField(ok, id, label, section, field, entryIndex, bulletIndex) {
    if (!ok) missing.push({ id, label, section, field, entryIndex, bulletIndex });
  }
  requireField(hasWords(basics.name), 'name', 'Add your full name', 'basics', 'name');
  requireField(contact, 'contact', 'Add a visible email address or phone number', 'basics', contactVisible('email') ? 'email' : 'mobile');

  function closest(entries, evaluate) {
    return entries.map((item, index) => ({ item, index, count: evaluate(item) }))
      .sort((a, b) => b.count - a.count)[0];
  }
  const education = closest(resume?.education || [], (row) => Number(hasWords(row.degree)) + Number(hasWords(row.institute)));
  const edVisible = shown('education');
  requireField(edVisible && hasWords(education?.item.degree), 'degree', edVisible ? 'Add your degree or qualification' : 'Show your education on the PDF', 'education', 'degree', education?.index ?? 0);
  requireField(edVisible && hasWords(education?.item.institute), 'institute', edVisible ? 'Add the school or institute for this qualification' : 'Include the institute on your PDF', 'education', 'institute', education?.index ?? 0);
  const skills = resume?.skills || [];
  requireField(shown('skills') && skills.some((row) => hasWords(row.skills)), 'skills', shown('skills') ? 'List the skills you use' : 'Show your skills on the PDF', 'skills', 'skills', 0);

  const hasBullet = (row) => row.bullets?.some((bullet) => hasWords(typeof bullet === 'string' ? bullet : bullet?.text));
  const options = ['projects', 'experience'].filter(shown).flatMap((section) =>
    (resume?.[section] || []).map((row, index) => ({ section, row, index })));
  const work = closest(options, ({ row }) => Number(hasWords(row.title)) + Number(Boolean(hasBullet(row))))?.item;
  const section = work?.section || (shown('projects') || !shown('experience') ? 'projects' : 'experience');
  requireField(hasWords(work?.row.title), 'work-title', 'Add a project name or an employer', section, 'title', work?.index ?? 0);
  requireField(work && hasBullet(work.row), 'work-bullet', 'Describe one thing you did in that project or role', section, 'bullet', work?.index ?? 0, 0);
  const total = 7;
  const complete = total - missing.length;
  return { ready: !missing.length, missing, total, complete, percent: Math.round(100 * complete / total) };
}

export const calculateReadiness = (resume, { pageCount: measuredPageCount } = {}) => {
  const { percent } = getResumeRequirements(resume);
  const suggestions = [];
  if (!resume.projects.some(isDetailEntryMeaningful)) suggestions.push('Add a project that demonstrates applied skills.');
  if (!resume.skills.some((entry) => entry.category || entry.skills)) suggestions.push('Group your strongest technical skills.');
  if (!resume.basics?.github && !resume.basics?.portfolio) suggestions.push('Consider adding GitHub or a portfolio link.');
  const detailEntries = [...resume.experience, ...resume.projects, ...resume.achievements, ...resume.customSections.flatMap((section) => section.entries || [])];
  const bulletTexts = detailEntries.flatMap((entry) => entry.bullets || []).map((bullet) => String(bullet?.text || bullet || '').trim()).filter(Boolean);
  const longBullet = bulletTexts.some((bullet) => bullet.length > 220);
  if (longBullet) suggestions.push('One or more bullets may be easier to scan if shortened.');
  const weakBullet = bulletTexts.find((bullet) => !/^(built|created|developed|designed|implemented|led|managed|improved|optimized|reduced|increased|delivered|launched|automated|analyzed|maintained|deployed|integrated|engineered|coordinated|achieved|won|secured|ranked)\b/i.test(bullet.replace(/^[*_]+/, '')));
  if (weakBullet) suggestions.push('Start achievement bullets with a clear action verb.');
  const measurableBullets = bulletTexts.filter((bullet) => /\d|%|\b(k|m|million|thousand|users|hours|days|teams)\b/i.test(bullet)).length;
  if (bulletTexts.length >= 3 && measurableBullets === 0) suggestions.push('Add a number or measurable result where it is genuinely available.');
  const pageCount = measuredPageCount || estimatePageCount(resume);
  if (pageCount > 2) suggestions.push('Your resume is over two pages; tighten older or less relevant content.');
  return {
    percent,
    suggestions: suggestions.slice(0, 4),
    metrics: { bulletCount: bulletTexts.length, measurableBullets, pageCount },
  };
};

export const filenameForResume = (resume) => {
  const base = String(resume.basics?.name || 'PeerPrep-Student')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'PeerPrep-Student'}-Resume.pdf`;
};

export const displayLink = (value) => String(value || '')
  .replace(/^https?:\/\//i, '')
  .replace(/\/$/, '');
