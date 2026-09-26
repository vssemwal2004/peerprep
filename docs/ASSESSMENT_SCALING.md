# Assessment scalability runbook

This document describes the production shape required for live assessments. Capacity is established by load tests and service-level objectives, not by a user-count claim alone.

For the implemented persistence/queue protocol and staged migration, see
[Assessment scaling v2](ASSESSMENT_SCALING_V2.md) and
[load-test instructions](../load-tests/ASSESSMENT_TESTING.md).

## Request model after the scalability refactor

- Answer edits stay in browser state and a local recovery draft.
- Autosave sends only changed answers every 25–35 seconds.
- Autosave and heartbeat timers include jitter to avoid synchronized request waves.
- `Save & Next` changes navigation only; it does not force a database write.
- Final submit sends the complete answer set and waits for an in-flight autosave.
- Heartbeats use atomic durable checkpoints; new monitoring lives in a separate event collection.
- Authentication session state is cached in Redis/Valkey, with MongoDB fallback.
- API, execution workers, mail processing, and singleton schedules can run as separate processes.

## Current single-VPS deployment

The three-slice VPS is suitable for staged validation and hundreds of concurrent candidates, not a guaranteed 2,000-candidate event. Run the API and worker roles from `backend/ecosystem.production.cjs` and keep MongoDB/Redis bound to localhost.

Required environment settings are documented in `backend/.env.example`.

Before an assessment:

1. Verify `/api/health/ready` returns HTTP 200.
2. Verify MongoDB indexes with `npm run migrate:performance-indexes` during a maintenance window.
3. Stop report exports, migrations, bulk uploads, and backups during the live window.
4. Open login 15–20 minutes before the assessment starts.
5. Run the staged k6 test at 50, 100, 200, then 300 users.

## Target topology for 2,000 concurrent candidates

Use at least two stateless API nodes behind a load balancer, a dedicated Redis service, a dedicated replicated MongoDB deployment, object storage, and separate execution/maintenance workers. Do not place every role on the three-slice VPS.

Each API node must set:

```env
START_EXECUTION_WORKERS=false
START_SCHEDULED_JOBS=false
START_MAIL_WORKER=false
```

Run exactly one maintenance-worker replica. Scale compiler and assessment workers independently from API traffic.

Before running multiple Socket.IO API replicas, configure a shared Socket.IO Redis adapter and load-balancer WebSocket support. Without the shared adapter, room events are local to one API process.

## Load-test gates

Do not approve the next stage unless all conditions hold:

- HTTP failure rate below 1%.
- Heartbeat p95 below 1 second.
- Autosave p95 below 2 seconds.
- Final-submit p95 below 5 seconds.
- API CPU sustained below 70–75%.
- MongoDB has no sustained queue, page faults, or disk saturation.
- Redis memory and command latency remain stable.
- No continuous swap-in/swap-out activity.

The production test script is `load-tests/assessment-production.js`. Use synthetic accounts and a dedicated assessment, and reset only that assessment's submissions between stages.

## Remaining deployment gates

These are required before claiming 2,000-user high availability:

- Configure a private evidence bucket for the implemented signed direct-upload path.
- Configure the implemented shared Socket.IO adapter and proxy behavior.
- Enable the maintenance role for precomputed report summaries and durable work dispatch.
- Add multi-node MongoDB replication, automated backups, restore drills, metrics, and alerts.
- Run the full 2,000-user test from distributed load generators and test the simultaneous-submit wave.

