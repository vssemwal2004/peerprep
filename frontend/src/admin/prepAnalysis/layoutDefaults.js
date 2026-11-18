/**
 * Areas whose default layout the server redesigned since these layouts were saved (catalog
 * `defaultLayoutVersion`, a missing number is 1) lose their saved layout once, so the new default
 * shows; `versions` then records the new numbers and later changes by the admin stay.
 * Returns { layouts, versions }, or null when nothing changes.
 */
export function upgradeToDefaults(layouts, versions = {}, latest = {}) {
  const next = { ...(layouts || {}) };
  let changed = false;
  for (const [area, version] of Object.entries(latest || {})) {
    if ((versions?.[area] || 1) >= version) continue;
    changed = true;
    delete next[area];
  }
  return changed ? { layouts: next, versions: { ...(versions || {}), ...latest } } : null;
}
