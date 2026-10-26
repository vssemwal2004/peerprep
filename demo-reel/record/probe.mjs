// Screenshots routes as a role so scenes can be planned against real data.
// Usage: node record/probe.mjs student /student/dashboard /problems ...
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openScene } from "./lib.mjs";

const [role, ...routes] = process.argv.slice(2);
const outDir = fileURLToPath(new URL("../out/probe/", import.meta.url));
await mkdir(outDir, { recursive: true });
const scene = await openScene(`probe-${role}`, { role });
try {
  for (const route of routes) {
    await scene.goto(route, { settle: 2500 });
    const file = path.join(outDir, `${role}${route.replace(/[^\w]+/g, "_")}.png`);
    await scene.page.screenshot({ path: file });
    console.log(`${route} -> ${scene.page.url().replace(/^https?:\/\/[^/]+/, "")}  ${path.basename(file)}`);
  }
} finally {
  await scene.abort();
}
