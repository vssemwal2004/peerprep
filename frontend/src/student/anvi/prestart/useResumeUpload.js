import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../utils/api";
import { resumeErrorOf, resumeFileProblem } from "../anviStartSetup";

/**
 * The resume of one interview, held above the UI that shows it, so an upload keeps going in the
 * background while the student moves on (the pre-start phases, the booking confirmation). Nothing waits
 * on the server's text extraction: the request is fired and the student continues; `settled()` is awaited
 * only where the resume is actually needed (Join).
 *
 * `target`: { kind: "practice"|"assignment", id }. `setup`: resumeSetupOf(item).
 * `onChange({ provided, source })` follows what is stored on the server.
 */
export default function useResumeUpload({ target, setup, onChange }) {
  const initial = setup?.provided ? { source: setup.source || null, preview: "", createdAt: setup.providedAt || null } : null;
  const [stored, setStored] = useState(initial);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const storedRef = useRef(initial);
  const errorRef = useRef(null);
  const pendingRef = useRef(null);
  const lastFileRef = useRef(null);
  const lastKindRef = useRef("");
  const aliveRef = useRef(true);
  const targetRef = useRef(target);
  const onChangeRef = useRef(onChange);
  useEffect(() => { targetRef.current = target; onChangeRef.current = onChange; });
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const keep = useCallback((value) => {
    storedRef.current = value;
    if (!aliveRef.current) return;
    setStored(value);
    onChangeRef.current?.({ provided: Boolean(value), source: value?.source || null });
  }, []);
  const fail = useCallback((value) => {
    errorRef.current = value;
    if (aliveRef.current) setError(value);
  }, []);

  // A resume added earlier (for example at booking) counts at once; its preview loads quietly.
  const targetKey = `${target?.kind}:${target?.id}`;
  useEffect(() => {
    if (!setup?.provided) return undefined;
    let active = true;
    api.getAnviResume(targetRef.current).then((value) => {
      if (active && !pendingRef.current && value) keep({ ...(storedRef.current || {}), ...value });
    }).catch((cause) => {
      if (active && !pendingRef.current && cause?.response?.status === 404) keep(null);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the interview changes.
  }, [targetKey, setup?.provided]);

  // One request at a time; every request is tracked so `settled()` can wait for it.
  const run = useCallback((kind, work, onDone) => {
    if (pendingRef.current) return pendingRef.current;
    fail(null);
    setBusy(kind);
    lastKindRef.current = kind;
    const promise = (async () => {
      try { onDone(await work()); return true; }
      catch (cause) {
        if (kind === "remove" && cause?.response?.status === 404) { keep(null); return true; }
        fail(resumeErrorOf(cause));
        return false;
      } finally {
        pendingRef.current = null;
        if (aliveRef.current) { setBusy(""); setProgress(0); }
      }
    })();
    pendingRef.current = promise;
    return promise;
  }, [fail, keep]);

  const upload = useCallback((file) => {
    if (pendingRef.current) return pendingRef.current;
    const problem = resumeFileProblem(file);
    if (problem) { fail({ message: problem, builderLink: false, local: true }); return Promise.resolve(false); }
    lastFileRef.current = file;
    setFileName(String(file.name || ""));
    setFileSize(Number(file.size) || 0);
    setProgress(0);
    return run("upload",
      () => api.uploadAnviResume(targetRef.current, file, { onProgress: (fraction) => { if (aliveRef.current) setProgress(fraction); } }),
      (value) => keep({ source: "upload", preview: "", ...(value || {}) }));
  }, [fail, keep, run]);

  const saveBuilder = useCallback(() => run("builder", () => api.saveAnviBuilderResume(targetRef.current),
    (value) => keep({ source: "builder", preview: "", ...(value || {}) })), [keep, run]);

  const remove = useCallback(() => run("remove", () => api.deleteAnviResume(targetRef.current), () => keep(null)), [keep, run]);

  const retry = useCallback(() => {
    if (lastKindRef.current === "builder") return saveBuilder();
    return lastFileRef.current ? upload(lastFileRef.current) : Promise.resolve(false);
  }, [saveBuilder, upload]);
  const clearError = useCallback(() => fail(null), [fail]);

  /** Resolves once no request is in flight: { provided, error }. */
  const settled = useCallback(async () => {
    while (pendingRef.current) await pendingRef.current.catch(() => false);
    return { provided: Boolean(storedRef.current), error: errorRef.current };
  }, []);

  const uploading = busy === "upload" || busy === "builder";
  return useMemo(() => ({
    stored, provided: Boolean(stored), busy, uploading, progress, error, fileName, fileSize,
    canRetry: Boolean(error && !error.local && !uploading && (lastKindRef.current === "builder" || (lastKindRef.current === "upload" && lastFileRef.current))),
    upload, saveBuilder, remove, retry, clearError, settled,
  }), [stored, busy, uploading, progress, error, fileName, fileSize, upload, saveBuilder, remove, retry, clearError, settled]);
}
