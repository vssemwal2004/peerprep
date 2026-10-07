import crypto from 'node:crypto';

import { normalizeLeetCodeImageUrl } from './normalizeLeetCodeContent.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_BY_KIND = Object.freeze({
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});

function imageKind(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return '';
}

function abortAfter(timeoutMs) {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
}

export async function fetchVerifiedImage(sourceUrl, {
  maxBytes = MAX_IMAGE_BYTES,
  timeoutMs = 20_000,
  maxRedirects = 3,
  userAgent = 'PeerPrep draft image importer/1.0',
} = {}) {
  let currentUrl = normalizeLeetCodeImageUrl(sourceUrl);
  if (!currentUrl) throw new Error('Image URL is not a trusted LeetCode HTTPS asset.');

  let response;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: { accept: 'image/png,image/jpeg,image/webp,image/gif', 'user-agent': userAgent },
      signal: abortAfter(timeoutMs),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    const nextUrl = normalizeLeetCodeImageUrl(location ? new URL(location, currentUrl).toString() : '');
    if (!nextUrl) throw new Error('Image redirect left the trusted LeetCode asset hosts.');
    currentUrl = nextUrl;
    if (redirect === maxRedirects) throw new Error('Image exceeded the redirect limit.');
  }

  if (!response?.ok) throw new Error(`Image returned HTTP ${response?.status || 0}.`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error(`Image exceeds ${maxBytes} bytes.`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length) throw new Error('Image response is empty.');
  if (data.length > maxBytes) throw new Error(`Image exceeds ${maxBytes} bytes.`);

  const kind = imageKind(data);
  if (!kind) throw new Error('Image payload is not a supported PNG, JPEG, WebP, or GIF.');
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && contentType !== 'application/octet-stream' && contentType !== MIME_BY_KIND[kind]) {
    throw new Error(`Image MIME mismatch: header ${contentType}, payload ${MIME_BY_KIND[kind]}.`);
  }

  return {
    sourceUrl,
    finalUrl: currentUrl,
    contentType: MIME_BY_KIND[kind],
    extension: kind === 'jpeg' ? 'jpg' : kind,
    byteLength: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    data,
  };
}

export { MAX_IMAGE_BYTES };
