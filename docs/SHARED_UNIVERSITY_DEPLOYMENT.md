# PeerPrep production deployment

One frontend build and one backend release serve `peerprep.co.in`. Separate
control and university frontend/backend installations are no longer supported.
University
pages live at `/u/<universityId>/...`; API calls use `/api/u/<universityId>/...`.
The existing main/control MongoDB holds university registrations, permissions,
shared questions and shared assessment definitions. Each university's MongoDB
holds its own users, authored local content, attempts, results and progress.
Each university has a configured Judge0 endpoint. The browser never connects
to MongoDB or Judge0 directly.

## Configuration

Set `PEERPREP_DEPLOYMENT_ROLE=shared` on the API, queue workers and maintenance
worker. The old `control`, `university` and `standalone` settings now fail at
process startup. `MONGODB_URI` points to the existing main/control database. Set the
same strong `JWT_SECRET` and `PEERPREP_TENANT_SECRET_KEY` on all those processes;
the latter is a base64-encoded 32-byte value and encrypts stored university
connection settings. Back up this key securely. Losing it makes the encrypted
connection settings unreadable. Set `PEERPREP_SHARED_API_ORIGIN` on workers to
the reachable main API origin; it defaults to loopback only for workers embedded
in the API process. Keep MongoDB and Judge0 private to the backend network.

Build the frontend once with a single API origin, normally the same domain.
There is no frontend deployment-role variable. The URL decides whether the
visitor is on the platform or a university page. Configure your web server to return the
frontend SPA for `/u/*` as well as the existing frontend routes, and to send
`/api/*` and Socket.IO traffic to the backend. Use HTTPS and
`FRONTEND_ORIGIN=https://peerprep.co.in`. In this mode `/admin/platform` is the
main super-admin area; `/u/<id>/admin` and `/u/<id>/student` are university
areas. A session is tied to one university, so opening another university in
the same browser requires a new login.

Run the existing platform index migration and bootstrap against the main DB.
Do not run the old university bootstrap with the main DB URI. API replicas
should set `START_EXECUTION_WORKERS=false`, `START_SCHEDULED_JOBS=false`, and
`START_MAIL_WORKER=false`. Start the compiler, assessment and maintenance
workers once or scale queue workers deliberately. Keep one maintenance worker
to avoid redundant sweeps. Redis/Valkey remains shared across API replicas for
queues, rate limits and Socket.IO. Long-polling Socket.IO connections require
session affinity at a future load balancer.

## Production cutover checklist

1. Back up the main MongoDB, every existing university MongoDB, Redis queue
   state and object storage. Keep the current `JWT_SECRET`. Generate one
   `PEERPREP_TENANT_SECRET_KEY` with `openssl rand -base64 32`, store it in your
   secret manager and use that same value for every API and worker process.
   Never rotate it without re-encrypting saved university connection settings.
2. Deploy one backend release. On the API and every queue/maintenance worker,
   set `PEERPREP_DEPLOYMENT_ROLE=shared` and point `MONGODB_URI` to the main
   database. Set `FRONTEND_ORIGIN=https://peerprep.co.in` and
   `FRONTEND_URL=https://peerprep.co.in`. Workers on another machine also need
   `PEERPREP_SHARED_API_ORIGIN` pointing to the reachable main API. Remove the
   old `PEERPREP_UNIVERSITY_ID`, `PEERPREP_CONTROL_URL`,
   `PEERPREP_SHARED_API_KEY` and inspection-key settings from deployment
   secrets; they are not part of this flow.
3. Build and deploy one frontend for `peerprep.co.in`. Remove
   `VITE_PEERPREP_DEPLOYMENT_ROLE` from its build environment. Set `VITE_API_URL`
   only if the API has a different public origin. Proxy `/api/*` and
   `/socket.io/*` to the backend, and serve the same frontend SPA for `/u/*`
   and other frontend routes. Keep HTTPS and WebSocket upgrades enabled.
4. Run the platform index migration and main-admin bootstrap once against the
   main DB. Start API processes with embedded execution workers and scheduled
   jobs disabled if dedicated workers are used. Start compiler and assessment
   queue workers and one maintenance worker with the same shared environment.
5. In `/admin/platform`, register each university's existing DB URI and its
   Judge0 endpoint. Existing admins keep their current passwords. Enter
   optional Judge0 auth and AI-interview service settings there. Set module
   permissions and publish shared assessments. Test one university before
   repeating this for the others.
6. Run `npm run migrate:login-directory` in the backend after all existing
   universities are registered. Verify a unique student email can log in at
   `https://peerprep.co.in/student` and a duplicate email is rejected there.
7. Move university users to `https://peerprep.co.in/student`, or give them
   their direct `https://peerprep.co.in/u/<id>/student` link. Drain old
   workers and active exams, migrate old object keys as described below, and
   stop the old university frontend/backend installations after verifying the
   new portal. Keep the university DB and Judge0 machines running.

The superadmin page itself shows the registration → permissions → student
creation → exam flow and the connection status of every university. Browser
users never enter MongoDB or Judge0 credentials.

## Student sign-in

The main landing page opens the regular `/student` login form. Students enter
their registered email and password; no university selector or university field
is shown. The backend uses a keyed email lookup in the main database to find
the university, then verifies the password in that university database. The
main lookup stores no student password or plaintext email. If an email exists
at more than one university, the main login asks the student to use their
university-specific `/u/<id>/student` link. That direct link still accepts
student and coordinator IDs.

Before sending production traffic to the main login, run
`npm run migrate:login-directory` once against the main DB. It reads existing
university users and builds the email lookup. New and edited accounts update
the lookup automatically. Until this backfill finishes, the backend checks
active university databases for a matching email, which is slower and should
not be used for a large exam login wave. Re-run the backfill after restoring a
university database from backup. Keep the tenant secret key stable because it
also keys the email lookup.

## New university

1. In **Universities**, enter the university ID and MongoDB URI, then click
   **Test MongoDB connection**. This read-only check verifies reachability and
   that the database is empty or already belongs to that university. The URI
   cannot be saved in the dashboard until this check succeeds. Complete the
   name, Judge0 URL, and initial university-admin email/password. If Judge0 requires an auth
   header, enter its header name and token. If AI interviews are used,
   enter that university's interview service URL and secret. The backend checks that the
   MongoDB identity is unclaimed or belongs to that same ID. The save request
   checks the connection again before storing the URI
   and Judge0 URL encrypted and never sends them back to the browser.
2. The backend builds that university's indexes and seeds its local master data
   and email templates. It creates the first admin in a new DB. If that admin
   email already belongs to an admin in an existing university DB, the account
   and its current password are preserved.
3. Set permissions and shared learning source in the same dashboard. Published
   public questions are shared; centrally assigned assessment definitions are
   shared only with assigned universities. Student submissions and results
   remain local to their university DB.
4. University admins create coordinators and students in their own DB through
   the normal admin screens. Students log in under `/u/<id>/student`.

## Existing university cutover

Back up the main DB, each university DB, and evidence/object storage. Do not
merge university DBs. For each existing university registration, enter its
existing MongoDB URI, Judge0 URL, optional Judge0 credentials and any interview service settings in the dashboard. Its existing
`peerprep_deployment_identity` must say `role: university` and match its ID.
Run the university's pending schema/index migrations against that DB before
cutover. Confirm its accounts, local content, attempts, reports, queued work,
and evidence are present. Existing evidence and hidden-testcase object keys
without a university prefix need a storage migration before enabling shared
reads. Copy objects, update stored keys, and verify them before cutover.

Drain the old university workers and active exams before moving that
university's traffic to `/u/<id>`. Verify login, student creation, MCQ grading,
coding/Judge0, assessment results, permissions, email, sockets and shared
content for one university first. Then migrate the remaining universities.
Retire the old frontend/backend VPS installations only after those checks.
Keep the separate databases and Judge0 machines.

## Scaling and operations

The backend remains one codebase even if multiple identical API instances are
added behind a load balancer. Tenant identity is carried in the signed session,
queue jobs, cache keys and socket rooms. Each API instance opens bounded pools
to active university DBs; size `MONGODB_TENANT_MAX_POOL_SIZE` with the number
of API/worker processes and each database server's connection capacity in mind.
The main DB and the shared API are still possible bottlenecks. Load-test
simultaneous starts, saves, coding runs and final submissions before a large
exam; the architecture itself does not guarantee a student count.
