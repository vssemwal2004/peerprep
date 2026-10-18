import mongoose from 'mongoose';
import { deploymentRole } from './deployment.js';

export async function verifyDeploymentDatabaseIdentity() {
  const role = deploymentRole();
  if (role === 'standalone') return;
  const universityId = role === 'university' ? process.env.PEERPREP_UNIVERSITY_ID : null;
  const storedRole = role === 'shared' ? 'control' : role;
  const collection = mongoose.connection.db.collection('peerprep_deployment_identity');
  try {
    await collection.updateOne(
      { _id: 'deployment' },
      { $setOnInsert: { role: storedRole, universityId, createdAt: new Date() } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const identity = await collection.findOne({ _id: 'deployment' });
  if (identity?.role !== storedRole || (identity?.universityId || null) !== universityId) {
    throw new Error('MONGODB_URI points to a database assigned to another PeerPrep deployment');
  }
}
