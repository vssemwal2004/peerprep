import { MemoryStore } from 'express-rate-limit';
import { getValkeyClient } from '../utils/valkey.js';

const incrementScript = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}`;
const decrementScript = `if tonumber(redis.call('GET', KEYS[1]) or '0') > 0 then return redis.call('DECR', KEYS[1]) end return 0`;

// Shadow every request locally so an outage does not reset a user's limit.
// During an outage limits are per API process, not a claim of global enforcement.
export class ResilientRateLimitStore {
  constructor(prefix, { client = getValkeyClient(), memory = new MemoryStore() } = {}) {
    this.prefix = prefix;
    this.client = client;
    this.memory = memory;
    this.localKeys = false;
    this.uncertain = new Map();
  }
  init(options) { this.windowMs = options.windowMs; this.memory.init(options); }
  async increment(key) {
    const local = await this.memory.increment(key);
    if (!this.client) return local;
    try {
      const [hits, ttl] = await this.client.sendCommand(['EVAL', incrementScript, '1', `${this.prefix}${key}`, String(this.windowMs)]);
      return { totalHits: Math.max(Number(hits), local.totalHits), resetTime: new Date(Date.now() + Number(ttl)) };
    } catch {
      // The remote increment might have been applied before a timeout. During
      // this window, never decrement a different remote request's count.
      const now = Date.now();
      for (const [entry, until] of this.uncertain) if (until <= now) this.uncertain.delete(entry);
      this.uncertain.set(key, now + this.windowMs);
      return local;
    }
  }
  async decrement(key) {
    await this.memory.decrement(key);
    if ((this.uncertain.get(key) || 0) > Date.now()) return;
    await this.client?.sendCommand(['EVAL', decrementScript, '1', `${this.prefix}${key}`]).catch(() => {});
  }
  async resetKey(key) {
    this.uncertain.delete(key);
    await this.memory.resetKey(key);
    await this.client?.sendCommand(['DEL', `${this.prefix}${key}`]).catch(() => {});
  }
  shutdown() { this.uncertain.clear(); this.memory.shutdown(); }
}
