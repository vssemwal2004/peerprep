# AI interview authoring

## Scope

Admin-only creation workspace at `/admin/ai-interviews`. Existing One-to-One interviews, assessments and the coordinator AI placeholder are unchanged. No LLM SDK, generation, speech, recording, candidate assignment, invitations or scoring is connected.

## Implemented flow

Directory → Create draft → Basics → Sections & questions → Interviewer → Rules & rubric → Review.

The admin primary sidebar expands AI Interviews into All AI Interviews, Create AI Interview and Reports. Clicking the AI Interviews label opens the directory and expands these links; its chevron toggles them without navigation. The secondary navigation has Interviews, Reports, Interviewer profiles and Companies. In the builder, it is replaced by five configuration divisions. Statuses are directory filters, not duplicate navigation items.

`/admin/ai-interviews/reports` is an explicit not-yet-available page, not a live reporting service. It does not request interview data using `reports` as an interview ID, fabricate results or invoke AI services. Candidate sessions and evaluation remain out of scope.

The UI includes breadcrumbs, contextual back links, server pagination, compact row cards, accessible action menus, static SVG empty states, search and reusable resource pickers. Preview is explicitly a configuration preview, not a running interview. Answer guidance is omitted from that preview.

## Storage and services

- `backend/src/models/AIInterview.js`: admin-owned definition, revision, summary, lifecycle, validation checkpoint and bounded recent history.
- `backend/src/models/AIInterviewResource.js`: owner-scoped company and profile resources, separate from CompanyBenchmark.
- `backend/src/services/aiInterviewDefinition.js`: allowlisted normalization, structural validation, completeness checks, timing inheritance and limits.
- `backend/src/controllers/aiInterviewController.js`: persistence, resource access, snapshot selection, compare-and-swap updates and query projections.
- `backend/src/routes/aiInterviews.js`: authenticated admin boundary and structured errors.
- `frontend/src/admin/ai-interviews/`: feature-local navigation, API adapter, editors, resources, review and save coordinator.

Sections/groups/questions are bounded within a single definition aggregate. To keep saves atomic, the implementation uses one revision-checked `PUT /:id` rather than independent nested writes. Unknown fields cannot set ownership, lifecycle, revision or validation.

Companies and interviewer profiles share a typed resource collection, with an owner + kind + normalized-name unique index. Display names remain separate from normalized keys. Company creation is explicit, never per keystroke. Reusable profiles use local SVG presets, not image uploads.

The selected profile is snapshotted. Reselecting a newer revision updates it; unrelated saves preserve the existing snapshot. Library imports copy authorized compatible short-answer questions and preserve provenance. Private questions owned by another user are never listed or importable.

## Concurrency and lifecycle

Every save, validation and lifecycle mutation requires the saved revision. Updates atomically match owner, identifier, lifecycle and revision. Concurrent writes return `409 REVISION_CONFLICT`. Autosave serializes draft writes and retains edits made while a save was in flight. Errors preserve editor content; conflicts stop automatic retries until the admin reloads deliberately.

Browser reload/close and explicit links leaving a dirty builder warn before discarding changes. Browser-history POP navigation is not a fully blocking router flow; this application uses BrowserRouter rather than a data router. Do not claim crash-proof or offline persistence: private draft content is not cached in localStorage.

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

Timing overrides distinguish missing (inherit), zero and null (unlimited). The response budget includes preparation, responses and maximum follow-ups; it excludes question playback, replay duration and transitions. ANNU counts are planned, never shown as generated.

## Deployment

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
node --test test/aiInterviewWorkspace.test.js
npx eslint src/admin/ai-interviews src/App.jsx
npm run build
```

Frontend tests use jsdom and mocked APIs, including the global dropdown-dismiss manager. These verify interactions, not browser layout. The Browser skill reported no available browser connection during implementation, so real-browser visual QA remains required before production rollout.
