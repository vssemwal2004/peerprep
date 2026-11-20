// Builds a chart's guide from three layers:
//   common steps (content/common.js)   — the card itself: intro, headline, views, menu, coverage
//   type steps (content/types.js)      — how to read and click this kind of chart
//   chart steps (content/charts.*.js)  — what this chart means, how it is counted, what to do next
// Chart content: { counted, meaning: [step], action(ctx) → { label, part } | null, whatsNew: [step] }.
// A step: { id, chapter, title, body, target, quick?, when?(ctx), tryIt?, before?(ctx), action?(ctx) }.
// "Quick look" keeps the quick steps; "Deep dive" keeps them all.
import { actionSteps, doneStep, introSteps } from "./content/common.js";
import { TYPE_GUIDES } from "./content/types.js";
import { MAIN_CHART_GUIDES } from "./content/charts.main.js";
import { OTHER_CHART_GUIDES } from "./content/charts.others.js";

export const CHART_GUIDES = Object.freeze({
  ...MAIN_CHART_GUIDES, ...OTHER_CHART_GUIDES,
  ...Object.fromEntries(Object.entries(OTHER_CHART_GUIDES)
    .filter(([id]) => id.startsWith('assessment-'))
    .map(([id, guide]) => [id.replace(/^assessment-/, 'prepmock-'), guide])),
});
// Bumped when a chart's "what's new" changes, so admins see the new notes once.
const NEW_VERSION = "2026-11-19";

export const chartGuideId = (chartId) => `chart:${chartId}`;
export const whatsNewId = (chartId) => `new:${chartId}:${NEW_VERSION}`;

const safely = (test, ctx) => { try { return test(ctx); } catch { return false; } };

function chartSteps(chart) {
  const content = CHART_GUIDES[chart.id] || {};
  const type = TYPE_GUIDES[chart.type] || { read: [], explore: [] };
  const next = content.action ? {
    id: "next", chapter: "next", quick: true, target: null,
    when: (current) => Boolean(content.action(current)),
    title: "Recommended next step",
    body: (current) => {
      const suggestion = content.action(current);
      return `Based on the numbers right now: ${suggestion.label}.\nThe list opens with Email (a ready-made message), Download and “Filter page to these”.`;
    },
    action: (current) => {
      const suggestion = content.action(current);
      return suggestion ? { label: suggestion.label, run: (target) => target.openPart?.(suggestion.part) } : null;
    },
  } : null;
  return [
    ...introSteps(chart),
    ...type.read.map((step) => ({ ...step, chapter: "read" })),
    ...(content.meaning || []).map((step, index) => ({ id: `meaning-${index}`, chapter: "meaning", ...step })),
    ...(content.counted ? [{ id: "counted", chapter: "meaning", target: "@coverage", title: "How it is counted", body: content.counted }] : []),
    ...type.explore.map((step) => ({ ...step, chapter: "explore" })),
    ...actionSteps(chart),
    ...(next ? [next] : []),
    doneStep(),
  ];
}

/** The steps that apply now (their `when` passes), for a Quick look or a Deep dive. */
export function resolveSteps(steps, ctx, mode = "deep") {
  return steps.filter((step) => (mode === "deep" || step.quick) && (!step.when || safely(step.when, ctx)));
}

/** How long each mode is for this chart right now (for the launcher). */
export function guideLengths(chart, ctx) {
  const steps = chartSteps(chart);
  return { quick: resolveSteps(steps, ctx, "quick").length, deep: resolveSteps(steps, ctx, "deep").length };
}

export function buildChartGuide(chart, mode, ctx) {
  return {
    id: chartGuideId(chart.id), key: `${chart.id}:${mode}:${Date.now()}`, milestone: "chartGuide",
    title: `${chart.title} · ${mode === "quick" ? "Quick look" : "Deep dive"}`,
    steps: resolveSteps(chartSteps(chart), ctx, mode),
    ctx,
  };
}

/** The chart's "what's new" notes as a short guide, or null when it has none. */
export function buildWhatsNewGuide(chart, ctx) {
  const notes = CHART_GUIDES[chart.id]?.whatsNew;
  if (!notes?.length) return null;
  return {
    id: whatsNewId(chart.id), key: `${chart.id}:new:${Date.now()}`,
    title: `${chart.title} · What's new`,
    steps: notes.map((note, index) => ({ id: `new-${index}`, chapter: "new", ...note })),
    ctx,
  };
}

export const hasWhatsNew = (chartId) => Boolean(CHART_GUIDES[chartId]?.whatsNew?.length);
export const countedText = (chartId) => CHART_GUIDES[chartId]?.counted || "";
