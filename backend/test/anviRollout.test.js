import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { chooseRuntimeMode, inRollout, rolloutBucket, runtimeModeFor } from "../src/modules/anviInterview/anviInterview.rollout.js";

const STUDENTS = Array.from({ length: 2000 }, (_, index) => `64f0c0de${String(index).padStart(16, "0")}`);
const hybridConfig = (overrides = {}) => ({ ...anviConfig({ ANVI_HYBRID_ENABLED: "true", ANVI_HYBRID_ROLLOUT_PERCENT: "100" }), ...overrides });
const base = { tenantKey: "geu", studentId: STUDENTS[0], mode: "practice", pricing: true, storage: { ready: true } };

test("the rollout bucket is sha256(tenant:student) % 100 and deterministic", () => {
  const expected = createHash("sha256").update("geu:s1").digest().readUIntBE(0, 6) % 100;
  assert.equal(rolloutBucket("geu", "s1"), expected);
  assert.equal(rolloutBucket("geu", "s1"), rolloutBucket(" geu ", "s1"));
  assert.notEqual(STUDENTS.map((id) => rolloutBucket("geu", id)).join(), STUDENTS.map((id) => rolloutBucket("other", id)).join());
  for (const id of STUDENTS.slice(0, 50)) assert.ok(rolloutBucket("geu", id) >= 0 && rolloutBucket("geu", id) < 100);
});

test("missing or malformed ids have no bucket and are never in the rollout", () => {
  for (const [tenant, student] of [["", "s1"], ["geu", ""], [null, "s1"], ["geu", undefined], ["ge u", "s1"], ["geu", "a/b"]]) {
    assert.equal(rolloutBucket(tenant, student), null);
    assert.equal(inRollout(tenant, student, 100), false);
  }
});

test("percent 0 admits nobody, 100 everyone, and raising it only adds students", () => {
  assert.equal(STUDENTS.some((id) => inRollout("geu", id, 0)), false);
  assert.equal(STUDENTS.every((id) => inRollout("geu", id, 100)), true);
  assert.equal(inRollout("geu", "s1", Number.NaN), false);
  const at10 = new Set(STUDENTS.filter((id) => inRollout("geu", id, 10)));
  const at30 = new Set(STUDENTS.filter((id) => inRollout("geu", id, 30)));
  for (const id of at10) assert.ok(at30.has(id));
  // Roughly uniform: 10% of 2,000 students, with a wide tolerance.
  assert.ok(at10.size > 120 && at10.size < 280, `got ${at10.size}`);
});

test("with the flag off every attempt is Live (the default config)", () => {
  assert.deepEqual(chooseRuntimeMode({ ...base, config: anviConfig({}) }), { runtimeMode: "live", reason: "disabled" });
  assert.deepEqual(chooseRuntimeMode(), { runtimeMode: "live", reason: "disabled" });
  assert.deepEqual(chooseRuntimeMode({ ...base, config: anviConfig({ ANVI_HYBRID_ROLLOUT_PERCENT: "100" }) }).runtimeMode, "live");
});

test("hybrid only when every gate passes; the first failed gate is the reason", () => {
  assert.deepEqual(chooseRuntimeMode({ ...base, config: hybridConfig() }), { runtimeMode: "hybrid", reason: "" });
  assert.equal(chooseRuntimeMode({ ...base, config: hybridConfig({ hybridRolloutPercent: 0 }) }).reason, "rollout");
  assert.equal(chooseRuntimeMode({ ...base, config: hybridConfig({ hybridModes: ["mock"] }) }).reason, "mode");
  assert.equal(chooseRuntimeMode({ ...base, mode: "unknown", config: hybridConfig() }).reason, "mode");
  assert.equal(chooseRuntimeMode({ ...base, language: "Hindi", config: hybridConfig() }).reason, "language");
  assert.equal(chooseRuntimeMode({ ...base, pricing: false, config: hybridConfig() }).reason, "pricing");
  assert.equal(chooseRuntimeMode({ ...base, storage: { ready: false }, config: hybridConfig() }).reason, "storage");
  assert.equal(chooseRuntimeMode({ ...base, storage: undefined, config: hybridConfig() }).reason, "storage");
  assert.equal(chooseRuntimeMode({ ...base, studentId: "", config: hybridConfig() }).reason, "rollout");
});

test("pricing accepts the anviPricing object and missing prices mean Live", () => {
  const config = hybridConfig();
  assert.equal(chooseRuntimeMode({ ...base, config, pricing: { hybridPricesComplete: () => true } }).runtimeMode, "hybrid");
  assert.equal(chooseRuntimeMode({ ...base, config, pricing: { hybridPricesComplete: () => false } }).reason, "pricing");
  assert.equal(chooseRuntimeMode({ ...base, config, pricing: {} }).reason, "pricing");
});

test("ANVI_HYBRID_MODES limits the pilot to the listed attempt modes", () => {
  const config = { ...anviConfig({ ANVI_HYBRID_ENABLED: "1", ANVI_HYBRID_ROLLOUT_PERCENT: "100", ANVI_HYBRID_MODES: "practice" }) };
  assert.equal(chooseRuntimeMode({ ...base, config }).runtimeMode, "hybrid");
  assert.equal(chooseRuntimeMode({ ...base, mode: "mock", config }).reason, "mode");
});

test("assigned attempts are gated by \"scheduled\": pilot practice, later practice,scheduled", () => {
  const pilot = anviConfig({ ANVI_HYBRID_ENABLED: "1", ANVI_HYBRID_ROLLOUT_PERCENT: "100", ANVI_HYBRID_MODES: "practice" });
  assert.equal(chooseRuntimeMode({ ...base, scheduled: true, config: pilot }).reason, "mode");
  assert.equal(chooseRuntimeMode({ ...base, config: pilot }).runtimeMode, "hybrid");
  const later = anviConfig({ ANVI_HYBRID_ENABLED: "1", ANVI_HYBRID_ROLLOUT_PERCENT: "100", ANVI_HYBRID_MODES: "practice,scheduled" });
  assert.deepEqual(later.hybridModes, ["practice", "scheduled"]);
  assert.equal(chooseRuntimeMode({ ...base, scheduled: true, mode: "mock", config: later }).runtimeMode, "hybrid");
  assert.equal(chooseRuntimeMode({ ...base, mode: "mock", config: later }).reason, "mode");
  // The default admits every interview (DECISIONS #0), assigned ones included.
  assert.equal(chooseRuntimeMode({ ...base, scheduled: true, config: hybridConfig() }).runtimeMode, "hybrid");
});

test("the result is frozen", () => {
  assert.ok(Object.isFrozen(chooseRuntimeMode({ ...base, config: hybridConfig() })));
});

test("a 30% rollout admits 30% +/- 3% of 10,000 students", () => {
  const ids = Array.from({ length: 10_000 }, (_, index) => `65a1b2c3${String(index).padStart(16, "0")}`);
  const admitted = ids.filter((id) => inRollout("geu", id, 30)).length;
  assert.ok(admitted >= 2700 && admitted <= 3300, `got ${admitted}`);
});

test("runtimeModeFor: incomplete prices give Live and one warning that names the variables only", () => {
  const lines = [];
  const log = { warn: (line) => lines.push(line) };
  const pricing = { hybridPricesComplete: () => false, missingHybridPrices: () => ["ANVI_USD_INR_RATE"] };
  assert.equal(runtimeModeFor({ ...base, pricing, config: hybridConfig() }, { log }).runtimeMode, "live");
  assert.equal(runtimeModeFor({ ...base, pricing, config: hybridConfig() }, { log }).reason, "pricing");
  assert.equal(lines.length, 1, "warned once per process");
  assert.match(lines[0], /ANVI_USD_INR_RATE/);
  assert.equal(runtimeModeFor({ ...base, config: hybridConfig() }, { log }).runtimeMode, "hybrid");
});