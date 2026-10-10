# Multi-university deployment

The control installation and each university installation run from separate codebases. Each has its own frontend, backend, VPS, and MongoDB database. The control backend is the only process with credentials for the shared MongoDB database. University backends use a university ID and API key to access only content that the control API authorizes.

Use Node.js 22 or newer for the backend and frontend build. Configure HTTPS for each public frontend/API and for the control API before connecting university deployments.

## Control installation

1. Deploy this codebase with `PEERPREP_DEPLOYMENT_ROLE=control` and a persistent `MONGODB_URI` for the shared database. Configure the existing `ADMIN_EMAIL` and `ADMIN_PASSWORD` bootstrap values, JWT secret, frontend origin, and other production settings. Run `npm run migrate:platform-indexes` and `npm run bootstrap` in `backend/` once to create the required indexes and admin account, then remove the bootstrap password from the environment.
2. Build the frontend with `VITE_PEERPREP_DEPLOYMENT_ROLE=control` and its normal API base URL. The admin sidebar then includes **Universities** at `/admin/platform`.
3. In **Universities**, register each university. Save the one-time API key immediately. Choose module permissions and the learning data source. Assign complete assessments to selected universities. Public, published questions from the main admin library are available automatically to every university with the questions module enabled, alongside each university’s own published questions. Private questions stay in the main admin library, but may be included in a centrally created assessment assigned to a university. Assessment-derived library entries are never shared as standalone questions. An assessment must be published and visible in the existing assessment editor before it is exposed.
4. University admins see centrally published questions in **Library → All Questions**. They can preview shared coding questions in the coding workspace, reuse shared questions in their assessments, and make a local draft copy for editing. The master question remains central. Students see published shared and university questions in **All Questions**; linked shared coding questions open in the regular coding solver. MCQ and short answers are checked on the backend, linked coding questions run against hidden test cases, and unlinked coding or other free-form answers are recorded as submitted. Attempts are stored only in that university’s MongoDB database. The student API omits answer keys and private questions.
5. New registrations inherit **Defaults for new universities**. The initial source for learning is the university database. Editing one university never changes existing universities. **Use as new default** copies that university’s permissions and learning source into the defaults for future registrations.
6. Set each university's **University API URL** to its HTTPS backend origin. The control dashboard can then request a read-only, paginated student list and student details (assessment results and AI interview session status). The control backend signs a one-minute request with `PEERPREP_INSPECTION_PRIVATE_KEY`; the university backend verifies it with `PEERPREP_INSPECTION_PUBLIC_KEY`. Student records remain in the university database and are not copied into the control database. Detailed viewing requires the university API to be online; last heartbeat counts remain available when it is offline. Student views are recorded in the platform audit log. See [GEU-121 InterServer runbook](INTERSERVER_GEU121_DEPLOYMENT.md) for key generation and VPS commands.

## University installation

1. Run `deploy/create-university-codebase.sh UNIVERSITY_ID NEW_DIRECTORY` to create a separate codebase and initialize its own Git repository. Put that codebase on the university VPS. It is independent of the control codebase and has its own release process.
2. Set `PEERPREP_DEPLOYMENT_ROLE=university`, `PEERPREP_UNIVERSITY_ID`, `PEERPREP_CONTROL_URL`, `PEERPREP_SHARED_API_KEY`, and its own persistent `MONGODB_URI` in `backend/.env`. The ID must match the control registration. Set the usual frontend origin, authentication, storage, mail, and queue settings required by PeerPrep. Run `npm run bootstrap` in that backend once to create its university admin account.
3. Build the university frontend with `VITE_PEERPREP_DEPLOYMENT_ROLE=university` and its own API base URL. Start the backend and workers with this university environment. The backend sends a heartbeat and usage counts every minute.
4. When rotating a key, update the university environment and restart its backend and workers. The previous key is invalid immediately.

Example university backend configuration (use unique values for each VPS):

```dotenv
PEERPREP_DEPLOYMENT_ROLE=university
PEERPREP_UNIVERSITY_ID=north-campus
MONGODB_URI=mongodb://north_app:ENCODED_PASSWORD@127.0.0.1:27017/peerprep_north?authSource=peerprep_north
PEERPREP_CONTROL_URL=https://control.example.com
PEERPREP_SHARED_API_KEY=ONE_TIME_KEY_FROM_CONTROL_DASHBOARD
FRONTEND_ORIGIN=https://north.example.com
```

The university backend opens only its own `MONGODB_URI`. For shared content or permission checks, it sends `PEERPREP_UNIVERSITY_ID` and `PEERPREP_SHARED_API_KEY` to the control API over HTTPS. The control backend validates the stored key hash and checks the university’s current permissions and publication assignments before reading the control database. The browser never receives that key. Each backend and worker checks a database identity record at connection time so a university cannot accidentally start against another university’s or the control database.

## Data boundaries

- The control database contains university registrations, permissions, API-key hashes, heartbeats, usage summaries, platform audit entries, published shared questions, shared learning content, and shared assessment definitions.
- In the current implementation, the university database contains users, locally authored content, local assessments, student submissions and delivered question sets, progress, reports, resumes, events, and interview sessions. The requested per-module routing of these records to central tenant-isolated storage is still pending.
- Authentication, university admin accounts, students, coordinators and the remaining application modules currently use the university database through its deployment’s default MongoDB connection. This is one database per university, with the same collection names inside each separate database. University IDs are also globally unique in the control registry.
- Shared assessment definitions stay central. A student's delivered question set is stored inside that student's local submission so scoring and retakes can use the questions actually shown to the student; no full shared assessment document is imported into the university database.
- Removing an assessment's publication hides it from new students. A university that was previously assigned can still fetch the definition for an already started attempt or historical report. The university backend checks for a local attempt before allowing a revoked assessment to continue.
- When the learning source is `shared`, university authors cannot mutate shared learning content. Learning progress remains local. The legacy `sources.questions` value is ignored: public shared questions are always additive, and local questions can still be authored.
- The central service must be reachable over HTTPS from each university backend. University API keys are never sent to browsers or used as MongoDB credentials.
- **Delete** in the control dashboard revokes the university API key, removes the central university registration and all current and historical assessment assignments for its ID, and allows that ID to be registered again. IDs archived by older releases can also be registered again; their archived registration and assessment access are removed during creation. Audit entries are retained. It does not drop the university’s separate MongoDB database or shut down its VPS. Decommission that infrastructure separately after retention and backup decisions. A newly registered university receives a new API key and no old assessment access.
- The current university permission switches cover learning, assessments, questions, events, interviews and resumes. Analysis follows its contributing module permissions automatically: an admin can query coding, assessment or learning evidence only when that module is enabled, and a student sees analysis sections for enabled modules. Composite student readiness and history are available only when all contributing modules are enabled. Authentication and other legacy features remain local and are not individually controlled by those six switches. A deleted university VPS can still serve local-only routes until it is stopped; central/shared API access is revoked immediately.
