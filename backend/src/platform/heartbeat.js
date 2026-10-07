import User from '../models/User.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import mongoose from 'mongoose';
import { controlRequest } from './client.js';
import { isUniversity } from './deployment.js';

export function startUniversityHeartbeat() {
  if (!isUniversity()) return () => {};
  let stopped = false;
  const send = async () => {
    if (stopped) return;
    try {
      const [students, coordinators, submissions, interviewSessions] = await Promise.all([
        User.countDocuments({ role: 'student' }),
        User.countDocuments({ role: 'coordinator' }),
        AssessmentSubmission.countDocuments(),
        mongoose.connection.collection('aiinterviewsessions').countDocuments(),
      ]);
      await controlRequest('heartbeat', { method: 'POST', body: { usage: { students, coordinators, submissions, interviewSessions } } });
    } catch (error) { console.warn('[platform] Heartbeat failed:', error.message); }
  };
  void send();
  const timer = setInterval(send, 60_000);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
