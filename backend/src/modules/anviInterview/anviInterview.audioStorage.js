import { createHash, createHmac } from "node:crypto";
import { anviConfig } from "./anviInterview.config.js";

// Private Cloudflare R2 storage for ANVI question audio (WAV clips made by TTS). Kept separate from the
// avatar storage: the SigV4 presigner below is a copy of services/avatarStorage.js, not an import of it,
// so the two can change independently. Student audio is never stored here.
// Signed URLs are for server-side use only (browsers receive clip bytes over the socket or the
// authenticated proxy route), and nothing here logs a key, a URL or bytes.

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const AUDIO_MIME = "audio/wav";
// Object keys this module accepts: revision and template clips under anvi-audio/, per-attempt clips under
// anvi-audio-attempt/ (its own lifecycle prefix). Only safe characters, so keys need no escaping.
const KEY_PATTERN = /^anvi-audio(?:-attempt)?\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+\.wav$/;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** An error with an `ANVI_AUDIO_*` code and an HTTP-ish status; the message never names a key or URL. */
export function audioError(code, message, status = 502) {
  return Object.assign(new Error(message), { code: `ANVI_AUDIO_${code}`, status });
}

const safePart = (value) => {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(text)) throw audioError("INVALID_KEY", "Audio key part is not valid.", 400);
  return text;
};

/**
 * The R2 object key for one asset:
 *   revision  anvi-audio/{tenantKey}/{interviewId}/{revision}/{hash}.wav
 *   template  anvi-audio/{tenantKey}/_templates/v{schemaVersion}/{hash}.wav
 *   attempt   anvi-audio-attempt/{tenantKey}/{attemptId}/{hash}.wav
 */
export function audioStorageKey({ scope, tenantKey, interviewId, revision, attemptId, schemaVersion = 1, hash }) {
  const file = `${safePart(hash)}.wav`;
  const tenant = safePart(tenantKey);
  if (scope === "revision") return `anvi-audio/${tenant}/${safePart(interviewId)}/${safePart(revision)}/${file}`;
  if (scope === "template") return `anvi-audio/${tenant}/_templates/v${safePart(schemaVersion)}/${file}`;
  if (scope === "attempt") return `anvi-audio-attempt/${tenant}/${safePart(attemptId)}/${file}`;
  throw audioError("INVALID_KEY", "Unknown audio scope.", 400);
}

function checkKey(key) {
  const text = String(key || "");
  if (!KEY_PATTERN.test(text) || text.includes("..")) throw audioError("INVALID_KEY", "Audio key is not valid.", 400);
  return text;
}

// Reads a response body up to `cap` bytes; more than that is refused (and the stream cancelled).
async function readCapped(response, cap) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    await response.body?.cancel?.().catch(() => {});
    throw audioError("TOO_LARGE", "Stored audio is larger than allowed.");
  }
  if (!response.body?.getReader) {
    const whole = Buffer.from(await response.arrayBuffer());
    if (whole.length > cap) throw audioError("TOO_LARGE", "Stored audio is larger than allowed.");
    return whole;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw audioError("TOO_LARGE", "Stored audio is larger than allowed.");
    }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(chunks, total);
}

/**
 * R2 client for ANVI audio. `env` supplies R2_ENDPOINT / R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and
 * R2_SECRET_ACCESS_KEY; the bucket is `config.audioBucket` (ANVI_AUDIO_R2_BUCKET, else R2_BUCKET_NAME).
 * Methods: put (audio/wav, at most 8 MB), head, get (byte cap), copy (server-side, x-amz-copy-source),
 * remove (404 counts as success) and signedGet (server-side only). Errors carry `ANVI_AUDIO_*` codes.
 */
export function createAudioStorage({ env = process.env, fetcher = (...args) => fetch(...args), config = anviConfig(env) } = {}) {
  const endpoint = env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  const bucket = config.audioBucket || "";
  const accessKey = env.R2_ACCESS_KEY_ID, secretKey = env.R2_SECRET_ACCESS_KEY;
  const ready = Boolean(endpoint && bucket && accessKey && secretKey);

  // SigV4 query presigning (copied from avatarStorage.js). `headers` are extra headers to sign (lowercase
  // names); S3-compatible stores refuse unsigned x-amz-* headers, so the copy source is signed.
  function signedUrl(key, method = "GET", expires = 900, now = new Date(), headers = {}) {
    if (!ready) throw audioError("UNAVAILABLE", "Private R2 storage for interview audio is not configured.", 503);
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) throw audioError("INVALID_CONFIG", "R2 endpoint must use HTTPS.", 503);
    url.pathname = `/${encode(bucket)}/${checkKey(key).split("/").map(encode).join("/")}`;
    const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), day = date.slice(0, 8);
    const scope = `${day}/auto/s3/aws4_request`;
    const extra = Object.keys(headers).map((name) => name.toLowerCase()).sort();
    const signedHeaders = ["host", ...extra].join(";");
    const query = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${accessKey}/${scope}`,
      "X-Amz-Date": date,
      "X-Amz-Expires": String(expires),
      "X-Amz-SignedHeaders": signedHeaders,
    };
    const canonicalQuery = Object.keys(query).sort().map((k) => `${encode(k)}=${encode(query[k])}`).join("&");
    const lower = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value).trim()]));
    const canonicalHeaders = [`host:${url.host}`, ...extra.map((name) => `${name}:${lower[name]}`)].join("\n");
    const canonical = `${method}\n${url.pathname}\n${canonicalQuery}\n${canonicalHeaders}\n\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), "auto"), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha256(canonical)}`).digest("hex");
    url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return url.toString();
  }

  async function call(key, method, { expires = 300, timeoutMs = 15000, headers = {}, signHeaders = {}, body } = {}) {
    const url = signedUrl(key, method, expires, new Date(), signHeaders);
    try {
      return await fetcher(url, {
        method, headers: { ...headers, ...signHeaders }, ...(body !== undefined ? { body } : {}),
        signal: AbortSignal.timeout(timeoutMs), redirect: "error",
      });
    } catch (error) {
      // Network errors and timeouts: the message of the original error may contain the URL.
      throw audioError(error?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK", "R2 could not be reached.");
    }
  }

  /** Stores one WAV clip. */
  async function put(key, buffer, { mimeType = AUDIO_MIME } = {}) {
    if (mimeType !== AUDIO_MIME) throw audioError("INVALID_TYPE", "Only audio/wav can be stored.", 400);
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    if (!body.length || body.length > MAX_AUDIO_BYTES) throw audioError("TOO_LARGE", "Audio is empty or larger than allowed.", 413);
    const response = await call(key, "PUT", { timeoutMs: 60000, headers: { "Content-Type": AUDIO_MIME }, body });
    await response.body?.cancel?.().catch(() => {});
    if (!response.ok) throw audioError("WRITE_FAILED", "R2 could not store the audio.");
    return { size: body.length };
  }

  /** { size, contentType } for a stored object, or null when it does not exist. */
  async function head(key) {
    const response = await call(key, "HEAD", { timeoutMs: 10000 });
    await response.body?.cancel?.().catch(() => {});
    if (response.status === 404) return null;
    if (!response.ok) throw audioError("READ_FAILED", "R2 could not describe the audio.");
    const size = Number(response.headers?.get?.("content-length"));
    return { size: Number.isFinite(size) ? size : null, contentType: response.headers?.get?.("content-type") || null };
  }

  /** The object's bytes (at most `maxBytes`), or null when it does not exist. */
  async function get(key, { maxBytes = MAX_AUDIO_BYTES } = {}) {
    const response = await call(key, "GET", { timeoutMs: 15000 });
    if (response.status === 404) { await response.body?.cancel?.().catch(() => {}); return null; }
    if (!response.ok) { await response.body?.cancel?.().catch(() => {}); throw audioError("READ_FAILED", "R2 could not read the audio."); }
    return readCapped(response, Math.min(MAX_AUDIO_BYTES, Math.max(1, Number(maxBytes) || MAX_AUDIO_BYTES)));
  }

  /** Server-side copy inside the bucket (no download, no new TTS call). */
  async function copy(sourceKey, targetKey) {
    const source = `${encode(bucket)}/${checkKey(sourceKey).split("/").map(encode).join("/")}`;
    const response = await call(targetKey, "PUT", { timeoutMs: 30000, signHeaders: { "x-amz-copy-source": source } });
    await response.body?.cancel?.().catch(() => {});
    if (!response.ok) throw audioError("COPY_FAILED", "R2 could not copy the audio.");
    return true;
  }

  /** Deletes one object; a missing object counts as deleted. */
  async function remove(key) {
    const response = await call(key, "DELETE", { timeoutMs: 15000 });
    await response.body?.cancel?.().catch(() => {});
    if (!response.ok && response.status !== 404) throw audioError("DELETE_FAILED", "R2 could not delete the audio.");
    return true;
  }

  /** A short-lived signed GET for server-side reads only. Never send it to a browser or a log. */
  function signedGet(key, { expires = config.ttsSignedUrlSeconds, now = new Date() } = {}) {
    const seconds = Math.min(3600, Math.max(60, Math.round(Number(expires) || 600)));
    return signedUrl(key, "GET", seconds, now);
  }

  return { ready, reason: ready ? "" : "Private R2 storage for interview audio is not configured.", put, head, get, copy, remove, signedGet, signedUrl };
}
