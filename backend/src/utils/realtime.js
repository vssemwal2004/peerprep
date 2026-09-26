import IORedis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Emitter } from '@socket.io/redis-emitter';
import { buildValkeyUrl } from './valkey.js';
import { getIo, setIo } from './io.js';

const clients = new Set();
const channelKey = () => process.env.SOCKET_IO_CHANNEL || 'peerprep:socket:v1';

function connection({ subscriber = false } = {}) {
  const url = process.env.SOCKET_VALKEY_URL || buildValkeyUrl('cache');
  if (!url || process.env.SOCKET_REDIS_ENABLED === 'false') return null;
  const client = new IORedis(url, {
    lazyConnect: true,
    enableOfflineQueue: subscriber,
    maxRetriesPerRequest: subscriber ? null : 1,
    connectTimeout: 1000,
    ...(subscriber ? {} : { commandTimeout: 1000 }),
    retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
  });
  client.on('error', () => {});
  // Socket notifications are hints. The durable HTTP result must not fail
  // because Pub/Sub is offline; clients refetch status after reconnect.
  const publish = client.publish.bind(client);
  client.publish = (...args) => publish(...args).catch(() => 0);
  if (subscriber) {
    for (const method of ['subscribe', 'psubscribe', 'unsubscribe', 'punsubscribe']) {
      const operation = client[method].bind(client);
      client[method] = (...args) => operation(...args).catch(() => 0);
    }
  }
  clients.add(client);
  void client.connect().catch(() => {});
  return client;
}

export function configureSocketAdapter(io) {
  const pub = connection();
  if (!pub) return false;
  const sub = connection({ subscriber: true });
  io.adapter(createAdapter(pub, sub, {
    key: channelKey(),
    requestsTimeout: 1500,
    publishOnSpecificResponseChannel: true,
  }));
  return true;
}

export function startWorkerEmitter() {
  if (getIo()) return;
  const client = connection();
  if (client) setIo(new Emitter(client, { key: channelKey() }));
}

export function getRealtimeHealth() {
  return { configured: clients.size > 0, ready: clients.size > 0 && [...clients].every((client) => client.status === 'ready') };
}

export async function closeRealtime() {
  for (const client of clients) client.disconnect();
  clients.clear();
}
