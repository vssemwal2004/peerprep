# Assessment queue and API infrastructure rollout

The execution queue is now BullMQ behind the existing `compilerQueue`,
`submissionQueue` and `assessmentQueue` interfaces. Cache and queue clients have
separate configuration and bounded producer requests. Redis 6.2+ or compatible
Valkey is required for the queue. The older Redis 3 installation is insufficient.

## Local configuration and checks

Use `CACHE_VALKEY_URL` for disposable cache/session/rate-limit state and
`QUEUE_VALKEY_URL` for the execution queue. The existing `VALKEY_URL`, `REDIS_URL`
or host/port variables remain fallbacks. They can share a local development
instance. For deployed workloads, queue persistence and `maxmemory-policy
noeviction` must not be undermined by cache eviction; separate Redis database
numbers on one instance do not isolate memory policy.

Run `npm ci` in `backend`. On a new installation, run `npm run bootstrap`
explicitly to create the initial administrator, email templates and master data.
API replicas no longer seed these records during every startup. Bootstrap is a
write operation on the configured MongoDB; point it at the intended environment.

`npm test` covers deterministic job identity, compatibility conversion,
readiness decisions, bounded timeouts and rate-limit fallback. An optional
integration test requires a dedicated local Redis/Valkey instance; it never loads
`.env` and only accepts a loopback address:

```powershell
$env:TEST_QUEUE_URL = 'redis://127.0.0.1:6380'
node --test test/queueIntegration.test.js
Remove-Item Env:TEST_QUEUE_URL
```

The integration test uses a random key namespace, verifies duplicate publication
and transient retry, and deletes only that namespace afterward. A skipped test
does not establish broker compatibility, failover or 2,000-user capacity.

## Cutover from the custom list queue

The BullMQ namespace is `peerprep:bullmq:v1`; the old queue uses
`peerprep:execution`. New consumers cannot process old list/hash records. Do not
roll API/worker versions independently while an assessment is running.

1. Schedule a maintenance window with no active assessment or incoming compiler
   work. Stop producers on the old release while keeping its workers running.
2. Keep a checkout/release of the previous worker code until cutover is complete.
   Inspect the old broker using `npm run queues:legacy-status` from the new code.
   If moving brokers, set `LEGACY_QUEUE_URL` to the **old** broker; otherwise it
   defaults to the queue endpoint. The command reads counts only.
3. Require zero `waiting`, `processing` and `delayed` entries in all three queues.
   Investigate failed/stuck jobs from durable execution records. Do not flush the
   broker or delete pending jobs to make the check pass. Recover with the old
   workers where necessary; preserve data before any manual repair.
4. Stop old workers. Install the new dependencies, apply application migrations,
   and start the new workers and API together. New producers/consumers refuse to
   start queue operations while live old queue entries are found.
5. Verify a coding submission, final evaluation, notification, retry and report
   refresh with dedicated test data. Confirm dispatcher pending-work records
   resolve, and readiness reports `queue.ready: true`.

Never allow the old workers and BullMQ workers to grade the same in-flight
attempt. After the first new-format submission/job is written, rollback requires
the new queue and durable pending work to be drained or reconciled as well; a
blind code rollback is not sufficient.

## Failure and multi-node behavior

- Submission acceptance and answers remain in MongoDB. Queue publication uses a
  deterministic internal ID, with the original tracking ID preserved for workers.
  The durable assessment dispatcher replays pending work. A producer timeout is
  ambiguous; replay uses the same ID instead of creating another evaluation.
- BullMQ retains completed/failed IDs for bounded retention, retries transient
  failures and recovers stalled jobs. Database evaluation-version guards remain
  essential after retention expires or queue data is restored. Explicit failed
  recovery is capped and exhausted jobs require review.
- API and worker shutdown stop new work and wait for a bounded drain. Forced
  exit leaves unacknowledged jobs recoverable after lock expiry. Worker effects
  must remain idempotent because an interrupted process can still have committed.
- `/api/health/ready` checks a bounded MongoDB ping, reports cache/queue/realtime
  health, and remains HTTP 200 with `degraded: true` when only optional components
  fail. This allows MongoDB answer saves and durable submission acceptance to
  continue; it does **not** mean code execution/results are immediately available.
  Alert on degradation and pending evaluation age, not only the HTTP status.
- Cache commands have bounded timeouts and no offline command queue. During an
  outage session state is checked against MongoDB; API rate limits fall back to
  local shadow counters. These limits become per process, not globally exact.
- Socket.IO uses a shared Redis adapter; dedicated execution workers publish via
  the matching emitter. `SOCKET_VALKEY_URL` optionally overrides the cache broker.
  HTTP long polling still needs sticky load-balancer sessions. Socket.IO Redis
  Pub/Sub does not persist missed events: reconnecting clients must refetch
  authoritative job/result/notification state. Per-process connection guards are
  local abuse controls, not a global concurrent-connection guarantee.

Useful references: [BullMQ connections](https://docs.bullmq.io/guide/connections),
[job identity](https://docs.bullmq.io/guide/jobs/job-ids),
[worker shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown), and
[Socket.IO Redis adapter](https://socket.io/docs/v4/redis-adapter/).

## Saving protocol and time-credit cutover

`ASSESSMENT_REQUIRE_SAVE_PROTOCOL=false` temporarily accepts older clients. New
clients send the server submission ID, attempt generation, mutation ID and save
sequence. When the new frontend is deployed and old active clients have drained,
set the flag to `true`: unversioned autosave/final requests receive HTTP 426
`CLIENT_UPGRADE_REQUIRED`. This is needed before claiming all saves use ordered
replay protection. Supplied submission IDs are always checked, even in legacy
mode. A terminal receipt acknowledges the incoming answers only if its sequence,
ID and normalized payload match the batch originally committed.

Automatic network time credit is disabled by default. Browser-reported
`networkPauseStartedAt` no longer extends the exam by itself. If explicitly
enabled via `ASSESSMENT_NETWORK_PAUSE_CREDIT_ENABLED=true`, only server-observed
heartbeat gaps above 60 seconds can earn credit, capped at five minutes per
incident and a conservative ten minutes of total paused time. No credit can
revive an already expired or manually closed assessment, and a security pause
does not earn an additional overlapping network credit. Offline drafts remain
recoverable but their acceptance is still subject to the server deadline.

Per-attempt session changes are compare-and-set fenced. The existing check for
one fresh assessment per student spans distinct submission documents; two
different exams can still race at begin. Enforcing a global single-active-exam
invariant needs an explicit policy/migration and a transaction or unique active
ownership model. This release does not claim that stronger global guarantee.
