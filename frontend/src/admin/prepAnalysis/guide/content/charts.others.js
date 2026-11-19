// What each Prep Learning, Prep Interview and Prep Assessment chart counts, what it means for an
// admin, and one suggested next step. Every rule in `counted` mirrors the server's own counting
// (backend/src/modules/prepAnalysis/charts.js and the *Facts.js files); every `action` key is a
// part the server can list (featureDrills.js). How to read each chart type is in types.js.
// ".js" so plain Node can import this file too (Vite resolves it either way).
import { maxBy, num, pct, plural } from "./format.js";

const PASS = 40; // PASS_PERCENT in assessmentFacts.js

const list = (value) => (Array.isArray(value) ? value : []);
const chipOf = (ctx, key) => list(ctx.data?.chips).find((chip) => chip?.key === key);
const firstItem = (ctx) => list(ctx.data?.items)[0];
const groupsOf = (ctx) => list(ctx.data?.groups).filter((group) => group && group.values);
const binsOf = (ctx) => list(ctx.data?.bins);
const countBins = (ctx, from, to) => binsOf(ctx).slice(from, to).reduce((sum, bin) => sum + (Number(bin?.count) || 0), 0);
const totalOf = (values) => Object.values(values || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
const activeDays = (ctx) => list(ctx.data?.days).filter((day) => Array.isArray(day) && Number(day[1]) > 0).length;
const seriesValues = (ctx, name) => list(list(ctx.data?.series).find((series) => series?.name === name)?.values);

// ---- funnels
// The biggest gap between two steps. Only pairs where every student of the lower step is also in
// the upper one are considered (`nested`: index of the lower step), so the gap is exactly
// upper − lower and matches the students the server lists for "lost:<index>".
function biggestGap(ctx, nested) {
  const stages = list(ctx.data?.stages);
  const gaps = nested
    .filter((at) => stages[at] && stages[at - 1])
    .map((at) => ({ at, lost: Math.max(0, (Number(stages[at - 1].value) || 0) - (Number(stages[at].value) || 0)), before: Number(stages[at - 1].value) || 0, from: stages[at - 1].name, to: stages[at].name }));
  const best = maxBy(gaps, (gap) => gap.lost);
  return best && best.lost > 0 ? best : null;
}
const gapBody = (nested, fallback) => (ctx) => {
  const gap = biggestGap(ctx, nested);
  return gap
    ? `The biggest drop is between “${gap.from}” and “${gap.to}”: ${plural(gap.lost, "student")} (${pct(gap.lost, gap.before)}% of the step above) stop there. That is the step to work on first.`
    : fallback;
};
const gapAction = (nested) => (ctx) => {
  const gap = biggestGap(ctx, nested);
  if (!gap) return null;
  return {
    label: `List the ${plural(gap.lost, "student")} who stopped before “${gap.to}”`,
    // Same label the server gives this part (featureDrills.js funnelDrill).
    part: { key: `lost:${gap.at}`, label: `Reached “${gap.from}”, not “${gap.to}”`, value: gap.lost, unit: "students", students: gap.lost },
  };
};

// ---- "needs attention" lists
// `order`: how the bars are sorted, in words.
const chipsBody = (ctx, { startedWord, neverWord, order, fallback }) => {
  const listed = chipOf(ctx, "listed");
  const never = chipOf(ctx, "never");
  if (!listed && !never) return fallback;
  const listedCount = Number(listed?.value) || 0;
  const neverCount = Number(never?.value) || 0;
  const lead = `${plural(listedCount, "student")} ${startedWord}; ${plural(neverCount, "student")} ${neverWord}.`;
  return neverCount > listedCount
    ? `${lead} More students have not started than have, so getting them to begin matters more than the bars.`
    : `${lead} The bars list the first group, ${order}.`;
};
const neverAction = (text) => (ctx) => {
  const never = chipOf(ctx, "never");
  const count = Number(never?.value) || 0;
  if (!count) return null;
  return { label: `${text} (${num(count)})`, part: { key: "never", label: never.label || "Never started", value: count, unit: "students", students: count } };
};

// ---- stacked bars: the group with the largest count (or share) of one series
const topGroupBy = (ctx, read) => {
  const best = maxBy(groupsOf(ctx), read);
  return best && read(best) > 0 ? best : null;
};
const seriesPart = (group, series) => {
  const value = Number(group.values?.[series]) || 0;
  return { key: `${group.label}|${series}`, label: `${group.label} · ${series}`, value, unit: "students", students: value };
};

const AVERAGE_TAIL = " An average from one attempt says less than one from several, so check the count in each note.";
const leaderBody = (unitWord, fallback, tail = AVERAGE_TAIL) => (ctx) => {
  const top = firstItem(ctx);
  if (!top) return fallback;
  return `${top.name} leads with ${num(top.value)}${unitWord}${top.note ? ` (${top.note})` : ""}.${tail}`;
};

const STOPPED_TAIL = " Long empty stretches show when students stopped, for example around exams or holidays; a few dark days with gaps between them mean activity comes in bursts.";
// `lead(days)`: the first sentence, e.g. "Topics were completed on 40 days in the year shown."
const calendarBody = (lead, fallback, tail = STOPPED_TAIL) => (ctx) => {
  const days = activeDays(ctx);
  return days ? `${lead(plural(days, "day"))}${tail}` : fallback;
};

export const OTHER_CHART_GUIDES = {
  // ------------------------------------------------------------ Prep Learning
  "learning-leaders": {
    counted: "Students who started learning in the period, ranked by how many topics they completed in it. A student can study the topics of their own semester and every earlier one; the note shows completed topics as a share of all of those.",
    meaning: [
      { quick: true, target: "@body", title: "Who has done the most",
        body: leaderBody(" topics completed", "The student at the top completed the most topics in the period. Hover a bar for the share of their course that is.", "") },
      { title: "Compare the %, not only the count",
        body: "A student in a higher semester has more topics open to them, so a big count can still be a small share. The % in the note is the fairer way to compare students from different semesters." },
    ],
  },
  "learning-funnel": {
    counted: "Students with Prep Learning data. “Started learning” means they opened or completed at least one topic in the period; the % steps are topics completed in the period out of all topics open to them (their semester and earlier).",
    meaning: [
      { quick: true, target: "@body", title: "Where students stop",
        body: gapBody([1, 2, 3, 4], "Each step keeps only the students who got that far; the biggest drop between two steps is where to act.") },
      { title: "Starting is the first hurdle",
        body: "If “Started learning” is far below “Students”, the problem is getting students to open the course at all, not how far they go once they start." },
    ],
    action: gapAction([1, 2, 3, 4]),
  },
  "learning-subjects": {
    counted: "For every subject open to a student (their semester and earlier), each student with Prep Learning data counts once: Finished if they completed every topic of it in the period, In progress if they opened or completed any topic, otherwise Not started. Up to 14 subjects, the most active first.",
    meaning: [
      { quick: true, target: "@body", title: "The subject most students have not started",
        body: (ctx) => {
          const group = topGroupBy(ctx, (item) => Number(item.values["Not started"]) || 0);
          if (!group) return "Long Not started parts show subjects few students have opened; those need a push from the subject's teacher.";
          const total = Number(group.students) || totalOf(group.values);
          return `${group.label}: ${num(group.values["Not started"])} of ${plural(total, "student")} have not started it (${pct(group.values["Not started"], total)}%).`;
        } },
      { title: "Earlier subjects are open to more students",
        body: "A subject from an earlier semester is open to every later semester too, so its bar is longer. Use the Percent view to compare subjects fairly." },
    ],
    action: (ctx) => {
      const group = topGroupBy(ctx, (item) => Number(item.values["Not started"]) || 0);
      return group ? { label: `Who has not started ${group.label}`, part: seriesPart(group, "Not started") } : null;
    },
  },
  "learning-trend": {
    counted: "Each week (starting Monday) adds up the topics students completed that week; “Students learning” counts the students who completed at least one topic that week. It shows up to the latest 26 weeks that had a completion.",
    meaning: [
      { quick: true, target: "@body", title: "How much each learner does",
        body: (ctx) => {
          const topics = seriesValues(ctx, "Topics completed");
          const students = seriesValues(ctx, "Students learning");
          const lastTopics = Number(topics.at(-1)) || 0;
          const lastStudents = Number(students.at(-1)) || 0;
          return lastStudents
            ? `In the latest week, ${plural(lastStudents, "student")} completed ${plural(lastTopics, "topic")}, about ${num(Math.round((lastTopics / lastStudents) * 10) / 10)} each.`
            : "Compare the two lines to see whether more students are learning or the same students are doing more.";
        } },
      { title: "More students, or the same few?",
        body: "A rising Students line means more students are taking part. A rising Topics line with a flat Students line means the same few students are doing more while the rest stay away." },
    ],
  },
  "learning-spread": {
    counted: "Students who started learning in the period, grouped in 10% bands of their course completed: topics completed in the period out of all topics open to them (their semester and earlier).",
    meaning: [
      { quick: true, target: "@body", title: "Started, but barely",
        body: (ctx) => {
          const total = countBins(ctx, 0, 10);
          if (!total) return "A tall first bar means many students opened the course but stopped early.";
          const low = countBins(ctx, 0, 1);
          return `${num(low)} of the ${plural(total, "student")} who started have completed less than 10% of their course (${pct(low, total)}%).`;
        } },
      { title: "Who is not here",
        body: "Students who never started are left out of this chart; “Students behind in learning” counts them." },
    ],
  },
  "learning-needs-attention": {
    counted: "Bars: students who opened or completed a topic in the period, the lowest share of their course completed first. “Never started” counts students with Prep Learning data who did neither; they are not drawn as bars.",
    meaning: [
      { quick: true, target: "@legend", title: "Started versus never started",
        body: (ctx) => chipsBody(ctx, { startedWord: "started learning", neverWord: "never started", order: "the lowest share of their course first", fallback: "The two chips split students into those who started learning and those who never did. Click a chip to list them." }) },
      { target: "@body", title: "Behind, or stopped?",
        body: "Hover a bar for the last lesson. A low % with a recent lesson is a student who is working but behind; a low % and no lesson for weeks is a student who has stopped." },
    ],
    action: neverAction("List students who never started"),
  },
  "learning-calendar": {
    counted: "Each day's square is the number of topics students in view completed that day, over the year that ends on the period's last day. Days outside the selected period stay empty.",
    meaning: [
      { quick: true, target: "@body", title: "When students learn",
        body: calendarBody((days) => `Topics were completed on ${days} in the year shown.`,"Darker days are days when students completed more topics. Long empty stretches show when learning stopped.") },
    ],
  },

  // ------------------------------------------------------------ Prep Interview
  "interview-funnel": {
    counted: "Interviews done = mock interviews in which the student was interviewed and got feedback, plus AI interviews they completed, in the period. The score steps use the student's best mock interview score (out of 100, from the interviewer's feedback); AI interview scores are not included.",
    meaning: [
      { quick: true, target: "@body", title: "Where students stop",
        body: gapBody([1, 2, 4], "Each step counts the students who got that far; the biggest drop is where to act.") },
      { title: "The score steps count mock interviews only",
        body: "A student who only did AI interviews can never reach the 60%+ step, because AI interview scores are not read here. A small score step can mean few mock interviews, not weak students." },
    ],
    action: gapAction([1, 2, 4]),
  },
  "interview-ratings": {
    counted: "For each of the five skills an interviewer rates in a mock interview (1 to 5), the bar counts every rating given in the period: one student with three mocks adds three ratings. Mock interviews without these ratings are left out.",
    meaning: [
      { quick: true, target: "@body", title: "The weakest skill",
        body: (ctx) => {
          const share = (group) => {
            const total = totalOf(group.values);
            return total ? ((Number(group.values["Rated 1"]) || 0) + (Number(group.values["Rated 2"]) || 0)) / total : 0;
          };
          const weakest = topGroupBy(ctx, share);
          if (!weakest) return "Long 1 and 2 parts show the skills students are rated weakest in; that is where to coach.";
          const total = totalOf(weakest.values);
          const low = (Number(weakest.values["Rated 1"]) || 0) + (Number(weakest.values["Rated 2"]) || 0);
          return `${weakest.label} has the largest share of low ratings: ${num(low)} of ${plural(total, "rating")} (${pct(low, total)}%) are 1 or 2.`;
        } },
      { title: "Ratings, not students",
        body: "Bars count ratings, not students: one student with many mocks adds many ratings. Compare the colours within each bar, or use the Percent view." },
    ],
  },
  "interview-leaders": {
    counted: "Students with at least one mock interview in the period, ranked by the average of their mock interview scores (out of 100); ties go to the student with more mocks. AI interviews appear in the note but do not change the score.",
    meaning: [
      { quick: true, target: "@body", title: "Who interviews best",
        body: leaderBody("%", "The student at the top has the highest average mock interview score. The note says how many mocks it rests on.") },
    ],
  },
  "interview-mix": {
    counted: "Adds up, across students in view, the mock interviews in which they were interviewed and got feedback, and the AI interviews they completed, in the period. Mock interviews where the student was the interviewer are not counted.",
    meaning: [
      { quick: true, target: "@legend", title: "Mock or AI",
        body: (ctx) => {
          const items = list(ctx.data?.items).filter((item) => Number(item?.value) > 0);
          const total = items.reduce((sum, item) => sum + Number(item.value), 0);
          const mock = Number(items.find((item) => item.key === "Mock")?.value) || 0;
          return total
            ? `${pct(mock, total)}% of the ${plural(total, "interview")} were mock interviews, the rest AI interviews.`
            : "The ring splits interviews done into mock interviews and AI interviews.";
        } },
      { title: "Only mock interviews have scores here",
        body: "Mock scores and skill ratings on this page come from mock interviews only. A mix that is mostly AI means those charts rest on few interviews." },
    ],
  },
  "interview-spread": {
    counted: "Students with at least one mock interview in the period, grouped in 10% bands of their own average mock interview score (out of 100).",
    meaning: [
      { quick: true, target: "@body", title: "Below the 60% step",
        body: (ctx) => {
          const total = countBins(ctx, 0, 10);
          if (!total) return "Bars on the left are students whose mock interviews go badly on average.";
          const low = countBins(ctx, 0, 6);
          return `${num(low)} of the ${plural(total, "student")} with a mock interview have an average below 60% (${pct(low, total)}%). 60% is the first score step of the interview journey.`;
        } },
      { title: "One mock can decide it",
        body: "A student with a single mock interview sits wherever that one score lands. Click a bar to see how many mocks each student has." },
    ],
  },
  "interview-needs-attention": {
    counted: "Bars: students who did at least one interview (mock or AI) in the period, the fewest first, then the lowest average mock score. “Never interviewed” counts students with none in the period; they are not drawn as bars.",
    meaning: [
      { quick: true, target: "@legend", title: "Interviewed versus never",
        body: (ctx) => chipsBody(ctx, { startedWord: "did an interview", neverWord: "never did one", order: "the fewest interviews first", fallback: "The two chips split students into those who did an interview and those who never did. Click a chip to list them." }) },
      { target: "@body", title: "Few, and long ago",
        body: "Hover a bar for the date of the last interview. One interview a long time ago is a student to book in again." },
    ],
    action: neverAction("List students who never interviewed"),
  },
  "interview-trend": {
    counted: "Each week (starting Monday) counts the mock interviews students received and the AI interviews they completed; “Students” counts the students with at least one of either that week. It shows up to the latest 26 weeks that had an interview.",
    meaning: [
      { quick: true, target: "@body", title: "The latest week",
        body: (ctx) => {
          const mocks = Number(seriesValues(ctx, "Mock interviews").at(-1)) || 0;
          const ai = Number(seriesValues(ctx, "AI interviews").at(-1)) || 0;
          const students = Number(seriesValues(ctx, "Students").at(-1)) || 0;
          return mocks + ai
            ? `In the latest week: ${plural(mocks, "mock interview")} and ${plural(ai, "AI interview")}, by ${plural(students, "student")}.`
            : "Compare the mock and AI lines week by week.";
        } },
      { title: "Feedback from a person",
        body: "Only mock interviews give students an interviewer's feedback. If AI interviews rise while mock interviews stay flat, students are practising without that feedback." },
    ],
  },
  "interview-calendar": {
    counted: "Each day's square counts the mock interviews students in view received and the AI interviews they completed that day, over the year that ends on the period's last day.",
    meaning: [
      { quick: true, target: "@body", title: "When students interview",
        body: calendarBody((days) => `Students did interviews on ${days} in the year shown.`,"Darker days had more interviews. Long empty stretches show when interview practice stopped.") },
    ],
  },

  // ------------------------------------------------------------ Prep Assessment
  "assessment-tests": {
    counted: `For up to 14 of the most recent tests (by start time), each student counts once: Passed if their latest graded attempt scored ${PASS}%+ of the marks, Failed if below, Missed if the test was meant for them, has ended and they did not take it. Attempts still being graded are not counted.`,
    meaning: [
      { quick: true, target: "@body", title: "The most missed test",
        body: (ctx) => {
          const group = topGroupBy(ctx, (item) => Number(item.values.Missed) || 0);
          if (!group) return "No test in view has missed students. Compare the Failed parts to find the hardest test.";
          const total = Number(group.students) || totalOf(group.values);
          return `${group.label}: ${num(group.values.Missed)} of ${plural(total, "student")} missed it (${pct(group.values.Missed, total)}%).`;
        } },
      { title: "Missed is not failed",
        body: "Many Missed students point to a reminder or timing problem; many Failed students point to a hard test or a weak topic. The Percent view compares tests of different sizes." },
    ],
    action: (ctx) => {
      const group = topGroupBy(ctx, (item) => Number(item.values.Missed) || 0);
      return group ? { label: `Who missed ${group.label}`, part: seriesPart(group, "Missed") } : null;
    },
  },
  "assessment-scores": {
    counted: `Up to 20 of the most recent tests (by start time). Each student who took a test is placed in a band by their latest graded score (% of the marks), or counted as Missed if it was meant for them, has ended and they did not take it. Below ${PASS}% is a fail.`,
    meaning: [
      { quick: true, target: "@body", title: "The test most students failed",
        body: (ctx) => {
          const share = (group) => {
            const took = totalOf(group.values) - (Number(group.values.Missed) || 0);
            return took ? (Number(group.values["Below 40%"]) || 0) / took : 0;
          };
          const worst = topGroupBy(ctx, share);
          if (!worst) return `No one in view scored below ${PASS}% in these tests.`;
          const took = totalOf(worst.values) - (Number(worst.values.Missed) || 0);
          return `${worst.label}: ${num(worst.values["Below 40%"])} of the ${plural(took, "student")} who took it scored below ${PASS}% (${pct(worst.values["Below 40%"], took)}%).`;
        } },
      { title: "Just over the line",
        body: `Students in the 40–60% band passed with little room to spare. Together with those below ${PASS}%, they are the group to revise with before the next test.` },
    ],
    action: (ctx) => {
      const share = (group) => {
        const took = totalOf(group.values) - (Number(group.values.Missed) || 0);
        return took ? (Number(group.values["Below 40%"]) || 0) / took : 0;
      };
      const worst = topGroupBy(ctx, share);
      return worst ? { label: `Who scored below ${PASS}% in ${worst.label}`, part: seriesPart(worst, "Below 40%") } : null;
    },
  },
  "assessment-by-class": {
    counted: "Counts tests, not students: for each class, the passed, failed and missed tests of its students who took or missed at least one test, added up. Up to 12 of the largest classes are shown.",
    meaning: [
      { quick: true, target: "@body", title: "The class that misses most",
        body: (ctx) => {
          const share = (group) => {
            const total = totalOf(group.values);
            return total ? (Number(group.values.Missed) || 0) / total : 0;
          };
          const group = topGroupBy(ctx, share);
          if (!group) return "No class in view has missed tests. Compare the Failed parts between classes.";
          const total = totalOf(group.values);
          return `${group.label} has the largest share of missed tests: ${num(group.values.Missed)} of ${plural(total, "test")} (${pct(group.values.Missed, total)}%).`;
        } },
      { title: "Bigger classes have longer bars",
        body: "Bars add up tests, so a large class always looks bigger. The Percent view compares pass, fail and miss shares fairly." },
    ],
  },
  "assessment-funnel": {
    counted: `Students with Prep Assessment data. “Took a test” means at least one graded attempt in the period; “Passed a test” means ${PASS}%+ of the marks in at least one; “Passed every test taken” means they took at least one and failed none (the latest attempt on each test counts).`,
    meaning: [
      { quick: true, target: "@body", title: "Where students stop",
        body: gapBody([1, 2, 3], "Each step counts the students who got that far; the biggest drop is where to act.") },
      { title: "The last step is consistency",
        body: "Students between “Passed a test” and “Passed every test taken” can pass but not every time; they are closer to ready than those who never passed." },
    ],
    action: gapAction([1, 2, 3]),
  },
  "assessment-leaders": {
    counted: "Students who took at least one graded test in the period, ranked by the average of their latest score on each test (% of the marks); ties go to the student who took more tests.",
    meaning: [
      { quick: true, target: "@body", title: "Who scores best",
        body: leaderBody("%", "The student at the top has the highest average test score. The note says how many tests it rests on and their best score.") },
    ],
  },
  "assessment-spread": {
    counted: `Students who took at least one graded test in the period, grouped in 10% bands of their own average score (the latest attempt on each test). The bands below ${PASS}% are under the pass mark.`,
    meaning: [
      { quick: true, target: "@body", title: "Below the pass mark",
        body: (ctx) => {
          const total = countBins(ctx, 0, 10);
          if (!total) return `Bars left of ${PASS}% are students whose average is below the pass mark.`;
          const low = countBins(ctx, 0, PASS / 10);
          return `${num(low)} of the ${plural(total, "student")} who took a test average below ${PASS}% (${pct(low, total)}%).`;
        } },
      { title: "One hump or two",
        body: "Two humps, one low and one high, mean the class is split into prepared and unprepared students. Help aimed at the low hump works better than the same revision for everyone." },
    ],
  },
  "assessment-score-time": {
    counted: `One dot per student per test: their latest graded attempt, with minutes taken across and score (% of the marks) up. The line marks the ${PASS}% pass mark. At most 600 dots are drawn.`,
    meaning: [
      { quick: true, target: "@body", title: "Fast and failed",
        body: (ctx) => {
          const dots = list(ctx.data?.items).filter((dot) => Number.isFinite(Number(dot?.x)) && Number.isFinite(Number(dot?.y)));
          const middle = Number(ctx.data?.medianX);
          if (!dots.length || !Number.isFinite(middle)) return `Dots low and on the left are attempts that ended quickly below ${PASS}%: students who may have given up or guessed.`;
          const fast = dots.filter((dot) => Number(dot.y) < PASS && Number(dot.x) < middle).length;
          return `${plural(fast, "attempt")} scored below ${PASS}% in less time than the middle attempt (${num(middle)} min). Quick low scores can mean a student gave up or guessed.`;
        } },
      { target: "@body", title: "Slow and failed",
        body: `Dots low and on the right took long and still scored below ${PASS}%: those students tried and need help with the topic itself.` },
    ],
  },
  "assessment-class-spread": {
    counted: `For each class (up to the 12 largest), the spread of its students' average test scores; only students who took a graded test in the period count. A pass is ${PASS}%.`,
    meaning: [
      { quick: true, target: "@body", title: "Classes below the pass mark",
        body: (ctx) => {
          const groups = list(ctx.data?.groups).filter((group) => group && Number(group.count) > 0);
          if (!groups.length) return `A box whose middle line sits below ${PASS}% is a class where most students average under the pass mark.`;
          const below = groups.filter((group) => Number(group.median) < PASS);
          return below.length
            ? `In ${plural(below.length, "class", "classes")} the middle student averages below ${PASS}%: ${below.slice(0, 3).map((group) => group.label).join(", ")}${below.length > 3 ? "…" : ""}.`
            : `In every class shown, the middle student averages ${PASS}% or more.`;
        } },
    ],
  },
  "assessment-needs-attention": {
    counted: "Bars: students who took or missed a test in the period, the most missed tests first, then the lowest average score. “No tests yet” counts students who neither took a graded test nor missed one; they are not drawn as bars.",
    meaning: [
      { quick: true, target: "@legend", title: "Took or missed, versus nothing yet",
        body: (ctx) => chipsBody(ctx, { startedWord: "took or missed a test", neverWord: "have no tests yet", order: "the most missed tests first", fallback: "The two chips split students into those who took or missed a test and those with none yet. Click a chip to list them." }) },
      { target: "@body", title: "Sorted by missed tests",
        body: "The bar is the average score, but the order is by missed tests first, so a student with a good average can still be near the top. Hover a bar for missed tests and the last test date." },
    ],
    action: neverAction("List students with no tests yet"),
  },
  "assessment-trend": {
    counted: `Each week (starting Monday) counts graded tests taken (the latest attempt on each test, by its submission date) and how many scored ${PASS}%+; “Students” counts the students who took one that week. It shows up to the latest 26 weeks that had a test.`,
    meaning: [
      { quick: true, target: "@body", title: "Pass share in the latest week",
        body: (ctx) => {
          const taken = Number(seriesValues(ctx, "Tests taken").at(-1)) || 0;
          const passed = Number(seriesValues(ctx, "Passed").at(-1)) || 0;
          return taken
            ? `In the latest week, ${num(passed)} of ${plural(taken, "test")} taken were passed (${pct(passed, taken)}%).`
            : "The gap between the Tests taken and Passed lines is the tests that were failed.";
        } },
      { title: "Tests come in waves",
        body: "Tests are scheduled, so busy and quiet weeks are normal. Compare the share passed between test weeks rather than the height of the lines." },
    ],
  },
  "assessment-calendar": {
    counted: "Each day's square counts the graded tests students in view submitted that day (the latest attempt on each test), over the year that ends on the period's last day. Days outside the selected period stay empty.",
    meaning: [
      { quick: true, target: "@body", title: "When tests are taken",
        body: calendarBody((days) => `Tests were submitted on ${days} in the year shown.`, "Darker days had more tests submitted. Tests are scheduled, so most days stay empty.",
          " Tests are scheduled, so empty days are normal; a test day lighter than you expect means many students did not take that test, or their answers are not graded yet.") },
    ],
  },
};
