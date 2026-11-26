import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UPLOAD_TEMPLATE_CSV, audienceLabel, csvCell, filterUploadRows, mergeStudents, problemRowsCsv, removeStudents, rowValue, searchStudents, uploadFilterOptions,
} from '../src/admin/announcements/audienceModel.js';

const rows = [
  { row: 2, name: 'Asha', email: 'asha@u.test', semester: '5', branch: '', college: '', status: 'matched', student: { _id: 'a', name: 'Asha Rao', branch: 'CSE', college: 'Main', studentId: 'S1' } },
  { row: 3, name: 'Bilal', email: 'bilal@u.test', semester: '', branch: 'ECE', college: '', status: 'matched', student: { _id: 'b', name: 'Bilal', semester: 3, branch: 'ECE', college: 'North' } },
  { row: 4, name: 'New', email: 'new@u.test', semester: '5', branch: '', college: '', status: 'not_found', reason: 'No registered student with this email' },
  { row: 5, name: '=HYPERLINK("x")', email: 'bad', semester: '', branch: '', college: '', status: 'invalid', reason: 'Email is not valid' },
];

test('template: name and email first, optional columns after', () => {
  assert.equal(UPLOAD_TEMPLATE_CSV.split('\r\n')[0], 'name,email,semester,college,branch');
});

test('uploaded rows: file values win, registered values fill gaps; filters, status tabs and search', () => {
  assert.equal(rowValue(rows[0], 'branch'), 'CSE', 'empty in file → registered branch');
  assert.equal(rowValue(rows[1], 'semester'), '3');
  assert.deepEqual(uploadFilterOptions(rows), { semester: ['3', '5'], branch: ['CSE', 'ECE'], college: ['Main', 'North'] });
  assert.deepEqual(filterUploadRows(rows, { status: 'matched' }).map((r) => r.row), [2, 3]);
  assert.deepEqual(filterUploadRows(rows, { semester: '5' }).map((r) => r.row), [2, 4]);
  assert.deepEqual(filterUploadRows(rows, { branch: 'cse' }).map((r) => r.row), [2]);
  assert.deepEqual(filterUploadRows(rows, { query: 's1' }).map((r) => r.row), [2], 'search covers the student ID');
});

test('selection merges without duplicates and removes by id', () => {
  const first = [{ _id: 'a' }];
  assert.deepEqual(mergeStudents(first, [{ _id: 'a' }, { _id: 'b' }]).map((s) => s._id), ['a', 'b']);
  assert.equal(mergeStudents(first, [{ _id: 'a' }]), first, 'nothing new keeps the same array');
  assert.deepEqual(removeStudents([{ _id: 'a' }, { _id: 'b' }], ['a']).map((s) => s._id), ['b']);
  assert.deepEqual(searchStudents([{ name: 'Asha', email: 'x' }, { name: 'Bo', email: 'asha@u' }], 'ASHA').length, 2);
});

test('rows to fix: only unusable rows, safe for Excel', () => {
  const csv = problemRowsCsv(rows);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3, 'header + 2 problem rows');
  assert.ok(lines[2].startsWith(`5,"'=HYPERLINK(""x"")"`), 'formula is neutralised and quoted');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('-1'), "'-1");
});

test('audience labels', () => {
  assert.equal(audienceLabel('all', 5), 'All students');
  assert.equal(audienceLabel('selected', 1), '1 selected student');
  assert.equal(audienceLabel('selected', 1200), '1,200 selected students');
});
