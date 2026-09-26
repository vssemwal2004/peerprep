import Assessment from '../models/Assessment.js';
import { getValkeyClient } from '../utils/valkey.js';

const inFlight = new Map();
const MAX_CACHED_BYTES = 2 * 1024 * 1024;

// Authorization, schedule, password and candidate assignments always come from
// MongoDB. Only the large definition payload is cached under an immutable key.
export async function loadAssessmentDefinition(query) {
  for (let retry = 0; retry < 3; retry += 1) {
    const metadata = await Assessment.findOne(query).select('-sections -questionSets').lean();
    if (!metadata) return null;
    const version = new Date(metadata.updatedAt || 0).getTime();
    const key = `assessment:definition:v2:${metadata._id}:${metadata.version || 1}:${metadata.__v ?? 'legacy'}:${version}`;
    let content;
    const client = getValkeyClient();
    if (client) {
      try {
        const cached = await client.sendCommand(['GET', key]);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed?.sections) && Array.isArray(parsed?.questionSets)) content = parsed;
        }
      } catch { /* bounded cache outage: authoritative fallback */ }
    }
    if (!content) {
      let request = inFlight.get(key);
      if (!request) {
        request = (async () => {
          const sameVersion = { _id: metadata._id };
          sameVersion.version = metadata.version === undefined ? { $exists: false } : metadata.version;
          sameVersion.__v = metadata.__v === undefined ? { $exists: false } : metadata.__v;
          if (metadata.updatedAt) sameVersion.updatedAt = metadata.updatedAt;
          const definition = await Assessment.findOne(sameVersion).select('sections questionSets').lean();
          if (!definition) return null; // Admin edited between the two reads.
          const payload = { sections: definition.sections || [], questionSets: definition.questionSets || [] };
          const encoded = JSON.stringify(payload);
          if (client && Buffer.byteLength(encoded) <= MAX_CACHED_BYTES) {
            try { await client.sendCommand(['SET', key, encoded, 'EX', '3600']); } catch { /* cache optional */ }
          }
          return payload;
        })();
        // Coalesce misses per API process, but never keep an unbounded cache.
        if (inFlight.size < 256) inFlight.set(key, request);
        request.finally(() => { if (inFlight.get(key) === request) inFlight.delete(key); }).catch(() => {});
      }
      content = await request;
    }
    if (content) return Assessment.hydrate({ ...metadata, ...content }).toObject();
  }
  // A rapidly edited definition must not pair old metadata with new questions.
  return Assessment.findOne(query).lean();
}
