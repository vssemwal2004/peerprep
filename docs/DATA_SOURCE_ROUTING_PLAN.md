# Per-category database routing

## Agreed rules

- The super admin chooses `university` or `shared` for each data category, separately for each university. A default policy supplies choices for new universities.
- A `university` category uses that university deployment's MongoDB connection.
- A `shared` category uses the control service API. The university deployment never receives shared MongoDB credentials. University-specific records in the control database are scoped by the authenticated university ID and remain invisible to other universities.
- Centrally published public questions remain global. A private central question can be delivered only inside an assigned central assessment.
- Changing a category with records requires a migration before the active source changes. The current source remains active while data is copied and verified.

## Proposed data categories

These are storage categories, not sidebar screens. A screen may read more than one category.

| Category | Representative data |
| --- | --- |
| Identity | Admin, coordinator, and student accounts; passwords and session state |
| Student records | Profiles, imports, activity, enrollment |
| Learning content | Semesters, subjects, lessons and materials |
| Learning progress | Student progress and completions |
| Question bank | Authored questions, classifications and tags |
| Coding practice | Problems, test cases, practice submissions, streaks and lists |
| Assessment definitions | University-authored assessment structure and settings |
| Assessment delivery | Attempts, submissions, evidence, scores and feedback |
| Events and scheduling | Events, participants, pairings, slots and feedback |
| AI interview definitions | Interview authoring and resources |
| AI interview sessions | Student interview recordings, transcripts and results |
| Resumes | Student resumes and revisions |
| Analytics and reports | Persisted analytics snapshots and report summaries |
| Announcements | Announcements and notifications |
| Company insights | Benchmarks and company records |
| Administration | Master data, email templates and mail queue records |

The assessment definition and delivery categories are separate. A main-admin assessment definition and its assignment remain in the control database under the existing publication rules; a university's delivery records follow that university's delivery source setting.

## Safe source change

1. Save the requested source as `pending`; leave the current source active.
2. Lock writes for that category in the affected university deployment and wait for relevant background jobs to finish.
3. Copy its records and referenced assets to the target through authenticated control APIs. Preserve IDs and relationships.
4. Compare counts, hashes, and application-level references. Validate reads against the target.
5. Atomically update the active policy version and source, then resume writes.
6. Keep a rollback record until the old copy is retired under the retention policy.

Identity requires session handling across the source change. Analytics derived from another category must be recomputed or migrated consistently with that category. A failed copy leaves the old source active.

## Current implementation boundary

The existing application has working source-aware reads for learning content and the question bank, central assignment of main-admin assessments, and local delivery of those assessments. Its other controllers use Mongoose models bound to the deployment's local connection. The control dashboard must not present a shared source as active for those other categories until their API adapters and migration jobs are implemented and tested.
