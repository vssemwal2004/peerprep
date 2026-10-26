// Turns script/timed-script.json (frame-checked lines per scene) into
// script/voiceover-timed.md (timecode table) and out/peerprep-pitch-script.srt.
import { readFile, writeFile } from "node:fs/promises";

const timeline = JSON.parse(await readFile(new URL("./timeline.json", import.meta.url), "utf8"));
const data = JSON.parse(await readFile(new URL("./timed-script.json", import.meta.url), "utf8"));
const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  return `00:${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

const md = [
  "# PeerPrep — Frame-timed voice-over (English)",
  "",
  "Video: `out/peerprep-pitch.mp4` (3:54, silent). Each line starts at its timecode and is sized to finish before the next screen change at a calm ~140 words per minute.",
  "Pronunciation: **ANVI** = \"AHN-vee\" · **Judge0** = \"Judge zero\" · **PeerPrep** = \"Peer Prep\".",
  "Tip: load `out/peerprep-pitch-script.srt` as subtitles in VLC while recording, and say each line when it appears.",
  "",
];
const srt = [];
let n = 1, total = 0;
for (const scene of timeline.scenes) {
  const entry = data.scenes.find((s) => s.id === scene.id);
  md.push(`## ${scene.id.slice(0, 2)} · ${scene.label}`, "", "| Start | End | On screen | Say |", "|---|---|---|---|");
  for (const line of entry?.lines || []) {
    md.push(`| ${clock(line.start)} | ${clock(line.end)} | ${line.onScreen.replace(/\|/g, "/")} | ${line.text.replace(/\|/g, "/")} |`);
    srt.push(`${n++}\n${srtTime(line.start)} --> ${srtTime(line.end)}\n${line.text}\n`);
    total += words(line.text);
  }
  md.push("");
}
md.push("---", "", "## Read-through version (same words, no timecodes)", "");
for (const scene of timeline.scenes) {
  const entry = data.scenes.find((s) => s.id === scene.id);
  md.push(`**${scene.label}.** ${(entry?.lines || []).map((l) => l.text).join(" ")}`, "");
}
await writeFile(new URL("./voiceover-timed.md", import.meta.url), md.join("\n"));
await writeFile(new URL("../out/peerprep-pitch-script.srt", import.meta.url), srt.join("\n"));
console.log(`${n - 1} lines, ${total} words -> script/voiceover-timed.md + out/peerprep-pitch-script.srt`);
