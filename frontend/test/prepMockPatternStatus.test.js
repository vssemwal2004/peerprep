import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMockPatternForIdentity } from '../src/admin/prepMock/patternStatus.js';

const form = {
  company: 'Acme', role: 'Developer', patternId: 'pattern-1',
  mockPattern: { company: 'Acme', role: 'Developer', rows: [{ name: 'Coding' }] },
};

test('pattern badge is green only for a selected pattern of the current company and role', () => {
  assert.equal(hasMockPatternForIdentity(form), true);
  assert.equal(hasMockPatternForIdentity({ ...form, company: 'Other' }), false);
  assert.equal(hasMockPatternForIdentity({ ...form, role: 'Analyst' }), false);
  assert.equal(hasMockPatternForIdentity({ ...form, patternId: null }), false);
  assert.equal(hasMockPatternForIdentity({ ...form, mockPattern: { ...form.mockPattern, rows: [] } }), false);
  assert.equal(hasMockPatternForIdentity({ ...form, company: ' acme ', role: 'DEVELOPER' }), true);
});
