# ANVI AI voice interviews

ANVI is PeerPrep's AI interviewer. Admins author and publish an interview, and students take it as a live
spoken interview, either as practice or as a schedule assigned by their institution. ANVI scores the
transcripts with Gemini and the backend's own scoring code, and the result is a report for the student
and the admin.

Everything runs inside the main backend. There is no separate interview service, no OpenAI dependency
and no `INTERVIEW_SERVICE_*` configuration. Ignore older notes that mention them.

## Architecture

| Part | Where | What it does |
| --- | --- | --- |
| Authoring | `backend/src/controllers/aiInterviewController.js`, `services/aiInterviewDefinition.js`, `frontend/src/admin/ai-interviews/wizard/*` | Admin-owned definition (sections → topics/groups → questions, rubric, weights, interviewer persona). Saves are revision-checked (`409 REVISION_CONFLICT`). **Publish** snapshots a validated revision (`publishedSnapshot`). Students only ever see the snapshot. |
| Plan | `modules/anviInterview/anviInterview.plan.js` | Turns a snapshot into a per-attempt question plan. Order is seeded per attempt. Topic (ANNU) and resume questions are generated with Gemini at start. Section and topic weights become item weights; a weight of 0 de-weights an item. |
| Start | `anviInterview.service.js`, `anviInterview.routes.js` | Practice start (Prep Coins via `requireCoins`, a per-day cap) or assigned start (free, gated by the schedule). Parallel starts by one student share one in-flight start in each process, so a burst plans with Gemini only once. One in-progress attempt per student and interview, enforced by a unique index. |
| Live relay | `anviInterview.socket.js`, `anviInterview.gemini.js` | Socket.IO relay between the browser microphone (16 kHz PCM) and a Gemini Live session. Each attempt has one holder at a time (a lease); a newer tab takes over. Audio exists only in memory and is never stored. |
| Conductor | `anviInterview.conductor.js`, `anviInterview.prompts.js` | Tracks the cursor from ANVI's spoken `Question <n>:` markers. Enforces follow-up budgets, silence nudges, skips and the deadline. If ANVI announces a move ("Let us move on…") without asking, the conductor tells her to ask the next question at once. Finalises the attempt into text items, each marked `asked` or not. |
| Evaluation outbox | `anviInterview.evaluation.js` | A finished attempt is queued in the same write (`pendingWork`). A leased worker (at most 2 per process, also claimed by the 10 s maintenance backstop) asks Gemini for per-key-point verdicts, a relevance level and rubric levels; every mark is computed in code. Up to 5 tries with backoff. A failed admin re-evaluation keeps the previous report. |
| Scheduling | `anviInterview.scheduling.*.js` | Assignments pin a published revision to a cohort snapshot, an IST window and optional capacity-limited slots. They cover bookings, reschedules (cancelling and booking again counts as a change), reminders, no-shows, close effects, report release, in-app notices and queued `anvi_interview` emails. |
| Reports | `anviInterview.reports.js`, `adminRoutes.js`, `frontend/src/admin/ai-interviews/reports`, `schedules/ScheduleCohortReport.jsx` | Admin attempt list and detail (including the authored answer), re-evaluation, and a cohort summary and CSV per schedule. |
| Maintenance | `platform/sharedMaintenance.js` | Runs for the platform and for every university with `permissions.interviews` and an active service period. Every 60 s it finalises stale attempts and runs the scheduling sweep (open/close, reminders, no-shows, recovery of interrupted close or cancel, settling ended attempts whose schedule update failed). Every 10 s it dispatches evaluations. |

### Visibility rules students see

- **Practice reports** become visible when scored.
- **Assigned reports** follow the schedule's `reportVisibility`:
  - `immediate`: visible when scored. Switching an open schedule to `immediate` releases the reports already scored.
  - `after_close`: released when the schedule closes or is cancelled.
  - `manual`: released by the admin's **Release reports**, which is also allowed after a cancel or an archive.
- **Before release**, students see only the questions ANVI actually asked and their own answers. Unasked questions never leave the server.
- **While a schedule is still open**, expected key points (and unasked questions) stay hidden, even in a released report. This also applies to earlier practice reports of an interview whose practice is blocked. Otherwise retakers and classmates could use them.
- **While practice is blocked**, a practice attempt cannot be rejoined over the socket (`PRACTICE_BLOCKED`).

## Configuration

Read by `modules/anviInterview/anviInterview.config.js`. Invalid values fall back to the defaults below.

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | (none) | Required. Without it ANVI start and evaluation are unavailable. |
| `ANVI_LIVE_MODEL` | `gemini-3.8-live` | Live (voice) model. |
| `ANVI_LIVE_VOICE` | `Aoede` | Live voice name. |
| `ANVI_TRANSCRIBE_MODEL` | `gemini-3.5-flash-lite` | Per-answer transcription for the report. |
| `ANVI_GENERATE_MODEL` | `gemini-3.5-flash-lite` | Question generation at start and answer evaluation. |
| `ANVI_FALLBACK_MODELS` | `gemini-3.5-flash,gemini-3.1-flash-lite` | REST fallbacks on 404, 429 or 503. |
| `ANVI_SILENCE_MS` | `2000` (1500–4000) | Pause that ends a candidate turn. |
| `ANVI_MAX_SESSION_MINUTES` | `45` (5–90) | Hard cap for one interview. |
| `ANVI_MAX_QUESTIONS_PER_INTERVIEW` | `12` (3–40) | Cost guardrail applied before generation. Extra authored or generated plan items are trimmed internally and are never disclosed to the student. |
| `ANVI_MAX_FOLLOW_UPS_PER_QUESTION` | `1` (0–3) | Runtime cap for AI follow-ups per main prompt, even when an older definition allows more. |
| `ANVI_ACCURATE_TRANSCRIPTION` | off | When enabled, runs a paid second-pass audio transcription only for missing or very short Live transcripts. Off reuses Gemini Live input transcripts. |
| `ANVI_RESUME_WINDOW_MINUTES` | `15` (2–60) | How long a dropped interview can be resumed. |
| `ANVI_LIVE_RESUMPTION` | on | Live session resumption; `0`, `false`, `off` or `no` disables it. |
| `ANVI_LIVE_CONTEXT_TRIGGER_TOKENS` | `25000` (5000–128000) | Compress Live history when its active context reaches this size. Lower values reduce compounding input cost but forget older small talk sooner. |
| `ANVI_LIVE_CONTEXT_TARGET_TOKENS` | `8000` (0–128000) | History retained after compression. The runtime never sends a target above the trigger. |
| `ANVI_MAX_ATTEMPTS_PER_DAY` | `5` (1–50) | New **practice** attempts per student and interview in 24 h. Assigned attempts never count. |
| `ANVI_MAX_JOINS_PER_MINUTE` | `8` (2–60) | Socket joins per student per minute. |
| `ANVI_PROCESS_AUDIO_CAP_MB` | `512` | In-memory answer audio ceiling per process. |
| `ANVI_MAX_LIVE_SESSIONS` | `25` (1–1000) | Live sessions held at once across all universities. A new join over the cap gets `CAPACITY_FULL` with `retryAfterSeconds`; a resume, a takeover by another tab or a switch between the student's own interviews is never refused. With Valkey (`CACHE_VALKEY_URL`, `VALKEY_URL`, `REDIS_URL` or `VALKEY_HOST`) the cap holds across instances (90 s leases renewed every 30 s); without it, or while Valkey is unreachable, it holds per process. |
| `ANVI_MAX_LIVE_SESSIONS_PER_TENANT` | `15` (1–1000) | The same cap for one university. |
| `ANVI_CAPACITY_RETRY_SECONDS` | `120` (15–900) | `retryAfterSeconds` sent with `CAPACITY_FULL`. |
| `ANVI_MAX_OUTPUT_TOKENS_TRANSCRIBE` | `4096` (256–32768) | Output token ceiling per transcription call. |
| `ANVI_MAX_OUTPUT_TOKENS_GENERATE` | `8192` (256–32768) | Output token ceiling per question-generation call. |
| `ANVI_MAX_OUTPUT_TOKENS_EVALUATE` | `8192` (256–32768) | Output token ceiling per evaluation call. |
| `ANVI_JSON_CACHE_SECONDS` | `3600` (0–86400) | Identical reusable topic-generation and first-pass evaluation calls within this window reuse the first reply, per process (100 entries); `0` turns it off. Resume prompts, retakes, evaluation retries and admin re-evaluations bypass it. |
| `ANVI_PRICE_<KIND>_INPUT`, `ANVI_PRICE_<KIND>_OUTPUT` | `0` (unknown) | Price per million tokens, `<KIND>` = `LIVE`, `TRANSCRIBE`, `GENERATE` or `EVALUATE`, for the estimate in `GET /api/ai-interviews/reports/usage`. `0` means unknown, so that kind is listed in `pricing.unpricedKinds` and left out of the estimate. Copy current prices from Google's Gemini pricing page; none are built in. |
| `ANVI_PRICE_CURRENCY` | `USD` | Three-letter currency code shown with the estimate. |
| `EMAIL_ENABLED` | (unset) | `false` stops schedule emails; in-app notices still go out. |
| `FRONTEND_ORIGIN` | `https://peerprep.co.in` | First entry is used for links in schedule emails. |

The wizard's "default follow-ups" preference is stored only in the admin's browser (`localStorage` key
`peerprep.aiInterviews.defaultFollowUps`). It is a per-browser convenience, not a server setting, and is
not shared between admins or devices.

## Deployment

Production disables automatic Mongoose indexes. Run both additive index migrations on **every
deployment**, against the intended database (platform and university databases). They create indexes
only and never drop data.

```powershell
cd backend
node --env-file=.env src/migrations/create-ai-interview-indexes.js
npm run migrate:anvi-indexes
```

`migrate:anvi-indexes` creates the attempt, live-session and scheduling indexes. The scheduling guards rely
on its unique indexes: one active booking per student and assignment, one target per student, one slot per
start time and one in-progress attempt per student and interview. It also creates the
`{assignmentId, studentId}` attempt index, which is now declared in the schema as well. Deploy the
frontend and backend together and restart the backend.

## Privacy

- **No audio is stored.** Microphone audio is streamed to Gemini Live and, per answer, sent once for transcription. Only text (transcripts, scores, feedback) is saved.
- **Resume questions** need the student's explicit consent at start. Contact details are left out of the text sent to Gemini.
- **Students never receive** the authored expected answer. Key points follow the visibility rules above.
- **Gemini data use depends on the API tier.** Under Google's Gemini API terms, content sent through the unpaid (free) tier may be used by Google to improve its products and may be read by human reviewers. Do not use a free-tier key for real student data; use a paid (billing-enabled) project. Check the current Gemini API Additional Terms before rollout, because these terms change.
- **Self-reported cohort filters.** Branch, course and college can be edited by students in their own profile. A filter-based cohort is therefore self-reported: use a selected list or a CSV roster when membership must be exact.

## API

Admin routes need an admin account and are mounted ahead of `/api/ai-interviews/:id`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/api/ai-interviews` | Directory (`?status=`, `?published=true`, `?search=`) / create draft (Idempotency-Key) |
| GET, PUT, DELETE | `/api/ai-interviews/:id` | Load / revision-checked save / confirmed delete |
| POST | `/api/ai-interviews/:id/{validate,duplicate,archive,restore,publish,unpublish}` | Lifecycle. Unpublish, archive and delete return `409 ASSIGNMENT_ACTIVE` while a schedule is scheduled, open or paused. |
| GET | `/api/ai-interviews/reports/attempts` | Attempts of the admin's interviews (`interviewId`, `assignmentId`, `status`, paging) |
| GET, POST | `/api/ai-interviews/reports/attempts/:id`, `…/:id/re-evaluate` | Attempt detail / queue a re-evaluation |
| GET | `/api/ai-interviews/reports/assignments/:aid/summary`, `…/export.csv` | Cohort summary / CSV |
| GET, POST | `/api/ai-interviews/schedules` | List / create (Idempotency-Key; `dryRun:true` previews). A create still running answers `409 ASSIGNMENT_CREATING`. |
| GET, PATCH | `/api/ai-interviews/schedules/:id` | Detail with KPIs and roster / revision-checked edit |
| POST | `/api/ai-interviews/schedules/:id/{pause,resume,close,cancel,archive,release}` | Lifecycle. Close is refused before the window opens (cancel instead). |
| POST, DELETE | `/api/ai-interviews/schedules/:id/targets`, `…/targets/:studentId` | Add / remove students |
| GET | `/api/ai-interviews/schedules/:id/slots`, `…/roster.csv` | Slots / roster CSV |
| POST | `/api/ai-interviews/schedules/bookings/:bid/{move,cancel}` | Admin move (also rebooks a no-show or a student-cancelled booking) / cancel |

Student routes need a full student account.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/student/ai-interviews` | Practice cards (with `practiceBlocked`) |
| POST | `/api/student/ai-interviews/:id/start` | Practice start or resume (Prep Coins; `403 PRACTICE_BLOCKED` while scheduled) |
| GET, POST | `/api/student/ai-interviews/attempts/:id`, `…/:id/end` | Attempt and report / end without the socket |
| GET | `/api/student/ai-interviews/assignments` | "Scheduled for you" cards (booking, join window, `canStart`, `requiresResume`) |
| GET, POST | `/api/student/ai-interviews/assignments/:aid/slots`, `…/:aid/book` | Open slots / book |
| POST | `/api/student/ai-interviews/assignments/:aid/start` | Assigned start or resume (free; checked by `checkAssignedStart`) |
| POST, DELETE | `/api/student/ai-interviews/bookings/:bid/reschedule`, `…/bookings/:bid` | Reschedule / cancel |
| GET | `/api/student/ai-interviews/bookings/:bid/calendar.ics` | Calendar file |

Socket.IO events (authenticated socket):

- **Client to server:** `anvi:join {attemptId}`, `anvi:audio` (PCM frames), `anvi:end`, `anvi:leave`.
- **Server to client:** `anvi:state`, `anvi:audio`, `anvi:caption`, `anvi:interrupted`, `anvi:ended`, `anvi:error`, `anvi:taken_over`.

## Verification

Tests use MongoMemoryServer (they skip when local sockets are unavailable) and fake Gemini clients. No test
calls the real Gemini API.

```powershell
cd backend
node --test --test-concurrency=1 test/anviPlan.test.js test/anviPrompts.test.js test/anviGemini.test.js test/anviConductor.test.js test/anviEvaluation.test.js test/anviRoutes.test.js test/anviIntegration.test.js test/anviAdminReports.test.js test/anviAssignedStart.test.js test/anviScheduling.test.js test/anviSchedulingRoutes.test.js test/anviSchedulingMaintenance.test.js test/anviScheduleFlow.test.js test/aiInterviewApi.test.js test/aiInterviewDefinition.test.js test/adaptiveEngagement.test.js test/prepCoinSpend.test.js
npm test

cd ../frontend
node --test --test-concurrency=1 test/anviReport.test.js test/anviRoom.test.js test/anviSchedules.test.js test/anviStudentSchedule.test.js test/aiInterviewWizard.test.js test/aiInterviewWorkspace.test.js test/studentDashboard.test.js test/notifications.test.js test/globalSidebar.test.js
npx eslint src/admin/ai-interviews src/student/anvi src/utils/api.js src/components/DateTimePicker.jsx
npm run build
```

Replica-set tests need `--test-concurrency=1`. Real-browser checks (microphone permission, audio
playback, reconnect) are still manual.
