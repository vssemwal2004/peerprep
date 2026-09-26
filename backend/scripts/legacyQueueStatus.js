import '../src/setup.js';
import { createQueueConnection, getLegacyQueueCounts, hasLegacyJobs } from '../src/queues/queueManager.js';
import { buildValkeyUrl, withDeadline } from '../src/utils/valkey.js';

const client = createQueueConnection({ url: process.env.LEGACY_QUEUE_URL || buildValkeyUrl('queue') });
try {
  await withDeadline(client.connect(), 3000, 'Legacy queue connection');
  const counts = await getLegacyQueueCounts(client);
  console.log(JSON.stringify({ drained: !hasLegacyJobs(counts), queues: counts }, null, 2));
  if (hasLegacyJobs(counts)) process.exitCode = 2;
} catch (error) {
  console.error(`Unable to inspect legacy queues (${error.code || error.name}).`);
  process.exitCode = 1;
} finally { client.disconnect(); }
