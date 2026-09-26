import { useEffect, useRef, useState } from "react";

// Recovery is deliberately tab-memory only: never persist authoring prompts in
// localStorage or send an incomplete staged edit to the API.
const drafts = new Map();
const MAX_DRAFTS = 20;
const copy = (value) => structuredClone(value);
const encode = (value) => JSON.stringify(value);
function remember(key, entry) {
  drafts.delete(key);
  drafts.set(key, entry);
  while (drafts.size > MAX_DRAFTS) drafts.delete(drafts.keys().next().value);
}

/** Keep cacheKey stable for the mounted editor; key the editor when it changes. */
export function useStagedDraft({ cacheKey, initial, onClose, isNew = false }) {
  const [session] = useState(() => {
    const baseline = copy(initial);
    const baseJSON = encode(baseline);
    const saved = drafts.get(cacheKey);
    const restorable = Boolean(saved && (isNew || saved.baseJSON === baseJSON));
    return { key: cacheKey, baseline, baseJSON, saved, restorable };
  });
  const [draft, setDraftState] = useState(() =>
    copy(session.restorable ? session.saved.draft : session.baseline),
  );
  const current = useRef(draft);
  const [recovered, setRecovered] = useState(session.restorable);
  const [recovery, setRecovery] = useState(
    session.saved && !session.restorable ? session.saved : null,
  );
  const pendingRecovery = useRef(recovery);
  const dirty = encode(draft) !== session.baseJSON;
  const stale = Boolean(recovery);

  const persist = (next) => {
    if (encode(next) !== session.baseJSON) {
      remember(session.key, { baseJSON: session.baseJSON, draft: copy(next) });
    } else if (pendingRecovery.current) {
      remember(session.key, pendingRecovery.current);
    } else {
      drafts.delete(session.key);
    }
  };
  const setDraft = (nextValue) => {
    const next = copy(
      typeof nextValue === "function" ? nextValue(current.current) : nextValue,
    );
    current.current = next;
    // Update synchronously with the edit; a Back action must not race an effect.
    persist(next);
    setDraftState(next);
  };
  useEffect(() => {
    if (!dirty && !stale) return;
    const preventLoss = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty, stale]);

  const commit = () => drafts.delete(session.key);
  const close = () => {
    if (
      encode(current.current) !== session.baseJSON &&
      !window.confirm("Discard your unsaved changes?")
    )
      return false;
    commit();
    onClose?.();
    return true;
  };
  const restore = () => {
    const saved = pendingRecovery.current;
    if (!saved) return;
    pendingRecovery.current = null;
    setRecovery(null);
    setRecovered(true);
    setDraft(saved.draft);
  };
  const discardRecovery = () => {
    const hadStaleRecovery = Boolean(pendingRecovery.current);
    pendingRecovery.current = null;
    setRecovery(null);
    setRecovered(false);
    if (hadStaleRecovery) persist(current.current);
    else setDraft(session.baseline);
  };
  return {
    draft,
    setDraft,
    dirty,
    close,
    commit,
    recovered,
    stale,
    restore,
    discardRecovery,
  };
}
