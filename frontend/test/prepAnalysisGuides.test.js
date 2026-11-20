import assert from 'node:assert/strict';
import test from 'node:test';
import { CHART_GUIDES, buildChartGuide, buildWhatsNewGuide, guideLengths } from '../src/admin/prepAnalysis/guide/buildGuide.js';
import { TYPE_GUIDES } from '../src/admin/prepAnalysis/guide/content/types.js';
import { pageTourSteps } from '../src/admin/prepAnalysis/guide/content/page.js';
import { glossaryParts } from '../src/admin/prepAnalysis/guide/glossary.js';
import { KPI_EXPLAIN } from '../src/admin/prepAnalysis/guide/explain.js';
import { CHECKLIST } from '../src/admin/prepAnalysis/guide/checklist.js';
import { placeCard } from '../src/guide/engine/targets.js';

// The server's chart and headline-card catalogue: the guides must cover every one.
const server = await import('../../backend/src/modules/prepAnalysis/charts.js');
const MODULES = new Set(['coding', 'quickprep', 'learning', 'interview', 'assessment']);

// A small, realistic sample per chart type (shapes as the server builds them).
const SAMPLE = {
  rankedStackedBar: { items: [{ id: 's1', name: 'Asha', position: 1, score: 40, segments: { Easy: 5, Medium: 15, Hard: 20 }, solved: { Easy: 3, Medium: 4, Hard: 2 } }] },
  barList: { valueLabel: 'days since last practice', items: [{ id: 's1', key: 'p1', name: 'Asha', value: 12, note: 'Prep Score 3 · 2 solved', students: 4 }], chips: [{ key: 'listed', label: 'Stopped practising', value: 25 }, { key: 'never', label: 'Never practised', value: 564 }] },
  donut: { centerLabel: 'submissions', items: [{ key: 'Accepted', name: 'Accepted', value: 29, students: 9 }, { key: 'Not accepted', name: 'Not accepted', value: 34, students: 12 }] },
  trend: { interval: 'week', labels: ['2026-11-02', '2026-11-09'], series: [{ name: 'Submissions', values: [4, 9] }, { name: 'Students practising', values: [2, 3], axis: 'right' }] },
  funnel: { stages: [{ name: 'All students', value: 100 }, { name: 'Tried a problem', value: 30 }, { name: 'Solved a problem', value: 20 }], drops: [{ key: 'lost:1', label: 'Never tried a problem', students: 70 }, { key: 'lost:2', label: 'Tried, but nothing solved yet', students: 10 }] },
  bubble: { valueLabel: 'students solving', itemLabel: 'Topic', items: [{ key: 'Array', name: 'Array', value: 9, tier: 't0', detail: '3 finished · 33% finish rate' }], tiers: [{ key: 't0', label: '9 students', low: 9, high: 9, topics: 1 }] },
  calendar: { from: '2025-11-20', to: '2026-11-19', unit: 'submissions', days: [['2026-10-12', 9], ['2026-11-01', 2]] },
  radar: { indicators: [{ name: 'Array', max: 100 }], topics: [{ name: 'Array', students: 3 }] },
  histogram: { label: 'Prep Score', bins: [{ label: '0–2.5', count: 15 }, { label: '2.5–5', count: 9 }] },
  stackedBar: { series: ['Finished', 'In progress'], groups: [{ label: 'Sem 5', students: 10, values: { Finished: 2, 'In progress': 3 } }] },
  heatmap: { unit: 'solved', students: ['Asha'], columns: ['Array'], cells: [[0, 0, 3]] },
  scatter: { xLabel: 'Submissions', yLabel: 'Prep Score', items: [{ id: 's1', name: 'Asha', x: 10, y: 4 }] },
  boxplot: { unit: '%', groups: [{ label: 'Sem 5', students: 4, min: 0, q1: 10, median: 20, q3: 40, max: 80 }] },
  rings: { unit: '%', items: [{ key: 'Easy', label: 'Easy', value: 78.4, solved: 412, total: 525, students: 101 }] },
  combo: { barLabel: 'students', categories: [{ key: 'q1', label: 'Sheet', students: 3 }], bars: [{ name: 'Finished', values: [1] }], lines: [{ name: 'Average progress', values: [40], unit: '%' }] },
};

const context = (chart, data) => ({
  chart: { ...chart, data, summary: { students: 25, cohort: 589, studentsLabel: 'practised' }, studentCount: 589 },
  data, view: 'chart', insight: 'Most students practise on Mondays.', root: null, instance: { current: null },
  setView() {}, openPart() {}, openFull() {},
});
const textOf = (value, ctx) => (typeof value === 'function' ? value(ctx) : value);

function checkGuide(guide, label) {
  for (const step of guide.steps) {
    const title = textOf(step.title, guide.ctx);
    const body = textOf(step.body, guide.ctx);
    assert.ok(title && typeof title === 'string', `${label} › ${step.id}: has a title`);
    assert.ok(typeof body === 'string' && body.length > 10, `${label} › ${step.id}: has a body`);
    assert.doesNotMatch(`${title} ${body}`, /undefined|NaN|\[object|null\b/, `${label} › ${step.id}: no broken text`);
    assert.ok(step.chapter, `${label} › ${step.id}: belongs to a chapter`);
    const action = step.action?.(guide.ctx);
    if (action) assert.ok(action.label && typeof action.run === 'function', `${label} › ${step.id}: a real action`);
  }
}

test('every chart on the server has a guide, and every chart type has reading steps', () => {
  const ids = server.CHARTS.filter((chart) => MODULES.has(chart.module)).map((chart) => chart.id);
  assert.equal(ids.length, 61);
  assert.deepEqual(ids.filter((id) => !CHART_GUIDES[id]), [], 'charts without content');
  assert.deepEqual(Object.keys(CHART_GUIDES).filter((id) => !ids.includes(id)), [], 'content for charts that do not exist');
  for (const type of new Set(server.CHARTS.map((chart) => chart.type))) assert.ok(TYPE_GUIDES[type]?.read?.length, `${type} has reading steps`);
  for (const [id, content] of Object.entries(CHART_GUIDES)) {
    assert.ok(content.counted?.length > 20, `${id}: says how it is counted`);
    assert.ok(content.meaning?.length >= 1 && content.meaning.some((step) => step.quick), `${id}: a quick meaning step`);
  }
});

test('every guide builds and reads well, with sample data and with no data, quick and deep', () => {
  for (const chart of server.CHARTS.filter((entry) => MODULES.has(entry.module))) {
    for (const data of [SAMPLE[chart.type], {}]) {
      const ctx = context(chart, data);
      const quick = buildChartGuide(chart, 'quick', ctx);
      const deep = buildChartGuide(chart, 'deep', ctx);
      checkGuide(quick, `${chart.id} quick`);
      checkGuide(deep, `${chart.id} deep`);
      assert.ok(quick.steps.length >= 3 && quick.steps.length < deep.steps.length, `${chart.id}: a quick look is shorter than the deep dive`);
      assert.ok(deep.steps.length >= 8, `${chart.id}: the deep dive has at least 8 steps (${deep.steps.length})`);
      assert.deepEqual(guideLengths(chart, ctx), { quick: quick.steps.length, deep: deep.steps.length });
      assert.equal(new Set(deep.steps.map((step) => step.id)).size, deep.steps.length, `${chart.id}: step ids are unique`);
      const whatsNew = buildWhatsNewGuide(chart, ctx);
      if (whatsNew) checkGuide(whatsNew, `${chart.id} what's new`);
    }
  }
});

test('the recommended next step uses the live numbers and opens a real part', () => {
  const chart = server.CHARTS.find((entry) => entry.id === 'practice-funnel');
  let opened = null;
  const ctx = { ...context(chart, SAMPLE.funnel), openPart: (part) => { opened = part; } };
  const next = buildChartGuide(chart, 'quick', ctx).steps.find((step) => step.id === 'next');
  assert.match(textOf(next.body, ctx), /70 students: Never tried a problem/);
  next.action(ctx).run(ctx);
  assert.deepEqual([opened.key, opened.students], ['lost:1', 70], 'opens the biggest gap');
  const attention = server.CHARTS.find((entry) => entry.id === 'needs-attention');
  const later = buildChartGuide(attention, 'deep', context(attention, SAMPLE.barList)).steps.find((step) => step.id === 'next');
  assert.match(later.action(context(attention, SAMPLE.barList)).label, /564 students/);
});

test('every headline number says how it is counted', () => {
  const groups = server.buildKpiGroups('all', MODULES, [], { preset: 'all' });
  const missing = groups.flatMap((group) => group.kpis.map((kpi) => `${group.key}.${kpi.id}`)).filter((key) => !KPI_EXPLAIN[key]);
  assert.deepEqual(missing, []);
});

test('glossary words are underlined once each, whole words only', () => {
  const parts = glossaryParts('Most students are in the 0–2.5 band of Prep Score; Prep Score rises as students solve.');
  assert.deepEqual(parts.filter((part) => part.entry).map((part) => part.text), ['band', 'Prep Score', 'solve']);
  assert.equal(parts.map((part) => part.text).join(''), 'Most students are in the 0–2.5 band of Prep Score; Prep Score rises as students solve.');
  assert.equal(glossaryParts('Bandwidth and resolved items').filter((part) => part.entry).length, 0, 'no matches inside other words');
});

test('the page tour, checklist and card placement', () => {
  const steps = pageTourSteps();
  assert.ok(steps.length >= 12);
  assert.equal(new Set(steps.map((step) => step.id)).size, steps.length);
  assert.deepEqual(CHECKLIST.map((item) => item.key), ['pageTour', 'filter', 'chartGuide', 'studentList', 'email', 'download', 'savedView']);
  const viewport = { width: 1400, height: 900 };
  const card = { width: 368, height: 240 };
  assert.equal(placeCard({ left: 100, top: 100, width: 300, height: 100 }, card, viewport).placement, 'bottom');
  assert.equal(placeCard({ left: 100, top: 600, width: 300, height: 200 }, card, viewport).placement, 'top');
  assert.equal(placeCard({ left: 100, top: 50, width: 300, height: 800 }, card, viewport).placement, 'right');
  assert.equal(placeCard(null, card, viewport).placement, 'center');
});
