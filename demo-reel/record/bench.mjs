// Measures how much the CDP screencast slows scripted actions.
import { openScene } from "./lib.mjs";

const measure = async (label, withCapture, quality) => {
  const s = await openScene(`bench-${label}`, { role: "student" });
  await s.goto("/student/dashboard", { waitFor: "text=Coding progress", settle: 1000 });
  let cdp, frames = 0;
  if (withCapture) {
    cdp = await s.page.context().newCDPSession(s.page);
    cdp.on("Page.screencastFrame", ({ sessionId }) => { frames++; cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {}); });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality, maxWidth: 1920, maxHeight: 1080 });
  }
  const t = Date.now();
  await s.moveTo({ x: 300, y: 300 }, { ms: 650 });
  await s.moveTo({ x: 1500, y: 800 }, { ms: 650 });
  await s.hold(1000);
  console.log(`${label}: ${Date.now() - t} ms for ~2300 ms of script, ${frames} frames`);
  await s.abort();
};
await measure("no-capture", false);
await measure("q92", true, 92);
await measure("q70", true, 70);
