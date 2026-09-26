// Upload the bytes to private object storage; only the signed reference travels
// through the assessment API. Legacy transport is used only when configured off.
export async function uploadAssessmentEvidence({ canvas, requestUpload, recordEvidence, context = {}, fetchUpload = globalThis.fetch }) {
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('Could not capture assessment evidence')),
    'image/jpeg', 0.45,
  ));
  const eventId = globalThis.crypto?.randomUUID?.() || `evidence-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const metadata = { eventId, type: 'camera', capturedAt: new Date().toISOString(), width: canvas.width, height: canvas.height };
  const upload = await requestUpload({ ...context, contentType: blob.type, sizeBytes: blob.size });
  if (upload.enabled === false) {
    return recordEvidence({ ...context, eventId, snapshot: { ...metadata, dataUrl: canvas.toDataURL('image/jpeg', 0.45) } });
  }
  if (!upload.uploadUrl || !(upload.uploadToken || upload.token) || !upload.objectKey) {
    throw new Error('Evidence upload was not authorized');
  }
  const response = await fetchUpload(upload.uploadUrl, {
    method: upload.method || 'PUT', body: blob,
    headers: { 'Content-Type': blob.type, ...(upload.headers || {}) },
    credentials: 'omit', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Evidence storage upload failed');
  return recordEvidence({ ...context, eventId, snapshot: {
    ...metadata, objectKey: upload.objectKey, uploadToken: upload.uploadToken || upload.token,
  } });
}
