// The practice catalogue a student can solve, in the evidence entry shape (evidence.js):
// local published public problems (not mock-library or assessment copies) plus the shared coding
// catalogue, one entry per canonical problem (a local copy wins over its shared twin).
import Problem from '../../models/Problem.js';
import { currentTenant } from '../../platform/tenantContext.js';
import { getSharedCodingCatalog } from '../studentDashboardService.js';
import { localEntry, sharedEntry } from './evidence.js';

const CACHE_MS = 60_000;
const cache = new Map();
const LOCAL_FIELDS = 'title difficulty tags scoreTopic sourceNumber displayOrder status visibility libraryScope assessmentSourceProblemId';
export const practiceProblemFilter = {
  status: { $in: ['published', 'Active', 'active'] },
  $or: [{ visibility: 'public' }, { visibility: { $exists: false } }],
  libraryScope: { $ne: 'mock' },
  assessmentSourceProblemId: { $in: [null] },
};

/** One problem as a catalogue entry, or null (unknown / not practice-visible). */
export async function catalogueEntry(source, id) {
  if (source === 'shared') {
    const question = (await getSharedCodingCatalog().catch(() => [])).find((row) => String(row._id) === String(id));
    return question ? sharedEntry(question) : null;
  }
  const problem = await Problem.findById(id).select(LOCAL_FIELDS).lean().catch(() => null);
  return problem ? localEntry(problem) : null;
}

/** Every practice problem: [entry], de-duplicated by canonical key. Cached per university for a minute. */
export async function practiceCatalogue({ shared = true } = {}) {
  const key = `${currentTenant()?.universityId || 'platform'}:${shared ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [local, sharedRows] = await Promise.all([
    Problem.find(practiceProblemFilter).select(LOCAL_FIELDS).lean().maxTimeMS(8000),
    shared ? getSharedCodingCatalog().catch(() => []) : [],
  ]);
  const byKey = new Map();
  for (const problem of local) {
    const entry = localEntry(problem);
    if (entry.difficulty && !byKey.has(entry.problemKey)) byKey.set(entry.problemKey, entry);
  }
  for (const question of sharedRows) {
    const entry = sharedEntry(question);
    if (entry.difficulty && !byKey.has(entry.problemKey)) byKey.set(entry.problemKey, entry);
  }
  const value = [...byKey.values()];
  cache.set(key, { at: Date.now(), value });
  return value;
}

export const problemUrl = (entry) => (entry.source === 'shared' ? `/problems/shared/${entry.id}` : `/problems/${entry.id}`);
