// Shared facts about a university registration, used by every Universities page.
export const MODULES = [
  { key: 'learning', label: 'Learning', description: 'Semesters, subjects, topic videos and notes' },
  { key: 'assessments', label: 'Assessments', description: 'Tests, including shared PeerPrep assessments' },
  { key: 'questions', label: 'Question practice', description: 'Prep Coding problems and QuickPrep sheets' },
  { key: 'events', label: 'Peer interviews', description: 'Mock interview events with feedback' },
  { key: 'interviews', label: 'AI interviews', description: 'Voice interviews with ANNU' },
  { key: 'resumes', label: 'Resumes', description: 'Resume builder and resume-based questions' },
];

export const DAY_MS = 86_400_000;
export const EXPIRY_WARNING_DAYS = 30;

const dayStart = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Days until the service period ends (negative once it has ended), or null without dates. */
export function daysLeft(university, now = new Date()) {
  const end = dayStart(university?.serviceEndDate);
  if (!end) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / DAY_MS);
}

/**
 * One status a Master Admin can act on, plus what still needs setting up:
 * live | disabled | expired | scheduled | expiring, and issues[] in plain words.
 */
export function universityHealth(university, now = new Date()) {
  const issues = [];
  if (!university.dbConfigured) issues.push('Database not connected');
  if (!university.judgeConfigured) issues.push('Code judge (Judge0) not connected');
  if (!university.serviceStartDate || !university.serviceEndDate) issues.push('Service dates not set');
  if (university.coordinatorLimit == null || university.studentLimit == null) issues.push('Account limits not set');
  const left = daysLeft(university, now);
  const start = dayStart(university.serviceStartDate);
  let status = 'live';
  if (!university.active) status = 'disabled';
  else if (left !== null && left < 0) status = 'expired';
  else if (start && start > now) status = 'scheduled';
  else if (left !== null && left <= EXPIRY_WARNING_DAYS) status = 'expiring';
  return { status, issues, daysLeft: left, needsAttention: issues.length > 0 || ['expired', 'expiring'].includes(status) };
}

export const STATUS_META = {
  live: { label: 'Live', tone: 'success' },
  expiring: { label: 'Ending soon', tone: 'warning' },
  scheduled: { label: 'Starts later', tone: 'info' },
  expired: { label: 'Service ended', tone: 'danger' },
  disabled: { label: 'Disabled', tone: 'neutral' },
};

export const portalUrl = (university) => `/u/${university.universityId}/student`;
export const enabledModules = (university) => MODULES.filter(({ key }) => university.permissions?.[key] === true);

const ACTION_LABELS = {
  'university.created': 'University added',
  'university.updated': 'University updated',
  'university.deleted': 'University removed',
  'university.defaults_updated': 'New-university defaults changed',
  'university.coins_topup': 'Prep Coins added',
  'university.coins_initial': 'Starting Prep Coins added',
  'university.logo_updated': 'Logo changed',
  'university.logo_removed': 'Logo removed',
  'university.students_viewed': 'Student list viewed',
  'university.student_viewed': 'Student record viewed',
  'university.key_rotated': 'API key rotated',
  'publication.updated': 'Shared assessment access changed',
  'prep_score.draft_saved': 'Prep Score draft saved',
  'prep_score.policy_published': 'Prep Score policy published',
  'prep_score.version_restored': 'Prep Score version restored',
  'prep_coin.pricing_updated': 'Prep Coin prices changed',
};
export const actionLabel = (action) => ACTION_LABELS[action]
  || String(action || 'Activity').replace(/[._]/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
