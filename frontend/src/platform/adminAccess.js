import { isUniversityDeployment } from './universityPermissions';

export const isLimitedUniversityAdmin = (user) => isUniversityDeployment && user?.role === 'admin' && user?.adminAccess === 'limited';
export const isUniversitySpoc = (user) => isUniversityDeployment && user?.role === 'admin' && user?.adminAccess !== 'limited';

export const spocBlockedMockPath = (path) => /^\/admin\/prepmock\/(?:create|companies|library)(?:\/|$)/.test(path)
  || /^\/admin\/prepmock\/[^/]+\/edit(?:\/|$)/.test(path);

export const limitedAdminBlockedPath = (path) => /^\/admin\/(?:onboarding|coordinators|students\/bulk-lists|settings\/(?:student-access|bulk-uploads|promote-students)|prepmock\/upload-students)(?:\/|$)/.test(path);
