import { getJudge0LanguageId } from '../admin/compiler/compilerUtils';
import { getApiBase } from './apiBase';

const API_BASE = getApiBase();

/**
 * SECURITY: JWT now stored in HttpOnly cookies instead of localStorage
 * 
 * WHY SAFE: Protects against XSS token theft. HttpOnly cookies cannot be
 * accessed via JavaScript, so even if XSS vulnerability exists, tokens are safe.
 * 
 * MIGRATION: Kept backwards compatibility - still reads from localStorage
 * during transition period. Remove localStorage token on logout.
 */

// Production-safe request budget and cache controls.
// This keeps dashboard screens fast while preventing repeated GET storms.
const apiCache = new Map();
const inFlightRequests = new Map();
const requestQueue = [];
let activeRequests = 0;

const CACHE_TTL = Number(import.meta.env.VITE_API_CACHE_TTL_MS || 2 * 60 * 1000);
const STALE_TTL = Number(import.meta.env.VITE_API_STALE_TTL_MS || 10 * 60 * 1000);
const MAX_CACHE_ENTRIES = Number(import.meta.env.VITE_API_CACHE_MAX_ENTRIES || 120);
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000);
const MAX_CONCURRENT_REQUESTS = Number(import.meta.env.VITE_API_MAX_CONCURRENT || 8);
const REQUEST_QUEUE_TIMEOUT_MS = Number(import.meta.env.VITE_API_QUEUE_TIMEOUT_MS || 8000);

function getCacheKey(path, method) {
  return `${method}:${path}`;
}

function getCacheEntry(key) {
  const cached = apiCache.get(key);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  const ttlMs = cached.ttlMs ?? CACHE_TTL;
  if (age < ttlMs) {
    return { data: cached.data, state: 'fresh' };
  }

  if (age < ttlMs + STALE_TTL) {
    return { data: cached.data, state: 'stale' };
  }

  apiCache.delete(key);
  return null;
}

function setCache(key, data, ttlMs = CACHE_TTL) {
  apiCache.set(key, { data, timestamp: Date.now(), ttlMs });
  
  // Clean old cache entries (keep cache size manageable)
  if (apiCache.size > MAX_CACHE_ENTRIES) {
    const entries = Array.from(apiCache.entries());
    const sortedByAge = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    sortedByAge.slice(0, Math.max(10, Math.ceil(MAX_CACHE_ENTRIES * 0.15))).forEach(([entryKey]) => apiCache.delete(entryKey));
  }
}

function createQueueTimeoutError() {
  const err = new Error('The platform is busy. Please retry in a few seconds.');
  err.response = { status: 429 };
  return err;
}

function drainRequestQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
    const item = requestQueue.shift();
    clearTimeout(item.timeoutId);
    activeRequests++;
    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeRequests--;
        drainRequestQueue();
      });
  }
}

function runWithRequestBudget(task, { skipQueue = false, queueTimeoutMs = REQUEST_QUEUE_TIMEOUT_MS } = {}) {
  if (skipQueue || activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve()
      .then(task)
      .finally(() => {
        activeRequests--;
        drainRequestQueue();
      });
  }

  return new Promise((resolve, reject) => {
    const item = {
      task,
      resolve,
      reject,
      timeoutId: null,
    };

    item.timeoutId = setTimeout(() => {
      const index = requestQueue.indexOf(item);
      if (index >= 0) requestQueue.splice(index, 1);
      reject(createQueueTimeoutError());
    }, queueTimeoutMs);

    requestQueue.push(item);
    drainRequestQueue();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheTtlMs = CACHE_TTL,
  staleWhileRevalidate = true,
  skipDedupe = false,
  skipQueue = false,
  queueTimeoutMs = REQUEST_QUEUE_TIMEOUT_MS,
} = {}) {
  method = method.toUpperCase();

  // Check cache for GET requests
  const cacheKey = getCacheKey(path, method);
  if (method === 'GET' && !skipCache) {
    const cached = getCacheEntry(cacheKey);
    if (cached?.state === 'fresh') {
      return cached.data;
    }
    if (cached?.state === 'stale' && staleWhileRevalidate) {
      if (!inFlightRequests.has(cacheKey)) {
        const backgroundRefresh = request(path, {
          method,
          headers,
          skipCache: false,
          timeoutMs,
          cacheTtlMs,
          staleWhileRevalidate: false,
          skipQueue,
          queueTimeoutMs,
        }).catch(() => null);
        inFlightRequests.set(cacheKey, { promise: backgroundRefresh, timestamp: Date.now() });
        backgroundRefresh.then(
          () => inFlightRequests.delete(cacheKey),
          () => inFlightRequests.delete(cacheKey)
        );
      }
      return cached.data;
    }
  }

  if (method === 'GET' && !skipDedupe) {
    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) return inFlight.promise;
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

  const runNetworkRequest = async () => {
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
      setCache(cacheKey, result, cacheTtlMs);
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
  };

  const promise = runWithRequestBudget(runNetworkRequest, { skipQueue, queueTimeoutMs });

  if (method === 'GET' && !skipDedupe) {
    inFlightRequests.set(cacheKey, { promise, timestamp: Date.now() });
    promise.then(
      () => inFlightRequests.delete(cacheKey),
      () => inFlightRequests.delete(cacheKey)
    );
  }

  return promise;
}

export const api = {
  updateEventJoinDisable: (eventId, joinDisabled, joinDisableTime) => request(`/events/${eventId}/join-disable`, { method: 'PATCH', body: { joinDisabled, joinDisableTime } }),
  // Auth (unified)
  me: (forceRefresh = false) => request('/auth/me', { skipCache: forceRefresh }),
  updateMyProfile: (body) => request('/auth/me', { method: 'PUT', body }),
  updateMyAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request('/auth/me/avatar', { method: 'PUT', formData: fd });
  },
  getStudentActivity: () => request('/auth/activity', { cacheTtlMs: 30 * 1000 }),
  debugStudentActivity: () => request('/auth/activity/debug', { skipCache: true }),
  getStudentStats: () => request('/auth/stats', { cacheTtlMs: 60 * 1000 }),
  login: async (identifier, password) => {
    clearApiCache();
    const result = await request('/auth/login', { method: 'POST', body: { identifier, password } });
    clearApiCache();
    return result;
  },
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) => request('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword, confirmPassword: newPassword } }),
  changeStudentPassword: (currentPassword, newPassword, confirmPassword) => request('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword, confirmPassword } }),
  changeAdminPassword: (currentPassword, newPassword, confirmPassword) => request('/auth/password/admin-change', { method: 'POST', body: { currentPassword, newPassword, confirmPassword } }),
  requestPasswordReset: (email) => request('/auth/password/request-reset', { method: 'POST', body: { email } }),
  resetPassword: (token, newPassword) => request('/auth/password/reset', { method: 'POST', body: { token, newPassword } }),

  // Notifications
  getNotifications: () => request('/notifications', { cacheTtlMs: 15 * 1000 }),
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
    return request(`/admin/announcements${qs.toString() ? `?${qs.toString()}` : ''}`, { cacheTtlMs: 60 * 1000 });
  },
  updateAnnouncement: (id, body) => request(`/admin/announcements/${id}`, { method: 'PUT', body }),
  deleteAnnouncement: (id) => request(`/admin/announcements/${id}`, { method: 'DELETE' }),
  listStudentAnnouncements: () => request(`/student/announcements?ts=${Date.now()}`, { skipCache: true }),

  // Company Insights (Admin)
  listCompanyBenchmarks: () => request('/admin/company-insights', { cacheTtlMs: 2 * 60 * 1000 }),
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
    request(`/student/analysis${forceRefresh ? '?refresh=1' : ''}`, { skipCache: forceRefresh, cacheTtlMs: 2 * 60 * 1000 }),
  listStudentCompanies: () => request('/student/analysis/companies', { cacheTtlMs: 10 * 60 * 1000 }),
  getCompanyReadiness: (companyId, forceRefresh = false) =>
    request(
      `/student/analysis/readiness?companyId=${encodeURIComponent(companyId)}${forceRefresh ? '&refresh=1' : ''}`,
      { skipCache: forceRefresh, cacheTtlMs: 2 * 60 * 1000 }
    ),

  // Students
  listAllStudents: (search = '', sortOrder = 'asc') => {
    const options = search && typeof search === 'object'
      ? search
      : { search, sortOrder };
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.semester !== undefined && options.semester !== '') params.append('semester', options.semester);
    ['branch', 'course', 'college', 'group', 'coordinator', 'credentialEmailStatus', 'platformActivity', 'credentialEligibility', 'accountStatus'].forEach((key) => {
      if (options[key] !== undefined && options[key] !== '') params.append(key, options[key]);
    });
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
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
  listPromotionSemesters: () => request('/students/promotion/semesters', { skipCache: true }),
  listPromotionStudents: (semester) => request(`/students/promotion/semesters/${semester}/students`, { skipCache: true }),
  promoteStudents: (body) => request('/students/promotion/promote', { method: 'POST', body }),
  updateStudent: (studentId, body) => request(`/students/${studentId}`, { method: 'PUT', body }),
  deleteStudent: (studentId) => request(`/students/${studentId}`, { method: 'DELETE' }),
  bulkDeleteStudents: (studentIds) => request('/students/bulk-delete', { method: 'POST', body: { studentIds } }),
  resendStudentCredentials: (studentIds) => request('/students/resend-credentials', { method: 'POST', body: { studentIds } }),
  exportStudentsCsv: async (options = {}) => {
    const params = new URLSearchParams();
    ['search', 'sortOrder', 'semester', 'branch', 'course', 'college', 'group', 'coordinator', 'credentialEmailStatus', 'platformActivity', 'credentialEligibility', 'accountStatus'].forEach((key) => {
      if (options[key] !== undefined && options[key] !== '') params.append(key, options[key]);
    });
    const queryString = params.toString();
    const res = await fetch(`${API_BASE}/students/export${queryString ? `?${queryString}` : ''}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to export students');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('Content-Disposition') || '';
    a.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'students-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { count: Number(res.headers.get('X-Exported-Count')) || 0 };
  },

  // Coordinators
  listAllCoordinators: (search = '') => request(`/coordinators/list${search ? '?search=' + encodeURIComponent(search) : ''}`),
  createCoordinator: (body) => request('/coordinators/create', { method: 'POST', body }),
  bulkCreateCoordinators: (coordinators) => request('/coordinators/bulk-create', { method: 'POST', body: { coordinators } }),
  updateCoordinator: (coordinatorId, body) => request(`/coordinators/${coordinatorId}`, { method: 'PUT', body }),
  getCoordinatorAccess: (coordinatorId) => request(`/coordinators/${coordinatorId}/access`, { skipCache: true }),
  updateCoordinatorAccess: (coordinatorId, body) => request(`/coordinators/${coordinatorId}/access`, { method: 'PUT', body }),
  updateCoordinatorStatus: (coordinatorId, isActive) => request(`/coordinators/${coordinatorId}/status`, { method: 'PATCH', body: { isActive } }),
  deleteCoordinator: (coordinatorId) => request(`/coordinators/${coordinatorId}`, { method: 'DELETE' }),
  resendCoordinatorCredentials: (coordinatorIds) => request('/coordinators/resend-credentials', { method: 'POST', body: { coordinatorIds } }),

  // Events
  listEvents: () => request('/events'),
  createEvent: ({ name, description, startDate, endDate, template, selectionMode = 'all', participantFilters = {}, allowedParticipants = [], excludedParticipants = [], status = 'published' }) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', description);
    if (startDate) fd.append('startDate', startDate);
    if (endDate) fd.append('endDate', endDate);
    fd.append('selectionMode', selectionMode);
    fd.append('participantFilters', JSON.stringify(participantFilters));
    fd.append('allowedParticipants', JSON.stringify(allowedParticipants));
    fd.append('excludedParticipants', JSON.stringify(excludedParticipants));
    fd.append('status', status);
    if (template) fd.append('template', template);
    return request('/events', { method: 'POST', formData: fd });
  },
  checkSpecialEventCsv: (file) => {
    const fd = new FormData();
    fd.append('csv', file);
    return request('/events/special/check-csv', { method: 'POST', formData: fd });
  },
  checkInterviewParticipantCsv: (file) => {
    const fd = new FormData();
    fd.append('csv', file);
    return request('/events/participants/check-csv', { method: 'POST', formData: fd });
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
    updateEvent: (eventId, body) => request(`/events/${eventId}`, { method: 'PATCH', body }),
    updateEventStatus: (eventId, status) => request(`/events/${eventId}/status`, { method: 'PATCH', body: { status } }),
    listEventParticipants: (eventId) => request(`/events/${eventId}/participants`),
    addEventParticipants: (eventId, studentIds) => request(`/events/${eventId}/participants`, { method: 'POST', body: { studentIds } }),
    removeEventParticipant: (eventId, studentId, reason = '') => request(`/events/${eventId}/participants/${studentId}`, { method: 'DELETE', body: { reason } }),
  sendEventInvitations: (eventId, studentIds = []) => request(`/events/${eventId}/invitations`, { method: 'POST', body: { studentIds } }),
    getMailBatchStatus: (batchId) => request(`/mail-queue/batches/${batchId}`, { skipCache: true }),
    retryFailedMailBatch: (batchId) => request(`/mail-queue/batches/${batchId}/retry`, { method: 'POST' }),
    listTargetMailStatus: (targetType, targetId) => request(`/mail-queue/targets/${targetType}/${targetId}`, { skipCache: true }),
    deleteEvent: (eventId, reason = '') => request(`/events/${eventId}`, { method: 'DELETE', body: { reason } }),
    archiveEvent: (eventId) => request(`/events/${eventId}`, { method: 'DELETE', body: { reason: 'Deleted by administrator.' } }),
  getEventAnalytics: (eventId) => request(`/events/${eventId}/analytics`),
  getEventTemplateUrl: (eventId) => request(`/events/${eventId}/template-url`),

  // Assessments (Admin)
  createAssessment: (body) => request('/admin/assessment/create', { method: 'POST', body }),
  listAssessments: () => request('/admin/assessment/list'),
  getAssessmentById: (id) => request(`/admin/assessment/${id}`),
  updateAssessment: (id, body) => request(`/admin/assessment/${id}`, { method: 'PUT', body }),
  deleteAssessment: (id) => request(`/admin/assessment/${id}`, { method: 'DELETE' }),
  resetAssessmentSubmissions: (id) => request(`/admin/assessment/${id}/reset-submissions`, { method: 'POST' }),
  listAssessmentEligibleStudents: (id) => request(`/admin/assessment/${id}/eligible-students`, { skipCache: true }),
  addAssessmentEligibleStudents: (id, studentIds = [], students = []) => request(`/admin/assessment/${id}/students`, { method: 'POST', body: { studentIds, students } }),
  resetAssessmentStudentSubmission: (id, studentId) => request(`/admin/assessment/${id}/students/${studentId}/reset-submission`, { method: 'POST' }),
  removeAssessmentEligibleStudent: (id, studentId) => request(`/admin/assessment/${id}/students/${studentId}`, { method: 'DELETE' }),
  sendAssessmentInvitations: (id, password = '') => request(`/admin/assessment/${id}/send-invitations`, { method: 'POST', body: { password } }),
  markAssessmentComplete: (id) => request(`/admin/assessment/${id}/mark-complete`, { method: 'POST' }),
  releaseAssessmentAnswers: (id) => request(`/admin/assessment/${id}/release-answers`, { method: 'POST' }),
  getAssessmentReports: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    });
    return request(`/admin/assessment/reports${qs.toString() ? `?${qs.toString()}` : ''}`);
  },
  getAssessmentReportsExportData: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    });
    return request(`/admin/assessment/reports/export-data${qs.toString() ? `?${qs.toString()}` : ''}`, { skipCache: true, timeoutMs: 60000 });
  },
  getStudentAssessmentReport: (submissionId) => request(`/admin/assessment/reports/submissions/${submissionId}`, { skipCache: true }),
  exportAssessmentReports: async (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    });
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
  exportAssessmentReportsExcel: async (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    });
    const res = await fetch(`${API_BASE}/admin/assessment/reports/export/excel${qs.toString() ? `?${qs.toString()}` : ''}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to export Excel report');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    a.download = `assessment-report-${timestamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  listLibraryQuestions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (key !== 'skipCache' && value !== undefined && value !== null && value !== '') qs.append(key, String(value));
    });
    return request(`/admin/library/questions${qs.toString() ? `?${qs.toString()}` : ''}`, {
      cacheTtlMs: 30 * 1000,
      skipCache: Boolean(params.skipCache),
    });
  },
  createLibraryQuestion: (question) => request('/admin/library/questions', { method: 'POST', body: { question } }),
  createLibraryQuestionsBulk: (questions) => request('/admin/library/questions/bulk', { method: 'POST', body: { questions } }),
  getLibraryQuestion: (id) => request(`/admin/library/questions/${id}`, { skipCache: true }),
  updateLibraryQuestion: (id, body) => request(`/admin/library/questions/${id}`, { method: 'PATCH', body }),
  deleteLibraryQuestion: (id) => request(`/admin/library/questions/${id}`, { method: 'DELETE' }),
  resolveLibraryQuestions: (ids = []) => request('/admin/library/questions/resolve', { method: 'POST', body: { ids } }),

  // Assessments (Student)
  listStudentAssessments: () => request('/student/assessments'),
  getStudentAssessmentDashboard: () => request('/student/assessment-dashboard'),
  startStudentAssessment: (id, password = '') => request(`/student/assessment/${id}/start`, { method: 'POST', body: { password } }),
  markStudentAssessmentSetupStep: (id, step, meta) => request(`/student/assessment/${id}/setup-step`, { method: 'POST', body: { step, ...(meta ? { meta } : {}) } }),
  beginStudentAssessment: (id, sessionId) => request(`/student/assessment/${id}/begin`, { method: 'POST', body: { sessionId } }),
  getStudentAssessment: (id) => request(`/student/assessment/${id}`),
  logStudentAssessmentViolation: (id, body) => request(`/student/assessment/${id}/violations`, { method: 'POST', body, timeoutMs: 10000, skipQueue: true }),
  sendStudentAssessmentHeartbeat: (id, body) => request(`/student/assessment/${id}/heartbeat`, { method: 'POST', body, timeoutMs: 6000 }),
  logStudentAssessmentMonitoring: (id, body) => request(`/student/assessment/${id}/monitoring`, { method: 'POST', body, timeoutMs: 10000 }),
  submitStudentAssessment: (body) => request('/student/assessment/submit', { method: 'POST', body }),
  getSubmissionViolations: (submissionId) => request(`/admin/assessment/submissions/${submissionId}/violations`, { skipCache: true }),

  // Pairing

  // Pair status changes after schedule mutations, so this must never return a
  // cached pre-confirmation response.
  listPairs: (eventId) => request(`/pairing/${eventId}`, { skipCache: true }),
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
  // Compiler Module
  getCompilerOverview: () => request('/compiler/overview', { cacheTtlMs: 30 * 1000 }),
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
    return request(`/compiler/problems?${params.toString()}`, { cacheTtlMs: 30 * 1000 });
  },
  createCompilerProblem: (formData) => request('/compiler/problems', { method: 'POST', formData }),
  updateCompilerProblem: (problemId, formData) => request(`/compiler/problems/${problemId}`, { method: 'PUT', formData }),
  updateCompilerProblemVisibility: (problemId, visibility) => {
    const fd = new FormData();
    fd.append('visibility', visibility);
    return request(`/compiler/problems/${problemId}/visibility`, { method: 'PATCH', formData: fd });
  },
  updateCompilerProblemStatus: (problemId, status) => {
    const fd = new FormData();
    fd.append('status', status);
    return request(`/compiler/problems/${problemId}/status`, { method: 'PATCH', formData: fd });
  },
  deleteCompilerProblem: (problemId) => request(`/compiler/problems/${problemId}`, { method: 'DELETE' }),
  getCompilerProblem: (problemId) => request(`/compiler/problems/${problemId}`, { skipCache: true }),
  runCompilerPreview: (formData) => request('/compiler/problems/preview/run', { method: 'POST', formData }),
  approveCompilerProblemPreview: (problemId, formData) => request(`/compiler/problems/${problemId}/preview/approve`, { method: 'POST', formData }),
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
    return request(`/compiler/submissions?${params.toString()}`, { cacheTtlMs: 15 * 1000 });
  },
  getCompilerAnalytics: ({ studentId = '', problemId = '', dateFrom = '', dateTo = '' } = {}) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (problemId) params.append('problemId', problemId);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    const query = params.toString();
    return request(`/compiler/analytics${query ? `?${query}` : ''}`, { cacheTtlMs: 30 * 1000 });
  },
  getCompilerStudentAnalytics: (studentId) => request(`/compiler/student/${studentId}`, { cacheTtlMs: 30 * 1000 }),
  getCompilerAnalyticsOverview: () => request('/compiler/analytics/overview', { cacheTtlMs: 30 * 1000 }),
  getCompilerProblemAnalytics: (problemId) => request(`/compiler/analytics/problem/${problemId}`, { cacheTtlMs: 30 * 1000 }),
  getExecutionResult: (jobId) => request(`/results/${jobId}`, { skipCache: true }),
  waitForExecutionResult: async (jobId, { intervalMs = 1000, timeoutMs = 120000 } = {}) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const result = await request(`/results/${jobId}`, { skipCache: true });
      const status = String(result?.status || '').toLowerCase();

      if (status === 'completed') {
        return result;
      }

      if (status === 'failed') {
        throw new Error(result?.error?.message || 'Execution failed.');
      }

      await sleep(intervalMs);
    }

    throw new Error('Execution is taking longer than expected. Please try again shortly.');
  },
  listStudentProblems: ({ search = '', difficulty = '', tags = '', sortBy = 'acceptanceRate', sortOrder = 'desc', page = 1, limit = 10 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (difficulty) params.append('difficulty', difficulty);
    if (tags) params.append('tags', tags);
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);
    params.append('page', String(page));
    params.append('limit', String(limit));
    return request(`/compiler/problems?${params.toString()}`, { cacheTtlMs: 30 * 1000 });
  },
  getStudentProblem: (problemId) => request(`/compiler/problems/${problemId}`, { skipCache: true }),
  runStudentProblem: (problemId, {
    language,
    sourceCode,
    customInput = '',
    expectedOutput,
    testCases,
    assessmentId = '',
  }) => {
    return request('/compiler/run', {
      method: 'POST',
      body: {
        problemId,
        source_code: sourceCode,
        language_id: getJudge0LanguageId(language),
        stdin: customInput,
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(Array.isArray(testCases) ? { testCases } : {}),
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















