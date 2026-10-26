// Checks that each voice-over block fits its scene slot in timeline.json at the target pace.
import { readFile } from "node:fs/promises";

const timeline = JSON.parse(await readFile(new URL("./timeline.json", import.meta.url), "utf8"));
const script = await readFile(new URL("./voiceover.md", import.meta.url), "utf8");
const blocks = script.split(/^### /m).slice(1).map((block) => {
  const [heading, ...rest] = block.split("\n");
  const text = rest.join(" ").split(/\*\*End|^---/m)[0];
  return { heading: heading.trim(), words: text.split(/\s+/).filter((w) => /[\w\[]/.test(w)).length };
});
if (blocks.length !== timeline.scenes.length) {
  console.error(`Script has ${blocks.length} blocks but timeline has ${timeline.scenes.length} scenes.`);
  process.exit(1);
}
let start = 0, failed = false;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
for (const [i, scene] of timeline.scenes.entries()) {
  const spoken = (blocks[i].words / timeline.wordsPerMinute) * 60;
  const slack = scene.duration - spoken;
  if (slack < 0) failed = true;
  console.log(`${clock(start).padStart(5)}  ${scene.id.padEnd(18)} ${String(blocks[i].words).padStart(3)} words  ${spoken.toFixed(1).padStart(5)}s / ${scene.duration}s  ${slack < 0 ? "OVER" : `+${slack.toFixed(1)}s`}`);
  start += scene.duration;
}
console.log(`Total ${clock(start)} (${blocks.reduce((n, b) => n + b.words, 0)} words)`);
process.exitCode = failed ? 1 : 0;
