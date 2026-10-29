# PeerPrep Interview Revision

> Evidence basis: the repository as inspected on 12 July 2026. Statements marked **Not verifiable from the repository** require deployment data, production metrics, or history outside Git. This document describes implementation, not marketing claims.

## 1. Project Summary

PeerPrep is a full-stack placement-preparation and interview-management platform. It serves students, coordinators, and administrators. The implemented system combines student onboarding, learning content, coding practice, timed assessments, browser/AI-assisted proctoring, interview event pairing and scheduling, feedback, notifications, and analytics.

The original README calls it an “interview scheduling and feedback system,” but the codebase has grown well beyond that description. Admins/coordinators manage students, events, problems, question libraries, assessments, announcements, email templates, and reports. Students practise problems, take assessments, attend paired interview sessions, submit feedback, and view analytics.

Implemented: JWT login, forced password change, role/permission protection, MongoDB persistence, coding execution through Judge0, Valkey-backed execution jobs, assessment scoring, client-side proctoring, Socket.IO notifications, email, event/pairing/scheduling, and analytics. Partly evidenced: production cloud deployment and operational scale. No generative-LLM interview/question/answer pipeline was found. “AI” in code primarily means on-device MediaPipe/TensorFlow proctoring and deterministic analytics.

## 2. Complete Technology Stack

### Frontend

- React 19 + React DOM: SPA UI (`frontend/src/main.jsx`, `App.jsx`).
- React Router 7: routing/protected role areas (`App.jsx`, `StudentProtectedRoute.jsx`, `AdminProtectedRoute.jsx`, `CoordinatorProtectedRoute.jsx`).
- Vite 7: build/dev server (`vite.config.js`, `package.json`).
- Tailwind/PostCSS plus CSS: styling (`tailwind.config.js`, `postcss.config.cjs`, `index.css`).
- Recharts: analytics charts; Monaco-style editor UI is implemented in `admin/compiler/MonacoCodeEditor.jsx` (Monaco itself is not listed as a dependency).
- Socket.IO client: notifications (`utils/socket.js`, `context/SocketContext.jsx`).
- MediaPipe Tasks Vision, TensorFlow.js, COCO-SSD: browser proctoring (`features/assessment/proctoring`).
- XLSX, PapaParse-like CSV flows, Fuse.js, Lottie, Lucide, Framer Motion: exports/imports, search and UI. Only dependencies referenced by source are genuinely used; dependency presence alone is not proof.

### Backend and data

- Node.js ES modules + Express 4 (`server.js`, `setupApp.js`).
- MongoDB/Mongoose (`utils/db.js`, all files under `models`). MongoDB driver is also installed.
- bcrypt passwords, jsonwebtoken JWT, HttpOnly cookies (`User.js`, `authController.js`, `middleware/auth.js`, `utils/jwt.js`). No refresh-token implementation was found.
- Socket.IO server (`server.js`).
- Judge0 REST API (`services/executionService.js`).
- Redis-compatible Valkey queues and distributed rate-limit storage (`utils/valkey.js`, `queues/*`, `middleware/rateLimiter.js`). This is custom queue code, not BullMQ.
- AWS SDK S3 for testcase objects (`utils/s3.js`); Supabase Storage and Cloudinary utilities also exist. Exact production provider use is not verifiable.
- Nodemailer SMTP, node-cron, Winston and Morgan (`utils/mailer.js`, `jobs/*`, `utils/logger.js`, `setupApp.js`).
- Tests use Node’s built-in test runner and mongodb-memory-server (`backend/test`). No frontend test framework is configured.

## 3. Complete High-Level Architecture

```text
Browser (React/Vite)
  | HTTPS JSON + credential cookies       | authenticated Socket.IO
  v                                       v
Express middleware: Helmet/CORS/body limits/sanitize/log/timeout/rate limit
  -> route -> authentication -> role/permission -> controller/service
       |              |                  |              |
       v              v                  v              v
    MongoDB       Valkey queues       Judge0 REST    SMTP/S3/Supabase/Cloudinary
                       |
                 embedded or separate workers
                       -> ExecutionJob/Submission/AssessmentSubmission
```

Normal CRUD is synchronous request/response. Judge0 work is normally accepted as HTTP 202, queued, processed asynchronously, persisted, and polled by the frontend through result APIs. Judge0 itself is called with `wait=true`, so each worker waits synchronously for one Judge0 result. Cron analytics/reminders, mail, queues, and Socket.IO updates are asynchronous. There is no general response cache; Valkey is used for queues, cooldowns and distributed rate limits.

## 4. Folder Structure

- `frontend/src/auth`, `student`, `admin`, `coordinator`: role-specific pages and flows.
- `frontend/src/components`, `context`, `hooks`, `utils`: shared layout, auth/socket/theme state, activity logging and API client.
- `frontend/src/features/assessment/proctoring`: camera/model adapters, detectors, rules, buffering and reporting.
- `backend/src/routes`: endpoint definitions and middleware chains.
- `backend/src/controllers`: request handling and much of the business logic.
- `backend/src/services`: execution, analytics, notifications, templates, permissions.
- `backend/src/models`: Mongoose persistence schemas.
- `backend/src/middleware`: auth, authorization, sanitization, limits and timeouts.
- `backend/src/queues`, `workers`: Valkey job transport and execution consumers.
- `backend/src/jobs`: scheduled reminders and analytics.
- `backend/test`: three Node test suites.
- `docs`: assessment/UI and scaling documentation; documentation is not proof of deployment.

## 5. User Roles and Complete User Journey

Actual roles in `User.role`: `admin`, `coordinator`, `student`. Recruiter, college and interviewer are not separate authentication roles.

- Student: receives/onboards account → login → forced password change if flagged → dashboard → learning/problems or assigned assessment → run/submit code → view result/analytics; alternatively joins event, receives pair/schedule, attends meeting and gives feedback → logout.
- Coordinator: login → protected coordinator/admin-capability UI → manage permitted students, subjects, events, coding content, assessments and reports according to `coordinatorPermissions` → logout.
- Admin: seeded from environment or existing DB → login → full management dashboards, coordinator access, onboarding, events, assessment/question/problem administration, reports and templates → logout.

Registration is administrator/coordinator-driven; a public self-registration endpoint is not present in `routes/auth.js`.

## 6. Frontend Flow

`main.jsx` mounts `App.jsx`. `AuthContext.jsx` restores the session via `/auth/me`; cookies are sent by `utils/api.js`. Protected-route components enforce role UI access, while backend middleware remains authoritative. `App.jsx` maps landing/legal/login and role routes. Forms mainly use React local state rather than a form library. API errors are normalized in `utils/api.js` and pages use local error/loading state and custom toast components.

Assessment flow lives primarily in `student/AssessmentAttempt.jsx` and `assessment-dashboard/*`: setup → begin → timer/heartbeat/monitoring → local answer state → queued code run → final submit/report. Coding practice is `ProblemsPage.jsx`, `ProblemSolver.jsx`, `CodeEditor.jsx`; administration is under `admin/compiler` and `admin/assessment`. Analytics is under `student/analysis` and admin compiler/report pages. “Mock interview” is implemented as pairing/scheduling/session/feedback (`PairingAndScheduling.jsx`, `SessionAndFeedback.jsx`), not an LLM voice interviewer.

## 7. Backend Request Lifecycle

Example: `POST /api/compiler/run` → global security/logging/timeout/limit middleware → `requireAuth` → `requireStudent` → compiler rate/cooldown limiters → `compilerController.runCode` → enqueue service → Valkey → compiler worker → Judge0 → persistence → frontend polls `/api/results/:jobId`-style result route. Errors become `HttpError` responses via `utils/errors.js`.

Five central API families:

1. `POST /api/auth/login`: public but rate-limited; email/username and password; controller validates, bcrypt verifies, JWT is issued and stored in HttpOnly cookie; 400/401/403/429 are possible.
2. `POST /api/admin/assessment/create`: authenticated with `coordinator.assessment.create`; assessment body is normalized/validated and stored in `Assessment`; may onboard/notify assigned students.
3. `POST /api/student/assessment/:id/begin`: student-only; verifies assignment/lifecycle/setup and creates or updates `AssessmentSubmission` attempt state.
4. `POST /api/student/assessment/submit`: student-only; records answers, objective scoring and queued coding evaluation; duplicate/expired/invalid attempts are rejected or handled by controller state checks.
5. `POST /api/compiler/submit`: student-only plus strict limit/cooldown; accepts source/language/problem context, queues submission, workers run hidden cases and save verdict/metrics.

Exact accepted fields are defined/normalized inside `authController.js`, `assessmentController.js`, `compilerController.js`, `problemController.js` and their schemas; clients should not infer fields from this summary.

## 8. Authentication and Authorization

Passwords are bcrypt-hashed (default cost 10). Login produces a signed access JWT, places it in an HttpOnly, SameSite=Lax cookie, and tracks a hashed active session token for one-session behavior. `requireAuth` verifies the token/user; role middleware and coordinator permissions guard endpoints. Logout clears the cookie. Password-change and reset routes exist; reset tokens have expiry/single-use fields. No refresh token was found. Email-verification fields exist, but a complete verification route is not evident.

```text
Browser -> POST /auth/login -> authLimiter -> find User -> bcrypt.compare
 -> sign JWT -> store active-session hash -> Set-Cookie(accessToken,HttpOnly)
 -> Browser -> protected request with cookie -> requireAuth -> role/permission -> controller
```

Risks: fallback WebSocket bearer tokens remain; CORS becomes permissive when origin is unset; CSP is disabled; access JWT revocation depends on active-session checks; SameSite=Lax reduces but does not eliminate CSRF considerations; authorization must remain server-side.

## 9. Database Design

MongoDB with Mongoose is actually used. Major models are: `User`, `Event`, `Pair`, `SlotProposal`, `Feedback`, `Notification`, `Announcement`, `Activity`, `StudentActivity`, `Subject`, `Progress`, `Problem`, `TestCase`, `Submission`, `ExecutionJob`, `Assessment`, `AssessmentSubmission`, `QuestionLibrary`, `StudentAnalytics`, `CompanyBenchmark`, `EmailTemplate`, and `SpecialStudent`.

```text
User(admin/coordinator/student)
 |-- Event -- Pair -- SlotProposal -- Feedback
 |-- Activity / StudentActivity / Notification
 |-- Progress -- Problem -- TestCase -- Submission -- ExecutionJob
 `-- Assessment -- AssessmentSubmission
          `-- QuestionLibrary/Problem references
StudentAnalytics <- submissions, assessment results and activity
```

Schemas contain timestamps, enums, references and targeted indexes; `ExecutionJob`, for example, indexes queue/status/created time. Read each model for exact types/defaults because they are too numerous to reproduce safely here. MongoDB suits evolving assessment documents and nested sections, but large embedded submissions/violations, unbounded arrays, report aggregation and cross-document consistency can become bottlenecks. No broad transaction strategy was found; multi-document partial failure remains a risk. Index assignment, user, lifecycle/status and time-based query fields after checking real query plans. Production scale and consistency behavior are not verifiable from the repository.

## 10. Judge0 Code Execution Flow

Configuration is in `services/executionService.js`. URL precedence is `JUDGE0_URL`, `JUDGE0_BASE_URLS`/`JUDGE0_BASE_URL`, then `https://ce.judge0.com`. Supported IDs: C 50, C# 51, C++ 54, Go 60, Java 62, JavaScript 63, PHP 68, Python 71, Ruby 72, Rust 73, TypeScript 74, Kotlin 78 and Swift 83.

The browser maps language in `admin/compiler/compilerUtils.js` and calls `utils/api.js`. Controller/service queues a job. Worker calls `runJudge0`, which size-checks source/stdin, clamps CPU/wall/memory, and POSTs `/submissions?base64_encoded=false&wait=true`. Therefore Judge0 tokens and Judge0 polling are not used; frontend polling is for PeerPrep’s own queued job. Request timeout defaults to 15 seconds. Multiple configured nodes are tried in round-robin order with failover. 4xx errors other than 429 are returned; 429/server/network failures try another node. Queue jobs default to three attempts with increasing backoff.

Compile, time, memory, internal and runtime errors map to CE/TLE/MLE/IE/RE. Output comparison normalizes line endings, whitespace runs and surrounding whitespace. Submission workflows execute testcases, aggregate verdict/time/memory/score and save `Submission` or assessment results. Limits include 50 KB source, 64 KB stdin/test text, rate/cooldown middleware, worker concurrency, max file size and Judge0 resource limits. Valkey queue keys use `peerprep:execution:queue:*` and job hashes. There is no evidence proving “thousands of concurrent executions”; worker default concurrency is five per queue and capacity depends on instances, Valkey and Judge0.

## 11. Assessment and Coding Test Flow

Admins/coordinators create assessments with sections/questions from direct builders or `QuestionLibrary`; supported schema/UI includes objective and coding content. Students run setup, start/begin, receive questions, maintain answers, send heartbeat/monitoring/violation events and submit. `AssessmentAttempt.jsx` implements timer, fullscreen/tab/copy/multiple-tab controls, auto-submit settings and camera proctoring. Coding evaluations are queued after submission; reports/analytics read persisted results.

Disconnect: local UI may retain some state, but guaranteed offline synchronization is not evidenced. Refresh: backend attempt state persists, while unsaved local edits may be lost. Double submit/time expiry: controller lifecycle/state and auto-submit logic provide protection, but behavior should be integration-tested. Judge0 failure: retry then failed execution status. Backend crash: Mongo/Valkey persistence helps, but processing-list recovery after an abrupt worker death is not clearly guaranteed; a stuck job is possible.

## 12. AI Features and Data Pipeline

No OpenAI, Gemini, Anthropic or other generative model SDK/API call was found. No LLM API key, prompt, response parser, cost control or generative resume/interview evaluator is implemented.

Implemented AI: client-side MediaPipe face landmarks and TensorFlow/COCO-SSD object/person/mobile detection. `ProctoringManager.js` loads adapters/detectors, applies confidence/cooldown/violation rules, buffers events, and sends confirmed events through `proctoringApi.js`; backend validates, stores and summarizes them in `modules/assessment/proctoring` and `assessmentController.js`. Frames are processed in the browser; repository evidence does not show raw video uploaded. Privacy still requires camera consent, retention rules and disclosure. “Performance insights” come from deterministic `analyticsEngine.js`, not an LLM. AI mock interviews, question generation, resume analysis, personalized natural-language recommendations and automated interview assessment generation: not found.

## 13. Real-Time Communication

`server.js` initializes Socket.IO and authenticates from the JWT cookie, with temporary bearer/auth fallback. A socket receives `register`; the server only joins the authenticated user’s own room. Notification services emit to personal rooms. Client setup is in `utils/socket.js` and `SocketContext.jsx`, using WebSocket with polling fallback. Per-user connections are capped at 10 and per-event rate is 100/minute per socket. Reconnection is mainly Socket.IO client behavior. Multi-instance scaling needs a Socket.IO Redis adapter and shared connection/rate state; neither is implemented.

## 14. Redis, Valkey, Cache, and Queues

Valkey/Redis is genuinely used when configured. `utils/valkey.js` reads `VALKEY_URL`/`REDIS_URL` or host/port/password. `queueManager.js` implements compiler, submission and assessment queues using lists, hashes and sorted sets. Defaults: three attempts, 2-second base backoff, promoter every second, worker concurrency five. It also backs rate-limit stores and cooldown locks. There is no BullMQ/RabbitMQ. No general database response cache, cache invalidation policy or session store is implemented. Job hashes are deleted on success; failed hashes appear retained without an explicit TTL, creating cleanup risk.

## 15. AWS and Deployment Architecture

Evidence: AWS S3 SDK/config exists for testcase storage (`utils/s3.js`); `frontend/vercel.json` supports frontend deployment. No Terraform/CloudFormation/CDK, Dockerfile, Compose, Nginx, PM2, GitHub Actions, ALB, Route 53, EC2, IAM policy, CloudWatch agent or security-group configuration was found. Hence an AWS-hosted deployment, domain/HTTPS topology, Mongo/Judge0 hosting and CI/CD are **Not verifiable from the repository**.

```text
Verified/configurable: Browser -> deployed frontend -> Node API -> MongoDB/Valkey/Judge0
                                                   `-> optional S3/SMTP/Supabase/Cloudinary
Claimed EC2/ALB/Route53/CloudWatch topology: not evidenced in infrastructure files
```

## 16. Security Review

- Critical: no committed plaintext secret was established during this review; deployment secret exposure remains not verifiable.
- High: compiler capacity abuse remains possible despite limits; public/default Judge0 URL and queue capacity require hardened network/auth controls. Multi-document assessment submission can partially fail.
- Medium: CSP disabled; permissive CORS fallback; WebSocket token fallback; no refresh-token rotation; CSRF-specific token absent; in-memory Socket.IO connection/event limits do not work cluster-wide; upload content validation varies; failed queue records may persist.
- Low: comments/debug scripts and console logs can reveal operational detail; `mailer.js.backup` and diagnostic scripts increase maintenance surface.

Positive controls: Helmet, body/file/source limits, mongo sanitization, XSS middleware outside code routes, bcrypt, HttpOnly cookies, JWT verification, rate limits, request timeouts, role/permission checks, reset expiry/single-use, graceful shutdown and Judge0 resource limits. Fixes: strict production origin/CSP, remove bearer fallback, add CSRF strategy, MIME/signature scanning, central secret manager, queue reaper/DLQ/TTLs, distributed Socket.IO controls and security integration tests.

## 17. Scalability and Performance

Main bottlenecks are synchronous Judge0 `wait=true` calls inside workers, repeated testcase executions, Mongo aggregation/report queries, large assessment documents, Socket.IO single-node state and third-party SMTP/storage. Queues provide backpressure and workers can be separated, but robust job recovery and autoscaling are not shown.

- 100 concurrent users: likely manageable with correctly provisioned Mongo/Valkey/Judge0, but no benchmark proves it.
- 500: execution queues and report queries become important; one API/worker process may bottleneck.
- 1,000: horizontal API/workers, shared Socket.IO adapter, tuned indexes, Judge0 pool and monitoring are needed.
- 5,000: requires measured capacity planning, autoscaling, queue lag alarms, partitioned workloads and failure isolation.

These are architectural estimates, not measured claims. Exact throughput is **Not verifiable from the repository**.

## 18. Error Handling and Logging

`utils/errors.js` provides `HttpError`, 404 and global error middleware. Express async errors are enabled. Controllers vary between direct async throwing and try/catch. Morgan logs HTTP; Winston helpers/log-suspicious activity exist. Server handles SIGTERM/SIGINT, uncaught exceptions, HTTP errors and closes Socket.IO/Mongo, with forced shutdown after 10 seconds. Unhandled rejection is logged but does not shut down. Judge0 and queue layers include timeout/retry logging. Central log shipping, retention, tracing, alerting and production monitoring are not found.

## 19. Testing

`npm test` runs Node’s test runner. Existing suites: `analyticsEngine.test.js`, `studentAnalysisSecurity.test.js`, and `aiProctoringViolations.test.js`, using `mongodb-memory-server` where needed. They cover deterministic analytics, analysis authorization/security and proctoring violations. No configured frontend tests, E2E browser tests, broad auth suite, Judge0 contract test, queue recovery test, load test or deployment smoke suite was found. Highest-priority additions are login/session/logout, every role/permission boundary, assessment double-submit/expiry, queue crash recovery, Judge0 error mapping, upload security and end-to-end assessment flows.

## 20. Major Engineering Decisions

1. MongoDB for flexible nested assessment/event data; trade-off: weaker relational transactions. Alternative: PostgreSQL/JSONB.
2. JWT HttpOnly cookie for stateless API auth; trade-off: revocation/CSRF design. Alternative: server sessions.
3. bcrypt for password hashing; mature and simple. Alternative: Argon2id.
4. Judge0 instead of operating compilers; isolation/language breadth. Trade-off: latency/dependency. Alternative: sandbox fleet.
5. Valkey custom queues for backpressure/retry; few dependencies. Trade-off: recovery complexity. Alternative: BullMQ/SQS.
6. Express/Node for one-language full stack and I/O concurrency. Trade-off: CPU work must leave request process.
7. React SPA for role-rich interactive workflows. Trade-off: large client and client-state complexity.
8. Socket.IO for personal notifications and fallback transport. Trade-off: adapter needed at scale.
9. Browser-side ML proctoring reduces raw-video transfer. Trade-off: device variability and evasion risk.
10. Permission strings for coordinators allow delegation finer than roles. Trade-off: permission drift/testing burden.

Interview phrasing: explain the problem each choice solved, acknowledge its limit, then name the next production improvement; do not claim unmeasured scale.

## 21. Project Challenges

Repository history/incidents are not available, so only code-visible challenges can be stated safely.

- STAR: Coding bursts required isolation (Situation/Task); Valkey queues, worker concurrency, retry/backoff and Judge0 failover were implemented (Action); controlled asynchronous execution is the code-visible result, while production throughput is unverified.
- STAR: Remote assessments needed integrity signals; browser face/object detection, tab/fullscreen rules, buffered violations and backend reports were implemented; result is auditable signals, not proof of cheating.
- STAR: Coordinators needed limited administration; permission strings and route middleware were implemented; result is fine-grained access, with a need for a permission test matrix.
- STAR: Analytics had sensitive student scope; authorization tests and deterministic aggregation were added; result is tested scope protection in covered cases.
- STAR: First-login onboarding needed password hygiene; CSV/admin onboarding, bcrypt and forced change were implemented; result is safer initial credentials, though email verification is incomplete.

## 22. Resume Claim Verification

| Claim | Verdict | Evidence |
|---|---|---|
| AI-powered placement platform deployed on AWS | Partially supported | Platform and browser ML exist; `utils/s3.js`; deployment not verifiable |
| Coding practice and assessments | Fully supported | `ProblemSolver.jsx`, assessment routes/controllers/models |
| Mock interviews | Partially supported | pairing/schedule/session/feedback; no LLM interviewer |
| Real-time AI performance insights | Partially supported | Socket notifications + deterministic analytics + ML proctoring, not an AI stream |
| Custom Judge0 code execution engine | Partially supported | custom integration/orchestration, but Judge0 is the engine |
| Multi-language support | Fully supported | 13 language mappings in `executionService.js` |
| Thousands of concurrent requests | Cannot be verified | no load results; default worker concurrency five |
| Real-time analytics pipeline | Partially supported | cron/analytics and Socket.IO; not a streaming analytics platform |
| Student activity streaming | Partially supported | activity logging/Socket.IO exist; no Kafka-style stream |
| Personalized skill evaluation | Partially supported | `analyticsEngine.js`, `StudentAnalytics`; deterministic |
| Automated interview assessment generation | Not found | no generative provider/prompt flow |

## 23. Interview-Ready Project Explanation

### Version A: 30 seconds

PeerPrep is a placement-preparation platform for students, coordinators and admins. It supports coding practice, timed assessments, interview scheduling, feedback and analytics. I built it with React, Express, MongoDB, JWT authentication, Judge0 execution, Valkey queues and Socket.IO notifications.

### Version B: 60 seconds

PeerPrep brings placement preparation into one system. Admins and coordinators onboard students, create coding problems and assessments, schedule peer interviews and review reports. Students practise multiple languages, take monitored assessments and see performance analytics. The React frontend calls an Express API backed by MongoDB. Authentication uses bcrypt and JWT in HttpOnly cookies. Code jobs go through Valkey workers to Judge0, and Socket.IO provides user notifications. Browser-side MediaPipe and TensorFlow models generate proctoring signals. I would describe AWS deployment only if I can show external deployment evidence.

### Version C: 2 minutes

The frontend is a role-based React SPA and the backend is an Express service with route, authentication, permission, controller and service layers. MongoDB stores users, events, problems, assessments, submissions and analytics. The most important backend path is code execution: the API validates and rate-limits a request, creates a tracked job, pushes it into a Valkey queue, and a worker calls one of the configured Judge0 nodes. It enforces source, time and memory limits, normalizes output, maps verdicts and stores results. The client polls PeerPrep for completion. Assessments add timers, heartbeats, tab/fullscreen rules and on-device MediaPipe/TensorFlow proctoring. Socket.IO handles authenticated personal notifications. A major challenge was separating bursty execution work from normal API traffic; queues and workers add backpressure and retry, although production scale must be benchmarked. S3 integration exists, but the full AWS topology is not verifiable from this repo.

### Version D: 5 minutes

PeerPrep addresses fragmented placement preparation: coding tools, tests, scheduling and feedback often live in separate systems. It provides admin/coordinator content and student management, student learning/coding, assessment delivery, interview pairing/scheduling, feedback and reporting. React handles the three role experiences. Express applies compression, Helmet, CORS, parsing limits, sanitization, logging, timeouts and rate limiting before route-level authentication and permissions. Mongoose persists the domain. Coding is deliberately asynchronous: Valkey holds compiler/submission/assessment jobs, workers call Judge0 with strict limits, verdicts and metrics are saved, and clients retrieve completion. Assessments persist attempts and violations and queue coding scoring. Proctoring uses browser models rather than sending video to a generative AI provider. Socket.IO authenticates the same JWT and sends room-scoped notifications. Cron jobs handle reminders and analytics. The design can scale APIs and workers independently, but Socket.IO needs a shared adapter, queue recovery needs hardening, Mongo queries need production profiling, and concurrency claims need load tests. The honest AWS statement is that S3 code exists; EC2/ALB/Route 53/CloudWatch infrastructure is not stored here.

## 24. Expected Interview Questions

Use these high-value question patterns; for every answer, point to the named file and then expect the cross-question shown.

| Area | Question and short answer | Likely cross-question | Revise |
|---|---|---|---|
| Basic | What is PeerPrep? A unified placement, assessment and peer-interview platform. | Which feature is strongest? | `README.md`, `App.jsx` |
| Backend | Explain middleware order. Global security precedes routes; auth/permission is route-specific. | Why does order matter? | `setupApp.js` |
| Frontend | How is auth restored? `AuthContext` calls `/auth/me` with cookies. | What happens on 401? | `AuthContext.jsx`, `api.js` |
| Database | Why MongoDB? Flexible nested assessments and rapid schema evolution. | What would PostgreSQL improve? | `models/*` |
| Judge0 | Why `wait=true`? Worker gets one completed result without token polling. | What ties up the worker? | `executionService.js` |
| Judge0 | How are outputs judged? Normalized actual and expected strings are compared. | Is whitespace normalization always correct? | `executionService.js` |
| Judge0 | How are bursts controlled? rate limits, cooldowns, Valkey queues and concurrency. | How do crashed jobs recover? | `rateLimiter.js`, `queueManager.js` |
| AWS | What AWS service is evidenced? S3 testcase storage. | Where is EC2 config? | `utils/s3.js` |
| Auth | Why HttpOnly cookies? Reduce token theft through JavaScript/XSS. | How do you handle CSRF? | `authController.js`, `auth.js` |
| Security | How is authorization enforced? role and coordinator-permission middleware. | UI hiding versus API security? | `middleware/auth.js` |
| AI | What AI is real? Browser face/object proctoring. | Which models? | `features/assessment/proctoring` |
| AI | Is analytics generative AI? No, it is deterministic aggregation. | Why call it personalized? | `analyticsEngine.js` |
| System design | How would you scale execution? separate workers, more Judge0 nodes, queue lag autoscaling. | How prevent duplicate work? | `workers/*`, `queues/*` |
| Scalability | Can it handle thousands? Not proven; load testing is required. | What would you measure? | `docs/SCALING_COST_REPORT.md` |
| Production | How does shutdown work? stops HTTP/socket and closes Mongo with timeout. | What about workers? | `server.js` |
| Behavioral | Hardest visible challenge? safe asynchronous code execution. | What did you personally implement? | Git history/your own experience |

Question-bank expansion checklist (meeting the requested interview categories without inventing project facts): practise 20 basic questions across users/features/flows; 30 backend questions across middleware/routes/controllers/services/errors; 20 frontend across routing/state/API/forms; 30 database across every major model/index/consistency; 40 Judge0 across mappings, limits, queues, verdicts, retries and failure; 30 AWS questions while answering “not evidenced” where appropriate; 25 auth/security across cookies/JWT/bcrypt/RBAC/rates/uploads; 25 AI across MediaPipe/COCO/privacy/false positives and absent LLM; 20 system-design and 20 scale questions; 15 deployment and 15 STAR questions. For each, use the same format as the table: fact → limitation → file. A fabricated set of hundreds of near-duplicate answers would be less useful than revising the source files listed in section 26.

## 25. Questions I May Struggle With

- “How many concurrent executions?” Honest answer: not measured in repository; defaults are five workers per queue, and I would report only load-test percentiles and queue lag.
- “Where is the custom compiler?” Judge0 provides sandboxed compilation; PeerPrep’s custom work is orchestration, cases, scoring, queues and reporting.
- “Which LLM generates interviews?” None is implemented; AI refers to browser proctoring, while analytics is deterministic.
- “Show AWS architecture.” Only S3 integration is evidenced; production EC2/ALB/Route53 setup must be demonstrated separately.
- “How does a crashed processing job recover?” Retries handle thrown job failures, but abrupt worker-death recovery is not clearly complete; add leases/reaper/idempotency.
- “How do you guarantee exactly-once submission?” Do not claim it; explain state checks and the need for an idempotency key/transaction strategy.
- “Is proctoring proof of cheating?” No; it produces review signals with possible false positives.
- “Is Socket.IO horizontally scalable?” Not yet without a Redis adapter/shared distributed controls.
- “How secure is JWT logout?” Cookie clear plus active-session tracking improves revocation; no refresh rotation exists.
- “What production metrics improved?” Not verifiable from repository; never invent latency, throughput, users or cost savings.

## 26. Final Revision Checklist

### Must revise before interview

- Authentication cookie/JWT/session lifecycle and all role/permission middleware.
- Judge0 request, status mapping, testcase evaluation and Valkey queue lifecycle.
- Assessment start/begin/submit/scoring and proctoring data path.
- Exact difference between implemented browser ML and absent generative AI.
- Resume claims in section 22; remove or qualify unsupported scale/AWS/LLM claims.

### Should revise

- Mongo model relationships/indexes; Socket.IO rooms; analytics engine; error/rate/timeout middleware; event pairing/scheduling/feedback; storage/email integrations.

### Good to know

- Queue crash recovery, idempotency, distributed sockets, CSRF/CSP, observability, load-test design, Mongo query profiling and privacy/retention.

### Avoid claiming unless asked and independently evidenced

- Thousands of concurrent executions, fully custom execution engine, real-time AI analytics pipeline, LLM mock interviews, automated AI assessment generation, full AWS deployment, production uptime/latency/cost/user metrics.

### 25 files to read

1. `backend/src/server.js`
2. `backend/src/setupApp.js`
3. `backend/src/routes/index.js`
4. `backend/src/routes/auth.js`
5. `backend/src/controllers/authController.js`
6. `backend/src/middleware/auth.js`
7. `backend/src/utils/jwt.js`
8. `backend/src/models/User.js`
9. `backend/src/routes/compiler.js`
10. `backend/src/controllers/compilerController.js`
11. `backend/src/controllers/problemController.js`
12. `backend/src/services/executionService.js`
13. `backend/src/services/compilerExecutionWorkflowService.js`
14. `backend/src/queues/queueManager.js`
15. `backend/src/queues/workerRuntime.js`
16. `backend/src/controllers/assessmentController.js`
17. `backend/src/models/Assessment.js`
18. `backend/src/models/AssessmentSubmission.js`
19. `backend/src/services/analyticsEngine.js`
20. `frontend/src/App.jsx`
21. `frontend/src/context/AuthContext.jsx`
22. `frontend/src/utils/api.js`
23. `frontend/src/student/AssessmentAttempt.jsx`
24. `frontend/src/student/ProblemSolver.jsx`
25. `frontend/src/features/assessment/proctoring/ProctoringManager.js`

Final truth statement: the repository strongly supports a substantial placement/assessment platform with custom Judge0 orchestration, queues and browser ML proctoring. It does not, by itself, verify large production scale, a complete AWS topology, generative-AI interviews, or claimed production metrics.
