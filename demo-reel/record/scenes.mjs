// One function per recorded scene. Each starts the capture only after the page
// has settled, then performs a short, deliberate tour timed to the voice-over.
import { openScene, activeScene } from "./lib.mjs";

const TWO_SUM = "6ababece7dd728ca2c932f2c";
const TWO_SUM_CPP = [
  "class Solution {",
  "public:",
  "    vector<int> twoSum(vector<int>& nums, int target) {",
  "        unordered_map<int, int> seen;",
  "        for (int i = 0; i < (int)nums.size(); i++) {",
  "            int need = target - nums[i];",
  "            if (seen.count(need)) return {seen[need], i};",
  "            seen[nums[i]] = i;",
  "        }",
  "        return {};",
  "    }",
  "};",
];

export const SCENES = {
  async "02-vision"() {
    const s = await openScene("02-vision", { role: "public" });
    await s.goto("/", { settle: 2500 });
    await s.start();
    await s.hold(1500);
    await s.scroll(700, { ms: 2200 });
    await s.hold(1200);
    await s.scroll(700, { ms: 2200 });
    await s.hold(1200);
    return s.finish({ minSeconds: 9 });
  },

  async "03-student-home"() {
    const s = await openScene("03-student-home", { role: "student" });
    await s.goto("/student/dashboard", { waitFor: "text=Coding progress", settle: 1500 });
    await s.start();
    await s.hold(900);
    await s.focus("text=Continue where you left off", { zoom: 1.25 });
    await s.hold(1500);
    await s.focus("text=Today's missions", { zoom: 1.3 });
    await s.hold(1500);
    await s.focus("text=Coding progress", { zoom: 1.3 });
    await s.hold(1400);
    await s.moveTo({ x: 800, y: 700 });
    await s.scroll(420, { ms: 1300 });
    await s.hold(1200);
    return s.finish({ minSeconds: 11 });
  },

  async "04-prep-coding"() {
    const s = await openScene("04-prep-coding", { role: "student" });
    // Warm-up: Monaco is lazy-loaded and slow from the dev server on a cold cache.
    await s.goto(`/problems/${TWO_SUM}`, { settle: 500 });
    await s.visible(".monaco-editor .view-lines").waitFor({ timeout: 90000 });
    await s.goto("/problems", { waitFor: "text=PrepCoding", settle: 1500 });
    await s.start();
    // "Problems are organised by topic and company"
    await s.hold(500);
    await s.focus(s.page.getByText("Companies", { exact: true }).first(), { zoom: 1.35 });
    await s.hold(1400);
    await s.focus(s.page.getByText("Topics", { exact: true }).first(), { zoom: 1.3 });
    await s.hold(1300);
    // "every one opens in a full code editor"
    await s.type("input[placeholder*='Search title']", "Two Sum", { delay: 70 });
    await s.hold(900);
    await s.click(s.page.getByText("Two Sum", { exact: true }).first(), { zoom: 1.3 });
    await s.page.waitForURL(`**/problems/${TWO_SUM}`, { timeout: 15000 });
    await s.visible(".monaco-editor .view-lines").waitFor({ timeout: 45000 });
    await s.hold(1400);
    // "Students write code in C++, Java, Python and more"
    await s.click(".monaco-editor .view-lines", { zoom: 1.45 });
    await s.page.keyboard.press("Control+A");
    await s.pasteLines(TWO_SUM_CPP, { lineMs: 260 });
    await s.page.keyboard.press("Escape");
    await s.hold(500);
    await s.focus("select", { zoom: 1.5, ms: 500 });
    await s.hold(900);
    // "run it against test cases, and submit"
    await s.click("button:has-text('Run')", { zoom: 1.5 });
    await s.visible("text=Cases: 3/3").waitFor({ timeout: 30000 });
    await s.focus("text=Cases: 3/3", { zoom: 1.45, ms: 500 });
    s.mark("run-passed");
    await s.hold(1600);
    await s.click("button:has-text('Submit')", { zoom: 1.5 });
    await s.visible("text=Congratulations").waitFor({ timeout: 60000 });
    s.mark("submit-accepted");
    await s.focus({ x: 960, y: 560 }, { zoom: 1.3, ms: 500 });
    await s.hold(3200);
    return s.finish();
  },
};

const WEEKLY_TEST = "6a9b1723d0b57c58c4577f10";
const exact = (s, text) => s.page.getByText(text, { exact: true });

Object.assign(SCENES, {
  async "05-assessments"() {
    const s = await openScene("05-assessments", { role: "admin" });
    // Warm Monaco, then reload so the recording starts on a settled page.
    await s.goto(`/admin/assessment/preview/${WEEKLY_TEST}`, { settle: 500 });
    await s.visible(".monaco-editor .view-lines").waitFor({ timeout: 120000 });
    await s.goto(`/admin/assessment/preview/${WEEKLY_TEST}`, { settle: 500 });
    await s.visible(".monaco-editor .view-lines").waitFor({ timeout: 120000 });
    await s.hold(800);
    await s.start();
    await s.hold(600);
    await s.focus("text=DURATION", { zoom: 1.5 });
    await s.hold(1300);
    await s.focus(s.page.locator("h1, h2").filter({ hasText: "Add Two Numbers" }).first(), { zoom: 1.3 });
    await s.hold(1300);
    await s.click({ x: 1836, y: 526 }, { zoom: 1.3 });
    await s.hold(1800);
    await s.click(exact(s, "Next"), { zoom: 1.3 });
    await s.cut(() => s.hold(2500));
    await s.hold(1500);
    return s.finish();
  },

  async "06a-anvi-schedule"() {
    const s = await openScene("06a-anvi-schedule", { role: "admin" });
    await s.goto("/admin/ai-interviews/schedules", { waitFor: "text=Amazon Intern Hiring", settle: 1200 });
    await s.start();
    await s.hold(500);
    await s.focus(exact(s, "Amazon Intern Hiring"), { zoom: 1.4 });
    await s.hold(1300);
    await s.focus("text=1 of 1 completed", { zoom: 1.5 });
    await s.hold(1500);
    return s.finish();
  },

  async "06b-anvi-student"() {
    const s = await openScene("06b-anvi-student", { role: "student" });
    await s.goto("/student/ai-interviews", { waitFor: "text=AI Interviews", settle: 1200 });
    await s.start();
    await s.hold(400);
    await s.click("button:has-text('Completed')", { zoom: 1.3 });
    await s.visible("text=Amazon Intern Hiring").waitFor({ timeout: 30000 });
    await s.hold(500);
    await s.focus(exact(s, "Amazon Intern Hiring"), { zoom: 1.45 });
    await s.hold(1800);
    return s.finish();
  },

  async "06c-anvi-report"() {
    const s = await openScene("06c-anvi-report", { role: "admin" });
    await s.goto("/admin/ai-interviews/reports", { waitFor: "text=Interview attempts", settle: 1500 });
    await s.start();
    await s.hold(400);
    await s.focus("text=10.5 / 50", { zoom: 1.4 });
    await s.hold(900);
    await s.click("table button:has-text('View')", { zoom: 1.3 });
    await s.cut(() => s.visible("text=Download PDF").waitFor({ timeout: 60000 }));
    await s.cut(() => s.hold(1500));
    await s.focus("text=OVERALL", { zoom: 1.45 });
    await s.hold(1600);
    await s.focus("button:has-text('Download PDF')", { zoom: 1.45 });
    await s.hold(1200);
    await s.click("button:has-text('Question-wise feedback')", { zoom: 1.3 });
    await s.hold(1500);
    await s.moveTo({ x: 1530, y: 760 });
    await s.scroll(500, { ms: 1500 });
    await s.hold(1300);
    await s.click("button:has-text('Action items')", { zoom: 1.3 });
    await s.hold(2200);
    return s.finish();
  },

  async "07-analysis"() {
    const s = await openScene("07-analysis", { role: "student" });
    await s.goto("/student/analysis", { waitFor: "text=Performance & readiness", settle: 4000 });
    await s.start();
    await s.hold(500);
    await s.focus(exact(s, "Readiness"), { zoom: 1.35 });
    await s.hold(1300);
    await s.focus("text=Readiness history", { zoom: 1.3 });
    await s.hold(1300);
    await s.click(exact(s, "Coding"), { zoom: 1.3 });
    await s.cut(() => s.visible("text=Topic coverage").waitFor({ timeout: 60000 }));
    await s.cut(() => s.hold(2500));
    await s.focus("text=Accepted submission rate", { zoom: 1.45 });
    await s.hold(1300);
    await s.focus("text=What to work on next", { zoom: 1.35 });
    await s.hold(1300);
    await s.cut(() => s.goto("/student/rankings", { waitFor: "text=University standing", settle: 1500 }));
    await s.focus("text=University standing", { zoom: 1.45 });
    await s.hold(1800);
    return s.finish();
  },

  async "08-admin-campus"() {
    const s = await openScene("08-admin-campus", { role: "admin" });
    await s.goto("/admin", { waitFor: "text=Total students", settle: 3000 });
    await s.start();
    await s.hold(500);
    await s.focus("text=Total students", { zoom: 1.4 });
    await s.hold(1200);
    await s.focus("text=Universities live", { zoom: 1.4 });
    await s.hold(1200);
    await s.cut(() => s.goto("/admin/universities", { waitFor: "text=How a university goes live", settle: 1500 }));
    await s.focus("text=How a university goes live", { zoom: 1.35 });
    await s.hold(1800);
    await s.cut(() => s.goto("/admin/universities/geu-122?tab=modules", { waitFor: "text=Question practice", settle: 1500 }));
    await s.focus(exact(s, "Question practice"), { zoom: 1.35 });
    await s.hold(1400);
    await s.click("button:has-text('Plan & Prep Coins')", { zoom: 1.25 });
    await s.cut(() => s.visible("text=Account limits").waitFor({ timeout: 30000 }));
    await s.focus("text=Account limits", { zoom: 1.4 });
    await s.hold(1600);
    return s.finish();
  },

  async "09-admin-anvi"() {
    const s = await openScene("09-admin-anvi", { role: "admin" });
    await s.goto("/admin/ai-interviews/new", { waitFor: "text=What is this interview for?", settle: 2000 });
    await s.start();
    await s.hold(500);
    await s.focus(exact(s, "Questions"), { zoom: 1.45 });
    await s.hold(900);
    await s.focus(exact(s, "ANVI settings"), { zoom: 1.45 });
    await s.hold(1100);
    await s.focus(exact(s, "Mock interview"), { zoom: 1.35 });
    await s.hold(1200);
    await s.cut(() => s.goto("/admin/ai-interviews", { waitFor: "text=Amazon Intern Hiring", settle: 1500 }));
    await s.focus(exact(s, "Amazon Intern Hiring"), { zoom: 1.4 });
    await s.hold(1500);
    await s.cut(() => s.goto("/admin/ai-interviews/reports?view=usage", { waitFor: "text=AI usage and cost", settle: 2500 }));
    await s.focus("text=Live minutes", { zoom: 1.45 });
    await s.hold(1300);
    await s.focus(exact(s, "Tokens"), { zoom: 1.45 });
    await s.hold(1300);
    await s.focus(exact(s, "AI calls"), { zoom: 1.45 });
    await s.hold(1500);
    return s.finish();
  },

  async "10-admin-analysis"() {
    const s = await openScene("10-admin-analysis", { role: "admin" });
    await s.goto("/admin/analysis", { waitFor: "text=Top students", settle: 12000 });
    // Student names in the "Top students" bar chart are drawn on a canvas: blur the label column.
    const card = await s.page.evaluate(() => {
      const heading = [...document.querySelectorAll("*")].find((el) => el.children.length === 0 && el.textContent.trim() === "Top students");
      let el = heading;
      while (el && el.getBoundingClientRect().height < 300) el = el.parentElement;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await s.blurRect("top-students", { x: card.x + 10, y: card.y + 118, width: 118, height: card.height - 145 });
    // Chart tooltips name the hovered student: hide them, and keep the cursor off the chart.
    await s.page.addStyleTag({ content: "div[style*='z-index: 9999999'] { display: none !important; }" });
    await s.page.mouse.move(1750, 40);
    await s.start({ cursor: { x: 1750, y: 40 } });
    await s.hold(500);
    await s.focus("text=Solved problems by difficulty", { zoom: 1.3 });
    await s.hold(1300);
    await s.moveTo({ x: 1860, y: 760 }, { ms: 400 });
    await s.moveTo({ x: 1860, y: 1060 }, { ms: 300 });
    await s.moveTo({ x: 100, y: 1060 }, { ms: 500 });
    await s.focus("text=Practice week by week", { zoom: 1.3 });
    await s.hold(1200);
    await s.click("button:has-text('Filters')", { zoom: 1.2 });
    await s.cut(() => s.visible("text=What do you want to analyse?").waitFor({ timeout: 30000 }));
    await s.focus("text=What do you want to analyse?", { zoom: 1.3 });
    await s.hold(1300);
    await s.focus("text=Which students?", { zoom: 1.3 });
    await s.hold(1300);
    await s.click("button:has-text('Cancel')", { zoom: 1.2 });
    await s.hold(500);
    await s.cut(() => s.goto("/admin/settings/prep-score-adjustment", { waitFor: "text=Formula", settle: 2000 }));
    await s.focus("text=Module score = S", { zoom: 1.5 });
    await s.hold(2000);
    return s.finish();
  },
});

const ids = process.argv.slice(2);
if (!ids.length) console.log(`Scenes: ${Object.keys(SCENES).join(", ")}`);
for (const id of ids) {
  if (!SCENES[id]) throw new Error(`Unknown scene ${id}`);
  const started = Date.now();
  try {
    await SCENES[id]();
    console.log(`${id} recorded in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  } catch (error) {
    console.error(`${id} FAILED: ${error.message.split("\n")[0]}`);
    await activeScene?.page.screenshot({ path: `out/probe/fail-${id}.png` }).catch(() => {});
    await activeScene?.abort();
    process.exitCode = 1;
  }
}
