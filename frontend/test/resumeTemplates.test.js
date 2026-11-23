// Prep Resume templates: catalogue integrity, content safety when switching
// templates, page packing, and a real PDF render of every template.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { createServer } from 'vite';
import { RESUME_TEMPLATE_IDS as BACKEND_IDS } from '../../backend/src/constants/resumeTemplates.js';

const root = fileURLToPath(new URL('..', import.meta.url));
let server, catalog, blocks, paginate, utils, sample, fonts, theme, ResumePdfDocument, renderToBuffer;

const clone = (value) => JSON.parse(JSON.stringify(value));

function longResume(base) {
  const value = clone(base);
  for (let n = 1; n <= 6; n += 1) {
    value.projects.push({
      title: `Project ${n} — Distributed Job Scheduler`, subtitle: 'Course project', location: 'Remote', date: `Jan 202${n % 5}`, link: 'https://example.com/p', technologies: 'Go, gRPC, Redis',
      bullets: [
        { text: `Designed a leader-election module for project ${n} handling 5,000 jobs per minute with **retries**.` },
        { text: 'A long bullet with a long URL https://example.com/a/very/long/path/that/should/wrap/nicely/in/both/renderers and more words.' },
      ],
    });
  }
  // Ligature-prone sequences ("//", "->", "fi") reach title fonts such as JetBrains Mono.
  value.customSections.push({ id: 'por', title: 'POSITIONS // LEADS -> TEAMS => FIELDS', format: 'details', entries: [{ title: 'Coding Club Secretary // C++ -> Rust != Go', subtitle: 'NIT', location: '', date: '2025', link: '', technologies: 'Led a **12-member** team.', bullets: [{ text: 'Ran weekly contests; office workflow fixes.' }] }] });
  value.sectionOrder.push('custom:por');
  // Characters a student may paste that broke some font subsets.
  value.basics.headline = 'Engineer · Builder​ — ₹ stipend';
  return value;
}

before(async () => {
  server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  catalog = await server.ssrLoadModule('/src/features/resume/templates/catalog.js');
  blocks = await server.ssrLoadModule('/src/features/resume/templates/blocks.js');
  paginate = await server.ssrLoadModule('/src/features/resume/templates/paginate.js');
  theme = await server.ssrLoadModule('/src/features/resume/templates/theme.js');
  utils = await server.ssrLoadModule('/src/features/resume/resumeUtils.js');
  sample = (await server.ssrLoadModule('/src/features/resume/templates/sampleResume.js')).SAMPLE_RESUME;
  fonts = await server.ssrLoadModule('/src/features/resume/templates/fonts.js');
  const pdfLib = await server.ssrLoadModule('@react-pdf/renderer');
  renderToBuffer = pdfLib.renderToBuffer;
  // In Node the font URLs are project paths; register them as files before the document module does.
  fonts.registerPdfFonts(pdfLib.Font, (src) => path.join(root, String(src).replace(/^\/+/, '').replace(/\?.*$/, '')));
  ResumePdfDocument = (await server.ssrLoadModule('/src/features/resume/ResumePdf.jsx')).default;
});

after(async () => { await server?.close(); });

test('the catalogue has 30+ unique templates and matches the backend list', () => {
  const ids = catalog.RESUME_TEMPLATE_IDS;
  assert.ok(ids.length >= 30, `expected at least 30 templates, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, 'template ids are unique');
  assert.deepEqual([...ids].sort(), [...BACKEND_IDS].sort(), 'backend/src/constants/resumeTemplates.js must list the same ids');
  for (const legacy of ['iit-bombay-classic', 'peerprep-nova', 'peerprep-meridian', 'peerprep-circuit']) assert.ok(ids.includes(legacy), `saved resumes keep working: ${legacy}`);
  const names = catalog.RESUME_TEMPLATE_CATALOG.map((template) => template.name);
  assert.equal(new Set(names).size, names.length, 'template names are unique');
});

test('every template resolves to real fonts, a known layout and a distinct design', () => {
  const signatures = new Set();
  for (const template of catalog.RESUME_TEMPLATE_CATALOG) {
    const resolved = catalog.getTemplateTheme(template.id);
    assert.ok(['single', 'sidebar-left', 'sidebar-right'].includes(resolved.layout), template.id);
    for (const key of [resolved.fonts.body, resolved.fonts.heading, resolved.fonts.title]) {
      assert.ok(fonts.FONT_FAMILIES[key], `${template.id}: unknown font ${key}`);
      assert.equal(fonts.fontSources(key).length, 4, `${template.id}: ${key} needs regular, bold, italic and bold italic`);
    }
    assert.ok(template.tagline && template.bestFor && template.categories.length, `${template.id} has gallery copy`);
    signatures.add(JSON.stringify([resolved.layout, resolved.fonts, resolved.header.place, resolved.header.align, resolved.title.variant, resolved.colors.accent, resolved.rail?.kind]));
  }
  assert.equal(signatures.size, catalog.RESUME_TEMPLATE_CATALOG.length, 'no two templates share the same design signature');
});

test('switching templates never changes or drops content', () => {
  const base = utils.normalizeClientResume(longResume(sample));
  const content = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'template'));
  for (const id of catalog.RESUME_TEMPLATE_IDS) {
    const switched = utils.normalizeClientResume({ ...base, template: id });
    assert.equal(switched.template, id);
    assert.deepEqual(content(switched), content(base), `${id} keeps every field`);
    // Every visible section is laid out somewhere in this template.
    const layout = blocks.buildLayout(switched, catalog.getTemplateTheme(id));
    const all = [...layout.columns.main, ...layout.columns.side, ...(layout.banner ? [layout.banner] : [])];
    for (const key of utils.visibleSectionKeys(switched)) assert.ok(all.some((block) => block.section === key), `${id} renders ${key}`);
    const bullets = all.filter((block) => block.kind === 'bullet').length;
    const expected = [...switched.experience, ...switched.projects, ...switched.achievements, ...switched.customSections.filter((s) => !/certificat/i.test(s.title)).flatMap((s) => s.entries)]
      .reduce((sum, entry) => sum + (entry.bullets || []).filter((b) => String(b.text || '').trim()).length, 0);
    assert.equal(bullets, expected, `${id} keeps every bullet`);
    assert.ok(all.some((block) => block.kind === 'header'), `${id} shows the header`);
  }
  // Unknown ids fall back to the default without touching content.
  assert.equal(utils.normalizeClientResume({ ...base, template: 'no-such-template' }).template, catalog.DEFAULT_TEMPLATE_ID);
});

test('text is sanitised so pasted exotic spaces cannot break the PDF engine', () => {
  const clean = blocks.sanitizeResume({ a: 'x y z​w ₹500', list: [' '] });
  assert.deepEqual(clean, { a: 'x y zw Rs. 500', list: [' '] });
});

test('page packing keeps headings with what follows and never loses a block', () => {
  const box = (id, top, bottom, keepWithNext = false) => ({ id, top, bottom, keepWithNext });
  const boxes = [box('h', 0, 40), box('t1', 40, 60, true), box('e1', 60, 120, true), box('b1', 120, 150), box('t2', 150, 170, true), box('e2', 170, 230)];
  const pages = paginate.packColumn(boxes, () => 160);
  assert.deepEqual(pages, [['h', 't1', 'e1', 'b1'], ['t2', 'e2']], 'title t2 moves to the next page with its entry');
  const tight = paginate.packColumn(boxes, () => 100);
  assert.deepEqual(tight.flat(), boxes.map((item) => item.id), 'order and completeness');
  assert.ok(tight.every((page) => page.length), 'no empty pages');
  assert.deepEqual(paginate.combineColumns({ main: [['a'], ['b']], side: [['s']] }), [{ main: ['a'], side: ['s'] }, { main: ['b'], side: [] }]);
});

test('column geometry leaves room for the banner on page 1 only', () => {
  const horizon = catalog.getTemplateTheme('horizon');
  const first = theme.columnGeometry(horizon, 'main', { pageIndex: 0, bannerHeightPx: 120 });
  const next = theme.columnGeometry(horizon, 'main', { pageIndex: 1, bannerHeightPx: 120 });
  assert.ok(next > first, 'later pages have more room');
  assert.ok(first < theme.PAGE_HEIGHT_PX && first > 600);
});

test('two exports of the same saved resume retain identical PDF bytes', async () => {
  const resume = utils.normalizeClientResume({ ...sample, exists: true, createdAt: '2026-10-07T10:20:30.000Z' });
  const first = await renderToBuffer(createElement(ResumePdfDocument, { resume }));
  await new Promise(resolve => setTimeout(resolve, 1100));
  const second = await renderToBuffer(createElement(ResumePdfDocument, { resume: { ...resume, updatedAt: '2026-10-08T15:30:00.000Z' } }));
  assert.ok(first.equals(second), 'identical saved content must deduplicate across tabs even after a no-op save');
});

test('every template renders a real PDF for sample and long resumes', { timeout: 240000 }, async () => {
  const datasets = { sample: utils.normalizeClientResume(clone(sample)), long: utils.normalizeClientResume(longResume(sample)) };
  for (const id of catalog.RESUME_TEMPLATE_IDS) {
    for (const [name, data] of Object.entries(datasets)) {
      const resume = { ...data, template: id };
      let buffer;
      try {
        buffer = await renderToBuffer(createElement(ResumePdfDocument, { resume }));
      } catch (error) {
        assert.fail(`${id}/${name}: ${error.message}`);
      }
      assert.ok(buffer.length > 4000, `${id}/${name} produced a PDF`);
      assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
    }
  }
  // The download's last-resort retry with standard PDF fonts also works.
  const fallback = await renderToBuffer(createElement(ResumePdfDocument, { resume: { ...datasets.long, template: 'navigator' }, safeFonts: true }));
  assert.equal(fallback.subarray(0, 5).toString(), '%PDF-');
});

test('bundled fonts ship with their licences', () => {
  const dir = path.join(root, 'src/assets/fonts/resume');
  for (const family of fs.readdirSync(dir)) assert.ok(fs.existsSync(path.join(dir, family, 'LICENSE.txt')), `${family} licence`);
});
