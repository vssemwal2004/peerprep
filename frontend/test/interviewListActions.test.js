import assert from 'node:assert/strict';
import test from 'node:test';
import { interviewActionIds } from '../src/components/interviews/interviewListActions.js';

const event = { status: 'published', coordinatorId: 'C01', startDate: '2035-01-01', endDate: '2035-01-02' };
test('view-only coordinators see no mutation commands', () => {
  assert.deepEqual(interviewActionIds(event, { role: 'coordinator', coordinatorId: 'C01' }, () => false), ['open', 'export', 'copy']);
});
test('coordinators with global viewing scope cannot manage another coordinator’s interview', () => {
  assert.deepEqual(interviewActionIds(event, { role: 'coordinator', coordinatorId: 'C02' }, () => true), ['open', 'export', 'copy']);
});
test('owned interviews expose only granted actions', () => {
  const ids = interviewActionIds(event, { role: 'coordinator', coordinatorId: 'C01' }, (_, permission) => permission.endsWith('.edit'));
  assert.ok(ids.includes('edit'));
  for (const id of ['delete', 'completed', 'cancelled', 'invitations']) assert.ok(!ids.includes(id));
});
test('admin lifecycle commands reflect draft and terminal states', () => {
  const admin = { role: 'admin' };
  const allowed = () => true;
  const draft = interviewActionIds({ ...event, status: 'draft' }, admin, allowed);
  assert.ok(draft.includes('published'));
  assert.ok(!draft.includes('invitations'));
  for (const status of ['completed', 'cancelled', 'archived']) {
    const ids = interviewActionIds({ ...event, status }, admin, allowed);
    assert.ok(ids.includes('delete'));
    for (const id of ['invitations', 'completed', 'cancelled', 'published']) assert.ok(!ids.includes(id));
  }
  assert.ok(!interviewActionIds(event, admin, allowed).includes('archive'), 'Archive must never call the destructive delete endpoint');
});
