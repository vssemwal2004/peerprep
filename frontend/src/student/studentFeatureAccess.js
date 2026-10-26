import {
  BarChart3, BookOpen, Bot, CalendarDays, ClipboardList, Coins,
  LayoutDashboard, ListChecks, Trophy, UserCog, Zap,
} from 'lucide-react';

export const STUDENT_FEATURE_CATALOG = Object.freeze([
  { key: 'dashboard', label: 'Dashboard', description: 'Personal overview, progress cards and next actions.', icon: LayoutDashboard, path: '/student/dashboard' },
  { key: 'quickprep', label: 'QuickPrep', description: 'Curated quests, challenges and guided preparation.', icon: Zap, path: '/student/quickprep' },
  { key: 'analysis', label: 'Performance Analysis', description: 'Detailed progress, strengths and improvement insights.', icon: BarChart3, path: '/student/analysis' },
  { key: 'rankings', label: 'Rankings', description: 'University and global leaderboard visibility.', icon: Trophy, path: '/student/rankings' },
  { key: 'interviews', label: 'Peer Interviews', description: 'One-to-one interview schedules, sessions and feedback.', icon: CalendarDays, path: '/student/interview' },
  { key: 'ai_interviews', label: 'AI Interviews', description: 'AI interview assignments, practice rooms and reports.', icon: Bot, path: '/student/ai-interviews' },
  { key: 'assessments', label: 'Assessments', description: 'Available tests, assessment history, reports and feedback.', icon: ClipboardList, path: '/student/assessments' },
  { key: 'learning', label: 'Learning Modules', description: 'Semester learning content, lessons and topic progress.', icon: BookOpen, path: '/student/learning' },
  { key: 'prep_coding', label: 'PrepCoding', description: 'Coding problems, daily challenge and practice submissions.', icon: ListChecks, path: '/problems' },
  { key: 'resume', label: 'Resume Builder', description: 'Create and manage a placement-ready resume.', icon: UserCog, path: '/student/resume' },
  { key: 'prep_coins', label: 'Prep Score & Coins', description: 'Prep Coin wallet, balance, pricing and transaction history.', icon: Coins, path: '/student/wallet' },
]);

export const ALL_STUDENT_FEATURES = STUDENT_FEATURE_CATALOG.map((feature) => feature.key);

export function normalizeStudentAccess(access, accessScope = 'full') {
  if (accessScope === 'assessment_only') return { mode: 'custom', features: ['assessments'] };
  if (!access || access.mode !== 'custom') return { mode: 'all', features: [...ALL_STUDENT_FEATURES] };
  const allowed = new Set(ALL_STUDENT_FEATURES);
  return { mode: 'custom', features: [...new Set((access.features || []).filter((key) => allowed.has(key)))] };
}

export function hasStudentFeature(user, feature) {
  return normalizeStudentAccess(user?.featureAccess, user?.accessScope).features.includes(feature);
}

export function firstStudentFeaturePath(user) {
  const enabled = new Set(normalizeStudentAccess(user?.featureAccess, user?.accessScope).features);
  return STUDENT_FEATURE_CATALOG.find((feature) => enabled.has(feature.key))?.path || '/student/profile';
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
  if (pathname.startsWith('/student/dashboard') || pathname.startsWith('/student/challenges')) return 'dashboard';
  return null;
}
