import assert from 'node:assert/strict';
import test from 'node:test';
import { interviewStatus, mergeInterviewStudents, parseStudentCsv, serializeStudents, studentCsvFile, studentCsvRow, validateInterviewSetup } from '../src/components/interviews/interviewSetup.js';

const now = Date.parse('2030-01-01T00:00:00Z');
const setup = { title: 'Technical round', description: 'Prepare your projects.', startDate: '2030-01-02T10:00:00Z', endDate: '2030-01-02T12:00:00Z' };

test('setup requires a name, instructions and a valid future window', () => {
  assert.equal(validateInterviewSetup(setup, now), '');
  for (const field of ['title', 'description', 'startDate', 'endDate']) assert.ok(validateInterviewSetup({ ...setup, [field]: '' }, now));
  assert.match(validateInterviewSetup({ ...setup, startDate: 'not-a-date' }, now), /Choose/);
  assert.match(validateInterviewSetup({ ...setup, startDate: '2029-01-01' }, now), /future/);
  assert.match(validateInterviewSetup({ ...setup, endDate: setup.startDate }, now), /after/);
  assert.match(validateInterviewSetup({ ...setup, endDate: '2030-01-02T09:00:00Z' }, now), /after/);
  assert.match(validateInterviewSetup(setup, Date.parse(setup.startDate)), /future/);
});

test('template size is checked at the limit', () => {
  assert.equal(validateInterviewSetup({ ...setup, template: { size: 10 * 1024 * 1024 } }, now), '');
  assert.match(validateInterviewSetup({ ...setup, template: { size: 10 * 1024 * 1024 + 1 } }, now), /10 MB/);
});

test('CSV accepts spreadsheet aliases, BOM, CRLF and leading-zero IDs', () => {
  assert.deepEqual(parseStudentCsv('\uFEFFStudent Name,Email ID,Student ID,Coordinator Code\r\nAda,ada@example.com,0012,C01'), [{ name: 'Ada', email: 'ada@example.com', studentid: '0012', teacherid: 'C01' }]);
});

test('special roster round trips commas, quotes, newlines and coordinator assignments', () => {
  const student = { _id: '1', name: 'Ada, "A"\nLovelace', email: 'ada@example.com', studentId: '0012', branch: 'CSE', semester: 0, teacherIds: ['C01', 'C02'] };
  const rows = parseStudentCsv(serializeStudents([student]));
  assert.equal(rows[0].name, student.name);
  assert.equal(rows[0].studentid, '0012');
  assert.equal(rows[0].teacherid, 'C01');
  assert.equal(rows[0].semester, '0');
  assert.equal(studentCsvRow({ ...student, teacherid: 'C02' }).teacherid, 'C02');
  assert.equal(studentCsvRow({ teacherId: 'C03, C04' }).teacherid, 'C03');
});

test('CSV rejects malformed, empty and ambiguous imports', () => {
  for (const text of ['name\nAda', 'email\n', 'email\n"unclosed', 'email,Email ID\na,b', 'email,studentid\na,b,c']) assert.throws(() => parseStudentCsv(text));
  assert.throws(() => parseStudentCsv('email\n' + Array.from({ length: 1001 }, (_, i) => i + '@example.com').join('\n')), /1,000/);
  assert.equal(parseStudentCsv('email\n' + Array.from({ length: 1000 }, (_, i) => i + '@example.com').join('\n')).length, 1000);
});

test('student lookup works with either identifier and CSV files use the existing multipart contract', async () => {
  const file = studentCsvFile([{ email: 'ada@example.com' }]);
  assert.equal(file.type, 'text/csv');
  assert.equal(file.name, 'interview-students.csv');
  assert.equal(parseStudentCsv(await file.text())[0].email, 'ada@example.com');
  assert.deepEqual(parseStudentCsv('Student ID\n0012'), [{ studentid: '0012' }]);
});

test('merging individual, CSV and existing selections keeps stable registered IDs only', () => {
  const first = { _id: '1', name: 'Ada' };
  const second = { _id: '2', name: 'Grace' };
  const selected = [first];
  assert.deepEqual(mergeInterviewStudents(selected, [first, second, second, { name: 'Unregistered' }]), [first, second]);
  assert.deepEqual(selected, [first]);
});

test('terminal states take precedence over dates, and scheduled/live/completed are derived consistently', () => {
  const event = { startDate: '2029-12-31', endDate: '2030-01-02', status: 'published' };
  for (const status of ['cancelled', 'archived', 'draft', 'completed']) assert.equal(interviewStatus({ ...event, status }, now), status);
  assert.equal(interviewStatus(event, now), 'live');
  assert.equal(interviewStatus({ ...event, startDate: '2030-01-02' }, now), 'scheduled');
  assert.equal(interviewStatus({ ...event, endDate: '2029-12-31' }, now), 'completed');
  assert.equal(interviewStatus({ status: 'published' }, now), 'published');
});
