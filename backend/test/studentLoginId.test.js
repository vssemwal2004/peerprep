import test from 'node:test';
import assert from 'node:assert/strict';
import { universityStudentCode, universityStudentLoginId, studentIdFromUniversityLogin } from '../src/platform/studentLoginId.js';

test('university student login IDs add the code without changing academic IDs', () => {
  assert.equal(universityStudentCode('geu-121'), 'GEU121');
  assert.equal(universityStudentLoginId('geu-121', '12345'), 'GEU12112345');
  assert.equal(studentIdFromUniversityLogin('GEU12112345', 'geu-121'), '12345');
  assert.equal(studentIdFromUniversityLogin('geu12112345', 'geu-121'), '12345');
  assert.equal(studentIdFromUniversityLogin('GEU121-12345', 'geu-121'), '');
  assert.equal(studentIdFromUniversityLogin('GEU12112345', 'other-uni'), '');
  assert.equal(studentIdFromUniversityLogin('GEU121', 'geu-121'), '');
});
