import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The external interview service was replaced by ANVI inside PeerPrep. Nothing may route
// student interviews (or engagement evidence) back through the retired service client.
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const RETIRED = /from\s+["'][^"']*interviewService(?:Client|Auth|Config)\.js["']|import\(["'][^"']*interviewService(?:Client|Auth|Config)\.js["']\)/;

async function sources(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sources(full));
    else if (entry.name.endsWith(".js") && !/^interviewService(?:Client|Auth|Config)\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("no backend module imports the retired interview service client", async () => {
  const offenders = [];
  for (const file of await sources(src)) if (RETIRED.test(await readFile(file, "utf8"))) offenders.push(path.relative(src, file));
  assert.deepEqual(offenders, []);
});

test("the student interview routes are the ANVI router", async () => {
  const routes = await readFile(path.join(src, "routes", "aiInterviewStudent.js"), "utf8");
  assert.match(routes, /createAnviStudentRouter/);
});
