import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PEERPREP_SERIAL_INVERSE,
  PEERPREP_SERIAL_MOD,
  PEERPREP_SERIAL_MULTIPLIER,
  assignPeerPrepSerials,
  decodeProblemSerial,
  encodeProblemSerial,
  matchesSerialSearch,
  parseSerialSearch,
  serialSearchClause,
} from '../src/utils/problemSerial.js';

test('affine encoding is a full-duplex bijection over 1..4012', () => {
  assert.equal((PEERPREP_SERIAL_MULTIPLIER * PEERPREP_SERIAL_INVERSE) % PEERPREP_SERIAL_MOD, 1);
  const encoded = [];
  const decoded = [];
  for (let value = 1; value <= PEERPREP_SERIAL_MOD; value += 1) {
    const serial = encodeProblemSerial(value);
    const position = decodeProblemSerial(value);
    encoded.push(serial);
    decoded.push(position);
    assert.equal(decodeProblemSerial(serial), value, `decode(encode(${value}))`);
    assert.equal(encodeProblemSerial(position), value, `encode(decode(${value}))`);
  }
  assert.equal(new Set(encoded).size, PEERPREP_SERIAL_MOD);
  assert.equal(new Set(decoded).size, PEERPREP_SERIAL_MOD);
  assert.deepEqual([...encoded].sort((a, b) => a - b), Array.from({ length: PEERPREP_SERIAL_MOD }, (_, index) => index + 1));
  assert.throws(() => encodeProblemSerial(0), RangeError);
  assert.throws(() => decodeProblemSerial(PEERPREP_SERIAL_MOD + 1), RangeError);
});

test('known Python mapping values produce the same JavaScript results', () => {
  assert.equal(encodeProblemSerial(1), 722);
  assert.equal(encodeProblemSerial(2), 1729);
  assert.equal(encodeProblemSerial(3), 2736);
  assert.equal(encodeProblemSerial(4), 3743);
  assert.equal(encodeProblemSerial(5), 738);
  for (const position of [1, 2, 3, 4, 5, 1007, 2000, 4012]) {
    assert.equal(decodeProblemSerial(encodeProblemSerial(position)), position);
  }
});

test('catalogue positions use affine serials and originals follow the reserved range', () => {
  const problems = [
    ...Array.from({ length: 300 }, (_, index) => ({ _id: `lc${index + 1}`, sourceNumber: (index + 1) * 2, title: `LC ${index}` })),
    { _id: 'orig-b', title: 'Second original', createdAt: '2026-09-02' },
    { _id: 'orig-a', title: 'First original', createdAt: '2026-09-01' },
  ];
  const serials = assignPeerPrepSerials(problems);
  const catalogueSerials = problems.slice(0, 300).map((problem) => serials.get(problem._id));
  assert.equal(new Set(catalogueSerials).size, 300);
  assert.ok(catalogueSerials.every((serial) => serial >= 1 && serial <= PEERPREP_SERIAL_MOD));
  assert.equal(serials.get('lc1'), encodeProblemSerial(1));
  assert.equal(serials.get('lc300'), encodeProblemSerial(300));
  assert.equal(serials.get('orig-a'), PEERPREP_SERIAL_MOD + 1);
  assert.equal(serials.get('orig-b'), PEERPREP_SERIAL_MOD + 2);
  assert.deepEqual(assignPeerPrepSerials([...problems].reverse()), serials, 'input order does not matter');
  assert.throws(() => assignPeerPrepSerials(Array.from({ length: PEERPREP_SERIAL_MOD + 1 }, (_, index) => ({
    _id: `too-many-${index}`,
    sourceNumber: index + 1,
  }))), RangeError);
});

test('plain number search matches either identifier and prefixes can restrict it', () => {
  assert.deepEqual(parseSerialSearch('56'), { kind: 'either', number: 56 });
  assert.deepEqual(parseSerialSearch(' #56 '), { kind: 'either', number: 56 });
  assert.deepEqual(parseSerialSearch('pp:56'), { kind: 'peerprep', number: 56 });
  assert.deepEqual(parseSerialSearch('LC:56'), { kind: 'leetcode', number: 56 });
  assert.deepEqual(parseSerialSearch('leetcode #56'), { kind: 'leetcode', number: 56 });
  assert.deepEqual(parseSerialSearch('leetcode:#56'), { kind: 'leetcode', number: 56 });
  assert.equal(parseSerialSearch('merge'), null);
  assert.equal(parseSerialSearch('56a'), null);
  assert.deepEqual(serialSearchClause(parseSerialSearch('#56')), { $or: [{ displayOrder: 56 }, { sourceNumber: 56 }] });
  assert.deepEqual(serialSearchClause(parseSerialSearch('pp:56')), { displayOrder: 56 });
  assert.deepEqual(serialSearchClause(parseSerialSearch('lc:56')), { sourceNumber: 56 });
  assert.equal(matchesSerialSearch({ displayOrder: 56, sourceNumber: 99 }, parseSerialSearch('#56')), true);
  assert.equal(matchesSerialSearch({ displayOrder: 99, sourceNumber: 56 }, parseSerialSearch('#56')), true);
  assert.equal(matchesSerialSearch({ displayOrder: 99, sourceNumber: 56 }, parseSerialSearch('lc:56')), true);
});
