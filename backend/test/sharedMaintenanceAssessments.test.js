import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Regression: de512841 moved assessment grading into the per-university loop
// only, so a deployment with no university tenants (PeerPrep's own students in
// the main database) never graded, refreshed reports or expired attempts.
test("assessment grading, report refresh and expiry also run for the platform database", () => {
  const source = readFileSync(new URL("../src/platform/sharedMaintenance.js", import.meta.url), "utf8");
  const tenantLoopStart = source.indexOf("if (!universityIds.length) return;");
  assert.ok(tenantLoopStart > 0, "the tenant loop guard is still present");
  const platformSection = source.slice(0, tenantLoopStart);

  assert.match(platformSection, /runForPlatform\(\(\) => dispatchPendingAssessmentEvaluations\(\{ limit: 10 \}\)\)\.catch/);
  assert.match(platformSection, /due\('platform', 'reports', 3000\)/);
  assert.match(platformSection, /discoverAssessmentReportRefreshes\(\{ limit: 10 \}\)/);
  assert.match(platformSection, /refreshPendingAssessmentReports\(\{ limit: 5 \}\)/);
  assert.match(platformSection, /due\('platform', 'expiry', 60_000\)\) await runForPlatform\(\(\) => sweepAssessmentExpiry\(\)\)\.catch/);
});
