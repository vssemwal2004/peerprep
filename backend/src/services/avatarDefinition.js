import { createHash } from "node:crypto";
import { cleanText, AuthoringError } from "./aiInterviewDefinition.js";

const ceiling = (value, maximum) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : maximum;
};
export const avatarLimits = (env = process.env) => Object.freeze({
  maxUploadMB: ceiling(env.AVATAR_MAX_UPLOAD_MB, 25),
  maxIntroSeconds: ceiling(env.AVATAR_MAX_INTRO_SECONDS, 60),
  maxResultMB: 100,
});
export const AVATAR_LIMITS = avatarLimits();
export const AVATAR_LANGUAGES = Object.freeze([
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish", experimental: true },
]);
export const avatarError = (status, code, message) => { throw new AuthoringError(status, code, message); };
export function normalizeAvatar(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) avatarError(422, "INVALID_DATA", "Avatar details are required.");
  const language = input.language ?? "en", speechMode = input.speechMode ?? "upload";
  if (!AVATAR_LANGUAGES.some((item) => item.value === language)) avatarError(422, "INVALID_LANGUAGE", "Choose a supported language.");
  if (!["upload", "tts"].includes(speechMode)) avatarError(422, "INVALID_SPEECH_MODE", "Choose uploaded audio or text to speech.");
  if (input.consent !== undefined && typeof input.consent !== "boolean") avatarError(422, "INVALID_CONSENT", "Consent must be explicitly confirmed.");
  const data = {
    name: cleanText(input.name ?? "", 120),
    role: cleanText(input.role ?? "", 120),
    description: cleanText(input.description ?? "", 2000),
    language, speechMode,
    introduction: cleanText(input.introduction ?? "", 2000),
    voice: cleanText(input.voice ?? "", 100),
    consent: input.consent === true,
  };
  if (!data.name) avatarError(422, "NAME_REQUIRED", "Name your avatar before saving.");
  return data;
}
export function avatarFingerprint(doc) {
  return createHash("sha256").update(JSON.stringify({
    source: doc.assets?.source?.key,
    audio: doc.data.speechMode === "upload" ? doc.assets?.audio?.key : undefined,
    language: doc.data.language,
    mode: doc.data.speechMode,
    text: doc.data.speechMode === "tts" ? doc.data.introduction : undefined,
    voice: doc.data.speechMode === "tts" ? doc.data.voice : undefined,
    consent: doc.data.consent,
  })).digest("hex");
}
export function inspectUpload(buffer, kind, suppliedName = "upload") {
  if (!["source", "audio"].includes(kind)) avatarError(422, "INVALID_UPLOAD_KIND", "Upload a source image/video or introduction audio.");
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > AVATAR_LIMITS.maxUploadMB * 1024 * 1024) avatarError(413, "UPLOAD_TOO_LARGE", `Uploads must be between 1 byte and ${AVATAR_LIMITS.maxUploadMB} MB.`);
  const head = buffer.subarray(0, 48), ascii = (start, end) => head.toString("ascii", start, end);
  let media;
  if (head.length >= 3 && head[0] === 255 && head[1] === 216 && head[2] === 255) media = { mime: "image/jpeg", extension: "jpg", kind: "image" };
  else if (head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) media = { mime: "image/png", extension: "png", kind: "image" };
  else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") media = { mime: "image/webp", extension: "webp", kind: "image" };
  else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") media = { mime: "audio/wav", extension: "wav", kind: "audio" };
  else if (ascii(0, 3) === "ID3" || (head.length >= 2 && head[0] === 255 && (head[1] & 224) === 224)) media = { mime: "audio/mpeg", extension: "mp3", kind: "audio" };
  else if (ascii(0, 4) === "OggS") media = { mime: "audio/ogg", extension: "ogg", kind: "audio" };
  else if (head.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) media = { mime: kind === "audio" ? "audio/webm" : "video/webm", extension: "webm", kind: kind === "audio" ? "audio" : "video" };
  else if (ascii(4, 8) === "ftyp") media = { mime: kind === "audio" ? "audio/mp4" : "video/mp4", extension: kind === "audio" ? "m4a" : "mp4", kind: kind === "audio" ? "audio" : "video" };
  if (!media || (kind === "source" && media.kind === "audio") || (kind === "audio" && media.kind !== "audio")) avatarError(422, "UNSUPPORTED_MEDIA", "Use JPEG, PNG or WebP images, MP4/WebM videos, or WAV, MP3, OGG, M4A/WebM audio. File contents must match the media type.");
  return { ...media, name: cleanText(String(suppliedName).split(/[\\/]/).pop(), 180), size: buffer.length };
}
