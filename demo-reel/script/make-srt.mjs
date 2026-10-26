// Builds out/peerprep-pitch-script.srt: one cue per sentence, spread across each scene
// slot by word count at the target pace, so the voice-over can be recorded to time.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const timeline = JSON.parse(await readFile(new URL("./timeline.json", import.meta.url), "utf8"));
const script = await readFile(new URL("./voiceover.md", import.meta.url), "utf8");
const blocks = script.split(/^### /m).slice(1).map((b) => b.split("\n").slice(1).join(" ").split(/\*\*End|^---/m)[0].replace(/\s+/g, " ").trim());
const stamp = (s) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
const perWord = 60 / timeline.wordsPerMinute;
let start = 0, n = 1;
const cues = [];
timeline.scenes.forEach((scene, i) => {
  let t = start + 0.4;
  for (const sentence of blocks[i].match(/[^.!?]+[.!?]+/g) || [blocks[i]]) {
    const dur = sentence.trim().split(/\s+/).length * perWord;
    cues.push(`${n++}\n${stamp(t)} --> ${stamp(Math.min(t + dur, start + scene.duration - 0.1))}\n${sentence.trim()}\n`);
    t += dur;
  }
  start += scene.duration;
});
await mkdir(new URL("../out/", import.meta.url), { recursive: true });
await writeFile(new URL("../out/peerprep-pitch-script.srt", import.meta.url), cues.join("\n"));
console.log(`${cues.length} cues, ends ${stamp(start)}`);
