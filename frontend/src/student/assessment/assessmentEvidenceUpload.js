// Upload the bytes to private object storage; only the signed reference travels
// through the assessment API. Legacy transport is used only when configured off.
// Cloudinary takes a signed multipart POST (upload.fields) and answers with a
// signature the API verifies; Supabase takes a raw PUT to a signed URL.
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
  let body = blob;
  let headers = { 'Content-Type': blob.type, ...(upload.headers || {}) };
  if (upload.fields) {
    body = new FormData();
    Object.entries(upload.fields).forEach(([key, value]) => body.append(key, String(value)));
    body.append('file', blob, 'evidence.jpg');
    headers = {};
  }
  const response = await fetchUpload(upload.uploadUrl, {
    method: upload.method || 'PUT', body, headers,
    credentials: 'omit', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Evidence storage upload failed');
  const stored = upload.fields ? await response.json() : null;
  return recordEvidence({ ...context, eventId, snapshot: {
    ...metadata, objectKey: upload.objectKey, uploadToken: upload.uploadToken || upload.token,
    ...(stored ? { version: stored.version, signature: stored.signature } : {}),
  } });
}
