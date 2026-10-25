import { randomUUID } from "node:crypto";
import { getValkeyClient } from "../../utils/valkey.js";

// Admission control for ANVI Live sessions. Every conductor holding a Live session owns one slot, counted
// globally and per university. Slots are always tracked in this process; with Valkey configured they are
// also leased in shared sorted sets (score = lease expiry, refreshed by a heartbeat), so the caps hold
// across instances and a crashed instance's slots expire on their own. A Valkey failure falls back to the
// in-process count instead of refusing interviews.
const SLOT_TTL_MS = 90_000;
const HEARTBEAT_MS = 30_000;
// The keys share one hash tag so the scripts also run on a Valkey cluster.
const KEY_PREFIX = "anvi:live:v1:{slots}";
const KEY_TTL_MS = 24 * 60 * 60_000;

// KEYS: global set, university set, owner hash. ARGV: now, expiresAt, member, token, globalCap,
// tenantCap, force, keyTtl. Returns {1, "new"|"held"} or {0, "global"|"tenant"}.
export const ACQUIRE_SCRIPT = `local now = tonumber(ARGV[1])
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now)
for _, member in ipairs(expired) do redis.call('HDEL', KEYS[3], member) end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local held = redis.call('ZSCORE', KEYS[1], ARGV[3])
if (not held) and ARGV[7] ~= '1' then
  if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[5]) then return {0, 'global'} end
  if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[6]) then return {0, 'tenant'} end
end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
redis.call('HSET', KEYS[3], ARGV[3], ARGV[4])
for i = 1, 3 do redis.call('PEXPIRE', KEYS[i], ARGV[8]) end
if held then return {1, 'held'} end
return {1, 'new'}`;

// KEYS as above. ARGV: expiresAt, member, token, keyTtl. A slot another holder now owns is left alone.
export const HEARTBEAT_SCRIPT = `local owner = redis.call('HGET', KEYS[3], ARGV[2])
if owner and owner ~= ARGV[3] then return 0 end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[3], ARGV[2], ARGV[3])
for i = 1, 3 do redis.call('PEXPIRE', KEYS[i], ARGV[4]) end
return 1`;

// KEYS as above. ARGV: member, token. Only the current owner removes a slot.
export const RELEASE_SCRIPT = `if redis.call('HGET', KEYS[3], ARGV[1]) == ARGV[2] then
  redis.call('HDEL', KEYS[3], ARGV[1])
  redis.call('ZREM', KEYS[1], ARGV[1])
  redis.call('ZREM', KEYS[2], ARGV[1])
  return 1
end
return 0`;

const keysFor = (tenantKey) => [`${KEY_PREFIX}:all`, `${KEY_PREFIX}:tenant:${tenantKey}`, `${KEY_PREFIX}:owners`];

/**
 * `acquire({attemptId, tenantKey, resume})` returns a slot, or null when a cap is reached (`full()` says
 * which). A resume (the attempt already ran, is held here, or the student is switching interviews) is
 * always admitted and still counted. `release(slot)` is idempotent; a slot replaced by a later acquire
 * for the same attempt (a takeover) is not removed by the old holder's release.
 */
export function createLiveCapacity({
  maxLiveSessions = 25,
  maxLiveSessionsPerTenant = 15,
  client = process.env.NODE_TEST_CONTEXT ? null : getValkeyClient(),
  clock = Date,
  intervals = { setInterval, clearInterval },
  log = console,
} = {}) {
  const globalCap = Math.max(1, Number(maxLiveSessions) || 25);
  const tenantCap = Math.max(1, Number(maxLiveSessionsPerTenant) || 15);
  // attemptId -> the slot that currently holds it in this process.
  const slots = new Map();
  let heartbeat = null;
  let warned = false;

  const countFor = (tenantKey) => [...slots.values()].filter((slot) => slot.tenantKey === tenantKey).length;
  const remote = async (script, keys, args) => client.sendCommand(["EVAL", script, String(keys.length), ...keys, ...args.map(String)]);
  const warnOnce = (error) => {
    if (warned) return;
    warned = true;
    log.warn?.(`[ANVI] Shared live-session count unavailable; using this process's count (${error?.name || "Error"}).`);
  };

  function beat() {
    const at = clock.now();
    for (const slot of slots.values()) {
      remote(HEARTBEAT_SCRIPT, keysFor(slot.tenantKey), [at + SLOT_TTL_MS, slot.member, slot.token, KEY_TTL_MS]).catch(warnOnce);
    }
  }
  const syncHeartbeat = () => {
    if (client && slots.size && !heartbeat) {
      heartbeat = intervals.setInterval(beat, HEARTBEAT_MS);
      heartbeat?.unref?.();
    } else if (!slots.size && heartbeat) {
      intervals.clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  async function acquire({ attemptId, tenantKey = "platform", resume = false }) {
    const id = String(attemptId);
    const tenant = String(tenantKey || "platform");
    const force = resume || slots.has(id);
    // The local check and reservation are synchronous, so parallel joins in this process cannot overshoot.
    if (!force) {
      if (slots.size >= globalCap) return { ok: false, scope: "global" };
      if (countFor(tenant) >= tenantCap) return { ok: false, scope: "tenant" };
    }
    const slot = { attemptId: id, tenantKey: tenant, member: `${tenant}|${id}`, token: randomUUID(), released: false };
    slots.set(id, slot);
    syncHeartbeat();
    if (!client) return { ok: true, slot };
    try {
      const [granted, scope] = await remote(ACQUIRE_SCRIPT, keysFor(tenant),
        [clock.now(), clock.now() + SLOT_TTL_MS, slot.member, slot.token, globalCap, tenantCap, force ? 1 : 0, KEY_TTL_MS]);
      if (Number(granted) === 1) return { ok: true, slot };
      if (slots.get(id) === slot) slots.delete(id);
      slot.released = true;
      syncHeartbeat();
      return { ok: false, scope: scope === "tenant" ? "tenant" : "global" };
    } catch (error) {
      // The heartbeat re-registers this slot once Valkey answers again.
      warnOnce(error);
      return { ok: true, slot };
    }
  }

  function release(slot) {
    if (!slot || slot.released) return;
    slot.released = true;
    if (slots.get(slot.attemptId) === slot) slots.delete(slot.attemptId);
    syncHeartbeat();
    if (client) remote(RELEASE_SCRIPT, keysFor(slot.tenantKey), [slot.member, slot.token]).catch(warnOnce);
  }

  return {
    acquire,
    release,
    /** Slots held in this process (all universities, or one). */
    count: (tenantKey) => (tenantKey === undefined ? slots.size : countFor(String(tenantKey))),
    shared: Boolean(client),
  };
}
