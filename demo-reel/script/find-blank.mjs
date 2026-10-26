// Reports time ranges where a region of a raw clip is near-white (screencast glitch frames).
// Usage: node script/find-blank.mjs out/raw/06c-anvi-report.mp4 [x y w h]
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const [file, x = 0, y = 830, w = 900, h = 250] = process.argv.slice(2);
const fps = 30; // every frame: glitches can be a single 33 ms frame
const r = spawnSync(ffmpegPath, ["-v", "info", "-i", file, "-vf",
  `fps=${fps},crop=${w}:${h}:${x}:${y},signalstats,metadata=print:key=lavfi.signalstats.YAVG`, "-f", "null", "-"], { encoding: "utf8" });
const values = [...r.stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
const ranges = [];
values.forEach((v, i) => {
  const t = i / fps;
  if (v > 200) {
    const last = ranges.at(-1);
    if (last && t - last[1] <= 0.15) last[1] = t; else ranges.push([t, t]);
  }
});
console.log(`${values.length} samples; white ranges (s): ${ranges.map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)}`).join(", ") || "none"}`);
