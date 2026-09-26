import mongoose from 'mongoose';
import { getCacheHealth, withDeadline } from '../utils/valkey.js';
import { getQueueHealth } from '../queues/queueManager.js';
import { getRealtimeHealth } from '../utils/realtime.js';

let snapshot = null;
let expiresAt = 0;
let pending = null;

export function readinessFromDependencies({ mongo, cache, queue, realtime }, shuttingDown = false) {
  // Durable answer writes and submission acceptance depend on Mongo. Cache,
  // Pub/Sub and scoring outages degrade capabilities without dropping saves.
  const ok = Boolean(mongo) && !shuttingDown;
  return {
    ok,
    mongo: Boolean(mongo),
    redis: Boolean(cache?.ready),
    cache,
    queue,
    realtime,
    degraded: !cache?.ready || !queue?.ready || (realtime?.configured && !realtime.ready),
    acceptingAnswers: ok,
  };
}

export async function readDependencyHealth() {
  if (snapshot && Date.now() < expiresAt) return snapshot;
  if (!pending) {
    pending = (async () => {
      const mongoCheck = mongoose.connection.readyState === 1
        ? withDeadline(mongoose.connection.db.admin().ping({ maxTimeMS: 750 }), 1000, 'Mongo health').then(() => true).catch(() => false)
        : Promise.resolve(false);
      const [mongo, cache, queue] = await Promise.all([mongoCheck, getCacheHealth(), getQueueHealth()]);
      snapshot = { mongo, cache, queue, realtime: getRealtimeHealth() };
      expiresAt = Date.now() + 3000;
      return snapshot;
    })().finally(() => { pending = null; });
  }
  return pending;
}
