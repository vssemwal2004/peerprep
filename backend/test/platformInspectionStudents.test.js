import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectionStudentPath, inspectionStudentQuery } from '../src/platform/inspectionStudents.js';

test('inspection student list defaults to 25 newest-first, as before', () => {
  const query = inspectionStudentQuery({});
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 25);
  assert.deepEqual(query.sort, { _id: -1 });
  assert.deepEqual(query.filter, { role: 'student' });
  assert.equal(inspectionStudentPath(query), '/students?page=1&search=');
});

test('inspection student list whitelists page size and sort columns', () => {
  const sorted = inspectionStudentQuery({ page: '3', pageSize: '50', sortBy: 'name', sortOrder: 'desc', search: ' ann ' });
  assert.equal(sorted.page, 3);
  assert.equal(sorted.pageSize, 50);
  assert.equal(sorted.search, 'ann');
  assert.deepEqual(sorted.sort, { name: -1, _id: -1 });
  // Active first when ascending: isActive true sorts after false, so the direction is flipped.
  assert.deepEqual(inspectionStudentQuery({ sortBy: 'status', sortOrder: 'asc' }).sort, { isActive: -1, _id: -1 });
  for (const sortBy of ['email', 'constructor', '__proto__', 'password', '']) {
    const query = inspectionStudentQuery({ sortBy, sortOrder: 'desc', pageSize: '7' });
    assert.deepEqual(query.sort, { _id: -1 }, sortBy);
    assert.equal(query.sortBy, null);
    assert.equal(query.pageSize, 25);
  }
  assert.equal(inspectionStudentQuery({ pageSize: '1000' }).pageSize, 25);
});

test('the signed inspection path survives the trip to the university server unchanged', () => {
  const query = inspectionStudentQuery({ page: '2', pageSize: '100', sortBy: 'course', sortOrder: 'asc', search: "o'neil (2024) a+b" });
  const path = inspectionStudentPath(query);
  // The university verifies the signature against req.originalUrl, i.e. what fetch actually sends.
  const sent = new URL(`https://university.example/api/platform/inspection${path}`);
  assert.equal(`${sent.pathname}${sent.search}`.replace(/^\/api\/platform\/inspection/, ''), path);
  const parsed = inspectionStudentQuery(sent.searchParams);
  assert.deepEqual(
    { page: parsed.page, pageSize: parsed.pageSize, search: parsed.search, sort: parsed.sort },
    { page: 2, pageSize: 100, search: "o'neil (2024) a+b", sort: { course: 1, _id: -1 } },
  );
});
