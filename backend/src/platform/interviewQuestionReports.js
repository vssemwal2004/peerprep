import crypto from 'crypto';
import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';
import { companyCatalog, companyKeyOf, companyVoteGroups, resolveCompany, voteThreshold } from './interviewCompanies.js';

const reportSchema = new mongoose.Schema({
  scopeKey: { type: String, required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reporterKey: { type: String, required: true },
  companyName: { type: String, required: true },
  companyKey: { type: String, required: true },
  jobTitle: { type: String, required: true },
  jobTitleKey: { type: String, required: true },
  interviewDate: { type: Date, required: true },
  // Where the reporter studies ('control' or 'university:<id>'); a shared question's scope alone cannot tell.
  originKey: { type: String, default: 'control' },
}, { timestamps: true });

reportSchema.index({ scopeKey: 1, questionId: 1, companyKey: 1, interviewDate: -1 });
reportSchema.index({ scopeKey: 1, questionId: 1, reporterKey: 1, companyKey: 1, jobTitleKey: 1, interviewDate: 1 }, { unique: true });
reportSchema.index({ companyKey: 1, interviewDate: -1 });
reportSchema.index({ reporterKey: 1, createdAt: -1 });

export const InterviewQuestionReport = mongoose.models.InterviewQuestionReport
  || mongoose.model('InterviewQuestionReport', reportSchema);

const DAILY_REPORT_LIMIT = 20;
const DEFAULT_JOB_TITLES = ['Software Engineer', 'Software Development Engineer', 'Data Analyst', 'Data Scientist', 'Product Manager'];
const clean = (value, max) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const key = (value) => value.toLocaleLowerCase('en-US');

export function reporterKey(universityId, studentId) {
  return crypto.createHash('sha256').update(`${universityId}:${studentId}`).digest('hex');
}

export function validateInterviewReport(body) {
  const companyName = clean(body?.company, 80);
  const jobTitle = clean(body?.jobTitle, 80);
  const dateText = String(body?.interviewDate || '');
  if (companyName.length < 2 || jobTitle.length < 2) throw new HttpError(400, 'Company and job title are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new HttpError(400, 'Choose a valid interview date');
  const interviewDate = new Date(`${dateText}T00:00:00.000Z`);
  // A student's local "today" can be one day ahead of the UTC date (IST between 00:00 and 05:30), so allow it.
  const latest = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (Number.isNaN(interviewDate.getTime()) || interviewDate.toISOString().slice(0, 10) !== dateText
    || dateText < '2000-01-01' || dateText > latest) throw new HttpError(400, 'Choose a past interview date');
  return { companyName, companyKey: companyKeyOf(companyName), jobTitle, jobTitleKey: key(jobTitle), interviewDate };
}

const SCOPE_PATTERN = /^(control|university:[a-z0-9][a-z0-9-]{1,62})$/;

export async function saveInterviewReport({ scopeKey, questionId, reporter, body, origin = 'control' }) {
  if (!mongoose.isValidObjectId(questionId) || !SCOPE_PATTERN.test(scopeKey) || !SCOPE_PATTERN.test(origin)
    || !/^[a-f0-9]{64}$/.test(reporter)) throw new HttpError(400, 'Invalid question report');
  const values = validateInterviewReport(body);
  const identity = { scopeKey, questionId, reporterKey: reporter,
    companyKey: values.companyKey, jobTitleKey: values.jobTitleKey, interviewDate: values.interviewDate };
  // An exact repeat stays idempotent; only a new report counts against the daily allowance.
  if (!(await InterviewQuestionReport.exists(identity)) && await InterviewQuestionReport.countDocuments({
    reporterKey: reporter, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }) >= DAILY_REPORT_LIMIT) {
    throw new HttpError(429, 'You have shared many interview reports today. Please try again tomorrow.');
  }
  await InterviewQuestionReport.updateOne(identity, { $setOnInsert: { ...identity, companyName: values.companyName, jobTitle: values.jobTitle, originKey: origin } }, { upsert: true });
  const listed = resolveCompany(values.companyKey, await companyCatalog());
  return { saved: true, company: listed ? { name: listed.name, status: 'listed' } : { name: values.companyName, status: 'pending' } };
}

/** Verified tags only: listed companies reported for a question by at least the vote threshold of distinct students. */
export async function interviewReportSummaries(scopeKeys, questionId = null) {
  if (questionId != null && !/^[a-f0-9]{24}$/i.test(String(questionId))) throw new HttpError(400, 'Invalid question');
  const match = { scopeKey: { $in: scopeKeys }, ...(questionId != null ? { questionId: new mongoose.Types.ObjectId(String(questionId)) } : {}) };
  const [groups, threshold] = await Promise.all([companyVoteGroups(match), voteThreshold()]);
  return groups.filter((group) => group.reporters.size >= threshold).map((group) => ({
    scopeKey: group.scopeKey, questionId: group.questionId, companyKey: companyKeyOf(group.company.name),
    company: group.company.name, latestDate: group.latestDate, reports: group.reporters.size, voters: group.reporters.size,
  }));
}

export async function interviewReportOptions() {
  const [catalog, reported] = await Promise.all([companyCatalog(), InterviewQuestionReport.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: { jobTitleKey: '$jobTitleKey', reporterKey: '$reporterKey' }, jobTitle: { $first: '$jobTitle' } } },
    { $group: { _id: '$_id.jobTitleKey', jobTitle: { $first: '$jobTitle' }, reporters: { $sum: 1 } } },
    { $match: { reporters: { $gte: 3 } } },
  ]).allowDiskUse(true)]);
  const jobTitles = new Map(DEFAULT_JOB_TITLES.map((title) => [key(title), title]));
  reported.forEach(({ _id, jobTitle }) => { if (!jobTitles.has(_id)) jobTitles.set(_id, jobTitle); });
  return { companies: [...new Set([...catalog.byKey.values()].map((company) => company.name))].sort((a, b) => a.localeCompare(b)),
    jobTitles: [...jobTitles.values()].sort((a, b) => a.localeCompare(b)) };
}
