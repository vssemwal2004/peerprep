import test from 'node:test';
import assert from 'node:assert/strict';
import { AssessmentSaveProtocol, isDraftForAttempt, mergeLiveCodingDraft } from '../src/student/assessment/assessmentSaveProtocol.js';

const answer = (value, questionIndex = 0) => ({ sectionIndex: 0, questionIndex, answer: value });
const ack = (payload) => ({ acceptedSequence: payload.saveSequence, answerRevision: payload.saveSequence,
  lastAcceptedBatch: { id: payload.mutationId, sequence: payload.saveSequence } });
const receipt = (payload) => ({ ...ack(payload), submissionReceipt: { id: 'receipt-1' } });
const networkError = () => Object.assign(new Error('offline'), { response: { status: 0 } });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const createProtocol = (overrides = {}) => new AssessmentSaveProtocol({
  createId: (() => { let id = 0; return () => `mutation-${++id}`; })(),
  wait: async () => {}, retries: 0, sendSave: async (payload) => ack(payload), sendSubmit: async (payload) => receipt(payload),
  ...overrides,
});

test('network retry retains immutable answers, mutation ID and sequence', async () => {
  const requests = [];
  const protocol = createProtocol({ retries: 1, sendSave: async (payload) => {
    requests.push(payload);
    if (requests.length === 1) throw networkError();
    return ack(payload);
  } });
  await protocol.save({ answers: [answer('A')] });
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(protocol.sequence, 1);
  assert.equal(protocol.pendingBatch, null);
});

test('a lost response retains pending batch; subsequent save does not substitute newer edits', async () => {
  const requests = [];
  const protocol = createProtocol({ sendSave: async (payload) => {
    requests.push(payload);
    if (requests.length === 1) throw networkError();
    return ack(payload);
  } });
  await assert.rejects(protocol.save({ answers: [answer('A')] }));
  await protocol.save({ answers: [answer('B')] });
  assert.deepEqual(requests[0], requests[1]);
  await protocol.save({ answers: [answer('B')] });
  assert.equal(requests[2].saveSequence, 2);
  assert.equal(requests[2].answers[0].answer, 'B');
});

test('concurrent saves share one request; acknowledgements contain only sent answers', async () => {
  const gate = deferred();
  const persisted = [];
  const acknowledged = [];
  const protocol = createProtocol({ persist: async (state) => { persisted.push(state); },
    sendSave: async (payload) => { await gate.promise; return ack(payload); },
    onAcknowledged: (answers) => acknowledged.push(answers),
  });
  const first = protocol.save({ answers: [answer('A')] });
  const second = protocol.save({ answers: [answer('B')] });
  assert.equal(first, second);
  gate.resolve();
  await first;
  assert.deepEqual(acknowledged, [[answer('A')]]);
  assert.equal(persisted[0].pendingBatch.answers[0].answer, 'A');
  assert.equal(persisted.at(-1).pendingBatch, null);
});

test('final snapshot freezes before outstanding save, and new autosave is blocked', async () => {
  const gate = deferred();
  const sent = [];
  const protocol = createProtocol({ sendSave: async (payload) => { await gate.promise; return ack(payload); },
    sendSubmit: async (payload) => { sent.push(payload); return receipt(payload); },
  });
  const save = protocol.save({ answers: [answer('A')] });
  const finalPayload = { answers: [answer('B')], status: 'submitted' };
  const submit = protocol.submit(finalPayload);
  finalPayload.answers[0].answer = 'C';
  assert.equal(await protocol.save({ answers: [answer('D')] }), null);
  gate.resolve();
  await save;
  await submit;
  assert.equal(sent[0].answers[0].answer, 'B');
  assert.equal(sent[0].saveSequence, 2);
  assert.equal(protocol.terminal, true);
});

test('failed final request survives reload with the exact mutation ID and snapshot', async () => {
  const first = createProtocol({ sendSubmit: async () => { throw networkError(); } });
  await assert.rejects(first.submit({ answers: [answer('B')] }));
  const saved = first.snapshot();
  let retried;
  const restored = createProtocol({ recovered: saved, sendSubmit: async (payload) => { retried = payload; return receipt(payload); } });
  await restored.submit({ answers: [answer('C')] });
  assert.deepEqual(retried, saved.pendingFinal);
});

test('reload resumes sequence from server and acknowledges accepted pending batch', async () => {
  const pending = { mutationId: 'lost-response', saveSequence: 8, attemptGeneration: 2, answers: [answer('A')] };
  const acknowledged = [];
  const protocol = createProtocol({ server: { attemptGeneration: 2, lastAcceptedBatch: { id: pending.mutationId, sequence: 8 } },
    recovered: { pendingBatch: pending }, onAcknowledged: (answers) => acknowledged.push(answers),
  });
  assert.equal(protocol.pendingBatch, null);
  assert.deepEqual(acknowledged, [[answer('A')]]);
  await protocol.save({ answers: [answer('B')] });
  assert.equal(protocol.sequence, 9);
});

test('sequence/session conflict never silently advances, retries or discards pending answers', async () => {
  let requests = 0;
  const conflict = Object.assign(new Error('Refresh to synchronize'), { response: { status: 409, data: { code: 'SAVE_SEQUENCE_CONFLICT', acceptedSequence: 8 } } });
  const protocol = createProtocol({ retries: 3, sendSave: async () => { requests += 1; throw conflict; } });
  await assert.rejects(protocol.save({ answers: [answer('A')] }), conflict);
  assert.equal(requests, 1);
  assert.equal(protocol.sequence, 0);
  assert.deepEqual(protocol.pendingBatch.answers, [answer('A')]);
});

test('missing server acknowledgement is not treated as a successful save', async () => {
  const protocol = createProtocol({ sendSave: async () => ({ ok: true }) });
  await assert.rejects(protocol.save({ answers: [answer('A')] }), /did not confirm/);
  assert.notEqual(protocol.pendingBatch, null);
});

test('missing submission receipt keeps final snapshot for confirmation', async () => {
  const protocol = createProtocol({ sendSubmit: async (payload) => ack(payload) });
  await assert.rejects(protocol.submit({ answers: [answer('A')] }), /confirmation/);
  assert.equal(protocol.finalizing, true);
  assert.notEqual(protocol.pendingFinal, null);
});

test('draft recovery is bound to submission, attempt generation, and active browser session', () => {
  const submission = { _id: 'submission', attemptGeneration: 3, status: 'in_progress' };
  const draft = { submissionId: 'submission', attemptGeneration: 3, sessionId: 'browser-1' };
  assert.equal(isDraftForAttempt(draft, submission, 'browser-1'), true);
  assert.equal(isDraftForAttempt(draft, submission, 'browser-2'), false);
  assert.equal(isDraftForAttempt({ ...draft, attemptGeneration: 2 }, submission, 'browser-1'), false);
  assert.equal(isDraftForAttempt(draft, { ...submission, status: 'submitted' }, 'browser-1'), false);
});

test('deadline-finalized receipt completes without falsely acknowledging late answers', async () => {
  let acknowledged = false;
  const protocol = createProtocol({
    server: { lastAcceptedBatch: { sequence: 3 } },
    sendSubmit: async () => ({ submissionReceipt: 'deadline-receipt', acceptedSequence: 3, answersAccepted: false, status: 'submitted' }),
    onAcknowledged: () => { acknowledged = true; },
  });
  const response = await protocol.submit({ answers: [answer('too late')] });
  assert.equal(response.answersAccepted, false);
  assert.equal(acknowledged, false);
  assert.equal(protocol.terminal, true);
});

test('definitive validation rejection unlocks final answers for correction without advancing sequence', async () => {
  let requests = 0;
  const protocol = createProtocol({ sendSubmit: async (payload) => {
    requests += 1;
    if (requests === 1) throw Object.assign(new Error('Answer another question'), { response: { status: 400 } });
    return receipt(payload);
  } });
  await assert.rejects(protocol.submit({ answers: [answer('A')] }), /another question/);
  assert.equal(protocol.finalizing, false);
  assert.equal(protocol.pendingFinal, null);
  assert.equal(protocol.sequence, 0);
  await protocol.submit({ answers: [answer('A'), answer('B', 1)] });
  assert.equal(protocol.sequence, 1);
});

test('successive finalize triggers reuse the confirmed receipt without sending another request', async () => {
  let calls = 0;
  const protocol = createProtocol({ sendSubmit: async (payload) => { calls += 1; return receipt(payload); } });
  const first = await protocol.submit({ answers: [answer('A')] });
  const second = await protocol.submit({ answers: [answer('B')] });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('finalization resolves a previously failed autosave before sending the frozen final snapshot', async () => {
  let attempts = 0;
  const writes = [];
  const protocol = createProtocol({ sendSave: async (payload) => {
    attempts += 1;
    if (attempts === 1) throw networkError();
    writes.push(payload);
    return ack(payload);
  }, sendSubmit: async (payload) => { writes.push(payload); return receipt(payload); } });
  await assert.rejects(protocol.save({ answers: [answer('A')] }));
  const pendingId = protocol.pendingBatch.mutationId;
  await protocol.submit({ answers: [answer('B'), answer('C', 1)] });
  assert.equal(writes[0].mutationId, pendingId);
  assert.equal(writes[0].saveSequence, 1);
  assert.equal(writes[1].saveSequence, 2);
  assert.deepEqual(writes[1].answers, [answer('B'), answer('C', 1)]);
});

test('writes stay bound to the original student submission after ambient login cookies change', async () => {
  const bodies = [];
  const protocol = createProtocol({ server: { _id: 'original-student-submission', attemptGeneration: 4 },
    sendSave: async (payload) => { bodies.push(payload); return ack(payload); },
    sendSubmit: async (payload) => { bodies.push(payload); return receipt(payload); },
  });
  await protocol.save({ submissionId: 'other-student', answers: [answer(1)] });
  await protocol.submit({ submissionId: 'other-student', answers: [answer(null)] });
  assert.ok(bodies.every((payload) => payload.submissionId === 'original-student-submission' && payload.attemptGeneration === 4));
});

test('clearing a selected answer remains explicit in both retried JSON delta and final snapshot', async () => {
  const bodies = [];
  const protocol = createProtocol({ sendSave: async (payload) => { bodies.push(JSON.parse(JSON.stringify(payload))); return ack(payload); },
    sendSubmit: async (payload) => { bodies.push(JSON.parse(JSON.stringify(payload))); return receipt(payload); },
  });
  await protocol.save({ answers: [answer(0)] });
  await protocol.save({ answers: [answer(null)] });
  await protocol.submit({ answers: [answer(null)] });
  assert.equal(bodies[1].answers[0].answer, null);
  assert.equal(bodies[2].answers[0].answer, null);
  assert.ok(Object.hasOwn(bodies[1].answers[0], 'answer'));
});

test('live coding edits survive a render before the debounced editor state catches up', () => {
  const rendered = { '0-0': { language: 'python', code: 'old', codeByLanguage: { python: 'old', java: 'class Main {}' } } };
  const draft = mergeLiveCodingDraft(rendered, { '0-0': 'print("latest keystroke")' }, { '0-0': 'python' });
  assert.equal(draft['0-0'].code, 'print("latest keystroke")');
  assert.equal(draft['0-0'].codeByLanguage.python, draft['0-0'].code);
  assert.equal(draft['0-0'].codeByLanguage.java, 'class Main {}');
  assert.equal(rendered['0-0'].code, 'old');
});

test('acknowledgement for a different later sequence cannot clear the pending answer batch', async () => {
  let acknowledged = false;
  const protocol = createProtocol({ sendSave: async () => ({ acceptedSequence: 8 }), onAcknowledged: () => { acknowledged = true; } });
  await assert.rejects(protocol.save({ answers: [answer(1)] }), /did not confirm/);
  assert.equal(acknowledged, false);
  assert.notEqual(protocol.pendingBatch, null);
});

test('malformed stored protocol metadata cannot prevent recovery of the answer draft', async () => {
  const protocol = createProtocol({ server: { _id: 'submission' }, recovered: { pendingBatch: 4, pendingFinal: 'corrupt' } });
  assert.equal(protocol.finalizing, false);
  await protocol.save({ answers: [answer(1)] });
  assert.equal(protocol.sequence, 1);
});

test('an expiry receipt from pending autosave still allows final confirmation without claiming late edits saved', async () => {
  const terminal = { submissionReceipt: 'expiry', acceptedSequence: 0, answersAccepted: false, status: 'submitted' };
  let acknowledged = false;
  const protocol = createProtocol({ sendSave: async () => terminal, sendSubmit: async () => terminal,
    onAcknowledged: () => { acknowledged = true; },
  });
  await protocol.save({ answers: [answer(1)] });
  assert.equal(protocol.pendingBatch, null);
  const confirmed = await protocol.submit({ answers: [answer(1)] });
  assert.equal(confirmed.submissionReceipt, 'expiry');
  assert.equal(acknowledged, false);
});

test('unavailable local storage does not prevent durable server acknowledgement', async () => {
  const protocol = createProtocol({ persist: async () => false });
  await protocol.save({ answers: [answer(1)] });
  assert.equal(protocol.sequence, 1);
  assert.equal(protocol.pendingBatch, null);
});
