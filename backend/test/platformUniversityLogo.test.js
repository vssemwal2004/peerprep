import 'express-async-errors';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { after, before, beforeEach, mock, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Test-owned in-memory database and a mocked logo store only; no .env, Cloudinary or external network.
const ENV_KEYS = ['PEERPREP_DEPLOYMENT_ROLE', 'PEERPREP_UNIVERSITY_ID', 'NODE_ENV', 'FRONTEND_ORIGIN', 'JWT_SECRET'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
let mongo, server, root, skipReason, m, admin, student, uploads, destroyed;

function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** A real, decodable RGB PNG of the given size. */
function png(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

before(async () => {
  // A generous launch timeout: a cold mongod start on Windows can exceed the 10 s default.
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60_000 } }); }
  catch (error) {
    if (error?.code === 'EPERM') { skipReason = 'Local sockets are unavailable in this sandbox'; return; }
    throw error;
  }
  Object.assign(process.env, { PEERPREP_DEPLOYMENT_ROLE: 'control', NODE_ENV: 'test',
    FRONTEND_ORIGIN: 'http://localhost:5173', JWT_SECRET: 'test-secret-abcdefghijklmnopqrstuvwxyz-123456' });
  delete process.env.PEERPREP_UNIVERSITY_ID;
  await mongoose.connect(mongo.getUri(), { dbName: 'platform_university_logo' });
  const { default: app } = await import('../src/setupApp.js');
  m = {
    ...(await import('../src/platform/models.js')),
    ...(await import('../src/platform/universityLogo.js')),
    User: (await import('../src/models/User.js')).default,
    signToken: (await import('../src/utils/jwt.js')).signToken,
  };
  await Promise.all([m.University.init(), m.User.init()]);
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  root = `http://127.0.0.1:${server.address().port}/api/platform`;
  const login = async (role) => {
    const user = await m.User.create({ role, email: `${role}@test.example`, name: role, passwordHash: 'unused' });
    const token = m.signToken({ sub: user._id, role, email: user.email });
    user.activeSessionToken = crypto.createHash('sha256').update(token).digest('hex');
    await user.save();
    return `accessToken=${token}`;
  };
  admin = await login('admin');
  student = await login('student');
});

beforeEach(async () => {
  if (skipReason) return;
  await Promise.all([m.University.deleteMany({}), m.PlatformAudit.deleteMany({})]);
  await m.University.create({ universityId: 'north-campus', name: 'North Campus', apiKeyHash: '0'.repeat(64) });
  uploads = []; destroyed = [];
  mock.restoreAll();
  mock.method(m.logoStorage, 'isConfigured', () => true);
  mock.method(m.logoStorage, 'upload', async (buffer, options) => {
    uploads.push({ bytes: buffer.length, ...options });
    return { url: `https://res.cloudinary.com/demo/image/upload/v1/peerprep/universities/${options.universityId}/${options.publicId}.png`,
      publicId: `peerprep/universities/${options.universityId}/${options.publicId}`, width: 128, height: 96, bytes: buffer.length, format: 'png' };
  });
  mock.method(m.logoStorage, 'destroy', async (publicId) => { destroyed.push(publicId); });
});

after(async () => {
  mock.restoreAll();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongo) {
    const { closeValkeyClient } = await import('../src/utils/valkey.js');
    await closeValkeyClient();
    await mongoose.disconnect();
    await mongo.stop();
  }
  for (const key of ENV_KEYS) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
});

async function sendLogo(bytes, { type = 'image/png', name = 'logo.png', cookie = admin, id = 'north-campus' } = {}) {
  const form = new FormData();
  form.append('logo', new Blob([bytes], { type }), name);
  const response = await fetch(`${root}/admin/universities/${id}/logo`, { method: 'POST', body: form, headers: cookie ? { Cookie: cookie } : {} });
  return { status: response.status, body: await response.json() };
}

test('rejects SVG logos without uploading anything', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><script>alert(1)</script></svg>');
  const result = await sendLogo(svg, { type: 'image/svg+xml', name: 'logo.svg' });
  assert.equal(result.status, 415);
  assert.match(result.body.error, /PNG, JPEG or WebP/);
  assert.equal(uploads.length, 0);
});

test('rejects logos over 2 MB', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const oversize = Buffer.concat([png(128, 128), Buffer.alloc(2 * 1024 * 1024)]);
  const result = await sendLogo(oversize);
  assert.equal(result.status, 413);
  assert.equal(uploads.length, 0);
});

test('rejects a spoofed MIME type whose bytes are not the declared image', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(64)]);
  assert.equal((await sendLogo(gif, { type: 'image/png' })).status, 415, 'GIF bytes labelled as PNG');
  assert.equal((await sendLogo(png(128, 128), { type: 'image/jpeg', name: 'logo.jpg' })).status, 415, 'PNG bytes labelled as JPEG');
  assert.equal((await sendLogo(Buffer.from('not an image at all, just text'), { type: 'image/webp' })).status, 415, 'Text labelled as WebP');
  assert.equal((await sendLogo(png(32, 32))).status, 422, 'Too small to be a usable logo');
  assert.equal(uploads.length, 0);
});

test('accepts a PNG, stores it under the university folder and records the change', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const result = await sendLogo(png(128, 96));
  assert.equal(result.status, 200);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].universityId, 'north-campus');
  assert.match(uploads[0].publicId, /^logo-\d+$/);
  assert.equal(result.body.university.apiKeyHash, undefined);
  assert.match(result.body.university.logo.url, /^https:\/\/res\.cloudinary\.com\//);
  assert.deepEqual([result.body.university.logo.width, result.body.university.logo.height], [128, 96]);
  const overview = await fetch(`${root}/admin/overview`, { headers: { Cookie: admin } }).then((response) => response.json());
  assert.equal(overview.universities[0].logo.publicId, result.body.university.logo.publicId, 'The overview lists the logo');
  assert.ok(await m.PlatformAudit.exists({ action: 'university.logo_updated', universityId: 'north-campus' }));
});

test('replacing or removing a logo deletes the previous Cloudinary image', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const first = (await sendLogo(png(128, 128))).body.university.logo.publicId;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = (await sendLogo(png(256, 256))).body.university.logo.publicId;
  assert.notEqual(first, second);
  assert.deepEqual(destroyed, [first]);

  // A failing delete never blocks the database update.
  m.logoStorage.destroy.mock.mockImplementation(async (publicId) => { destroyed.push(publicId); throw new Error('Cloudinary is down'); });
  const removed = await fetch(`${root}/admin/universities/north-campus/logo`, { method: 'DELETE', headers: { Cookie: admin } });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).university.logo, undefined);
  assert.deepEqual(destroyed, [first, second]);
  assert.equal((await m.University.findOne({ universityId: 'north-campus' }).lean()).logo, undefined);
});

test('only a master admin can change a university logo', async (t) => {
  if (skipReason) return t.skip(skipReason);
  assert.equal((await sendLogo(png(128, 128), { cookie: student })).status, 403);
  assert.equal((await sendLogo(png(128, 128), { cookie: null })).status, 401);
  const removal = await fetch(`${root}/admin/universities/north-campus/logo`, { method: 'DELETE', headers: { Cookie: student } });
  assert.equal(removal.status, 403);
  assert.equal((await sendLogo(png(128, 128), { id: 'missing-campus' })).status, 404);
  assert.equal(uploads.length, 0);
  assert.equal(destroyed.length, 0);
});

test('the image header parser reads JPEG and WebP sizes', () => {
  if (skipReason) return;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x80, 0x01, 0x00, 0x03]);
  assert.deepEqual(m.readLogoSize(jpeg, 'jpeg'), { width: 256, height: 128 });
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii'); webp.write('WEBP', 8, 'ascii'); webp.write('VP8X', 12, 'ascii');
  webp.writeUIntLE(199, 24, 3); webp.writeUIntLE(99, 27, 3);
  assert.equal(m.detectLogoType(webp), 'webp');
  assert.deepEqual(m.readLogoSize(webp, 'webp'), { width: 200, height: 100 });
});
