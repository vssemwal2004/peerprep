# Private global ranking

> The deployment section below describes the retired separate-backend flow.
> Follow [the current deployment guide](SHARED_UNIVERSITY_DEPLOYMENT.md) for
> production setup.

Students see their university standing and their own global standing at
`/student/rankings`, on the dashboard and on their profile. No public leaderboard
or other-student lookup exists. Assessment-only accounts cannot access the API.

University backends calculate the same verified score used by university ranking.
Every approximately five minutes the existing heartbeat publishes a **complete
score histogram**: `{ score, count }` buckets, a scoring version, a timestamp and
a policy fingerprint. Names, emails, phone numbers and student IDs never leave
the university through this feature. The server retains its own ID-to-score map
locally so the authenticated student's rank is queried against that exact edition.
Browser-supplied IDs and scores are ignored.

The control plane authenticates existing tenant credentials. Each university can
replace only its own snapshot. Duplicate editions are idempotent and older
editions cannot overwrite newer ones. Global rank is one plus the number of
students with a strictly higher score; ties share rank. Students without verified
progress remain unranked. Eligible population matches university ranking:
active, full-access students, including those who have not earned points yet.

Only active, undeleted universities with matching policy and scoring version and
snapshots no older than 30 minutes contribute. The UI reports synced/registered
coverage and snapshot time; global points may lag university points by five
minutes. Institutions with different allocated modules still use the existing
absolute points system, not an opportunity-normalized score.

## Deployment

Deploy the updated control-plane backend first, then university backends and
frontend. The new `GlobalRankSnapshot` collection uses MongoDB's built-in unique
`_id` index; no custom index migration is needed. Existing tenant credentials and
control URL are reused; no new secrets or public endpoint are required. A
standalone deployment explicitly shows “not connected”, never a fabricated
single-campus global rank. Central outages do not block university rankings.

No live deployment or production sync is performed by the tests. Run:

```
cd backend
node --test test/globalRanking.test.js
```

Snapshots contain only aggregates but can reveal distribution details to a
trusted campus server. Keep tenant keys server-side. Multiple replicas may race
to publish; edition checks prevent rollback and stale local maps resync on retry.
