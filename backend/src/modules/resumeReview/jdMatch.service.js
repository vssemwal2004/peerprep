// Resume JD Match: start a paid check, run it in the background, and read it back.
//
// Order of a start (nothing is charged until every free check has passed):
//   feature on (route) → valid JD → résumé has content → monthly budget left → daily limit left →
//   same résumé + JD within 24 h? return that report free → charge Prep Coins → run.
// The run captures the charge when the report is ready and refunds it on any failure. A crash
// leaves the charge pending; the reader (and the Prep Coin sweeper) refunds stale checks.
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import Resume from '../../models/Resume.js';
import { HttpError } from '../../utils/errors.js';
import { createGeminiClient } from '../anviInterview/anviInterview.gemini.js';
import { currentTenant, runForPlatform, runForTenant } from '../../platform/tenantContext.js';
import { encryptTenantSecret, decryptTenantSecret } from '../../platform/tenantSecrets.js';
import { PLATFORM_WALLET_SCOPE, walletBalance } from '../../platform/coins.js';
import { captureCharge, chargeFeature, refundCharge } from '../../platform/coinSpend.js';
import { PlatformCoinCharge } from '../../platform/models.js';
import { ResumeJdMatch } from './jdMatch.model.js';
import {
  JD_MATCH_SCHEMA, JD_MAX_CHARS, JD_MIN_CHARS, MIN_OUTPUT_TOKENS, buildResumeLines, checkFits, cleanJobDescription, maxJdChars, planPrompt, verifyMatch,
} from './jdMatch.engine.js';
import { assertJdBudget, getJdMatchLimits, jdMatchModel, recordJdSpend } from './jdMatch.limits.js';

export const JD_MATCH_COIN_FEATURE = 'resume.jd_match';
const CACHE_HOURS = 24;
const STALE_MS = 4 * 60_000;
const HISTORY = 10;
// No per-check cost cap and no daily limit (user, 2026-11-28): the student's Prep Coins are the
// limit. Only the JD box size (JD_MAX_CHARS) and the résumé size still bound one check, and the
// Master Admin's monthly budget stays as the platform's safety switch.
const NO_CAP_USD = Number.POSITIVE_INFINITY;

// The JD and report are encrypted at rest. Without the tenant secret key this fails closed (the
// check is refused before any charge) instead of storing a student's data in plain text.
function seal(value) {
  try { return encryptTenantSecret(JSON.stringify(value)); } catch {
    throw new HttpError(503, 'ANVI JD Match is not set up on this server yet. No coins were taken.', { code: 'JD_MATCH_NOT_CONFIGURED' });
  }
}
function unseal(value) {
  if (!value) return null;
  try { return JSON.parse(value.startsWith('plain:') ? value.slice(6) : decryptTenantSecret(value)); } catch { return null; }
}

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** What the student sees when the text is too big for one check (no coins are taken). */
export function tooLongError(fits, jdChars) {
  if (fits.reason === 'resume') {
    return new HttpError(413, 'Your résumé is longer than ANVI can check in one go (about two pages). Shorten it, for example by removing old or repeated points, then try again. No coins were taken.', { code: 'JD_MATCH_RESUME_TOO_LONG', resumeOverflow: fits.resumeOverflow });
  }
  if (fits.reason === 'cap') {
    return new HttpError(503, 'ANVI JD Match is not available right now. No coins were taken.', { code: 'JD_MATCH_CAP_TOO_LOW' });
  }
  const over = Math.max(1, jdChars - fits.jdMaxChars);
  return new HttpError(413, `This job description is too long for one check: shorten it to about ${fits.jdMaxChars.toLocaleString('en-IN')} characters (remove about ${over.toLocaleString('en-IN')}). Keep the role summary and the requirements; company introductions and benefits can go. No coins were taken.`, { code: 'JD_MATCH_JD_TOO_LONG', jdMaxChars: fits.jdMaxChars, jdChars });
}

/** Share of letters that are Latin (A–Z, accented Latin); used to refuse non-English JDs before any charge. */
export function latinShare(text) {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  return letters.filter((letter) => /[A-Za-zÀ-ɏ]/.test(letter)).length / letters.length;
}
const field = (value, max) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const scopeOf = () => currentTenant()?.universityId || PLATFORM_WALLET_SCOPE;

/** IST midnight of `now`, as a Date. */
export function istDayStart(now = new Date()) {
  const offset = 330 * 60_000;
  const day = 86_400_000;
  return new Date(Math.floor((now.getTime() + offset) / day) * day - offset);
}

export function publicMatch(row, { withReport = true } = {}) {
  if (!row) return null;
  const out = {
    id: String(row._id), status: row.status, stage: row.stage, company: row.company || '', role: row.role || '',
    score: row.score ?? null, cost: row.cost || 0, refunded: Boolean(row.refunded),
    createdAt: row.createdAt, finishedAt: row.finishedAt || null,
  };
  if (row.status === 'failed') out.error = { code: row.error?.code || 'JD_MATCH_FAILED', message: row.error?.message || 'This check could not finish.' };
  if (withReport && row.status === 'done') out.report = unseal(row.report);
  return out;
}

export function createJdMatchService({ gemini = null, rates = jdMatchModel(), concurrency = Number(process.env.RESUME_JD_CONCURRENCY) || 20, now = () => new Date(), onSettled = null } = {}) {
  let client = gemini;
  const getClient = () => (client ||= createGeminiClient());
  const waiting = [];
  let active = 0;
  // Checks this process holds in memory: never "stale", however long the queue is.
  const held = new Set();
  const indexed = new WeakMap();
  const ensureIndexes = () => {
    const model = ResumeJdMatch.collection;
    if (!indexed.has(model)) indexed.set(model, ResumeJdMatch.createIndexes().catch((error) => { indexed.delete(model); throw error; }));
    return indexed.get(model);
  };

  function pump() {
    while (active < concurrency && waiting.length) {
      const task = waiting.shift();
      active += 1;
      Promise.resolve().then(task).catch((error) => console.warn('[resume-jd-match] Run failed:', error?.message))
        .finally(() => { active -= 1; pump(); });
    }
  }
  function enqueue(tenant, matchId) {
    held.add(String(matchId));
    const work = () => run(matchId).finally(() => held.delete(String(matchId)));
    waiting.push(() => (tenant ? runForTenant(tenant, work) : runForPlatform(work)));
    pump();
  }

  async function settleFailure(row, code, message, { billed = false } = {}) {
    const updated = await ResumeJdMatch.findOneAndUpdate(
      { _id: row._id, status: { $in: ['queued', 'running'] } },
      { $set: { status: 'failed', stage: 'failed', error: { code, message }, finishedAt: now(), payload: null, ...(billed ? { billed: true } : {}) }, $unset: { active: '' } },
      { new: true },
    );
    if (!updated) return ResumeJdMatch.findById(row._id).lean();
    if (updated.chargeId) {
      try {
        await refundCharge(updated.chargeId, `Resume JD Match failed: ${code}`);
        updated.refunded = true;
        await ResumeJdMatch.updateOne({ _id: updated._id }, { $set: { refunded: true } });
      } catch (error) {
        // The Prep Coin sweeper refunds it later: the check is not "done", so it was not delivered.
        console.warn('[resume-jd-match] Refund left for the sweeper:', error.message);
      }
    }
    onSettled?.(updated);
    return updated.toObject ? updated.toObject() : updated;
  }

  async function run(matchId) {
    const row = await ResumeJdMatch.findOneAndUpdate(
      { _id: matchId, status: 'queued' },
      { $set: { status: 'running', stage: 'reading', startedAt: now() } },
      { new: true },
    ).lean();
    if (!row) return;
    let billed = false;
    try {
      // The Prep Coin sweeper may have refunded a charge that waited too long: never run it free.
      if (row.chargeId && (await PlatformCoinCharge.findById(row.chargeId).select('status').lean())?.status !== 'pending') {
        throw new HttpError(409, 'This check waited too long to start.', { code: 'JD_MATCH_EXPIRED' });
      }
      const input = unseal(row.payload);
      if (!input?.jd) throw new HttpError(500, 'The job description was not kept for this check.', { code: 'JD_MATCH_INPUT_LOST' });
      const resume = await Resume.findOne({ student: row.student }).lean();
      const lines = buildResumeLines(resume || {});
      if (!lines.length) throw new HttpError(400, 'Your résumé has no content yet.', { code: 'JD_MATCH_EMPTY_RESUME' });
      const { limits } = await getJdMatchLimits();
      const capUsd = NO_CAP_USD;
      const plan = planPrompt({ jd: input.jd, lines, company: row.company, role: row.role, rates, capUsd, maxOutputTokens: rates.maxOutputTokens });
      if (!plan) throw new HttpError(422, 'This job description and résumé are too long to check within the cost limit. Shorten the job description and try again.', { code: 'JD_MATCH_TOO_LONG' });
      await ResumeJdMatch.updateOne({ _id: row._id }, { $set: { stage: 'matching' } });
      const ai = getClient();
      if (!ai.configured) {
        // The usual cause of "ANVI is not available right now" on a server: no GEMINI_API_KEY in its .env.
        console.warn('[resume-jd-match] GEMINI_API_KEY is not set on this server; the check was refunded.');
        throw new HttpError(503, 'ANVI is not available right now.', { code: 'JD_MATCH_UNAVAILABLE' });
      }
      // The monthly budget again, right before the paid call: queued checks passed it earlier.
      await assertJdBudget(limits);
      let usage = null;
      const result = await ai.generateJson({
        model: rates.model, includeDefaultFallback: false, fallbackModels: [],
        systemText: plan.systemText, parts: [{ text: plan.userText }], schema: JD_MATCH_SCHEMA,
        temperature: 0, timeoutMs: rates.timeoutMs, maxOutputTokens: plan.maxOutputTokens,
        thinkingLevel: rates.thinkingLevel, cache: false, withMeta: true,
        // Every billed response counts toward the budget, even one that is then rejected.
        onUsage: ({ tokens, model }) => { billed = true; usage = { ...tokens, model }; recordJdSpend(tokens, { rates, capUsd }); },
      });
      await ResumeJdMatch.updateOne({ _id: row._id }, { $set: { stage: 'verifying' } });
      const report = verifyMatch({ raw: result?.value ?? result, jd: plan.jd, lines: plan.lines, company: row.company, role: row.role });
      if (!report.totals.keywords) throw new HttpError(422, 'ANVI could not find clear skills or requirements in this job description. Paste the full job description and try again.', { code: 'JD_MATCH_NO_KEYWORDS' });
      report.checkedAt = now().toISOString();
      const tokens = usage || result?.tokens || null;
      const done = await ResumeJdMatch.findOneAndUpdate(
        { _id: row._id, status: 'running' },
        {
          $set: {
            status: 'done', stage: 'done', report: seal(report), score: report.score, payload: null, finishedAt: now(), billed: true,
            usage: tokens ? { model: tokens.model || rates.model, input: tokens.input || 0, output: tokens.output || 0, thoughts: tokens.thoughts || 0, usd: (Number(tokens.input || 0) * rates.inputUsdPerM + Number(tokens.output || 0) * rates.outputUsdPerM) / 1e6 } : undefined,
          },
          $unset: { active: '' },
        },
        { new: true },
      ).lean();
      if (!done) return;
      if (done.chargeId) await captureCharge(done.chargeId).catch((error) => console.warn('[resume-jd-match] Capture left for the sweeper:', error.message));
      onSettled?.(done);
    } catch (error) {
      const code = error?.details?.code || (error?.code === 'GEMINI_TIMEOUT' ? 'JD_MATCH_TIMEOUT' : 'JD_MATCH_FAILED');
      const message = error instanceof HttpError ? error.message
        : error?.code === 'GEMINI_TIMEOUT' ? 'ANVI took too long to answer.'
          : 'ANVI could not finish this check.';
      await settleFailure(row, code, `${message} Your Prep Coins were returned.`, { billed });
    }
  }

  /** A queued/running check left by a restart is failed (and refunded) once it is clearly stale. */
  async function expireIfStale(row) {
    if (!row || !['queued', 'running'].includes(row.status)) return row;
    if (held.has(String(row._id))) return row;
    if (now().getTime() - new Date(row.updatedAt || row.createdAt).getTime() < STALE_MS) return row;
    return settleFailure(row, 'JD_MATCH_INTERRUPTED', 'The check was interrupted. Your Prep Coins were returned.');
  }

  async function overview(user) {
    const { limits } = await getJdMatchLimits();
    const [rows, usedToday, active, spend] = await Promise.all([
      ResumeJdMatch.find({ student: user._id, status: 'done' }).sort({ createdAt: -1 }).limit(HISTORY).select('-report -payload').lean(),
      ResumeJdMatch.countDocuments(countedToday(user._id)),
      ResumeJdMatch.findOne({ student: user._id, status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 }).lean(),
      assertJdBudget(limits).then(() => false, () => true),
    ]);
    const live = await expireIfStale(active);
    // This student's own size limits, so the page can warn before the button is pressed.
    const lines = buildResumeLines((await Resume.findOne({ student: user._id }).lean()) || {});
    const capUsd = NO_CAP_USD;
    const full = maxJdChars({ lines, rates, capUsd, maxOutputTokens: rates.maxOutputTokens });
    const jdMaxChars = full >= 600 ? full : maxJdChars({ lines, rates, capUsd, maxOutputTokens: MIN_OUTPUT_TOKENS });
    return {
      history: rows.map((row) => publicMatch(row, { withReport: false })),
      usedToday, dailyLimit: null, paused: spend,
      jdMaxChars, resumeTooLong: (lines.overflow || 0) > 0,
      active: live && ['queued', 'running'].includes(live.status) ? publicMatch(live, { withReport: false }) : null,
    };
  }

  // Checks that count toward the daily limit: every one that did not fail, plus failed ones Gemini
  // had already billed (otherwise refunded failures could drain the shared monthly budget for free).
  const countedToday = (student) => ({ student, createdAt: { $gte: istDayStart(now()) }, $or: [{ status: { $ne: 'failed' } }, { billed: true }] });

  async function start(user, body = {}, { expectedCost } = {}) {
    const rawJd = String(body.jobDescription || '');
    if (rawJd.length > JD_MAX_CHARS) throw new HttpError(400, `Keep the job description under ${JD_MAX_CHARS.toLocaleString()} characters.`, { code: 'JD_MATCH_JD_TOO_LONG' });
    const jd = cleanJobDescription(rawJd);
    if (jd.length < JD_MIN_CHARS) throw new HttpError(400, `Paste the full job description (at least ${JD_MIN_CHARS} characters) so ANVI can find its requirements.`, { code: 'JD_MATCH_JD_TOO_SHORT' });
    // Keyword matching reads English; other scripts would be billed and then find nothing.
    if (latinShare(jd) < 0.6) throw new HttpError(400, 'Paste the job description in English: ANVI JD Match reads English job descriptions for now. No coins were taken.', { code: 'JD_MATCH_NOT_ENGLISH' });
    const company = field(body.company, 80);
    const role = field(body.role, 80);
    const resume = await Resume.findOne({ student: user._id }).lean();
    const lines = buildResumeLines(resume || {});
    if (lines.length < 3) throw new HttpError(400, 'Add your résumé details first: ANVI needs your skills, projects or experience to compare.', { code: 'JD_MATCH_EMPTY_RESUME' });

    // One check at a time per student: a second click joins the running one.
    const running = await expireIfStale(await ResumeJdMatch.findOne({ student: user._id, status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 }).lean());
    if (running && ['queued', 'running'].includes(running.status)) return { match: publicMatch(running), charge: null, joined: true };

    // The same résumé and job (and role/company label) within 24 hours is shown again for free.
    const jdHash = hash(['jd-v2', jd.toLowerCase(), role.toLowerCase(), company.toLowerCase()]);
    const resumeHash = hash(['resume-v1', lines.map((line) => [line.heading, line.text])]);
    const cached = await ResumeJdMatch.findOne({
      student: user._id, jdHash, resumeHash, status: 'done', createdAt: { $gte: new Date(now().getTime() - CACHE_HOURS * 3_600_000) },
    }).sort({ createdAt: -1 }).lean();
    if (cached) return { match: publicMatch(cached), charge: null, cached: true };

    const { limits } = await getJdMatchLimits();
    // Size first, before any coin is taken: the whole JD and résumé must fit one check under the cap.
    const fits = checkFits({ jd, lines, company, role, rates, capUsd: NO_CAP_USD, maxOutputTokens: rates.maxOutputTokens });
    if (!fits.ok) throw tooLongError(fits, jd.length);
    await assertJdBudget(limits);

    // `active: true` + a unique index: two parallel requests (any process) cannot both start one.
    await ensureIndexes();
    const id = new mongoose.Types.ObjectId();
    try {
      await ResumeJdMatch.create({ _id: id, student: user._id, status: 'queued', stage: 'queued', active: true, company, role, jdHash, resumeHash, payload: seal({ jd }) });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const other = await ResumeJdMatch.findOne({ student: user._id, active: true }).lean();
      if (other) return { match: publicMatch(other), charge: null, joined: true };
      throw new HttpError(409, 'Another check is starting. Try again in a moment.', { code: 'JD_MATCH_BUSY' });
    }
    let charged = null;
    try {
      charged = await chargeFeature({
        scope: scopeOf(), userId: user._id, featureKey: JD_MATCH_COIN_FEATURE, resourceKey: String(id), expectedCost,
        note: [role, company].filter(Boolean).join(' · ') || 'Job description check',
      });
    } catch (error) {
      await ResumeJdMatch.deleteOne({ _id: id });
      throw error;
    }
    const cost = charged?.charge?.price || 0;
    if (charged?.charge) await ResumeJdMatch.updateOne({ _id: id }, { $set: { chargeId: charged.charge._id, cost } });
    enqueue(currentTenant(), id);
    const balance = await walletBalance(scopeOf(), { role: 'student', _id: user._id }).catch(() => null);
    const row = await ResumeJdMatch.findById(id).lean();
    return { match: publicMatch(row), charge: { cost, balance } };
  }

  async function read(user, id) {
    if (!mongoose.isValidObjectId(id)) return null;
    const row = await ResumeJdMatch.findOne({ _id: id, student: user._id }).lean();
    return publicMatch(await expireIfStale(row));
  }

  return { overview, start, read, run, enqueue, get pending() { return waiting.length + active; } };
}

let shared;
export const jdMatchService = () => (shared ||= createJdMatchService());

/**
 * For the Prep Coin sweeper: true keeps the charge (report delivered), false refunds it (failed or
 * gone), null leaves it for the next sweep (still queued/running, or the lookup failed).
 */
export async function jdMatchDelivered(charge) {
  if (!mongoose.isValidObjectId(charge.resourceKey)) return false;
  try {
    const row = await ResumeJdMatch.findById(charge.resourceKey).select('status updatedAt').lean();
    if (!row) return false;
    if (row.status === 'done') return true;
    if (['queued', 'running'].includes(row.status) && Date.now() - new Date(row.updatedAt).getTime() < 15 * 60_000) return null;
    return false;
  } catch { return null; }
}
