import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import { PrepMockCompany, PrepMockRole } from '../src/models/PrepMockCatalog.js';
import {
  COMMON_ROLES, addMockRole, builtInLogo, companyLogoSnapshot, isPrivateAddress, logosForCompanies, mockRolesFor, normalizeWebsite, setBuiltInLogos,
} from '../src/services/prepMockCatalog.js';
import { OPT_IN_STUDENT_FEATURES, STANDARD_STUDENT_FEATURES, studentHasFeature } from '../src/services/studentFeatureAccess.js';

let mongo;
const adminId = new mongoose.Types.ObjectId();

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_mock_catalog_test' });
  await Promise.all([PrepMockCompany.init(), PrepMockRole.init()]);
  setBuiltInLogos({ google: { name: 'Google', domain: 'google.com', url: 'https://img.example/google.png', width: 144, height: 144 } });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('a company website is reduced to its public host name; IPs and junk are refused', () => {
  assert.equal(normalizeWebsite('https://www.Google.com/careers?x=1'), 'google.com');
  assert.equal(normalizeWebsite('tcs.com'), 'tcs.com');
  assert.equal(normalizeWebsite('http://careers.infosys.com:443/'), 'careers.infosys.com');
  for (const bad of ['', 'localhost', '127.0.0.1', 'http://10.0.0.5', 'not a site', 'a.b', '[::1]']) assert.throws(() => normalizeWebsite(bad), /website|IP/, bad);
});

test('private, loopback and link-local addresses are never fetched', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '142.250.190.14', '2606:4700::6810:85e5']) assert.equal(isPrivateAddress(address), false, address);
});

test('logos: a logo set here wins, a removed one stays hidden, otherwise the built-in one', async () => {
  assert.equal(builtInLogo('GOOGLE ').url, 'https://img.example/google.png');
  assert.deepEqual(await companyLogoSnapshot('Google'), { url: 'https://img.example/google.png', width: 144, height: 144 });
  await PrepMockCompany.create({ key: 'acme', name: 'Acme', logo: { url: 'https://img.example/acme.png', width: 200, height: 200, source: 'upload' } });
  await PrepMockCompany.create({ key: 'google', name: 'Google', hideBuiltInLogo: true });
  const logoFor = await logosForCompanies(['Acme', 'Google', 'Nobody']);
  assert.equal(logoFor('acme').url, 'https://img.example/acme.png');
  assert.equal(logoFor('Google'), null, 'the admin removed it');
  assert.equal(logoFor('Nobody'), null);
  assert.deepEqual(logoFor('Nobody', { url: 'https://img.example/saved.png' }), { url: 'https://img.example/saved.png', width: null, height: null }, 'the copy saved on a shared mock is the last resort');
});

test('roles: the company\'s own roles first (its mocks, then added), then every other role A–Z', async () => {
  await Assessment.create([
    { kind: 'mock', company: 'Acme', role: 'SDE 2', title: 'A', createdBy: adminId, lifecycleStatus: 'draft' },
    { kind: 'mock', company: 'Acme', role: 'SDE 2', title: 'B', createdBy: adminId, lifecycleStatus: 'draft' },
    { kind: 'mock', company: 'Other', role: 'Ops Lead', title: 'C', createdBy: adminId, lifecycleStatus: 'draft' },
  ]);
  await addMockRole({ name: '  Cloud   Support  Associate ', company: 'acme', userId: adminId });
  await addMockRole({ name: 'cloud support associate', company: 'Beta', userId: adminId });
  assert.equal(await PrepMockRole.countDocuments({ key: 'cloud support associate' }), 1, 'one role, case-insensitive');
  const roles = await mockRolesFor('Acme');
  assert.deepEqual(roles.company.map((role) => role.name), ['SDE 2', 'Cloud Support Associate']);
  assert.equal(roles.company[0].mocks, 2);
  assert.equal(roles.company[1].added, true);
  const shared = roles.shared.map((role) => role.name);
  assert.ok(shared.includes('Ops Lead'), 'roles of other companies are still offered');
  assert.ok(COMMON_ROLES.every((role) => shared.includes(role) || roles.company.some((own) => own.name === role)));
  assert.deepEqual(shared, [...shared].sort((a, b) => a.localeCompare(b)));
  assert.ok((await mockRolesFor('Beta')).company.some((role) => role.name === 'Cloud Support Associate'), 'added for Beta too');
  await assert.rejects(() => addMockRole({ name: 'x' }), /at least 2/);
  await assert.rejects(() => addMockRole({ name: 'SDE <script>' }), /letters, numbers/);
});

test('Prep Mock is opt-in: "All access" students do not get it until an admin turns it on', () => {
  assert.ok(OPT_IN_STUDENT_FEATURES.includes('prep_mock'));
  assert.ok(!STANDARD_STUDENT_FEATURES.includes('prep_mock'));
  assert.equal(studentHasFeature({ role: 'student' }, 'prep_mock'), false);
  assert.equal(studentHasFeature({ role: 'student', featureAccess: { mode: 'custom', features: ['assessments', 'prep_mock'] } }, 'prep_mock'), true);
  assert.equal(studentHasFeature({ role: 'admin' }, 'prep_mock'), true);
});
