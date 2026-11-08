const universityPath = typeof window !== 'undefined' && /^\/u\/[a-z0-9][a-z0-9-]{1,62}(?:\/|$)/.test(window.location.pathname);
export const isUniversityDeployment = universityPath;
export const isControlDeployment = !universityPath;
// QuickPreps are designed only by the super admin (central platform) or a standalone install's admin.
export const canAuthorQuickPrep = !isUniversityDeployment;
const QUICKPREP_ADMIN_PATH = /^\/admin\/(?:quests|quickprep)(?:\/|$)/;
// Student-reported interview companies are moderated once, centrally (or by a standalone install's admin).
export const canManageInterviewCompanies = !isUniversityDeployment;
export const SUGGESTED_COMPANIES_PATH = '/admin/settings/suggested-companies';
const SUGGESTED_COMPANIES_ADMIN_PATH = /^\/admin\/settings\/suggested-companies(?:\/|$)/;
// The Prep Score formula and its values are set once, by the Master Admin, for every university.
export const canAdjustPrepScore = !isUniversityDeployment;
export const PREP_SCORE_ADJUSTMENT_PATH = '/admin/settings/prep-score-adjustment';
export const PREP_COIN_PRICING_PATH = '/admin/prep-coins/pricing';
export const LEGACY_PREP_COIN_PRICING_PATH = '/admin/settings/prep-coin-pricing';
// Master Admin only: the Prep Score policy and the whole Prep Coin console (universities use /admin/wallet).
const MASTER_ONLY_SETTINGS_PATH = /^\/admin\/(?:settings\/(?:prep-score-adjustment|prep-coin-pricing)|prep-coins)(?:\/|$)/;

export function moduleForPath(pathname = '') {
  const path = pathname.split('?')[0];
  if (/^\/student\/challenges(?:\/|$)/.test(path)) return 'challenges';
  if (/^\/student\/(?:quests|quickprep)(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:admin|student)\/ai-interviews(?:\/|$)|^\/coordinator\/ai-interviews(?:\/|$)/.test(path)) return 'interviews';
  if (/^\/(?:admin|student)\/learning(?:\/|$)|^\/coordinator\/subjects(?:\/|$)/.test(path)) return 'learning';
  if (/^\/(?:admin|coordinator)\/library(?:\/|$)|^\/(?:admin|coordinator)\/compiler(?:\/|$)|^\/admin\/(?:quests|quickprep)(?:\/|$)|^\/problems(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:admin|coordinator)\/assessment(?:\/|-|$)|^\/student\/assessments?(?:\/|-|$)|^\/(?:assessments|assessment-reports|assessment-history)(?:\/|$)/.test(path)) return 'assessments';
  if (/^\/(?:admin|coordinator)\/(?:event|interviews|feedback)(?:\/|$)|^\/student\/(?:interview|session|feedback)(?:\/|$)/.test(path)) return 'events';
  if (/^\/student\/resume(?:\/|$)|^\/(?:admin|coordinator)\/students\/[^/]+\/resume(?:\/|$)/.test(path)) return 'resumes';
  if (/^\/(?:admin|student)\/(?:analysis|analytics)(?:\/|$)/.test(path)) return 'analysis';
  return null;
}

export function moduleEnabled(permissions, moduleName) {
  if (!permissions) return !isUniversityDeployment;
  if (moduleName === 'challenges') return ['questions', 'learning', 'assessments', 'interviews', 'events'].some(name => permissions[name] === true);
  if (moduleName === 'coding') return permissions.coding === undefined
    ? permissions.questions === true : permissions.coding === true;
  return permissions[moduleName] === true;
}

export function pathAllowed(pathname, permissions, role = 'admin', search = '', { university = isUniversityDeployment } = {}) {
  if (!university) return true;
  // University admins neither see nor manage QuickPreps; the super admin designs them centrally.
  if (QUICKPREP_ADMIN_PATH.test(pathname) || SUGGESTED_COMPANIES_ADMIN_PATH.test(pathname) || MASTER_ONLY_SETTINGS_PATH.test(pathname)) return false;
  if (!permissions) return false;
  if (pathname.startsWith('/admin/platform') || pathname.startsWith('/admin/universities')) return false;
  const moduleName = moduleForPath(pathname);
  if (!moduleName) return true;
  if (moduleName !== 'analysis') return moduleEnabled(permissions, moduleName);
  const student = role === 'student';
  // A student's analysis is one page that shows only the parts their university and admin allow
  // (the server enforces that too), so any contributing module opens it, at any section address.
  const contributors = student ? ['questions', 'assessments', 'interviews', 'events', 'learning'] : ['questions', 'assessments', 'learning'];
  if (!contributors.some((name) => moduleEnabled(permissions, name))) return false;
  if (student) return true;
  if (/^\/admin\/analysis\/assessments(?:\/|$)/.test(pathname)) {
    return moduleEnabled(permissions, 'assessments');
  } else if (new URLSearchParams(search || pathname.split('?')[1] || '').get('source') === 'coding') {
    return moduleEnabled(permissions, 'questions');
  }
  return true;
}
