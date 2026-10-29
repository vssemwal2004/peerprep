import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { act, createElement as h } from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// WP5: the usage panel with the modality-aware cost (USD and INR, null = unknown, never 0).
let dom, server, root, createRoot, UsagePanel, reportApi, usageApi;
const globals = ["window", "document", "navigator", "HTMLElement", "HTMLDialogElement", "IS_REACT_ACT_ENVIRONMENT"];
const original = new Map(globals.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>', { url: "http://localhost:5173/admin/ai-interviews/reports" });
  for (const key of globals.filter((k) => k !== "IS_REACT_ACT_ENVIRONMENT"))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  UsagePanel = (await server.ssrLoadModule("/src/admin/ai-interviews/reports/UsagePanel.jsx")).default;
  ({ reportApi } = await server.ssrLoadModule("/src/admin/ai-interviews/api.js"));
  ({ usageApi } = await server.ssrLoadModule("/src/admin/ai-interviews/reports/usageApi.js"));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await server?.close();
  dom.window.close();
  for (const key of globals) {
    const d = original.get(key);
    if (d) Object.defineProperty(globalThis, key, d);
    else delete globalThis[key];
  }
});

const perCompleted = (inr, usd, extra = {}) => ({ completed: 4, priced: 4, complete: true, inr, usd, ...extra });
const base = (overrides = {}) => ({
  range: { from: "2026-09-23T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z" },
  interviewId: null,
  totals: { calls: 42, inputTokens: 90000, outputTokens: 30000, totalTokens: 120000, audioSeconds: 600, estimatedCost: 0, complete: true },
  sessions: { count: 2, attempts: 2, liveMinutes: 6 },
  byKind: [
    { kind: "tts", calls: 12, totalTokens: 6000, estimatedCost: null, estimatedUsd: 0.36, estimatedInr: 30.24 },
    { kind: "decision", calls: 30, totalTokens: 114000, estimatedCost: null, estimatedUsd: 0.02, estimatedInr: 1.68 },
  ],
  byModel: [],
  byDay: [{ day: "2026-10-21", calls: 42, totalTokens: 120000, estimatedCost: 0, estimatedUsd: 0.38, estimatedInr: 31.92, sessions: 2, liveMinutes: 6, byKind: {} }],
  byInterview: [],
  pricing: { currency: "USD", unit: "per 1M tokens", prices: {}, unpricedKinds: [] },
  cost: { currency: "USD", usd: 0.38, inr: 31.92, complete: true, unpricedKinds: [], inrMissing: false, repriced: false, usdInrRate: 84, pricingRevision: "env:abc", revisions: [], validUntil: null, expired: false },
  minutes: { live: 6, studentAudio: 10, tts: 2.5 },
  cache: { tts: { hits: 18, misses: 2, hitRate: 0.9 }, transcript: { hits: 1, misses: 20, hitRate: 0.0476 }, avoidedTtsCalls: 18, avoidedLiveTurns: 0, replays: 3, liveEscalations: 0, accurateTranscriptionEscalations: 1 },
  metrics: {},
  attempts: { count: 4, analysed: 4, truncated: false, completed: 4, hybrid: 4, live: 0, economical: 1, cachedOnly: 0, cachedOnlyCompleted: 0, peakModes: {}, perCompleted: perCompleted({ avg: 21.5, p50: 20, p90: 31 }, { avg: 0.26, p50: 0.24, p90: 0.37 }) },
  byDuration: [{ durationMinutes: 30, attempts: 4, estimatedUsd: 0.38, estimatedInr: 31.92, perCompleted: perCompleted({ avg: 21.5, p50: 20, p90: 31 }, {}) }],
  warnings: [],
  ...overrides,
});

async function mount(data) {
  const originals = { list: reportApi.list, get: usageApi.get };
  reportApi.list = async () => ({ attempts: [], interviews: [], pagination: { page: 1, pages: 1, limit: 25, total: 0 } });
  usageApi.get = async () => data;
  try {
    await act(async () => root.render(h(UsagePanel)));
    await settle();
  } finally {
    reportApi.list = originals.list;
    usageApi.get = originals.get;
  }
}
const text = (selector) => document.querySelector(selector)?.textContent || "";

test("complete cost: INR and USD, calls and cache hits apart, minutes and percentiles", async () => {
  await mount(base());
  const kpis = text("[data-usage-kpis]");
  assert.ok(kpis.includes("₹31.92") && kpis.includes("$0.38"), `both currencies: ${kpis}`);
  const hybrid = text("[data-usage-hybrid]");
  assert.ok(hybrid.includes("AI calls") && hybrid.includes("42"), "calls");
  assert.ok(hybrid.includes("Cache hits") && hybrid.includes("19") && hybrid.includes("90% of question audio from cache"), `cache hits shown separately: ${hybrid}`);
  assert.ok(hybrid.includes("3 replays without a call"));
  assert.ok(hybrid.includes("6 min") && hybrid.includes("10 min student answers") && hybrid.includes("2.5 min question audio"));
  assert.ok(hybrid.includes("₹21.50") && hybrid.includes("p50 ₹20.00 · p90 ₹31.00"), `percentiles: ${hybrid}`);
  assert.ok(text("[data-usage-by-kind]").includes("Question audio") && text("[data-usage-by-kind]").includes("₹30.24"));
  assert.ok(text("[data-usage-by-duration]").includes("30 min"));
  assert.ok(text("[data-usage-budget]").includes("1 attempt switched to economical mode"));
  assert.equal(document.querySelector("[data-usage-incomplete]"), null);
  assert.equal(document.querySelector("[data-usage-warnings]"), null);
});

test("unknown prices show Incomplete and never 0, with the warnings", async () => {
  await mount(base({
    byKind: [
      { kind: "tts", calls: 12, totalTokens: 6000, estimatedCost: null, estimatedUsd: null, estimatedInr: null },
      { kind: "decision", calls: 30, totalTokens: 114000, estimatedCost: null, estimatedUsd: 0.02, estimatedInr: null },
    ],
    byDay: [{ day: "2026-10-21", calls: 42, totalTokens: 120000, estimatedCost: null, estimatedUsd: null, estimatedInr: null, sessions: 0, liveMinutes: 0, byKind: {} }],
    cost: { currency: "USD", usd: null, inr: null, complete: false, unpricedKinds: ["tts"], inrMissing: true, repriced: true, usdInrRate: null, revisions: [], validUntil: "2026-10-01T23:59:59.999Z", expired: true },
    attempts: { count: 4, completed: 4, economical: 0, cachedOnly: 0, perCompleted: { completed: 4, priced: 0, complete: false, inr: { avg: null, p50: null, p90: null }, usd: { avg: null, p50: null, p90: null } } },
    byDuration: [{ durationMinutes: 30, attempts: 4, estimatedUsd: null, estimatedInr: null, perCompleted: { completed: 4, complete: false, inr: { avg: null, p50: null, p90: null } } }],
    warnings: [
      { code: "pricesIncomplete", unpricedKinds: ["tts"], inrMissing: true },
      { code: "avgAboveInr45", value: 52.4, threshold: 45 },
      { code: "p90AboveInr60", value: 71, threshold: 60 },
      { code: "lowCacheHit", value: 0.42, threshold: 0.6 },
      { code: "pricingExpired", validUntil: "2026-10-01T23:59:59.999Z" },
    ],
  }));
  const kpis = text("[data-usage-kpis]");
  assert.ok(kpis.includes("Incomplete") && kpis.includes("no price set for question audio"), kpis);
  assert.ok(text("[data-usage-incomplete]").includes("Incomplete"), "an Incomplete badge");
  const cells = [...document.querySelectorAll("[data-cost-cell]")].map((cell) => cell.textContent);
  assert.ok(cells.length >= 4);
  for (const cell of cells) assert.doesNotMatch(cell, /[₹$]0\.00/, `null is never 0: ${cell}`);
  assert.ok(cells.includes("Incomplete"));
  assert.ok(cells.some((cell) => cell.includes("$0.02") && cell.includes("INR unknown")), "USD known, INR unknown");
  assert.ok(text("[data-usage-hybrid]").includes("Incomplete"));
  const warnings = text("[data-usage-warnings]");
  assert.ok(warnings.includes("no price is set for question audio and the USD to INR rate is not set"), warnings);
  assert.ok(warnings.includes("₹52.40") && warnings.includes("above ₹45.00"));
  assert.ok(warnings.includes("more than ₹71.00"));
  assert.ok(warnings.includes("Only 42% of question audio came from the cache (target 60%)"));
  assert.ok(warnings.includes("valid until 1 Oct 2026"));
  assert.equal(document.querySelectorAll("[data-warning]").length, 5);
});

test("an older server without `cost` renders the legacy estimate only", async () => {
  const legacy = base();
  for (const key of ["cost", "minutes", "cache", "metrics", "attempts", "byDuration", "warnings"]) delete legacy[key];
  legacy.totals = { ...legacy.totals, estimatedCost: 1.84, complete: true };
  await mount(legacy);
  assert.ok(text("[data-usage-kpis]").includes("$1.84"));
  assert.equal(document.querySelector("[data-usage-hybrid]"), null);
  assert.equal(document.querySelector("[data-cost-cell]"), null);
});
