// Steps every chart card shares: what the chart is for, the one-line headline, and the card's
// actions (views, full page, download, coverage). `quick: true` steps make the Quick look.
import { viewsFor } from "../../charts/chartOptions.js";
import { num } from "./format.js";

export const introSteps = (chart) => [
  {
    id: "intro", chapter: "intro", quick: true, target: (ctx) => ctx.root,
    title: chart.title,
    body: `${chart.question}\nThis guide walks through the chart part by part. Use Next or the → key; Esc closes it any time.`,
    // Remember the chart's view, so a "show me" step that switches it is undone at the end.
    before: (ctx) => { const view = ctx.view; return () => ctx.setView(view); },
  },
  {
    id: "insight", chapter: "intro", quick: true, target: "@insight", when: (ctx) => Boolean(ctx.insight),
    title: "The headline, in one sentence",
    body: (ctx) => `“${ctx.insight}”\nPrep Analysis writes this from the numbers, so you see what stands out before reading the chart.`,
  },
];

export const actionSteps = (chart) => {
  const views = viewsFor(chart.type);
  return [
    {
      id: "views", chapter: "actions", target: "@views", when: () => views.length > 1,
      title: "Show it your way",
      body: `The same numbers can be shown as ${views.map((view) => view.label).join(", ")}. Your choice is remembered for this chart.`,
    },
    {
      id: "try-table", chapter: "actions", target: "@view-table", when: () => views.some((view) => view.value === "table"),
      tryIt: "Click the Table button to see the numbers as rows.",
      title: "Try it: the numbers as a table",
      body: "Every chart has a Table view with the exact numbers, one row per part. Click a row there to open its students too.",
    },
    {
      id: "expand", chapter: "actions", target: "@expand",
      title: "Open the full page",
      body: "Opens this chart on its own page: bigger, every row (not only the top ones), its own filters and the full student list.",
    },
    {
      id: "menu", chapter: "actions", target: "@menu", quick: true,
      title: "Download, save, resize",
      body: "Under ⋯: Download (pick the students, then Excel, CSV or PDF — the same students in every format), Save image, the card's width, or Hide it from the page.",
    },
    {
      id: "coverage", chapter: "actions", target: "@coverage",
      title: "Who this chart is about",
      body: (ctx) => {
        const summary = ctx.chart.summary;
        const students = summary?.students ?? ctx.chart.studentCount;
        const cohort = summary?.cohort ?? ctx.chart.studentCount;
        return `${num(students)} of the ${num(cohort)} students in view${summary?.studentsLabel ? ` ${summary.studentsLabel}` : ""}. Filters and the period at the top of the page change every number here.`;
      },
    },
  ];
};

export const doneStep = () => ({
  id: "done", chapter: "next", quick: true, target: null,
  title: "You're done",
  body: "Every chart has its own ⓘ guide. Finished guides get a ✓, and the Help (?) button at the top lists them all, with the page tour and your getting-started checklist.",
});
