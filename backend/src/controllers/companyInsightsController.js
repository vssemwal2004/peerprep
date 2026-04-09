import Papa from 'papaparse';
import CompanyBenchmark from '../models/CompanyBenchmark.js';
import { HttpError } from '../utils/errors.js';
import { sanitizeCsvRow, validateCsvImport, sanitizeString } from '../utils/validators.js';
import { logActivity } from './adminActivityController.js';

const REQUIRED_FIELDS = [
  'company_name',
  'dsa_accuracy_required',
  'required_topics',
  'min_question_attempts',
  'min_streak_days',
  'interview_min_score',
  'weight_dsa',
  'weight_consistency',
  'weight_interview',
];

function normalizeWeight(value, fallback) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

function parseTopics(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((t) => sanitizeString(t, 80)).filter(Boolean);
  return value
    .toString()
    .split(/[,;|]/)
    .map((t) => sanitizeString(t, 80))
    .filter(Boolean);
}

function normalizeBenchmarkPayload(payload = {}) {
  return {
    companyName: sanitizeString(payload.companyName ?? payload.company_name, 120),
    dsaAccuracyRequired: Number(payload.dsaAccuracyRequired ?? payload.dsa_accuracy_required ?? 70),
    requiredTopics: parseTopics(payload.requiredTopics ?? payload.required_topics),
    minQuestionAttempts: Number(payload.minQuestionAttempts ?? payload.min_question_attempts ?? 0),
    minStreak: Number(payload.minStreak ?? payload.min_streak_days ?? payload.min_streak ?? 5),
    interviewScore: Number(payload.interviewScore ?? payload.interview_min_score ?? payload.interview_score ?? 70),
    weightDsa: normalizeWeight(payload.weightDsa ?? payload.weight_dsa, 0.4),
    weightConsistency: normalizeWeight(payload.weightConsistency ?? payload.weight_consistency, 0.3),
    weightInterview: normalizeWeight(payload.weightInterview ?? payload.weight_interview, 0.3),
  };
}

function validateBenchmarkPayload(payload) {
  const errors = [];
  if (!payload.companyName) errors.push('company_name is required');
  if (!payload.requiredTopics || payload.requiredTopics.length === 0) errors.push('required_topics cannot be empty');
  if (Number.isNaN(payload.dsaAccuracyRequired) || payload.dsaAccuracyRequired < 0 || payload.dsaAccuracyRequired > 100) {
    errors.push('dsa_accuracy_required must be between 0 and 100');
  }
  if (Number.isNaN(payload.interviewScore) || payload.interviewScore < 0 || payload.interviewScore > 100) {
    errors.push('interview_min_score must be between 0 and 100');
  }
  if (Number.isNaN(payload.minQuestionAttempts) || payload.minQuestionAttempts < 0) {
    errors.push('min_question_attempts must be 0 or greater');
  }
  if (Number.isNaN(payload.minStreak) || payload.minStreak < 0) {
    errors.push('min_streak_days must be 0 or greater');
  }
  if (payload.weightDsa < 0 || payload.weightDsa > 1) errors.push('weight_dsa must be between 0 and 1');
  if (payload.weightConsistency < 0 || payload.weightConsistency > 1) errors.push('weight_consistency must be between 0 and 1');
  if (payload.weightInterview < 0 || payload.weightInterview > 1) errors.push('weight_interview must be between 0 and 1');
  return errors;
}

function toResponse(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    companyName: doc.companyName,
    dsaAccuracyRequired: doc.dsaAccuracyRequired,
    requiredTopics: doc.requiredTopics || [],
    minQuestionAttempts: doc.minQuestionAttempts || 0,
    minStreak: doc.minStreak,
    interviewScore: doc.interviewScore,
    weightDsa: doc.weightDsa,
    weightConsistency: doc.weightConsistency,
    weightInterview: doc.weightInterview,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listCompanyBenchmarks(req, res) {
  const data = await CompanyBenchmark.find().sort({ companyName: 1 }).lean();
  res.json({ companies: data.map(toResponse) });
}

export async function listCompanyBenchmarksForStudents(req, res) {
  const data = await CompanyBenchmark.find().sort({ companyName: 1 }).lean();
  res.json({
    companies: data.map((doc) => ({
      id: doc._id,
      companyName: doc.companyName,
      requiredTopics: doc.requiredTopics || [],
    })),
  });
}

export async function createCompanyBenchmark(req, res) {
  const payload = normalizeBenchmarkPayload(req.body || {});
  const errors = validateBenchmarkPayload(payload);
  if (errors.length) throw new HttpError(400, errors.join('; '));

  const existing = await CompanyBenchmark.findOne({ companyName: payload.companyName }).lean();
  if (existing) throw new HttpError(409, 'Company benchmark already exists');

  const benchmark = await CompanyBenchmark.create({
    ...payload,
    createdBy: req.user?._id,
    updatedBy: req.user?._id,
  });

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'CREATE',
    targetType: 'COMPANY_BENCHMARK',
    targetId: String(benchmark._id),
    description: `Created company benchmark: ${benchmark.companyName}`,
    changes: { companyName: { from: null, to: benchmark.companyName } },
    metadata: { companyBenchmarkId: String(benchmark._id), companyName: benchmark.companyName },
    req,
  });

  res.status(201).json({ company: toResponse(benchmark) });
}

export async function updateCompanyBenchmark(req, res) {
  const payload = normalizeBenchmarkPayload(req.body || {});
  const errors = validateBenchmarkPayload(payload);
  if (errors.length) throw new HttpError(400, errors.join('; '));

  const before = await CompanyBenchmark.findById(req.params.id).lean();
  if (!before) throw new HttpError(404, 'Company benchmark not found');

  const updated = await CompanyBenchmark.findByIdAndUpdate(
    req.params.id,
    { ...payload, updatedBy: req.user?._id },
    { new: true },
  );
  if (!updated) throw new HttpError(404, 'Company benchmark not found');

  const keys = Object.keys(payload);
  const changes = {};
  keys.forEach((k) => {
    const from = before?.[k] ?? null;
    const to = updated?.[k] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
  });

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'UPDATE',
    targetType: 'COMPANY_BENCHMARK',
    targetId: String(updated._id),
    description: `Updated company benchmark: ${updated.companyName}`,
    changes: Object.keys(changes).length ? changes : null,
    metadata: { companyBenchmarkId: String(updated._id), companyName: updated.companyName },
    req,
  });

  res.json({ company: toResponse(updated) });
}

export async function deleteCompanyBenchmark(req, res) {
  const removed = await CompanyBenchmark.findByIdAndDelete(req.params.id);
  if (!removed) throw new HttpError(404, 'Company benchmark not found');

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'DELETE',
    targetType: 'COMPANY_BENCHMARK',
    targetId: String(removed._id),
    description: `Deleted company benchmark: ${removed.companyName}`,
    metadata: { companyBenchmarkId: String(removed._id), companyName: removed.companyName },
    req,
  });

  res.json({ success: true });
}

export async function downloadCompanyBenchmarkTemplate(req, res) {
  const header = REQUIRED_FIELDS.join(',');
  const sample = 'ExampleCorp,75,"Arrays;DP;Graphs",30,5,70,0.45,0.25,0.3';
  const csv = `${header}\n${sample}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="company-benchmarks-template.csv"');
  res.send(csv);
}

export async function uploadCompanyBenchmarks(req, res) {
  if (!req.file) throw new HttpError(400, 'CSV file required');

  const fileSize = req.file.size || req.file.buffer?.length || 0;
  const csvText = req.file.buffer.toString('utf8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data || [];

  const csvValidation = validateCsvImport(rows, fileSize);
  if (!csvValidation.valid) {
    throw new HttpError(400, csvValidation.errors.join('; '));
  }

  const results = { imported: 0, skipped: 0, errors: [] };
  const normalizedRows = [];

  rows.forEach((rawRow, index) => {
    const row = sanitizeCsvRow(rawRow);
    const normalized = normalizeBenchmarkPayload({
      company_name: row.company_name || row.companyName || row.companyname,
      dsa_accuracy_required: row.dsa_accuracy_required,
      required_topics: row.required_topics,
      min_question_attempts: row.min_question_attempts,
      min_streak_days: row.min_streak_days,
      interview_min_score: row.interview_min_score,
      weight_dsa: row.weight_dsa,
      weight_consistency: row.weight_consistency,
      weight_interview: row.weight_interview,
    });

    const errors = validateBenchmarkPayload(normalized);
    if (errors.length) {
      results.skipped += 1;
      results.errors.push({ row: index + 2, company: normalized.companyName || '-', issues: errors });
      return;
    }
    normalizedRows.push(normalized);
  });

  for (const normalized of normalizedRows) {
    try {
      await CompanyBenchmark.findOneAndUpdate(
        { companyName: normalized.companyName },
        { ...normalized, updatedBy: req.user?._id },
        { upsert: true, new: true },
      );
      results.imported += 1;
    } catch (err) {
      results.skipped += 1;
      results.errors.push({ row: '-', company: normalized.companyName, issues: [err.message] });
    }
  }

  logActivity({
    userEmail: req.user?.email,
    userRole: req.user?.role,
    actionType: 'UPLOAD',
    targetType: 'COMPANY_BENCHMARK',
    description: `Uploaded company benchmarks CSV: ${results.imported} imported, ${results.skipped} skipped`,
    metadata: {
      imported: results.imported,
      skipped: results.skipped,
      fileSize,
    },
    req,
  });

  res.json({ result: results });
}
