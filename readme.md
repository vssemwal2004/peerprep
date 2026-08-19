# PeerPrep — Master Brief for AI-Generated Presentation

Copy everything below into ChatGPT or another presentation-generation tool.

---

## Role and objective

Act as a senior product storyteller, UI/UX designer, and software architect. Create a polished, competition-ready presentation for **PeerPrep**, a full-stack placement preparation, coding assessment, mock-interview, and student analytics platform.

The presentation should communicate four things clearly:

1. The real student-placement problem PeerPrep solves.
2. The complete role-based product experience.
3. The engineering depth and scalability of the implementation.
4. The measurable value for students, coordinators, and institutions.

Use the supplied facts only. Do not invent users, revenue, placement percentages, production traffic, AI accuracy, uptime, or performance numbers. Where actual metrics are unavailable, label them as future KPIs or target metrics.

## One-line positioning

**PeerPrep is a unified placement-readiness platform that connects structured learning, coding practice, secure assessments, peer mock interviews, feedback, notifications, and analytics in one role-based system.**

## Short product description

PeerPrep helps colleges and training teams manage the complete student preparation cycle. Administrators and coordinators onboard students, organize learning content, create coding problems and assessments, schedule mock-interview events, pair students, manage permissions, send notifications, and review reports. Students practise coding, complete monitored assessments, participate in paired mock interviews, submit feedback, and track their readiness through analytics.

It is not merely an interview scheduler. It combines preparation, evaluation, administration, and improvement into one workflow.

## The problem

Placement preparation is usually fragmented across spreadsheets, messaging groups, coding websites, video-meeting tools, forms, and manually compiled reports. This creates several problems:

- Student records and credentials are difficult to manage at scale.
- Learning content, coding practice, assessments, interviews, and feedback live in separate systems.
- Coordinators cannot easily see which students are improving or falling behind.
- Creating and evaluating coding assessments requires multiple tools.
- Manual interview pairing and slot coordination consume time.
- Students receive delayed or inconsistent notifications.
- Assessment integrity is difficult to monitor remotely.
- Institutions lack one reliable view of student readiness.

## The solution

PeerPrep provides one secure platform with three role-specific workspaces:

- **Student workspace:** preparation, assessments, coding, interviews, feedback, and analytics.
- **Coordinator workspace:** controlled management of assigned students, content, events, assessments, reports, and announcements.
- **Admin workspace:** institution-wide control, onboarding, coordinator access, templates, analytics, and governance.

## Core value proposition

- One platform instead of multiple disconnected tools.
- Role-based access rather than shared administrative credentials.
- Structured student journey from onboarding to readiness analysis.
- Automated pairing, scheduling, email notification, and background processing.
- Integrated coding execution and assessment evaluation.
- Browser-based proctoring signals for assessment integrity.
- Persistent reports and analytics for evidence-based intervention.

## User roles and journeys

### Student journey

1. Receives account credentials through email.
2. Logs in using email/student ID and temporary password.
3. Changes password on first login when required.
4. Uses the dashboard to access learning modules, coding problems, assessments, interviews, and analytics.
5. Practises problems using an integrated code editor and multiple languages.
6. Runs or submits code through an asynchronous execution queue connected to Judge0.
7. Takes assigned timed assessments with heartbeat and integrity monitoring.
8. Joins mock-interview events and receives pairing/schedule information.
9. Proposes or accepts slots and receives email/in-app notifications.
10. Attends the interview session and submits structured feedback.
11. Reviews assessment history, reports, coding performance, and readiness analytics.

### Coordinator journey

1. Receives a coordinator account and temporary credentials.
2. Accesses only the capabilities granted by the administrator.
3. Manages assigned students and their profiles.
4. Creates learning subjects/content and coding problems when permitted.
5. Creates interview events and assessments.
6. Reviews feedback, submissions, reports, and student progress.
7. Publishes announcements and manages operational activities.
8. Uses activity history for accountability.

### Administrator journey

1. Manages the complete platform.
2. Onboards students individually or in bulk using CSV.
3. Creates coordinators and configures granular permissions.
4. Manages students, events, pairings, schedules, question libraries, coding problems, assessments, announcements, and email templates.
5. Reviews compiler activity, assessment reports, feedback, analytics, and company-readiness benchmarks.
6. Tracks credential-email status and resends failed or pending credentials.

## Major product modules

### 1. Authentication and access control

- JWT authentication stored in HttpOnly cookies.
- Passwords hashed with bcrypt.
- Forced password change for temporary credentials.
- Admin, coordinator, and student role protection.
- Granular coordinator permissions for dashboards, students, learning, interviews, assessments, library, compiler, announcements, analytics, and company insights.
- Active-session tracking helps prevent uncontrolled parallel sessions.
- Password reset uses expiring, single-use hashed tokens.

### 2. Student and coordinator onboarding

- Individual and bulk onboarding.
- CSV validation and duplicate detection.
- Temporary credentials and first-login password change.
- Background credential-email queue.
- Delivery states such as not sent, pending, sent, and failed.
- Automatic retry for queued jobs.
- MSG91 SMTP integration using the verified `peerprep.co.in` sender domain.

### 3. Learning management

- Semester- and subject-oriented learning structure.
- Coordinator/teacher association.
- Student progress tracking.
- Admin and coordinator content management.
- Student learning-detail views.

### 4. Coding practice and compiler

- Problem catalogue and detailed problem-solving workspace.
- Code editor experience with language selection.
- Visible and hidden test cases.
- Run and final-submit workflows.
- Judge0 execution service.
- Languages supported by the backend mapping include C, C++, C#, Go, Java, JavaScript, TypeScript, Python, PHP, Ruby, Rust, Kotlin, and Swift.
- CPU, wall-time, memory, source-size, and input-size limits.
- Verdict mapping for accepted, compile error, runtime error, time limit, memory limit, and internal error.
- Execution history, time/memory metrics, and compiler analytics.

### 5. Assessment system

- Assessment creation and editing.
- Question library and problem selection.
- Objective and coding questions.
- Draft/publish lifecycle.
- Student assignment and invitation emails.
- Start/end window, duration, attempt limits, and optional assessment password.
- Timer, heartbeat, answer persistence, and submission states.
- Objective scoring plus queued coding evaluation.
- Student assessment history and reports.
- Admin/coordinator reporting and exports.

### 6. Browser-assisted proctoring

- Camera-based monitoring performed primarily in the browser.
- MediaPipe face-landmark processing.
- TensorFlow.js/COCO-SSD object and person/mobile detection.
- Signals such as face/person anomalies, prohibited objects, tab changes, fullscreen exits, and related integrity events.
- Confidence thresholds, cooldowns, buffered event reporting, and risk summaries.
- Raw camera video is not evidenced as being uploaded by this repository; emphasize event-based monitoring rather than surveillance-video storage.
- Describe this as **AI-assisted proctoring**, not generative AI.

### 7. Mock-interview event management

- Event creation with details and optional resource/template upload.
- Student eligibility and participation records.
- One-way unique student pairing with odd-student handling.
- Interviewer/interviewee assignment.
- Slot proposal, counter-proposal, acceptance, rejection, and automatic scheduling logic.
- Meeting-link support.
- Calendar invite generation using ICS attachments.
- Email and in-app notifications.
- Scheduled, active, and past interview views.

### 8. Feedback system

- Structured post-interview feedback.
- Pair/session-linked records.
- Admin/coordinator review.
- Feedback exports and use in student improvement analysis.

### 9. Notifications and communications

- Socket.IO real-time personal notifications.
- Email templates stored in MongoDB and editable through the admin interface.
- Templates include student onboarding, coordinator onboarding, password reset, event notification, event cancellation, assessment invitation/notification, slot proposal/acceptance/counter-proposal, and interview scheduled confirmation.
- Background MongoDB mail jobs for important bulk flows.
- MSG91 SMTP transport with sender-domain verification.
- Current free MSG91 plan constraints should not be presented as production scale; scaling requires an appropriate email plan and provider rate limit.

### 10. Analytics and reporting

- Student learning and activity analysis.
- Coding submission metrics.
- Assessment scores and history.
- Integrity/proctoring summaries.
- Admin compiler overview and analytics.
- Assessment reports and exports.
- Company benchmark/readiness views.
- Analytics are deterministic and rules/data driven; do not describe them as LLM-generated insights.

### 11. Administration and governance

- Coordinator permission management.
- Student promotion workflows.
- Activity/audit records.
- Announcements.
- Email-template administration.
- Student and coordinator status management.
- Search, filters, bulk operations, and CSV/XLSX exports.

## Technical architecture

Use this architecture diagram:

```text
React 19 + Vite web application
        |
        | HTTPS/JSON + HttpOnly JWT cookie
        | Authenticated Socket.IO
        v
Node.js + Express API
        |
        +-- Auth, roles, permissions, rate limits, validation
        +-- Controllers and domain services
        +-- MongoDB/Mongoose persistence
        +-- Valkey/Redis-compatible execution queues
        +-- Background compiler and assessment workers
        +-- MongoDB-backed mail queue worker
        +-- Judge0 multi-language code execution
        +-- MSG91 SMTP email delivery
        +-- Socket.IO real-time notifications
        +-- Supabase/Cloudinary/S3-related storage utilities
```

## Technology stack

### Frontend

- React 19
- React Router 7
- Vite 7
- Tailwind CSS/PostCSS and component CSS
- Recharts
- Socket.IO Client
- MediaPipe Tasks Vision
- TensorFlow.js and COCO-SSD
- XLSX/CSV tooling
- Framer Motion, Lottie, Lucide icons

### Backend

- Node.js with ES modules
- Express 4
- MongoDB and Mongoose
- Valkey/Redis-compatible queue infrastructure
- Socket.IO
- Judge0 REST API
- Nodemailer with MSG91 SMTP
- bcrypt and JSON Web Tokens
- node-cron
- Winston and Morgan logging
- Supabase, Cloudinary, and AWS S3 utilities

## Important asynchronous workflows

### Code execution

```text
Student submits code
 -> API validates and rate-limits
 -> job enters Valkey queue
 -> worker claims job
 -> Judge0 executes code
 -> verdict and metrics are persisted
 -> frontend polls result and receives updates
```

### Bulk email delivery

```text
Admin selects recipients
 -> encrypted mail jobs stored in MongoDB
 -> worker claims jobs
 -> template rendered with recipient variables
 -> MSG91 SMTP accepts message
 -> job marked sent or retried
 -> UI shows delivery status
```

### Assessment lifecycle

```text
Create -> configure questions/settings -> assign students -> publish
 -> send invitations -> student begins attempt
 -> answers + heartbeat + integrity events
 -> submit -> objective scoring + queued coding evaluation
 -> report and analytics
```

### Mock-interview lifecycle

```text
Create event -> identify participants -> pair students
 -> propose/counter slots -> confirm schedule
 -> share meeting link/calendar invite
 -> conduct interview -> submit feedback -> review analytics
```

## Security and reliability

- bcrypt password hashing.
- HttpOnly authentication cookies.
- Role and permission middleware.
- Input sanitization and validation.
- Helmet, CORS controls, request limits, timeouts, and rate limiting.
- Compiler cooldowns and distributed limits through Valkey.
- Source/input/resource caps for Judge0.
- Encrypted payloads for queued credential emails.
- Idempotency keys for mail jobs.
- Retry and stale-lock recovery for mail jobs.
- Socket authentication and per-user rooms.
- Activity and security logging.

Do not claim perfect security. Present security as layered controls plus an ongoing roadmap.

## Engineering strengths

- Broad end-to-end workflow rather than a single isolated feature.
- Clear separation of role-specific interfaces.
- Asynchronous architecture for expensive compiler and mail operations.
- Multiple persistence models covering operational and analytical needs.
- Granular coordinator permission system.
- Real-time notifications combined with durable database state.
- Integrated assessment integrity signals.
- Extensible email-template system.
- Multi-language coding execution.
- Responsive, lazy-loaded React interface.

## Current limitations — present honestly

- No generative-AI interviewer or LLM-based answer evaluation is implemented.
- AI is used mainly for browser proctoring; analytics are deterministic.
- Production traffic, uptime, placement improvement, and concurrency claims are not proven by repository evidence.
- Email throughput depends on the MSG91 plan, domain warm-up, and rate limits.
- Some email flows are queued while some scheduling emails still send directly.
- Multi-instance Socket.IO scaling would require a shared Redis adapter.
- Broader automated integration/E2E test coverage can be improved.
- Infrastructure-as-code and a complete CI/CD pipeline are not evidenced.
- Database URI, secret management, monitoring, backup, and deployment configuration must be hardened for production.

## Future roadmap

Organize the roadmap into three stages:

### Stage 1 — reliability and deployment

- Standardize all emails through one durable queue.
- Add pause/resume, failed-only retry, batch progress, and provider throttling.
- Add centralized observability, alerts, email webhooks, bounce handling, and delivery dashboards.
- Strengthen secrets management, database naming/backups, CI/CD, and infrastructure automation.
- Add integration and end-to-end tests.

### Stage 2 — institutional scale

- Horizontal API/worker scaling.
- Socket.IO Redis adapter.
- Separate worker services and autoscaling.
- Advanced cohort analytics and intervention alerts.
- Placement-cell and recruiter workflows.
- Multi-college/multi-tenant isolation.
- SSO and richer audit/compliance controls.

### Stage 3 — responsible AI expansion

- AI-generated practice recommendations grounded in student performance.
- Explainable rubric-assisted feedback summaries.
- Resume-to-skill-gap analysis with consent.
- AI mock-interview assistant with clear disclosure and human oversight.
- Bias evaluation, privacy controls, prompt/version tracking, and opt-out mechanisms.

## Suggested slide structure

Create approximately 18–22 slides:

1. Cover — PeerPrep and one-line positioning.
2. The placement-preparation problem.
3. Why current fragmented tools fail.
4. PeerPrep solution overview.
5. Three-role ecosystem.
6. Student end-to-end journey.
7. Admin and coordinator control plane.
8. Learning and coding-practice module.
9. Coding execution pipeline.
10. Assessment lifecycle.
11. AI-assisted proctoring.
12. Mock-interview pairing and scheduling.
13. Feedback and improvement loop.
14. Notifications and email architecture.
15. Analytics and readiness reporting.
16. System architecture.
17. Database/domain model.
18. Security and reliability.
19. Scalability strategy.
20. Current implementation strengths and honest limitations.
21. Product roadmap.
22. Closing impact statement and demo/QR placeholder.

If a shorter deck is required, combine slides 2–3, 8–9, 10–11, 12–13, 16–17, and 18–19.

## Visual design direction

- Style: modern education technology combined with engineering credibility.
- Mood: confident, clean, youthful, and professional—not overly corporate.
- Use a dark navy or deep indigo base with electric blue/cyan highlights, violet accents, white cards, and limited green for successful outcomes.
- Prefer large headlines, short supporting text, diagrams, product mockups, charts, and icons.
- Avoid paragraphs on slides; move detailed explanation into speaker notes.
- Use consistent rounded cards, subtle gradients, fine grid patterns, and restrained shadows.
- Use role colors consistently: student = cyan/blue, coordinator = violet, admin = amber or indigo.
- Use flow diagrams for journeys and pipelines.
- Use a layered architecture diagram rather than a dense technology list.
- Use real PeerPrep screenshots when available. Do not fabricate screenshots that could be mistaken for the actual UI; clearly mark conceptual mockups.
- Keep each slide focused on one message.

## Recommended diagrams

1. Three-role ecosystem around a central PeerPrep platform.
2. Student preparation flywheel: Learn -> Practise -> Assess -> Interview -> Feedback -> Improve.
3. Code execution sequence from browser to queue to Judge0 and back.
4. Assessment lifecycle timeline.
5. Pairing and scheduling flow.
6. Layered system architecture.
7. Security shield with authentication, authorization, limits, encryption, and monitoring.
8. Roadmap with three maturity stages.

## Suggested opening narrative

“Placement readiness is not one activity. A student must learn, practise, prove skills under assessment conditions, communicate in interviews, receive feedback, and improve. Institutions usually manage these steps across disconnected tools. PeerPrep brings the entire preparation loop into one measurable platform.”

## Suggested closing narrative

“PeerPrep transforms placement preparation from a collection of isolated activities into a continuous improvement system. Students gain a clear path to readiness, coordinators gain actionable visibility, and institutions gain a scalable operational foundation.”

## Output requirements for the presentation tool

- Produce slide titles, concise on-slide copy, recommended visuals, and speaker notes for every slide.
- Include at least four meaningful diagrams.
- Include placeholders for real screenshots and a live-demo QR code.
- Include one architecture slide and one roadmap slide.
- Keep claims technically accurate and distinguish implemented capabilities from roadmap items.
- Do not call PeerPrep an “AI interview platform.” Call it a placement-readiness platform with AI-assisted browser proctoring.
- Do not claim thousands of concurrent users, guaranteed email delivery times, placement-rate improvement, or production SLAs without supplied evidence.

