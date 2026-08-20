import assert from 'node:assert/strict';
import test from 'node:test';
import StudentAnalyticsSnapshot from '../src/models/StudentAnalyticsSnapshot.js';
import { getStudentAnalysisHistory } from '../src/controllers/studentAnalysisController.js';

function createResponse() {
  return {
    headers: {},
    payload: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    },
  };
}

test('analytics history is student-scoped, bounded, ordered, and allowlisted', async () => {
  const originalFind = StudentAnalyticsSnapshot.find;
  const captured = {};
  const snapshotDate = new Date('2026-08-20T00:00:00.000Z');
  const generatedAt = new Date('2026-08-20T08:00:00.000Z');

  StudentAnalyticsSnapshot.find = (query) => {
    captured.query = query;
    const chain = {
      sort(value) { captured.sort = value; return chain; },
      limit(value) { captured.limit = value; return chain; },
      select(value) { captured.select = value; return chain; },
      async lean() {
        return [{
          _id: 'internal-id',
          studentId: 'student-a',
          snapshotDate,
          generatedAt,
          contractVersion: 'v2',
          evidenceVersion: 'e1',
          scores: { readiness: null },
          evidence: { hasEvidence: false },
        }];
      },
    };
    return chain;
  };

  try {
    const req = { user: { _id: 'student-a' }, query: { days: '9999' } };
    const res = createResponse();
    await getStudentAnalysisHistory(req, res);

    assert.equal(captured.query.studentId, 'student-a');
    assert.deepEqual(captured.sort, { snapshotDate: 1 });
    assert.equal(captured.limit, 366);
    assert.equal(captured.select.includes('studentId'), false);
    assert.equal(res.payload.meta.days, 365);
    assert.equal(res.payload.meta.count, 1);
    assert.equal(res.payload.history[0].scores.readiness, null);
    assert.equal(res.payload.history[0]._id, undefined);
    assert.equal(res.payload.history[0].studentId, undefined);
    assert.equal(res.headers['Cache-Control'], 'private, max-age=60');
  } finally {
    StudentAnalyticsSnapshot.find = originalFind;
  }
});
