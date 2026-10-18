import '../setup.js';
import { connectDb, closeDb } from '../utils/db.js';
import { University, Publication, PlatformAudit, PlatformSettings, PlatformLoginIdentity, PlatformLoginDirectoryState, PlatformCoinWallet, PlatformCoinMovement, PlatformAccountCreationLock } from '../platform/models.js';
import { isControlPlane } from '../platform/deployment.js';
import { InterviewQuestionReport } from '../platform/interviewQuestionReports.js';
import { InterviewCompany } from '../platform/interviewCompanies.js';

if (!isControlPlane()) throw new Error('Set PEERPREP_DEPLOYMENT_ROLE=shared before creating platform indexes');
try {
  await connectDb();
  await Promise.all([University.createIndexes(), Publication.createIndexes(), PlatformAudit.createIndexes(),
    PlatformSettings.createIndexes(), PlatformLoginIdentity.createIndexes(), PlatformLoginDirectoryState.createIndexes(),
    PlatformCoinWallet.createIndexes(), PlatformCoinMovement.createIndexes(), PlatformAccountCreationLock.createIndexes(),
    InterviewQuestionReport.createIndexes(), InterviewCompany.createIndexes()]);
  console.log('Platform indexes created');
} finally { await closeDb(); }
