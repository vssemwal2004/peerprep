import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { act, createElement as h } from "react";
import { JSDOM } from "jsdom";
import { useStagedDraft } from "../src/admin/ai-interviews/useStagedDraft.js";

let dom,
  root,
  createRoot,
  editor,
  closed,
  allowDiscard,
  keySequence = 0;
const keys = ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"];
const originals = new Map(
  keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
before(async () => {
  dom = new JSDOM('<!doctype html><div id="app"></div>');
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key],
    });
  ({ createRoot } = await import("react-dom/client"));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById("app"));
  closed = 0;
  allowDiscard = true;
  window.confirm = () => allowDiscard;
});
after(async () => {
  if (root) await act(async () => root.unmount());
  dom.window.close();
  for (const key of keys) {
    if (originals.get(key))
      Object.defineProperty(globalThis, key, originals.get(key));
    else delete globalThis[key];
  }
});
function Wrapper(props) {
  editor = useStagedDraft({
    ...props,
    onClose: () => {
      closed++;
    },
  });
  return h("span", null, editor.draft.text);
}
const makeKey = () => `test-staged:${++keySequence}`;
async function mount(cacheKey, initial, isNew = false) {
  await act(async () =>
    root.render(h(Wrapper, { key: cacheKey, cacheKey, initial, isNew })),
  );
}
async function leave() {
  await act(async () => root.render(null));
}

test("leaving and reopening an editor restores an unsaved draft only in tab memory", async () => {
  const key = makeKey();
  await mount(key, { text: "Saved" });
  await act(async () => editor.setDraft({ text: "Unsaved work" }));
  assert.equal(editor.dirty, true);
  await leave();
  await mount(key, { text: "Saved" });
  assert.equal(editor.draft.text, "Unsaved work");
  assert.equal(editor.recovered, true);
  assert.equal(editor.stale, false);
  assert.equal(editor.dirty, true);
});
test("new drafts recover despite freshly generated IDs on reopen", async () => {
  const key = makeKey();
  await mount(key, { id: "first-id", text: "" }, true);
  await act(async () => editor.setDraft({ id: "first-id", text: "New topic" }));
  await leave();
  await mount(key, { id: "new-id", text: "" }, true);
  assert.equal(editor.draft.id, "first-id");
  assert.equal(editor.draft.text, "New topic");
  assert.equal(editor.recovered, true);
});
test("a changed saved base stays intact until the admin explicitly restores", async () => {
  const key = makeKey();
  await mount(key, { text: "Version 1" });
  await act(async () => editor.setDraft({ text: "Older local edit" }));
  await leave();
  await mount(key, { text: "Version 2" });
  assert.equal(editor.draft.text, "Version 2");
  assert.equal(editor.stale, true);
  assert.equal(editor.recovered, false);
  assert.equal(editor.dirty, false);
  await act(async () => editor.restore());
  assert.equal(editor.draft.text, "Older local edit");
  assert.equal(editor.stale, false);
  assert.equal(editor.dirty, true);
  await leave();
  await mount(key, { text: "Version 2" });
  assert.equal(editor.draft.text, "Older local edit");
  assert.equal(editor.recovered, true);
});
test("discarding stale recovery keeps the current saved version", async () => {
  const key = makeKey();
  await mount(key, { text: "Version 1" });
  await act(async () => editor.setDraft({ text: "Old local edit" }));
  await leave();
  await mount(key, { text: "Version 2" });
  await act(async () => editor.discardRecovery());
  assert.equal(editor.draft.text, "Version 2");
  assert.equal(editor.stale, false);
  await leave();
  await mount(key, { text: "Version 2" });
  assert.equal(editor.recovered, false);
  assert.equal(editor.stale, false);
});
test("commit clears recovery without closing; guarded close requires discard consent", async () => {
  const key = makeKey();
  await mount(key, { text: "Saved" });
  await act(async () => editor.setDraft({ text: "Changed" }));
  allowDiscard = false;
  await act(async () => editor.close());
  assert.equal(closed, 0);
  await act(async () => editor.commit());
  assert.equal(closed, 0);
  await leave();
  await mount(key, { text: "Saved" });
  assert.equal(editor.draft.text, "Saved");
  assert.equal(editor.recovered, false);
  await act(async () => editor.setDraft({ text: "Changed again" }));
  allowDiscard = true;
  await act(async () => editor.close());
  assert.equal(closed, 1);
  await leave();
  await mount(key, { text: "Saved" });
  assert.equal(editor.recovered, false);
});
test("multiple functional edits are cached synchronously and unload is protected", async () => {
  const key = makeKey();
  await mount(key, { text: "", count: 0 });
  await act(async () => {
    editor.setDraft((draft) => ({ ...draft, count: draft.count + 1 }));
    editor.setDraft((draft) => ({ ...draft, count: draft.count + 1 }));
  });
  assert.equal(editor.draft.count, 2);
  const event = new window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  await leave();
  await mount(key, { text: "", count: 0 });
  assert.equal(editor.draft.count, 2);
});
test("recovery cache retains at most twenty recent dirty editors", async () => {
  const records = [];
  for (let i = 0; i < 21; i++) {
    const key = makeKey();
    records.push(key);
    await mount(key, { text: "Saved" });
    await act(async () => editor.setDraft({ text: `Dirty ${i}` }));
  }
  await mount(records[0], { text: "Saved" });
  assert.equal(editor.recovered, false);
  await mount(records[20], { text: "Saved" });
  assert.equal(editor.draft.text, "Dirty 20");
  assert.equal(editor.recovered, true);
});
