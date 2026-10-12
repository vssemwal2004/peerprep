import { useEffect, useState } from 'react';

export const PAGE_SIZE = 25;
export const companies = (count) => `${count} ${count === 1 ? 'company' : 'companies'}`;

export function useDebounced(value, delay = 300) {
  const [current, setCurrent] = useState(value);
  useEffect(() => { const id = setTimeout(() => setCurrent(value), delay); return () => clearTimeout(id); }, [value, delay]);
  return current;
}
