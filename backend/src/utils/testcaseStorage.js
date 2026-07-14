import { supabase } from './supabase.js';

const SUPABASE_TESTCASE_BUCKET = String(
  process.env.SUPABASE_TESTCASE_BUCKET
  || 'testcases',
).trim();
const SUPABASE_TESTCASE_PREFIX = String(
  process.env.SUPABASE_TESTCASE_PREFIX
  || 'peerprep-testcases',
).trim();

function isTestcaseStorageConfigured() {
  return Boolean(supabase && SUPABASE_TESTCASE_BUCKET);
}

function ensureTestcaseStorage() {
  if (!isTestcaseStorageConfigured()) {
    throw new Error('Supabase testcase storage is not configured.');
  }
}

function buildObjectKey(key) {
  const prefix = SUPABASE_TESTCASE_PREFIX.replace(/^\/+|\/+$/g, '');
  const suffix = String(key || '').replace(/^\/+/, '');
  return prefix ? `${prefix}/${suffix}` : suffix;
}

export function isTestcaseStorageEnabled() {
  return isTestcaseStorageConfigured();
}

export async function uploadTestcaseTextObject({ key, text, contentType = 'text/plain; charset=utf-8' }) {
  ensureTestcaseStorage();

  const objectKey = buildObjectKey(key);
  const { error } = await supabase.storage
    .from(SUPABASE_TESTCASE_BUCKET)
    .upload(objectKey, String(text ?? ''), {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || 'Failed to upload testcase object.');
  }

  return objectKey;
}

export async function readTestcaseTextObject(key) {
  ensureTestcaseStorage();

  const objectKey = String(key || '').trim();
  if (!objectKey) {
    throw new Error('Testcase object key is required.');
  }

  const { data, error } = await supabase.storage
    .from(SUPABASE_TESTCASE_BUCKET)
    .download(objectKey);

  if (error) {
    throw new Error(error.message || 'Failed to download testcase object.');
  }

  if (!data) {
    throw new Error('Testcase object body is empty.');
  }

  if (typeof data.text === 'function') {
    return data.text();
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString('utf8');
}
