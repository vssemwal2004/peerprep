import { useEffect, useState } from "react";

const TICK_MS = 15_000;

/** The current time, re-read every 15 s (countdowns, join windows); a fixed `now` freezes it for tests. */
export default function useNow(fixedNow) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return undefined;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [fixedNow]);
  return fixedNow ?? now;
}
