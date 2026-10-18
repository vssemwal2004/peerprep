# Problem statement layout audit

Generated: 2026-10-18  
Database: `mongodb://127.0.0.1:27018/peerprep_repair_staging`  
Mode: read-only; no database records were changed.

## Scope and result

- Problems scanned: **4,006**
- Statements changed by the current display normalizer: **480**
- Statements with a classified source pattern: **485**
- Safe deterministic cases: **481**
- Content-review cases: **4**
- Statements with no classified layout issue: **3,521**

Category counts overlap when one source pattern explains another. In particular, the 321 ASCII box-table statements are included in the 325 statements whose tables the renderer reconstructs.

## Deterministic patterns

| Pattern | Problems | Current handling | Representative records |
| --- | ---: | --- | --- |
| Reconstructed tables | 325 | Renderer converts to responsive Markdown tables | `14` Evaluate Boolean Expression; `779` Maximum Number That Sum of the Prices Is Less Than or Equal to K; `2095` Integer to Roman |
| ASCII box tables | 321 | Renderer converts rectangular `+---+` / `| ... |` tables | `29` Project Employees I; `149` Students and Examinations; `998` Second Day Verification |
| Minor rich-text/entity normalization | 148 | Renderer normalizes entities and safe inline markup | `64` Maximum Element After Decreasing and Rearranging; `80` K Empty Slots |
| Serialized line breaks | 6 | Renderer decodes repeated literal `\\r\\n`, `\\n`, or `\\r` | `574` Minimize Product Sum Of Two Arrays; `699` Longest Absolute File Path; `1333` Maximize The Beauty Of The Garden; `1438` Encode Number; `2065` Tenth Line; `3460` Maximum Subarray Sum After One Operation |
| Vertical keyboard row | 1 | Renderer joins tokens into readable rows | `356` Total Distance to Type a String Using One Finger |
| Literal angle placeholder | 1 | Renderer preserves `<pre>...<suf>` as text | `875` Abbreviating the Product of a Range |

All records in these categories are currently published in the local repair database.

## Content-review queue

These four layouts need statement-aware editing rather than a global regex:

| Order | ID | Title | Recommended repair |
| ---: | --- | --- | --- |
| 567 | `6ababfba7dd728ca2c940583` | Match Alphanumerical Pattern In Matrix I | Reconstruct each flattened board/pattern example as separate fenced matrix blocks. |
| 880 | `6ababeed7dd728ca2c934b2f` | Sentence Screen Fitting | Put screen rows in fenced monospace blocks so spaces and row widths remain visible. |
| 1730 | `6ababfd27dd728ca2c941a14` | Find Sorted Submatrices With Maximum Element At Most K | Format the enumerated matrices as a Markdown list with inline/fenced arrays. |
| 1946 | `6ababfbf7dd728ca2c9409b6` | Equalize Strings By Adding Or Removing Characters At Ends | Rebuild the alternating operation/result values as a two-column Markdown table. |

## Safe persistence recommendation

Keep the renderer normalization active first; it fixes the deterministic display issues without changing stored content. If canonical Markdown is later persisted:

1. Work only in the repair staging database and take a collection-level backup first.
2. Select only records whose audit classification is deterministic and whose current description SHA-256 still matches the report.
3. Store the original description, normalized description, hashes, rule codes, timestamp, and script version in an audit collection before each update.
4. Use an optimistic update filter on both `_id` and the original description. Skip any record changed since this report.
5. Exclude the four content-review records from bulk normalization.
6. Re-run this audit, renderer tests, production build, and representative visual previews before preparing a production migration.
7. For production, create a fresh backup and apply small resumable batches. Sync affected QuestionLibrary rows only after the problem update succeeds.

The machine-readable report with hashes and full representative details is `problem-statement-layout-audit.json` in this directory.
