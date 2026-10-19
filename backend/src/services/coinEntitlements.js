// Facts the Prep Coin guard needs about a student's own use of a feature: has it already been
// started or joined (so it is never charged twice), and was it assigned rather than chosen.
import mongoose from 'mongoose';
import User from '../models/User.js';
import Event from '../models/Event.js';
import EventParticipant from '../models/EventParticipant.js';
import { InterviewEngagementReceipt } from '../models/AdaptiveEngagement.js';
import { engagementTenant } from './engagementPolicyService.js';
import { currentTenant } from '../platform/tenantContext.js';

// The interview service stores sessions in the university's database; older sessions predate
// local start receipts, so their owner field is probed the same way platform inspection does.
const SESSION_OWNER_FIELDS = ['studentId', 'student_id', 'userId', 'user_id', 'candidateId', 'candidate_id'];

export async function aiInterviewStarted(student, interviewId) {
  const id = String(interviewId || '');
  if (!id) return false;
  const receipt = await InterviewEngagementReceipt.exists({ tenantKey: engagementTenant(student), studentId: student._id, interviewId: id });
  if (receipt) return true;
  const connection = currentTenant()?.connection || mongoose.connection;
  const owners = [student._id, String(student._id)];
  const interviews = mongoose.isValidObjectId(id) ? [id, new mongoose.Types.ObjectId(id)] : [id];
  const session = await connection.collection('aiinterviewsessions').findOne(
    { interviewId: { $in: interviews }, $or: SESSION_OWNER_FIELDS.map((field) => ({ [field]: { $in: owners } })) },
    { projection: { _id: 1 } },
  ).catch(() => null);
  return Boolean(session);
}

/** Events a coordinator assigned (special or selected students) are never charged. */
export async function eventAssigned(eventId) {
  if (!mongoose.isValidObjectId(eventId)) return false;
  const event = await Event.findById(eventId).select('isSpecial selectionMode').lean();
  return Boolean(event && (event.isSpecial || ['selected', 'filters', 'csv'].includes(event.selectionMode)));
}

const chargedStudent = (charge) => User.findById(charge.userId).select('_id role college').lean();

/** For the sweeper: did the action behind a charge left pending actually happen? */
export const chargeVerifiers = Object.freeze({
  'ai_interview.start': async (charge) => {
    const student = await chargedStudent(charge);
    return Boolean(student) && aiInterviewStarted(student, charge.resourceKey);
  },
  'mock_interview.join': async (charge) => {
    const student = await chargedStudent(charge);
    return Boolean(student) && eventJoined(student, charge.resourceKey);
  },
});

export async function eventJoined(student, eventId) {
  if (!mongoose.isValidObjectId(eventId)) return false;
  const [listed, participant] = await Promise.all([
    Event.exists({ _id: eventId, participants: student._id }),
    EventParticipant.exists({ eventId, studentId: student._id, joinedAt: { $ne: null } }),
  ]);
  return Boolean(listed || participant);
}
