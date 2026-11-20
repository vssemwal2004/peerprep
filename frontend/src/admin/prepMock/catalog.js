import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';

// Shared helpers for the Prep Mock company/role pickers and the Companies & roles page.

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ROLE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .,&+#/()'’-]*$/u;

/** A role as the server stores it: trimmed, single spaces. */
export const cleanRole = (value) => String(value || '').trim().replace(/\s+/g, ' ');

/** Why a typed role cannot be added ('' when it can). Same rules as the server. */
export function roleNameProblem(value) {
  const name = cleanRole(value);
  if (name.length < 2) return 'Type at least 2 characters.';
  if (name.length > 80) return 'Keep the role under 80 characters.';
  if (!ROLE_PATTERN.test(name)) return 'Use letters, numbers, spaces and . , & + # / ( ) \' - only.';
  return '';
}

/** Checks a picked logo file before uploading it; returns an error message or ''. */
export function logoFileProblem(file) {
  if (!file) return 'Choose an image file.';
  if (!LOGO_TYPES.includes(file.type)) return 'Use a PNG, JPEG or WebP image.';
  if (file.size > MAX_LOGO_BYTES) return 'The image must be 2 MB or smaller.';
  return '';
}

/** Loads the role lists for a company: { loading, error, company: [...], shared: [...], reload }. */
export function useMockRoles(company) {
  const [state, setState] = useState({ loading: true, error: '', company: [], shared: [] });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    api.listMockRoles(company || '').then((result) => {
      if (active) setState({ loading: false, error: '', company: result.company || [], shared: result.shared || [] });
    }).catch((error) => {
      if (active) setState((previous) => ({ ...previous, loading: false, error: error.message || 'Could not load roles.' }));
    });
    return () => { active = false; };
  }, [company, version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}
