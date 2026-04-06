import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const AWS_REGION = String(process.env.AWS_REGION || '').trim();
const S3_TESTCASE_BUCKET = String(process.env.S3_TESTCASE_BUCKET || '').trim();
const S3_TESTCASE_PREFIX = String(process.env.S3_TESTCASE_PREFIX || 'peerprep-testcases').trim();

let s3Client = null;

function isS3Configured() {
  return Boolean(AWS_REGION && S3_TESTCASE_BUCKET);
}

function ensureS3Client() {
  if (!isS3Configured()) {
    throw new Error('S3 testcase storage is not configured.');
  }

  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
      : undefined,
  });

  return s3Client;
}

function buildObjectKey(key) {
  const prefix = S3_TESTCASE_PREFIX.replace(/^\/+|\/+$/g, '');
  const suffix = String(key || '').replace(/^\/+/, '');
  return `${prefix}/${suffix}`;
}

async function streamToString(stream) {
  const chunks = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function isS3TestcaseStorageEnabled() {
  return isS3Configured();
}

export async function uploadS3TextObject({ key, text, contentType = 'text/plain; charset=utf-8' }) {
  const client = ensureS3Client();
  const objectKey = buildObjectKey(key);

  await client.send(new PutObjectCommand({
    Bucket: S3_TESTCASE_BUCKET,
    Key: objectKey,
    Body: String(text ?? ''),
    ContentType: contentType,
  }));

  return objectKey;
}

export async function readS3TextObject(key) {
  const client = ensureS3Client();
  const objectKey = String(key || '').trim();
  if (!objectKey) {
    throw new Error('S3 object key is required.');
  }

  const response = await client.send(new GetObjectCommand({
    Bucket: S3_TESTCASE_BUCKET,
    Key: objectKey,
  }));

  if (!response?.Body) {
    throw new Error('S3 object body is empty.');
  }

  return streamToString(response.Body);
}
