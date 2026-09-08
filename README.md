# PeerPrep

PeerPrep is a role-based placement-readiness platform for colleges, training teams, coordinators, and students. It brings learning content, coding practice, secure assessments, mock interviews, feedback, notifications, and readiness analytics into one web application.

The repository contains:

- React 19 + Vite single-page frontend.
- Node.js + Express API using MongoDB/Mongoose.
- Socket.IO for authenticated real-time notifications.
- Valkey/Redis-compatible queues for code execution and rate-limit coordination.
- Background workers for compiler and assessment jobs, plus a MongoDB-backed mail queue.
- Judge0 integration for multi-language code execution.
- Browser-side assessment monitoring using MediaPipe and TensorFlow.js/COCO-SSD.

> **Implementation status:** This README documents the current repository. PeerPrep is not an LLM-powered interviewer. Its AI-assisted capability is browser-based assessment monitoring; readiness analytics are deterministic and data-driven.

## Contents

- [What PeerPrep does](#what-peerprep-does)
- [Roles and permissions](#roles-and-permissions)
- [Main capabilities](#main-capabilities)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Running the application](#running-the-application)
- [Important workflows](#important-workflows)
- [Frontend routes](#frontend-routes)
- [Backend API groups](#backend-api-groups)
- [Data model](#data-model)
- [Security and operational controls](#security-and-operational-controls)
- [Testing and verification](#testing-and-verification)
- [Deployment notes](#deployment-notes)
- [Known limitations and roadmap](#known-limitations-and-roadmap)

## What PeerPrep does

Placement preparation is usually split between spreadsheets, messaging groups, coding websites, video calls, forms, and manually prepared reports. PeerPrep connects that journey:

```text
Learn -> Practise -> Assess -> Interview -> Receive feedback -> Improve
```

Students get a single preparation workspace. Coordinators receive scoped operational access. Administrators manage institution-wide onboarding, content, assessments, interview events, permissions, communication, and reporting.

## Roles and permissions

### Student

Students can sign in with an email or student ID, change a temporary password on first login, browse semester/subject/chapter/topic learning content, track watch time and completion, solve coding problems, take assigned assessments, participate in mock interviews, submit feedback, and view activity, coding, assessment, and readiness analytics.

### Coordinator

Coordinators are created by an administrator and receive explicit permissions. Access is enforced by backend middleware as well as frontend route guards. Available permission areas include dashboard overview; interview creation, viewing, editing, management, participants, and deletion; student viewing, profiles, bulk lists, and promotion; assessment viewing, creation, editing, and reports; learning/content management; question library and compiler access; company benchmarks; announcements; feedback; profile; and activity.

The permission catalogue is defined in `backend/src/services/coordinatorPermissions.js`. The backend fails closed when a coordinator has no valid permission list.

### Administrator

Administrators have institution-wide access. They can onboard students and coordinators, configure coordinator permissions, manage all content and events, review reports, manage email templates, promote students, inspect activity, and maintain company-readiness benchmarks.

## Main capabilities

### Learning management

Learning content is organized as semesters, subjects, chapters, and topics. Topics can include learning material and video-related progress tracking. Authorized users can create, edit, delete, reorder, and inspect subject structures. Students can mark topics complete/incomplete and the system records progress and watch-time activity.

### Student and coordinator onboarding

- Individual student creation and bulk CSV upload.
- CSV validation, duplicate checks, upload batches, rename/delete batch operations, and exports.
- Individual and bulk coordinator creation.
- Temporary credentials with forced first-login password change.
- Credential delivery status: `not_sent`, `pending`, `sent`, or `failed`.
- Retryable mail jobs for important onboarding and invitation flows.

The sample student format is available at [`frontend/public/sample-students.csv`](frontend/public/sample-students.csv).

### Coding practice and compiler

The compiler module supports problem authoring, preview validation, publishing, visibility control, code templates, reference solutions, tags, company tags, hints, FAQs, sample cases, hidden test cases, and submission analytics.

Supported problem languages currently defined by the backend are `python`, `javascript`, `java`, `cpp`, `c`, `typescript`, `csharp`, `php`, `go`, `rust`, `kotlin`, `ruby`, and `swift`.

Student code is submitted asynchronously:

```text
Browser -> API validation/rate limit -> Valkey queue -> compiler worker
        -> Judge0 -> verdict/metrics persisted -> result returned to UI
```

The execution service applies CPU, wall-time, memory, and request limits. Verdicts include accepted, wrong answer, time limit, runtime error, compile error, and failed/internal states. Admin and authorized coordinators can inspect compiler overview, submissions, problem analytics, and student coding analytics.

### Assessments

Assessments support MCQ, short-answer, one-line, coding, and mixed assessments; sections with per-question marks and negative marking; draft/published lifecycle; all-student or selected-student assignment; start/end windows, duration, attempt limits, late-submission policy, optional password, question-library reuse, coding-problem snapshots, invitations, autosave, heartbeat, timed submission, expiry, objective scoring, queued coding evaluation, reports, violation review, exports, result release, completion marking, and submission reset.

Assessment coding jobs run through the assessment queue and worker rather than blocking the request that saves the student attempt.

### Browser-assisted assessment monitoring

When enabled, the browser can perform fullscreen, tab/visibility, focus, duplicate-tab, camera, face, person/mobile-object, location, and periodic snapshot checks. MediaPipe handles face-related analysis and TensorFlow.js/COCO-SSD handles object/person detection.

Events are sent to the backend with cooldowns, confidence values, and risk summaries. This is AI-assisted signal detection, not a claim of perfect proctoring. Reviewers should treat flags as evidence for investigation rather than an automatic determination of misconduct. The repository does not establish that continuous raw camera video is uploaded or stored.

### Mock interviews

Authorized admins/coordinators can create interview events, upload optional templates/resources, select participants by filters, selected users, CSV, or all eligible users, and manage event status.

The flow supports participant enrollment, one-way student pairing with odd-participant handling, interviewer/interviewee assignment, slot proposal/counter-proposal/acceptance/rejection/confirmation, meeting links, in-app/email notifications, ICS calendar invites, completion, and structured feedback. Event statuses include `draft`, `scheduled`, `published`, `live`, `completed`, `cancelled`, and `archived`.

### Notifications, email, and templates

Socket.IO delivers authenticated personal notifications in real time, while notifications are also persisted in MongoDB. Email templates are stored in MongoDB and can be administered through the UI.

Template-backed flows include onboarding, password reset, event invitations/cancellation, assessment invitations, slot proposals, counter-proposals, slot acceptance, and scheduled interview confirmations.

The mail queue stores encrypted payloads, uses idempotency keys, retries failures, recovers stale locks, and exposes batch status/retry endpoints. SMTP delivery is provider-dependent; the repository does not guarantee delivery or throughput.

### Analytics and reporting

Reports can combine learning progress, activity, coding submissions, assessment performance, assessment-integrity events, feedback, and company benchmarks. Admin/coordinator screens provide filtered views and CSV/XLSX/PDF-oriented reporting workflows where implemented by the UI.

Analytics are generated by backend aggregation and rules in services such as `analyticsEngine.js`; they are not generated by an LLM.

### Professional resume builder

Students can create a placement-ready resume through a guided builder at `/student/resume`. The feature uses a fixed professional A4 template while keeping every field and section optional.

- Existing profile values such as name, email, mobile, LinkedIn, GitHub, and portfolio seed the first unsaved resume when available.
- Academic details, experience, projects, technical skills, achievements, and student-defined custom sections use repeatable editor cards.
- Empty and hidden sections are automatically excluded from the resume.
- Students can control contact visibility, reorder sections and entries, format bullet emphasis, and restore the immediately previous saved version.
- First-time guidance explains the optional-field workflow, section arrangement, preview, and download flow without blocking returning students.
- Custom sections use one flexible, consistent editor. Students can add multiple subsections with optional headings, supporting lines, dates, locations, links, formatted paragraphs, and bullet points; legacy custom layouts are migrated into this unified structure.
- Resume section cards load as compact headers and remain open after the student expands them, avoiding unexpected accordion closure while editing.
- Destructive entry and custom-section removals provide a timed undo action, while unsaved browser-tab exits trigger native change protection.
- Resume guidance includes bullet, measurable-result, and estimated-page metrics plus writing suggestions; these remain advisory and never block PDF export.
- Keyboard controls support save (`Ctrl/⌘ + S`), full preview (`Ctrl/⌘ + P`), PDF download (`Ctrl/⌘ + Shift + D`), and undo (`Ctrl/⌘ + Z`) when an undo action is available.
- A sticky document-only preview automatically fits the A4 page to the available space. On desktop, students can drag the divider to resize the editor or collapse it for a focused resume view; compact page controls appear only for multi-page resumes.
- The resume route suppresses the global site footer so the editor and document can use the full working height.
- Autosave and manual save persist one resume per student.
- PDF downloads use a dedicated document renderer with selectable text, clickable links, A4 pages, and a classic professional layout.
- PDF generation reports save, renderer-loading, typesetting, and completion states so students receive clear feedback during large downloads.
- Admins and coordinators with student-profile permission can open a read-only resume view from the student profile; coordinators remain limited to assigned students.

## Repository layout

```text
peerprep/
├── backend/
│   ├── src/
│   │   ├── controllers/       Request handlers and domain operations
│   │   ├── middleware/        Auth, authorization, limits, sanitization
│   │   ├── models/            Mongoose schemas
│   │   ├── modules/           Assessment modules, including proctoring
│   │   ├── routes/            API route definitions
│   │   ├── services/          Queues, analytics, mail, compiler, notifications
│   │   ├── utils/              Database, JWT, storage, logging, validation
│   │   ├── workers/            Compiler, assessment, embedded, and mail workers
│   │   ├── jobs/               Reminder and analytics schedules
│   │   └── server.js           HTTP, Socket.IO, DB, seed, and worker startup
│   ├── migrations/             Data migrations/backfills
│   ├── scripts/                Maintenance scripts
│   ├── test/                   Node test-runner tests
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── student/            Student pages and assessment experience
│   │   ├── admin/              Administrator pages
│   │   ├── coordinator/         Coordinator pages
│   │   ├── features/assessment Assessment and proctoring components
│   │   ├── components/          Shared UI
│   │   ├── context/             Auth/theme/application providers
│   │   └── utils/               API, socket, and frontend helpers
│   ├── public/                  Static assets and sample CSV
│   ├── scripts/                 Frontend utilities
│   └── package.json
├── docs/                        Detailed assessment and scaling documentation
├── testcase-templates/          Test-case import/export templates
├── PEERPREP_INTERVIEW_REVISION.md
└── readme.md
```

## Architecture

```text
React 19 + Vite SPA
        |
        | HTTPS/JSON with HttpOnly JWT cookie
        | Authenticated Socket.IO
        v
Node.js + Express API
        |
        +-- Authentication, roles, coordinator permissions
        +-- Validation, sanitization, CORS, rate limits, timeouts
        +-- MongoDB/Mongoose persistence
        +-- Valkey/Redis-compatible execution queues
        +-- Compiler and assessment workers
        +-- MongoDB-backed mail queue worker
        +-- Judge0 code execution
        +-- SMTP email delivery
        +-- Supabase storage and optional Cloudinary/S3 utilities
```

The backend starts the HTTP server, connects to MongoDB, seeds the configured admin when needed, seeds email templates, initializes Socket.IO, starts embedded execution workers unless disabled, and starts the mail queue worker.

## Prerequisites

- Node.js 22.x for the frontend; use a current Node.js LTS line for the backend.
- npm.
- MongoDB, or development mode with `MONGODB_URI=memory` for the supported in-memory fallback.
- Valkey/Redis for execution queues. In-memory rate-limit fallback does not replace the compiler queue.
- A reachable Judge0 instance for code execution.
- SMTP credentials if email is required.
- Supabase credentials if event templates or external test-case storage are used.

## Local setup

### Install dependencies

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

### Configure the backend

Create `backend/.env` and do not commit it. A minimal development configuration is:

```dotenv
NODE_ENV=development
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/peerprep
JWT_SECRET=replace-with-at-least-32-random-characters
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-development-password
```

Add queue, Judge0, SMTP, and storage variables as needed; see [Environment variables](#environment-variables).

### Start the backend

```powershell
cd backend
npm run dev
```

The API and Socket.IO server listen on `http://localhost:4000` by default. Application routes are mounted below `/api`.

### Start the frontend

In a second terminal:

```powershell
cd frontend
npm run dev
```

Vite normally serves the app at `http://localhost:5173`. The frontend derives the local API origin from port `4000`; use `VITE_API_BASE`, `VITE_API_URL`, or `VITE_SOCKET_URL` when hosted elsewhere.

### First login

On startup, the backend uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` to seed an admin account when needed. Change development credentials before sharing the environment. Students and coordinators should normally be onboarded through the protected admin UI so credential and mail status are recorded correctly.

## Environment variables

The server uses `backend/.env`; Vite-prefixed variables configure the browser. These are the main supported settings, with defaults taken from source where available.

### Backend core

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` or `production`; controls secure cookies and stricter origin behavior. |
| `PORT` | API/Socket.IO port; defaults to `4000`. |
| `FRONTEND_ORIGIN` | Comma-separated allowed browser origins. Required in production. |
| `FRONTEND_URL` | URL used in links such as password reset. |
| `MONGODB_URI` | MongoDB connection string; `memory` supports development fallback. |
| `JWT_SECRET` | JWT signing secret; production requires at least 32 strong characters. |
| `JWT_EXPIRES_IN` | JWT lifetime; defaults to `7d`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial admin seed credentials. |
| `BCRYPT_ROUNDS` | Password hashing cost; defaults to `10`. |

### Queue and execution

| Variable | Purpose |
|---|---|
| `VALKEY_URL` / `REDIS_URL` | Queue connection URL. |
| `VALKEY_HOST`, `VALKEY_PORT`, `VALKEY_PASSWORD` | Alternative queue settings. |
| `START_EXECUTION_WORKERS` | Set `false` when workers run as separate processes. |
| `COMPILER_WORKER_CONCURRENCY` | Compiler worker concurrency; source default `5`. |
| `ASSESSMENT_WORKER_CONCURRENCY` | Assessment worker concurrency; source default `5`. |
| `JUDGE0_URL` / `JUDGE0_BASE_URL` | Judge0 endpoint; multiple URLs are supported by the execution service. |
| `JUDGE0_AUTH_HEADER`, `JUDGE0_AUTH_TOKEN` | Optional Judge0 authentication. |
| `JUDGE0_REQUEST_TIMEOUT_MS` | Judge0 request timeout. |
| `JUDGE0_MAX_CPU_TIME_LIMIT_SECONDS` | Maximum CPU time. |
| `JUDGE0_MAX_WALL_TIME_LIMIT_SECONDS` | Maximum wall-clock time. |
| `JUDGE0_MAX_MEMORY_LIMIT_KB` | Maximum memory. |
| `COMPILER_RUN_*`, `COMPILER_SUBMIT_*` | Run/submit windows, maximums, and cooldowns. |

### Email

| Variable | Purpose |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` | SMTP server and port. |
| `SMTP_USER`, `SMTP_PASS` | SMTP credentials; use an app password where required. |
| `MAIL_FROM` | Sender address; otherwise `SMTP_USER` is used. |
| `EMAIL_ENABLED` | Master email switch. |
| `EMAIL_ON_ONBOARD`, `EMAIL_ON_EVENT`, `EMAIL_ON_PAIRING`, `EMAIL_ON_ASSESSMENT` | Per-flow switches. |
| `MAIL_QUEUE_CONCURRENCY`, `MAIL_QUEUE_POLL_MS` | Mail worker tuning. |
| `MAIL_QUEUE_SECRET` | Encrypts queued mail payloads; falls back to `JWT_SECRET`. |

### Storage and integrations

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY` | Supabase backend key. Keep service keys server-side. |
| `SUPABASE_BUCKET` | Event-template bucket; defaults to `templates`. |
| `SUPABASE_TESTCASE_BUCKET`, `SUPABASE_TESTCASE_PREFIX` | Optional hidden-test-case storage. |
| `SUPABASE_PUBLIC`, `SUPABASE_SIGNED_TTL` | Public/private template URLs and signed URL lifetime. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Optional image/avatar storage. |
| `AWS_REGION`, `S3_TESTCASE_BUCKET`, `S3_TESTCASE_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Optional S3 test-case storage. |
| `MEETING_LINK_BASE` | Meeting-link base; source default `https://meet.jit.si`. |
| `MEETING_DURATION_MIN` | Interview duration; source default `30`. |

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | Complete API base, e.g. `https://api.example.com/api`. |
| `VITE_API_URL` | API origin; `/api` is appended when needed. |
| `VITE_SOCKET_URL` | Socket.IO origin. |
| `VITE_API_PORT` | Local API port override; defaults to `4000`. |
| `VITE_API_TIMEOUT_MS`, `VITE_API_CACHE_TTL_MS`, `VITE_API_STALE_TTL_MS` | Client request/cache tuning. |
| `VITE_MEDIAPIPE_WASM_BASE_URL`, `VITE_FACE_LANDMARKER_MODEL_URL` | Optional MediaPipe asset overrides. |
| `VITE_COCO_SSD_MODEL_URL`, `VITE_COCO_SSD_BASE` | Optional COCO-SSD asset overrides. |

Never expose backend secrets or service keys through `VITE_*` variables; Vite embeds them into the browser bundle.

## Running the application

### Development

```powershell
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

### Production-style local run

```powershell
cd frontend
npm run build
npm run preview

cd ..\backend
npm start
```

For separate execution workers, set `START_EXECUTION_WORKERS=false` and run:

```powershell
cd backend
npm run worker:compiler
npm run worker:assessment
```

The mail queue worker is started by `server.js` in the current implementation. If separated for deployment, preserve a locking strategy so jobs are not duplicated.

## Important workflows

### Bulk onboarding

```text
Admin selects CSV
 -> server validates fields and duplicates
 -> upload batch is recorded
 -> users are created
 -> credential mail jobs are queued
 -> worker sends/retries messages
 -> UI exposes per-target and batch status
```

### Assessment lifecycle

```text
Draft -> configure sections/questions/settings -> publish
 -> assign students -> send invitations -> student setup
 -> timed attempt + autosave + heartbeat/monitoring
 -> submit/expire -> objective score + coding worker
 -> report -> optional result release
```

### Interview lifecycle

```text
Create event -> select participants -> pair students
 -> propose/counter-propose slots -> confirm schedule
 -> notify participants + calendar invite
 -> conduct interview -> submit feedback -> review/export
```

## Frontend routes

Public routes include `/`, `/student`, `/reset-password`, `/privacy`, `/terms`, and `/contact`.

Student routes include `/student/dashboard`, `/student/learning`, `/student/interview`, `/student/session`, `/student/assessments`, `/student/assessment/:id`, `/student/assessment-reports`, `/student/assessment-history`, `/student/analytics`, `/problems`, and `/problems/:id`.

Admin routes include `/admin`, `/admin/students`, `/admin/coordinators`, `/admin/event`, `/admin/feedback`, `/admin/learning`, `/admin/assessment`, `/admin/assessment/create`, `/admin/assessment/reports`, `/admin/library`, `/admin/compiler`, `/admin/company-insights`, `/admin/activity`, `/admin/settings/email-templates`, `/admin/settings/promote-students`, and announcement management routes.

Coordinator routes mirror the relevant operational areas under `/coordinator`, but each feature is additionally checked against the coordinator permission assigned by an admin.

The complete route-to-component mapping is maintained in [`frontend/src/App.jsx`](frontend/src/App.jsx).

## Backend API groups

All application APIs are mounted below `/api`.

| Group | Responsibility |
|---|---|
| `/auth` | Login/logout, current user, password change/reset, profile/avatar, activity, stats. |
| `/students` | Directory, CSV validation/upload, exports, promotion, profiles, bulk operations. |
| `/coordinators` | Coordinator creation, directory, access, status, credentials. |
| `/subjects`, `/learning` | Curriculum authoring, topic content, progress, watch time, analytics. |
| `/events`, `/pairing`, `/schedule` | Events, participants, pairs, slot proposals, confirmations, meeting links. |
| `/feedback` | Submit, list, export, and review interview feedback. |
| `/compiler`, `/execute`, `/results` | Problems, code runs/submissions, execution results, compiler analytics. |
| `/admin` | Assessment authoring, library, assignments, reports, exports, violations, result controls. |
| `/student` | Student assessment dashboard, setup, attempt, heartbeat, monitoring, submit, reports. |
| `/notifications` | Personal notifications, read state, and clearing. |
| `/email-templates`, `/mail-queue` | Template administration and mail batch status/retry. |
| `/admin/announcements`, `/student/announcements` | Announcement management and delivery. |
| `/admin/company-insights`, `/student/analysis` | Company benchmarks and readiness analysis. |
| `/activity` | Activity records, statistics, exports, and logging. |
| `/resume` | Student resume prefill/save/restore and protected admin/coordinator read-only access. |

Route-level authorization is defined in `backend/src/routes/` and should be consulted before adding a new UI action.

## Data model

Primary Mongoose models include `User`, `SpecialStudent`, and `StudentUploadBatch` for identities; `Subject` and `Progress` for learning; `Problem`, `TestCase`, `Submission`, and `ExecutionJob` for coding; `Assessment`, `AssessmentSubmission`, and `QuestionLibrary` for examinations; `Event`, `EventParticipant`, `Pair`, and `SlotProposal` for interviews; `Resume` for structured student resume content and document ordering; `Feedback`; `Notification`, `Announcement`, `EmailTemplate`, and `MailJob`; `StudentActivity`, `StudentAnalytics`, and `StudentAnalyticsSnapshot`; and `CompanyBenchmark`.

Assessments embed sections and question snapshots so later library changes do not silently rewrite an existing assessment. Hidden test cases can be stored in the database or configured external storage depending on the problem/assessment path.

## Security and operational controls

Current controls include JWT authentication in HttpOnly cookies, bcrypt password hashing, expiring hashed password-reset tokens, active-session tracking, role and fail-closed coordinator authorization, Helmet, CORS restrictions, compression, request limits, timeouts, rate limiting, Mongo query sanitization, compiler cooldowns, Judge0 resource constraints, authenticated Socket.IO personal rooms, encrypted mail payloads, idempotency keys, retry/stale-lock recovery, activity/security logging, and graceful HTTP/Socket.IO/database shutdown.

These controls are not a guarantee of perfect security. Production deployments still need secret management, TLS, database backups, monitoring, access reviews, dependency updates, and a formal privacy/compliance review—especially when camera, location, or assessment-integrity data is enabled.

## Testing and verification

### Backend tests

```powershell
cd backend
npm test
```

The Node test suite currently covers areas including analytics behavior, student-analysis history/security, coordinator feature access, AI-proctoring violations, and related backend rules.

### Frontend checks

```powershell
cd frontend
npm run lint
npm run build
```

Before merging assessment or proctoring changes, manually verify camera permission, fullscreen recovery, tab switching, duplicate-tab behavior, autosave, timer expiry, submission, coding evaluation, and report rendering in a supported browser.

## Deployment notes

- Serve frontend and API over HTTPS in production; secure cookies are enabled when `NODE_ENV=production`.
- Set an explicit production `FRONTEND_ORIGIN`; do not rely on development origin allowances.
- Keep MongoDB, Valkey/Redis, Judge0, SMTP, and storage credentials outside the repository.
- Use a strong `JWT_SECRET` and separate `MAIL_QUEUE_SECRET` where appropriate.
- Run compiler and assessment workers separately when scaling beyond one process.
- If Socket.IO is scaled horizontally, configure a shared Redis adapter.
- Configure SMTP/domain authentication and provider rate limits; free-plan limits are not production capacity.
- Configure MongoDB indexes, backups, retention, and monitoring before onboarding real users.
- Restrict storage buckets and use signed URLs for private templates/test cases.
- Review camera/location consent, retention, deletion, and student-access policies before enabling monitoring.
- Add CI/CD, integration tests, end-to-end tests, centralized logs, metrics, alerts, and rollback procedures for production.

## Known limitations and roadmap

The repository does not prove production traffic, uptime, concurrency, placement-rate improvement, email delivery times, or assessment accuracy. Current limitations include no generative-AI interviewer or LLM answer evaluation; proctoring false positives requiring human review; mixed queued/direct email paths; shared-adapter work required for horizontal Socket.IO scaling; no evidenced complete infrastructure-as-code/CI/CD system; limited broader integration/E2E coverage; and deployment-specific work still needed for secrets, backups, observability, retention, and compliance.

Recommended roadmap:

1. **Reliability:** unify all email behind the durable queue, add provider throttling/webhooks/bounce handling, observability, CI/CD, backups, and stronger integration tests.
2. **Institutional scale:** separate/autoscale workers, shared Socket.IO infrastructure, cohort/intervention analytics, recruiter workflows, tenant isolation, SSO, and expanded audit controls.
3. **Responsible AI:** add explainable, consent-based recommendations and rubric assistance with human oversight, bias evaluation, prompt/version tracking, and opt-out controls.

## Related documentation

- [`docs/PEERPREP_ASSESSMENT_SYSTEM_DOCUMENTATION.md`](docs/PEERPREP_ASSESSMENT_SYSTEM_DOCUMENTATION.md) — assessment workflows, security setup, proctoring, scoring, reports, APIs, and data structures.
- [`docs/PEERPREP_ADMIN_ASSESSMENT_REPORT_UI_UX_GUIDE.md`](docs/PEERPREP_ADMIN_ASSESSMENT_REPORT_UI_UX_GUIDE.md) — report interface and review guidance.
- [`docs/SCALING_COST_REPORT.md`](docs/SCALING_COST_REPORT.md) — infrastructure and scaling cost considerations.
- [`PEERPREP_INTERVIEW_REVISION.md`](PEERPREP_INTERVIEW_REVISION.md) — interview-system revision notes.
- [`testcase-templates/inputs.txt`](testcase-templates/inputs.txt) and [`testcase-templates/outputs.txt`](testcase-templates/outputs.txt) — hidden test-case template formats.

## License

No license file is currently present in the repository. Treat the project as private/internal unless the project owner adds explicit licensing terms.
