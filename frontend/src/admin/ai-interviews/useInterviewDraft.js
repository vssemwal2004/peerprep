import { useCallback, useEffect, useRef, useState } from "react";
import { interviewApi } from "./api";

export function useInterviewDraft(id) {
  const [doc, setDoc] = useState(null),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [validating, setValidating] = useState(false),
    [conflict, setConflict] = useState(false),
    [notice, setNotice] = useState("");
  const current = useRef({ doc: null, data: null }),
    saved = useRef(""),
    flight = useRef(null),
    blocked = useRef(false),
    mounted = useRef(true),
    serial = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++serial.current;
    setLoading(true);
    setError("");
    try {
      const value = await interviewApi.get(id);
      if (!mounted.current || ticket !== serial.current) return;
      saved.current = JSON.stringify(value.data);
      current.current = { doc: value, data: value.data };
      setDoc(value);
      setData(value.data);
      blocked.current = false;
      setConflict(false);
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      if (mounted.current && ticket === serial.current) setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  const dirty = Boolean(data && JSON.stringify(data) !== saved.current);
  const change = (next) => {
    current.current.data = next;
    setData(next);
    setNotice("");
    if (!blocked.current) setError("");
  };
  const accept = (value, snapshot) => {
    saved.current = JSON.stringify(value.data);
    const untouched = JSON.stringify(current.current.data) === snapshot;
    current.current.doc = value;
    setDoc(value);
    if (untouched) {
      current.current.data = value.data;
      setData(value.data);
    }
  };
  const save = useCallback(async () => {
    if (flight.current) return flight.current;
    const state = current.current;
    if (!state.doc || state.doc.lifecycle !== "draft" || blocked.current)
      return null;
    const snapshot = JSON.stringify(state.data);
    if (snapshot === saved.current) return state.doc;
    setSaving(true);
    setError("");
    const ticket = serial.current;
    flight.current = interviewApi
      .save(id, state.doc.revision, state.data)
      .then((value) => {
        if (mounted.current && ticket === serial.current)
          accept(value, snapshot);
        return value;
      })
      .catch((err) => {
        if (mounted.current && ticket === serial.current) {
          setError(err.message);
          if (err.response?.status === 409) {
            blocked.current = true;
            setConflict(true);
          }
        }
        return null;
      })
      .finally(() => {
        flight.current = null;
        if (mounted.current) setSaving(false);
      });
    return flight.current;
  }, [id]);
  useEffect(() => {
    if (!dirty || saving || conflict || error) return undefined;
    const timer = setTimeout(save, 1200);
    return () => clearTimeout(timer);
  }, [dirty, data, saving, conflict, error, save]);
  const validate = async () => {
    setNotice("");
    let value = await save();
    if (!value) return;
    // A request may have started before the last edit. Flush that edit before validating.
    if (JSON.stringify(current.current.data) !== saved.current)
      value = await save();
    if (!value || JSON.stringify(current.current.data) !== saved.current)
      return;
    setSaving(true);
    setValidating(true);
    setError("");
    const snapshot = JSON.stringify(current.current.data);
    try {
      const next = await interviewApi.validate(id, value.revision);
      if (mounted.current) {
        accept(next, snapshot);
        setNotice(
          next.validation.complete
            ? "Configuration complete. Student delivery is not connected."
            : `${next.validation.issues.length} configuration issues need attention.`,
        );
      }
    } catch (err) {
      setError(err.message);
      if (err.response?.status === 409) {
        blocked.current = true;
        setConflict(true);
      }
    } finally {
      setSaving(false);
      setValidating(false);
    }
  };
  useEffect(() => {
    if (!dirty) return undefined;
    const unload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    const click = (e) => {
      const anchor = e.target.closest?.("a[href]");
      if (!anchor || e.defaultPrevented || e.button !== 0) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname.startsWith(`/admin/ai-interviews/${id}/`)) return;
      if (!window.confirm("There are unsaved changes. Leave this interview?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, id]);
  return {
    doc,
    data,
    change,
    loading,
    error,
    notice,
    dirty,
    saving,
    validating,
    conflict,
    save,
    validate,
    reload: load,
  };
}
