import mongoose from 'mongoose';
import User from '../../models/User.js';
import StudentUploadBatch from '../../models/StudentUploadBatch.js';
import { ANALYTICS_LIMITS } from './adminAnalytics.validation.js';

export function authorizedStudentBaseFilter(user) {
  const filter = { role: 'student' };
  if (user?.role === 'coordinator' && user.coordinatorDataScope !== 'all') {
    filter.teacherIds = user.coordinatorId;
  }
  return filter;
}

export function authorizedOwnedFilter(user, ownerField = 'createdBy') {
  if (user?.role === 'coordinator' && user.coordinatorDataScope !== 'all') return { [ownerField]: user._id };
  return {};
}

export function authorizedLearningFilter(user) {
  if (user?.role === 'coordinator' && user.coordinatorDataScope !== 'all') return { coordinatorId: user.coordinatorId };
  return {};
}

export async function resolveAuthorizedCohort(user, population, { countOnly = false } = {}) {
  const filter = authorizedStudentBaseFilter(user);
  if (population.statuses?.length) {
    const allowed = new Set(['active', 'inactive']);
    const values = population.statuses.map((value) => value.toLowerCase());
    if (values.every((value) => allowed.has(value)) && values.length === 1) filter.isActive = values[0] === 'active' ? { $ne: false } : false;
  } else if (population.activeOnly) filter.isActive = { $ne: false };
  if (population.studentIds.length) filter._id = { $in: population.studentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  if (population.semesters.length) filter.semester = { $in: population.semesters };
  if (population.groups.length) filter.group = { $in: population.groups };
  if (population.branches.length) filter.branch = { $in: population.branches };
  if (population.courses.length) filter.course = { $in: population.courses };
  if (population.colleges.length) filter.college = { $in: population.colleges };
  if (population.uploadBatchIds.length) {
    const batchFilter = { _id: { $in: population.uploadBatchIds }, entityType: 'student', status: 'active' };
    if (user?.role === 'coordinator' && user.coordinatorDataScope !== 'all') batchFilter.uploadedBy = user._id;
    const batches = await StudentUploadBatch.find(batchFilter).select('studentIds').lean();
    const batchIds = [...new Set(batches.flatMap((batch) => batch.studentIds || []).map(String))];
    const requested = filter._id?.$in?.map(String);
    const intersected = requested ? requested.filter((id) => batchIds.includes(id)) : batchIds;
    filter._id = { $in: intersected.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  if (countOnly) return { count: await User.countDocuments(filter), filter };
  const students = await User.find(filter)
    .select('_id name email studentId semester group branch course college uploadBatchIds')
    .sort({ name: 1, _id: 1 })
    .limit(ANALYTICS_LIMITS.maxCohort + 1)
    .lean();
  const truncated = students.length > ANALYTICS_LIMITS.maxCohort;
  return { students: students.slice(0, ANALYTICS_LIMITS.maxCohort), filter, truncated };
}
