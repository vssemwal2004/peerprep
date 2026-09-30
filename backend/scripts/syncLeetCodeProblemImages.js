import '../src/setup.js';

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

import Problem from '../src/models/Problem.js';
import TestCase from '../src/models/TestCase.js';
import { syncProblemToLibrary } from '../src/services/questionLibraryService.js';
import { closeDb, connectDb } from '../src/utils/db.js';

const PROVIDER = 'leetcode-dataset';
const GRAPHQL_URL = 'https://leetcode.com/graphql/';
const QUERY = `query questionContent($titleSlug: String!) {
  question(titleSlug: $titleSlug) { questionFrontendId title content }
}`;
const TRUSTED_IMAGE_HOSTS = [
  'leetcode.com',
  'leetcode.cn',
  'leetcodeusercontent.com',
  's3-lc-upload.s3.amazonaws.com',
];

const registrySchema = new mongoose.Schema({
  provider: String,
  externalId: String,
  externalSlug: String,
  problemId: mongoose.Schema.Types.ObjectId,
}, { collection: 'question_import_registry' });
const ImportRegistry = mongoose.models.QuestionImportRegistry
  || mongoose.model('QuestionImportRegistry', registrySchema);

function parseArgs(argv) {
  const options = { commit: false, limit: Infinity, concurrency: 3, offset: 0, slug: '', libraryOnly: false, allLibrary: false, syncContent: false, contentOnly: false };
  argv.forEach((arg) => {
    if (arg === '--commit') options.commit = true;
    else if (arg === '--library-only') options.libraryOnly = true;
    else if (arg === '--all-library') options.allLibrary = true;
    else if (arg === '--sync-content') options.syncContent = true;
    else if (arg === '--content-only') { options.syncContent = true; options.contentOnly = true; }
    else if (arg.startsWith('--limit=')) options.limit = Math.max(1, Number(arg.slice(8)) || 1);
    else if (arg.startsWith('--offset=')) options.offset = Math.max(0, Number(arg.slice(9)) || 0);
    else if (arg.startsWith('--concurrency=')) options.concurrency = Math.min(5, Math.max(1, Number(arg.slice(14)) || 3));
    else if (arg.startsWith('--slug=')) options.slug = String(arg.slice(7)).trim().toLowerCase();
  });
  return options;
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&le;/gi, '<=')
    .replace(/&ge;/gi, '>=')
    .replace(/&minus;/gi, '-')
    .replace(/&times;/gi, 'x')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function htmlToMarkdown(value = '') {
  return decodeHtml(String(value || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '_$1_')
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '^$1')
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '_$1')
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/(?:p|div|ul|ol|pre)>/gi, '\n\n')
    .replace(/<(?:p|div|ul|ol|pre)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n(?=- )/g, '\n')
    .trim();
}

function extractStatementMarkdown(content = '') {
  const html = String(content || '');
  const exampleIndex = html.search(/<strong\b[^>]*class=["'][^"']*\bexample\b/i);
  const constraintsIndex = html.search(/<strong\b[^>]*>\s*Constraints\s*:?\s*<\/strong>/i);
  const indexes = [exampleIndex, constraintsIndex].filter((index) => index >= 0);
  return htmlToMarkdown(indexes.length ? html.slice(0, Math.min(...indexes)) : html);
}

function extractExampleExplanations(content = '') {
  const html = String(content || '');
  const markers = [...html.matchAll(/<strong\b[^>]*class=["'][^"']*\bexample\b[^"']*["'][^>]*>[\s\S]*?Example\s+(\d+)\s*:/gi)];
  const constraintsIndex = html.search(/<strong\b[^>]*>\s*Constraints\s*:?\s*<\/strong>/i);
  const explanations = new Map();
  markers.forEach((marker, index) => {
    const end = markers[index + 1]?.index ?? (constraintsIndex >= 0 ? constraintsIndex : html.length);
    const plain = htmlToMarkdown(html.slice(marker.index, end));
    const match = plain.match(/(?:\*\*)?Explanation:(?:\*\*)?\s*([\s\S]*?)(?=\n\n|$)/i);
    explanations.set(Number(marker[1]), match?.[1]?.trim() || '');
  });
  return explanations;
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function normalizeSourceUrl(value) {
  const raw = decodeHtml(value).trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (!/^https:\/\//i.test(raw) && !raw.startsWith('//') && !raw.startsWith('/')) return '';
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw, 'https://leetcode.com/');
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    const trusted = TRUSTED_IMAGE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    const supportedImagePath = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(`${url.pathname}${url.search}`);
    return trusted && supportedImagePath ? url.toString() : '';
  } catch {
    return '';
  }
}

function numericDimension(tag, name) {
  const direct = Number.parseInt(getAttribute(tag, name), 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const style = getAttribute(tag, 'style');
  const match = style.match(new RegExp(`${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'i'));
  return match ? Math.max(1, Math.round(Number(match[1]))) : undefined;
}

function extractImagePlacements(content = '') {
  const html = String(content || '');
  const examples = [...html.matchAll(/<strong\b[^>]*class=["'][^"']*\bexample\b[^"']*["'][^>]*>[\s\S]*?Example\s+(\d+)\s*:/gi)]
    .map((match) => ({ index: match.index, number: Number(match[1]) }));
  const constraintsIndex = html.search(/<strong\b[^>]*>\s*Constraints\s*:?\s*<\/strong>/i);

  return [...html.matchAll(/<img\b[^>]*>/gi)].map((match, position) => {
    const tag = match[0];
    const sourceUrl = normalizeSourceUrl(getAttribute(tag, 'src') || getAttribute(tag, 'data-src'));
    if (!sourceUrl) return null;
    const previousExample = [...examples].reverse().find((example) => example.index < match.index);
    const nextExample = examples.find((example) => example.index > match.index);
    let section = 'description';
    let exampleNumber = null;
    if (constraintsIndex >= 0 && match.index > constraintsIndex) section = 'constraints';
    else if (previousExample && (!nextExample || match.index < nextExample.index)) {
      section = 'example';
      exampleNumber = previousExample.number;
    }
    return {
      sourceUrl,
      alt: getAttribute(tag, 'alt').trim(),
      width: numericDimension(tag, 'width'),
      height: numericDimension(tag, 'height'),
      section,
      exampleNumber,
      position,
    };
  }).filter(Boolean).filter((image, index, images) => (
    images.findIndex((candidate) => candidate.sourceUrl === image.sourceUrl
      && candidate.section === image.section && candidate.exampleNumber === image.exampleNumber) === index
  ));
}

async function fetchQuestion(slug, attempt = 1) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      referer: `https://leetcode.com/problems/${slug}/`,
      'user-agent': 'PeerPrep content migration/1.0',
    },
    body: JSON.stringify({ query: QUERY, variables: { titleSlug: slug } }),
    signal: AbortSignal.timeout(20_000),
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    return fetchQuestion(slug, attempt + 1);
  }
  if (!response.ok) throw new Error(`LeetCode returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'LeetCode GraphQL error');
  return payload.data?.question || null;
}

function cloudinaryPublicId(sourceUrl) {
  const digest = crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32);
  return `peerprep/problem-assets/leetcode-${digest}`;
}

async function uploadAsset(image, cachedAssets) {
  if (cachedAssets.has(image.sourceUrl)) return { ...image, ...cachedAssets.get(image.sourceUrl) };
  const publicId = cloudinaryPublicId(image.sourceUrl);
  const result = await cloudinary.uploader.upload(image.sourceUrl, {
    public_id: publicId,
    overwrite: true,
    invalidate: false,
    resource_type: 'image',
    unique_filename: false,
    use_filename: false,
  });
  const uploaded = {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width || image.width,
    height: result.height || image.height,
  };
  cachedAssets.set(image.sourceUrl, uploaded);
  return { ...image, ...uploaded };
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.MONGODB_URI || String(process.env.MONGODB_URI).toLowerCase() === 'memory') {
    throw new Error('A persistent MONGODB_URI is required.');
  }
  if (options.commit && !options.contentOnly && (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)) {
    throw new Error('Cloudinary credentials are required for --commit.');
  }
  if (options.commit) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  await connectDb();
  if (options.libraryOnly || options.allLibrary) {
    const ids = options.allLibrary
      ? (await Problem.distinct('_id')).map(String)
      : [...new Set([...(await Problem.distinct('_id', { 'contentImages.0': { $exists: true } })), ...(await TestCase.distinct('problem', { kind: 'sample', 'images.0': { $exists: true } }))].map(String))];
    let synced = 0;
    await mapConcurrent(ids, options.concurrency, async (id) => {
      const problem = await Problem.findById(id);
      if (!problem) return;
      await syncProblemToLibrary(problem.toObject());
      synced += 1;
      if (synced % 100 === 0 || synced === ids.length) console.log(`[library] ${synced}/${ids.length}`);
    });
    console.log(JSON.stringify({ mode: options.allLibrary ? 'all-library' : 'library-only', problems: ids.length, synced }, null, 2));
    return;
  }
  const records = await ImportRegistry.find({
    provider: PROVIDER,
    ...(options.slug ? { externalSlug: options.slug } : {}),
  })
    .sort({ externalId: 1 })
    .skip(options.offset)
    .limit(Number.isFinite(options.limit) ? options.limit : 0)
    .lean();
  const cachedAssets = new Map();
  const stats = { scanned: 0, withImages: 0, discoveredImages: 0, uploadedImages: 0, updatedProblems: 0, contentUpdated: 0, failed: 0 };
  const failures = [];

  await mapConcurrent(records, options.concurrency, async (record) => {
    try {
      const question = await fetchQuestion(record.externalSlug);
      const placements = options.contentOnly ? [] : extractImagePlacements(question?.content || '');
      const statementMarkdown = options.syncContent ? extractStatementMarkdown(question?.content || '') : '';
      const exampleExplanations = options.syncContent ? extractExampleExplanations(question?.content || '') : new Map();
      stats.scanned += 1;
      if (!placements.length && !statementMarkdown) return;
      if (placements.length) stats.withImages += 1;
      stats.discoveredImages += placements.length;
      if (!options.commit) return;

      const problem = await Problem.findById(record.problemId);
      if (!problem) throw new Error('PeerPrep problem is missing');
      const sampleCases = await TestCase.find({ problem: record.problemId, kind: 'sample' }).sort({ position: 1 });
      [...(problem.contentImages || []), ...sampleCases.flatMap((testCase) => testCase.images || [])].forEach((asset) => {
        if (asset?.sourceUrl && asset?.url) cachedAssets.set(asset.sourceUrl, {
          url: asset.url, publicId: asset.publicId, width: asset.width, height: asset.height,
        });
      });
      const uploaded = [];
      for (const placement of placements) {
        const wasCached = cachedAssets.has(placement.sourceUrl);
        uploaded.push(await uploadAsset(placement, cachedAssets));
        if (!wasCached) stats.uploadedImages += 1;
      }

      if (!options.contentOnly) {
        problem.contentImages = uploaded.filter((image) => image.section !== 'example').map((image) => ({
          url: image.url, publicId: image.publicId, sourceUrl: image.sourceUrl, alt: image.alt,
          width: image.width, height: image.height, section: image.section, position: image.position,
        }));
      }
      if (statementMarkdown && problem.description !== statementMarkdown) {
        problem.description = statementMarkdown;
        stats.contentUpdated += 1;
      }
      await problem.save();
      for (const testCase of sampleCases) {
        if (!options.contentOnly) {
          testCase.images = uploaded.filter((image) => image.section === 'example' && image.exampleNumber === testCase.position).map((image) => ({
            url: image.url, publicId: image.publicId, sourceUrl: image.sourceUrl, alt: image.alt,
            width: image.width, height: image.height, position: image.position,
          }));
        }
        if (options.syncContent && exampleExplanations.has(testCase.position)) {
          testCase.explanation = exampleExplanations.get(testCase.position);
        }
        await testCase.save();
      }
      await syncProblemToLibrary(problem.toObject());
      stats.updatedProblems += 1;
    } catch (error) {
      stats.failed += 1;
      failures.push({ slug: record.externalSlug, error: error.message });
    } finally {
      const completed = stats.scanned + stats.failed;
      if (completed % 100 === 0 || completed === records.length) {
        console.log(`[images] ${completed}/${records.length}; found=${stats.discoveredImages}; updated=${stats.updatedProblems}; failed=${stats.failed}`);
      }
    }
  });

  console.log(JSON.stringify({ mode: options.commit ? 'commit' : 'dry-run', totalRecords: records.length, ...stats, failures: failures.slice(0, 25) }, null, 2));
  if (stats.failed) process.exitCode = 2;
}

try { await main(); }
catch (error) { console.error(`[LeetCode image sync] ${error.stack || error.message}`); process.exitCode = 1; }
finally { if (mongoose.connection.readyState !== 0) await closeDb(); }
