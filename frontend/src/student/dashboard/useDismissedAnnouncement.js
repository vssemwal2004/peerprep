import { useState } from 'react';

const STORAGE_KEY = 'peerprep:dashboard:dismissed-announcement';

function readDismissed() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

/** Remembers which announcement this viewer closed. A newer announcement shows the bar again. */
export default function useDismissedAnnouncement() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismiss = (id) => {
    setDismissed(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* per-viewer convenience only */ }
  };
  return [dismissed, dismiss];
}
