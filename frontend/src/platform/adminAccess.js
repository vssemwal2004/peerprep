import { isUniversityDeployment } from './universityPermissions';

export const isLimitedUniversityAdmin = (user) => isUniversityDeployment && user?.role === 'admin' && user?.adminAccess === 'limited';

export const limitedAdminBlockedPath = (path) => /^\/admin\/(?:onboarding|coordinators|students\/bulk-lists|settings\/(?:student-access|bulk-uploads|promote-students))(?:\/|$)/.test(path);
