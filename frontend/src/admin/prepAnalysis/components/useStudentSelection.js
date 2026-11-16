import { useCallback, useEffect, useState } from "react";

/**
 * Picked students for "Send email": a Set of ids that survives paging and sorting.
 * `resetKey` (the filters, area…) starts a new selection when what is listed changes.
 */
export default function useStudentSelection(resetKey) {
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => { setIds(new Set()); }, [resetKey]);
  const toggle = useCallback((id) => setIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const setMany = useCallback((list, on) => setIds((current) => {
    const next = new Set(current);
    list.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  }), []);
  const replace = useCallback((list) => setIds(new Set(list)), []);
  const clear = useCallback(() => setIds(new Set()), []);
  return { ids, count: ids.size, has: (id) => ids.has(id), toggle, setMany, replace, clear };
}
