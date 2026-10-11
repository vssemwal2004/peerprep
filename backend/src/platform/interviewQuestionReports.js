import crypto from 'crypto';
import mongoose from 'mongoose';
import { HttpError } from '../utils/errors.js';

const reportSchema = new mongoose.Schema({
  scopeKey: { type: String, required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reporterKey: { type: String, required: true },
  companyName: { type: String, required: true },
  companyKey: { type: String, required: true },
  jobTitle: { type: String, required: true },
  jobTitleKey: { type: String, required: true },
  interviewDate: { type: Date, required: true },
}, { timestamps: true });

reportSchema.index({ scopeKey: 1, questionId: 1, companyKey: 1, interviewDate: -1 });
reportSchema.index({ scopeKey: 1, questionId: 1, reporterKey: 1, companyKey: 1, jobTitleKey: 1, interviewDate: 1 }, { unique: true });
reportSchema.index({ companyKey: 1, interviewDate: -1 });

export const InterviewQuestionReport = mongoose.models.InterviewQuestionReport
  || mongoose.model('InterviewQuestionReport', reportSchema);

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
  const today = new Date().toISOString().slice(0, 10);
  if (Number.isNaN(interviewDate.getTime()) || interviewDate.toISOString().slice(0, 10) !== dateText
    || dateText < '2000-01-01' || dateText > today) throw new HttpError(400, 'Choose a past interview date');
  return { companyName, companyKey: key(companyName), jobTitle, jobTitleKey: key(jobTitle), interviewDate };
}

export async function saveInterviewReport({ scopeKey, questionId, reporter, body }) {
  if (!mongoose.isValidObjectId(questionId) || !/^(control|university:[a-z0-9][a-z0-9-]{1,62})$/.test(scopeKey)
    || !/^[a-f0-9]{64}$/.test(reporter)) throw new HttpError(400, 'Invalid question report');
  const values = validateInterviewReport(body);
  const identity = { scopeKey, questionId, reporterKey: reporter,
    companyKey: values.companyKey, jobTitleKey: values.jobTitleKey, interviewDate: values.interviewDate };
  await InterviewQuestionReport.updateOne(identity, { $setOnInsert: { ...identity, companyName: values.companyName, jobTitle: values.jobTitle } }, { upsert: true });
  return { saved: true };
}

export async function interviewReportSummaries(scopeKeys) {
  return InterviewQuestionReport.aggregate([
    { $match: { scopeKey: { $in: scopeKeys } } },
    { $sort: { interviewDate: -1, createdAt: -1 } },
    { $group: { _id: { scopeKey: '$scopeKey', questionId: '$questionId', companyKey: '$companyKey' },
      company: { $first: '$companyName' }, latestDate: { $max: '$interviewDate' }, reports: { $sum: 1 } } },
    { $project: { _id: 0, scopeKey: '$_id.scopeKey', questionId: '$_id.questionId',
      companyKey: '$_id.companyKey', company: 1, latestDate: 1, reports: 1 } },
  ]);
}

export async function interviewReportOptions() {
  const [companies, jobTitles] = await Promise.all([
    InterviewQuestionReport.distinct('companyName'),
    InterviewQuestionReport.distinct('jobTitle'),
  ]);
  return { companies: companies.sort((a, b) => a.localeCompare(b)),
    jobTitles: [...new Set(['Software Engineer', 'Software Development Engineer', 'Data Analyst', 'Data Scientist', 'Product Manager', ...jobTitles])]
      .sort((a, b) => a.localeCompare(b)) };
}
