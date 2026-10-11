import '../setup.js';
import { connectDb, closeDb } from '../utils/db.js';
import { University, Publication, PlatformAudit, PlatformSettings } from '../platform/models.js';
import { isControlPlane } from '../platform/deployment.js';
import { InterviewQuestionReport } from '../platform/interviewQuestionReports.js';

if (!isControlPlane()) throw new Error('Set PEERPREP_DEPLOYMENT_ROLE=control before creating platform indexes');
try {
  await connectDb();
  await Promise.all([University.createIndexes(), Publication.createIndexes(), PlatformAudit.createIndexes(),
    PlatformSettings.createIndexes(), InterviewQuestionReport.createIndexes()]);
  console.log('Platform indexes created');
} finally { await closeDb(); }
