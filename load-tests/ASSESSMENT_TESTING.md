# Assessment correctness and capacity workload

This script writes real attempts. It defaults to localhost and requires
`CONFIRM_LOAD_TEST` to equal `ASSESSMENT_ID`. It checks the assessment title starts
with `LOAD TEST` before unlocking it. It does not provision, delete, or migrate
users, and it does not run automatically during development or builds.

Create a **fresh**, published MCQ/written assessment for every run. Assign only
dedicated test accounts. Set a generous duration/end time (at least the workload
duration + start spread + 5 minutes), one attempt, and no question-selection limit.
Disable camera, AI proctoring, location tracking, and fullscreen on this fixture.
The HTTP workload exercises setup completion, login, begin, jittered heartbeat,
changing delta answer batches, monitoring events, final submission, duplicate
submission, and answer read-back. It does not measure browser/AI/camera processing
or Judge0/code execution; those require separate representative workloads.

Create the ignored file `load-tests/users.local.json`:

```json
[
  { "identifier": "test-001@example.test", "password": "test-account-password" },
  { "identifier": "test-002@example.test", "password": "test-account-password" }
]
```

Each VU needs a distinct account. Answers are generated from the **delivered**
question coordinates, including shuffled origins and multi-select MCQs. The old
`answers: { questionId: optionId }` fixture shape is not used.

From the repository root, in PowerShell with k6 installed:

```powershell
$env:BASE_URL = 'http://127.0.0.1:4000/api'
$env:ASSESSMENT_ID = 'YOUR_DEDICATED_ASSESSMENT_ID'
$env:CONFIRM_LOAD_TEST = $env:ASSESSMENT_ID
$env:USERS_FILE = './users.local.json'
$env:VUS = '10'
$env:ACTIVE_SECONDS = '180'
$env:START_SPREAD_SECONDS = '30'
k6 run .\load-tests\assessment-production.js
```

`USERS_FILE` is resolved relative to the script by k6. Supply the optional
`ASSESSMENT_PASSWORD` when the fixture has an assessment password. `BASE_URL`
must include `/api`. A remote staging target must be set explicitly. Generate
load from outside the API/database host for capacity measurements.

Run separate fresh fixtures at 10, 50, 100, 200, then higher concurrency only
after the lower stage passes. Use `ACTIVE_SECONDS=1800` or longer for soak tests.
To concentrate final submissions at a shared deadline set:

```powershell
$env:SUBMIT_WAVE = 'true'
```

The wave includes 30 seconds of startup allowance. Very slow login/start may
miss it; inspect operation timings and the actual submission time distribution.
`START_SPREAD_SECONDS=0` deliberately tests a login/start burst.

Success requires all VUs to finish, matching durable receipts on duplicate
submission, and every final answer to match a fresh server read. Missing answers
fail the test even when every API call returned 200. HTTP errors must remain below
1%, business/read-back errors must be zero, and p95 targets are heartbeat <1s,
autosave <2s, submit acknowledgement <5s. These are acceptance targets, not a
promise of capacity on a particular server. Compare CPU, memory, database latency,
queue backlog and grading completion alongside k6.

After the exam window is completed, use the admin upload deletion preview to
remove only the dedicated fixture accounts/data. This script never cleans up
automatically, so a failed run remains available for diagnosis.

Local tests (no network/database):

```powershell
node --test frontend/test/assessmentSaveProtocol.test.js frontend/test/assessmentLocalDraft.test.js frontend/test/assessmentEvidenceUpload.test.js frontend/test/assessmentLoadWorkload.test.js
```
