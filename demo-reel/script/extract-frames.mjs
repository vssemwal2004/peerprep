// Extracts one frame per second of the final video into out/frames-final/<scene>/,
// named by absolute timecode (t0047.0.jpg = 0:47.0), plus an index for the script agents.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const timeline = JSON.parse(await readFile(new URL("./timeline.json", import.meta.url), "utf8"));
const root = new URL("../out/frames-final/", import.meta.url);
await rm(root, { recursive: true, force: true });
const index = [];
let start = 0;
for (const scene of timeline.scenes) {
  const dir = new URL(`${scene.id}/`, root);
  await mkdir(dir, { recursive: true });
  const files = [];
  for (let t = start + 0.5; t < start + scene.duration; t += 1) {
    const name = `t${String(Math.floor(t)).padStart(4, "0")}.${Math.round((t % 1) * 10)}.jpg`;
    spawnSync(ffmpegPath, ["-y", "-v", "error", "-ss", t.toFixed(2), "-i", "out/peerprep-pitch.mp4", "-frames:v", "1", "-vf", "scale=1280:-1", "-q:v", "3", new URL(name, dir).pathname.replace(/^\/(\w:)/, "$1")]);
    files.push(name);
  }
  index.push({ id: scene.id, label: scene.label, start, end: start + scene.duration, duration: scene.duration, dir: `out/frames-final/${scene.id}`, files });
  start += scene.duration;
}
await writeFile(new URL("index.json", root), JSON.stringify(index, null, 2));
console.log(index.map((s) => `${s.id}: ${s.files.length} frames ${s.start}-${s.end}s`).join("\n"));
