import User from '../models/User.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import mongoose from 'mongoose';
import { controlRequest } from './client.js';
import { isUniversity } from './deployment.js';
import { syncUniversityGlobalRanking } from '../services/globalStudentRankingService.js';

export function startUniversityHeartbeat() {
  if (!isUniversity()) return () => {};
  let stopped = false;
  let rankingBusy = false;
  const send = async () => {
    if (stopped) return;
    if (!rankingBusy) {
      rankingBusy = true;
      void syncUniversityGlobalRanking().catch(() => console.warn('[platform] Global ranking sync unavailable')).finally(() => { rankingBusy = false; });
    }
    try {
      // ANVI attempts, plus anything left in the legacy interview-service collection.
      const [students, coordinators, submissions, anviAttempts, legacySessions] = await Promise.all([
        User.countDocuments({ role: 'student' }),
        User.countDocuments({ role: 'coordinator' }),
        AssessmentSubmission.countDocuments(),
        mongoose.connection.collection('anviattempts').countDocuments(),
        mongoose.connection.collection('aiinterviewsessions').countDocuments(),
      ]);
      const interviewSessions = anviAttempts + legacySessions;
      await controlRequest('heartbeat', { method: 'POST', body: { usage: { students, coordinators, submissions, interviewSessions } } });
    } catch (error) { console.warn('[platform] Heartbeat failed:', error.message); }
  };
  void send();
  const timer = setInterval(send, 60_000);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
