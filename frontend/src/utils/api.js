import { getJudge0LanguageId } from '../admin/compiler/compilerUtils';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

/**
 * SECURITY: JWT now stored in HttpOnly cookies instead of localStorage
 * 
 * WHY SAFE: Protects against XSS token theft. HttpOnly cookies cannot be
 * accessed via JavaScript, so even if XSS vulnerability exists, tokens are safe.
 * 
 * MIGRATION: Kept backwards compatibility - still reads from localStorage
 * during transition period. Remove localStorage token on logout.
 */

// Simple in-memory cache for GET requests (5 minute TTL)
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(path, method) {
  return `${method}:${path}`;
}

function getFromCache(key) {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  apiCache.delete(key);
  return null;
}

function setCache(key, data) {
  apiCache.set(key, { data, timestamp: Date.now() });
  
  // Clean old cache entries (keep cache size manageable)
  if (apiCache.size > 50) {
    const entries = Array.from(apiCache.entries());
    const sortedByAge = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    // Remove oldest 10 entries
    sortedByAge.slice(0, 10).forEach(([key]) => apiCache.delete(key));
  }
}

// Clear cache (useful after mutations)
export function clearApiCache(pathPattern) {
  if (pathPattern) {
    // Clear specific pattern
    for (const key of apiCache.keys()) {
      if (key.includes(pathPattern)) {
        apiCache.delete(key);
      }
    }
  } else {
    // Clear all
    apiCache.clear();
  }
}

// Clear legacy localStorage token if it exists
export function clearLegacyToken() {
  localStorage.removeItem('token');
}

// Kept for backwards compatibility during migration
export function setToken(t) {
  void t;
  // No longer storing in localStorage for security
  // Token is now in HttpOnly cookie set by server
  clearLegacyToken();
}

async function request(path, {
  method = 'GET',
  body,
  headers = {},
  formData,
  skipCache = false,
  timeoutMs = 15000,
} = {}) {
  // Check cache for GET requests
  const cacheKey = getCacheKey(path, method);
  if (method === 'GET' && !skipCache) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  const opts = { 
    method, 
    headers: { ...headers },
    // SECURITY: Send cookies with every request
    credentials: 'include' // This sends HttpOnly cookies
  };
  
  if (formData) {
    opts.body = formData;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  
  // No longer sending Authorization header - JWT is in cookie
  // if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  
  const url = `${API_BASE}${path}`;
  
  let controller = null;
  let timeoutId = null;

  try {
    if (timeoutMs && timeoutMs > 0) {
      // Default timeout keeps regular requests responsive, but callers can disable it.
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      opts.signal = controller.signal;
    }
    
    const res = await fetch(url, opts);
    
    if (!res.ok) {
      let err;
      try { 
        const j = await res.json(); 
        // /auth/me returns 401 when not logged in - treat as normal state
        if (res.status === 401 && path === '/auth/me') {
          err = new Error('Not authenticated');
        } else {
          err = new Error(j.error || j.message || JSON.stringify(j));
        }
        err.response = { status: res.status, data: j };
      } catch { 
        err = new Error(res.statusText);
        err.response = { status: res.status };
      }
      throw err;
    }
    const ct = res.headers.get('content-type') || '';
    const result = ct.includes('application/json') ? await res.json() : await res.text();
    
    // Cache GET requests
    if (method === 'GET' && !skipCache) {
      setCache(cacheKey, result);
    }
    
    // Clear relevant cache on mutations
    if (method !== 'GET') {
      clearApiCache(path.split('/')[1]); // Clear cache for the resource type
    }
    
    return result;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out. Please check your connection and try again.');
      timeoutErr.response = { status: 0 };
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export const api = {
  updateEventJoinDisable: (eventId, joinDisabled, joinDisableTime) => request(`/events/${eventId}/join-disable`, { method: 'PATCH', body: { joinDisabled, joinDisableTime } }),
  // Auth (unified)
  me: () => request('/auth/me'),
  updateMyProfile: (body) => request('/auth/me', { method: 'PUT', body }),
  updateMyAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request('/auth/me/avatar', { method: 'PUT', formData: fd });
  },
  getStudentActivity: () => request('/auth/activity'),
  debugStudentActivity: () => request('/auth/activity/debug'),
  getStudentStats: () => request('/auth/stats'),
  login: (identifier, password) => request('/auth/login', { method: 'POST', body: { identifier, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) => request('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword, confirmPassword: newPassword } }),
  changeStudentPassword: (currentPassword, newPassword, confirmPassword) => request('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword, confirmPassword } }),
  changeAdminPassword: (currentPassword, newPassword, confirmPassword) => request('/auth/password/admin-change', { method: 'POST', body: { currentPassword, newPassword, confirmPassword } }),
  requestPasswordReset: (email) => request('/auth/password/request-reset', { method: 'POST', body: { email } }),
  resetPassword: (token, newPassword) => request('/auth/password/reset', { method: 'POST', body: { token, newPassword } }),

  // Notifications
  getNotifications: () => request('/notifications', { skipCache: true }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
  clearAllNotifications: () => request('/notifications/clear-all', { method: 'DELETE' }),

  // Announcements
  createAnnouncement: (body) => request('/admin/announcements/create', { method: 'POST', body }),
  listAnnouncementsAdmin: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) qs.append(key, value);
    });
    return request(`/admin/announcements${qs.toString() ? `?${qs.toString()}` : ''}`, { skipCache: true });
  },
  updateAnnouncement: (id, body) => request(`/admin/announcements/${id}`, { method: 'PUT', body }),
  deleteAnnouncement: (id) => request(`/admin/announcements/${id}`, { method: 'DELETE' }),
  listStudentAnnouncements: () => request('/student/announcements', { skipCache: true }),

  // Company Insights (Admin)
  listCompanyBenchmarks: () => request('/admin/company-insights', { skipCache: true }),
  createCompanyBenchmark: (body) => request('/admin/company-insights', { method: 'POST', body }),
  updateCompanyBenchmark: (id, body) => request(`/admin/company-insights/${id}`, { method: 'PUT', body }),
  deleteCompanyBenchmark: (id) => request(`/admin/company-insights/${id}`, { method: 'DELETE' }),
  uploadCompanyBenchmarks: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/admin/company-insights/upload', { method: 'POST', formData: fd });
  },
  downloadCompanyBenchmarkTemplate: () => request('/admin/company-insights/template', { skipCache: true }),

  // Student Analysis
  getStudentAnalysis: (forceRefresh = false) =>
    request(`/student/analysis${forceRefresh ? '?refresh=1' : ''}`, { skipCache: true }),
  listStudentCompanies: () => request('/student/analysis/companies', { skipCache: true }),
  getCompanyReadiness: (companyId, forceRefresh = false) =>
    request(
      `/student/analysis/readiness?companyId=${companyId}${forceRefresh ? '&refresh=1' : ''}`,
      { skipCache: true }
    ),

  // Students
  listAllStudents: (search = '', sortOrder = 'asc') => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (sortOrder) params.append('sortOrder', sortOrder);
    const queryString = params.toString();
    return request(`/students/list${queryString ? '?' + queryString : ''}`);
  },
  listAllSpecialStudents: (search = '', sortOrder = 'asc') => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (sortOrder) params.append('sortOrder', sortOrder);
    const queryString = params.toString();
    return request(`/students/special${queryString ? '?' + queryString : ''}`);
  },
  listSpecialStudentsByEvent: (eventId) => request(`/students/special/${eventId}`),
  getStudentByIdForAdmin: (studentId) => request(`/students/${studentId}`),
  getStudentActivityByAdmin: (studentId) => request(`/students/${studentId}/activity`),
  getStudentStatsByAdmin: (studentId) => request(`/students/${studentId}/stats`),
  getStudentVideosWatchedByAdmin: (studentId) => request(`/students/${studentId}/videos-watched`),
  getStudentCoursesEnrolledByAdmin: (studentId) => request(`/students/${studentId}/courses-enrolled`),
  checkStudentsCsv: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/students/check', { method: 'POST', formData: fd });
  },
  uploadStudentsCsv: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/students/upload', { method: 'POST', formData: fd });
  },
  createStudent: (body) => request('/students/create', { method: 'POST', body }),
  updateStudent: (studentId, body) => request(`/students/${studentId}`, { method: 'PUT', body }),
  deleteStudent: (studentId) => request(`/students/${studentId}`, { method: 'DELETE' }),
  exportStudentsCsv: async () => {
    // Direct download - fetch the CSV and trigger download
    const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
    const res = await fetch(`${API_BASE}/students/export`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to export students');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Coordinators
  listAllCoordinators: (search = '') => request(`/coordinators/list${search ? '?search=' + encodeURIComponent(search) : ''}`),
  createCoordinator: (body) => request('/coordinators/create', { method: 'POST', body }),
  updateCoordinator: (coordinatorId, body) => request(`/coordinators/${coordinatorId}`, { method: 'PUT', body }),
  deleteCoordinator: (coordinatorId) => request(`/coordinators/${coordinatorId}`, { method: 'DELETE' }),

  // Events
  listEvents: () => request('/events'),
  createEvent: ({ name, description, startDate, endDate, template }) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', description);
    if (startDate) fd.append('startDate', startDate);
    if (endDate) fd.append('endDate', endDate);
    if (template) fd.append('template', template);
    return request('/events', { method: 'POST', formData: fd });
  },
  checkSpecialEventCsv: (file) => {
    const fd = new FormData();
    fd.append('csv', file);
    return request('/events/special/check-csv', { method: 'POST', formData: fd });
  },
  createSpecialEvent: ({ name, description, startDate, endDate, template, csv }) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', description);
    if (startDate) fd.append('startDate', startDate);
    if (endDate) fd.append('endDate', endDate);
    if (template) fd.append('template', template);
    if (csv) fd.append('csv', csv);
    return request('/events/special', { method: 'POST', formData: fd });
  },
  joinEvent: (eventId) => request(`/events/${eventId}/join`, { method: 'POST' }),
  exportParticipantsCsv: (eventId) => request(`/events/${eventId}/participants.csv`),
  updateEventTemplate: (eventId, file) => {
    const fd = new FormData();
    fd.append('template', file);
    return request(`/events/${eventId}/template`, { method: 'POST', formData: fd });
  },
  deleteEventTemplate: (eventId) => request(`/events/${eventId}/template`, { method: 'DELETE' }),
  getEvent: (eventId) => request(`/events/${eventId}`),
  getEventAnalytics: (eventId) => request(`/events/${eventId}/analytics`),
  getEventTemplateUrl: (eventId) => request(`/events/${eventId}/template-url`),

  // Assessments (Admin)
  createAssessment: (body) => request('/admin/assessment/create', { method: 'POST', body }),
  listAssessments: () => request('/admin/assessment/list'),
  getAssessmentById: (id) => request(`/admin/assessment/${id}`),
  updateAssessment: (id, body) => request(`/admin/assessment/${id}`, { method: 'PUT', body }),
  deleteAssessment: (id) => request(`/admin/assessment/${id}`, { method: 'DELETE' }),
  getAssessmentReports: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    });
    return request(`/admin/assessment/reports${qs.toString() ? `?${qs.toString()}` : ''}`);
  },
  exportAssessmentReports: async (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    });
    const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
    const res = await fetch(`${API_BASE}/admin/assessment/reports/export${qs.toString() ? `?${qs.toString()}` : ''}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to export report');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assessment-report.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  getAssessmentRulesAdmin: () => request('/admin/assessment/rules', { skipCache: true }),
  saveAssessmentRulesAdmin: (body) => request('/admin/assessment/rules', { method: 'PUT', body }),

  // Assessments (Student)
  listStudentAssessments: () => request('/student/assessments'),
  getStudentAssessmentDashboard: () => request('/student/assessment-dashboard'),
  getStudentAssessment: (id) => request(`/student/assessment/${id}`),
  submitStudentAssessment: (body) => request('/student/assessment/submit', { method: 'POST', body }),
  getStudentAssessmentRules: () => request('/student/assessment/rules', { skipCache: true }),

  // Pairing

  listPairs: (eventId) => request(`/pairing/${eventId}`),
  getPairDetails: (pairId) => request(`/pairing/pair/${pairId}`),
  setPairMeetingLink: (pairId, meetingLink) => request(`/pairing/pair/${pairId}/link`, { method: 'POST', body: { meetingLink } }),

  // Scheduling
  proposeSlots: (pairId, slots) => request(`/schedule/${pairId}/propose`, { method: 'POST', body: { slots } }),
  confirmSlot: (pairId, scheduledAt, meetingLink) => request(`/schedule/${pairId}/confirm`, { method: 'POST', body: { scheduledAt, meetingLink } }),
  rejectSlots: (pairId) => request(`/schedule/${pairId}/reject`, { method: 'POST' }),

  // Feedback
  submitFeedback: (pairId, ratings, suggestions) => request('/feedback/submit', { method: 'POST', body: { pairId, ratings, suggestions } }),
  exportFeedbackCsv: (eventId) => request(`/feedback/event/${eventId}.csv`),
  listFeedback: (qs='') => request(`/feedback/admin/list${qs ? '?' + qs : ''}`),
  exportFilteredFeedbackCsv: (qs='') => request(`/feedback/admin/export.csv${qs ? '?' + qs : ''}`),
  listCoordinatorFeedback: (qs='') => request(`/feedback/coordinator/list${qs ? '?' + qs : ''}`),
  exportCoordinatorFeedbackCsv: (qs='') => request(`/feedback/coordinator/export.csv${qs ? '?' + qs : ''}`),
  myFeedback: (eventId) => request(`/feedback/mine${eventId ? ('?eventId=' + eventId) : ''}`),
  feedbackForMe: (eventId) => request(`/feedback/for-me${eventId ? ('?eventId=' + eventId) : ''}`),

  // Semesters, Subjects, Chapters, and Topics (Coordinator only)
  listSemesters: () => request('/subjects'),
  createSemester: (semesterName, semesterDescription) => request('/subjects', { method: 'POST', body: { semesterName, semesterDescription } }),
  updateSemester: (id, data) => request(`/subjects/${id}`, { method: 'PUT', body: data }),
  deleteSemester: (id) => request(`/subjects/${id}`, { method: 'DELETE' }),
  reorderSemesters: (semesterIds) => request('/subjects/reorder', { method: 'POST', body: { semesterIds } }),
  cleanupDuplicateSemesters: () => request('/subjects/cleanup-duplicates', { method: 'POST' }),
  
  addSubject: (semesterId, subjectName, subjectDescription) => request(`/subjects/${semesterId}/subjects`, { method: 'POST', body: { subjectName, subjectDescription } }),
  updateSubject: (semesterId, subjectId, data) => request(`/subjects/${semesterId}/subjects/${subjectId}`, { method: 'PUT', body: data }),
  deleteSubject: (semesterId, subjectId) => request(`/subjects/${semesterId}/subjects/${subjectId}`, { method: 'DELETE' }),
  reorderSubjects: (semesterId, subjectIds) => request(`/subjects/${semesterId}/subjects/reorder`, { method: 'POST', body: { subjectIds } }),
  
  addChapter: (semesterId, subjectId, chapterName, importanceLevel) => request(`/subjects/${semesterId}/subjects/${subjectId}/chapters`, { method: 'POST', body: { chapterName, importanceLevel } }),
  updateChapter: (semesterId, subjectId, chapterId, data) => request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}`, { method: 'PUT', body: data }),
  deleteChapter: (semesterId, subjectId, chapterId) => request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}`, { method: 'DELETE' }),
  reorderChapters: (semesterId, subjectId, chapterIds) => request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/reorder`, { method: 'POST', body: { chapterIds } }),
  
  addTopic: (semesterId, subjectId, chapterId, formData) => {
    return request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics`, { method: 'POST', formData });
  },
  updateTopic: (semesterId, subjectId, chapterId, topicId, formData) => {
    return request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics/${topicId}`, { method: 'PUT', formData });
  },
  deleteTopic: (semesterId, subjectId, chapterId, topicId) => request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics/${topicId}`, { method: 'DELETE' }),
  reorderTopics: (semesterId, subjectId, chapterId, topicIds) => request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics/reorder`, { method: 'POST', body: { topicIds } }),

  // Learning (Student)
  getAllSemestersForStudent: () => request('/learning/semesters'),
  getCoordinatorSubjects: (coordinatorId) => request(`/learning/coordinator/${coordinatorId}/subjects`),
  getSubjectDetails: (semesterId, subjectId) => request(`/learning/semester/${semesterId}/subject/${subjectId}`),
  startVideoTracking: (topicId, semesterId, subjectId, chapterId, coordinatorId) =>
    request(`/learning/topic/${topicId}/start`, {
      method: 'POST',
      body: { semesterId, subjectId, chapterId, coordinatorId }
    }),
  updateTopicProgress: (semesterId, subjectId, chapterId, topicId, videoWatchedSeconds, coordinatorId) => 
    request(`/learning/semester/${semesterId}/subject/${subjectId}/chapter/${chapterId}/topic/${topicId}/progress`, { 
      method: 'POST', 
      body: { videoWatchedSeconds, coordinatorId } 
    }),
  trackWatchTime: (topicId, data) =>
    request(`/learning/topic/${topicId}/track-watch-time`, {
      method: 'POST',
      body: data
    }),
  getTopicProgress: (topicId) => request(`/learning/topic/${topicId}/progress`),
  getSubjectProgress: (subjectId) => request(`/learning/subject/${subjectId}/progress`),
  getStudentProgress: () => request('/learning/progress'),
  
  // Learning Analytics (Admin/Coordinator)
  getSubjectAnalytics: (semesterId, subjectId) => request(`/learning/analytics/subject/${semesterId}/${subjectId}`),

  markTopicComplete: (topicId, semesterId, subjectId, chapterId, coordinatorId) =>
    request(`/learning/topic/${topicId}/complete`, {
      method: 'POST',
      body: { semesterId, subjectId, chapterId, coordinatorId }
    }),
  markTopicIncomplete: (topicId, semesterId, subjectId, chapterId, coordinatorId) =>
    request(`/learning/topic/${topicId}/incomplete`, {
      method: 'POST',
      body: { semesterId, subjectId, chapterId, coordinatorId }
    }),
  
  // Activity Tracking
  getActivities: (queryString) => request(`/activity${queryString ? '?' + queryString : ''}`),
  getActivityStats: () => request('/activity/stats'),
  logActivity: ({ actionType, targetType, targetId, description, changes, metadata }) => 
    request('/activity', { 
      method: 'POST', 
      body: { actionType, targetType, targetId, description, changes, metadata } 
    }),

  // Email Templates (Admin)
  listEmailTemplates: (search = '') => request(`/email-templates${search ? '?search=' + encodeURIComponent(search) : ''}`),
  getEmailTemplate: (id) => request(`/email-templates/${id}`),
  createEmailTemplate: (body) => request('/email-templates', { method: 'POST', body }),
  updateEmailTemplate: (id, body) => request(`/email-templates/${id}`, { method: 'PUT', body }),
  deleteEmailTemplate: (id) => request(`/email-templates/${id}`, { method: 'DELETE' }),

  // Join Requests
  submitJoinRequest: (data) => request('/join/submit', { method: 'POST', body: data }),
  checkJoinStatus: (email) => request(`/join/status?email=${encodeURIComponent(email)}`),
  listJoinRequests: (queryString) => request(`/join/list${queryString ? '?' + queryString : ''}`),
  approveJoinRequest: (requestId, data) => request(`/join/${requestId}/approve`, { method: 'POST', body: data }),
  rejectJoinRequest: (requestId, reason) => request(`/join/${requestId}/reject`, { method: 'POST', body: { reason } }),
  // Compiler Module
  getCompilerOverview: () => request('/compiler/overview', { skipCache: true }),
  listCompilerProblems: ({ search = '', difficulty = '', tags = '', status = '', visibility = '', sortBy = 'updatedAt', sortOrder = 'desc', page = 1, limit = 8 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (difficulty) params.append('difficulty', difficulty);
    if (tags) params.append('tags', tags);
    if (status) params.append('status', status);
    if (visibility) params.append('visibility', visibility);
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);
    params.append('page', String(page));
    params.append('limit', String(limit));
    return request(`/compiler/problems?${params.toString()}`, { skipCache: true });
  },
  createCompilerProblem: (formData) => request('/compiler/problems', { method: 'POST', formData }),
  updateCompilerProblem: (problemId, formData) => request(`/compiler/problems/${problemId}`, { method: 'PUT', formData }),
  updateCompilerProblemStatus: (problemId, status) => {
    const fd = new FormData();
    fd.append('status', status);
    return request(`/compiler/problems/${problemId}/status`, { method: 'PATCH', formData: fd });
  },
  deleteCompilerProblem: (problemId) => request(`/compiler/problems/${problemId}`, { method: 'DELETE' }),
  getCompilerProblem: (problemId) => request(`/compiler/problems/${problemId}`, { skipCache: true }),
  runCompilerPreview: (formData) => request('/compiler/problems/preview/run', { method: 'POST', formData }),
  runCompilerProblem: (problemId, { language, sourceCode, customInput = '' }) => {
    const fd = new FormData();
    fd.append('language', language);
    fd.append('sourceCode', sourceCode);
    fd.append('customInput', customInput);
    return request(`/compiler/problems/${problemId}/run`, { method: 'POST', formData: fd });
  },
  submitCompilerProblem: (problemId, { language, sourceCode }) => {
    const fd = new FormData();
    fd.append('language', language);
    fd.append('sourceCode', sourceCode);
    return request(`/compiler/problems/${problemId}/submit`, {
      method: 'POST',
      formData: fd,
      timeoutMs: 0,
    });
  },
  listCompilerSubmissions: ({ search = '', status = '', language = '', mode = '', page = 1, limit = 15 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (language) params.append('language', language);
    if (mode) params.append('mode', mode);
    params.append('page', String(page));
    params.append('limit', String(limit));
    return request(`/compiler/submissions?${params.toString()}`, { skipCache: true });
  },
  getCompilerAnalytics: ({ studentId = '', problemId = '', dateFrom = '', dateTo = '' } = {}) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (problemId) params.append('problemId', problemId);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    const query = params.toString();
    return request(`/compiler/analytics${query ? `?${query}` : ''}`, { skipCache: true });
  },
  getCompilerStudentAnalytics: (studentId) => request(`/compiler/student/${studentId}`, { skipCache: true }),
  getCompilerAnalyticsOverview: () => request('/compiler/analytics/overview', { skipCache: true }),
  getCompilerProblemAnalytics: (problemId) => request(`/compiler/analytics/problem/${problemId}`, { skipCache: true }),
  listStudentProblems: ({ search = '', difficulty = '', tags = '', sortBy = 'acceptanceRate', sortOrder = 'desc', page = 1, limit = 10 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (difficulty) params.append('difficulty', difficulty);
    if (tags) params.append('tags', tags);
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);
    params.append('page', String(page));
    params.append('limit', String(limit));
    return request(`/compiler/problems?${params.toString()}`, { skipCache: true });
  },
  getStudentProblem: (problemId) => request(`/compiler/problems/${problemId}`, { skipCache: true }),
  runStudentProblem: (problemId, { language, sourceCode, customInput = '', assessmentId = '' }) => {
    return request('/compiler/run', {
      method: 'POST',
      body: {
        problemId,
        source_code: sourceCode,
        language_id: getJudge0LanguageId(language),
        stdin: customInput,
        ...(assessmentId ? { assessmentId } : {}),
      },
    });
  },
  getStudentExpectedOutput: (problemId, { language = '', customInput = '', assessmentId = '' } = {}) => {
    return request(`/compiler/problems/${problemId}/expected`, {
      method: 'POST',
      body: {
        language,
        stdin: customInput,
        ...(assessmentId ? { assessmentId } : {}),
      },
    });
  },
  submitStudentProblem: (problemId, { language, sourceCode, assessmentId = '' }) => {
    return request('/compiler/submit', {
      method: 'POST',
      body: {
        problemId,
        source_code: sourceCode,
        language_id: getJudge0LanguageId(language),
        ...(assessmentId ? { assessmentId } : {}),
      },
      timeoutMs: 0,
    });
  },
  listStudentProblemSubmissions: (problemId, { mode = '', page = 1, limit = 10 } = {}) => {
    const params = new URLSearchParams();
    if (mode) params.append('mode', mode);
    params.append('page', String(page));
    params.append('limit', String(limit));
    return request(`/compiler/problems/${problemId}/submissions?${params.toString()}`, { skipCache: true });
  },
};
















