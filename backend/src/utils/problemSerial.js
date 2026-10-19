// PeerPrep problem serials.
//
// Every imported coding problem keeps two identifiers:
//   sourceNumber - the original LeetCode catalogue number.
//   displayOrder - the PeerPrep number shown to students and administrators.
//
// The visible number is an affine permutation of the problem's one-based
// position after catalogue problems are sorted by sourceNumber:
//
//   displayOrder = ((position - 1) * 1007 + 721) mod 4012 + 1
//
// Its inverse uses 251 because (1007 * 251) mod 4012 = 1. This gives a
// deterministic one-to-one mapping in both directions over 1..4012, without
// the former bit/Feistel implementation. PeerPrep-original problems use IDs
// after the reserved catalogue range, beginning at 4013.

export const PEERPREP_SERIAL_MOD = 4012;
export const PEERPREP_SERIAL_MULTIPLIER = 1007;
export const PEERPREP_SERIAL_OFFSET = 721;
export const PEERPREP_SERIAL_INVERSE = 251;

if ((PEERPREP_SERIAL_MULTIPLIER * PEERPREP_SERIAL_INVERSE) % PEERPREP_SERIAL_MOD !== 1) {
  throw new Error('Invalid PeerPrep serial configuration: multiplier has no configured modular inverse');
}

function validateCatalogueValue(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > PEERPREP_SERIAL_MOD) {
    throw new RangeError(`${name} must be an integer from 1 to ${PEERPREP_SERIAL_MOD}`);
  }
}

/** Map a one-based catalogue position to its unique PeerPrep serial. */
export function encodeProblemSerial(position) {
  validateCatalogueValue(position, 'position');
  return (((position - 1) * PEERPREP_SERIAL_MULTIPLIER + PEERPREP_SERIAL_OFFSET)
    % PEERPREP_SERIAL_MOD) + 1;
}

/** Recover the one-based catalogue position from a PeerPrep serial. */
export function decodeProblemSerial(serial) {
  validateCatalogueValue(serial, 'serial');
  const zeroBased = ((serial - 1 - PEERPREP_SERIAL_OFFSET) * PEERPREP_SERIAL_INVERSE)
    % PEERPREP_SERIAL_MOD;
  return ((zeroBased + PEERPREP_SERIAL_MOD) % PEERPREP_SERIAL_MOD) + 1;
}

const validSourceNumber = (value) => Number.isInteger(value) && value > 0;
const createdTime = (problem) => new Date(problem.createdAt || 0).getTime() || 0;

/**
 * Compute PeerPrep serials for a complete problem set.
 *
 * Catalogue problems are sorted by sourceNumber and their one-based positions
 * are encoded into the reserved 1..4012 range. Original problems are assigned
 * 4013, 4014, ... in stable creation order.
 */
export function assignPeerPrepSerials(problems) {
  const catalogue = problems
    .filter((problem) => validSourceNumber(problem.sourceNumber))
    .sort((left, right) => left.sourceNumber - right.sourceNumber
      || String(left._id).localeCompare(String(right._id)));
  const originals = problems
    .filter((problem) => !validSourceNumber(problem.sourceNumber))
    .sort((left, right) => createdTime(left) - createdTime(right)
      || String(left.title || '').localeCompare(String(right.title || ''))
      || String(left._id).localeCompare(String(right._id)));

  if (catalogue.length > PEERPREP_SERIAL_MOD) {
    throw new RangeError(`The catalogue has ${catalogue.length} problems but the affine mapping supports ${PEERPREP_SERIAL_MOD}`);
  }

  const serials = new Map();
  catalogue.forEach((problem, index) => {
    serials.set(String(problem._id), encodeProblemSerial(index + 1));
  });
  originals.forEach((problem, index) => {
    serials.set(String(problem._id), PEERPREP_SERIAL_MOD + index + 1);
  });
  return serials;
}

/**
 * Parse an unambiguous question-number search.
 *
 *   56, #56              -> either PeerPrep or source number
 *   pp:56                -> PeerPrep display number only
 *   lc:56, leetcode:#56  -> original source number only
 */
export function parseSerialSearch(value) {
  const text = String(value || '').trim().toLowerCase();
  let match = text.match(/^#?(\d{1,9})$/);
  let kind = 'either';
  if (!match) {
    match = text.match(/^(?:pp|peerprep)\s*(?::\s*)?#?\s*(\d{1,9})$/);
    if (match) kind = 'peerprep';
  }
  if (!match) {
    const sourceMatch = text.match(/^(?:lc|leetcode)\s*(?::\s*)?#?\s*(\d{1,9})$/);
    if (sourceMatch) {
      match = sourceMatch;
      kind = 'leetcode';
    }
  }
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? { kind, number } : null;
}

/** Build the indexed Mongo equality clause for a parsed number search. */
export function serialSearchClause(search) {
  const parsed = typeof search === 'number'
    ? { kind: 'peerprep', number: search }
    : (typeof search === 'string' ? parseSerialSearch(search) : search);
  if (!parsed || !Number.isSafeInteger(parsed.number) || parsed.number < 1) {
    throw new TypeError('A valid question-number search is required');
  }
  if (parsed.kind === 'leetcode') return { sourceNumber: parsed.number };
  if (parsed.kind === 'peerprep') return { displayOrder: parsed.number };
  return { $or: [{ displayOrder: parsed.number }, { sourceNumber: parsed.number }] };
}

/** Apply the same number-search semantics to an in-memory/shared question. */
export function matchesSerialSearch(question, search) {
  if (!search) return true;
  if (search.kind === 'leetcode') return Number(question.sourceNumber) === search.number;
  if (search.kind === 'peerprep') return Number(question.displayOrder) === search.number;
  return Number(question.displayOrder) === search.number
    || Number(question.sourceNumber) === search.number;
}
