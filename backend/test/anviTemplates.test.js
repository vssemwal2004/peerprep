import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACK_TEMPLATE_IDS, CLARIFY_TEMPLATE_IDS, MAX_NUMBER_CLIP, numberClipId, pickAck, pregenTemplates, TEMPLATE_KINDS,
  TEMPLATE_SCHEMA_VERSION, TEMPLATES, templateById, templateText,
} from "../src/modules/anviInterview/anviInterview.templates.js";

test("the catalogue is versioned, English, reviewed and holds no placeholders or names", () => {
  assert.equal(TEMPLATE_SCHEMA_VERSION, 1);
  assert.equal(new Set(TEMPLATES.map((template) => template.id)).size, TEMPLATES.length);
  for (const template of TEMPLATES) {
    assert.ok(TEMPLATE_KINDS.includes(template.kind), template.id);
    assert.ok(template.text.English, template.id);
    assert.equal(template.reviewed, true);
    assert.doesNotMatch(template.text.English, /[{}<>]|https?:/);
    assert.ok(Object.isFrozen(template));
  }
  for (const id of ["clarify.example", "clarify.think", "clarify.main_idea", "clarify.complexity", "clarify.trade_off", "clarify.scale"]) assert.ok(CLARIFY_TEMPLATE_IDS.includes(id));
  assert.equal(ACK_TEMPLATE_IDS.length, 5);
  for (const kind of ["intro", "closing", "nudge", "move_on", "transition"]) assert.ok(TEMPLATES.some((template) => template.kind === kind), kind);
});

test("number clips cover questions 1..40 and spell the number", () => {
  assert.equal(templateText(numberClipId(3)), "Question three.");
  assert.equal(templateText(numberClipId(21)), "Question twenty-one.");
  assert.equal(templateText(numberClipId(40)), "Question forty.");
  assert.equal(numberClipId(0), null);
  assert.equal(numberClipId(MAX_NUMBER_CLIP + 1), null);
  assert.equal(numberClipId(2.5), null);
  assert.equal(templateById("number.12").n, 12);
});

test("lookups fall back to English, pregen lists reviewed entries per language, and acks never repeat", () => {
  assert.equal(templateText("ack.okay", "Hinglish"), "Okay.");
  assert.equal(templateText("missing"), null);
  assert.equal(pregenTemplates(["English"]).length, TEMPLATES.length);
  assert.equal(pregenTemplates(["Hindi"]).length, 0);
  let previous = null;
  for (let i = 0; i < 50; i += 1) {
    const next = pickAck(previous, () => (i * 0.37) % 1);
    assert.ok(ACK_TEMPLATE_IDS.includes(next));
    assert.notEqual(next, previous);
    previous = next;
  }
  assert.ok(ACK_TEMPLATE_IDS.includes(pickAck(null, () => 0.999999)));
});
