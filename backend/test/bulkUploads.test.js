import test from 'node:test';
import assert from 'node:assert/strict';
import StudentUploadBatch from '../src/models/StudentUploadBatch.js';
import { buildBulkUploadCsv, buildDeletePreview } from '../src/controllers/bulkUploadController.js';

test('bulk upload model tracks generalized entity provenance and lifecycle', () => {
  const batch = new StudentUploadBatch({
    name: 'September MCQ import',
    originalFileName: 'mcq.csv',
    uploadedBy: '507f1f77bcf86cd799439011',
    entityType: 'question_mcq',
    sourceType: 'question_upload',
    recordIds: ['507f1f77bcf86cd799439012'],
    createdRecordIds: ['507f1f77bcf86cd799439012'],
  });
  assert.equal(batch.entityType, 'question_mcq');
  assert.equal(batch.status, 'active');
  assert.equal(batch.createdRecordIds.length, 1);
});

test('legacy uploads without created-record provenance are blocked from cascade deletion', async () => {
  const preview = await buildDeletePreview({
    _id: '507f1f77bcf86cd799439011',
    name: 'Legacy student list',
    entityType: 'student',
  });
  assert.equal(preview.deletableRecords, 0);
  assert.equal(preview.blockers[0].code, 'missing_provenance');
});

test('bulk upload CSV export preserves commas and neutralizes spreadsheet formulas', () => {
  const csv = buildBulkUploadCsv([{ name: 'Doe, Jane', note: '=HYPERLINK("bad")' }]);
  assert.match(csv, /"Doe, Jane"/);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
});
