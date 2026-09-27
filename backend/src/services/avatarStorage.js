import { createHash, createHmac } from "node:crypto";
import { avatarError } from "./avatarDefinition.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function createAvatarStorage(env = process.env, fetcher = fetch) {
  const endpoint = env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  const bucket = env.R2_BUCKET_NAME || env.R2_BUCKET;
  const accessKey = env.R2_ACCESS_KEY_ID, secretKey = env.R2_SECRET_ACCESS_KEY;
  const ready = Boolean(endpoint && bucket && accessKey && secretKey);
  function signedUrl(key, method = "GET", expires = 900, now = new Date()) {
    if (!ready) avatarError(503, "STORAGE_UNAVAILABLE", "Configure private R2 storage before uploading or rendering avatars.");
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) avatarError(503, "INVALID_STORAGE_CONFIG", "R2 endpoint must use HTTPS.");
    url.pathname = `/${encode(bucket)}/${key.split("/").map(encode).join("/")}`;
    const date = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), day = date.slice(0, 8);
    const scope = `${day}/auto/s3/aws4_request`;
    const query = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${accessKey}/${scope}`,
      "X-Amz-Date": date,
      "X-Amz-Expires": String(expires),
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = Object.keys(query).sort().map((k) => `${encode(k)}=${encode(query[k])}`).join("&");
    const canonical = `${method}\n${url.pathname}\n${canonicalQuery}\nhost:${url.host}\n\nhost\nUNSIGNED-PAYLOAD`;
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), "auto"), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).digest("hex");
    url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    return url.toString();
  }
  async function write(key, buffer, mime) {
    const response = await fetcher(signedUrl(key, "PUT", 300), { method: "PUT", headers: { "Content-Type": mime }, body: buffer, signal: AbortSignal.timeout(60000), redirect: "error" });
    if (!response.ok) avatarError(502, "STORAGE_WRITE_FAILED", "R2 could not store the file. Check the bucket configuration and try again.");
    await response.body?.cancel();
  }
  async function remove(key) {
    const response = await fetcher(signedUrl(key, "DELETE", 300), { method: "DELETE", signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok && response.status !== 404) avatarError(502, "STORAGE_DELETE_FAILED", "Could not clean up the unused upload.");
    await response.body?.cancel();
  }
  return { ready, reason: ready ? "" : "Private R2 storage is not configured.", signedUrl, write, remove };
}
