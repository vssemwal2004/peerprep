import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { act, createElement as h } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Query-only URLs model reopening a dashboard lesson after a reload. APIs,
// sockets and YouTube players are local mocks; jsdom does not load external
// scripts, PDF documents or video resources.
let dom, server, root, createRoot, LearningDetail, ToastProvider, api, socket, calls, listeners;
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'localStorage',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const topic = {
  _id: 'topic-binary-search', topicName: 'Binary search boundaries', difficultyLevel: 'medium',
  notesPDF: 'https://documents.example/binary-search-notes.pdf',
  questionPDF: 'https://documents.example/binary-search-exercises.pdf',
  topicVideoLink: 'https://www.youtube.com/watch?v=local-video-id',
};
const subject = {
  semesterId: 'semester-2', subjectId: 'subject-algorithms', subjectName: 'Algorithms',
  subjectDescription: 'Searching and sorting', coordinatorId: 'teacher-1', coordinatorName: 'Test Teacher',
  chapters: [
    { _id: 'chapter-unrelated', chapterName: 'Sorting', topics: [{ _id: 'topic-unrelated', topicName: 'Unrelated hidden topic' }] },
    { _id: 'chapter-search', chapterName: 'Searching', topics: [topic] },
  ],
};
const basePath = '/student/learning/teacher-1';
const resumePath = (contentType, topicId = topic._id) => `${basePath}?semesterId=semester-2&subjectId=subject-algorithms&topicId=${topicId}&contentType=${contentType}`;

before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173', pretendToBeVisual: true });
  for (const key of keys.filter((key) => !['IS_REACT_ACT_ENVIRONMENT', 'fetch'].includes(key))) {
    const value = ['requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'].includes(key)
      ? dom.window[key].bind(dom.window) : dom.window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => { throw new Error('Unexpected live request in learning resume test'); };
  // Animation layout measurement can restore scroll in a browser; jsdom has
  // no scrolling layout to restore.
  window.scrollTo = () => {};
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  LearningDetail = (await server.ssrLoadModule('/src/student/LearningDetail.jsx')).default;
  ({ ToastProvider } = await server.ssrLoadModule('/src/components/CustomToast.jsx'));
  api = (await server.ssrLoadModule('/src/utils/api.js')).api;
  socket = (await server.ssrLoadModule('/src/utils/socket.js')).default;
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  root = createRoot(document.getElementById('app'));
  calls = [];
  listeners = new Map();
  api.getCoordinatorSubjects = async (teacherId) => {
    calls.push(['subjects', teacherId]);
    return [
      { semesterId: subject.semesterId, subjectId: subject.subjectId, subjectName: subject.subjectName },
      { semesterId: 'other-semester', subjectId: 'other-subject', subjectName: 'Another semester’s subject' },
    ];
  };
  api.getSubjectDetails = async (...args) => { calls.push(['details', ...args]); return structuredClone(subject); };
  api.getSubjectProgress = async (subjectId) => { calls.push(['progress', subjectId]); return { completedTopics: 0, totalTopics: 2, progressRecords: [] }; };
  api.recordStudentTopicView = async (body) => { calls.push(['view', structuredClone(body)]); return { ok: true }; };
  api.startVideoTracking = async (...args) => { calls.push(['legacy-auto-complete', ...args]); return {}; };
  api.markTopicComplete = async (...args) => { calls.push(['complete', ...args]); return {}; };
  api.trackWatchTime = async (...args) => { calls.push(['watch-time', ...args]); return {}; };
  socket.connect = () => socket;
  socket.on = (name, callback) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
  };
  socket.off = (name, callback) => listeners.get(name)?.delete(callback);
  // A local player records construction/destruction without requesting media
  // or creating a playback timer. Watching nothing must not complete a topic.
  window.YT = {
    Player: function Player(target, options) {
      assert.ok(document.getElementById(target), 'Video player mounts into the expanded lesson modal');
      calls.push(['player', target, options.videoId]);
      this.getDuration = () => 600;
      this.destroy = () => calls.push(['player-destroy']);
    },
    PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
  };
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  assert.equal(listeners.get('learning-updated')?.size || 0, 0, 'Learning refresh listeners are removed on unmount');
  document.getElementById('yt-iframe-api')?.remove();
  delete window.YT;
  delete window._ytReadyCallbacks;
  delete window.onYouTubeIframeAPIReady;
});

after(async () => {
  await server?.close();
  dom?.window.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

async function mount(entry) {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [entry] }, h(ToastProvider, null,
    h(Routes, null, h(Route, { path: '/student/learning/:teacherId', element: h(LearningDetail) }))))));
}

async function refreshLearning() {
  await act(async () => { for (const listener of listeners.get('learning-updated') || []) await listener({}); });
}

const viewCalls = () => calls.filter(([name]) => name === 'view');
const assertNoCompletion = () => assert.ok(calls.every(([name]) => !['legacy-auto-complete', 'complete', 'watch-time'].includes(name)),
  'Merely opening learning content must never complete it or count unwatched video time');

for (const [contentType, source] of [['notes', topic.notesPDF], ['questions', topic.questionPDF]]) {
  test(`a direct ${contentType} resume URL loads the selected subject and expands and opens the exact saved topic`, async () => {
    await mount(resumePath(contentType));
    assert.ok(calls.some(([name, semesterId, subjectId]) => name === 'details' && semesterId === subject.semesterId && subjectId === subject.subjectId));
    assert.equal(document.querySelector('h1')?.textContent, 'Algorithms');
    assert.ok([...document.querySelectorAll('tbody tr')].some((row) => row.textContent.includes(topic.topicName)), 'Saved topic’s chapter is expanded');
    assert.ok([...document.querySelectorAll('tbody tr')].every((row) => !row.textContent.includes('Unrelated hidden topic')), 'Unrelated chapters stay collapsed');
    const iframe = document.querySelector('iframe[title="Document Viewer"]');
    assert.ok(iframe);
    assert.equal(iframe.getAttribute('src'), `https://docs.google.com/viewer?url=${encodeURIComponent(source)}&embedded=true`);
    assert.deepEqual(viewCalls(), [['view', {
      topicId: topic._id, chapterId: 'chapter-search', semesterId: subject.semesterId,
      subjectId: subject.subjectId, coordinatorId: subject.coordinatorId, contentType,
    }]]);
    assertNoCompletion();
    assert.doesNotMatch(document.querySelector('aside').textContent, /Another semester’s subject/);

    await refreshLearning();
    assert.equal(viewCalls().length, 1, 'Replacing subject details after a socket update must not reopen or record the same resume twice');
    assertNoCompletion();
  });
}

test('a video resume URL opens one local player and records a view without completing the topic', async () => {
  await mount(resumePath('video'));
  assert.ok(document.getElementById('yt-player-container'));
  assert.deepEqual(calls.filter(([name]) => name === 'player'), [['player', 'yt-player-container', 'local-video-id']]);
  assert.deepEqual(viewCalls(), [['view', {
    topicId: topic._id, chapterId: 'chapter-search', semesterId: subject.semesterId,
    subjectId: subject.subjectId, coordinatorId: subject.coordinatorId, contentType: 'video',
  }]]);
  assertNoCompletion();
  await refreshLearning();
  assert.equal(viewCalls().length, 1);
  assert.equal(calls.filter(([name]) => name === 'player').length, 1, 'Progress refresh must not duplicate the player');
  await act(async () => root.unmount());
  root = null;
  assert.equal(calls.filter(([name]) => name === 'player-destroy').length, 1, 'Unmount cleans up the local video player');
  assertNoCompletion();
});

test('an unavailable resume topic opens no content and does not record a view for a guessed topic ID', async () => {
  await mount(resumePath('video', 'unavailable-topic'));
  assert.equal(document.querySelector('h1')?.textContent, 'Algorithms');
  assert.equal(document.querySelector('iframe'), null);
  assert.equal(document.getElementById('yt-player-container'), null);
  assert.deepEqual(viewCalls(), []);
  assertNoCompletion();
});

test('existing subject links with navigation state still load their subject without auto-opening content', async () => {
  await mount({ pathname: basePath, state: { semesterId: subject.semesterId, subjectId: subject.subjectId, coordinatorName: 'Test Teacher' } });
  assert.equal(document.querySelector('h1')?.textContent, 'Algorithms');
  assert.ok(calls.some(([name, semesterId, subjectId]) => name === 'details' && semesterId === subject.semesterId && subjectId === subject.subjectId));
  assert.deepEqual(viewCalls(), []);
  assert.equal(document.querySelector('iframe'), null);
  assert.equal(document.getElementById('yt-player-container'), null);
});
