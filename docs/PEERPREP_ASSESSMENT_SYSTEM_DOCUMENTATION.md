# PeerPrep Assessment System

## Complete Product, Workflow, Feature, and Technical Documentation

Document purpose: This document explains the current PeerPrep assessment system in detail so it can be used as a reference while designing a more powerful standalone examination platform.

Scope: Admin and coordinator authoring, student assessment experience, question management, coding execution, security controls, AI proctoring, scoring, reports, analytics, notifications, APIs, data models, and known limitations.

---

## 1. System Overview

PeerPrep's assessment module is a role-based, scheduled examination system supporting:

- MCQ questions
- Short-answer questions
- One-line questions
- Compiler-evaluated coding questions
- Mixed assessments with multiple sections
- Positive and negative marking
- Draft and published assessments
- All-student or selected-student assignment
- Password-protected assessment launch
- Secure pre-exam verification
- Timed attempts and automatic submission
- Browser activity monitoring
- Camera snapshots
- Browser-side AI proctoring
- Asynchronous coding evaluation
- Student and administrator reports
- Violation review and integrity analytics
- CSV, Excel, and PDF-oriented reporting workflows

The system has three principal actors:

1. **Administrator**
   Creates assessments, manages questions, publishes tests, reviews reports, releases results, resets submissions, and manages assessment lifecycle.

2. **Coordinator**
   Uses the same assessment pages as an administrator, but access is controlled by granular coordinator permissions.

3. **Student**
   Views assigned assessments, unlocks and completes security setup, attempts questions, submits answers, and reviews permitted results.

---

## 2. High-Level Architecture

### 2.1 Frontend

The frontend is a React 19 single-page application built with Vite and React Router.

Important technologies:

- React 19
- React Router
- Tailwind-based UI styling
- Monaco-style/code editor components
- Socket.IO client
- XLSX for spreadsheet generation
- MediaPipe Tasks Vision for face analysis
- TensorFlow.js and COCO-SSD for object/person/mobile detection
- Browser APIs for fullscreen, camera, microphone analysis, geolocation, visibility, keyboard restrictions, and local storage

### 2.2 Backend

The backend is an Express application using MongoDB through Mongoose.

Important technologies:

- Node.js
- Express
- MongoDB and Mongoose
- Cookie/session authentication middleware
- Role and coordinator-permission authorization
- Redis/Valkey-backed queue infrastructure
- Embedded or standalone assessment workers
- Socket.IO
- Notification services
- CSV/report export services

### 2.3 Main Data Flow

```text
Admin/Coordinator
    -> Assessment Builder
    -> Assessment API
    -> MongoDB Assessment document
    -> Student assignment and notifications

Student
    -> Assessment dashboard
    -> Unlock/password verification
    -> Ordered security checks
    -> Begin timed attempt
    -> Autosave/submit answers
    -> Violation, heartbeat, and monitoring APIs
    -> MongoDB AssessmentSubmission document

Coding answer
    -> Compiler API
    -> Assessment queue
    -> Assessment worker
    -> Judge/execution service
    -> Answer verdict and final score update

Admin reports / Student reports
    -> Reporting APIs
    -> Assessment + AssessmentSubmission aggregation
    -> Filtered tables, drill-down reports, exports, and analytics
```

---

## 3. Roles and Permissions

### 3.1 Administrator Access

Administrators can access all assessment functions through protected admin routes.

### 3.2 Coordinator Access

Coordinator operations use granular permissions:

- `coordinator.assessment.view`
- `coordinator.assessment.create`
- `coordinator.assessment.edit`
- `coordinator.assessment.reports`
- `coordinator.library.view`
- `coordinator.library.create`
- Compiler-related view, create, manage, and analytics permissions

The backend checks these permissions independently of the frontend route.

### 3.3 Student Access

Student assessment APIs require:

- An authenticated account
- Student role
- Assignment to the assessment
- A published assessment
- A valid assessment schedule
- Password verification when enabled
- Completion of required security setup before the timed attempt begins

---

## 4. Application Pages

## 4.1 Admin and Coordinator Pages

### Assessment Dashboard

Routes:

- `/admin/assessment`
- `/coordinator/assessment`

Purpose:

- List created assessments
- Separate or identify draft, upcoming, live, and completed assessments
- Open an assessment for editing
- Open fullscreen preview
- navigate to reports
- Delete an assessment
- Reset assessment submissions
- Mark an assessment complete
- Release answers/results

Typical card or row output includes:

- Assessment title
- Assessment ID
- Type
- Question count
- Total marks
- Start and end time
- Duration
- Assignment information
- Lifecycle status
- Operational status based on current time

### Assessment Builder

Routes:

- `/admin/assessment/create`
- `/admin/assessment/:id/edit`
- Equivalent coordinator routes

The builder is a multi-step workflow:

1. Basic information
2. Target students
3. Schedule and limits
4. Sections and questions
5. Settings
6. Review and publish

The page supports saving a draft and publishing a validated assessment.

### Admin Assessment Preview

Routes:

- `/admin/assessment/preview/:id`
- `/coordinator/assessment/preview/:id`

Purpose:

- Fullscreen review of the assessment before student use
- Review section order, question content, marks, and coding content
- Confirm how the assessment structure will appear

### Question Library

Routes:

- `/admin/library`
- `/coordinator/library`

Features:

- List reusable questions
- Search and filter library content
- Filter by question type
- Inspect source and tags
- Open a detailed question preview
- Select multiple questions and insert them into the active assessment draft
- Support MCQ, short, one-line, and coding content

### Add Questions to Library

Routes:

- `/admin/library/add-question`
- `/coordinator/library/add-question`

Features:

- Create individual questions
- Create multiple questions in one operation
- Import MCQ and text-answer questions from CSV
- Validate required fields
- Save questions in bulk

### Assessment Reports

Routes:

- `/admin/assessment/reports`
- `/coordinator/assessment/reports`

Features:

- Assessment-level overview
- Candidate performance table
- Flagged-session table
- Score distribution
- Violation-type distribution
- Violation trend
- Search, sorting, pagination, and customizable columns
- Advanced filters
- Saved filters in the browser
- Candidate report drawer
- Detailed violation modal
- CSV, Excel, and PDF export controls

## 4.2 Student Pages

### Student Assessment Dashboard

Routes:

- `/student/assessments`
- `/assessments`

The page groups assessments into:

- Ongoing assessments
- Upcoming assessments

The launch flow uses an assessment launch modal before opening the attempt page.

### Assessment Attempt

Route:

- `/student/assessment/:id`

This is the complete exam-taking application. It contains:

- Loading and access validation
- Password unlock flow
- Rules briefing
- Secure setup wizard
- Timed question interface
- Section and question navigator
- MCQ answer controls
- Text answer input
- Coding problem statement and editor
- Language selection
- Run and submit code actions
- Mark-for-review state
- Timer and automatic submission
- Security footer and camera preview
- Warning, fullscreen recovery, and security recheck overlays
- Final submission confirmation

### Assessment Reports

Routes:

- `/student/assessment-reports`
- `/assessment-reports`

Features:

- Searchable report library
- Status filters
- Result availability state
- Report summary
- Score, percentage, rank, and time, when permitted
- Section performance
- Question-wise review
- Correct-answer and explanation visibility, when permitted
- Security summary
- Excel export of the student's own permitted report data

### Assessment History

Routes:

- `/student/assessment-history`
- `/assessment-history`

Purpose:

- Show past assessment attempts
- Show completion and result state
- Provide a historical path to available reports

### Student Analytics

Routes:

- `/student/analytics`
- `/student/analysis`

Assessment data contributes to:

- Attempt count
- Average score
- Adjusted average score
- Highest score
- Integrity score
- Violation attempts
- Security risk
- Assessment stability
- Recent assessment trend
- Readiness calculations

Sensitive raw monitoring data is removed from student-facing analytics.

---

## 5. Assessment Creation Workflow

## 5.1 Basic Information Inputs

The administrator enters:

- Test name/title
- Test type
- Assessment ID
- Short description
- General instructions
- Additional custom instructions
- Visibility status

PeerPrep includes default exam instructions covering:

- Reading questions carefully
- Time limits
- Prohibition of copying and external resources
- Stable internet connection
- Finality of submission
- Possible camera or screen-related proctoring

### Output

The system produces an assessment identity and the student-facing descriptive content displayed before and during the exam.

## 5.2 Target Student Inputs

Assignment modes:

- All students
- CSV-based student assignment
- Individual student selection

Draft targeting information is stored separately so incomplete drafts can preserve user selections.

### CSV Student Assignment

The CSV uploader:

- Accepts `.csv` files
- Parses headers and rows
- Validates student data
- Displays a preview
- Reports row-level errors
- Allows downloading an error CSV
- Can prepare new student accounts during publication

### Output

The published assessment contains:

- `targetType: all`, or
- `targetType: selected` with resolved user IDs

The publication summary displays total assigned students and newly created accounts.

## 5.3 Schedule and Attempt Inputs

Inputs:

- Start date and time
- End date and time
- Duration in minutes
- Allow late submission
- Attempt limit

Validation:

- A published assessment requires a complete schedule
- Start and end values must be valid dates
- The assessment duration is enforced independently of the overall availability window

### Effective End Time

The attempt end is the earlier applicable limit derived from:

- Assessment end time
- Student start time plus duration
- Additional paused duration granted during server-approved security rechecks

## 5.4 Section Creation

Each section has:

- Section name
- Section question type
- Marks per question
- Negative marks per question
- Question list
- Calculated total marks

Supported section types:

- `mcq`
- `short`
- `one_line`
- `coding`

An assessment containing more than one question type is classified as mixed.

## 5.5 Question Creation

### MCQ Input

- Question text
- Options
- Correct option
- Positive marks
- Negative marks
- Optional tags

### Short and One-Line Input

- Question text
- Expected answer
- Optional keywords
- Positive marks
- Negative marks
- Optional tags

Keyword evaluation requires all configured keywords to occur in the normalized student answer.

### Coding Question Input

- Title
- Rich problem description or statement
- Constraints
- Input format
- Output format
- Difficulty
- Tags
- Category, such as DSA or SQL
- Supported languages
- Starter code per language
- Time limit
- Memory limit
- Visible sample test cases
- Hidden test cases
- Optional test-case explanations
- Positive marks
- Negative marks
- Linked compiler problem ID
- Snapshot of problem data

The builder can:

- Create coding content directly
- Open a dedicated coding editor
- Select a compiler problem from the problem library
- Validate that a coding problem is suitable for publication

## 5.6 Question Import

Question sources:

- Manual authoring
- Question library
- CSV import
- Compiler problem library

MCQ CSV expects a question, four options, and a recognizable correct answer/index.

Short-answer CSV expects question text and an expected answer. An optional heading can be prefixed to the question.

## 5.7 Draft and Publish

### Draft

A draft can preserve incomplete configuration and targeting information.

### Publish Validation

Before publication, the backend requires:

- At least one section
- At least one question
- Valid schedule and duration
- Valid target assignment
- Valid marks and question structure
- Valid coding problems and test configuration
- Password value when password protection is newly enabled

### Publish Output

Publication:

- Resolves assigned students
- May create new student accounts from supplied rows
- Normalizes sections and settings
- Calculates total marks
- Determines assessment type
- Sets lifecycle to published
- Stores version information
- Stores a password hash rather than a plain password

---

## 6. Complete Settings Reference

## 6.1 Access and Visibility

### Password Protection

When enabled:

- A candidate must submit the correct password before setup
- The backend compares against a password hash
- Successful verification is stored on the submission
- The password hash is never returned in assessment API responses

### Test Visibility

Controls whether the assessment appears to students. Draft status and assignment checks still apply.

## 6.2 Fullscreen Protection

Settings:

- Enable fullscreen
- Fullscreen recovery timeout
- Fullscreen action

Behavior:

- Fullscreen is included in secure setup when required
- Exits are counted and logged
- The candidate receives a recovery overlay
- Continued failure can escalate according to the configured action

Possible actions are normalized to:

- Warn
- Pause and require security recheck
- Auto-submit

Browser limitation: A web application cannot make fullscreen impossible to exit. It can detect and react to exit events.

## 6.3 Tab and Focus Protection

Settings:

- Enable tab-switch detection
- Maximum tab switches
- Warning threshold
- Action after reaching the limit

Behavior:

- Visibility/focus changes are detected
- Each accepted event is logged
- Counters and violation score are updated
- The configured threshold can warn, pause, or auto-submit

## 6.4 Copy, Paste, Context Menu, and Restricted Shortcuts

Settings:

- Disable copy and paste
- Block right-click
- Copy/paste action

The client attempts to block:

- Copy
- Paste
- Cut
- Drag/drop text insertion
- Context menu
- Print
- Page-source and selected restricted shortcuts

Attempts are shown as warnings and can be reported to the server.

Browser limitation: Client-side restrictions are deterrents, not a complete operating-system security boundary.

## 6.5 Screenshot Shortcut Protection

The client detects common screenshot keyboard shortcuts and displays a timed warning.

It cannot guarantee prevention of:

- Operating-system tools
- External capture software
- Another physical camera
- Platform-specific screenshot paths unknown to the browser

## 6.6 Question Watermark

Settings:

- Enable watermark
- Text source
- Custom text
- Opacity
- Color
- Angle
- Spacing
- Font size

The watermark can identify the platform, candidate, or custom text and is overlaid on question content as a sharing deterrent.

## 6.7 Question and Option Shuffle

Settings:

- Randomize question order
- Randomize MCQ option order

Behavior:

- The student receives a deterministic candidate-specific display order
- Original section and question indexes are preserved internally
- When options are shuffled, the selected displayed option is translated back to the original option index before submission

This preserves correct backend scoring.

## 6.8 Camera Monitoring

Settings:

- Enable camera monitoring
- Snapshot interval
- Alert when a face is not detected
- Camera-related action

Behavior:

- Camera permission is requested
- Camera verification is included in secure setup
- A low-resolution JPEG snapshot is periodically created
- Snapshot data is posted to the monitoring API
- Camera visibility checks create notices and monitoring events
- Camera issue counters can be included in reports

Camera snapshots are distinct from AI proctoring events. Basic camera monitoring may upload configured periodic snapshots; the AI proctoring event API strips image-like metadata.

## 6.9 AI Proctoring

Settings:

- Enable AI proctoring
- Detect mobile phone
- Detect multiple persons
- Detect no face
- Detect face out of frame
- Detect looking away
- Detection interval: 500 to 5000 ms
- Ignore limit: 0 to 50 violations
- Violation cooldown: 5 to 120 seconds
- Mark serious events as high risk

Detailed operation is explained in Section 9.

## 6.10 Audio Monitoring

Settings:

- Enable audio monitoring
- Noise threshold
- Event cooldown

Actual implementation:

- Uses the browser Web Audio API
- Analyzes microphone amplitude/noise level
- Posts threshold-exceeded monitoring events
- Does not use `MediaRecorder` to create or upload a continuous audio recording

Therefore, the current implementation is noise-event monitoring, not full audio recording.

## 6.11 Timer and Auto-Submission

Settings:

- Auto-submit when the timer ends
- Warning time before auto-submission

Behavior:

- The client shows remaining time
- The server also validates the allowed end time
- The client submits automatically at zero when enabled
- Server-side expiration prevents bypassing the browser timer

## 6.12 Multiple-Tab Detection

Setting:

- Prevent multiple tabs/windows

Behavior:

- Uses local storage records and short periodic heartbeats between instances
- Detects another active instance for the same assessment
- Reports duplicate-tab state in security heartbeat
- Can pause or auto-submit according to configured action

This is browser-profile-local detection. It cannot reliably detect a second device or an unrelated browser profile.

## 6.13 Navigation Restrictions

Settings:

- Restrict backward navigation
- Allow review within the current section

Modes:

- Lock all previously passed questions
- Allow backward review only inside the active section
- Permit normal navigation when restriction is disabled

## 6.14 Section-Wise Time Locking

Settings:

- Enable section-wise locking
- Grace period

Current behavior:

- Total assessment time is divided proportionally by question count
- Each section receives an internally calculated start and end offset
- A section locks after its allocated time plus grace period

There is currently no separate administrator-entered duration field per section.

## 6.15 Idle Detection

Settings:

- Enable idle detection
- Idle threshold in minutes
- Idle action

Interaction resets the idle timer. A threshold breach creates an idle event that can warn or escalate based on policy.

## 6.16 Security Recheck Timer

Setting:

- Maximum security recheck time, normally 30 to 1800 seconds

Behavior:

- Certain violations pause the assessment
- Required security steps are reset
- The exam timer excludes approved paused duration
- The student must repeat security setup
- Failure to complete recheck in time causes server-side auto-submission

## 6.17 Result Settings

Settings:

- Show result after submission
- Show correct answers
- Show section breakdown
- Show percentile/rank
- Delay result release by hours
- Allow retake
- Minimum retake gap

The backend calculates permissions for each report field. Hiding the result in the UI alone is not relied upon.

The retake controls are present in configuration, and attempt-limit checks exist, but the current single-submission data model does not provide a complete independent retake lifecycle. This should be treated as an incomplete capability rather than a finished multi-attempt feature.

## 6.18 General Violation Policy

Advanced backend settings:

- Auto-submit on violation
- Maximum warning count
- Warning score
- Pause score
- Auto-submit score
- Per-event violation weights

These settings allow count-based and weighted risk escalation.

---

## 7. Student Assessment Workflow

## 7.1 Dashboard State

The student dashboard obtains a server-generated assessment dashboard and categorizes assessments by schedule and attempt state.

Possible attempt states include:

- Not started
- In progress
- Submitted
- Expired
- Violation
- Incomplete

## 7.2 Launch and Unlock

Input:

- Assessment ID from route
- Optional assessment password

Server validation:

- Assessment exists
- Assessment is published
- Schedule is complete
- Student is assigned
- Current time is inside the allowed window
- Attempt limit is not exhausted
- Password is correct

Output:

- Sanitized assessment
- Submission state
- Server time
- Allowed end time
- Security recheck timeout

## 7.3 Rules Briefing

Before the timed attempt, the student sees:

- Assessment title
- Duration
- Total marks
- Total questions
- Question types
- Section breakdown
- Monitoring rules generated from active settings
- Custom and default instructions
- A short start countdown

## 7.4 Ordered Secure Setup

Required steps are determined by settings:

1. Environment check
2. Camera check, when camera monitoring is enabled
3. Location check, unless location tracking is explicitly disabled
4. Fullscreen check, when fullscreen is enabled
5. Final check

The backend enforces step order. A student cannot call the begin endpoint before all required steps are recorded.

### Environment Check

Checks browser/session information and active-tab conditions.

### Camera Check

- Requests camera permission
- Starts video stream
- Confirms that a usable frame exists
- Updates local status
- Records completion on the backend

### Location Check

- Requests browser geolocation
- Sends setup metadata to the backend
- Is required by default

### Fullscreen Check

- Requests browser fullscreen
- Confirms active fullscreen
- Records completion

### Final Check

Verifies required statuses and unlocks the begin action.

## 7.5 Begin Attempt

The server:

- Revalidates assignment, time window, password, and setup
- Creates or updates the submission
- Sets `startedAt`
- Sets status to `in_progress`
- Preserves or completes security state
- Calculates allowed end time

The exam timer starts from the server-approved start.

## 7.6 Answering Questions

### MCQ

Input: Selected displayed option index.

Stored output: Original option index after reversing any option shuffle.

### Short or One-Line

Input: Text.

Stored output: Text answer.

### Coding

Input:

- Language
- Source code
- Optional custom input for run

Outputs:

- Queue job ID
- Execution state
- Verdict
- Execution result
- Last evaluated time

## 7.7 Navigation and Review

The interface provides:

- Previous and next actions
- Question palette
- Answered/unanswered state
- Mark for review
- Section labels
- Locked-state messages

Restrictions are applied according to navigation and section-lock settings.

## 7.8 Periodic Saving

The submission endpoint accepts an `in_progress` state and saves:

- Current answers
- Last save time
- Violation counters
- Violation score
- Pause information
- Security heartbeat
- Client violation collection
- IP address
- User agent

## 7.9 Heartbeat

Every approximately five seconds, the client reports:

- Fullscreen active
- Tab active
- Camera active
- Idle state
- Duplicate-tab state
- Violation score and selected counters

The backend checks consistency with active assessment rules and can return:

- Warn
- Pause
- Auto-submit

Soft camera/no-face warnings are specifically prevented from forcing a security pause through heartbeat.

## 7.10 Monitoring Events

Monitoring events can include:

- Camera snapshots
- Audio noise threshold events
- Other monitoring metadata

Monitoring data is stored separately from the primary violation log.

## 7.11 Manual Submission

The student receives a confirmation dialog because submission cannot be undone in the current single-submission record.

Submission input:

- Assessment ID
- Answers
- Requested final status
- Tab switches
- Fullscreen exits
- Copy/paste count
- Camera flags
- Violation score
- Pause count
- Last pause time
- Security heartbeat
- Client-side violation list

Submission output:

- Saved status
- Submission timestamp
- Allowed end
- Server time
- Coding evaluation status
- Queued coding job IDs

## 7.12 Automatic Submission

Auto-submission can happen because of:

- Timer expiration
- Security recheck expiration
- Configured violation threshold
- Configured weighted violation score
- Configured tab/fullscreen/duplicate-tab action
- Closed window with late submission disabled

The server performs scoring before returning the final state.

---

## 8. Scoring and Evaluation

## 8.1 MCQ Scoring

```text
Correct answer: add positive points
Wrong attempted answer: subtract negative points
Skipped answer: no change
```

## 8.2 Short and One-Line Scoring

Normalization:

- Trim whitespace
- Convert to lowercase

Evaluation:

- Exact normalized match receives full positive marks
- If exact match fails and keywords exist, every keyword must be present
- A wrong non-empty answer can receive negative marks
- If no expected answer is configured, it remains pending rather than automatically correct

This is deterministic text matching, not AI semantic grading.

## 8.3 Coding Scoring

Final coding evaluation uses hidden and visible judge cases through the compiler workflow.

Verdicts include:

- `PENDING`
- `AC`
- `WA`
- `TLE`
- `RE`
- `CE`
- `FAILED`

Scoring:

- `AC`: full positive marks
- Submitted non-empty code without `AC`: negative marks may apply
- Empty code: skipped

## 8.4 Accuracy

```text
accuracy = score / maximum marks * 100
```

Accuracy is rounded to two decimal places. Negative marking can theoretically produce a negative score and percentage unless separately constrained in the presentation layer.

## 8.5 Asynchronous Coding Evaluation

At final assessment submission:

1. Non-coding answers receive immediate deterministic scoring.
2. Coding answers are queued.
3. Submission evaluation status may become processing.
4. Assessment workers execute coding jobs.
5. Each answer receives execution status, verdict, and result.
6. The full assessment score is recalculated.
7. Evaluation status becomes completed or failed.

Worker concurrency is configurable through `ASSESSMENT_WORKER_CONCURRENCY`.

---

## 9. AI Proctoring

## 9.1 Processing Model

AI proctoring runs in the candidate's browser.

It uses:

- MediaPipe vision components for face-related analysis
- COCO-SSD through TensorFlow.js for object and person detection
- A proctoring manager
- Face, object, and eye-movement detectors
- Confidence rules
- Cooldown rules
- A temporal violation buffer

The regular AI violation API does not upload live video. Image, frame, canvas, base64, snapshot, and video-like metadata keys are stripped before event submission.

This statement does not apply to the separate periodic camera snapshot feature.

## 9.2 Detected AI Events

- No face
- Face out of frame
- Multiple faces
- Multiple persons
- Mobile phone detected
- Looking away
- Camera blocked

## 9.3 Confirmation Flow

Raw model output is not immediately treated as a violation.

The browser applies:

- Confidence thresholds
- Required persistence time
- Confirmation counts
- Repetition windows
- Event cooldown
- Ignore-limit behavior

Only confirmed events are emitted to the backend.

## 9.4 Default AI Event Weights

- No face: 5
- Face out of frame: 5
- Multiple faces: 12
- Multiple persons: 12
- Mobile detected: 15
- Looking away: 6
- Camera blocked: 8

Important current behavior: AI detections are classified as non-blocking detection violations by the assessment controller. They are logged, counted, summarized, and shown as warnings, but receive zero enforcement weight in the generic pause/auto-submit decision. Their default weight table is available for analytics and future scoring evolution.

## 9.5 AI Risk Levels

Count-based minimum risk:

- 0 events: clean
- 1-2 events: low
- 3-5 events: medium
- 6-9 events: high
- 10 or more events: critical

Event-based escalation:

- Mobile or multiple-person detection raises risk to at least medium
- Camera blocked raises risk to at least high

## 9.6 Stored AI Summary

The submission stores:

- Total AI violations
- No-face count
- Face-out-of-frame count
- Multiple-face count
- Multiple-person count
- Mobile-detected count
- Looking-away count
- Camera-blocked count
- Risk level
- Last AI violation time

## 9.7 Student Experience

During the exam:

- Proctoring status appears in the footer
- Camera status is visible
- Confirmed AI issues create non-blocking notices
- Repeated events can increase warning count
- The test continues unless another non-AI security policy pauses or submits it

## 9.8 Admin Experience

The AI proctoring report panel shows:

- Whether AI proctoring was active
- Summary counts
- Risk level
- Event categories
- Last violation information

## 9.9 Current AI Proctoring Limitations

- Models run on the student's hardware and may perform differently across devices
- Lighting, camera angle, glasses, and low-end hardware may affect confidence
- Looking-away detection is an indicator, not proof of cheating
- Mobile and person detection can generate false positives
- There is no server-side live-video supervision
- Backend `proctoring.service.js` and constants files still contain placeholder scaffolding; active behavior is implemented mainly in frontend proctoring modules and controller rules
- AI events do not currently auto-submit by themselves

---

## 10. Violation System

## 10.1 Supported Violation Categories

The system handles events including:

- Tab switch
- Fullscreen exit
- Camera loss
- No face
- Multiple faces
- Face out of frame
- Copy/paste
- Context menu
- Screenshot shortcut
- Idle
- Duplicate tab
- Heartbeat failure
- AI no face
- AI face out of frame
- AI multiple faces
- AI multiple persons
- AI mobile detected
- AI looking away
- AI camera blocked

## 10.2 Violation Record

A server violation log entry contains:

- Type
- Sanitized message
- Timestamp
- Metadata
- Weight
- Optional severity
- Optional confidence
- Optional source

## 10.3 Violation Counters

The submission separately stores:

- Tab switches
- Fullscreen exits
- Copy/paste count
- Camera flags
- Violation score
- Pause count

## 10.4 Decision Order

For blocking violations, the backend considers:

1. Maximum warning count
2. Auto-submit score
3. Pause score
4. Warning score
5. Event-specific threshold and action
6. Default warning behavior

Non-blocking AI and soft camera/fullscreen warning categories are forced to warning-only behavior in their normal form.

## 10.5 Pause and Recheck

When the decision is `pause`:

- The pause start is stored
- Pause count increments
- Security setup completion is reset
- The student is shown the recheck flow
- Paused duration is excluded from effective test time

## 10.6 Auto-Submit

When the decision is `autosubmit`:

- An additional `auto_submit` log entry is created
- The client receives `autoSubmit: true`
- The attempt is submitted through the normal finalization path

---

## 11. Reports and Outputs

## 11.1 Admin Summary Outputs

The reporting module can produce:

- Assessment count
- Attempt count
- Completion rate
- Average score
- Highest score
- Score distribution
- Violation count
- Violation type distribution
- Violation trend
- Flagged candidate sessions
- Assessment-wise performance

## 11.2 Candidate Row Outputs

Typical fields:

- Student name
- Student ID
- Email
- Assessment
- Start time
- Submission time
- Time taken
- Score
- Maximum marks
- Percentage/accuracy
- Status
- Rank
- Violation count
- Tab switches
- Fullscreen exits
- Camera flags
- Copy/paste count
- Risk information

## 11.3 Candidate Detail Output

The detailed report can include:

- Assessment metadata
- Candidate metadata
- Attempt status
- Score and percentage
- Correct, wrong, skipped, and pending counts
- Section-wise score
- Question-wise answers
- Marks obtained per question
- Coding verdict
- Correct answer and explanation, when permitted
- Browser and user-agent details
- Last IP
- Monitoring timeline
- Violation timeline
- AI proctoring summary

## 11.4 Student Result Permissions

The server separately determines whether the student can view:

- Result released state
- Score
- Percentage
- Rank
- Time analysis
- Section analytics
- Question review
- Correct answers
- Explanations

Result availability can be:

- Immediate after submission
- Released after a configured delay
- Released manually by an administrator

## 11.5 Export

Admin workflows support:

- CSV
- Excel
- PDF-oriented export from selected report data
- Selectable export columns
- Saved preferred export columns

Student reports support Excel export using only fields the student is permitted to view.

---

## 12. Lifecycle and Operational Actions

## 12.1 Lifecycle States

- Draft
- Published

Operational status is also calculated from schedule:

- Upcoming
- Live
- Completed

An administrator can manually mark an assessment complete.

## 12.2 Versioning

Assessments store:

- Version number
- Last version update time

Publishing or updating increments version information for auditability.

This is a counter-based audit signal, not a complete immutable version-history store.

## 12.3 Reset Submissions

The reset action removes or resets associated attempt data so candidates can start again according to current assessment state.

This is a high-impact administrative action and should be protected with confirmation in a future platform.

## 12.4 Release Answers

The release action turns on:

- Results
- Correct answers
- Section breakdown
- Percentile/rank

It also removes the result delay.

## 12.5 Delete Assessment

Deletion is protected by assessment edit permission. A future standalone platform should define explicit behavior for associated submissions, reports, coding jobs, and audit retention.

---

## 13. Notifications

Assessment notifications include:

- Scheduled reminders approximately 24 hours before
- Reminder approximately 1 hour before
- Reminder approximately 10 minutes before
- Assessment-live notification when start time is reached
- Submission-success notification

Notification links direct the student to the relevant assessment or dashboard.

Deduplication keys prevent repeated delivery of the same scheduled notification.

---

## 14. API Reference

All paths below are mounted under the application's API base.

## 14.1 Admin and Coordinator Assessment APIs

### `POST /admin/assessment/create`

Creates a draft or published assessment.

Input categories:

- Metadata
- Schedule
- Targeting
- Sections
- Settings
- Password
- Lifecycle intent

Output:

- Created assessment
- Assignment/account-creation information

### `GET /admin/assessment/list`

Returns assessments visible to the authorized administrator/coordinator.

### `GET /admin/assessment/:id`

Returns full editable assessment details with password hash removed.

### `PUT /admin/assessment/:id`

Updates assessment configuration and increments version information.

### `DELETE /admin/assessment/:id`

Deletes the assessment according to controller rules.

### `POST /admin/assessment/:id/reset-submissions`

Resets attempts associated with the assessment.

### `POST /admin/assessment/:id/mark-complete`

Sets manual completion state.

### `POST /admin/assessment/:id/release-answers`

Immediately releases detailed results and answers.

### `GET /admin/assessment/reports`

Returns filtered and paginated report data.

Common filters include:

- Search
- Assessment
- Assessment window
- Type
- Status
- Difficulty
- Department
- Date range
- Minimum score
- Maximum score

### `GET /admin/assessment/reports/submissions/:submissionId`

Returns a detailed candidate report.

### `GET /admin/assessment/reports/export-data`

Returns structured export metadata and data.

### `GET /admin/assessment/reports/export`

Returns CSV export content.

### `GET /admin/assessment/submissions/:submissionId/violations`

Returns detailed violation information for a submission.

## 14.2 Question Library APIs

- `GET /admin/library/questions`
- `POST /admin/library/questions`
- `POST /admin/library/questions/bulk`
- `GET /admin/library/questions/:id`
- `POST /admin/library/questions/resolve`

## 14.3 Student Assessment APIs

### `GET /student/assessments`

Returns assigned student assessments.

### `GET /student/assessment-dashboard`

Returns grouped dashboard data and report/history summaries.

### `POST /student/assessment/:id/start`

Unlocks the assessment and verifies password.

Input:

```json
{
  "password": "optional candidate-entered password"
}
```

### `POST /student/assessment/:id/setup-step`

Records a completed security step.

Input:

```json
{
  "step": "environment | camera | location | fullscreen | final",
  "meta": {}
}
```

### `POST /student/assessment/:id/begin`

Begins or resumes the timed attempt after server validation.

### `GET /student/assessment/:id`

Returns sanitized assessment, submission state, server time, allowed end, and security requirements.

### `POST /student/assessment/:id/violations`

Records a validated violation event.

Input:

```json
{
  "type": "tab_switch",
  "message": "Candidate left the assessment tab.",
  "meta": {},
  "severity": "warning",
  "confidence": 1
}
```

Output includes updated counters and the server decision:

```json
{
  "ok": true,
  "action": "warn | pause | autosubmit",
  "autoSubmit": false,
  "violationScore": 0,
  "pauseCount": 0
}
```

### `POST /student/assessment/:id/heartbeat`

Reports current security state.

### `POST /student/assessment/:id/monitoring`

Stores monitoring events and configured camera snapshots.

### `POST /student/assessment/submit`

Saves progress or finalizes the attempt.

## 14.4 Compiler APIs Used by Assessments

Assessment coding questions use the shared compiler APIs with `assessmentId` included.

Operations:

- Run code with custom input
- Obtain expected output for permitted visible cases
- Submit code
- Poll job result

The backend confirms:

- Student access
- Assessment assignment
- Assessment publication
- Problem inclusion in the assessment

---

## 15. Data Models

## 15.1 Assessment

Core fields:

- Title
- Description
- Instructions
- Start time
- End time
- Duration
- Late-submission policy
- Attempt limit
- Creator
- Target type
- Assigned students
- Draft target mode and draft rows
- Lifecycle status
- Manual completion time
- Version
- Assessment type
- Assessment ID
- Test type
- Visibility
- Custom instructions
- Settings
- Password enabled
- Password hash
- Sections
- Total marks
- Created and updated timestamps

## 15.2 Section

- Section name
- Question type
- Marks per question
- Negative marks per question
- Total marks
- Questions

## 15.3 Question

- Question ID
- Type
- Question text
- Options
- Correct option
- Expected answer
- Keywords
- Tags
- Problem ID
- Problem snapshot
- Coding data
- Positive points
- Negative points
- Marks/weight compatibility fields

## 15.4 Assessment Submission

Identity:

- Assessment ID
- Student ID

Answer state:

- Answers
- Score
- Maximum marks
- Accuracy
- Evaluation status
- Pending/completed coding job counts

Timing:

- Started time
- Submitted time
- Last saved time
- Time taken
- Pause start
- Total paused duration
- Late flag

Security:

- Password verification time
- Security setup
- Security completion time
- Security heartbeat
- Tab switches
- Fullscreen exits
- Copy/paste count
- Camera flags
- Violation score
- Pause count
- Violation collections
- Violation log
- Proctoring snapshots
- Monitoring events
- AI proctoring summary
- Last IP
- Last user agent

Attempt state:

- Status
- Attempt count

The database has a unique index on `(assessmentId, studentId)`. Therefore, PeerPrep stores one evolving submission document per student per assessment rather than a separate immutable document for every retake.

---

## 16. Security and Privacy

Implemented protections:

- Authenticated routes
- Student/admin/coordinator role checks
- Granular coordinator permissions
- Assignment validation
- Password hashing
- Password hash removal from API output
- Server-side schedule enforcement
- Server-side duration enforcement
- Server-side setup-step enforcement
- Violation input allowlists
- Metadata sanitization and size controls
- Severity and confidence validation
- IP and user-agent logging
- Sensitive analytics redaction
- Request timeouts for long assessment/report operations
- Queue-based isolation for code execution

Privacy-sensitive data:

- Camera snapshots
- Location setup metadata
- IP address
- User agent
- Violation timeline
- Monitoring events
- AI risk summary

A standalone exam platform should add explicit:

- Candidate consent
- Retention periods
- Deletion policy
- Encryption policy
- Data residency policy
- Access audit log
- Snapshot access controls
- Proctor review accountability
- Privacy notice per assessment

---

## 17. Important Implementation Limitations

The following points are important when using PeerPrep as the design base for a stronger ExamPortal:

1. **Retakes are not fully implemented as independent attempts.**
   The UI exposes retake and gap settings, and the backend checks an attempt limit, but a unique student-assessment submission document stores the evolving state. There is no clean reset/new-attempt transaction or immutable history per retake. A new platform should use a separate Attempt entity for every attempt.

2. **Browser security cannot fully prevent cheating.**
   Fullscreen, screenshot, copy/paste, and tab controls can detect or discourage actions but cannot secure the operating system.

3. **Audio is not recorded.**
   The UI text suggests recording, but implementation only detects noise level events.

4. **AI proctoring is advisory.**
   Confirmed AI events are logged and risk-scored but intentionally do not directly pause or auto-submit.

5. **Some AI backend files are placeholders.**
   The effective implementation is distributed across frontend detectors, controller logic, and report components.

6. **Short-answer grading is basic.**
   It uses exact normalized matching and all-keyword matching, not semantic or human review workflows.

7. **Section time is proportional.**
   There is no explicit per-section duration entered by the administrator.

8. **Question shuffle is client-generated.**
   The mapping is handled carefully, but a stronger platform should issue a server-signed question order per attempt.

9. **Multiple-tab detection is local to a browser profile.**
   It does not provide reliable cross-device detection.

10. **Snapshot storage uses data URLs in submission monitoring data.**
    This can make MongoDB documents large. Object storage with signed URLs and retention rules would scale better.

11. **Versioning is not immutable revision history.**
    The model stores a version number and timestamp, not full historical snapshots.

12. **Result/report readiness can be temporarily pending.**
    Coding answers are processed asynchronously after final submission.

13. **The frontend contains an Excel API helper for an endpoint not registered in the shown admin assessment router.**
    Current report UI also performs client-side export generation, but API contracts should be consolidated in a future platform.

---

## 18. Recommended ExamPortal Domain Model

For a more powerful standalone platform, use separate entities:

- Organization
- User
- Role
- Candidate profile
- Exam
- Exam version
- Section
- Question
- Question version
- Question pool
- Exam assignment
- Candidate attempt
- Attempt question order
- Attempt answer
- Coding execution
- Proctoring session
- Proctoring event
- Evidence object
- Manual review
- Score revision
- Result publication
- Notification
- Audit log

This avoids overloading one assessment and one submission document with every responsibility.

---

## 19. Recommended Enhanced Workflow

```text
Create exam
  -> Configure metadata and ownership
  -> Build sections
  -> Add fixed questions or randomized pools
  -> Configure scoring and pass rules
  -> Configure security profile
  -> Configure result policy
  -> Preview as candidate
  -> Run validation checks
  -> Freeze immutable exam version
  -> Assign candidates
  -> Send invitations
  -> Candidate system check
  -> Identity verification
  -> Start immutable attempt
  -> Autosave answers and evidence
  -> Server-authoritative timer
  -> Automated and human proctor review
  -> Evaluate objective and coding answers
  -> Manual grading where required
  -> Apply score revisions with audit trail
  -> Publish result
  -> Candidate appeal/review workflow
  -> Retain or delete evidence by policy
```

---

## 20. Features to Add in a More Powerful Platform

Recommended enhancements:

- Separate immutable attempt records
- Explicit per-section timers
- Random question pools and rule-based paper generation
- Server-signed question and option order
- Resume policy with device/session binding
- Live proctor dashboard
- Candidate identity verification
- ID document capture and consent
- Face match between ID and live frame
- 360-degree room scan workflow
- Screen-sharing or desktop-agent option
- Network-disconnect policy
- Cross-device session detection
- Plagiarism and code-similarity analysis
- Browser lockdown integration
- Manual grading queues
- Partial marks and rubric-based grading
- AI-assisted descriptive-answer evaluation with human approval
- Score moderation and revision history
- Pass/fail and sectional cutoff rules
- Certificates
- Candidate invitations and admission cards
- Exam centers, rooms, seats, and invigilator assignment
- Accessibility accommodations and extra time
- Multi-language exams
- Rich media questions
- Mathematical formula support
- Bulk exam cloning
- Immutable exam versions
- Approval workflow before publication
- Complete audit trail
- Configurable retention and privacy controls
- Webhooks and external LMS/HRMS integration
- Organization-level branding and tenancy
- Payment and registration workflow where required

---

## 21. End-to-End Input and Output Summary

### Admin Inputs

- Exam identity and description
- Schedule and duration
- Candidate selection
- Sections and questions
- Marks and negative marks
- Coding test data
- Security policy
- Proctoring policy
- Result visibility policy
- Retake policy

### System Outputs Before Exam

- Published assessment
- Assigned candidate list
- Student accounts where needed
- Notifications and reminders
- Candidate dashboard cards
- Secure launch requirements

### Student Inputs

- Password
- Security permissions and checks
- MCQ selections
- Text answers
- Code and language
- Custom coding input
- Final submission confirmation

### Runtime System Outputs

- Timer
- Saved progress
- Code execution result
- Security warnings
- AI notices
- Pause and recheck instructions
- Auto-submit decision

### Final System Outputs

- Submission record
- Score and percentage
- Coding evaluation state
- Section breakdown
- Question-wise evaluation
- Rank/percentile where enabled
- Integrity and violation information
- Admin reports
- Student reports
- Exports
- Analytics and readiness signals

---

## 22. Final Assessment

PeerPrep already provides a broad assessment foundation: mixed question types, compiler-backed coding, assignment, scheduling, secure setup, browser monitoring, AI-assisted proctoring, asynchronous evaluation, detailed reporting, and analytics.

Its strongest reusable design ideas are:

- Ordered server-enforced security setup
- Separation of assessment definition and submission state
- Candidate-specific shuffle mapping
- Shared compiler infrastructure
- Queue-based final coding evaluation
- Permission-based result disclosure
- Detailed violation and monitoring timelines
- Browser-side AI confirmation before event logging

For a standalone ExamPortal, the architecture should retain these workflows while introducing immutable attempts, explicit exam versions, stronger evidence storage, human review, audit history, configurable policy engines, and privacy governance.
