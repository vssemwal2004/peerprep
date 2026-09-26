# Assessment reports under load

Dashboard summaries now read `AssessmentReportSummary`, joined through authorized
assessment records. They no longer scan answers or finalize expired attempts
during the HTTP request. Coordinator ownership and selected assessment filters
apply before summaries are joined.

The maintenance process starts a leased, bounded summary worker. Final evaluation
dispatch requests a refresh before acknowledging its durable work; a failed refresh
request leaves that work retryable. Repeated changes coalesce into one summary.
The worker rebuilds at most five summaries per pass, with a three-second MongoDB
budget per aggregation, and spaces repeated rebuilds by 15 seconds. A version
counter preserves a refresh requested while an aggregation was in progress.

Legacy and deleted/changed records are reconciled through a cursor-based background
scan of 25 assessments every 30 seconds. This also handles a restart between source
changes and refresh requests. Backfill duration depends on the assessment count.
Before the first successful refresh, APIs return `summaryPending` and null score
statistics; clients should show an updating state. `summaryAsOf` identifies the
snapshot timestamp. Summaries are intentionally eventually consistent.

Pending and failed evaluations are reported separately. They do not contribute
zero scores, failures, distributions, or ranks. Student and admin result views
show evaluation pending or review required until scoring is complete. Legacy
coding report reconstruction is read-only and cannot overwrite submitted answers.

## Remaining synchronous work and exact limits

Custom filtered candidate reports still query live submissions. They have at most
two concurrent requests per API process, an eight-second overall database query
budget, and a three-second limit for any one aggregation. Queries exclude large
answer/evidence fields where not needed. A busy/over-budget request returns 503
with `Retry-After: 10`; it does not extend timeouts indefinitely.

Detailed JSON/Excel and CSV exports remain synchronous. They are limited to one
concurrent export per API process, 500 candidates, and 10 MiB of input/output JSON.
The cursor reads small batches and rejects excess with 413 and
`REPORT_EXPORT_TOO_LARGE`. Narrow filters to export bounded groups. CSV uses the
same exporter and cannot silently return only the first 100 rows as before.
These are admission limits per process, not a cluster-wide queue. Multiple API
processes multiply those concurrency ceilings.

An asynchronous full-dataset export workflow (durable job, object-store artifact,
authorization-checked download, retention and retry UI) is not implemented here.
It remains the next step when complete multi-thousand-candidate exports are needed
without partitioning filters. Do not describe current exports as queued.

The new model's indexes are included in the assessment protocol migration.
Assessment deletion must remove its summary, and student/attempt deletion requests
summary invalidation. Periodic reconciliation is a fallback rather than a reason
to skip those deletion hooks.

Validation: isolated MongoDB tests cover coalesced refreshes, pending grading,
legacy discovery, deletion refresh, coordinator isolation, selected report/detail
pending states, oversized export rejection, and report concurrency slot release.
