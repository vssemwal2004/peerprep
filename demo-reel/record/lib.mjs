// Scene recorder: drives the real app in Chrome and captures it through the CDP
// screencast (sharper than Playwright's recordVideo), then encodes a constant
// 30 fps H.264 clip with ffmpeg-static. Clicks are logged for zooms in Remotion.
import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const BASE = (process.env.BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const W = 1920, H = 1080, FPS = 30;

// Runs in every document before app code: light theme, visible cursor, click
// ripple, hidden scrollbars and a blur for anything that looks like personal data.
const pageSetup = ({ theme, blur }) => {
  try { localStorage.setItem("theme", theme); } catch { /* storage may be blocked */ }
  const install = () => {
    if (document.getElementById("__demo_style")) return;
    const style = document.createElement("style");
    style.id = "__demo_style";
    style.textContent = `
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      [data-demo-blur] { filter: blur(7px) !important; }
      #__demo_cursor { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none;
        transform: translate(-200px, -200px); transition: transform 0s; }
      #__demo_cursor svg { filter: drop-shadow(0 2px 3px rgba(15,23,42,.35)); }
      .__demo_ripple { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        border: 3px solid rgba(2,132,199,.85); background: rgba(14,165,233,.18); pointer-events: none; animation: __demo_r .55s ease-out forwards; }
      @keyframes __demo_r { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.5); opacity: 0 } }`;
    document.documentElement.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "__demo_cursor";
    cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.6L9.5 21z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    addEventListener("mousemove", (e) => { cursor.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "__demo_ripple"; r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`;
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
    if (!blur) return;
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/;
    const sensitiveHeader = /^(name|student|student name|full name|email|e-mail|roll|roll no\.?|roll number|enrollment|phone|mobile|candidate)$/i;
    const scan = () => {
      // Any text node containing an email blurs its parent, even inside mixed lines.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent && !parent.closest("[data-demo-keep]") && email.test(node.nodeValue || "")) parent.setAttribute("data-demo-blur", "");
      }
      for (const input of document.querySelectorAll("input")) {
        if (email.test(input.value || "")) input.setAttribute("data-demo-blur", "");
      }
      for (const table of document.querySelectorAll("table")) {
        const heads = [...table.querySelectorAll("thead th")];
        heads.forEach((th, i) => {
          if (!sensitiveHeader.test((th.textContent || "").trim())) return;
          for (const row of table.querySelectorAll("tbody tr")) row.children[i]?.setAttribute("data-demo-blur", "");
        });
      }
      for (const sel of window.__demoBlurSelectors || []) document.querySelectorAll(sel).forEach((el) => el.setAttribute("data-demo-blur", ""));
    };
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
};

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => { err += d; });
  p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}\n${err.slice(-1500)}`))));
});

export let activeScene = null; // lets the runner screenshot a failed scene

export async function openScene(id, { role, theme = "light", blur = role === "admin", blurSelectors = [], headless = true } = {}) {
  const state = role === "public" ? undefined : path.join(ROOT, ".auth", `${role}.json`);
  if (state && !existsSync(state)) throw new Error(`Missing .auth/${role}.json - run: node auth.mjs ${role}`);
  const browser = await chromium.launch({ channel: "chrome", headless, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, storageState: state, colorScheme: theme });
  await context.addInitScript(pageSetup, { theme, blur });
  if (blurSelectors.length) await context.addInitScript((s) => { window.__demoBlurSelectors = s; }, blurSelectors);
  const page = await context.newPage();
  const frameDir = path.join(ROOT, "out", "frames", id);
  await rm(frameDir, { recursive: true, force: true });
  await mkdir(frameDir, { recursive: true });

  const frames = [], clicks = [], marks = [], cuts = [];
  let cdp = null, t0 = 0, mouse = { x: W / 2, y: H / 2 };
  const now = () => (Date.now() - t0) / 1000;

  const scene = {
    page,
    /** Navigate without recording the loading flash. */
    async goto(route, { waitFor, settle = 900 } = {}) {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      if (waitFor) await scene.visible(waitFor).waitFor({ timeout: 60000 });
      await page.waitForTimeout(settle);
    },
    async start({ cursor } = {}) {
      if (cursor) mouse = { ...cursor };
      cdp = await context.newCDPSession(page);
      cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
        frames.push({ data, ts: metadata.timestamp });
        await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      });
      t0 = Date.now();
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
      await page.mouse.move(mouse.x, mouse.y);
    },
    hold: (ms) => page.waitForTimeout(ms),
    /** First visible match - responsive layouts often keep hidden duplicates earlier in the DOM. */
    visible: (selector) => (typeof selector === "string" ? page.locator(selector) : selector).filter({ visible: true }).first(),
    mark(label) { marks.push({ t: now(), label }); },
    /** Runs a slow step (navigation, waiting) and marks its time range for removal in the edit. */
    async cut(fn) {
      const from = t0 ? now() : null;
      const result = await fn();
      if (from !== null) cuts.push([from, now()]);
      return result;
    },
    /** Overlays a blur on a rectangle (page px) - for names drawn inside canvas charts. */
    async blurRect(name, { x, y, width, height }) {
      await page.evaluate(({ name, x, y, width, height }) => {
        let el = document.getElementById(`__demo_rect_${name}`);
        if (!el) { el = document.createElement("div"); el.id = `__demo_rect_${name}`; document.documentElement.appendChild(el); }
        Object.assign(el.style, { position: "absolute", left: `${x + scrollX}px`, top: `${y + scrollY}px`, width: `${width}px`, height: `${height}px`,
          backdropFilter: "blur(8px)", webkitBackdropFilter: "blur(8px)", background: "rgba(255,255,255,.25)", borderRadius: "6px", zIndex: 2147483000, pointerEvents: "none" });
      }, { name, x, y, width, height });
    },
    /** Eased mouse glide to a locator (or {x,y}). */
    async moveTo(target, { ms = 650 } = {}) {
      let x, y;
      if (typeof target === "string" || target?.boundingBox) {
        const loc = scene.visible(target);
        await loc.waitFor({ timeout: 30000 });
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        const box = await loc.boundingBox();
        if (!box) throw new Error(`No box for ${target}`);
        x = box.x + box.width / 2; y = box.y + box.height / 2;
      } else ({ x, y } = target);
      const steps = Math.max(8, Math.round(ms / 16)), from = { ...mouse };
      for (let i = 1; i <= steps; i++) {
        const k = i / steps, e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
        await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
        await page.waitForTimeout(ms / steps);
      }
      mouse = { x, y };
      return { x, y };
    },
    async click(target, { zoom = 1.6, pause = 250 } = {}) {
      const { x, y } = await scene.moveTo(target);
      await page.waitForTimeout(pause);
      clicks.push({ t: now(), x, y, zoom });
      await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
    },
    /** Glide to a target and request a zoom there without clicking. */
    async focus(target, { zoom = 1.3, ms = 700 } = {}) {
      const { x, y } = await scene.moveTo(target, { ms });
      clicks.push({ t: now(), x, y, zoom, focus: true });
    },
    async type(target, text, { delay = 55 } = {}) {
      await scene.click(target);
      await page.keyboard.type(text, { delay });
    },
    /**
     * Enters code into a focused Monaco editor one line at a time via synthetic
     * paste events, so auto-indent and auto-closing brackets don't mangle it.
     */
    async pasteLines(lines, { lineMs = 170 } = {}) {
      for (const line of lines) {
        await page.evaluate((text) => {
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        }, `${line}\n`);
        await page.waitForTimeout(lineMs);
      }
    },
    /** Smooth wheel scroll over whatever is under the cursor. */
    async scroll(dy, { ms = 1400 } = {}) {
      const steps = Math.max(10, Math.round(ms / 30));
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await page.waitForTimeout(ms / steps); }
    },
    async finish({ minSeconds = 0 } = {}) {
      const elapsed = now();
      if (elapsed < minSeconds) await page.waitForTimeout((minSeconds - elapsed) * 1000);
      await cdp.send("Page.stopScreencast").catch(() => {});
      const end = Date.now();
      await browser.close();
      if (!frames.length) throw new Error("No frames captured");
      const start = frames[0].ts;
      const epoch = Math.abs(start - t0 / 1000) < 60; // CDP gives wall-clock seconds on current Chrome
      const list = [];
      for (let i = 0; i < frames.length; i++) {
        const name = `f${String(i).padStart(5, "0")}.jpg`;
        await writeFile(path.join(frameDir, name), Buffer.from(frames[i].data, "base64"));
        const next = i + 1 < frames.length ? frames[i + 1].ts : epoch ? Math.max(frames[i].ts + 1 / FPS, end / 1000) : frames[i].ts + 1 / FPS;
        list.push(`file '${name}'\nduration ${Math.max(0.001, next - frames[i].ts).toFixed(4)}`);
      }
      list.push(`file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'`);
      await writeFile(path.join(frameDir, "list.txt"), list.join("\n"));
      const outDir = path.join(ROOT, "out", "raw");
      await mkdir(outDir, { recursive: true });
      const out = path.join(outDir, `${id}.mp4`);
      await run(ffmpegPath, ["-y", "-f", "concat", "-safe", "0", "-i", path.join(frameDir, "list.txt"),
        "-vf", `scale=${W}:${H}:flags=lanczos,fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "16",
        "-movflags", "+faststart", "-an", out]);
      // Frame timestamps are wall-clock seconds; video t=0 is the first frame, so shift
      // click/mark times (measured from t0) by the delay before that first frame.
      const firstDelay = epoch ? start - t0 / 1000 : 0;
      const shift = (t) => +Math.max(0, t - firstDelay).toFixed(3);
      await writeFile(path.join(outDir, `${id}.json`), JSON.stringify({
        duration: +((end - t0) / 1000 - firstDelay).toFixed(3), width: W, height: H,
        clicks: clicks.map((c) => ({ ...c, t: shift(c.t) })), marks: marks.map((m) => ({ ...m, t: shift(m.t) })),
        cuts: cuts.map(([a, b]) => [shift(a), shift(b)]), url: page.url().replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, ""),
      }, null, 2));
      await rm(frameDir, { recursive: true, force: true });
      console.log(`${id}: ${frames.length} frames -> out/raw/${id}.mp4`);
      return out;
    },
    async abort() { await browser.close().catch(() => {}); },
  };
  activeScene = scene;
  return scene;
}
