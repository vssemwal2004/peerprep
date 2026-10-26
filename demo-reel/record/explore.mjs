// Ad-hoc exploration: run a small step list as a role and screenshot after each step.
// Usage: node record/explore.mjs student steps.json   (steps: [{goto}|{click}|{wait}|{shot}])
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openScene } from "./lib.mjs";

const [role, stepsFile] = process.argv.slice(2);
const steps = JSON.parse(await readFile(stepsFile, "utf8"));
const outDir = fileURLToPath(new URL("../out/probe/", import.meta.url));
await mkdir(outDir, { recursive: true });
const scene = await openScene(`explore-${role}`, { role });
const { page } = scene;
try {
  for (const step of steps) {
    if (step.goto) await scene.goto(step.goto, { settle: step.settle ?? 2500 });
    if (step.click) await page.locator(step.click).first().click({ timeout: 10000 });
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.shot) {
      await page.screenshot({ path: path.join(outDir, `${step.shot}.png`), fullPage: !!step.full });
      console.log(`${step.shot}: ${page.url().replace(/^https?:\/\/[^/]+/, "")}`);
    }
    if (step.press) await page.keyboard.press(step.press);
    if (step.lines) await scene.pasteLines(step.lines);
    if (step.eval) console.log("eval:", JSON.stringify(await page.evaluate(step.eval)));
    if (step.links) {
      const hrefs = await page.$$eval(step.links, (els) => els.map((e) => `${e.textContent.trim().slice(0, 60)} -> ${e.getAttribute("href")}`));
      console.log(hrefs.slice(0, 15).join("\n"));
    }
  }
} catch (error) {
  console.error(`Step failed: ${error.message.split("\n")[0]}`);
  await page.screenshot({ path: path.join(outDir, "explore-error.png") });
} finally {
  await scene.abort();
}
