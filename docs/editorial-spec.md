# PeerPrep Editorial Specification (format `md-v2`)

Status: pilot (20 problems), October 2026
Owner: LeetCode migration, editorial content lane
Tooling: `backend/scripts/leetcode-migration/editorials/`
Pilot output: `D:\PeerPrepSources\editorials\pilot\`

This document is the contract between three parties:

1. **Writers** (human or AI-assisted) who author editorials.
2. **The renderer** (frontend) that turns stored markdown into sanitized HTML on the problem detail page.
3. **The loader** (`loadEditorials.mjs`) that writes reviewed editorials into the `Problem` collection.

If one of them changes, this document changes first.

---

## 1. Storage contract

| Field | Type | Meaning |
| --- | --- | --- |
| `Problem.editorial` | `String` | GitHub-flavored markdown body, format `md-v2`. |
| `Problem.editorialMeta.format` | `String` | Always `'md-v2'` for editorials written to this spec. |
| `Problem.editorialMeta.version` | `Number` | Starts at `1`; increment on every content revision. |
| `Problem.editorialMeta.source` | `String` | `'peerprep-original'` or `'doocs-derived'`. |
| `Problem.editorialMeta.license` | `String` | `'CC-BY-SA-4.0'` when `doocs-derived`, otherwise `''`. |
| `Problem.editorialMeta.attributionUrl` | `String` | For `doocs-derived`: the doocs GitHub blob URL of the README at the pinned commit. Otherwise `''`. |
| `Problem.editorialMeta.generatedBy` | `String` | Who/what drafted it, e.g. `'claude-opus-5.5 (editorial pilot lane)'` or a staff name. |
| `Problem.editorialMeta.reviewedAt` | `Date` | When the verification checklist (section 6) last passed. |
| `Problem.editorialMeta.checks` | `[String]` | Machine-readable list of checks that passed (section 6.2). |

Rules:

- Editorials are served **only** by the problem detail endpoint. They are not included in the problem-list API payload.
- The detail endpoint also serves `editorialSolutions: { [lang]: code }`, containing reference solutions **only for languages in `validatedLanguages`**. The renderer builds the Implementation tabs from this field (section 2.4); writers never paste the final code into the markdown.
- A problem without `editorialMeta` has a **legacy** editorial. The same renderer must display it correctly (it simply will not have the structured sections or the attribution footer).

### Attribution and licensing

The doocs/leetcode repository is licensed CC-BY-SA-4.0. The rule is deliberately conservative:

- If the writer **read the doocs README for that problem while drafting**, and any part of the editorial (choice or order of approaches, the framing of the key insight, the recurrence, an argument) follows it, the editorial is `doocs-derived`: set `license: 'CC-BY-SA-4.0'` and `attributionUrl` to the doocs blob URL at the pinned commit. Share-alike then applies to that editorial.
- `peerprep-original` is only for editorials drafted without consulting doocs (for example, from the validated reference solution and the writer's own knowledge).
- In both cases the text is written in the writer's own words. Never copy doocs sentences, and never copy doocs code. The final code comes from PeerPrep's validated references.
- The attribution is shown by the renderer in a footer built from `editorialMeta` (for example "Adapted from doocs/leetcode, CC BY-SA 4.0", linked to `attributionUrl`). The markdown itself contains **no links**.

---

## 2. Markdown structure

### 2.1 Section order

Headings are fixed. Use `## ` for level-2 and `### ` for level-3 headings. Do not add a level-1 heading; the page already shows the problem title.

```text
## Overview
## Intuition
## Approach 1: <Name>
### Algorithm
### Dry Run
### Complexity
## Approach 2: <Name>          (zero or more further approaches)
### Algorithm
### Dry Run
### Complexity
## Edge Cases
## Common Mistakes
```

- **Overview**: 2-4 sentences. What is asked (restated precisely, not copied), and a teaser of the key insight. No spoilers of the full algorithm.
- **Intuition**: the reasoning path a strong student would follow: the obvious idea, why it is too slow or wrong (with the constraint that rules it out), and the observation that unlocks the better approach.
- **Approach N: Name**: prose explaining the idea, then the three required subsections:
  - `### Algorithm`: numbered steps, precise enough to implement.
  - `### Dry Run`: a walk-through of **Example 1 with its real values**, as a GFM table or numbered steps. Every intermediate value must come from actually running the code (section 6). If Example 1 is too small to show the loop body (for example `n = 2`), walk Example 1 first and then add a clearly labelled extra trace on a slightly larger input.
  - `### Complexity`: exactly two bullets:
    - `- **Time:** $O(\dots)$ - why`
    - `- **Space:** $O(\dots)$ - why`
- Order approaches from simplest to best. Include a brute-force approach when it teaches something (it usually does). **The last approach is the optimal one** and must describe the same algorithm as the validated reference solutions, because the renderer attaches those as its implementation.
- **Edge Cases**: bullets, each derived from the constraints or the problem statement (empty input, single element, duplicates, extremes of the value range, overflow, disconnected structure, and so on), and how the final approach handles it.
- **Common Mistakes**: bullets describing errors real students make on this problem, phrased as "doing X causes Y; do Z instead".

### 2.2 Math

- Inline math: `$...$`. Display math: `$$...$$` on its own lines. Rendered with KaTeX.
- Use math for complexities and formulas: `$O(n \log n)$`, `$f[i] = f[i-1] + f[i-2]$`.
- Do not put a `|` character inside math that sits inside a table cell (it breaks the GFM table). Use `\lvert x \rvert` or move the formula out of the table.

### 2.3 Code

- Every fenced block has a language tag: `python`, `cpp`, `java`, `c`, `javascript`, `typescript` (or `text` for non-code diagrams).
- **Consecutive fenced blocks separated only by blank lines render as one tabbed code group.** Use this deliberately for multi-language snippets; separate unrelated blocks with prose.
- Non-final approaches may include **one illustrative Python block**. It must be a complete, runnable solution for the problem's contract (a `class Solution` with the judged method, or the stateful class for design problems), because the verifier runs it against the problem's samples. Keep it short and readable.
- The final approach contains **no code** in the markdown. The renderer appends:

  ```text
  ## Implementation
  [ python | cpp | java | c | javascript | typescript ]   <- tabs from editorialSolutions
  ```

  If the validated implementations differ in a detail that matters (for example BFS in one language and DFS in another, or a library container standing in for a hand-written structure), say so in a `> **Note:**` callout in the final approach.

### 2.4 Callouts

A blockquote whose first line starts with one of these markers renders as a styled callout:

- `> **Note:** ...` background facts, implementation differences.
- `> **Tip:** ...` an optional technique, a follow-up, a related problem pattern.
- `> **Warning:** ...` a correctness trap (overflow, recursion depth, stale state).

### 2.5 Forbidden content

- No raw HTML (the renderer escapes or strips it).
- No links of any kind in the body, including to LeetCode or doocs. Attribution is rendered from `editorialMeta`.
- No images in pilot editorials. (If images are added later they must go through `fetchVerifiedImage` to Cloudinary, per `backend/scripts/lib/hf-content/README.md`.)
- No invented test cases presented as official, and no hidden-test contents.
- No "Implementation" section written by hand.

---

## 3. Style guide

**Audience.** University students preparing for placements and contests. Assume they can code and know basic data structures; do not assume they have seen this trick before.

**Tone.** Clear, rigorous, and calm. Teach the reasoning, not just the result. Write as a good teaching assistant would explain at a whiteboard.

- Prefer short sentences and concrete statements. "Moving the taller line inward can never increase the area" beats "it can be observed that it is generally better to...".
- No filler: no "In this problem we will...", no "Let's dive in", no motivational lines, no "simply" or "obviously".
- Every claim that matters is justified in one line: why the greedy choice is safe, why the invariant holds, why the bound is tight enough.
- Address the reader as "we" when describing the algorithm, "you" only for advice.

**Notation.** Consistent within an editorial and across editorials:

- $n$ is the main input size; $m \times n$ for grids and two-string DP; $k$ for a secondary count; $V$, $E$ for graphs.
- Use the parameter names from the problem's function signature (`nums`, `target`, `height`, ...) in code font when referring to inputs, and short math names ($l$, $r$, $f[i][j]$) for algorithm state.
- Indices are 0-based unless the problem itself is 1-based (state it when it is).
- Write complexities in big-O inside math: `$O(n)$`, `$O(m \cdot n)$`, `$O(n \cdot 2^n)$`.

**Dry runs.**

- Use the exact Example 1 input from the problem page. Show the state that the algorithm actually maintains (pointer positions, the stack, the queue, the DP row), not a paraphrase.
- Tables: one row per iteration or event; keep columns to what the reader needs.
- End with the returned value and confirm it equals the expected output.

**Complexity.** State and justify. Name what dominates ("each index is pushed and popped at most once"). Count auxiliary space separately from output space when they differ, and say which one you report.

**Edge cases.** Derive them from the constraints section. For each one, say what the final algorithm does with it.

**Common mistakes.** Prefer mistakes that actually fail tests: off-by-one in window bounds, stale indices, integer overflow, mutating input that is reused, recursion depth, comparing only parent and child in a BST, forgetting the final flush of a monotonic stack. Avoid generic advice ("test your code").

**Length.** Typically 600-1500 words of prose for Medium problems, less for Easy, more only when a Hard problem genuinely needs it.

---

## 4. Rendering expectations (for the frontend lane)

- Parse GFM (tables, fenced code), math (`$`, `$$`) via KaTeX, and sanitize the resulting HTML with an allow-list. Raw HTML in the markdown must not execute.
- Callout blockquotes (section 2.4) get distinct styling.
- Consecutive code fences become one tab group, labelled by language.
- After the last body section, append `## Implementation` with tabs from `editorialSolutions` (only validated languages, in a stable order: python, cpp, java, c, javascript, typescript).
- Footer: if `editorialMeta.source === 'doocs-derived'`, show the attribution with license name and `attributionUrl`.
- Legacy editorials (no `editorialMeta`) go through the same pipeline; nothing in this spec is required for them to render.

---

## 5. File layout for batches

```text
D:\PeerPrepSources\editorials\<batch>\
  <num>-<slug>.md          markdown body (exactly what will be stored in Problem.editorial)
  <num>-<slug>.meta.json   { problemId, title, editorialMeta }
  _traces\                 captured trace output used to write the dry runs
  _verify-report.json      latest verifier output for the batch
```

`<num>` is the LeetCode number, `<slug>` the kebab-case title. Matching to the database is by `problemId`, never by title or number (the database's `displayOrder` does not equal the LeetCode number).

---

## 6. Verification checklist

An editorial may only be loaded when every item below passes. The automated items are run by `verifyEditorials.mjs`; the manual ones are recorded by the writer in `editorialMeta.checks`.

### 6.1 Checklist

1. **Structure** (automated): headings in the required order; each approach has Algorithm, Dry Run, Complexity; complexity bullets have the required form; no level-1 heading; no `## Implementation`.
2. **Safety** (automated): no raw HTML tags, no links or bare URLs, every code fence has an allowed language tag, no `|` inside inline math in table rows.
3. **Reference sanity** (automated): the problem's validated Python reference passes all sample tests locally through the platform's own hidden runner and submission evaluator. The six languages must already be in `validatedLanguages`.
4. **Illustrative code** (automated): every `python` block in the markdown is run against all sample tests through the same runner and must pass.
5. **Final answer in the dry run** (automated): the expected output of Example 1 appears in the final approach's Dry Run.
6. **Dry-run values traced** (manual, evidence required): the dry-run values were produced by an instrumented copy of the reference algorithm run on Example 1, and the trace output is saved under `_traces`.
7. **Complexity reviewed** (manual): stated time and space were checked against the reference code (loops, data-structure operations, recursion depth).
8. **Final approach matches references** (manual): the last approach describes the algorithm used by the validated references in all six languages; differences are called out in a Note.
9. **Source and license** (manual): `source`, `license` and `attributionUrl` follow section 1.
10. **Language** (manual): own words, no copied sentences, style guide followed.

### 6.2 Check identifiers

Use these strings in `editorialMeta.checks`:

| Identifier | Meaning |
| --- | --- |
| `structure-md-v2` | Item 1 passed. |
| `no-html-no-links` | Item 2 passed. |
| `reference-python-samples-pass` | Item 3 passed. |
| `illustrative-python-samples-pass` | Item 4 passed (omit if the editorial has no Python blocks). |
| `dry-run-final-output-matches` | Item 5 passed. |
| `dry-run-traced-example-1` | Item 6 done; trace saved. |
| `complexity-reviewed-against-reference` | Item 7 done. |
| `final-approach-matches-6-lang-references` | Item 8 done. |
| `attribution-set` | Item 9 done. |
| `brute-force-verified-on-samples` | A brute-force approach described in prose (with or without code) was implemented and checked on the samples in the trace scripts. |
