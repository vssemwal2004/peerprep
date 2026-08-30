export const FIXED_SECTION_META = {
  education: { title: 'ACADEMIC DETAILS', label: 'Academic Details' },
  experience: { title: 'EXPERIENCE', label: 'Experience' },
  projects: { title: 'PROJECTS', label: 'Projects' },
  skills: { title: 'TECHNICAL SKILLS', label: 'Technical Skills' },
  achievements: { title: 'ACHIEVEMENTS', label: 'Achievements' },
};

export const DEFAULT_SECTION_ORDER = Object.keys(FIXED_SECTION_META);

export const createEmptyDetailEntry = () => ({
  title: '', subtitle: '', location: '', date: '', link: '', technologies: '', bullets: [],
});

export const createEmptyResume = () => ({
  exists: false,
  template: 'iit-bombay-classic',
  basics: { name: '', location: '', email: '', mobile: '', linkedin: '', github: '', portfolio: '' },
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

export const paginateResume = (resume) => {
  const keys = visibleSectionKeys(resume);
  if (!keys.length) return [[]];
  const pages = [];
  let current = [];
  let units = 0;
  // The fixed 10pt IIT Bombay layout is compact enough for the reference
  // content set to remain on one page while still splitting truly long drafts.
  const firstLimit = 60;
  const nextLimit = 66;

  keys.forEach((key) => {
    const data = getSectionData(resume, key);
    let sectionUnits = 2;
    if (key === 'education') sectionUnits += data.length * 1.4;
    else if (key === 'skills') sectionUnits += data.length * 1.2;
    else sectionUnits += data.reduce((sum, entry) => sum + estimateEntryUnits(entry), 0);
    const limit = pages.length ? nextLimit : firstLimit;
    if (current.length && units + sectionUnits > limit) {
      pages.push(current);
      current = [];
      units = 0;
    }
    current.push(key);
    units += sectionUnits;
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
};

export const hasResumeContent = (resume) => {
  const basics = resume.basics || {};
  const visibility = resume.basicsVisibility || {};
  const visibleBasics = Boolean(String(basics.name || '').trim()) || ['location', 'email', 'mobile', 'linkedin', 'github', 'portfolio']
    .some((key) => visibility[key] !== false && String(basics[key] || '').trim());
  return Boolean(visibleBasics || visibleSectionKeys(resume).length);
};

export const calculateReadiness = (resume) => {
  const checks = [
    Boolean(resume.basics?.name || resume.basics?.email || resume.basics?.mobile),
    resume.education.some((entry) => entry.degree || entry.institute),
    resume.experience.some(isDetailEntryMeaningful),
    resume.projects.some(isDetailEntryMeaningful),
    resume.skills.some((entry) => entry.category || entry.skills),
    resume.achievements.some(isDetailEntryMeaningful),
    resume.customSections.some((section) => section.entries.some(isDetailEntryMeaningful)),
  ];
  const percent = Math.round((checks.filter(Boolean).length / checks.length) * 100);
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
  const pageCount = paginateResume(resume).length;
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
