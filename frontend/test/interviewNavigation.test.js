import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchRoutes } from 'react-router-dom';
import { getInterviewNavigation, getInterviewSection } from '../src/components/interviews/interviewNavigation.js';

const id = '507f1f77bcf86cd799439011';
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const routes = [...app.matchAll(/<Route path="([^"]+)" element=\{([^\n]+)\}/g)]
  .map((match) => ({ path: match[1], elementSource: match[2] }));

for (const root of ['/admin', '/coordinator']) {
  test(`${root}: every workspace option resolves to a page and its own active section`, () => {
    for (const item of getInterviewNavigation(root)) {
      const url = new URL(item.to, 'https://peerprep.test');
      assert.equal(getInterviewSection(url.pathname, url.search), item.id);
      assert.ok(matchRoutes(routes, url.pathname)?.length, `Missing page for ${item.to}`);
    }
  });

  test(`${root}: Create interview selects the form, never the event detail route`, () => {
    const match = matchRoutes(routes, `${root}/event/create`).at(-1);
    assert.match(match.route.elementSource, /EventManagement/);
    assert.equal(getInterviewSection(`${root}/event/create`), 'create');
    assert.equal(getInterviewSection(`${root}/event/create/`), 'create');
  });

  test(`${root}: legacy and current detail links highlight the matching section`, () => {
    for (const path of [`${root}/event/${id}`, `${root}/interviews/${id}`, `${root}/interviews/one-to-one/${id}`]) {
      assert.equal(getInterviewSection(path), 'all');
    }
    for (const prefix of [`${root}/interviews`, `${root}/interviews/one-to-one`]) {
      assert.equal(getInterviewSection(`${prefix}/scheduled/${id}`), 'scheduled');
      assert.equal(getInterviewSection(`${prefix}/past/${id}`), 'past');
    }
    assert.equal(getInterviewSection(`${root}/feedback`), 'feedback');
    assert.equal(getInterviewSection(`${root}/ai-interviews`), null);
    assert.equal(getInterviewSection(`${root}/assessment/create`), null);
  });

  test(`${root}: Active and All stay distinct on the same pathname`, () => {
    const path = `${root}/interviews/one-to-one`;
    assert.equal(getInterviewSection(path, '?status=active'), 'active');
    assert.equal(getInterviewSection(path, ''), 'all');
    assert.equal(getInterviewSection(path, '?status=unknown'), 'all');
  });
}

test('legacy admin create URL highlights Create interview', () => {
  assert.equal(getInterviewSection('/admin/event'), 'create');
});
