// What each Prep Coding and Quick Prep chart means, how its numbers are counted (matching the
// server, modules/prepAnalysis/charts.js) and the follow-up it suggests. Schema: see buildGuide.js.
import { maxBy, minBy, num, pct, plural } from "./format.js";

const chip = (ctx, key) => ctx.data?.chips?.find((entry) => entry.key === key);
const openChip = (key, verb) => (ctx) => {
  const group = chip(ctx, key);
  return group?.value ? { label: `${verb} these ${num(group.value)} students`, part: { key, label: group.label, value: group.value, unit: "students", students: group.value } } : null;
};
const biggestGap = (ctx) => maxBy((ctx.data?.drops || []).filter((drop) => drop.students > 0), (drop) => drop.students);
const openBiggestGap = (ctx) => {
  const drop = biggestGap(ctx);
  return drop ? { label: `List the ${num(drop.students)} students: ${drop.label || "this gap"}`, part: { key: drop.key, label: drop.label, value: drop.students, unit: "students", students: drop.students } } : null;
};
const openFirstItem = (verb) => (ctx) => {
  const item = ctx.data?.items?.[0];
  return item?.key ? { label: `${verb}: ${item.name}`, part: { key: item.key, label: item.name, value: item.value, unit: ctx.data.valueLabel, students: item.students } } : null;
};
const histogramNew = [{ title: "Cleaner bars", body: "The running-share line is gone: just the bars, the count on each, and a “Middle student” caption at the top left.", target: "@body" }];

export const MAIN_CHART_GUIDES = {
  // ---------------------------------------------------------------- Prep Coding
  "top-students": {
    counted: "Students who practised, ranked by their stored Prep Score (the same score the Rankings page uses). Each bar splits that score into the points from Easy, Medium and Hard problems.",
    meaning: [
      { quick: true, title: "Who is setting the pace", target: "@body", body: (ctx) => {
        const items = ctx.data?.items || [];
        const hard = items.filter((item) => (item.segments?.Hard || 0) > 0).length;
        return items.length ? `${plural(hard, "student")} of the top ${items.length} earn points from Hard problems. Students with only green bars are solving Easy problems and are ready for Medium.` : "The leaders of the cohort, by Prep Score.";
      } },
      { title: "Use it to pick peer mentors", body: "Top students with a balanced bar (all three colours) are good peer mentors or placement-drive leads." },
    ],
    whatsNew: [{ title: "Full width and medal badges", body: "This chart now runs the full width: gold, silver and bronze badges for the top three, rounded bars and a tooltip with problems solved per difficulty.", target: "@body" }],
  },
  "difficulty-split": {
    counted: "Problems first solved (accepted) in the period, split by difficulty.",
    meaning: [{ quick: true, title: "The mix of difficulty", body: "A healthy cohort moves from mostly Easy towards Medium. A tiny Hard slice is normal early on." }],
  },
  "submission-trend": {
    counted: "Every coding submission in the period up to today, accepted (passed every test) or not. Each part also counts how many students made at least one such submission.",
    meaning: [{ quick: true, title: "How often code passes", target: "@legend", body: (ctx) => {
      const items = ctx.data?.items || [];
      const ok = items.find((item) => item.key === "Accepted")?.value || 0;
      const total = items.reduce((sum, item) => sum + item.value, 0);
      return total ? `${pct(ok, total)}% of submissions are accepted. Below 30% usually means students submit without testing; very high can mean only easy problems are tried.` : "Accepted versus not accepted submissions.";
    } }],
    action: (ctx) => {
      const failing = ctx.data?.items?.find((item) => item.key === "Not accepted");
      return failing?.students ? { label: `See the ${num(failing.students)} students with failing submissions`, part: { key: "Not accepted", label: "Not accepted submissions", value: failing.value, unit: "submissions", students: failing.students } } : null;
    },
  },
  "practice-trend": {
    counted: "Per week: coding submissions, accepted submissions, and (dashed, right axis) how many different students submitted that week.",
    meaning: [
      { quick: true, title: "Is practice growing?", target: "@body", body: (ctx) => {
        const students = ctx.data?.series?.find((series) => series.axis === "right")?.values || [];
        return students.length > 1 ? `${num(students.at(-1))} students practised in the latest week, against ${num(students.at(-2))} the week before. Watch the dashed line: it is people, not submissions.` : "Watch the dashed line: it counts students, not submissions.";
      } },
      { title: "Dips are a signal", body: "A drop after an exam week or holiday is normal; a steady decline over several weeks means the cohort needs a push (a contest, a reminder email)." },
    ],
  },
  "practice-funnel": {
    counted: "All students in view, then those who submitted any code, solved at least one problem, solved a Medium, and solved a Hard. Each gap counts exactly the students who reached the step above but not the next one.",
    meaning: [
      { quick: true, title: "Where most students stop", target: "@body", body: (ctx) => {
        const drop = biggestGap(ctx);
        return drop ? `The biggest gap is “${drop.label}”: ${plural(drop.students, "student")}. That is the step to work on first.` : "The biggest gap is the step to work on first.";
      } },
    ],
    action: openBiggestGap,
    whatsNew: [
      { title: "Plain step names", body: "“Practice journey” (was “How far students get”) with steps like “Tried a problem” and gaps named in plain words.", target: "@funnel-step-0" },
      { title: "A ready email per gap", body: "Email from a gap's list now suggests a message written for exactly that gap, and the editor opens as plain text with a live preview.", target: "@funnel-gap-1" },
    ],
  },
  "topic-strength": {
    counted: "Every topic at least one student has solved a problem in. A bubble's number is how many students solved at least one problem of that topic (first accepted solve).",
    meaning: [
      { quick: true, title: "Covered and missing topics", target: "@bubble-legend", body: (ctx) => {
        const items = ctx.data?.items || [];
        const thin = items.filter((item) => item.value <= 1).length;
        return items.length ? `${plural(thin, "topic")} have only one student solving. Topics placement tests ask often (Arrays, Strings, DP, Graphs) should not be among the smallest.` : "Small bubbles are the topics to push.";
      } },
    ],
    whatsNew: [{ title: "Up to 8 groups", body: "Bubbles now group by the real student counts: up to eight sizes and colours, with the count range in the legend.", target: "@bubble-legend" }],
  },
  "needs-attention": {
    counted: "Bars: students who practised before but made no submission in the last 14 days, longest away first. “Never practised”: students with no coding submission at all.",
    meaning: [
      { quick: true, title: "Who to nudge", target: "@legend", body: (ctx) => {
        const stopped = chip(ctx, "listed")?.value || 0;
        const never = chip(ctx, "never")?.value || 0;
        return `${num(stopped)} stopped and ${num(never)} never started. Students who stopped are the easiest to bring back: they already know the platform.`;
      } },
    ],
    action: openChip("never", "Reach out to"),
  },
  "activity-calendar": {
    counted: "Coding submissions per day, all students in view together, for the last 12 months.",
    meaning: [{ quick: true, title: "Rhythm, not one-off spikes", target: "@heat-grid", body: "Steady daily colour is what builds placement readiness. Long pale stretches are where reminders or a weekly contest help." }],
    whatsNew: [{ title: "Months, full width", body: "The heat map now fills the card, each month is its own block with a small gap, and the colours are stronger.", target: "@heat-grid" }],
  },
  "student-profile": {
    counted: "For the students in view: the share who solved at least one problem in each topic. Pick a student in Settings to compare them with the group.",
    meaning: [{ quick: true, title: "Spot the weak topics", body: "Dents in the shape are topics few students have solved: good candidates for the next class or sheet." }],
  },
  "failure-reasons": {
    counted: "Every submission that did not pass, by its result: wrong answer, time limit, runtime error, compile error and so on.",
    meaning: [{ quick: true, title: "What to teach next", target: "@legend", body: (ctx) => {
      const top = maxBy(ctx.data?.items || [], (item) => item.value);
      return top ? `The most common failure is ${top.name}. Wrong answers point to logic and edge cases; time limits to algorithm choice; compile errors to language basics.` : "Wrong answers point to logic; time limits to algorithm choice.";
    } }],
  },
  "language-usage": {
    counted: "How many students submitted at least once in each language. A student using two languages counts in both, so shares can add up to more than 100%.",
    meaning: [{ quick: true, title: "Plan sessions by language", body: "Use the biggest languages for examples in classes and editorial solutions." }],
  },
  "score-spread": {
    counted: "Students who practised, grouped by Prep Score. The bands widen as scores grow because Prep Score has no upper limit.",
    meaning: [{ quick: true, title: "Where the cohort sits", body: "Most students in the first bands is normal early in a semester; a growing right side over weeks is the goal." }],
    whatsNew: histogramNew,
  },
  "tough-problems": {
    counted: "Problems with failed attempts (submissions that did not pass), most failures first. The note says how many of the students who tried it solved it.",
    meaning: [{ quick: true, title: "Problems worth a class", target: "@body", body: (ctx) => {
      const item = ctx.data?.items?.[0];
      return item ? `“${item.name}” has ${num(item.value)} failed attempts; ${item.note}. A short walkthrough of the top few unblocks many students at once.` : "The top problems are worth a walkthrough in class.";
    } }],
    action: openFirstItem("See who struggles with"),
  },
  "group-breakdown": {
    counted: "Problems solved (first accepted) by the students of each semester, branch, section, group or campus, split by difficulty. Change the grouping in Settings.",
    meaning: [{ quick: true, title: "Compare classes fairly", body: "Bigger classes solve more in total; open the Percent view to compare the mix instead of the size." }],
  },
  "topic-heatmap": {
    counted: "For the top students by Prep Score: problems solved in each of the 12 most-solved topics.",
    meaning: [{ quick: true, title: "Even the leaders have gaps", body: "Pale cells in the top rows show topics even strong students skip: good topics for advanced sessions." }],
  },
  "student-map": {
    counted: "One dot per student who practised: submissions across, Prep Score up. Dashed lines mark the middle student on each.",
    meaning: [{ quick: true, title: "Effort without results", target: "@body", body: "Dots far right but low are students who submit a lot and score little: they need guidance more than motivation." }],
  },
  "class-spread": {
    counted: "Prep Scores of the students who practised, per class (semester by default; change it in Settings).",
    meaning: [{ quick: true, title: "Which class needs help", body: "A low box is a class behind; a tall box is a class with a big gap between its strongest and weakest students." }],
  },

  // ---------------------------------------------------------------- Quick Prep
  "quickprep-sheet-bubbles": {
    counted: "Every Quick Prep sheet at least one student opened. A bubble's number is how many students started it; the tooltip adds how many finished it.",
    meaning: [{ quick: true, title: "Popular and ignored sheets", target: "@bubble-legend", body: (ctx) => {
      const items = ctx.data?.items || [];
      const top = items[0];
      return top ? `${top.name} is the most worked-on sheet (${num(top.value)} started, ${top.detail}). Small bubbles are sheets to promote or retire.` : "Small bubbles are sheets to promote or retire.";
    } }],
    whatsNew: [{ title: "New chart", body: "Each sheet as a bubble, sized and coloured by how many students started it. Click one for its students.", target: "@bubble-0" }],
  },
  "quickprep-difficulty-rings": {
    counted: "Across the sheets each student started: the share of their Easy, Medium and Hard questions they solved.",
    meaning: [{ quick: true, title: "Where students get stuck", target: "@rings", body: (ctx) => {
      const low = minBy(ctx.data?.items || [], (item) => item.value);
      return low ? `${low.label} has the lowest solve rate (${low.value}%). A big drop from Easy to Medium means students need help with the step up.` : "A big drop from Easy to Medium means students need help with the step up.";
    } }],
    whatsNew: [{ title: "New: progress rings", body: "Solve rate by difficulty is now three rings with their numbers beside them.", target: "@rings" }],
  },
  "quickprep-sheets": {
    counted: "For each published sheet: students it is open to who finished it, are working on it, or have not started.",
    meaning: [{ quick: true, title: "Sheets nobody opens", body: "A bar that is mostly “Not started” is a sheet students do not know about: mention it in class or email them." }],
  },
  "quickprep-matrix": {
    counted: "For the students furthest ahead: the share of each sheet's questions they solved, for the 12 most-started sheets.",
    meaning: [{ quick: true, title: "Who is ahead where", body: "Dark rows are your strongest sheet users; empty cells show sheets they have not touched yet." }],
  },
  "quickprep-leaders": {
    counted: "Students ranked by sheets finished (every question solved), then by questions solved.",
    meaning: [{ quick: true, title: "Recognise finishers", body: "Finishing a sheet takes steady effort; these students are good to recognise publicly." }],
  },
  "quickprep-funnel": {
    counted: "All students in view, then those who opened a sheet, solved a question, got past half of a sheet, and finished a sheet. Each gap counts exactly who reached the step above but not the next.",
    meaning: [{ quick: true, title: "Where sheet users stop", target: "@body", body: (ctx) => {
      const drop = biggestGap(ctx);
      return drop ? `The biggest gap is “${drop.label}”: ${plural(drop.students, "student")}.` : "The biggest gap is the step to work on first.";
    } }],
    action: openBiggestGap,
    whatsNew: [{ title: "Sheet journey", body: "The funnel now has slim bands, plain step names and “Spot the gap” lists between steps.", target: "@funnel-gap-1" }],
  },
  "quickprep-spread": {
    counted: "Students who started a sheet, grouped by the share of their started sheets' questions they solved.",
    meaning: [{ quick: true, title: "Starting versus finishing", body: "Many students in the low bands means sheets are opened but not worked through." }],
    whatsNew: histogramNew,
  },
  "quickprep-needs-attention": {
    counted: "Bars: students who started sheets, lowest progress first. “Never opened a sheet”: students with sheets open to them who never opened one.",
    meaning: [{ quick: true, title: "Who is stuck in sheets", target: "@legend", body: "Students with low progress started but stalled: a reminder or a study partner helps most here." }],
    action: openChip("never", "Reach out to"),
  },
  "quickprep-sheet-health": {
    counted: "For each sheet: students who finished it or are working on it (bars), how far starters get on average, and what share of the students it is open to started it (lines).",
    meaning: [{ quick: true, title: "A healthy sheet", target: "@body", body: "High start rate and high average progress: students find it and finish it. A high start rate with low progress means the sheet may be too hard or too long." }],
  },
  "quickprep-difficulty-mix": {
    counted: "Across the sheets students started: Easy, Medium and Hard questions solved and not yet solved, with the solve rate.",
    meaning: [{ quick: true, title: "The step up", body: "Compare the solve rate from Easy to Hard; a steep fall marks where students need support." }],
  },
  "quickprep-hardest-questions": {
    counted: "Sheet questions with the lowest share solved among the students who started that sheet. The bar's students are those still stuck on it.",
    meaning: [{ quick: true, title: "Questions worth a hint", target: "@body", body: (ctx) => {
      const item = ctx.data?.items?.[0];
      return item ? `“${item.name}”: ${item.value}% of starters solved it, ${plural(item.students, "student")} stuck.` : "The top questions are where a hint or walkthrough helps most.";
    } }],
    action: openFirstItem("See who is stuck on"),
  },
  "quickprep-pace": {
    counted: "Students who finished at least one sheet, by their average time from starting a sheet to finishing it.",
    meaning: [{ quick: true, title: "How long sheets take", body: "Use it to set realistic deadlines when you assign a sheet." }],
    whatsNew: histogramNew,
  },
  "quickprep-own-work": {
    counted: "Every first solve of a sheet question: solved normally, unusually fast, or with most of the code pasted.",
    meaning: [{ quick: true, title: "Integrity at a glance", target: "@legend", body: "A small “mostly pasted” share is normal. A large one is a reason to review those students, not proof of copying." }],
  },
  "quickprep-trend": {
    counted: "Per week: sheets started and sheets finished by the students in view.",
    meaning: [{ quick: true, title: "Starts should turn into finishes", body: "If starts rise but finishes stay flat, students are opening sheets without completing them." }],
  },
  "quickprep-by-class": {
    counted: "Students of each class (semester by default) who finished a sheet, are working on one, or have not started.",
    meaning: [{ quick: true, title: "Classes to nudge", body: "A class with a large “Not started” part is the one to talk to." }],
  },
  "quickprep-class-spread": {
    counted: "Sheet progress (share of started sheets' questions solved) of the students who started a sheet, per class.",
    meaning: [{ quick: true, title: "Compare classes", body: "A low box is a class behind in sheets; a tall box means a wide gap inside the class." }],
  },
  "quickprep-coverage": {
    counted: "Students with sheets open to them, by the share of those sheets they have started.",
    meaning: [{ quick: true, title: "Reach of your sheets", body: "Most students near 0% means sheets are not reaching them: share the sheet links or assign them." }],
    whatsNew: histogramNew,
  },
  "quickprep-calendar": {
    counted: "Sheets started plus sheets finished per day, all students in view together.",
    meaning: [{ quick: true, title: "When students use sheets", target: "@heat-grid", body: "Busy days often follow a class or an email; quiet weeks are the time for a reminder." }],
  },
};
