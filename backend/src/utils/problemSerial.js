// PeerPrep problem serials.
//
// Every coding problem keeps two numbers:
//   displayOrder  - the PeerPrep serial students see (#1, #2, ...).
//   sourceNumber  - the LeetCode catalogue number, when the problem came from it.
//
// Serials for catalogue problems are a keyed pseudo-random shuffle of their
// catalogue order, so PeerPrep's sequence does not mirror LeetCode's:
//
//   rank(p)   = position of p when catalogue problems are sorted by sourceNumber (0-based)
//   serial(p) = shuffle(rank(p), N) + 1,  N = number of catalogue problems
//
// shuffle() is a 4-round Feistel network over the smallest 2^(2h) >= N with
// cycle-walking (re-apply until the value is < N). A Feistel network is a
// bijection for any round function, and cycle-walking keeps it a bijection on
// [0, N), so every serial in 1..N is used exactly once. PeerPrep-original
// problems follow at N+1, N+2, ... by creation date.
//
// Both numbers are stored and indexed. A search for "56" is an indexed equality
// lookup on either field (O(log n)), so it never recomputes the shuffle.

export const PEERPREP_SERIAL_KEY = 'peerprep-serial-v1';
const FEISTEL_ROUNDS = 4;

// 32-bit FNV-1a, used to turn the key text into round keys.
function hashText(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Integer mixer (murmur3 finaliser); any deterministic function works here.
function mix(value, roundKey) {
  let hash = (value ^ roundKey) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function feistel(value, halfBits, roundKeys) {
  const mask = (1 << halfBits) - 1;
  let left = value >>> halfBits;
  let right = value & mask;
  for (const roundKey of roundKeys) {
    const next = (left ^ mix(right, roundKey)) & mask;
    left = right;
    right = next;
  }
  return ((left << halfBits) | right) >>> 0;
}

/** Maps index (0..count-1) to a unique shuffled index in 0..count-1. */
export function shuffleIndex(index, count, key = PEERPREP_SERIAL_KEY) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new RangeError('index out of range');
  if (count === 1) return 0;
  let halfBits = 1;
  while (2 ** (2 * halfBits) < count) halfBits += 1;
  if (halfBits > 15) throw new RangeError('count is too large for the serial shuffle');
  const roundKeys = Array.from({ length: FEISTEL_ROUNDS }, (_, round) => hashText(`${key}:${round}`));
  let value = index;
  do {
    value = feistel(value, halfBits, roundKeys);
  } while (value >= count);
  return value;
}

const createdTime = (problem) => new Date(problem.createdAt || 0).getTime() || 0;

/**
 * Computes PeerPrep serials for a whole problem set.
 * problems: [{ _id, sourceNumber?, createdAt?, title? }]
 * Returns Map(String(_id) -> serial). Catalogue problems get 1..N (shuffled),
 * the rest N+1.. in creation order.
 */
export function assignPeerPrepSerials(problems, key = PEERPREP_SERIAL_KEY) {
  const catalogue = problems
    .filter((problem) => Number.isInteger(problem.sourceNumber) && problem.sourceNumber > 0)
    .sort((left, right) => left.sourceNumber - right.sourceNumber || String(left._id).localeCompare(String(right._id)));
  const originals = problems
    .filter((problem) => !(Number.isInteger(problem.sourceNumber) && problem.sourceNumber > 0))
    .sort((left, right) => createdTime(left) - createdTime(right)
      || String(left.title || '').localeCompare(String(right.title || ''))
      || String(left._id).localeCompare(String(right._id)));

  const serials = new Map();
  catalogue.forEach((problem, rank) => {
    serials.set(String(problem._id), shuffleIndex(rank, catalogue.length, key) + 1);
  });
  originals.forEach((problem, index) => {
    serials.set(String(problem._id), catalogue.length + index + 1);
  });
  return serials;
}

/** '56' or '#56' -> 56; anything else -> null. */
export function parseSerialSearch(value) {
  const match = String(value || '').trim().match(/^#?(\d{1,9})$/);
  return match ? Number(match[1]) : null;
}

/** Mongo clause matching a PeerPrep serial or a LeetCode number. Both fields are indexed. */
export function serialSearchClause(serial) {
  return { $or: [{ displayOrder: serial }, { sourceNumber: serial }] };
}
