import Resume from '../models/Resume.js';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';

const FIXED_SECTIONS = ['education', 'experience', 'projects', 'skills', 'achievements'];
const VISIBILITY_KEYS = ['location', 'email', 'mobile', 'linkedin', 'github', 'portfolio'];
const MAX_ITEMS = 30;
const MAX_BULLETS = 20;

const cleanText = (value, max = 1000) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);

const cleanUrl = (value) => {
  const raw = cleanText(value, 500);
  if (!raw) return '';
  const normalized = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(normalized);
    return ['http:', 'https:'].includes(parsed.protocol) ? normalized : '';
  } catch {
    return '';
  }
};

const cleanBullets = (bullets) => (Array.isArray(bullets) ? bullets : [])
  .slice(0, MAX_BULLETS)
  .map((bullet) => ({ text: cleanText(typeof bullet === 'string' ? bullet : bullet?.text, 1200) }))
  .filter((bullet) => bullet.text);

const cleanDetailEntries = (entries) => (Array.isArray(entries) ? entries : [])
  .slice(0, MAX_ITEMS)
  .map((entry) => ({
    title: cleanText(entry?.title, 220),
    subtitle: cleanText(entry?.subtitle, 220),
    location: cleanText(entry?.location, 140),
    date: cleanText(entry?.date, 100),
    link: cleanUrl(entry?.link),
    technologies: cleanText(entry?.technologies, 1000),
    bullets: cleanBullets(entry?.bullets),
  }))
  .filter((entry) => entry.title || entry.subtitle || entry.location || entry.date || entry.link || entry.technologies || entry.bullets.length);

const normalizeResume = (body = {}) => {
  const usedIds = new Set();
  const customSections = (Array.isArray(body.customSections) ? body.customSections : [])
    .slice(0, 12)
    .map((section, index) => {
      let id = cleanText(section?.id, 80).replace(/[^a-zA-Z0-9_-]/g, '') || `custom-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      return {
        id,
        title: cleanText(section?.title, 120) || 'CUSTOM SECTION',
        format: 'details',
        entries: cleanDetailEntries(section?.entries),
      };
    });

  const customKeys = customSections.map((section) => `custom:${section.id}`);
  const validKeys = new Set([...FIXED_SECTIONS, ...customKeys]);
  const requestedOrder = (Array.isArray(body.sectionOrder) ? body.sectionOrder : [])
    .map((value) => cleanText(value, 100))
    .filter((value, index, values) => validKeys.has(value) && values.indexOf(value) === index);

  const basicsVisibility = Object.fromEntries(
    VISIBILITY_KEYS.map((key) => [key, body.basicsVisibility?.[key] !== false]),
  );

  const normalized = {
    template: 'iit-bombay-classic',
    basics: {
      name: cleanText(body.basics?.name, 160),
      location: cleanText(body.basics?.location, 160),
      email: cleanText(body.basics?.email, 254),
      mobile: cleanText(body.basics?.mobile, 60),
      linkedin: cleanUrl(body.basics?.linkedin),
      github: cleanUrl(body.basics?.github),
      portfolio: cleanUrl(body.basics?.portfolio),
    },
    basicsVisibility,
    education: (Array.isArray(body.education) ? body.education : [])
      .slice(0, MAX_ITEMS)
      .map((entry) => ({
        year: cleanText(entry?.year, 80),
        degree: cleanText(entry?.degree, 180),
        institute: cleanText(entry?.institute, 220),
        score: cleanText(entry?.score, 80),
      }))
      .filter((entry) => entry.year || entry.degree || entry.institute || entry.score),
    experience: cleanDetailEntries(body.experience),
    projects: cleanDetailEntries(body.projects),
    skills: (Array.isArray(body.skills) ? body.skills : [])
      .slice(0, MAX_ITEMS)
      .map((entry) => ({ category: cleanText(entry?.category, 160), skills: cleanText(entry?.skills, 1400) }))
      .filter((entry) => entry.category || entry.skills),
    achievements: cleanDetailEntries(body.achievements),
    customSections,
    sectionOrder: [...requestedOrder, ...[...validKeys].filter((value) => !requestedOrder.includes(value))],
    hiddenSections: (Array.isArray(body.hiddenSections) ? body.hiddenSections : [])
      .map((value) => cleanText(value, 100))
      .filter((value, index, values) => validKeys.has(value) && values.indexOf(value) === index),
  };

  const meaningful = [
    normalized.basics.name || normalized.basics.email || normalized.basics.mobile,
    normalized.education.length,
    normalized.experience.length,
    normalized.projects.length,
    normalized.skills.length,
    normalized.achievements.length,
    normalized.customSections.some((section) => section.entries.length),
  ];
  normalized.completion = Math.round((meaningful.filter(Boolean).length / meaningful.length) * 100);
  return normalized;
};

const presentResume = (resume, exists = true) => ({
  ...(resume?.toObject ? resume.toObject() : resume),
  exists,
});

const getProfileSeed = async (studentId) => {
  const profile = await User.findById(studentId)
    .select('name email phone linkedinUrl githubUrl portfolioUrl')
    .lean();
  return {
    exists: false,
    template: 'iit-bombay-classic',
    basics: {
      name: profile?.name || '',
      location: '',
      email: profile?.email || '',
      mobile: profile?.phone || '',
      linkedin: profile?.linkedinUrl || '',
      github: profile?.githubUrl || '',
      portfolio: profile?.portfolioUrl || '',
    },
    basicsVisibility: Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, true])),
    education: [],
    experience: [],
    projects: [],
    skills: [],
    achievements: [],
    customSections: [],
    sectionOrder: [...FIXED_SECTIONS],
    hiddenSections: [],
    completion: 0,
  };
};

export async function getMyResume(req, res) {
  const existing = await Resume.findOne({ student: req.user._id }).lean();
  if (existing) return res.json({ resume: presentResume(existing) });
  return res.json({ resume: await getProfileSeed(req.user._id) });
}

export async function saveMyResume(req, res) {
  const normalized = normalizeResume(req.body);
  const existing = await Resume.findOne({ student: req.user._id }).lean();
  const previousVersion = existing ? {
    data: {
      basics: existing.basics,
      basicsVisibility: existing.basicsVisibility,
      education: existing.education,
      experience: existing.experience,
      projects: existing.projects,
      skills: existing.skills,
      achievements: existing.achievements,
      customSections: existing.customSections,
      sectionOrder: existing.sectionOrder,
      hiddenSections: existing.hiddenSections,
    },
    savedAt: existing.updatedAt,
  } : undefined;

  const update = { ...normalized };
  if (previousVersion) update.previousVersion = previousVersion;
  const resume = await Resume.findOneAndUpdate(
    { student: req.user._id },
    { $set: update, $setOnInsert: { student: req.user._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return res.json({ resume: presentResume(resume), message: 'Resume saved successfully.' });
}

export async function restorePreviousResume(req, res) {
  const resume = await Resume.findOne({ student: req.user._id });
  if (!resume?.previousVersion?.data) throw new HttpError(404, 'No previous resume version is available.');
  const normalized = normalizeResume(resume.previousVersion.data);
  const currentSnapshot = {
    data: {
      basics: resume.basics,
      basicsVisibility: resume.basicsVisibility,
      education: resume.education,
      experience: resume.experience,
      projects: resume.projects,
      skills: resume.skills,
      achievements: resume.achievements,
      customSections: resume.customSections,
      sectionOrder: resume.sectionOrder,
      hiddenSections: resume.hiddenSections,
    },
    savedAt: resume.updatedAt,
  };
  Object.assign(resume, normalized, { previousVersion: currentSnapshot });
  await resume.save();
  return res.json({ resume: presentResume(resume), message: 'Previous resume version restored.' });
}

export async function getStudentResume(req, res) {
  const query = { _id: req.params.studentId, role: 'student' };
  if (req.user.role === 'coordinator') query.teacherIds = req.user.coordinatorId;
  const student = await User.findOne(query).select('_id name email studentId').lean();
  if (!student) throw new HttpError(404, 'Student not found or not assigned to this coordinator.');
  const resume = await Resume.findOne({ student: student._id }).lean();
  return res.json({ student, resume: resume ? presentResume(resume) : null });
}

export { normalizeResume };
