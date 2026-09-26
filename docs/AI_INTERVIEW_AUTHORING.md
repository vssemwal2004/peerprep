# AI interview authoring

## Scope

Admin-only creation workspace at `/admin/ai-interviews`. Existing One-to-One interviews, assessments and the coordinator AI placeholder are unchanged. No LLM SDK, generation, speech, recording, candidate assignment, invitations or scoring is connected.

## Implemented flow

The creation flow has three steps: **Interview details**, **Questions & topics**, and **Review & finish**. Saving the initial details creates a draft and opens Questions & topics. Opening an interview from the directory also goes directly to its sections, instead of reopening an advanced configuration form.

The steps use a connected blue journey line matching the assessment/Library pattern. The line shows the current position, not a percentage of saved work. The active step displays its number out of three; ready steps use check marks, and skipped incomplete steps remain marked "Needs details." Mobile labels are shorter, keyboard focus is visible, and motion follows reduced-motion preferences. The initial Create action remains visible in a sticky footer.

The admin primary sidebar expands AI Interviews into All AI Interviews, Create AI Interview and Reports. Clicking the AI Interviews label opens the directory and expands these links; its chevron toggles them without navigation. The directory's secondary navigation has Interviews, Reports, Interviewer profiles and Companies. The builder uses a compact three-step progress bar instead of duplicating these links or presenting five competing configuration divisions. Statuses remain directory filters.

`/admin/ai-interviews/reports` is an explicit not-yet-available page, not a live reporting service. It does not request interview data using `reports` as an interview ID, fabricate results or invoke AI services. Candidate sessions and evaluation remain out of scope.

The UI includes breadcrumbs, contextual back links, server pagination, compact row cards, accessible action menus, static SVG empty states, search and reusable resource pickers. Preview is explicitly a configuration preview, not a running interview. Answer guidance is omitted from that preview.

### Questions and topics

The outline shows sections (interview rounds) and their topics together. "Topic" is the user-facing name for the existing `groups` data field; the section/group/question schema is unchanged. Add section and section settings open a side drawer. Adding or editing a topic opens a drawer with two authoring choices:

- **Manual:** write questions or select compatible Library questions. Each question opens a nested drawer for its main prompt, optional subquestions and sequential cross-questions. Answer guidance, difficulty and timing remain available without overwhelming the basic question form.
- **ANNU AI:** describe what ANNU should ask in one requirements box. Planned question count, cross-question limits, skills and exclusions remain configurable. This stores an authoring specification only; it does not call an LLM, generate questions or conduct an interview.

ANNU uses a shared compact blue/indigo identity across source selection, topic summaries and review. Its prompt panel has a visible "Authoring only" label, concise writing guidance and character count. Section summaries distinguish written questions from planned ANNU questions.

Subquestions are parts of the same main response. Cross-questions use the existing `followUps` array and represent additional sequential responses, not response-dependent AI branching. Existing advanced fields are retained when editing a question.

**Add question / Save question** stages the question in the current topic; it does not save the interview to the server. **Save topic** applies the topic to the interview draft, which is then handled by the existing revision-checked autosave. Canceling a dirty staged drawer asks before discarding it. The drawer makes this save boundary explicit so closing a topic cannot be mistaken for saving its questions.

### Review and finish

Review presents a short readiness checklist, direct Fix links and a readable question preview. Interviewer selection and advanced interview settings open drawers from the review/workspace rather than adding more required navigation steps. Those settings edit the autosaved interview draft directly; they do not share the topic drawer's staged Save behavior.

**Finish setup** saves pending interview changes and requests server validation. A successful result marks the saved configuration complete. It does not publish, assign candidates, start a session or enable reports. The server remains authoritative even when the client checklist looks complete.

## Storage and services

- `backend/src/models/AIInterview.js`: admin-owned definition, revision, summary, lifecycle, validation checkpoint and bounded recent history.
- `backend/src/models/AIInterviewResource.js`: owner-scoped company and profile resources, separate from CompanyBenchmark.
- `backend/src/services/aiInterviewDefinition.js`: allowlisted normalization, structural validation, completeness checks, timing inheritance and limits.
- `backend/src/controllers/aiInterviewController.js`: persistence, resource access, snapshot selection, compare-and-swap updates and query projections.
- `backend/src/routes/aiInterviews.js`: authenticated admin boundary and structured errors.
- `frontend/src/admin/ai-interviews/`: feature-local navigation, API adapter, editors, resources, review and save coordinator.
- `authoringProgress.js`: local, actionable completion checks; server validation still decides whether setup is complete.
- `CreationProgress.jsx`: connected three-step navigation with separate current-position and readiness states.
- `AnnuBrand.jsx`: reusable ANNU identity for editors and summaries, with dark/high-contrast styling.
- `useStagedDraft.js`: bounded tab-memory recovery for section, topic and question drawers; nested question recovery uses a stable parent-editor key, including unnamed new topics.

Sections/groups/questions are bounded within a single definition aggregate. To keep saves atomic, the implementation uses one revision-checked `PUT /:id` rather than independent nested writes. Unknown fields cannot set ownership, lifecycle, revision or validation.

Companies and interviewer profiles share a typed resource collection, with an owner + kind + normalized-name unique index. Display names remain separate from normalized keys. Company creation is explicit, never per keystroke. Reusable profiles use local SVG presets, not image uploads.

The selected profile is snapshotted. Reselecting a newer revision updates it; unrelated saves preserve the existing snapshot. Library imports copy authorized compatible short-answer questions and preserve provenance. Private questions owned by another user are never listed or importable.

## Concurrency and lifecycle

Every save, validation and lifecycle mutation requires the saved revision. Updates atomically match owner, identifier, lifecycle and revision. Concurrent writes return `409 REVISION_CONFLICT`. Autosave serializes draft writes and retains edits made while a save was in flight. Errors preserve editor content; conflicts stop automatic retries until the admin reloads deliberately.

Browser reload/close and explicit links leaving a dirty builder warn before discarding changes. Staged drawer edits also register a reload/close warning and use `useStagedDraft` for bounded, in-memory recovery within the current SPA/tab session. Compatible staged edits can be recovered when their editor is reopened; if the saved baseline changed, restoring the older edit requires an explicit choice. Saving or deliberately discarding a staged edit clears that recovery entry.

Browser-history POP navigation is not a fully blocking router flow; this application uses BrowserRouter rather than a data router. In-memory drawer recovery is not persistent reload recovery, crash-proof storage or offline persistence. Private draft content is not cached in localStorage, and a reload or closed tab can lose unsaved staged edits. Server-saved interview drafts remain the durable source of truth.

Draft and Archived are lifecycle states. A successful explicit validation marks a particular revision complete. Authoring/lifecycle changes invalidate that checkpoint. Complete does not mean live or published.

This authoring release retains the latest successful configuration snapshot atomically with the record and the latest 100 audit actions. It does **not** provide a permanent full version archive or audit export. Before live candidate delivery is introduced, add immutable version retention and bind sessions to those versions.

Archive is reversible. Delete requires the exact title and a matching revision, and is only allowed for drafts. Duplicate creates an independent draft. Create and duplicate require an Idempotency-Key.

## API

All routes are under `/api/ai-interviews`.

| Method           | Path                                          | Purpose                                                |
| ---------------- | --------------------------------------------- | ------------------------------------------------------ |
| GET              | `/capabilities`                               | Authoring limits and disconnected runtime capabilities |
| GET, POST        | `/`                                           | Paginated directory / create draft                     |
| GET, PUT, DELETE | `/:id`                                        | Load / revision-checked save / confirmed delete        |
| POST             | `/:id/validate`                               | Validate and checkpoint                                |
| POST             | `/:id/duplicate`                              | Duplicate using an idempotency key                     |
| POST             | `/:id/archive`, `/:id/restore`                | Lifecycle operations                                   |
| GET, POST        | `/resources/companies`, `/resources/profiles` | Search / create resources                              |
| PUT              | `/resources/:kind/:id`                        | Revision-checked edit or deactivate/restore            |
| GET              | `/library`                                    | Paginated compatible authorized questions              |

Directory responses omit question bodies, requirements, snapshots and audit history. Default page size is 25; 50 and 100 are supported. Sorts use an ID tie-breaker. Search escapes regex syntax.

## Current safety limits

20 sections; 10 groups per section; 200 authored/planned main questions per interview; 50 planned questions per ANNU group; 3 follow-ups per question; 10 subquestions per manual question; 12 rubric criteria. Text and total configuration sizes are bounded. These are conservative v1 limits, not capacity benchmarks. Preparation is bounded at 600 seconds; responses at 1800 seconds unless explicitly unlimited.

`GET /capabilities` exposes `limits.questions`, `limits.subquestions` and `limits.plannedQuestionsPerGroup`, alongside the existing limits. Manual and ANNU planned main questions share the same 200-question interview-wide budget. Completeness errors identify the main-question, question-part or cross-question position while preserving existing section/group issue paths.

Timing overrides distinguish missing (inherit), zero and null (unlimited). The response budget includes preparation, responses and maximum follow-ups; subquestions share the parent's response time, while sequential cross-questions have separate inherited or overridden timing. It excludes question playback, replay duration and transitions. ANNU counts are planned, never shown as generated.

## Deployment

The simplified creation flow does not require a data/schema migration or an LLM integration. Existing section/group/question definitions remain compatible. The initial authoring index setup below is still required for installations that have not yet deployed it.

Production disables automatic Mongoose indexes. Run this **additive** migration against the intended deployment database before enabling authoring:

```powershell
cd backend
node --env-file=.env src/migrations/create-ai-interview-indexes.js
```

The migration creates indexes only; it does not drop indexes or rewrite interview data. It was not run against the user's application database during implementation. Deploy the frontend and backend together; restart the backend so the new router is registered.

## Verification

```powershell
cd backend
node --test test/aiInterviewDefinition.test.js test/aiInterviewApi.test.js
```

The API suite starts a dedicated temporary MongoDB instance and localhost HTTP server. It does not load `.env`, connect to the application database or call AI/email services. Its authentication fixture is injected only into the test router; production uses the existing authentication middleware.

```powershell
cd frontend
node --test test/aiInterviewCreationProgress.test.js test/aiInterviewWorkspace.test.js test/aiInterviewTopicEditor.test.js test/aiInterviewStagedDraft.test.js test/aiInterviewAuthoringProgress.test.js test/globalSidebar.test.js
npx eslint src/admin/ai-interviews src/App.jsx
npm run build
```

Frontend tests use jsdom and mocked APIs, including the global dropdown-dismiss manager. These verify interactions, not browser layout. The Browser skill reported no available browser connection during implementation, so real-browser visual QA remains required before production rollout.
