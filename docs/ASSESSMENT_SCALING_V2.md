# Assessment persistence and worker rollout

This change prepares the **code path** for staged 2,000-candidate validation. It
does not certify the current VPS for 2,000 candidates. No production migration,
load test, deployment, credential rotation or data deletion is performed by this
implementation.

## Request path and durability boundary

```text
Browser state + account/attempt-scoped recovery draft
  -> serialized, jittered answer deltas (25-35 seconds)
  -> API authentication + authoritative assignment/schedule check
  -> MongoDB revision-checked attempt update
  <- accepted sequence/revision (only then show server-saved)

Final answer set + terminal status + receipt + pendingWork
  -> ONE atomic MongoDB update
  <- durable submission receipt; evaluation may still be pending
  -> leased dispatcher -> BullMQ -> bounded compiler/evaluation workers
  -> fenced grading update -> report summary refresh
```

MongoDB remains the source of truth for answers. Redis/Valkey is not a write-behind
buffer for student answers. Queue loss cannot erase an accepted answer set:
`pendingWork` remains in the same attempt document and is redispatched. At-least-
once jobs are expected; stable IDs and version/generation/source checks prevent
duplicate or stale results from overwriting a newer attempt. This is not a claim
of exactly-once external execution.

`AssessmentSubmission` remains the bounded hot aggregate for one student/exam.
Splitting every answer into a separate document is deliberately not required.
The write helper retries compare-and-set conflicts; it does not retry external
side effects inside the mutation. Heartbeat checkpoints participate in the same
revision boundary. Old retakes are copied to `AssessmentAttemptArchive` before
the next generation starts.

## Responsibilities

| Component | What it owns | What it must not own |
| --- | --- | --- |
| API | Authorization, setup/session policy, bounded saves, durable receipt | Running compilation or synchronous final grading |
| Cache Valkey | Auth cache, immutable question definitions, short presence checkpoints, shared realtime | Sole copy of answers or final receipt |
| Queue Valkey + BullMQ | Delivery/retry of execution jobs | Proof that a student's answers were durably accepted |
| MongoDB | Attempts, work intents, execution records, report summaries, event metadata | Embedded base64 evidence on new attempts |
| Compiler/evaluation workers | Bounded execution and fenced result persistence | Changing a completed attempt's identity or accepting new answers |
| Maintenance worker | Expiry, durable-work dispatch, coalesced report refresh, mail | Unbounded full-dataset scans in an HTTP request |
| Private object storage | Camera image objects with signed writes/reads | Publicly readable assessment evidence |

Use Redis **or** Valkey, not both for the same role. Separate cache and queue
instances/URLs permit eviction for cache and `noeviction` plus persistence for
queues. Kafka is not introduced: this bounded workflow needs a job queue, not a
second event-stream infrastructure stack. See
[queue/runtime migration](ASSESSMENT_QUEUE_MIGRATION.md).

## Save protocol

- Each request has an attempt generation, submission identity, mutation ID and
  gap-free save sequence. A timed-out request is retried with the identical body.
- A later delta is not sent until the earlier batch is acknowledged/reconciled.
- Editing after an in-flight batch does not clear those new edits on its ack.
- Final submit freezes the final payload. An uncertain outcome retains it for
  retry; a transport error is not displayed as successful submission.
- A receipt is a terminal-state receipt, not necessarily acceptance of a late
  payload. `answersAccepted: false` is displayed explicitly. After expiry, the
  last accepted answers are graded unless the assessment explicitly permits
  late submission.
- IndexedDB recovery is best effort with local fallback. Browser deletion,
  private-mode restrictions or device loss cannot be solved by a local draft;
  only a server acknowledgement establishes server durability.
- Older clients can omit the ordered protocol during rolling deployment. After
  active sessions are drained, enable `ASSESSMENT_REQUIRE_SAVE_PROTOCOL=true`.
  Do not describe legacy unversioned writes as ordered/idempotent.

## Hot-path reductions

Large question definitions are cached by database identity/version/update time.
Assignment, password, schedule and lifecycle metadata still come from MongoDB;
stale cache entries cannot grant access to a removed candidate. Concurrent local
cache misses are coalesced. Cache failure falls back with bounded command waits.

Unchanged heartbeat telemetry can reuse a 25-second checkpoint. It does not
renew that checkpoint indefinitely and never supplies answer/save authority.
Pause changes bypass this optimization. Automatic client-claimed offline-time
credit is disabled by default; opt-in credit is server-gap-based and capped.

Per-process admission caps (`ASSESSMENT_API_INFLIGHT_LIMIT=48`,
`ASSESSMENT_FINAL_INFLIGHT_LIMIT=32`) reserve final-submit slots separately
from other exam traffic. Overload gets HTTP 503 with Retry-After, not an
unbounded waiting queue. Browser retries retain the identical batch. Tune
these concurrency caps with pool limits and measured latency; they are not
student capacity counts.

New monitoring events and image metadata live in `AssessmentEvent`, not the hot
answer document. The admin timeline fetches a bounded page; `nextEventCursor`
can be passed as `before` for older entries. Historical embedded monitoring is
still readable. It is not destructively rewritten during the protocol migration.

Dashboard counts use asynchronously refreshed `AssessmentReportSummary` rows.
Pending/failed grading is not displayed as a final zero score. Filtered details
and exports have query time/concurrency/size bounds. Export work is **bounded
synchronous work**, not an implemented asynchronous export-job system.
See [report limits and freshness](ASSESSMENT_REPORT_SCALING.md) for exact limits.

## Private evidence storage

Create a **private** Supabase Storage bucket and configure
`ASSESSMENT_EVIDENCE_BUCKET`. Set bucket-side allowed image MIME types
(`image/jpeg`, `image/png`, `image/webp`) and maximum file size matching
`ASSESSMENT_EVIDENCE_MAX_BYTES` (default 1 MiB). Use a server service-role key;
never expose it to the browser. Optionally set a dedicated
`ASSESSMENT_EVIDENCE_SIGNING_SECRET`; otherwise the application JWT secret signs
the short-lived ownership token.

The API issues an attempt-scoped object key and signed PUT URL. The browser
uploads directly and commits metadata; the server verifies object ownership,
generation, size and MIME before recording it. Admin reads are separately
authorized and use a 120-second signed URL. With no configured bucket, legacy
image uploads remain compatible but are stored in the **separate** event
collection. A configured upload failure must not silently fall back through the
API. Storage policies/quotas are still required to prevent abandoned-upload
abuse. Set an explicit evidence retention and orphan-cleanup policy. Deleting
an attempt removes event/archive records, but does not synchronously enumerate
and delete object-store blobs.

## Safe deployment order (maintenance window)

1. Back up MongoDB and verify restore procedure. Do not run this during a live
   exam. Confirm one intended `MONGODB_URI`; eliminate duplicate environment
   entries manually without copying secrets into logs.
2. Install the lockfile dependencies (`npm ci` in each application). The queue
   stack requires a supported Redis/Valkey runtime (Redis 6.2+), not the old
   Windows Redis 3 build used by some developer machines.
3. Stop new job intake and drain the **legacy custom queues** before switching
   to the versioned BullMQ namespace. Follow the runtime migration runbook;
   old Redis lists are not BullMQ jobs and are not silently consumed.
4. Audit the protocol migration, then apply only to the confirmed database:

   ```bash
   cd /root/peerprep/backend
   node --env-file=.env scripts/migrateAssessmentProtocol.js
   # Replace the database NAME below if yours is not peerprep (not a URI).
   CONFIRM_ASSESSMENT_DATABASE=peerprep node --env-file=.env scripts/migrateAssessmentProtocol.js --apply
   node --env-file=.env scripts/migrateAssessmentProtocol.js
   ```

   It backfills missing protocol fields/receipts, recovers unfinished historical
   grading intent and creates additive indexes. It preserves answers and completed
   grades. CAS-skipped records require a rerun. No `syncIndexes`, collection drop,
   full-database restore or credential printing is used.
5. Deploy API and maintenance/evaluation/compiler roles from the same release.
   Use the separate bootstrap command for seed/normalization maintenance; API
   startup no longer runs those jobs on every replica. Start one maintenance
   role unless each schedule has its own distributed coordination.
6. Deploy the matching frontend. Smoke-test login, setup, save, reload/recovery,
   submit retry, pending evaluation, final score and authorized evidence view.
   Enable strict save protocol after old client sessions are drained.
7. Confirm readiness and monitor queue lag, pendingWork age, save latency,
   database connections, event-loop lag, CPU, disk, memory and worker retries.
   A degraded cache/queue is visible; it must not turn into unlimited MongoDB
   fallback or unlimited in-process backlog. Set request/admission limits for
   the measured capacity of the deployment.

Never roll a live exam back to an old binary that overwrites the new state using
unfenced saves. Retain a database backup and coordinate rollback with a paused
exam window and compatible versions. Feature/data migration is additive, but
binary rollback is not automatically safe.

## Verification and outstanding gates

Local verification uses ephemeral MongoDB instances, never the configured
production database. Tests cover save races, final/expiry receipts, worker
recovery/fencing, retakes, draft protocol, reports and infra degradation.
Redis-dependent integration tests must run against an isolated supported
Redis/Valkey instance. See [load-test instructions](../load-tests/ASSESSMENT_TESTING.md)
for distinct synthetic accounts, actual answer-array payloads, read-back
validation and the final-submit wave.

Before a 2,000-student event, test 50 -> 100 -> 300 -> 500 -> 1,000 -> 2,000 with
hold periods and abort gates. Also test API restart after commit/before reply,
queue restart/loss, worker crash after result save, DB timeout and browser
offline/reload. HTTP 200 counts alone are not evidence of answer durability.

Remaining operational/correctness limits are explicit:

- Hardware capacity, replica-set durability/failover, backups, storage policies,
  proxy timeouts/limits and distributed 2,000-user load remain deployment gates.
- Per-attempt session fencing is enforced. The old *one active exam across
  different assessments* check is not a cross-document atomic invariant. A
  simultaneous begin of two different exams needs a separately approved strict
  uniqueness/transaction policy if that global rule is required.
- The admin event endpoint is paginated, with an explicit older-events action
  and separately authorized short-lived evidence reads.
- New violation event export is separate from its authoritative bounded attempt
  log; a process crash between those writes can leave the external audit row
  absent until the same event is retried. Answers and final receipts do not use
  that two-write path.
- Report exports are bounded, not fully moved to a durable export job API.
- Old embedded evidence and object-store lifecycle cleanup need an explicit
  retention migration; this release does not delete historical evidence.

These limits must not be hidden behind a claim that the architecture is
"perfect" or that buying a larger server alone proves capacity.
