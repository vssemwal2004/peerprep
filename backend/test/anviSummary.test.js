import assert from "node:assert/strict";
import { test } from "node:test";
import { capSummary, emptySummary, SUMMARY_MAX_TOKENS, summaryForPrompt, summaryTokens, updateSummary } from "../src/modules/anviInterview/anviInterview.summary.js";

const item = { qid: "q1", n: 1, topic: "Hashing", competency: "DSA", keyPoints: ["separate chaining with linked lists", "open addressing probes", "load factor triggers resizing"] };
const answer = { accepted: true, kind: "answer", item, text: "Collisions are handled with chaining, each bucket keeps a linked list. When the load factor grows we trigger resizing.", seconds: 20 };

test("an accepted answer records coverage, strengths, missing concepts and recent context", () => {
  const summary = updateSummary(emptySummary(), answer);
  assert.equal(summary.completedQuestions.length, 1);
  assert.deepEqual(summary.completedQuestions[0], { qid: "q1", n: 1, topic: "Hashing", words: 19, seconds: 20, coverage: 0.67 });
  assert.deepEqual(summary.strengths, ["separate chaining with linked lists", "load factor triggers resizing"]);
  assert.deepEqual(summary.missingConcepts, ["open addressing probes"]);
  assert.match(summary.communication, /^brief answers, about 19 words each, about 57 words per minute$/);
  assert.equal(summary.recentContext, answer.text);
  // The decision's missing key points win over the keyword check, and the update is deterministic.
  const withDecision = updateSummary(emptySummary(), { ...answer, missingKeyPoints: ["worst-case lookup time"] });
  assert.deepEqual(withDecision.missingConcepts, ["worst-case lookup time"]);
  assert.deepEqual(updateSummary(emptySummary(), answer), summary);
  assert.doesNotThrow(() => JSON.parse(summaryForPrompt(summary)));
});

test("silence, a repeat, a retry, a skip or an unaccepted answer leave the summary unchanged", () => {
  const start = updateSummary(emptySummary(), answer);
  for (const event of [
    { accepted: false, kind: "silence", item, text: "" },
    { accepted: true, kind: "silence", item, text: "" },
    { accepted: false, kind: "repeat", item, text: "Can you repeat the question?" },
    { accepted: true, kind: "repeat", item, text: "Can you repeat the question?" },
    { accepted: true, kind: "retry", item, text: "Let me answer that again" },
    { accepted: true, kind: "skip", item, text: "Can we skip this?" },
    { accepted: false, kind: "answer", item, text: "A real answer that was not accepted" },
    { kind: "answer", item, text: "Accepted was not set" },
  ]) {
    assert.equal(updateSummary(start, event), start, event.kind);
  }
});

test("the summary stays within the token cap, dropping the oldest entries first", () => {
  let summary = emptySummary();
  for (let n = 1; n <= 40; n += 1) {
    summary = updateSummary(summary, {
      accepted: true,
      kind: "answer",
      item: { qid: `q${n}`, n, topic: `Topic number ${n} with a fairly long descriptive name`, keyPoints: [`concept alpha${n} detail`, `concept beta${n} detail`, `concept gamma${n} detail`] },
      text: `Answer ${n} talks about alpha${n} detail and other things `.repeat(10),
      seconds: 30,
    });
    assert.ok(summaryTokens(summary) <= SUMMARY_MAX_TOKENS, `after ${n}`);
  }
  assert.equal(summary.completedQuestions.at(-1).qid, "q40");
  assert.ok(!summary.completedQuestions.some((entry) => entry.qid === "q1"));
  assert.ok(summary.recentContext.split(" ").length <= 60);
  assert.ok(summaryTokens(capSummary(summary, 120)) <= 120);
});

test("a repeated answer to the same question replaces its entry", () => {
  const once = updateSummary(emptySummary(), answer);
  const twice = updateSummary(once, { ...answer, text: "Open addressing probes the next slot." });
  assert.equal(twice.completedQuestions.length, 1);
  assert.ok(twice.strengths.includes("open addressing probes"));
  assert.ok(!twice.missingConcepts.includes("open addressing probes"));
});
