export const isUniversityDeployment = import.meta.env?.VITE_PEERPREP_DEPLOYMENT_ROLE === 'university';

export function moduleForPath(pathname = '') {
  const path = pathname.split('?')[0];
  if (/^\/(?:admin|student)\/ai-interviews(?:\/|$)|^\/coordinator\/ai-interviews(?:\/|$)/.test(path)) return 'interviews';
  if (/^\/(?:admin|student)\/learning(?:\/|$)|^\/coordinator\/subjects(?:\/|$)/.test(path)) return 'learning';
  if (/^\/(?:admin|coordinator)\/library(?:\/|$)|^\/(?:admin|coordinator)\/compiler(?:\/|$)|^\/problems(?:\/|$)/.test(path)) return 'questions';
  if (/^\/(?:admin|coordinator)\/assessment(?:\/|-|$)|^\/student\/assessments?(?:\/|-|$)|^\/(?:assessments|assessment-reports|assessment-history)(?:\/|$)/.test(path)) return 'assessments';
  if (/^\/(?:admin|coordinator)\/(?:event|interviews|feedback)(?:\/|$)|^\/student\/(?:interview|session|feedback)(?:\/|$)/.test(path)) return 'events';
  if (/^\/student\/resume(?:\/|$)|^\/(?:admin|coordinator)\/students\/[^/]+\/resume(?:\/|$)/.test(path)) return 'resumes';
  if (/^\/(?:admin|student)\/(?:analysis|analytics)(?:\/|$)/.test(path)) return 'analysis';
  return null;
}

export function moduleEnabled(permissions, moduleName) {
  if (!permissions) return !isUniversityDeployment;
  if (moduleName === 'coding') return permissions.coding === undefined
    ? permissions.questions === true : permissions.coding === true;
  return permissions[moduleName] === true;
}

export function pathAllowed(pathname, permissions, role = 'admin', search = '', { university = isUniversityDeployment } = {}) {
  if (!university) return true;
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
  } else if (new URLSearchParams(search || pathname.split('?')[1] || '').get('source') === 'coding') {
    return moduleEnabled(permissions, 'questions');
  }
  return true;
}
