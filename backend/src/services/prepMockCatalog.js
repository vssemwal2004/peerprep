// Prep Mock catalogue: starter companies, companies from Prep Coding, their logos,
// and the job roles a mock can be for.
//
// Logos resolve in this order: a logo set on this deployment (website fetch or upload, stored in
// Cloudinary) > the built-in logo list shipped with the code (data/companyLogos.json, filled by
// scripts/seedCompanyLogos.mjs) > none (the UI shows the company's initial).

import dns from 'node:dns/promises';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import AIInterviewResource from '../models/AIInterviewResource.js';
import { PrepMockCompany, PrepMockRole } from '../models/PrepMockCatalog.js';
import { COMPANY_DOMAINS, NO_LOGO, companyKey } from '../data/companyDomains.js';
import { practiceCompanyCounts } from '../platform/questionPractice.js';
import { detectLogoType, LOGO_LIMITS, readLogoSize, validateLogoFile } from '../platform/universityLogo.js';
import { destroyCloudinaryImage, isCloudinaryConfigured, uploadCompanyLogo } from '../utils/cloudinary.js';
import { companyJobTitles, interviewReportOptions } from '../platform/interviewQuestionReports.js';
import { isUniversity } from '../platform/deployment.js';
import { controlRequest } from '../platform/client.js';
import { currentTenant } from '../platform/tenantContext.js';
import { HttpError } from '../utils/errors.js';

// Roles most tech hiring uses; always offered (after the company's own roles).
export const COMMON_ROLES = Object.freeze([
  'Software Engineer', 'Software Development Engineer', 'SDE 1', 'SDE 2', 'SDE Intern', 'Associate Software Engineer',
  'Graduate Engineer Trainee', 'Systems Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'Android Developer', 'iOS Developer', 'Data Analyst', 'Data Scientist', 'Data Engineer', 'Machine Learning Engineer',
  'DevOps Engineer', 'Site Reliability Engineer', 'Cloud Engineer', 'Security Engineer', 'QA Engineer', 'SDET',
  'Business Analyst', 'Product Manager', 'Technical Support Engineer',
]);

export const STARTER_MOCK_COMPANIES = Object.freeze([
  'Amazon', 'Google', 'Microsoft', 'Meta', 'Apple',
  'TCS', 'Infosys', 'Wipro', 'Accenture', 'IBM',
]);

const ROLE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&+#/()'’-]*$/u;
const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactName = (name) => new RegExp(`^${escapeRegex(clean(name, 120))}$`, 'i');
const slug = (key) => key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'company';

function loadBuiltInLogos() {
  try {
    return JSON.parse(readFileSync(new URL('../data/companyLogos.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
}
let builtIn = loadBuiltInLogos();
/** Test hook and seed-script hook: replace the built-in list in memory. */
export const setBuiltInLogos = (value) => { builtIn = value || {}; };
export const builtInLogo = (name) => {
  const entry = builtIn[companyKey(name)];
  return entry?.url ? { url: entry.url, width: entry.width || null, height: entry.height || null, source: 'built-in' } : null;
};

function resolveLogo(name, profile) {
  if (NO_LOGO.has(companyKey(name))) return null;
  if (profile?.logo?.url) return { url: profile.logo.url, width: profile.logo.width || null, height: profile.logo.height || null, source: profile.logo.source || 'upload' };
  return profile?.hideBuiltInLogo ? null : builtInLogo(name);
}

/** { url, width, height } of a company's logo now, or null (copied onto a mock when it is saved). */
export async function companyLogoSnapshot(name) {
  const key = companyKey(name);
  if (!key) return null;
  const profile = await PrepMockCompany.findOne({ key }).lean();
  const logo = resolveLogo(name, profile);
  return logo ? { url: logo.url, width: logo.width, height: logo.height } : null;
}

/** The logo to show for a mock: this deployment's catalogue first, then the copy saved on the mock. */
export async function logosForCompanies(names) {
  const keys = [...new Set(names.map(companyKey).filter(Boolean))];
  const profiles = keys.length ? await PrepMockCompany.find({ key: { $in: keys } }).lean() : [];
  const byKey = new Map(profiles.map((profile) => [profile.key, profile]));
  return (name, fallback = null) => {
    const logo = resolveLogo(name, byKey.get(companyKey(name)));
    if (logo) return { url: logo.url, width: logo.width, height: logo.height };
    return fallback?.url ? { url: fallback.url, width: fallback.width || null, height: fallback.height || null } : null;
  };
}

/**
 * Every company a mock can be for: ten starter choices, companies students see on Prep Coding,
 * and any company that already has mocks here. [{ company, key, questions, mocks, published, logo, domain }]
 */
export async function listMockCatalogCompanies() {
  const [practice, mockRows, profiles] = await Promise.all([
    practiceCompanyCounts(),
    Assessment.aggregate([
      { $match: { kind: 'mock', company: { $nin: ['', null] } } },
      { $group: { _id: { $toLower: '$company' }, company: { $first: '$company' }, mocks: { $sum: 1 },
        published: { $sum: { $cond: [{ $eq: ['$lifecycleStatus', 'published'] }, 1, 0] } } } },
    ]),
    PrepMockCompany.find().lean(),
  ]);
  const profileByKey = new Map(profiles.map((profile) => [profile.key, profile]));
  const rows = new Map();
  for (const company of STARTER_MOCK_COMPANIES) {
    rows.set(companyKey(company), { company, questions: 0, mocks: 0, published: 0 });
  }
  for (const { company, count } of practice) {
    const key = companyKey(company);
    rows.set(key, { company: rows.get(key)?.company || company, questions: count, mocks: 0, published: 0 });
  }
  for (const row of mockRows) {
    const key = companyKey(row.company);
    const entry = rows.get(key) || { company: row.company, questions: 0, mocks: 0, published: 0 };
    rows.set(key, { ...entry, mocks: row.mocks, published: row.published });
  }
  return [...rows.entries()].map(([key, row]) => {
    const profile = profileByKey.get(key);
    return { ...row, key, logo: resolveLogo(row.company, profile), domain: profile?.domain || COMPANY_DOMAINS[key] || '' };
  }).sort((a, b) => b.mocks - a.mocks || b.questions - a.questions || a.company.localeCompare(b.company));
}

async function reportedTitles(company) {
  try {
    if (isUniversity()) return (await controlRequest(`question-interviews/job-titles?company=${encodeURIComponent(company)}`)).jobTitles || [];
    return await companyJobTitles(company);
  } catch { return []; }
}
async function sharedTitles() {
  try { return ((isUniversity() ? await controlRequest('question-interviews/options') : await interviewReportOptions()).jobTitles) || []; }
  catch { return []; }
}

/**
 * Roles for one company's mock: { company: [...], shared: [...] }, each [{ name, mocks, reporters,
 * added }]. "company" = roles students reported in interviews with this company, roles of its
 * existing mocks and roles admins added for it; "shared" = every other known role.
 */
export async function mockRolesFor(company) {
  const name = clean(company, 120);
  const key = companyKey(name);
  const [reported, shared, added, mockRoles, aiRoles] = await Promise.all([
    key ? reportedTitles(name) : [],
    sharedTitles(),
    PrepMockRole.find().select('name companyKeys').lean(),
    Assessment.aggregate([
      { $match: { kind: 'mock', role: { $nin: ['', null] } } },
      { $group: { _id: { company: { $toLower: '$company' }, role: { $toLower: '$role' } }, role: { $first: '$role' }, mocks: { $sum: 1 } } },
    ]),
    AIInterviewResource.find({ kind: 'jobRoles', active: { $ne: false } }).select('name').limit(300).lean().catch(() => []),
  ]);
  const roles = new Map();
  const touch = (roleName, patch = {}) => {
    const label = clean(roleName, 80);
    const roleKey = label.toLowerCase();
    if (label.length < 2) return;
    const entry = roles.get(roleKey) || { name: label, mocks: 0, reporters: 0, added: false, forCompany: false };
    roles.set(roleKey, { ...entry, ...patch, mocks: entry.mocks + (patch.mocks || 0), reporters: entry.reporters + (patch.reporters || 0) });
  };
  COMMON_ROLES.forEach((role) => touch(role));
  shared.forEach((role) => touch(role));
  aiRoles.forEach((role) => touch(role.name));
  added.forEach((role) => touch(role.name, { added: true, ...(key && role.companyKeys?.includes(key) ? { forCompany: true } : {}) }));
  reported.forEach(({ jobTitle, reporters }) => touch(jobTitle, { reporters: Number(reporters) || 0, forCompany: true }));
  mockRoles.forEach((row) => touch(row.role, row._id.company === key ? { mocks: row.mocks, forCompany: true } : {}));
  const list = [...roles.values()];
  const strip = ({ forCompany, ...role }) => role;
  return {
    company: list.filter((role) => role.forCompany)
      .sort((a, b) => b.mocks - a.mocks || b.reporters - a.reporters || a.name.localeCompare(b.name)).map(strip),
    shared: list.filter((role) => !role.forCompany).sort((a, b) => a.name.localeCompare(b.name)).map(strip),
  };
}

/** Adds a role everyone can pick from now on (listed first for the company it was added for). */
export async function addMockRole({ name, company, userId }) {
  const label = clean(name, 80);
  if (label.length < 2) throw new HttpError(400, 'Type a role of at least 2 characters.');
  if (!ROLE_PATTERN.test(label)) throw new HttpError(400, 'A role can use letters, numbers, spaces and . , & + # / ( ) \' - only.');
  const key = label.toLowerCase();
  const forCompany = companyKey(clean(company, 120));
  const role = await PrepMockRole.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, name: label, ...(mongoose.isValidObjectId(String(userId || '')) ? { createdBy: userId } : {}) },
      ...(forCompany ? { $addToSet: { companyKeys: forCompany } } : {}) },
    { upsert: true, new: true },
  ).lean();
  return { name: role.name };
}

// ---------------------------------------------------------------- logos

/** "https://www.Google.com/careers" -> "google.com"; throws for anything that is not a public host name. */
export function normalizeWebsite(value) {
  let text = clean(value, 200).toLowerCase();
  if (!text) throw new HttpError(400, 'Type the company website, for example google.com.');
  text = text.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (net.isIP(text) || !/^(?=.{4,120}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(text)) {
    throw new HttpError(400, 'Type a website like google.com (no IP addresses).');
  }
  return text;
}

/** Loopback, private, link-local, carrier-grade NAT, benchmark and multicast ranges are refused. */
export function isPrivateAddress(address) {
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('ff');
  }
  const [a, b] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

/** Fetches a public https URL (no private network, at most 3 redirects, 2 MB) as a Buffer, or null. */
async function fetchPublicImage(url, { trustedHost = false } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const target = new URL(current);
    if (target.protocol !== 'https:') return null;
    if (!trustedHost) {
      const addresses = await dns.lookup(target.hostname, { all: true }).catch(() => []);
      if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return null;
    }
    const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'PeerPrepLogoFetcher/1.0', Accept: 'image/*' } }).catch(() => null);
    if (!response) return null;
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), target).toString();
      trustedHost = false;
      continue;
    }
    if (!response.ok) return null;
    if (Number(response.headers.get('content-length') || 0) > LOGO_LIMITS.maxBytes) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length <= LOGO_LIMITS.maxBytes ? buffer : null;
  }
  return null;
}

// Fetched logos may be a little smaller than uploads (many sites only publish 48 px icons).
const AUTO_MIN_SIDE = 48;
const asImage = (buffer) => {
  const type = buffer && detectLogoType(buffer);
  const size = type && readLogoSize(buffer, type);
  if (!size || size.width < AUTO_MIN_SIDE || size.height < AUTO_MIN_SIDE || size.width > LOGO_LIMITS.maxSide || size.height > LOGO_LIMITS.maxSide) return null;
  return { buffer, type, ...size };
};
const side = (image) => Math.min(image.width, image.height);

/** Icon links a homepage declares (<link rel="apple-touch-icon|icon" href sizes>), best first. */
async function homepageIconLinks(domain) {
  const html = await fetchPublicImage(`https://www.${domain}/`).catch(() => null) || await fetchPublicImage(`https://${domain}/`).catch(() => null);
  if (!html) return [];
  const text = html.subarray(0, 512 * 1024).toString('utf8');
  const links = [];
  for (const tag of text.match(/<link\b[^>]*>/gi) || []) {
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() || '';
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/(^|\s)(apple-touch-icon|apple-touch-icon-precomposed|icon|shortcut icon)(\s|$)/.test(rel) || /\.svg(\?|$)/i.test(href)) continue;
    const sizes = /\bsizes\s*=\s*["'](\d+)x\d+["']/i.exec(tag)?.[1];
    try { links.push({ url: new URL(href, `https://www.${domain}/`).toString(), score: (rel.includes('apple') ? 1000 : 0) + Number(sizes || 0) }); } catch { /* bad href */ }
  }
  return links.sort((a, b) => b.score - a.score).slice(0, 4).map((link) => link.url);
}

/**
 * The best logo a website offers, largest wins: Google's icon service, icon.horse, the icons its
 * homepage declares, then the standard Apple touch icon. { buffer, type, width, height } or null.
 */
export async function fetchWebsiteLogo(domain) {
  const found = [];
  const add = (image) => { if (image) found.push(image); return image; };
  const enough = () => found.some((image) => side(image) >= 128);
  add(asImage(await fetchPublicImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`, { trustedHost: true })));
  if (!enough()) add(asImage(await fetchPublicImage(`https://icon.horse/icon/${encodeURIComponent(domain)}`, { trustedHost: true })));
  if (!enough()) {
    for (const url of await homepageIconLinks(domain)) {
      if (add(asImage(await fetchPublicImage(url))) && enough()) break;
    }
  }
  if (!enough()) {
    for (const url of [`https://${domain}/apple-touch-icon.png`, `https://www.${domain}/apple-touch-icon.png`]) {
      if (add(asImage(await fetchPublicImage(url)))) break;
    }
  }
  return found.sort((a, b) => side(b) - side(a))[0] || null;
}

async function saveLogo({ company, domain, image, source, userId }) {
  if (!isCloudinaryConfigured()) throw new HttpError(503, 'Image storage is not configured.');
  const name = clean(company, 120);
  const key = companyKey(name);
  if (!key) throw new HttpError(400, 'Choose a company.');
  if (NO_LOGO.has(key)) throw new HttpError(400, 'This company cannot have a logo.');
  const scope = currentTenant()?.universityId || 'platform';
  const stored = await uploadCompanyLogo(image.buffer, { publicId: `${slug(scope)}_${slug(key)}_${Date.now()}` });
  const previous = await PrepMockCompany.findOne({ key }).lean();
  const logo = { url: stored.url, publicId: stored.publicId, width: stored.width, height: stored.height, source, updatedAt: new Date() };
  await PrepMockCompany.updateOne({ key }, {
    $set: { name, logo, hideBuiltInLogo: false, ...(domain ? { domain } : {}), ...(mongoose.isValidObjectId(String(userId || '')) ? { updatedBy: userId } : {}) },
    $setOnInsert: { key },
  }, { upsert: true });
  if (previous?.logo?.publicId) destroyCloudinaryImage(previous.logo.publicId).catch(() => {});
  await Assessment.updateMany({ kind: 'mock', company: exactName(name) }, { $set: { companyLogo: { url: logo.url, width: logo.width, height: logo.height } } });
  return { company: name, domain: domain || previous?.domain || '', logo: { url: logo.url, width: logo.width, height: logo.height, source } };
}

/** Fetches the logo from the company's website and stores it. */
export async function setLogoFromWebsite({ company, website, userId }) {
  const domain = normalizeWebsite(website);
  const image = await fetchWebsiteLogo(domain);
  if (!image) throw new HttpError(422, `No usable logo was found for ${domain}. Upload one instead (PNG, JPEG or WebP, at least 64×64).`);
  return saveLogo({ company, domain, image, source: 'website', userId });
}

/** Stores an uploaded logo (validated PNG, JPEG or WebP). */
export async function setLogoFromUpload({ company, file, userId }) {
  const checked = validateLogoFile(file);
  return saveLogo({ company, image: { buffer: file.buffer, ...checked }, source: 'upload', userId });
}

/** Removes the company's logo here (the initial shows instead, even if a built-in logo exists). */
export async function removeCompanyLogo({ company }) {
  const name = clean(company, 120);
  const key = companyKey(name);
  if (!key) throw new HttpError(400, 'Choose a company.');
  const previous = await PrepMockCompany.findOne({ key }).lean();
  await PrepMockCompany.updateOne({ key }, { $set: { name, logo: null, hideBuiltInLogo: true }, $setOnInsert: { key } }, { upsert: true });
  if (previous?.logo?.publicId) destroyCloudinaryImage(previous.logo.publicId).catch(() => {});
  await Assessment.updateMany({ kind: 'mock', company: exactName(name) }, { $set: { companyLogo: null } });
  return { company: name, logo: null };
}

/**
 * Finds logos for up to `limit` companies that have none yet but whose website is known (set here
 * or in the built-in list). Call again until `remaining` is 0. Companies whose site offers no usable
 * logo are reported in `missed` and skipped for the rest of the run via `skip`.
 */
export async function fetchMissingLogos({ limit = 12, skip = [], userId } = {}) {
  const skipped = new Set((Array.isArray(skip) ? skip : []).map((value) => companyKey(value)));
  const companies = await listMockCatalogCompanies();
  const todo = companies.filter((row) => !row.logo && row.domain && !NO_LOGO.has(row.key) && !skipped.has(row.key));
  const batch = todo.slice(0, Math.max(1, Math.min(25, Number(limit) || 12)));
  const saved = [];
  const missed = [];
  for (const row of batch) {
    try {
      const image = await fetchWebsiteLogo(row.domain);
      if (!image) { missed.push(row.company); continue; }
      saved.push(await saveLogo({ company: row.company, domain: row.domain, image, source: 'website', userId }));
    } catch { missed.push(row.company); }
  }
  return {
    saved, missed,
    remaining: todo.length - batch.length,
    withoutWebsite: companies.filter((row) => !row.logo && !row.domain && !NO_LOGO.has(row.key)).length,
  };
}
