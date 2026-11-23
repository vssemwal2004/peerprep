const scanKey = userId => `prep-resume-pending-scan:${userId}`;

export function readPendingScan(userId) {
  try { return JSON.parse(window.sessionStorage.getItem(scanKey(userId)) || 'null'); }
  catch { return null; }
}

export function savePendingScan(userId, scan) {
  try {
    if (scan) window.sessionStorage.setItem(scanKey(userId), JSON.stringify(scan));
    else window.sessionStorage.removeItem(scanKey(userId));
  } catch { /* The scan can still finish if session storage is unavailable. */ }
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Once accepted, poll the same job through temporary network interruptions or a page reload. */
export async function followResumeScan({ submit, getStatus, jobId, remember, onStage, signal, wait = pause }) {
  let current;
  let expired = false;
  let failures = 0;
  while (true) {
    signal.throwIfAborted();
    if (!jobId) {
      current = await submit();
    } else {
      try {
        current = await getStatus(jobId, signal);
        failures = 0;
      } catch (error) {
        signal.throwIfAborted();
        const status = error.response?.status;
        if (status === 404 && !expired) {
          expired = true;
          remember(null);
          jobId = null;
          continue;
        }
        if (status === 404) remember(null);
        if (status === undefined || status === 0 || status === 429 || status >= 500) {
          if (++failures <= 4) {
            onStage('reconnect');
            await wait((800 + Math.random() * 300) * 2 ** (failures - 1), signal);
            continue;
          }
        }
        throw error;
      }
    }
    signal.throwIfAborted();
    if (current?.report) { remember(null); return current; }
    if (current?.status === 'failed') {
      remember(null);
      throw new Error(current.error?.message || 'The PDF check could not finish. Try again.');
    }
    if (!current?.jobId || !['running', 'queued'].includes(current.status)) {
      remember(null);
      throw new Error('The scan service returned an incomplete response. Try again.');
    }
    if (jobId !== current.jobId) {
      jobId = current.jobId;
      remember(jobId);
    }
    onStage(current.status === 'queued' ? 'queued' : 'read');
    const delay = Math.max(350, Number(current.retryAfterMs) || 1000);
    await wait(delay + Math.random() * Math.min(delay * 0.2, 500), signal);
  }
}
