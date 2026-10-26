// Assembles the pitch video with Remotion (silent H.264).
// Usage: node render.mjs [--only 01-problem,03-student-home] [--out out/pilot.mp4] [--still 120]
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const only = arg("only")?.split(",");
const out = path.resolve(ROOT, arg("out") || "out/peerprep-pitch.mp4");
const still = arg("still");

// Stage assets into remotion/public so staticFile() can serve them.
const pub = path.join(ROOT, "remotion", "public");
await mkdir(path.join(pub, "brand"), { recursive: true });
await mkdir(path.join(pub, "raw"), { recursive: true });
await copyFile(path.join(ROOT, "..", "frontend", "public", "images", "peerprep-mark.png"), path.join(pub, "brand", "peerprep-mark.png"));
const clips = {};
const rawDir = path.join(ROOT, "out", "raw");
if (existsSync(rawDir)) {
  for (const file of (await readdir(rawDir)).filter((f) => f.endsWith(".mp4"))) {
    const id = file.replace(/\.mp4$/, "");
    await copyFile(path.join(rawDir, file), path.join(pub, "raw", file));
    const meta = JSON.parse(await readFile(path.join(rawDir, `${id}.json`), "utf8").catch(() => "{}"));
    clips[id] = { file: `raw/${file}`, clicks: meta.clicks || [], cuts: meta.cuts || [], duration: meta.duration, url: meta.url };
  }
}
const factsFile = path.join(ROOT, "script", "facts.json");
const facts = existsSync(factsFile) ? JSON.parse(await readFile(factsFile, "utf8")) : {};
const inputProps = { clips, only: only || null, facts };

console.log(`Clips: ${Object.keys(clips).join(", ") || "none"}`);
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "remotion", "index.jsx"), publicDir: pub });
const composition = await selectComposition({ serveUrl, id: "Pitch", inputProps, browserExecutable: null, chromiumOptions: { gl: "angle" } });
await mkdir(path.dirname(out), { recursive: true });
if (still) {
  await renderStill({ serveUrl, composition, output: out.replace(/\.mp4$/, ".png"), frame: Number(still), inputProps });
  console.log(`Still -> ${out.replace(/\.mp4$/, ".png")}`);
} else {
  let last = -1;
  await renderMedia({
    serveUrl, composition, codec: "h264", outputLocation: out, inputProps, muted: true, crf: 18, pixelFormat: "yuv420p",
    chromiumOptions: { gl: "angle" }, concurrency: 4,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 20); if (p !== last) { last = p; process.stdout.write(`${p * 5}% `); } },
  });
  console.log(`\nVideo -> ${out}`);
}
