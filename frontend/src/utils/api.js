import { isUniversityDeployment } from '../platform/universityPermissions';
import { getJudge0LanguageId } from "../admin/compiler/compilerUtils";
import { getApiBase } from "./apiBase";

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
const cacheGenerations = new Map();
let activeRequests = 0;

const CACHE_TTL = Number(
  import.meta.env.VITE_API_CACHE_TTL_MS || 2 * 60 * 1000,
);
const STALE_TTL = Number(
  import.meta.env.VITE_API_STALE_TTL_MS || 10 * 60 * 1000,
);
const MAX_CACHE_ENTRIES = Number(
  import.meta.env.VITE_API_CACHE_MAX_ENTRIES || 120,
);
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000);
const MAX_CONCURRENT_REQUESTS = Number(
  import.meta.env.VITE_API_MAX_CONCURRENT || 8,
);
const REQUEST_QUEUE_TIMEOUT_MS = Number(
  import.meta.env.VITE_API_QUEUE_TIMEOUT_MS || 8000,
);

function getCacheKey(path, method) {
  return `${method}:${path}`;
}

function getCacheGroup(path) {
  if (path.startsWith("/admin/assessment") || path.startsWith("/student/assessment") || path.startsWith("/assessment-feedback")) return "assessments";
  if (path.startsWith("/students")) return "students";
  if (path.startsWith("/coordinators")) return "coordinators";
  if (path.startsWith("/events") || path.startsWith("/pairing") || path.startsWith("/schedule")) return "events";
  if (path.startsWith("/activity")) return "activity";
  if (path.startsWith("/compiler") || path.startsWith("/execute") || path.startsWith("/results")) return "compiler";
  return path.split("/").filter(Boolean)[0] || "root";
}

function invalidateApiCacheForPath(path) {
  const group = getCacheGroup(path);
  cacheGenerations.set(group, (cacheGenerations.get(group) || 0) + 1);
  const patterns = {
    assessments: ["/admin/assessment", "/student/assessment", "/assessment-feedback"],
    students: ["/students"],
    coordinators: ["/coordinators"],
    events: ["/events", "/pairing", "/schedule"],
    activity: ["/activity"],
    compiler: ["/compiler", "/execute", "/results"],
  }[group] || [`/${group}`];
  patterns.forEach(clearApiCache);
}

function getCacheEntry(key) {
  const cached = apiCache.get(key);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  const ttlMs = cached.ttlMs ?? CACHE_TTL;
  if (age < ttlMs) {
    return { data: cached.data, state: "fresh" };
  }

  if (age < ttlMs + STALE_TTL) {
    return { data: cached.data, state: "stale" };
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
    sortedByAge
      .slice(0, Math.max(10, Math.ceil(MAX_CACHE_ENTRIES * 0.15)))
      .forEach(([entryKey]) => apiCache.delete(entryKey));
  }
}

function createQueueTimeoutError() {
  const err = new Error("The platform is busy. Please retry in a few seconds.");
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

function runWithRequestBudget(
  task,
  { skipQueue = false, queueTimeoutMs = REQUEST_QUEUE_TIMEOUT_MS } = {},
) {
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
  localStorage.removeItem("token");
}

// Kept for backwards compatibility during migration
export function setToken(t) {
  void t;
  // No longer storing in localStorage for security
  // Token is now in HttpOnly cookie set by server
  clearLegacyToken();
}

/** The Prep Coin cost a student confirmed, sent as a header so bodies forwarded upstream stay untouched. */
const coinCostHeader = (cost) => (cost === null || cost === undefined ? {} : { 'X-Prep-Coin-Cost': String(cost) });

async function request(
  path,
  {
    method = "GET",
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
    signal,
  } = {},
) {
  method = method.toUpperCase();
  if (isUniversityDeployment && /^(?:\/admin\/(?:assessment|library)|\/student\/assessment|\/learning|\/subjects)/.test(path)) skipCache = true;

  // Check cache for GET requests
  const cacheKey = getCacheKey(path, method);
  const cacheGroup = getCacheGroup(path);
  const requestCacheGeneration = cacheGenerations.get(cacheGroup) || 0;
  if (method === "GET" && !skipCache) {
    const cached = getCacheEntry(cacheKey);
    if (cached?.state === "fresh") {
      return cached.data;
    }
    if (cached?.state === "stale" && staleWhileRevalidate) {
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
        inFlightRequests.set(cacheKey, {
          promise: backgroundRefresh,
          timestamp: Date.now(),
        });
        backgroundRefresh.then(
          () => inFlightRequests.delete(cacheKey),
          () => inFlightRequests.delete(cacheKey),
        );
      }
      return cached.data;
    }
  }

  if (method === "GET" && !skipDedupe) {
    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) return inFlight.promise;
  }

  const opts = {
    method,
    headers: { ...headers },
    // SECURITY: Send cookies with every request
    credentials: "include", // This sends HttpOnly cookies
  };

  if (method === "GET" && skipCache) {
    opts.headers["Cache-Control"] = "no-cache";
  }

  if (formData) {
    opts.body = formData;
  } else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  // No longer sending Authorization header - JWT is in cookie
  // if (token) opts.headers['Authorization'] = `Bearer ${token}`;

  const url = `${API_BASE}${path}`;

  const runNetworkRequest = async () => {
    let controller = null;
    let timeoutId = null;
    let unlinkCallerSignal = null;

    try {
      if (timeoutMs && timeoutMs > 0) {
        // Default timeout keeps regular requests responsive, but callers can disable it.
        controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        opts.signal = controller.signal;
      }
      if (signal) {
        // A caller-supplied signal (e.g. a superseded live refresh) cancels the fetch too.
        controller = controller || new AbortController();
        opts.signal = controller.signal;
        const abortFromCaller = () => controller.abort();
        if (signal.aborted) abortFromCaller();
        else {
          signal.addEventListener("abort", abortFromCaller, { once: true });
          unlinkCallerSignal = () => signal.removeEventListener("abort", abortFromCaller);
        }
      }

      const res = await fetch(url, opts);

      if (!res.ok) {
        let err;
        try {
          const j = await res.json();
          // /auth/me returns 401 when not logged in - treat as normal state
          if (res.status === 401 && path === "/auth/me") {
            err = new Error("Not authenticated");
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
      const ct = res.headers.get("content-type") || "";
      const result = ct.includes("application/json")
        ? await res.json()
        : await res.text();

      // Cache GET requests
      if (
        method === "GET"
        && !skipCache
        && requestCacheGeneration === (cacheGenerations.get(cacheGroup) || 0)
      ) {
        setCache(cacheKey, result, cacheTtlMs);
      }

      // Clear relevant cache on mutations
      if (method !== "GET") {
        invalidateApiCacheForPath(path);
      }

      return result;
    } catch (err) {
      if (err.name === "AbortError" && signal?.aborted) {
        const abortErr = new Error("Request cancelled");
        abortErr.name = "AbortError";
        abortErr.response = { status: 0 };
        throw abortErr;
      }
      if (err.name === "AbortError") {
        const timeoutErr = new Error(
          "Request timed out. Please check your connection and try again.",
        );
        timeoutErr.response = { status: 0 };
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      unlinkCallerSignal?.();
    }
  };

  const promise = runWithRequestBudget(runNetworkRequest, {
    skipQueue,
    queueTimeoutMs,
  });

  if (method === "GET" && !skipDedupe) {
    inFlightRequests.set(cacheKey, { promise, timestamp: Date.now() });
    promise.then(
      () => inFlightRequests.delete(cacheKey),
      () => inFlightRequests.delete(cacheKey),
    );
  }

  return promise;
}

/** An ANVI start body: the options object as given, or { resumeConsent } from the legacy boolean. */
const anviStartBody = (options) => (options && typeof options === 'object' ? options : { resumeConsent: options === true });

const anviResumePath = (target) => {
  const id = encodeURIComponent(String(target?.id || ''));
  return target?.kind === 'assignment' ? `/student/ai-interviews/assignments/${id}/resume` : `/student/ai-interviews/${id}/resume`;
};

const ANVI_AUDIO_RATE = 24000;
const ANVI_AUDIO_TIMEOUT_MS = 15000;

/**
 * The s16le samples of an ANVI clip body: a mono 16-bit PCM WAV (header parsed) or raw PCM.
 * Returns { pcm: Uint8Array, sampleRate }; throws on any other WAV layout.
 */
export function anviClipFromBytes(buffer, contentType = '') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    if (/wav/i.test(contentType)) throw new Error('The question audio could not be read.');
    return { pcm: bytes.subarray(0, bytes.length - (bytes.length % 2)), sampleRate: ANVI_AUDIO_RATE };
  }
  let sampleRate = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      const format = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const bits = view.getUint16(body + 14, true);
      if (format !== 1 || channels !== 1 || bits !== 16) throw new Error('The question audio has an unsupported format.');
      sampleRate = view.getUint32(body + 4, true);
    } else if (id === 'data') {
      if (!sampleRate) break;
      const end = Math.min(bytes.length, body + size);
      return { pcm: bytes.subarray(body, end - ((end - body) % 2)), sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('The question audio could not be read.');
}

/**
 * POSTs one file as multipart `field`, reporting upload progress (fetch cannot). Errors carry
 * `response: { status, data }` like `request`; status 0 means the upload did not finish.
 */
function uploadWithProgress(path, field, file, { onProgress, timeoutMs = 90000 } = {}) {
  const formData = new FormData();
  formData.append(field, file);
  if (typeof XMLHttpRequest === 'undefined') return request(path, { method: 'POST', formData, timeoutMs, skipQueue: true });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fail = (message, status, data = {}) => {
      const err = new Error(message);
      err.response = { status, data };
      reject(err);
    };
    xhr.open('POST', `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    if (onProgress && xhr.upload) xhr.upload.onprogress = (event) => { if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total); };
    xhr.onload = () => {
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = null; }
      if (xhr.status >= 200 && xhr.status < 300) {
        invalidateApiCacheForPath(path);
        resolve(data);
        return;
      }
      fail(data?.error || data?.message || xhr.statusText || 'The upload failed.', xhr.status, data || {});
    };
    xhr.onerror = () => fail('The upload did not finish. Check your connection and try again.', 0);
    xhr.ontimeout = () => fail('The upload timed out. Check your connection and try again.', 0);
    xhr.send(formData);
  });
}

export const api = {
  wallet: () => request('/wallet', { skipCache: true }),
  walletRecipients: (search = '') => request(`/wallet/recipients?search=${encodeURIComponent(search)}`, { skipCache: true }),
  allocateWalletCoins: (body) => request('/wallet/allocate', { method: 'POST', body, skipCache: true }),
  topUpUniversityCoins: (id, body) => request(`/platform/admin/universities/${encodeURIComponent(id)}/coins/top-up`, { method: 'POST', body, skipCache: true }),
  platformWallets: () => request('/platform/admin/wallets', { skipCache: true }),
  platformWalletRecipients: (role, search) => request(`/platform/admin/wallet-recipients?role=${encodeURIComponent(role)}&search=${encodeURIComponent(search)}`, { skipCache: true }),
  creditPlatformWalletUser: (body) => request('/platform/admin/wallet-recipients/credit', { method: 'POST', body, skipCache: true }),
  universityAccountCounts: (id) => request(`/platform/admin/universities/${encodeURIComponent(id)}/account-counts`, { skipCache: true }),
  universityAccountLimits: () => request('/platform/university/account-limits', { skipCache: true }),
  platformOverview: () => request('/platform/admin/overview', { skipCache: true }),
  platformInsights: ({ refresh = false } = {}) => request(`/platform/admin/insights${refresh ? '?refresh=1' : ''}`, { skipCache: true }),
  overviewInsights: () => request('/overview', { skipCache: true }),
  coinConsoleSummary: () => request('/platform/admin/coins/summary', { skipCache: true }),
  coinLedger: ({ kind = '', scope = '', before = '', limit = 40 } = {}) => request(`/platform/admin/coins/ledger?${new URLSearchParams(Object.entries({ kind, scope, before, limit: String(limit) }).filter(([, value]) => value))}`, { skipCache: true }),
  coinAccounts: ({ role = '', search = '', page = 1 } = {}) => request(`/platform/admin/coins/accounts?${new URLSearchParams(Object.entries({ role, search, page: String(page) }).filter(([, value]) => value))}`, { skipCache: true }),
  prepScorePolicy: () => request('/platform/admin/prep-score', { skipCache: true }),
  savePrepScorePolicyDraft: (body) => request('/platform/admin/prep-score/draft', { method: 'PUT', body, skipCache: true }),
  simulatePrepScore: (body) => request('/platform/admin/prep-score/simulate', { method: 'POST', body, skipCache: true }),
  prepScoreImpact: (body) => request('/platform/admin/prep-score/impact', { method: 'POST', body, skipCache: true }),
  prepScoreSyncStatus: (universityId = 'platform') => request(`/platform/admin/prep-score/status?universityId=${encodeURIComponent(universityId)}`, { skipCache: true }),
  publishPrepScorePolicy: (body) => request('/platform/admin/prep-score/publish', { method: 'POST', body, skipCache: true }),
  restorePrepScorePolicy: (version) => request(`/platform/admin/prep-score/versions/${encodeURIComponent(version)}/restore`, { method: 'POST', skipCache: true }),
  walletSummary: () => request('/wallet/summary', { skipCache: true }),
  walletPricing: () => request('/wallet/pricing', { skipCache: true }),
  adminCoinPricing: () => request('/platform/admin/coin-pricing', { skipCache: true }),
  saveAdminCoinPricing: (body) => request('/platform/admin/coin-pricing', { method: 'PUT', body, skipCache: true }),
  platformStudents: (id, page = 1, search = '') => request(`/platform/admin/universities/${encodeURIComponent(id)}/students?page=${page}&search=${encodeURIComponent(search)}`, { skipCache: true }),
  platformStudent: (id, studentId) => request(`/platform/admin/universities/${encodeURIComponent(id)}/students/${encodeURIComponent(studentId)}`, { skipCache: true }),
  listPracticeQuestions: (params = {}) => request(`/student/questions?${new URLSearchParams(params).toString()}`, { skipCache: true }),
  questionInterviewOptions: () => request('/student/questions/interview-options', { skipCache: true }),
  reportQuestionInterview: (source, id, body) => request(`/student/questions/${encodeURIComponent(source)}/${encodeURIComponent(id)}/interview-reports`, { method: 'POST', body, skipCache: true }),
  questionInterviewCompanies: (source, id) => request(`/student/questions/${encodeURIComponent(source)}/${encodeURIComponent(id)}/interview-companies`, { skipCache: true }),
  listCompanySuggestions: (params = {}) => request(`/interview-companies/admin/suggestions?${new URLSearchParams(params).toString()}`, { skipCache: true }),
  decideCompanySuggestion: (key, body) => request(`/interview-companies/admin/suggestions/${encodeURIComponent(key)}/decision`, { method: 'POST', body, skipCache: true }),
  companyTagProgress: (params = {}) => request(`/interview-companies/admin/tag-progress?${new URLSearchParams(params).toString()}`, { skipCache: true }),
  updateCompanyVoteSettings: (body) => request('/interview-companies/admin/settings', { method: 'PUT', body, skipCache: true }),
  getPracticeQuestion: (source, id) => request(`/student/questions/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, { skipCache: true }),
  submitPracticeAnswer: (source, id, answer, language = '') => request(`/student/questions/${encodeURIComponent(source)}/${encodeURIComponent(id)}/attempts`, { method: 'POST', body: { answer, language }, skipCache: true }),
  getSharedStudentProblem: (id) => request(`/student/questions/shared/${encodeURIComponent(id)}/problem`, { skipCache: true }),
  runSharedStudentProblem: (id, body) => request(`/student/questions/shared/${encodeURIComponent(id)}/run`, { method: 'POST', body, timeoutMs: 0 }),
  submitSharedStudentProblem: (id, { sourceCode, language }) => request(`/student/questions/shared/${encodeURIComponent(id)}/attempts`, { method: 'POST', body: { answer: sourceCode, language }, timeoutMs: 0 }),
  listSharedStudentSubmissions: (id) => request(`/student/questions/shared/${encodeURIComponent(id)}/submissions`, { skipCache: true }),
  copySharedQuestion: (id) => request(`/admin/library/questions/${encodeURIComponent(id)}/copy`, { method: 'POST', skipCache: true }),
  runSharedCodingPreview: (id, body) => request(`/admin/library/questions/${encodeURIComponent(id)}/shared-coding/run`, { method: 'POST', body, timeoutMs: 0 }),
  submitSharedCodingPreview: (id, body) => request(`/admin/library/questions/${encodeURIComponent(id)}/shared-coding/submit`, { method: 'POST', body, timeoutMs: 0 }),
  platformPublications: () => request('/platform/admin/publications', { skipCache: true }),
  testUniversityDatabase: (universityId, dbUri) => request('/platform/admin/universities/test-database', { method: 'POST', body: { universityId, dbUri }, timeoutMs: 15000 }),
  createUniversity: (body) => request('/platform/admin/universities', { method: 'POST', body, timeoutMs: 120000 }),
  updateUniversityDefaults: (body) => request('/platform/admin/defaults', { method: 'PUT', body }),
  updateUniversity: (id, body) => request(`/platform/admin/universities/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteUniversity: (id) => request(`/platform/admin/universities/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadUniversityLogo: (id, file) => {
    const formData = new FormData();
    formData.append('logo', file);
    return request(`/platform/admin/universities/${encodeURIComponent(id)}/logo`, { method: 'POST', formData, timeoutMs: 60 * 1000 });
  },
  deleteUniversityLogo: (id) => request(`/platform/admin/universities/${encodeURIComponent(id)}/logo`, { method: 'DELETE' }),
  publishPlatformContent: (kind, id, body) => request(`/platform/admin/publications/${kind}/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  platformAudit: ({ action = '', before = '' } = {}) => request(`/platform/admin/audit?${new URLSearchParams(Object.entries({ action, before }).filter(([, value]) => value))}`, { skipCache: true }),
  universityPolicy: () => request('/platform/university/policy', { skipCache: true }),
  aiInterviewRequest: (path = '', options = {}) => request(`/ai-interviews${path}`, { ...options, skipCache: true, skipDedupe: true }),
  // Hybrid ANVI question audio for a published interview: queue a regeneration, and read its progress.
  regenerateInterviewAudio: (id) => request(`/ai-interviews/${encodeURIComponent(id)}/audio/regenerate`, { method: 'POST', skipCache: true, skipQueue: true }),
  getInterviewAudioStatus: (id) => request(`/ai-interviews/${encodeURIComponent(id)}/audio/status`, { skipCache: true, skipDedupe: true }),
  listStudentAIInterviews: () => request('/student/ai-interviews', { skipCache: true }),
  // expectedCost: the Prep Coin cost the student confirmed; the server refuses if it has changed.
  // `options`: the start body ({ termsAccepted, resumeConsent, language }), or the legacy resumeConsent boolean.
  startStudentAIInterview: (id, options = false, expectedCost = null) => request(`/student/ai-interviews/${id}/start`, { method: 'POST', body: anviStartBody(options), timeoutMs: 60000, skipQueue: true, headers: coinCostHeader(expectedCost) }),
  // ANVI attempts: the live conversation runs over Socket.IO; REST reads the saved answers and ends a stranded attempt.
  getStudentAIAttempt: (id) => request(`/student/ai-interviews/attempts/${encodeURIComponent(id)}`, { skipCache: true }),
  endStudentAIAttempt: (id) => request(`/student/ai-interviews/attempts/${encodeURIComponent(id)}/end`, { method: 'POST', timeoutMs: 30000, skipQueue: true }),
  // Hybrid ANVI: one question clip through the authenticated proxy, used only when the socket's
  // `anvi:clip` copy is missing. Returns { pcm: Uint8Array (s16le mono), sampleRate }. Error messages
  // never carry the URL or the audio.
  getAnviAudio: async (attemptId, assetId) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANVI_AUDIO_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/student/ai-interviews/attempts/${encodeURIComponent(attemptId)}/audio/${encodeURIComponent(assetId)}`, {
        credentials: 'include', cache: 'no-store', signal: controller.signal,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const err = new Error(payload.error || 'The question audio is not available.');
        err.response = { status: res.status, data: payload };
        throw err;
      }
      return anviClipFromBytes(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') || '');
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
      const timeoutErr = new Error('The question audio took too long to load.');
      timeoutErr.response = { status: 0 };
      throw timeoutErr;
    } finally {
      clearTimeout(timer);
    }
  },
  // Scheduled ANVI interviews: the institution assigns them; slots, bookings and the start are checked on the server.
  listStudentAnviAssignments: () => request('/student/ai-interviews/assignments', { skipCache: true }),
  listAnviAssignmentSlots: (assignmentId) => request(`/student/ai-interviews/assignments/${encodeURIComponent(assignmentId)}/slots`, { skipCache: true, skipDedupe: true }),
  bookAnviSlot: (assignmentId, slotId) => request(`/student/ai-interviews/assignments/${encodeURIComponent(assignmentId)}/book`, { method: 'POST', body: { slotId }, skipQueue: true }),
  rescheduleAnviBooking: (bookingId, slotId) => request(`/student/ai-interviews/bookings/${encodeURIComponent(bookingId)}/reschedule`, { method: 'POST', body: { slotId }, skipQueue: true }),
  cancelAnviBooking: (bookingId) => request(`/student/ai-interviews/bookings/${encodeURIComponent(bookingId)}`, { method: 'DELETE', skipQueue: true }),
  // An assigned start never charges Prep Coins, so no cost header is sent.
  startAnviAssignment: (assignmentId, options = false) => request(`/student/ai-interviews/assignments/${encodeURIComponent(assignmentId)}/start`, { method: 'POST', body: anviStartBody(options), timeoutMs: 60000, skipQueue: true }),
  // The resume ANVI may ask about, per practice interview ({ kind: 'practice', id }) or assignment
  // ({ kind: 'assignment', id }). Each returns { source, createdAt, expiresAt, preview }.
  getAnviResume: (target) => request(anviResumePath(target), { skipCache: true, skipDedupe: true }),
  saveAnviBuilderResume: (target) => request(anviResumePath(target), { method: 'POST', body: { source: 'builder' }, timeoutMs: 60000, skipQueue: true }),
  // A PDF or TXT file (≤ 5 MB) in the multipart field "file"; `onProgress(fraction)` follows the upload.
  uploadAnviResume: (target, file, { onProgress } = {}) => uploadWithProgress(anviResumePath(target), 'file', file, { onProgress, timeoutMs: 90000 }),
  deleteAnviResume: (target) => request(anviResumePath(target), { method: 'DELETE', skipQueue: true }),
  anviBookingCalendarUrl: (bookingId) => `${API_BASE}/student/ai-interviews/bookings/${encodeURIComponent(bookingId)}/calendar.ics`,
  downloadAnviBookingCalendar: async (bookingId) => {
    const res = await fetch(`${API_BASE}/student/ai-interviews/bookings/${encodeURIComponent(bookingId)}/calendar.ics`, { credentials: 'include' });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || 'The calendar file could not be downloaded.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('Content-Disposition') || '';
    a.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'anvi-interview.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  updateEventJoinDisable: (eventId, joinDisabled, joinDisableTime) =>
    request(`/events/${eventId}/join-disable`, {
      method: "PATCH",
      body: { joinDisabled, joinDisableTime },
    }),
  // Auth (unified)
  me: (forceRefresh = false) =>
    request("/auth/me", { skipCache: forceRefresh }),
  updateMyProfile: (body) => request("/auth/me", { method: "PUT", body }),
  savePracticeLanguage: (language) => request("/auth/me/practice-language", { method: "PUT", body: { language } }),
  getMyResume: () => request("/resume/me", { skipCache: true }),
  saveMyResume: (body) =>
    request("/resume/me", { method: "PUT", body, skipQueue: true }),
  restorePreviousResume: () =>
    request("/resume/me/restore", { method: "POST", skipQueue: true }),
  getStudentResume: (studentId) =>
    request(`/resume/student/${studentId}`, { skipCache: true }),
  updateMyAvatar: (file) => {
    const fd = new FormData();
    fd.append("avatar", file);
    return request("/auth/me/avatar", { method: "PUT", formData: fd });
  },
  ackLearnerProgress: ({ level, title, awards }) =>
    request("/auth/me/learner-progress", {
      method: "PUT",
      body: { level, title, awards },
    }),
  getStudentActivity: (forceRefresh = false) =>
    request("/auth/activity", {
      skipCache: forceRefresh,
      cacheTtlMs: 30 * 1000,
    }),
  debugStudentActivity: () =>
    request("/auth/activity/debug", { skipCache: true }),
  getStudentStats: (forceRefresh = false) =>
    request("/auth/stats", {
      skipCache: forceRefresh,
      cacheTtlMs: 60 * 1000,
    }),
  getStudentDashboard: (forceRefresh = false) =>
    request("/auth/dashboard", {
      skipCache: forceRefresh,
      cacheTtlMs: 30 * 1000,
    }),
  getStudentRanking: (forceRefresh = false) =>
    request("/auth/ranking", {
      skipCache: forceRefresh,
      cacheTtlMs: 30 * 1000,
    }),
  getStudentGlobalRanking: () => request('/auth/global-ranking', { skipCache: true }),
  refreshStudentEngagement: () => request('/engagement/refresh', { method: 'POST' }),
  acceptStudentChallenge: (kind, periodKey) => request(`/engagement/challenges/${encodeURIComponent(kind)}/accept`, { method: 'POST', body: { periodKey } }),
  claimAchievements: () => request('/engagement/achievements/claim', { method: 'POST' }),
  acknowledgeAchievements: (ids) => request('/engagement/achievements/acknowledge', { method: 'POST', body: { ids } }),
  engagementHistory: () => request('/engagement/history', { skipCache: true }),
  listQuests: () => request('/quests', { skipCache: true }),
  getQuest: (slug) => request(`/quests/${encodeURIComponent(slug)}`, { skipCache: true }),
  startQuest: (slug) => request(`/quests/${encodeURIComponent(slug)}/start`, { method: 'POST' }),
  recordQuestView: (slug, problemKey) => request(`/quests/${encodeURIComponent(slug)}/view`, { method: 'POST', body: { problemKey } }),
  listAdminQuests: () => request('/quests/admin', { skipCache: true }),
  getAdminQuest: (id) => request(`/quests/admin/${encodeURIComponent(id)}`, { skipCache: true }),
  createQuest: (body) => request('/quests/admin', { method: 'POST', body }),
  updateQuest: (id, body) => request(`/quests/admin/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteQuest: (id) => request(`/quests/admin/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  searchQuestLibrary: (params = {}) => request(`/quests/admin/library?${new URLSearchParams(params).toString()}`, { skipCache: true }),
  getQuestTaxonomy: () => request('/quests/admin/taxonomy', { skipCache: true }),
  getQuestOverview: () => request('/quests/admin/overview', { skipCache: true }),
  getQuestInsights: (id) => request(`/quests/admin/${encodeURIComponent(id)}/insights`, { skipCache: true }),
  addQuestItems: (id, items) => request(`/quests/admin/${encodeURIComponent(id)}/items`, { method: 'POST', body: { items } }),
  addQuestLibraryItems: (id, libraryIds) => request(`/quests/admin/${encodeURIComponent(id)}/library-items`, { method: 'POST', body: { libraryIds } }),
  previewQuestLibraryItems: (id, libraryIds) => request(`/quests/admin/${encodeURIComponent(id)}/library-items`, { method: 'POST', body: { libraryIds, dryRun: true } }),
  duplicateQuest: (id) => request(`/quests/admin/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
  getEngagementPolicy: (query = '') => request(`/engagement/policy${query}`, { skipCache: true }),
  updateEngagementPolicy: (body, query = '') => request(`/engagement/policy${query}`, { method: 'PATCH', body }),
  getEngagementAnalytics: (query = '') => request(`/engagement/analytics${query}`, { skipCache: true }),
  getStudentChallengeBadges: (cursor) => request(`/auth/engagement/badges${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { skipCache: true }),
  recordStudentProblemView: (problemId, source = 'university') =>
    request("/auth/dashboard/problem-view", {
      method: "POST",
      body: { problemId, source },
    }),
  recordStudentTopicView: (body) =>
    request("/auth/dashboard/topic-view", { method: "POST", body }),
  login: async (identifier, password) => {
    clearApiCache();
    const result = await request("/auth/login", {
      method: "POST",
      body: { identifier, password },
    });
    clearApiCache();
    return result;
  },
  logout: () => request("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword, newPassword) =>
    request("/auth/password/change", {
      method: "POST",
      body: { currentPassword, newPassword, confirmPassword: newPassword },
    }),
  changeStudentPassword: (currentPassword, newPassword, confirmPassword) =>
    request("/auth/password/change", {
      method: "POST",
      body: { currentPassword, newPassword, confirmPassword },
    }),
  changeAdminPassword: (currentPassword, newPassword, confirmPassword) =>
    request("/auth/password/admin-change", {
      method: "POST",
      body: { currentPassword, newPassword, confirmPassword },
    }),
  requestPasswordReset: (email) =>
    request("/auth/password/request-reset", {
      method: "POST",
      body: { email },
    }),
  resetPassword: (token, newPassword) =>
    request("/auth/password/reset", {
      method: "POST",
      body: { token, newPassword },
    }),

  // Notifications
  getNotifications: () => request("/notifications", { cacheTtlMs: 15 * 1000 }),
  markNotificationRead: (id) =>
    request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () =>
    request("/notifications/read-all", { method: "PATCH" }),
  clearAllNotifications: () =>
    request("/notifications/clear-all", { method: "DELETE" }),

  // Announcements
  createAnnouncement: (body) =>
    request("/admin/announcements/create", { method: "POST", body }),
  listAnnouncementsAdmin: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) qs.append(key, value);
    });
    return request(
      `/admin/announcements${qs.toString() ? `?${qs.toString()}` : ""}`,
      { cacheTtlMs: 60 * 1000 },
    );
  },
  updateAnnouncement: (id, body) =>
    request(`/admin/announcements/${id}`, { method: "PUT", body }),
  deleteAnnouncement: (id) =>
    request(`/admin/announcements/${id}`, { method: "DELETE" }),
  listStudentAnnouncements: () =>
    request(`/student/announcements?ts=${Date.now()}`, { skipCache: true }),

  // Company Insights (Admin)
  listCompanyBenchmarks: () =>
    request("/admin/company-insights", { cacheTtlMs: 2 * 60 * 1000 }),
  createCompanyBenchmark: (body) =>
    request("/admin/company-insights", { method: "POST", body }),
  updateCompanyBenchmark: (id, body) =>
    request(`/admin/company-insights/${id}`, { method: "PUT", body }),
  deleteCompanyBenchmark: (id) =>
    request(`/admin/company-insights/${id}`, { method: "DELETE" }),
  uploadCompanyBenchmarks: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/admin/company-insights/upload", {
      method: "POST",
      formData: fd,
    });
  },
  downloadCompanyBenchmarkTemplate: () =>
    request("/admin/company-insights/template", { skipCache: true }),

  // Student Analysis
  getStudentAnalysis: (forceRefresh = false) =>
    request(`/student/analysis${forceRefresh ? "?refresh=1" : ""}`, {
      skipCache: forceRefresh,
      cacheTtlMs: 2 * 60 * 1000,
    }),
  getStudentAnalysisHistory: (days = 90, forceRefresh = false) =>
    request(`/student/analysis/history?days=${encodeURIComponent(days)}`, {
      skipCache: forceRefresh,
      cacheTtlMs: 5 * 60 * 1000,
    }),
  listStudentCompanies: () =>
    request("/student/analysis/companies", { cacheTtlMs: 10 * 60 * 1000 }),
  getCompanyReadiness: (companyId, forceRefresh = false) =>
    request(
      `/student/analysis/readiness?companyId=${encodeURIComponent(companyId)}${forceRefresh ? "&refresh=1" : ""}`,
      { skipCache: forceRefresh, cacheTtlMs: 2 * 60 * 1000 },
    ),

  // Students
  listAllStudents: (search = "", sortOrder = "asc") => {
    const options =
      search && typeof search === "object" ? search : { search, sortOrder };
    const params = new URLSearchParams();
    if (options.search) params.append("search", options.search);
    if (options.sortOrder) params.append("sortOrder", options.sortOrder);
    if (options.semester !== undefined && options.semester !== "")
      params.append("semester", options.semester);
    [
      "branch",
      "course",
      "college",
      "group",
      "coordinator",
      "credentialEmailStatus",
      "platformActivity",
      "credentialEligibility",
      "accountStatus",
      "uploadBatchId",
    ].forEach((key) => {
      if (options[key] !== undefined && options[key] !== "")
        params.append(key, options[key]);
    });
    if (options.page) params.append("page", options.page);
    if (options.limit) params.append("limit", options.limit);
    if (options.skipCache) params.append("_fresh", Date.now().toString());
    const queryString = params.toString();
    return request(`/students/list${queryString ? "?" + queryString : ""}`, {
      skipCache: Boolean(options.skipCache),
    });
  },
  // Active-only lists feed dropdowns, which never show per-entry student counts.
  listMasterData: ({ category = "", activeOnly = false, includeUsage = !activeOnly } = {}) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (activeOnly) params.set("active", "true");
    if (!includeUsage) params.set("usage", "false");
    const query = params.toString();
    return request(`/master-data${query ? `?${query}` : ""}`, {
      skipCache: true,
    });
  },
  createMasterData: (body) =>
    request("/master-data", { method: "POST", body }),
  updateMasterData: (id, body) =>
    request(`/master-data/${id}`, { method: "PUT", body }),
  deleteMasterData: (id) =>
    request(`/master-data/${id}`, { method: "DELETE" }),
  syncMasterData: () =>
    request("/master-data/sync", { method: "POST" }),
  listAllSpecialStudents: (search = "", sortOrder = "asc") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (sortOrder) params.append("sortOrder", sortOrder);
    const queryString = params.toString();
    return request(`/students/special${queryString ? "?" + queryString : ""}`);
  },
  listSpecialStudentsByEvent: (eventId) =>
    request(`/students/special/${eventId}`),
  getStudentByIdForAdmin: (studentId) => request(`/students/${studentId}`),
  getStudentActivityByAdmin: (studentId) =>
    request(`/students/${studentId}/activity`),
  getStudentStatsByAdmin: (studentId) =>
    request(`/students/${studentId}/stats`),
  getStudentVideosWatchedByAdmin: (studentId) =>
    request(`/students/${studentId}/videos-watched`),
  getStudentCoursesEnrolledByAdmin: (studentId) =>
    request(`/students/${studentId}/courses-enrolled`),
  checkStudentsCsv: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/students/check", { method: "POST", formData: fd });
  },
  uploadStudentsCsv: (file, batchName = "", featureAccess) => {
    const fd = new FormData();
    fd.append("file", file);
    if (batchName) fd.append("batchName", batchName);
    if (featureAccess) fd.append("featureAccess", JSON.stringify(featureAccess));
    return request("/students/upload", {
      method: "POST",
      formData: fd,
      timeoutMs: 12 * 1000,
    });
  },
  listStudentUploadBatches: (search = "") =>
    request(
      `/students/upload-batches${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      { skipCache: true },
    ),
  createStudentUploadBatch: (body) =>
    request("/students/upload-batches", { method: "POST", body }),
  renameStudentUploadBatch: (batchId, name) =>
    request(`/students/upload-batches/${batchId}`, {
      method: "PATCH",
      body: { name },
    }),
  deleteStudentUploadBatch: (batchId) =>
    request(`/students/upload-batches/${batchId}`, { method: "DELETE" }),
  createStudent: (body) =>
    request("/students/create", { method: "POST", body }),
  getStudentAccessPolicy: () =>
    request("/students/access-policy", { skipCache: true }),
  updateStudentAccessPolicy: (body) =>
    request("/students/access-policy", { method: "PUT", body, skipCache: true }),
  getStudentAccess: (studentId) =>
    request(`/students/${encodeURIComponent(studentId)}/access`, { skipCache: true }),
  updateStudentAccess: (studentId, access) =>
    request(`/students/${encodeURIComponent(studentId)}/access`, { method: "PATCH", body: { access }, skipCache: true }),
  listPromotionSemesters: () =>
    request("/students/promotion/semesters", { skipCache: true }),
  listPromotionStudents: (semester) =>
    request(`/students/promotion/semesters/${semester}/students`, {
      skipCache: true,
    }),
  promoteStudents: (body) =>
    request("/students/promotion/promote", { method: "POST", body }),
  updateStudent: (studentId, body) =>
    request(`/students/${studentId}`, { method: "PUT", body }),
  deleteStudent: (studentId) =>
    request(`/students/${studentId}`, { method: "DELETE" }),
  bulkDeleteStudents: (studentIds) =>
    request("/students/bulk-delete", {
      method: "POST",
      body: { studentIds },
      timeoutMs: 60 * 1000,
      skipDedupe: true,
    }),
  bulkDeleteAllMatchingStudents: (filters) =>
    request("/students/bulk-delete", {
      method: "POST",
      body: { allMatching: true, filters },
      timeoutMs: 120 * 1000,
      skipDedupe: true,
    }),
  resendStudentCredentials: (studentIds) =>
    request("/students/resend-credentials", {
      method: "POST",
      body: { studentIds },
    }),
  exportStudentsCsv: async (options = {}) => {
    const params = new URLSearchParams();
    [
      "search",
      "sortOrder",
      "semester",
      "branch",
      "course",
      "college",
      "group",
      "coordinator",
      "credentialEmailStatus",
      "platformActivity",
      "credentialEligibility",
      "accountStatus",
      "uploadBatchId",
    ].forEach((key) => {
      if (options[key] !== undefined && options[key] !== "")
        params.append(key, options[key]);
    });
    const queryString = params.toString();
    const res = await fetch(
      `${API_BASE}/students/export${queryString ? `?${queryString}` : ""}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error("Failed to export students");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const disposition = res.headers.get("Content-Disposition") || "";
    a.download =
      disposition.match(/filename="?([^";]+)"?/i)?.[1] || "students-export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { count: Number(res.headers.get("X-Exported-Count")) || 0 };
  },

  listBulkUploads: (options = {}) => {
    const params = new URLSearchParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    });
    return request(`/bulk-uploads${params.toString() ? `?${params.toString()}` : ""}`, { skipCache: true });
  },
  getBulkUploadDeletePreview: (batchId) =>
    request(`/bulk-uploads/${batchId}/delete-preview`, { skipCache: true }),
  renameBulkUpload: (batchId, name) =>
    request(`/bulk-uploads/${batchId}`, { method: "PATCH", body: { name } }),
  updateBulkUploadStatus: (batchId, status) =>
    request(`/bulk-uploads/${batchId}/status`, { method: "PATCH", body: { status } }),
  deleteBulkUpload: (batchId, confirmation, mode = "created_records") =>
    request(`/bulk-uploads/${batchId}`, { method: "DELETE", body: { confirmation, mode } }),
  downloadBulkUpload: async (batchId, kind = "data") => {
    const res = await fetch(`${API_BASE}/bulk-uploads/${batchId}/download?kind=${encodeURIComponent(kind)}`, { credentials: "include" });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || "Download failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const disposition = res.headers.get("Content-Disposition") || "";
    a.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "bulk-upload.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Coordinators
  listAllCoordinators: (search = "") => {
    const options = search && typeof search === "object" ? search : { search };
    const params = new URLSearchParams();
    if (options.search) params.set("search", options.search);
    if (options.page) params.set("page", options.page);
    if (options.limit) params.set("limit", options.limit);
    const query = params.toString();
    return request(`/coordinators/list${query ? `?${query}` : ""}`);
  },
  createCoordinator: (body) =>
    request("/coordinators/create", { method: "POST", body }),
  bulkCreateCoordinators: (coordinators, metadata = {}) =>
    request("/coordinators/bulk-create", {
      method: "POST",
      body: { coordinators, ...metadata },
    }),
  updateCoordinator: (coordinatorId, body) =>
    request(`/coordinators/${coordinatorId}`, { method: "PUT", body }),
  getCoordinatorAccess: (coordinatorId) =>
    request(`/coordinators/${coordinatorId}/access`, { skipCache: true }),
  updateCoordinatorAccess: (coordinatorId, body) =>
    request(`/coordinators/${coordinatorId}/access`, { method: "PUT", body }),
  updateCoordinatorStatus: (coordinatorId, isActive) =>
    request(`/coordinators/${coordinatorId}/status`, {
      method: "PATCH",
      body: { isActive },
    }),
  deleteCoordinator: (coordinatorId) =>
    request(`/coordinators/${coordinatorId}`, { method: "DELETE" }),
  resendCoordinatorCredentials: (coordinatorIds) =>
    request("/coordinators/resend-credentials", {
      method: "POST",
      body: { coordinatorIds },
    }),

  // Events
  listEvents: (options = {}) => {
    const params = new URLSearchParams();
    if (options.page) params.set("page", options.page);
    if (options.limit) params.set("limit", options.limit);
    if (options.view) params.set("view", options.view);
    for (const key of ['search', 'period', 'type', 'sort', 'lifecycle']) {
      if (options[key]) params.set(key, options[key]);
    }
    const query = params.toString();
    return request(`/events${query ? `?${query}` : ""}`);
  },
  createEvent: ({
    name,
    description,
    startDate,
    endDate,
    template,
    selectionMode = "all",
    participantFilters = {},
    allowedParticipants = [],
    excludedParticipants = [],
    status = "published",
  }) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("description", description);
    if (startDate) fd.append("startDate", startDate);
    if (endDate) fd.append("endDate", endDate);
    fd.append("selectionMode", selectionMode);
    fd.append("participantFilters", JSON.stringify(participantFilters));
    fd.append("allowedParticipants", JSON.stringify(allowedParticipants));
    fd.append("excludedParticipants", JSON.stringify(excludedParticipants));
    fd.append("status", status);
    if (template) fd.append("template", template);
    return request("/events", { method: "POST", formData: fd });
  },
  checkSpecialEventCsv: (file) => {
    const fd = new FormData();
    fd.append("csv", file);
    return request("/events/special/check-csv", {
      method: "POST",
      formData: fd,
    });
  },
  checkInterviewParticipantCsv: (file) => {
    const fd = new FormData();
    fd.append("csv", file);
    return request("/events/participants/check-csv", {
      method: "POST",
      formData: fd,
    });
  },
  createSpecialEvent: ({
    name,
    description,
    startDate,
    endDate,
    template,
    csv,
  }) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("description", description);
    if (startDate) fd.append("startDate", startDate);
    if (endDate) fd.append("endDate", endDate);
    if (template) fd.append("template", template);
    if (csv) fd.append("csv", csv);
    return request("/events/special", { method: "POST", formData: fd });
  },
  joinEvent: (eventId, expectedCost = null) =>
    request(`/events/${eventId}/join`, { method: "POST", headers: coinCostHeader(expectedCost) }),
  exportParticipantsCsv: (eventId) =>
    request(`/events/${eventId}/participants.csv`),
  updateEventTemplate: (eventId, file) => {
    const fd = new FormData();
    fd.append("template", file);
    return request(`/events/${eventId}/template`, {
      method: "POST",
      formData: fd,
    });
  },
  deleteEventTemplate: (eventId) =>
    request(`/events/${eventId}/template`, { method: "DELETE" }),
  getEvent: (eventId) => request(`/events/${eventId}`),
  updateEvent: (eventId, body) =>
    request(`/events/${eventId}`, { method: "PATCH", body }),
  updateEventStatus: (eventId, status) =>
    request(`/events/${eventId}/status`, { method: "PATCH", body: { status } }),
  listEventParticipants: (eventId) =>
    request(`/events/${eventId}/participants`),
  addEventParticipants: (eventId, studentIds) =>
    request(`/events/${eventId}/participants`, {
      method: "POST",
      body: { studentIds },
    }),
  removeEventParticipant: (eventId, studentId, reason = "") =>
    request(`/events/${eventId}/participants/${studentId}`, {
      method: "DELETE",
      body: { reason },
    }),
  sendEventInvitations: (eventId, studentIds = []) =>
    request(`/events/${eventId}/invitations`, {
      method: "POST",
      body: { studentIds },
    }),
  getMailBatchStatus: (batchId) =>
    request(`/mail-queue/batches/${batchId}`, { skipCache: true }),
  retryFailedMailBatch: (batchId) =>
    request(`/mail-queue/batches/${batchId}/retry`, { method: "POST" }),
  listTargetMailStatus: (targetType, targetId) =>
    request(`/mail-queue/targets/${targetType}/${targetId}`, {
      skipCache: true,
    }),
  deleteEvent: (eventId, reason = "") =>
    request(`/events/${eventId}`, { method: "DELETE", body: { reason } }),
  archiveEvent: (eventId) =>
    request(`/events/${eventId}`, {
      method: "DELETE",
      body: { reason: "Deleted by administrator." },
    }),
  getEventAnalytics: (eventId) => request(`/events/${eventId}/analytics`),
  getEventTemplateUrl: (eventId) => request(`/events/${eventId}/template-url`),

  // Assessments (Admin)
  previewAssessmentStudents: (students) =>
    request("/admin/assessment/students/preview", { method: "POST", body: { students } }),
  createAssessment: (body) =>
    request("/admin/assessment/create", { method: "POST", body }),
  sendAssessmentTestEmail: (assessment) =>
    request("/admin/assessment/test-email", { method: "POST", body: { assessment } }),
  listAssessments: (options = {}) => {
    const params = new URLSearchParams();
    if (options.page) params.set("page", options.page);
    if (options.limit) params.set("limit", options.limit);
    if (options.view) params.set("view", options.view);
    const query = params.toString();
    return request(`/admin/assessment/list${query ? `?${query}` : ""}`);
  },
  // Editing must always hydrate from the latest persisted assessment. A stale
  // settings response can make toggles appear to change between edit sessions.
  getAssessmentById: (id) => request(`/admin/assessment/${id}`, { skipCache: true }),
  updateAssessment: (id, body) =>
    request(`/admin/assessment/${id}`, { method: "PUT", body }),
  deleteAssessment: (id) =>
    request(`/admin/assessment/${id}`, { method: "DELETE" }),
  resetAssessmentSubmissions: (id) =>
    request(`/admin/assessment/${id}/reset-submissions`, { method: "POST" }),
  listAssessmentEligibleStudents: (id) =>
    request(`/admin/assessment/${id}/eligible-students`, { skipCache: true }),
  addAssessmentEligibleStudents: (id, studentIds = [], students = []) =>
    request(`/admin/assessment/${id}/students`, {
      method: "POST",
      body: { studentIds, students },
    }),
  resetAssessmentStudentSubmission: (id, studentId) =>
    request(`/admin/assessment/${id}/students/${studentId}/reset-submission`, {
      method: "POST",
    }),
  removeAssessmentEligibleStudent: (id, studentId) =>
    request(`/admin/assessment/${id}/students/${studentId}`, {
      method: "DELETE",
    }),
  updateAssessmentStudentSet: (id, studentId, setNumber) =>
    request(`/admin/assessment/${id}/students/${studentId}/set`, {
      method: "PATCH",
      body: { setNumber },
    }),
  updateAssessmentStudentSets: (id, studentIds, setNumber) =>
    request(`/admin/assessment/${id}/students/sets`, {
      method: "PATCH",
      body: { studentIds, setNumber },
    }),
  removeAssessmentEligibleStudents: (id, studentIds) =>
    request(`/admin/assessment/${id}/students/remove`, {
      method: "POST",
      body: { studentIds },
    }),
  sendAssessmentInvitations: (id) =>
    request(`/admin/assessment/${id}/send-invitations`, {
      method: "POST",
      body: {},
    }),
  getAssessmentInvitation: (id) => request(`/admin/assessment/${id}/invitation`, { skipCache: true }),
  previewAssessmentInvitation: (id, body) => request(`/admin/assessment/${id}/invitation/preview`, { method: "POST", body }),
  updateAssessmentInvitation: (id, body) => request(`/admin/assessment/${id}/invitation`, { method: "PUT", body }),
  sendAssessmentInvitationTest: (id, body) => request(`/admin/assessment/${id}/invitation/test`, { method: "POST", body }),
  markAssessmentComplete: (id) =>
    request(`/admin/assessment/${id}/mark-complete`, { method: "POST" }),
  releaseAssessmentAnswers: (id) =>
    request(`/admin/assessment/${id}/release-answers`, { method: "POST" }),
  getAssessmentReports: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "")
        qs.append(key, String(value));
    });
    return request(
      `/admin/assessment/reports${qs.toString() ? `?${qs.toString()}` : ""}`,
    );
  },
  getAssessmentReportsExportData: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "")
        qs.append(key, String(value));
    });
    return request(
      `/admin/assessment/reports/export-data${qs.toString() ? `?${qs.toString()}` : ""}`,
      { skipCache: true, timeoutMs: 60000 },
    );
  },
  getStudentAssessmentReport: (submissionId) =>
    request(`/admin/assessment/reports/submissions/${submissionId}`, {
      skipCache: true,
    }),
  // Live report roster: the full roster without `since`, or only the rows
  // changed after the cursor with it. Never cached or deduplicated.
  getAssessmentReportRoster: (assessmentId, { since, signal } = {}) =>
    request(
      `/admin/assessment/${encodeURIComponent(assessmentId)}/report/roster${since ? `?since=${encodeURIComponent(since)}` : ""}`,
      { skipCache: true, skipDedupe: true, signal, timeoutMs: 30000 },
    ),
  releaseAssessmentResults: (assessmentId, release = true) =>
    request(`/admin/assessment/${encodeURIComponent(assessmentId)}/release-results`, {
      method: "POST",
      body: { release: Boolean(release) },
    }),
  exportAssessmentReports: async (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "")
        qs.append(key, String(value));
    });
    const res = await fetch(
      `${API_BASE}/admin/assessment/reports/export${qs.toString() ? `?${qs.toString()}` : ""}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error("Failed to export report");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assessment-report.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  exportAssessmentReportsExcel: async (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "")
        qs.append(key, String(value));
    });
    const res = await fetch(
      `${API_BASE}/admin/assessment/reports/export/excel${qs.toString() ? `?${qs.toString()}` : ""}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error("Failed to export Excel report");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const timestamp = new Date().toISOString().split("T")[0];
    a.download = `assessment-report-${timestamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  listLibraryQuestions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (
        key !== "skipCache" &&
        value !== undefined &&
        value !== null &&
        value !== ""
      )
        qs.append(key, String(value));
    });
    return request(
      `/admin/library/questions${qs.toString() ? `?${qs.toString()}` : ""}`,
      {
        cacheTtlMs: 30 * 1000,
        skipCache: Boolean(params.skipCache),
      },
    );
  },
  listCodingTopics: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") qs.append(key, String(value));
    });
    return request(`/admin/library/coding-topics${qs.toString() ? `?${qs.toString()}` : ""}`, {
      cacheTtlMs: 30 * 1000,
      skipCache: Boolean(params.skipCache),
    });
  },
  createCodingTopic: (body) =>
    request("/admin/library/coding-topics", { method: "POST", body }),
  listCodingTags: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") qs.append(key, String(value));
    });
    return request(`/admin/library/coding-tags${qs.toString() ? `?${qs.toString()}` : ""}`, {
      cacheTtlMs: 30 * 1000,
      skipCache: Boolean(params.skipCache),
    });
  },
  createCodingTag: (body) =>
    request("/admin/library/coding-tags", { method: "POST", body }),
  createLibraryQuestion: (question) =>
    request("/admin/library/questions", { method: "POST", body: { question } }),
  createLibraryQuestionsBulk: (questions, uploadMetadata) =>
    request("/admin/library/questions/bulk", {
      method: "POST",
      body: { questions, uploadMetadata },
    }),
  uploadLibraryQuestionAsset: (file) => {
    const fd = new FormData();
    fd.append("image", file);
    return request("/admin/library/assets", {
      method: "POST",
      formData: fd,
      timeoutMs: 30 * 1000,
    });
  },
  getLibraryQuestion: (id) =>
    request(`/admin/library/questions/${id}`, { skipCache: true }),
  updateLibraryQuestion: (id, body) =>
    request(`/admin/library/questions/${id}`, { method: "PATCH", body }),
  deleteLibraryQuestion: (id) =>
    request(`/admin/library/questions/${id}`, { method: "DELETE" }),
  resolveLibraryQuestions: (ids = []) =>
    request("/admin/library/questions/resolve", {
      method: "POST",
      body: { ids },
    }),

  // Assessments (Student)
  listStudentAssessments: () => request("/student/assessments"),
  getStudentAssessmentDashboard: () => request("/student/assessment-dashboard"),
  startStudentAssessment: (id, password = "") =>
    request(`/student/assessment/${id}/start`, {
      method: "POST",
      body: { password },
    }),
  markStudentAssessmentSetupStep: (id, step, meta, attemptContext = {}) =>
    request(`/student/assessment/${id}/setup-step`, {
      method: "POST",
      body: { step, ...(meta ? { meta } : {}), ...attemptContext },
    }),
  beginStudentAssessment: (id, sessionId, attemptGeneration, submissionId) =>
    request(`/student/assessment/${id}/begin`, {
      method: "POST",
      body: { sessionId, ...(attemptGeneration === undefined ? {} : { attemptGeneration }), ...(submissionId ? { submissionId } : {}) },
    }),
  getStudentAssessment: (id) => request(`/student/assessment/${id}`, { skipCache: true }),
  createStudentAssessmentEvidenceUpload: (id, body) =>
    request(`/student/assessment/${id}/evidence/upload-url`, { method: "POST", body, timeoutMs: 10000 }),
  logStudentAssessmentViolation: (id, body) =>
    request(`/student/assessment/${id}/violations`, {
      method: "POST",
      body,
      timeoutMs: 10000,
      skipQueue: true,
    }),
  sendStudentAssessmentHeartbeat: (id, body) =>
    request(`/student/assessment/${id}/heartbeat`, {
      method: "POST",
      body,
      timeoutMs: 6000,
    }),
  logStudentAssessmentMonitoring: (id, body) =>
    request(`/student/assessment/${id}/monitoring`, {
      method: "POST",
      body,
      timeoutMs: 10000,
    }),
  // Answer writes bypass the shared client queue: a burst of background GETs
  // must never turn a save or the final submit into a synthetic 429.
  saveStudentAssessmentProgress: (id, body) =>
    request(`/student/assessment/${id}/answers`, {
      method: "PATCH",
      body,
      timeoutMs: 10000,
      skipQueue: true,
    }),
  submitStudentAssessment: (body) =>
    request("/student/assessment/submit", { method: "POST", body, timeoutMs: 30000, skipQueue: true }),
  getAssessmentEvidence: (eventId) =>
    request(`/admin/assessment/evidence/${encodeURIComponent(eventId)}`, { skipCache: true }),
  getSubmissionViolations: (submissionId, { before } = {}) =>
    request(`/admin/assessment/submissions/${submissionId}/violations${before ? `?before=${encodeURIComponent(before)}` : ''}`, {
      skipCache: true,
    }),

  // Assessment feedback
  getStudentAssessmentFeedback: (assessmentId) =>
    request(`/assessment-feedback/student/${assessmentId}`, {
      skipCache: true,
    }),
  submitStudentAssessmentFeedback: (assessmentId, body) =>
    request(`/assessment-feedback/student/${assessmentId}`, {
      method: "POST",
      body,
    }),
  listAssessmentFeedbackAssessments: (qs = "") =>
    request(`/assessment-feedback/admin/assessments${qs ? `?${qs}` : ""}`, {
      skipCache: true,
    }),
  listAssessmentFeedback: (assessmentId, qs = "") =>
    request(
      `/assessment-feedback/admin/assessments/${assessmentId}${qs ? `?${qs}` : ""}`,
      { skipCache: true },
    ),

  // Pairing

  // Pair status changes after schedule mutations, so this must never return a
  // cached pre-confirmation response.
  listPairs: (eventId) => request(`/pairing/${eventId}`, { skipCache: true }),
  getPairDetails: (pairId) => request(`/pairing/pair/${pairId}`),
  setPairMeetingLink: (pairId, meetingLink) =>
    request(`/pairing/pair/${pairId}/link`, {
      method: "POST",
      body: { meetingLink },
    }),

  // Scheduling
  proposeSlots: (pairId, slots) =>
    request(`/schedule/${pairId}/propose`, { method: "POST", body: { slots } }),
  confirmSlot: (pairId, scheduledAt, meetingLink) =>
    request(`/schedule/${pairId}/confirm`, {
      method: "POST",
      body: { scheduledAt, meetingLink },
    }),
  rejectSlots: (pairId) =>
    request(`/schedule/${pairId}/reject`, { method: "POST" }),

  // Feedback
  submitFeedback: (pairId, ratings, suggestions) =>
    request("/feedback/submit", {
      method: "POST",
      body: { pairId, ratings, suggestions },
    }),
  exportFeedbackCsv: (eventId) => request(`/feedback/event/${eventId}.csv`),
  listFeedback: (qs = "") =>
    request(`/feedback/admin/list${qs ? "?" + qs : ""}`),
  exportFilteredFeedbackCsv: (qs = "") =>
    request(`/feedback/admin/export.csv${qs ? "?" + qs : ""}`),
  listCoordinatorFeedback: (qs = "") =>
    request(`/feedback/coordinator/list${qs ? "?" + qs : ""}`),
  exportCoordinatorFeedbackCsv: (qs = "") =>
    request(`/feedback/coordinator/export.csv${qs ? "?" + qs : ""}`),
  myFeedback: (eventId) =>
    request(`/feedback/mine${eventId ? "?eventId=" + eventId : ""}`),
  feedbackForMe: (eventId) =>
    request(`/feedback/for-me${eventId ? "?eventId=" + eventId : ""}`),

  // Semesters, Subjects, Chapters, and Topics (Coordinator only)
  listSemesters: () => request("/subjects"),
  createSemester: (semesterName, semesterDescription) =>
    request("/subjects", {
      method: "POST",
      body: { semesterName, semesterDescription },
    }),
  updateSemester: (id, data) =>
    request(`/subjects/${id}`, { method: "PUT", body: data }),
  deleteSemester: (id) => request(`/subjects/${id}`, { method: "DELETE" }),
  reorderSemesters: (semesterIds) =>
    request("/subjects/reorder", { method: "POST", body: { semesterIds } }),
  cleanupDuplicateSemesters: () =>
    request("/subjects/cleanup-duplicates", { method: "POST" }),

  addSubject: (semesterId, subjectName, subjectDescription) =>
    request(`/subjects/${semesterId}/subjects`, {
      method: "POST",
      body: { subjectName, subjectDescription },
    }),
  updateSubject: (semesterId, subjectId, data) =>
    request(`/subjects/${semesterId}/subjects/${subjectId}`, {
      method: "PUT",
      body: data,
    }),
  deleteSubject: (semesterId, subjectId) =>
    request(`/subjects/${semesterId}/subjects/${subjectId}`, {
      method: "DELETE",
    }),
  reorderSubjects: (semesterId, subjectIds) =>
    request(`/subjects/${semesterId}/subjects/reorder`, {
      method: "POST",
      body: { subjectIds },
    }),

  addChapter: (semesterId, subjectId, chapterName, importanceLevel) =>
    request(`/subjects/${semesterId}/subjects/${subjectId}/chapters`, {
      method: "POST",
      body: { chapterName, importanceLevel },
    }),
  updateChapter: (semesterId, subjectId, chapterId, data) =>
    request(
      `/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}`,
      { method: "PUT", body: data },
    ),
  deleteChapter: (semesterId, subjectId, chapterId) =>
    request(
      `/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}`,
      { method: "DELETE" },
    ),
  reorderChapters: (semesterId, subjectId, chapterIds) =>
    request(`/subjects/${semesterId}/subjects/${subjectId}/chapters/reorder`, {
      method: "POST",
      body: { chapterIds },
    }),

  addTopic: (semesterId, subjectId, chapterId, formData) => {
    return request(
      `/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics`,
      { method: "POST", formData },
    );
  },
  updateTopic: (semesterId, subjectId, chapterId, topicId, formData) => {
    return request(
      `/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics/${topicId}`,
      { method: "PUT", formData },
    );
  },
  deleteTopic: (semesterId, subjectId, chapterId, topicId) =>
    request(
      `/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics/${topicId}`,
      { method: "DELETE" },
    ),
  reorderTopics: (semesterId, subjectId, chapterId, topicIds) =>
    request(
      `/subjects/${semesterId}/subjects/${subjectId}/chapters/${chapterId}/topics/reorder`,
      { method: "POST", body: { topicIds } },
    ),

  // Learning (Student)
  getAllSemestersForStudent: () => request("/learning/semesters"),
  getCoordinatorSubjects: (coordinatorId) =>
    request(`/learning/coordinator/${coordinatorId}/subjects`),
  getSubjectDetails: (semesterId, subjectId) =>
    request(`/learning/semester/${semesterId}/subject/${subjectId}`),
  startVideoTracking: (
    topicId,
    semesterId,
    subjectId,
    chapterId,
    coordinatorId,
  ) =>
    request(`/learning/topic/${topicId}/start`, {
      method: "POST",
      body: { semesterId, subjectId, chapterId, coordinatorId },
    }),
  updateTopicProgress: (
    semesterId,
    subjectId,
    chapterId,
    topicId,
    videoWatchedSeconds,
    coordinatorId,
  ) =>
    request(
      `/learning/semester/${semesterId}/subject/${subjectId}/chapter/${chapterId}/topic/${topicId}/progress`,
      {
        method: "POST",
        body: { videoWatchedSeconds, coordinatorId },
      },
    ),
  trackWatchTime: (topicId, data) =>
    request(`/learning/topic/${topicId}/track-watch-time`, {
      method: "POST",
      body: data,
    }),
  getTopicProgress: (topicId) => request(`/learning/topic/${topicId}/progress`),
  getSubjectProgress: (subjectId) =>
    request(`/learning/subject/${subjectId}/progress`),
  getStudentProgress: () => request("/learning/progress"),

  // Learning Analytics (Admin/Coordinator)
  getSubjectAnalytics: (semesterId, subjectId) =>
    request(`/learning/analytics/subject/${semesterId}/${subjectId}`),

  markTopicComplete: (
    topicId,
    semesterId,
    subjectId,
    chapterId,
    coordinatorId,
  ) =>
    request(`/learning/topic/${topicId}/complete`, {
      method: "POST",
      body: { semesterId, subjectId, chapterId, coordinatorId },
    }),
  markTopicIncomplete: (
    topicId,
    semesterId,
    subjectId,
    chapterId,
    coordinatorId,
  ) =>
    request(`/learning/topic/${topicId}/incomplete`, {
      method: "POST",
      body: { semesterId, subjectId, chapterId, coordinatorId },
    }),

  // Activity Tracking
  getActivities: (queryString) =>
    request(`/activity${queryString ? "?" + queryString : ""}`),
  getActivityStats: (queryString) =>
    request(`/activity/stats${queryString ? "?" + queryString : ""}`),
  logActivity: ({
    actionType,
    targetType,
    targetId,
    description,
    changes,
    metadata,
  }) =>
    request("/activity", {
      method: "POST",
      body: {
        actionType,
        targetType,
        targetId,
        description,
        changes,
        metadata,
      },
    }),

  // Email Templates (Admin)
  listEmailTemplates: (search = "") =>
    request(
      `/email-templates${search ? "?search=" + encodeURIComponent(search) : ""}`,
    ),
  getEmailTemplate: (id) => request(`/email-templates/${id}`),
  createEmailTemplate: (body) =>
    request("/email-templates", { method: "POST", body }),
  updateEmailTemplate: (id, body) =>
    request(`/email-templates/${id}`, { method: "PUT", body }),
  deleteEmailTemplate: (id) =>
    request(`/email-templates/${id}`, { method: "DELETE" }),
  listMailQueue: (options = {}) => {
    const params = new URLSearchParams();
    ["search", "type", "status", "dateFrom", "dateTo", "page", "limit"].forEach(
      (key) => {
        if (options[key] !== undefined && options[key] !== "")
          params.append(key, options[key]);
      },
    );
    return request(`/mail-queue/jobs?${params.toString()}`, {
      skipCache: true,
    });
  },

  // Join Requests
  submitJoinRequest: (data) =>
    request("/join/submit", { method: "POST", body: data }),
  checkJoinStatus: (email) =>
    request(`/join/status?email=${encodeURIComponent(email)}`),
  // Compiler Module
  getCompilerOverview: () =>
    request("/compiler/overview", { cacheTtlMs: 30 * 1000 }),
  listCompilerProblems: ({
    search = "",
    difficulty = "",
    tags = "",
    status = "",
    visibility = "",
    sortBy = "updatedAt",
    sortOrder = "desc",
    page = 1,
    limit = 8,
    skipCache = false,
  } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (difficulty) params.append("difficulty", difficulty);
    if (tags) params.append("tags", tags);
    if (status) params.append("status", status);
    if (visibility) params.append("visibility", visibility);
    if (sortBy) params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);
    params.append("page", String(page));
    params.append("limit", String(limit));
    return request(`/compiler/problems?${params.toString()}`, {
      cacheTtlMs: 30 * 1000,
      skipCache,
    });
  },
  createCompilerProblem: (formData) =>
    request("/compiler/problems", { method: "POST", formData }),
  uploadCompilerProblemAsset: (file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request("/compiler/problem-assets", {
      method: "POST",
      formData,
      timeoutMs: 30 * 1000,
    });
  },
  updateCompilerProblem: (problemId, formData) =>
    request(`/compiler/problems/${problemId}`, { method: "PUT", formData }),
  cloneCompilerProblemForAssessment: (problemId, { assessmentId, draftKey } = {}) => {
    const fd = new FormData();
    if (assessmentId) fd.append("assessmentId", assessmentId);
    if (draftKey) fd.append("draftKey", draftKey);
    return request(`/compiler/problems/${problemId}/assessment-clone`, { method: "POST", formData: fd });
  },
  updateCompilerProblemVisibility: (problemId, visibility) => {
    const fd = new FormData();
    fd.append("visibility", visibility);
    return request(`/compiler/problems/${problemId}/visibility`, {
      method: "PATCH",
      formData: fd,
    });
  },
  updateCompilerProblemStatus: (problemId, status) => {
    const fd = new FormData();
    fd.append("status", status);
    return request(`/compiler/problems/${problemId}/status`, {
      method: "PATCH",
      formData: fd,
    });
  },
  deleteCompilerProblem: (problemId) =>
    request(`/compiler/problems/${problemId}`, { method: "DELETE" }),
  getCompilerProblem: (problemId) =>
    request(`/compiler/problems/${problemId}`, { skipCache: true }),
  getCompilerProblemPreview: (problemId) =>
    request(`/compiler/problems/${problemId}?view=preview`, { skipCache: true }),
  runCompilerPreview: (formData) =>
    request("/compiler/problems/preview/run", { method: "POST", formData }),
  approveCompilerProblemPreview: (problemId, formData) =>
    request(`/compiler/problems/${problemId}/preview/approve`, {
      method: "POST",
      formData,
    }),
  runCompilerProblem: (
    problemId,
    { language, sourceCode, customInput = "" },
  ) => {
    const fd = new FormData();
    fd.append("language", language);
    fd.append("sourceCode", sourceCode);
    fd.append("customInput", customInput);
    return request(`/compiler/problems/${problemId}/run`, {
      method: "POST",
      formData: fd,
    });
  },
  submitCompilerProblem: (problemId, { language, sourceCode }) => {
    const fd = new FormData();
    fd.append("language", language);
    fd.append("sourceCode", sourceCode);
    return request(`/compiler/problems/${problemId}/submit`, {
      method: "POST",
      formData: fd,
      timeoutMs: 0,
    });
  },
  listCompilerSubmissions: ({
    search = "",
    status = "",
    language = "",
    mode = "",
    page = 1,
    limit = 15,
  } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (language) params.append("language", language);
    if (mode) params.append("mode", mode);
    params.append("page", String(page));
    params.append("limit", String(limit));
    return request(`/compiler/submissions?${params.toString()}`, {
      cacheTtlMs: 15 * 1000,
    });
  },
  getCompilerAnalytics: ({
    studentId = "",
    studentIds = [],
    problemId = "",
    problemIds = [],
    assessmentId = "",
    assessmentIds = [],
    semester = "",
    semesters = [],
    group = "",
    groups = [],
    branches = [],
    courses = [],
    colleges = [],
    uploadBatchIds = [],
    topic = "",
    topics = [],
    difficulties = [],
    problemStatuses = [],
    languages = [],
    dateFrom = "",
    dateTo = "",
  } = {}) => {
    const params = new URLSearchParams();
    const appendList = (key, values, fallback) => {
      const list = Array.isArray(values)
        ? values.filter((value) => value !== "" && value != null)
        : [];
      if (list.length) params.append(key, list.join(","));
      else if (fallback) params.append(key, fallback);
    };
    appendList("studentId", studentIds, studentId);
    appendList("problemId", problemIds, problemId);
    appendList("assessmentId", assessmentIds, assessmentId);
    appendList("semester", semesters, semester);
    appendList("group", groups, group);
    appendList("branch", branches, "");
    appendList("course", courses, "");
    appendList("college", colleges, "");
    appendList("uploadBatchId", uploadBatchIds, "");
    appendList("topic", topics, topic);
    appendList("difficulty", difficulties, "");
    appendList("problemStatus", problemStatuses, "");
    appendList("language", languages, "");
    if (dateFrom) params.append("dateFrom", dateFrom);
    if (dateTo) params.append("dateTo", dateTo);
    const query = params.toString();
    return request(`/compiler/analytics${query ? `?${query}` : ""}`, {
      cacheTtlMs: 30 * 1000,
    });
  },
  getCompilerStudentAnalytics: (studentId) =>
    request(`/compiler/student/${studentId}`, { cacheTtlMs: 30 * 1000 }),
  getCompilerAnalyticsOverview: (options = {}) => {
    const params = new URLSearchParams();
    if (options.view) params.append("view", options.view);
    const query = params.toString();
    return request(`/compiler/analytics/overview${query ? `?${query}` : ""}`, {
      cacheTtlMs: 30 * 1000,
    });
  },
  getCompilerProblemAnalytics: (problemId) =>
    request(`/compiler/analytics/problem/${problemId}`, {
      cacheTtlMs: 30 * 1000,
    }),
  getExecutionResult: (jobId) =>
    request(`/results/${jobId}`, { skipCache: true }),
  waitForExecutionResult: async (
    jobId,
    { intervalMs = 1000, timeoutMs = 15 * 60 * 1000, onStillQueued, stillQueuedAfterMs = 8000 } = {},
  ) => {
    const startedAt = Date.now();
    const maxIntervalMs = Math.max(intervalMs, 3000);
    let polls = 0;
    let notifiedQueued = false;

    while (Date.now() - startedAt <= timeoutMs) {
      let result;
      try {
        result = await request(`/results/${jobId}`, { skipCache: true });
      } catch (error) {
        // Rate limited while polling: back off and keep waiting instead of failing a job that is still running.
        if (error?.response?.status === 429) {
          await sleep(5000);
          continue;
        }
        throw error;
      }
      const status = String(result?.status || "").toLowerCase();

      if (status === "completed") {
        return result;
      }

      if (status === "failed") {
        throw new Error(result?.error?.message || "Execution failed.");
      }

      if (status === "superseded") {
        throw new Error("This run was replaced by a newer run of the same question.");
      }

      // Jobs wait in the server queue when the judge is busy; tell the student once
      // instead of failing a job that will still finish.
      if (status === "queued" && !notifiedQueued && Date.now() - startedAt >= stillQueuedAfterMs) {
        notifiedQueued = true;
        onStillQueued?.();
      }

      // Fast at first (most runs finish in a few seconds), then ease off so a slow or
      // stuck job doesn't hammer the API once a second for minutes.
      polls += 1;
      await sleep(polls <= 5 ? intervalMs : Math.min(intervalMs * (1 + (polls - 5) * 0.25), maxIntervalMs));
    }

    throw new Error(
      "Execution is taking longer than expected. Please try again shortly.",
    );
  },
  listStudentProblems: ({
    search = "",
    difficulty = "",
    tags = "",
    companies = "",
    ids = "",
    sortBy = "displayOrder",
    sortOrder = "asc",
    page = 1,
    limit = 10,
    skipCache = false,
  } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (difficulty) params.append("difficulty", difficulty);
    if (tags) params.append("tags", tags);
    if (companies) params.append("companies", companies);
    if (ids) params.append("ids", ids);
    if (sortBy) params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);
    params.append("page", String(page));
    params.append("limit", String(limit));
    return request(`/compiler/problems?${params.toString()}`, {
      skipCache,
      cacheTtlMs: 30 * 1000,
    });
  },
  listStudentProblemCompanies: ({ search = '', limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('limit', String(limit));
    return request(`/compiler/problem-companies?${params.toString()}`, { cacheTtlMs: 60 * 1000 });
  },
  listProblemLists: () => request('/problem-lists', { skipCache: true }),
  createProblemList: (body) => request('/problem-lists', { method: 'POST', body }),
  updateProblemList: (id, body) => request(`/problem-lists/${id}`, { method: 'PATCH', body }),
  deleteProblemList: (id) => request(`/problem-lists/${id}`, { method: 'DELETE' }),
  setProblemListMembership: (listId, problemId, included) => request(`/problem-lists/${listId}/problems/${problemId}`, {
    method: 'PATCH',
    body: { included },
  }),
  getStudentProblem: (problemId) =>
    request(`/compiler/problems/${problemId}`, { skipCache: true }),
  getDailyCodingChallenge: () =>
    request('/compiler/daily-challenge', { skipCache: true }),
  getDailyChallengeSettings: () =>
    request('/compiler/daily-challenge/settings', { skipCache: true }),
  updateDailyChallengeSettings: (body) =>
    request('/compiler/daily-challenge/settings', { method: 'PATCH', body }),
  runStudentProblem: (
    problemId,
    {
      language,
      sourceCode,
      customInput = "",
      expectedOutput,
      testCases,
      assessmentId = "",
    },
  ) => {
    return request("/compiler/run", {
      method: "POST",
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
  getStudentExpectedOutput: (
    problemId,
    { language = "", customInput = "", assessmentId = "" } = {},
  ) => {
    return request(`/compiler/problems/${problemId}/expected`, {
      method: "POST",
      body: {
        language,
        stdin: customInput,
        ...(assessmentId ? { assessmentId } : {}),
      },
    });
  },
  submitStudentProblem: (
    problemId,
    { language, sourceCode, assessmentId = "" },
  ) => {
    return request("/compiler/submit", {
      method: "POST",
      body: {
        problemId,
        source_code: sourceCode,
        language_id: getJudge0LanguageId(language),
        ...(assessmentId ? { assessmentId } : {}),
      },
      timeoutMs: 0,
    });
  },
  listStudentProblemSubmissions: (
    problemId,
    { mode = "", page = 1, limit = 10 } = {},
  ) => {
    const params = new URLSearchParams();
    if (mode) params.append("mode", mode);
    params.append("page", String(page));
    params.append("limit", String(limit));
    return request(
      `/compiler/problems/${problemId}/submissions?${params.toString()}`,
      { skipCache: true },
    );
  },
};
