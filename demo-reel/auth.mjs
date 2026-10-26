// Captures a logged-in session without the password ever leaving the browser.
// Usage: node auth.mjs admin|student   (BASE_URL defaults to http://localhost:5173)
// A Chrome window opens (title shows the role); log in yourself. When the app reaches the dashboard the
// cookies + localStorage are saved to .auth/<role>.json and the window closes.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const role = process.argv[2];
if (!["admin", "student"].includes(role)) {
  console.error("Usage: node auth.mjs admin|student");
  process.exit(1);
}
const base = (process.env.BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const landed = role === "student"
  ? /\/student\/dashboard/
  : /\/(admin|u\/[^/]+\/admin)(\/|$)/;

const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
// Tag the tab title so the two login windows are easy to tell apart.
await context.addInitScript((r) => {
  const tag = () => { if (!document.title.startsWith(`[${r}]`)) document.title = `[${r}] ${document.title}`; };
  new MutationObserver(tag).observe(document, { subtree: true, childList: true });
}, role.toUpperCase());
// Students, admins and coordinators all sign in on the same /student page.
await page.goto(`${base}/student`);
console.log(`Log in as ${role} in the Chrome window (waiting up to 15 minutes)...`);
try {
  await page.waitForURL(landed, { timeout: 15 * 60 * 1000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await mkdir(new URL("./.auth/", import.meta.url), { recursive: true });
  await context.storageState({ path: fileURLToPath(new URL(`./.auth/${role}.json`, import.meta.url)) });
  console.log(`Saved .auth/${role}.json`);
} catch {
  console.error("Timed out before reaching the dashboard; nothing saved.");
  process.exitCode = 1;
} finally {
  await browser.close();
}
