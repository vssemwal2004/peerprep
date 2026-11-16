import { useEffect, useState } from 'react';

/** The value, settled for `delay` ms: typing in a search box filters once, not on every key. */
export default function useDebouncedValue(value, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
