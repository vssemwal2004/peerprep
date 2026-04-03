import { createClient } from 'redis';

let clientPromise = null;
let loggedDisabled = false;
let loggedEnabled = false;

function buildRedisUrl() {
  const directUrl = String(process.env.VALKEY_URL || process.env.REDIS_URL || '').trim();
  if (directUrl) {
    return directUrl;
  }

  const host = String(process.env.VALKEY_HOST || process.env.REDIS_HOST || '').trim();
  if (!host) return '';

  const port = Number(process.env.VALKEY_PORT || process.env.REDIS_PORT || 6379);
  const password = String(process.env.VALKEY_PASSWORD || process.env.REDIS_PASSWORD || '').trim();

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }

  return `redis://${host}:${port}`;
}

export function isValkeyEnabled() {
  return Boolean(buildRedisUrl());
}

export function getValkeyClient() {
  const redisUrl = buildRedisUrl();
  if (!redisUrl) {
    if (!loggedDisabled) {
      console.warn('[Valkey] REDIS/VALKEY env not configured. Falling back to in-memory limits.');
      loggedDisabled = true;
    }
    return null;
  }

  if (!clientPromise) {
    const client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
      },
    });

    client.on('error', (error) => {
      console.warn(`[Valkey] Client error: ${error.message}`);
    });

    clientPromise = client.connect()
      .then(() => {
        if (!loggedEnabled) {
          console.log('[Valkey] Connected. Using distributed compiler rate limits/cooldowns.');
          loggedEnabled = true;
        }
        return client;
      })
      .catch((error) => {
        console.warn(`[Valkey] Connection failed: ${error.message}. Falling back to in-memory limits.`);
        clientPromise = null;
        return null;
      });
  }

  return {
    sendCommand: async (args) => {
      const client = await clientPromise;
      if (!client) throw new Error('Valkey unavailable');
      return client.sendCommand(args);
    },
    set: async (...args) => {
      const client = await clientPromise;
      if (!client) throw new Error('Valkey unavailable');
      return client.set(...args);
    },
    pTTL: async (...args) => {
      const client = await clientPromise;
      if (!client) throw new Error('Valkey unavailable');
      return client.pTTL(...args);
    },
  };
}
