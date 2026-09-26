import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAssessmentAdmission } from '../src/middleware/assessmentAdmission.js';

function response() {
  const res = new EventEmitter();
  res.headers = {};
  res.set = (key, value) => { res.headers[key] = value; return res; };
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const next = (error) => { if (error) throw error; };

test('disconnect and early HTTP finish do not release permits until the controller settles', async () => {
  const gate = createAssessmentAdmission({ workLimit: 1, finalLimit: 1 });
  const work = deferred();
  const finalWork = deferred();
  let admitted = 0;
  const handler = gate(async () => { admitted += 1; await work.promise; });
  const finalHandler = gate(async () => { admitted += 1; await finalWork.promise; }, { group: 'final' });
  const first = response();
  const pending = handler({}, first, next);
  first.emit('finish');
  first.emit('close');
  first.destroyed = true;
  const rejected = response();
  await handler({}, rejected, next);
  assert.equal(rejected.statusCode, 503);
  assert.equal(rejected.headers['Retry-After'], '2');
  const pendingFinal = finalHandler({}, response(), next);
  assert.equal(admitted, 2);
  work.resolve();
  await pending;
  await handler({}, response(), next);
  assert.equal(admitted, 3);
  finalWork.resolve();
  await pendingFinal;
});

test('asynchronous auth and downstream controller both hold the same permit', async () => {
  const gate = createAssessmentAdmission({ workLimit: 1 });
  const auth = deferred(), work = deferred();
  let starts = 0;
  const handler = gate([
    async (_req, _res, nextHandler) => { await auth.promise; nextHandler(); },
    (_req, _res, nextHandler) => nextHandler(),
    async () => { starts += 1; await work.promise; },
  ]);
  const pending = handler({}, response(), next);
  const rejectedDuringAuth = response();
  await handler({}, rejectedDuringAuth, next);
  assert.equal(rejectedDuringAuth.statusCode, 503);
  assert.equal(starts, 0);
  auth.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(starts, 1);
  const rejectedDuringWrite = response();
  await handler({}, rejectedDuringWrite, next);
  assert.equal(rejectedDuringWrite.statusCode, 503);
  work.resolve();
  await pending;
  await handler({}, response(), next);
  assert.equal(starts, 2);
});

test('errors are forwarded and release only after any started continuation finishes', async () => {
  const gate = createAssessmentAdmission({ workLimit: 1 });
  const work = deferred();
  const expected = new Error('auth middleware failed after next');
  const errors = [];
  const handler = gate([
    (_req, _res, nextHandler) => { nextHandler(); throw expected; },
    () => work.promise,
  ]);
  const pending = handler({}, response(), (error) => errors.push(error));
  const rejected = response();
  await handler({}, rejected, next);
  assert.equal(rejected.statusCode, 503);
  assert.equal(errors.length, 0);
  work.resolve();
  await pending;
  assert.deepEqual(errors, [expected]);
  await gate(() => {} )({}, response(), next);
});

test('already-aborted requests do not start authentication or controller work', async () => {
  const gate = createAssessmentAdmission({ workLimit: 1 });
  let called = 0;
  const handler = gate(() => { called += 1; });
  await handler({ aborted: true }, response(), next);
  assert.equal(called, 0);
  await handler({}, response(), next);
  assert.equal(called, 1);
});
