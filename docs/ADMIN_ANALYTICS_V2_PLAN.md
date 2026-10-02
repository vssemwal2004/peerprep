# Admin Analytics V2 — Product, UX, Data, and Delivery Plan

## 1. Decision and scope

Build a new top-level **Admin → Analysis** workspace at `/admin/analysis` and retire the current coding-only analysis experience as the primary analytics flow.

The new workspace will analyze three first-class evidence sources together:

- coding practice and assessment coding submissions;
- completed assessment attempts, including non-coding questions;
- learning-module progress at semester, subject, chapter, and topic level.

It must support a single student, multiple students, whole cohorts, Excel-upload batches, top/bottom-N populations, one or many completed assessments, and one or many learning/coding scopes. It must not render a chart when the active filters do not provide valid evidence for that chart.

This document is the implementation contract. No V2 production code should be built until its definitions and rollout sequence are accepted.

## 2. Current-state findings

The current UI is `frontend/src/admin/compiler/CompilerAnalytics.jsx`, mounted inside the Library/Coding workspace and embedded in Assessment Reports. Its server endpoint is `GET /compiler/analytics` in `backend/src/controllers/analyticsController.js`.

The existing flow already has useful pieces to preserve conceptually:

- cohort filters for student, semester, group, branch, course, college, and upload batch;
- assessment, topic, difficulty, language, problem, status, and date filters;
- topic and student export rows;
- server-side MongoDB aggregation for coding submissions.

The flow must nevertheless be replaced, not expanded in place, because:

- all performance results are derived from `Submission`; assessment selection only narrows coding submissions and does not analyze complete assessment scores or MCQ/short-answer performance;
- learning `Progress` is absent;
- ranking is coding-only and does not provide overall, learning, assessment, or configurable top/bottom-N scores;
- only five fixed coding charts are shown and users cannot select graphs;
- the response returns large option lists with the analytics payload, which will not scale to thousands of students, assessments, and problems;
- exports are browser-generated CSV/XLSX, while the requirement is PDF/XLSX with selectable columns and large-report handling;
- the 1,700+ line component combines fetching, filter dependency logic, formulas, charts, drawers, and export generation.

Existing student analytics (`analyticsEngine.js`) contains useful score/evidence concepts, but its cached per-student contract cannot directly answer arbitrary admin cohort queries. V2 should reuse shared definitions where valid without performing one analytics rebuild per selected student.

## 3. Information architecture

### Navigation and routes

- Add **Analysis** as a top-level Admin Sidebar item with a chart icon.
- Add `/admin/analysis` as the canonical route.
- Keep `/admin/library/coding/analytics` and `/admin/compiler/analytics` temporarily as redirects to `/admin/analysis?source=coding` so bookmarks continue to work.
- Replace the Assessment Reports embedded coding analytics tab with a deep link to `/admin/analysis?assessmentIds=<id>` or a thin embedded V2 view using the same query contract.
- Add a separate coordinator permission such as `coordinator.analytics.view`; map the existing coding-analytics permission during migration so access does not disappear unexpectedly.

### Workspace layout

The page uses five stable areas:

1. **Header:** title, last refreshed time, result/evidence count, Refresh, Filters, and Download.
2. **Active scope bar:** removable chips, cohort size, evidence window, and `Clear all`.
3. **Summary strip:** four to six KPI cards chosen from available evidence, never fabricated zeroes for missing sources.
4. **Insight canvas:** responsive two-column chart grid; wide charts such as heatmap, trend, and funnel span both columns.
5. **Context panel:** visible-data notes, formula/evidence tooltip, warnings, and empty-state recommendations.

Desktop uses a 12-column grid. Tablet uses one or two columns. Mobile uses one column and full-screen filter/export sheets. Cards have consistent 16–20 px padding, restrained borders/shadows, and accessible light/dark palettes. Color conveys the same meaning everywhere: emerald = strong/success, amber = watch, rose = risk, sky = participation/activity, violet = assessment, indigo = learning.

## 4. Professional filter drawer

The filter opens as a right-side drawer on desktop and a full-screen sheet on mobile. Draft selections do not query the server until **Apply filters** is pressed.

### A. Population

- Students: all, search-selected single/multiple, or calculated segment.
- Semester, group/section, branch, course, campus/college.
- Excel upload batch: single/multiple.
- Student status when available.
- Rank segment: top or bottom.
- N: 10, 25, 50, 100, 250, or a bounded custom value.
- Rank metric: Overall, Coding, Assessment, Learning, Consistency, or a selected module/topic.
- Minimum evidence toggle, enabled by default, to stop one lucky attempt from ranking first.

Population filters use AND between categories and OR within one category. For example, Semester 5 + Branch CSE + (Batch A or Batch B).

### B. Activity sources

- Source: All available, Coding, Assessments, Learning.
- Date range with 7/30/90/180/365-day presets and custom dates.
- Coding: practice, assessment, or both; problem; topic/tag; difficulty; language; verdict/status.
- Assessments: completed assessments only by default; searchable multi-select; assessment type; question type; section; question topic/tag; set number where applicable.
- Learning: semester hierarchy → subject → chapter → topic; difficulty and importance where applicable.

Dependent selections are reconciled when a parent changes. Invalid children are shown before removal, then removed only when the user confirms Apply.

### C. Comparison and scoring

- Compare by: none, semester, branch, course, group, college, upload batch, assessment, learning subject, or topic.
- Time grain: day, week, or month; Auto chooses an appropriate grain for the range.
- Score mode: normalized percentage or absolute volume where the chart supports both.
- Ranking direction and N.

### D. Graph selection

- `Recommended` mode automatically selects the most useful valid graphs.
- `Custom` mode allows graph multi-selection.
- Graphs are grouped under Overview, Students, Topics, Assessments, Learning, and Coding.
- Each graph row shows `Available`, `Needs …`, or `Not relevant` with the reason.
- A user can save a local default layout in a later enhancement; V2 initially keeps selection in the URL/query state for shareable views.

### E. Apply behavior

The footer displays an estimated cohort/evidence scope before applying. Buttons are `Reset`, `Cancel`, and `Apply filters`. The server remains authoritative for access scope and validates every ID; the client never establishes authorization by hiding options.

## 5. Graph catalogue and visibility rules

V2 ships with at least the following 15 graph definitions. A graph registry, rather than JSX conditionals scattered through the page, owns required dimensions, required measures, default size, supported comparisons, and empty-state text.

| Graph | Meaning | Show when |
|---|---|---|
| 1. Multi-line activity trend | Unique problems solved, learning topics completed, and assessments attempted over time | Date/window data exists for at least one selected source; unavailable series are omitted |
| 2. Horizontal student ranking | Top/bottom students for the chosen normalized metric | At least two eligible students and a ranking metric with sufficient evidence |
| 3. Topic × student heatmap | Strong/weak cells for coding, learning, assessment, or combined topic mastery | Students are explicitly selected or cohort is at/below a safe heatmap limit, and topic evidence exists |
| 4. Topic performance bar | Attempts, solved/complete count, and rate by topic | A source exposes mapped topics |
| 5. Difficulty stacked bar | Easy/Medium/Hard performance by topic | Difficulty metadata exists for coding problems or assessment/learning items |
| 6. Assessment topic analysis | Normalized score and participation by assessment topic | One or more completed assessments contain scored, tagged questions |
| 7. Radar skill profile | Selected student/cohort skills such as DSA, Aptitude, DBMS, OS, CN, Communication | At least three skill axes have evidence; skills are derived from taxonomy, never guessed from names alone |
| 8. Learning → Practice → Assessment funnel | Population drop from eligible/learned through practiced, solved, assessed, and mastered | Cross-source topic mappings and a valid starting cohort exist |
| 9. Performance distribution | Student count across score bands | At least five eligible scored students |
| 10. Cohort comparison bars | Chosen KPI compared by semester/branch/group/batch/etc. | A comparison dimension is selected and has 2–12 groups |
| 11. Assessment score trend | Average/median normalized assessment score across completed assessments or time | At least two completed assessments or time buckets exist |
| 12. Learning completion hierarchy | Completion and engagement across subjects/chapters/topics | Learning is selected and progress definitions exist |
| 13. Problem/question conversion | Attempted → solved/correct conversion and largest gaps | Coding problems or scored assessment questions exist |
| 14. Engagement calendar | Daily active-student intensity | Date range is no more than one year and activity evidence exists |
| 15. Score vs effort scatter | Score/mastery against attempts or time, highlighting outliers | Student-level score and effort both exist for at least five students |

### Recommended graph selection

The registry assigns relevance points and selects a diverse default set instead of always showing the same charts:

- +3 when the graph directly matches an explicitly selected source;
- +2 when its required dimension was explicitly filtered (for example topic or assessment);
- +2 for a selected comparison/ranking mode;
- +1 when two or more sources allow a cross-source insight;
- disqualify if required evidence, taxonomy, minimum sample, or cardinality limit is missing.

Recommended mode returns 6–10 highest-scoring graphs while ensuring no more than two graphs communicate the same primary measure. Custom mode respects user choices but still suppresses invalid graphs and explains why.

Examples:

- One completed assessment: assessment topic analysis, distribution, ranking, question conversion, score-vs-time/effort.
- Multiple assessments: score trend, assessment comparison, distribution, ranking, topic analysis.
- Learning subject + semester: learning hierarchy, trend, cohort comparison, ranking, topic heatmap.
- Coding topic + top 100: ranking, topic bar, difficulty stack, conversion, trend, distribution.
- All sources + explicit students: multi-line trend, combined radar, heatmap, funnel, ranking, score-vs-effort.

## 6. Formula and evidence contract

All formulas will live in a dedicated, versioned backend file such as:

`backend/src/modules/adminAnalytics/analyticsFormulas.js`

No score formula will be duplicated in a React component or MongoDB pipeline without a shared named definition/test fixture.

### Source metrics

- **Coding attempts:** terminal `mode=submit` submissions in scope. Pending/running jobs are excluded from rate denominators.
- **Problem solved:** a unique student/problem pair with at least one `AC` result.
- **Coding acceptance:** `accepted terminal submissions / terminal submissions × 100`.
- **Coding mastery by topic:** `unique solved student/problem pairs / eligible student/problem pairs × 100` when an eligible problem set is known. Participation and conversion remain separate metrics.
- **Assessment score:** `score / maxMarks × 100` only when `maxMarks > 0` and evaluation is complete. Invalid attempts are counted separately, not converted to zero.
- **Multi-assessment score:** `sum(score) / sum(maxMarks) × 100`; also expose median student percentage so a large assessment cannot silently distort interpretation.
- **Assessment participation:** terminal submitted/violation attempts divided by students eligible for the selected assessment(s).
- **Learning completion:** completed scoped student/topic pairs divided by eligible scoped student/topic pairs. `videoWatchedSeconds` is engagement, not completion, unless the topic is explicitly marked complete.
- **Topic performance:** expose attempts/participants and an outcome rate; never add counts and percentages into one unlabeled score.
- **Consistency:** active preparation days in the chosen date window, normalized against available days with a documented cap.

### Combined overall score

Default weights:

- Coding mastery: 35%
- Assessment performance: 30%
- Learning completion: 20%
- Consistency: 15%

Weights are renormalized only across signals with sufficient evidence. A result must display its evidence coverage and cannot be labelled Overall when fewer than two sources are available; it becomes a source-specific score instead.

`overall = Σ(metric × availableWeight) / Σ(availableWeight)`

Minimum evidence defaults:

- Coding: at least 4 terminal attempts or 2 distinct attempted problems.
- Assessment: at least 1 valid completed assessment.
- Learning: at least 3 eligible topics or 1 completed topic plus engagement.
- Combined overall ranking: at least 2 source families.

The thresholds and weights are versioned constants, returned as response metadata, and covered by unit tests.

### Topic taxonomy

Cross-source charts require a canonical topic key. Add a mapping layer from coding tags, assessment question tags, and learning topic IDs to a canonical taxonomy. Raw label matching is only a migration fallback and must be marked low-confidence. If a reliable mapping is absent, combined heatmap/funnel/radar graphs are hidden rather than presenting false precision.

### Funnel definitions

- Eligible: students in the applied population with the scoped learning/topic assignment.
- Learned: completed the scoped learning topic.
- Practiced: made a terminal practice submission on a mapped problem.
- Solved: achieved AC on a mapped problem.
- Assessed: submitted a completed assessment containing a mapped topic.
- Mastered: meets the configured combined topic threshold with sufficient evidence.

Every stage is a subset of the prior stage. The API returns both count and previous-stage conversion percentage.

## 7. API and backend design

Create a dedicated module rather than growing `analyticsController.js`:

```text
backend/src/modules/adminAnalytics/
  adminAnalytics.routes.js
  adminAnalytics.controller.js
  adminAnalytics.validation.js
  adminAnalytics.authorization.js
  adminAnalytics.service.js
  analyticsFormulas.js
  analyticsRegistry.js
  pipelines/
    cohort.pipeline.js
    coding.pipeline.js
    assessment.pipeline.js
    learning.pipeline.js
  exports/
    export.service.js
    excel.renderer.js
    pdf.renderer.js
```

Endpoints:

- `POST /admin/analytics/query` — accepts the complete filter/query definition and returns summary, chosen graph datasets, warnings, formula version, and a query fingerprint.
- `POST /admin/analytics/estimate` — cheap cohort and result-size estimate for the drawer.
- `GET /admin/analytics/options?type=&q=&cursor=&dependencies=` — debounced, paginated option search for thousands of entities.
- `POST /admin/analytics/exports` — validates format, report type, columns, and filters, then creates a bounded export job.
- `GET /admin/analytics/exports/:jobId` — progress and signed/authorized download result.

Use POST for analytics queries because multi-select URLs can exceed safe query-string limits. Validate payload size, list cardinalities, ObjectIds, date span, rank N, graph IDs, and sort values. Apply admin/coordinator data scope before all user-supplied filters.

The response shape should be graph-oriented:

```json
{
  "meta": {
    "formulaVersion": "admin-analytics-v2.1",
    "generatedAt": "...",
    "queryFingerprint": "...",
    "cohortSize": 0,
    "evidence": {},
    "warnings": []
  },
  "summary": [],
  "graphs": [
    { "id": "student-ranking", "status": "ready", "config": {}, "data": [] },
    { "id": "skill-radar", "status": "not_relevant", "reason": "Requires three mapped skills" }
  ]
}
```

Only requested/recommended graphs are aggregated. Independent source pipelines run in parallel after one authorized cohort has been resolved.

## 8. Scale strategy

For thousands of students, assessments, and problems:

- never send every filter option inside an analytics response;
- use paginated typeahead and server-side select-all tokens rather than thousands of selected IDs;
- cap the interactive heatmap and scatter plot; return top/bottom or sampled points plus a full export option;
- place hard maximums on date windows and graph bucket counts;
- use `allowDiskUse` only for reviewed pipelines and project required fields early;
- cache query results by normalized query fingerprint plus authorization scope;
- cancel stale client requests with `AbortController`;
- asynchronously generate large XLSX/PDF reports with TTL cleanup;
- record query duration, scanned/returned counts, cache status, and export size without logging sensitive raw answer data.

Required indexes should be verified through `explain()` rather than added blindly. Likely compound-index candidates include:

- `Submission`: user + mode + createdAt; assessmentId + mode + createdAt; problem + mode + status;
- `AssessmentSubmission`: assessmentId + status + submittedAt; studentId + status + submittedAt;
- `Progress`: studentId + semesterId/subjectId; studentId + topicId already exists;
- `Assessment`: lifecycleStatus + endTime/startTime;
- `User`: role plus common cohort dimensions, guided by real query frequency.

## 9. Download/report builder

Clicking **Download** opens a modal/sheet with:

1. Format: **Excel (.xlsx)** or **PDF**.
2. Report: Executive summary, Student performance, Topic performance, Assessment analysis, Learning progress, Coding performance, or Full analysis.
3. Column selection grouped by Identity, Cohort, Coding, Assessment, Learning, Overall, and Evidence.
4. Sorting, top/bottom-N, include summary page, and include selected charts where supported.
5. Review line showing applied filters, estimated rows, selected columns, and file-size warning.

Excel contains a metadata sheet with generation time, filters, formula version, and warnings plus the selected data sheets. PDF is a paginated executive report with selected charts, readable tables, repeated headers, page numbers, and the same methodology metadata. PDF is not a screenshot of the dashboard.

Exports repeat authorization and formula calculation on the server. They do not trust rows already present in the browser. CSV is removed from the main V2 UI unless retained later as an explicit lightweight option.

## 10. Frontend module design

```text
frontend/src/admin/analytics/
  AdminAnalyticsPage.jsx
  api.js
  analyticsQuery.js
  graphRegistry.js
  hooks/
    useAdminAnalytics.js
    useAnalyticsOptions.js
  components/
    AnalyticsHeader.jsx
    ActiveScopeBar.jsx
    SummaryCards.jsx
    FilterDrawer.jsx
    GraphPicker.jsx
    GraphCard.jsx
    ExportBuilder.jsx
  charts/
    ActivityTrendChart.jsx
    StudentRankingChart.jsx
    TopicStudentHeatmap.jsx
    TopicPerformanceChart.jsx
    DifficultyStackedChart.jsx
    AssessmentTopicChart.jsx
    SkillRadarChart.jsx
    MasteryFunnelChart.jsx
    PerformanceDistributionChart.jsx
    CohortComparisonChart.jsx
    AssessmentTrendChart.jsx
    LearningHierarchyChart.jsx
    ConversionChart.jsx
    EngagementCalendar.jsx
    ScoreEffortScatter.jsx
```

Chart components remain presentation-only: they receive normalized data, render axes/tooltips/legends, and emit interactions. They do not fetch, filter, rank, or calculate business scores.

Large charts use horizontal scroll or virtualization where appropriate, keyboard-focusable tooltips/rows, non-color legends, and table fallbacks for accessibility. All graphs define loading, no evidence, filtered empty, partial evidence, and error states.

## 11. Migration and delivery sequence

### Phase 1 — Definitions and contracts

- Confirm formulas, completed-assessment rule, default overall weights, taxonomy source, and coordinator access.
- Add validation, formula module, graph registry, and contract tests.
- Establish golden fixtures where hand-calculated expected results cover coding, assessment, learning, missing evidence, and combined scores.

### Phase 2 — Query foundation

- Build authorized cohort resolver and paginated option endpoints.
- Build coding, assessment, and learning pipelines.
- Add query planner, visibility decisions, caching, limits, and observability.

### Phase 3 — Core UI

- Add route/navigation, header, summary cards, active scope bar, and professional drawer.
- Deliver graphs 1–8 and graph picker with relevance reasons.
- Preserve filter state in the URL through a compact serialized query or saved server-side query token.

### Phase 4 — Advanced visualizations and exports

- Deliver graphs 9–15.
- Implement server-generated XLSX/PDF and report/column selection.
- Add export job progress, retry, and expiry UX.

### Phase 5 — Migration and removal

- Redirect legacy coding routes.
- Replace the Assessment Reports embed/deep link.
- Remove the old `CompilerAnalytics.jsx` UI only after parity checks; retain any legacy API temporarily if other consumers still use it.
- Remove the old endpoint after telemetry confirms no active clients.

## 12. Verification and acceptance criteria

### Data correctness

- Golden tests prove every formula and denominator.
- Assessment totals match Assessment Reports for the same completed attempts.
- Learning totals match source Progress records for the same hierarchy.
- Coding totals match terminal submit records and do not count run/pending jobs.
- Missing evidence is `null/not available`, never silently zero.
- Top/bottom results use deterministic tie-breaking and minimum-evidence rules.
- Every funnel stage is less than or equal to the previous stage.

### Authorization and privacy

- Admin and coordinator scopes are tested at both options and query/export endpoints.
- IDs outside scope return no data and cannot be inferred through counts.
- Raw source code, assessment answers, proctoring media, IP, and user-agent details never enter analytics/export responses.
- Exports are access checked, expiring, and audited.

### UX/accessibility

- Drawer focus is trapped and restored; Escape and overlay close safely.
- Filters and graph picker are fully keyboard accessible.
- Charts have text/table summaries and do not rely on color alone.
- Mobile, tablet, common desktop, dark mode, empty, loading, partial-data, and large-data views are visually verified.
- Irrelevant graphs are absent or clearly disabled with a reason; no broken blank chart cards appear.

### Performance targets

- Cached interactive queries: p95 under 1 second.
- Uncached common queries: p95 under 3 seconds.
- Option search: p95 under 500 ms.
- UI returns a job immediately for reports too large for synchronous generation.
- Load tests cover at least thousands of students, thousands of problems, many assessments, high submission volume, and concurrent exports.

## 13. Decisions required before implementation

Recommended defaults are included so work can proceed unless product direction differs:

1. **Canonical route:** `/admin/analysis` — recommended.
2. **Completed assessment:** manually completed, or published with `endTime` in the past; only terminal evaluated submissions contribute scores — recommended.
3. **Overall weights:** Coding 35, Assessment 30, Learning 20, Consistency 15 with evidence-based renormalization — recommended.
4. **Coordinator scope:** add `coordinator.analytics.view` and migrate existing coding-analytics holders — recommended.
5. **Legacy page:** redirect old coding analytics URLs after V2 core graphs are ready, then remove old UI after parity validation — recommended.
6. **Export formats:** XLSX and PDF only in the primary UI — matches the requirement.

