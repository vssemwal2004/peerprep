// Applies flow-critic replacements to script/timed-script.json only when the new
// text still fits its line's word budget (2.3 words/second); prints the outcome.
import { readFile, writeFile } from "node:fs/promises";

const file = new URL("./timed-script.json", import.meta.url);
const data = JSON.parse(await readFile(file, "utf8"));
const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const skip = new Set(process.argv.slice(2)); // "06-anvi:3" style ids to reject
for (const fix of data.flowFixes) {
  const key = `${fix.sceneId}:${fix.lineIndex}`;
  const line = data.scenes.find((s) => s.id === fix.sceneId)?.lines[fix.lineIndex];
  if (!line) { console.log(`skip ${key}: no such line`); continue; }
  const max = Math.floor((line.end - line.start) * 2.3);
  if (skip.has(key)) { console.log(`rejected ${key}`); continue; }
  if (words(fix.replacement) > max) { console.log(`skip ${key}: ${words(fix.replacement)} > ${max} words`); continue; }
  console.log(`apply ${key}: "${line.text}" -> "${fix.replacement}"`);
  line.text = fix.replacement;
}
data.flowApplied = true;
await writeFile(file, JSON.stringify(data, null, 2));
