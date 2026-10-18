export const isUniversityDeployment = import.meta.env?.VITE_PEERPREP_DEPLOYMENT_ROLE === 'university';
export const isControlDeployment = import.meta.env?.VITE_PEERPREP_DEPLOYMENT_ROLE === 'control';
// QuickPreps are designed only by the super admin (central platform) or a standalone install's admin.
export const canAuthorQuickPrep = !isUniversityDeployment;
const QUICKPREP_ADMIN_PATH = /^\/admin\/(?:quests|quickprep)(?:\/|$)/;
// Student-reported interview companies are moderated once, centrally (or by a standalone install's admin).
export const canManageInterviewCompanies = !isUniversityDeployment;
export const SUGGESTED_COMPANIES_PATH = '/admin/settings/suggested-companies';
const SUGGESTED_COMPANIES_ADMIN_PATH = /^\/admin\/settings\/suggested-companies(?:\/|$)/;

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
  if (QUICKPREP_ADMIN_PATH.test(pathname) || SUGGESTED_COMPANIES_ADMIN_PATH.test(pathname)) return false;
  if (!permissions) return false;
  if (pathname.startsWith('/admin/platform')) return false;
  const moduleName = moduleForPath(pathname);
  if (!moduleName) return true;
  if (moduleName !== 'analysis') return moduleEnabled(permissions, moduleName);
  const student = role === 'student';
  const contributors = student ? ['questions', 'assessments', 'interviews', 'learning'] : ['questions', 'assessments', 'learning'];
  if (!contributors.some((name) => moduleEnabled(permissions, name))) return false;
  if (student) {
    const section = /^\/student\/(?:analysis|analytics)\/([^/]+)/.exec(pathname)?.[1];
    if (section === 'coding' || section === 'dsa') return moduleEnabled(permissions, 'questions');
    if (section === 'assessments' || section === 'assessment') return moduleEnabled(permissions, 'assessments');
    if (section === 'interviews' || section === 'interview') return moduleEnabled(permissions, 'interviews');
    if (section === 'learning') return moduleEnabled(permissions, 'learning');
    if (section === 'overview' || section === 'placement' || section === 'readiness') return contributors.every((name) => moduleEnabled(permissions, name));
  } else if (/^\/admin\/analysis\/assessments(?:\/|$)/.test(pathname)) {
    return moduleEnabled(permissions, 'assessments');
  } else if (new URLSearchParams(search || pathname.split('?')[1] || '').get('source') === 'coding') {
    return moduleEnabled(permissions, 'questions');
  }
  return true;
}
