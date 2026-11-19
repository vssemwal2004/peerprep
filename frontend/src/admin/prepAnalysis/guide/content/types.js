// How to read each kind of chart, and how to click into it. Steps point at real parts of the
// chart (the first bar, the biggest slice, the busiest day…) and use the chart's own numbers.
import { indexOfMax, maxBy, num, pct, plural } from "./format.js";

const first = (ctx) => ctx.data?.items?.[0];
const sum = (list, read) => (list || []).reduce((total, item) => total + (Number(read(item)) || 0), 0);

export const TYPE_GUIDES = {
  rankedStackedBar: {
    read: [
      { id: "rows", quick: true, target: () => ({ series: 0, index: 0 }), title: "One row per student, best first",
        body: (ctx) => (first(ctx) ? `Students are ranked by Prep Score. ${first(ctx).name} leads with ${first(ctx).score}.` : "Students are ranked by Prep Score, best first.") },
      { id: "segments", target: "@legend", title: "Each bar is split by difficulty",
        body: "The coloured parts show how much of the Prep Score comes from Easy, Medium and Hard problems. A long red part means the student earns from Hard problems." },
      { id: "score", target: (ctx) => ctx.root?.querySelector('[data-tour="body"]'), title: "The score on the right",
        body: "The number at the end of each row is the student's Prep Score. Longer bar = higher score, always." },
    ],
    explore: [
      { id: "click-row", target: () => ({ series: 0, index: 0 }), title: "Click a student",
        body: "Click any row (its name, bar or the empty track) to see that student's solves by difficulty, then their full profile." },
    ],
  },
  barList: {
    read: [
      { id: "rows", quick: true, target: () => ({ series: 0, index: 0 }), title: "One bar per row, biggest first",
        body: (ctx) => {
          const item = first(ctx);
          return item ? `Each bar is one ${ctx.data.itemLabel?.toLowerCase() || "row"}, and its length is the ${ctx.data.valueLabel || "value"}. At the top: ${item.name} (${num(item.value)}${ctx.data.unit === "%" ? "%" : ""}).` : "Each bar is one row; its length is the value on the right.";
        } },
      { id: "chips", target: "@legend", when: (ctx) => Boolean(ctx.data?.chips?.length), title: "Two groups of students",
        body: (ctx) => ctx.data.chips.map((chip) => `${chip.label}: ${num(chip.value)}`).join(" · ") + ". The bars list the first group; click a chip to list everyone in it." },
      { id: "note", when: (ctx) => Boolean(first(ctx)?.note), target: () => ({ series: 0, index: 0 }), title: "More in the tooltip",
        body: (ctx) => `Hover a bar for its details, e.g. “${first(ctx).note}”.` },
    ],
    explore: [
      { id: "click-row", target: () => ({ series: 0, index: 0 }), title: "Click a row",
        body: "A student row opens that student; a question or problem row opens the students behind it, ready to download or email." },
    ],
  },
  donut: {
    read: [
      { id: "ring", quick: true, target: "@body", title: "Parts of one whole",
        body: (ctx) => {
          const items = (ctx.data?.items || []).filter((item) => item.value > 0);
          const total = sum(items, (item) => item.value);
          const top = maxBy(items, (item) => item.value);
          return top ? `The ring is all ${num(total)} ${ctx.data.centerLabel || ""} together. The biggest part is ${top.name}: ${num(top.value)} (${pct(top.value, total)}%).` : "The ring is the whole; each slice is one part of it.";
        } },
      { id: "legend", target: "@legend", title: "The legend has the numbers",
        body: "Each chip shows a part's count and its share of the whole. The colours match the slices." },
    ],
    explore: [
      { id: "click-slice", target: "@legend", title: "Click a slice or a chip",
        body: "Opens the students behind that part, e.g. everyone with at least one submission of that kind." },
    ],
  },
  trend: {
    read: [
      { id: "weeks", quick: true, target: "@body", title: "Week by week, left to right",
        body: (ctx) => `Each point is one ${ctx.data?.interval === "day" ? "day" : "week"}; the newest is on the right, with its value at the end of the line. The lines: ${(ctx.data?.series || []).map((series) => series.name).join(", ")}.` },
      { id: "latest", target: (ctx) => ({ series: 0, index: Math.max(0, (ctx.data?.labels?.length || 1) - 1) }), title: "The latest week",
        body: (ctx) => {
          const series = ctx.data?.series?.[0];
          const values = series?.values || [];
          return series ? `${series.name} in the latest ${ctx.data.interval === "day" ? "day" : "week"}: ${num(values.at(-1))}, against ${num(values.at(-2))} the one before.` : "The newest point is on the right.";
        } },
      { id: "hover", target: "@body", title: "Hover anywhere for the numbers",
        body: "Move the pointer across the chart: a guide line snaps to the nearest week and one card lists every line's value. The pin marks the busiest week." },
    ],
    explore: [
      { id: "click-week", target: "@body", title: "Click a week",
        body: "Lists the students who were active that week, with how much each did." },
    ],
  },
  funnel: {
    read: [
      { id: "steps", quick: true, target: "@funnel-step-0", title: "Steps from top to bottom",
        body: (ctx) => `Each row is one step: ${(ctx.data?.stages || []).map((stage) => stage.name).join(" → ")}. Every student who reaches a step is counted there.` },
      { id: "figures", target: "@funnel-figures-0", when: (ctx) => Boolean(ctx.data?.drops?.length), title: "Students and % of all",
        body: "On the right: how many students reached the step, and what share of everyone (the first step) that is." },
      { id: "width", target: "@funnel-step-1", when: (ctx) => Boolean(ctx.data?.drops?.length), title: "The band narrows",
        body: "The band's width shows the share visually, so the steps where students fall away jump out." },
      ...[1, 2, 3, 4].map((at) => ({
        id: `gap-${at}`, target: `@funnel-gap-${at}`, quick: at === 1, when: (ctx) => Boolean(ctx.data?.drops?.[at - 1]),
        title: (ctx) => `Gap ${at}: ${ctx.data.drops[at - 1].label || `${ctx.data.drops[at - 1].from} → ${ctx.data.drops[at - 1].to}`}`,
        body: (ctx) => {
          const drop = ctx.data.drops[at - 1];
          const before = ctx.data.stages[at - 1]?.value;
          return drop.students ? `${plural(drop.students, "student")} (${pct(drop.students, before)}% of the step above) stopped here.` : "No one stopped between these two steps.";
        },
      })),
    ],
    explore: [
      { id: "spot", target: "@funnel-gap-1", when: (ctx) => ctx.data?.drops?.some((drop) => drop.students > 0), title: "“Spot the gap” lists exactly them",
        body: "Click the red button in any gap: the popup lists exactly the students who stopped there, with Email (a ready-made message for that gap), Download and “Filter page to these”." },
      { id: "step-click", target: "@funnel-step-0", title: "Click a step",
        body: "Lists everyone who reached that step." },
    ],
  },
  bubble: {
    read: [
      { id: "bubbles", quick: true, target: "@bubble-0", title: "One bubble each, bigger = more students",
        body: (ctx) => (first(ctx) ? `Each bubble is one ${String(ctx.data.itemLabel || "topic").toLowerCase()}. The biggest: ${first(ctx).name}, ${num(first(ctx).value)} ${ctx.data.valueLabel || "students"}.` : "Each bubble is one item; bigger means more students.") },
      { id: "groups", target: "@bubble-legend", title: "Size and colour groups",
        body: "Bubbles of the same count share a size and colour. The legend says each group's student count and how many bubbles are in it." },
      { id: "count", target: "@bubble-0", title: "The number inside",
        body: "Every bubble shows its student count; bigger ones show the name too. Hover for the exact figures." },
    ],
    explore: [
      { id: "click-bubble", target: "@bubble-0", title: "Click a bubble",
        body: "Lists the students behind it, ready to download or email. The Bars view shows the same as a ranked list." },
    ],
  },
  calendar: {
    read: [
      { id: "grid", quick: true, target: "@heat-grid", title: "One square per day, a year at a glance",
        body: "Columns are weeks, rows are weekdays (Mon at the top), months are separated by a small gap. The newest day is at the right." },
      { id: "legend", target: "@heat-legend", title: "Darker = more",
        body: (ctx) => `An empty square means nothing happened that day. The darker the blue, the more ${ctx.data?.unit || "activity"}.` },
      { id: "busiest", target: "@heat-busiest", when: (ctx) => Boolean(ctx.data?.days?.length), title: "The busiest day",
        body: (ctx) => {
          const best = maxBy(ctx.data.days, ([, value]) => value);
          return best ? `${new Date(`${best[0]}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}: ${num(best[1])} ${ctx.data.unit || ""}.` : "The darkest square.";
        } },
    ],
    explore: [
      { id: "click-day", target: "@heat-grid", title: "Click a day",
        body: "Hover any square for its count; click a day with activity to see who was active that day." },
    ],
  },
  radar: {
    read: [
      { id: "axes", quick: true, target: "@body", title: "One spoke per topic",
        body: "Each spoke is a topic. The further the shape reaches along a spoke, the more students have solved that topic." },
      { id: "shape", target: "@body", title: "Read the shape",
        body: "A round shape means even coverage; dents show the topics few students have touched." },
    ],
    explore: [{ id: "click-topic", target: "@body", title: "Click a topic name", body: "Lists the students who solved that topic." }],
  },
  histogram: {
    read: [
      { id: "bands", quick: true, target: (ctx) => ({ series: 0, index: Math.max(0, indexOfMax(ctx.data?.bins || [], (bin) => bin.count)) }), title: "How many students in each band",
        body: (ctx) => {
          const bins = ctx.data?.bins || [];
          const peak = maxBy(bins, (bin) => bin.count);
          return peak ? `Each bar is a range of ${ctx.data.label || "values"}; its height is the number of students in it. Most students (${num(peak.count)}) are in ${peak.label}.` : "Each bar is a range; its height is the number of students in it.";
        } },
      { id: "middle", target: "@body", title: "The middle student",
        body: "The caption at the top left names the band of the middle student (half the students are below, half above). The dashed line marks it." },
    ],
    explore: [{ id: "click-bar", target: (ctx) => ({ series: 0, index: Math.max(0, indexOfMax(ctx.data?.bins || [], (bin) => bin.count)) }), title: "Click a bar", body: "Lists the students in that band." }],
  },
  stackedBar: {
    read: [
      { id: "groups", quick: true, target: () => ({ series: 0, index: 0 }), title: "One bar per group",
        body: (ctx) => {
          const group = ctx.data?.groups?.[0];
          return group ? `Each bar is one group (here: ${group.label}); its parts are ${(ctx.data.series || []).join(", ")}.` : "Each bar is one group, split into parts.";
        } },
      { id: "legend", target: "@legend", title: "The parts and their totals",
        body: "The legend names each part and adds it up across all groups. The Percent view makes every bar 100% to compare shares." },
    ],
    explore: [{ id: "click-part", target: () => ({ series: 0, index: 0 }), title: "Click a part", body: "Lists exactly the students in that part of that group. A legend chip lists that part across every group." }],
  },
  heatmap: {
    read: [
      { id: "grid", quick: true, target: "@body", title: "Students down, columns across",
        body: (ctx) => `Each row is a student, each column a ${ctx.data?.columns ? "sheet" : "topic"}. The darker the cell, the more ${ctx.data?.unit || "they have done"}.` },
      { id: "scan", target: "@body", title: "Scan for gaps",
        body: "Pale columns are areas few students have started; pale rows are students who need a push." },
    ],
    explore: [{ id: "click-column", target: "@body", title: "Click a cell", body: "Lists the students in that column." }],
  },
  scatter: {
    read: [
      { id: "dots", quick: true, target: "@body", title: "One dot per student",
        body: (ctx) => `Across: ${ctx.data?.xLabel || "one measure"}. Up: ${ctx.data?.yLabel || "another"}. The dashed lines mark the middle student on each.` },
      { id: "quadrants", target: "@body", title: "Four corners",
        body: "Top-right: high on both. Bottom-right: lots of effort, little result (needs help). Top-left: strong with little effort." },
    ],
    explore: [{ id: "click-dot", target: "@body", title: "Click a dot", body: "Opens that student." }],
  },
  boxplot: {
    read: [
      { id: "box", quick: true, target: () => ({ series: 0, index: 0 }), title: "A box per group",
        body: "The box holds the middle half of the group's students; the line inside is the middle student; the whiskers reach the lowest and highest." },
      { id: "compare", target: "@body", title: "Compare groups",
        body: "A higher box means the group does better; a taller box means students in it differ more." },
    ],
    explore: [{ id: "click-box", target: () => ({ series: 0, index: 0 }), title: "Click a box", body: "Lists that group's students." }],
  },
  rings: {
    read: [
      { id: "rings", quick: true, target: "@rings", title: "One ring per difficulty",
        body: (ctx) => `Each ring fills to the share of questions solved: ${(ctx.data?.items || []).map((item) => `${item.label} ${item.value}%`).join(", ")}. The middle shows the best one.` },
      { id: "legend", target: "@ring-row-0", title: "The numbers behind each ring",
        body: "Each row: solved out of started questions, and how many students solved at least one." },
    ],
    explore: [{ id: "click-ring", target: "@ring-row-0", title: "Click a ring or a row", body: "Lists the students who solved a question of that difficulty." }],
  },
  combo: {
    read: [
      { id: "bars", quick: true, target: () => ({ series: 0, index: 0 }), title: "Bars count, lines rate",
        body: (ctx) => `Bars (left axis) count ${ctx.data?.barLabel || "students"}: ${(ctx.data?.bars || []).map((bar) => bar.name).join(", ")}. Lines (right axis, %): ${(ctx.data?.lines || []).map((line) => line.name).join(", ")}.` },
      { id: "hover", target: "@body", title: "Hover a column", body: "One card lists every bar and line for that column, with a note like “x of y students it is open to”." },
    ],
    explore: [{ id: "click-bar", target: () => ({ series: 0, index: 0 }), title: "Click a bar", body: "Lists the students in that part; a line point lists the whole column." }],
  },
};
