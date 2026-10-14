import { buildProgressionPayload, normalizeProgression } from '../progressionMath';

// Module keys are stored permissions and backend route gates; only the labels are user-facing.
// 'questions' stays the key for Coding Problems so existing university policies keep working.
export const MODULES = [
  { key: 'learning', label: 'Learning', description: 'Semesters, subjects and topic material for students.' },
  { key: 'assessments', label: 'Assessments', description: 'Scheduled tests, including assessments shared from this control plane.' },
  { key: 'questions', label: 'Coding Problems', description: 'Coding problem practice, the online judge and QuickPrep sets. Published public coding problems are always included alongside the university\'s own.' },
  { key: 'events', label: 'Events & peer interviews', description: 'Events and peer mock interviews between students.' },
  { key: 'interviews', label: 'AI interviews', description: 'AI-led mock interviews with automated feedback.' },
  { key: 'resumes', label: 'Resumes', description: 'Student resume tools.' },
];

export const LEARNING_SOURCES = [
  { value: 'university', label: 'University database', hint: 'Each university manages its own learning content.' },
  { value: 'shared', label: 'Shared database', hint: 'Students read the central learning content from this control plane.' },
];

// The coding toggle and progression editor stay hidden until the server returns those
// fields; older backends ignore them, so showing the controls would drop every save.
export const supportsCoding = (defaults) => defaults?.permissions?.coding !== undefined;
export const supportsProgression = (defaults) => Boolean(defaults?.progression);
export const visibleModules = (defaults) => MODULES.filter(({ key }) => key !== 'coding' || supportsCoding(defaults));

// Server-managed progression keys (version, updatedAt, updatedBy) are stripped before copying.
export const defaultsFrom = (university) => ({
  permissions: university.permissions,
  sources: university.sources,
  ...(university.progression ? { progression: buildProgressionPayload(normalizeProgression(university.progression)) } : {}),
});

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Mirrors the server's field rules so most mistakes are caught before a request. */
export function validateUniversityFields(values, { requireId = false } = {}) {
  const errors = {};
  if (requireId) {
    const id = values.universityId.trim();
    if (!id) errors.universityId = 'University ID is required.';
    else if (!ID_PATTERN.test(id)) errors.universityId = 'Use 2–63 lowercase letters, numbers or hyphens, starting with a letter or number.';
  }
  const name = values.name.trim();
  if (name.length < 2 || name.length > 160) errors.name = 'Name must be 2 to 160 characters.';
  const email = values.contactEmail.trim();
  if (email && !EMAIL_PATTERN.test(email)) errors.contactEmail = 'Enter a valid email address.';
  const site = values.deploymentUrl.trim();
  if (site) {
    try {
      const url = new URL(site);
      if (!['http:', 'https:'].includes(url.protocol)) errors.deploymentUrl = 'Use a full http(s) URL.';
    } catch { errors.deploymentUrl = 'Use a full URL, for example https://peerprep.university.edu'; }
  }
  const api = values.apiUrl.trim();
  if (api) {
    try {
      const url = new URL(api);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') errors.apiUrl = 'Enter only the origin, without a path, for example https://api.university.edu';
      else if (url.protocol === 'http:' && !LOCAL_HOSTS.includes(url.hostname)) errors.apiUrl = 'Use HTTPS. Plain HTTP is allowed only for localhost.';
      else if (!['http:', 'https:'].includes(url.protocol)) errors.apiUrl = 'Use an https:// origin.';
    } catch { errors.apiUrl = 'Enter a full origin, for example https://api.university.edu'; }
  }
  return errors;
}

/** Maps a server validation message onto the form field it is about. */
export function fieldForServerError(error) {
  const message = String(error?.message || '');
  const status = error?.response?.status;
  if (status === 409 || /university id/i.test(message)) return 'universityId';
  if (/api url/i.test(message)) return 'apiUrl';
  if (/frontend url/i.test(message)) return 'deploymentUrl';
  if (/email/i.test(message)) return 'contactEmail';
  if (/name/i.test(message)) return 'name';
  return '';
}

export const slugify = (value) => String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);

// Heartbeat health: universities report usage on a schedule, so 15 minutes of silence is "stale".
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;
export function heartbeatHealth(university, now = Date.now()) {
  if (!university?.lastHeartbeatAt) return 'never';
  const at = new Date(university.lastHeartbeatAt).getTime();
  if (!Number.isFinite(at)) return 'never';
  return now - at <= ONLINE_WINDOW_MS ? 'online' : 'stale';
}

export function relativeTime(value, now = Date.now()) {
  if (!value) return 'Never';
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return 'Never';
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const formatDateTime = (value) => (value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : '—');
export const formatCount = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '0');

/** Serves Cloudinary logos in a modern format and only as wide as needed. Other URLs pass through. */
export function logoSrc(url, width) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.includes('/image/upload/')) return url;
    parsed.pathname = parsed.pathname.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${Math.round(width)}/`);
    return parsed.toString();
  } catch { return url; }
}

const AVATAR_TONES = [
  'from-sky-500 to-blue-600', 'from-emerald-500 to-teal-600', 'from-violet-500 to-indigo-600', 'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600', 'from-cyan-500 to-sky-600', 'from-fuchsia-500 to-purple-600', 'from-lime-500 to-green-600',
];
export function avatarTone(seed) {
  let hash = 0;
  for (const char of String(seed || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
export function initials(name, fallback = '') {
  const words = String(name || fallback || '?').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

// Client mirror of the server's logo rules (backend/src/platform/universityLogo.js).
export const LOGO_RULES = { maxBytes: 2 * 1024 * 1024, minSide: 64, maxSide: 4096, accept: 'image/png,image/jpeg,image/webp' };

async function sniffType(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { resolve({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url); };
    image.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    image.src = url;
  });
}

/** Resolves to an error message, or '' when the file is an acceptable logo. */
export async function checkLogoFile(file) {
  if (!file) return 'Choose an image.';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Use a PNG, JPEG or WebP image. SVG and GIF are not supported.';
  if (file.size > LOGO_RULES.maxBytes) return `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`;
  if (await sniffType(file) !== file.type) return 'This file is not a valid PNG, JPEG or WebP image.';
  const size = await imageSize(file);
  if (!size) return 'This image could not be read.';
  if (size.width < LOGO_RULES.minSide || size.height < LOGO_RULES.minSide) return `The logo must be at least 64×64 pixels (this one is ${size.width}×${size.height}).`;
  if (size.width > LOGO_RULES.maxSide || size.height > LOGO_RULES.maxSide) return `The logo must be at most 4096×4096 pixels (this one is ${size.width}×${size.height}).`;
  return '';
}

const AUDIT_LABELS = {
  'university.created': 'University created',
  'university.updated': 'University settings updated',
  'university.deleted': 'University deleted',
  'university.key_rotated': 'API key rotated',
  'university.logo_updated': 'Logo uploaded',
  'university.logo_removed': 'Logo removed',
  'university.defaults_updated': 'Defaults for new universities updated',
  'university.students_viewed': 'Student list viewed',
  'university.student_viewed': 'Student record viewed',
  'publication.updated': 'Shared assessment access changed',
};
export const auditLabel = (action) => AUDIT_LABELS[action] || action;
