import {
  BarChart3, BookOpen, Bot, Briefcase, CalendarDays, ClipboardList, Coins,
  FileSearch, LayoutDashboard, ListChecks, Trophy, UserCog, Users, Zap,
} from 'lucide-react';

export const STUDENT_FEATURE_CATALOG = Object.freeze([
  // Same order and names as the student sidebar.
  { key: 'dashboard', label: 'Dashboard', description: 'Personal overview, progress cards and next actions.', icon: LayoutDashboard, path: '/student/dashboard' },
  { key: 'prep_coding', label: 'Prep Coding', description: 'Coding problems, daily challenge and practice submissions.', icon: ListChecks, path: '/problems' },
  { key: 'quickprep', label: 'Quick Prep', description: 'Curated quests, challenges and guided preparation.', icon: Zap, path: '/student/quickprep' },
  { key: 'assessments', label: 'Prep Assessment', description: 'Available tests, assessment history, reports and feedback.', icon: ClipboardList, path: '/student/assessments' },
  { key: 'resume', label: 'Prep Resume', description: 'Create a placement-ready resume in 30+ professional templates.', icon: UserCog, path: '/student/resume' },
  { key: 'rankings', label: 'Ranking', description: 'University and global leaderboard visibility.', icon: Trophy, path: '/student/rankings' },
  { key: 'prep_coins', label: 'Prep Coin', description: 'Prep Score, Prep Coin wallet, balance, pricing and transaction history.', icon: Coins, path: '/student/wallet' },
  { key: 'analysis', label: 'Prep Analysis', description: 'Topic coverage, progress, strengths and next steps.', icon: BarChart3, path: '/student/analysis' },
  { key: 'interviews', label: 'Peer Interviews', description: 'One-to-one interview schedules, sessions and feedback.', icon: CalendarDays, path: '/student/interview' },
  { key: 'ai_interviews', label: 'AI Interviews', description: 'AI interview assignments, practice rooms and reports.', icon: Bot, path: '/student/ai-interviews' },
  { key: 'learning', label: 'Learning Modules', description: 'Semester learning content, lessons and topic progress.', icon: BookOpen, path: '/student/learning' },
  // Opt-in: never part of "All access"; only students an admin turns it on for (same rule on the server).
  { key: 'peers', label: 'Prep Mates', description: 'Find classmates, view their profiles and become Prep Mates (same university only).', icon: Users, path: '/student/peers', optIn: true },
  { key: 'prep_mock', label: 'Prep Mock', description: 'Company mock tests by role: pick a company, choose a role and take its mocks.', icon: Briefcase, path: '/student/prep-mock', optIn: true },
  { key: 'resume_jd_match', label: 'JD Match with ANVI', description: 'Compare the résumé with a job description: missing keywords, section by section and line by line. Uses Prep Coins per check (10 by default).', icon: FileSearch, path: '/student/resume/review?tab=job', optIn: true, requires: 'resume' },
]);

/** Features that only work together with another one (same rule on the server). */
export const STUDENT_FEATURE_REQUIRES = Object.freeze(Object.fromEntries(STUDENT_FEATURE_CATALOG.filter((feature) => feature.requires).map((feature) => [feature.key, feature.requires])));

export const ALL_STUDENT_FEATURES = STUDENT_FEATURE_CATALOG.map((feature) => feature.key);
/** Features only on when an admin turns them on ("All access" leaves them off). */
export const OPT_IN_STUDENT_FEATURES = STUDENT_FEATURE_CATALOG.filter((feature) => feature.optIn).map((feature) => feature.key);
/** What "All access" gives: every feature except the opt-in ones. */
export const STANDARD_STUDENT_FEATURES = ALL_STUDENT_FEATURES.filter((key) => !OPT_IN_STUDENT_FEATURES.includes(key));

export function normalizeStudentAccess(access, accessScope = 'full') {
  if (accessScope === 'assessment_only') return { mode: 'custom', features: ['assessments'] };
  if (!access || access.mode !== 'custom') return { mode: 'all', features: [...STANDARD_STUDENT_FEATURES] };
  const allowed = new Set(ALL_STUDENT_FEATURES);
  return { mode: 'custom', features: [...new Set((access.features || []).filter((key) => allowed.has(key)))] };
}

export function hasStudentFeature(user, feature) {
  const features = normalizeStudentAccess(user?.featureAccess, user?.accessScope).features;
  const needs = STUDENT_FEATURE_REQUIRES[feature];
  if (feature === 'prep_mock' && !user?.prepMockEnrolledAt) return false;
  return features.includes(feature) && (!needs || features.includes(needs));
}

export function firstStudentFeaturePath(user, canOpen = () => true) {
  return STUDENT_FEATURE_CATALOG.find((feature) => hasStudentFeature(user, feature.key) && canOpen(feature.path))?.path || '/student/profile';
}

export function featureForStudentPath(pathname = '') {
  if (pathname === '/problems' || pathname.startsWith('/problems/')) return 'prep_coding';
  if (pathname === '/assessments' || pathname === '/assessment-reports' || pathname === '/assessment-history' || pathname.startsWith('/student/assessment/')) return 'assessments';
  if (pathname.startsWith('/student/quickprep') || pathname.startsWith('/student/quests')) return 'quickprep';
  if (pathname.startsWith('/student/analysis') || pathname.startsWith('/student/analytics')) return 'analysis';
  if (pathname.startsWith('/student/rankings')) return 'rankings';
  if (pathname.startsWith('/student/ai-interviews')) return 'ai_interviews';
  if (pathname.startsWith('/student/interview') || pathname.startsWith('/student/session') || pathname.startsWith('/student/feedback')) return 'interviews';
  if (pathname.startsWith('/student/assessments') || pathname.startsWith('/student/assessment-reports') || pathname.startsWith('/student/assessment-history')) return 'assessments';
  if (pathname.startsWith('/student/learning')) return 'learning';
  if (pathname.startsWith('/student/resume')) return 'resume';
  if (pathname.startsWith('/student/wallet')) return 'prep_coins';
  if (pathname.startsWith('/student/peers')) return 'peers';
  if (pathname.startsWith('/student/prep-mock')) return 'prep_mock';
  if (pathname.startsWith('/student/dashboard') || pathname.startsWith('/student/challenges')) return 'dashboard';
  return null;
}
