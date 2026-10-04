// Expanded width is 20% narrower than the previous 17rem global sidebar.
export function getSidebarWidth(expanded) {
  return expanded ? '13.6rem' : '4rem';
}

// Hover expansion overlays the compact rail. Pinning reserves the full panel
// width so the page and dashboard header remain connected to the sidebar.
export const STUDENT_SIDEBAR_RAIL_WIDTH = '4.25rem';
export const STUDENT_SIDEBAR_PANEL_WIDTH = '14.5rem';
