import cron from 'node-cron';
import crypto from 'crypto';
import Pair from '../models/Pair.js';
import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import Feedback from '../models/Feedback.js';
import Progress from '../models/Progress.js';
import Submission from '../models/Submission.js';
import { createNotifications } from '../services/notificationService.js';

// Run every 5 minutes to auto-generate meeting links for upcoming interviews
// Also sends real-time notifications for interview and assessment reminders
cron.schedule('*/5 * * * *', async () => {
  const now = new Date();
  const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const pairs = await Pair.find({ 
    scheduledAt: { $gte: now, $lte: oneHour },
    meetingLink: { $exists: false } // Only pairs without a link
  });
  
  for (const p of pairs) {
    // Auto-generate meeting link within 1 hour window if not already generated
    const base = (process.env.MEETING_LINK_BASE || 'https://meet.jit.si').replace(/\/$/, '');
    const token = crypto.randomUUID();
    p.meetingLink = `${base}/${token}`;
    await p.save();
    console.log(`[reminders] Auto-generated meeting link for pair ${p._id}: ${p.meetingLink}`);

    await createNotifications([
      {
        userId: p.interviewer,
        title: 'Meeting Link Available',
        message: 'Meeting link available',
        type: 'INTERVIEW',
        referenceId: p._id,
        actionUrl: '/student/session',
        dedupeKey: `meeting-link:${p._id}:${p.interviewer}`
      },
      {
        userId: p.interviewee,
        title: 'Meeting Link Available',
        message: 'Meeting link available',
        type: 'INTERVIEW',
        referenceId: p._id,
        actionUrl: '/student/session',
        dedupeKey: `meeting-link:${p._id}:${p.interviewee}`
      }
    ]);
  }
  
  if (pairs.length > 0) {
    console.log(`[reminders] Generated ${pairs.length} meeting links`);
  }

  const windowMs = 5 * 60 * 1000;
  const reminderOffsets = [
    { label: '24h', ms: 24 * 60 * 60 * 1000, title: 'Interview Reminder', message: 'Your interview slot is confirmed' },
    { label: '1h', ms: 60 * 60 * 1000, title: 'Interview Reminder', message: 'Your interview slot is confirmed' },
    { label: '10m', ms: 10 * 60 * 1000, title: 'Interview Starting Soon', message: 'Join your interview now' },
  ];

  for (const offset of reminderOffsets) {
    const windowStart = new Date(now.getTime() + offset.ms - windowMs / 2);
    const windowEnd = new Date(now.getTime() + offset.ms + windowMs / 2);
    const upcomingPairs = await Pair.find({
      status: 'scheduled',
      scheduledAt: { $gte: windowStart, $lte: windowEnd }
    }).select('_id interviewer interviewee scheduledAt').lean();

    if (upcomingPairs.length > 0) {
      const notifs = upcomingPairs.flatMap(p => ([
        {
          userId: p.interviewer,
          title: offset.title,
          message: offset.message,
          type: 'INTERVIEW',
          referenceId: p._id,
          actionUrl: '/student/session',
          dedupeKey: `interview-${offset.label}:${p._id}:${p.interviewer}`
        },
        {
          userId: p.interviewee,
          title: offset.title,
          message: offset.message,
          type: 'INTERVIEW',
          referenceId: p._id,
          actionUrl: '/student/session',
          dedupeKey: `interview-${offset.label}:${p._id}:${p.interviewee}`
        }
      ]));
      await createNotifications(notifs);
    }
  }

  // Assessment reminders: 24h, 1h, 10m
  const assessmentOffsets = [
    { label: '24h', ms: 24 * 60 * 60 * 1000 },
    { label: '1h', ms: 60 * 60 * 1000 },
    { label: '10m', ms: 10 * 60 * 1000 }
  ];

  for (const offset of assessmentOffsets) {
    const windowStart = new Date(now.getTime() + offset.ms - windowMs / 2);
    const windowEnd = new Date(now.getTime() + offset.ms + windowMs / 2);
    const assessments = await Assessment.find({
      lifecycleStatus: 'published',
      startTime: { $gte: windowStart, $lte: windowEnd }
    }).select('_id targetType assignedStudents').lean();

    for (const assessment of assessments) {
      let userIds = assessment.assignedStudents || [];
      if (assessment.targetType === 'all') {
        const students = await User.find({ role: 'student' }).select('_id').lean();
        userIds = students.map(s => s._id);
      }
      if (!userIds.length) continue;
      const notifs = userIds.map(uid => ({
        userId: uid,
        title: 'Assessment Reminder',
        message: 'A new assessment has been assigned',
        type: 'ASSESSMENT',
        referenceId: assessment._id,
        actionUrl: `/student/assessment/${assessment._id}`,
        dedupeKey: `assessment-${offset.label}:${assessment._id}:${uid}`
      }));
      await createNotifications(notifs);
    }
  }

  // Assessment live notifications (start time reached)
  const liveWindowStart = new Date(now.getTime() - windowMs / 2);
  const liveWindowEnd = new Date(now.getTime() + windowMs / 2);
  const liveAssessments = await Assessment.find({
    lifecycleStatus: 'published',
    startTime: { $gte: liveWindowStart, $lte: liveWindowEnd }
  }).select('_id targetType assignedStudents').lean();
  for (const assessment of liveAssessments) {
    let userIds = assessment.assignedStudents || [];
    if (assessment.targetType === 'all') {
      const students = await User.find({ role: 'student' }).select('_id').lean();
      userIds = students.map(s => s._id);
    }
    if (!userIds.length) continue;
    const notifs = userIds.map(uid => ({
      userId: uid,
      title: 'Assessment Live',
      message: 'Your assessment is now live',
      type: 'ASSESSMENT',
      referenceId: assessment._id,
      actionUrl: `/student/assessment/${assessment._id}`,
      dedupeKey: `assessment-live:${assessment._id}:${uid}`
    }));
    await createNotifications(notifs);
  }

  // Feedback pending reminders (after session ends, once)
  const durationMin = Number(process.env.MEETING_DURATION_MIN || 30);
  const endThreshold = new Date(now.getTime() - durationMin * 60 * 1000);
  const completedPairs = await Pair.find({
    status: { $in: ['scheduled', 'completed'] },
    scheduledAt: { $lte: endThreshold }
  }).select('_id interviewer event').lean();
  for (const pair of completedPairs) {
    const existing = await Feedback.findOne({ pair: pair._id, from: pair.interviewer }).select('_id').lean();
    if (existing) continue;
    await createNotifications([
      {
        userId: pair.interviewer,
        title: 'Feedback Pending',
        message: 'Please submit feedback for your session',
        type: 'FEEDBACK',
        referenceId: pair._id,
        actionUrl: '/student/session',
        dedupeKey: `feedback-pending:${pair._id}:${pair.interviewer}`
      }
    ]);
  }
});

// Daily learning & practice reminders
cron.schedule('0 9 * * *', async () => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const students = await User.find({ role: 'student' }).select('_id').lean();
  const studentIds = students.map(s => s._id);

  // Learning progress reminder
  const progressAgg = await Progress.aggregate([
    { $match: { studentId: { $in: studentIds } } },
    { $group: { _id: '$studentId', lastAccessedAt: { $max: '$lastAccessedAt' } } }
  ]);
  const progressMap = new Map(progressAgg.map(p => [String(p._id), p.lastAccessedAt]));
  const learningNotifs = studentIds
    .filter(id => {
      const last = progressMap.get(String(id));
      return !last || new Date(last).getTime() < sevenDaysAgo.getTime();
    })
    .map(id => ({
      userId: id,
      title: 'Learning Reminder',
      message: 'Continue your learning progress',
      type: 'LEARNING',
      referenceId: id,
      actionUrl: '/student/learning',
      dedupeKey: `learning-reminder:${id}:${now.toISOString().slice(0,10)}`
    }));
  if (learningNotifs.length) await createNotifications(learningNotifs);

  // Practice reminder based on compiler submissions
  const submissionAgg = await Submission.aggregate([
    { $match: { user: { $in: studentIds } } },
    { $group: { _id: '$user', lastSubmittedAt: { $max: '$createdAt' } } }
  ]);
  const submissionMap = new Map(submissionAgg.map(s => [String(s._id), s.lastSubmittedAt]));
  const practiceNotifs = studentIds
    .filter(id => {
      const last = submissionMap.get(String(id));
      return !last || new Date(last).getTime() < sevenDaysAgo.getTime();
    })
    .map(id => ({
      userId: id,
      title: 'Practice Reminder',
      message: 'Try solving more problems to improve',
      type: 'CODING',
      referenceId: id,
      actionUrl: '/problems',
      dedupeKey: `practice-reminder:${id}:${now.toISOString().slice(0,10)}`
    }));
  if (practiceNotifs.length) await createNotifications(practiceNotifs);
});

