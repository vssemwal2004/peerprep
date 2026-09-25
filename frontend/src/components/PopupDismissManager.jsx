import { useEffect } from 'react';

// Persistent navigation disclosures are not popups. Closing them on pointerdown
// makes their child links/toggles inert before the click can reach its target.
const OPEN_POPUP_TRIGGER = 'button[aria-expanded="true"]:not([data-platform-disclosure])';

function getPopupBoundary(trigger) {
  return trigger.closest('[data-platform-popup-root]')
    || trigger.closest('.relative')
    || trigger.parentElement;
}

function eventIsInsideControlledPopup(trigger, event) {
  const controlledIds = String(trigger.getAttribute('aria-controls') || '')
    .split(/\s+/)
    .filter(Boolean);
  if (!controlledIds.length) return false;

  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return controlledIds.some((id) => {
    const popup = document.getElementById(id);
    return popup && (popup.contains(event.target) || eventPath.includes(popup));
  });
}

export default function PopupDismissManager() {
  useEffect(() => {
    const closeOpenPopups = (event) => {
      document.querySelectorAll(OPEN_POPUP_TRIGGER).forEach((trigger) => {
        const boundary = getPopupBoundary(trigger);
        if (boundary?.contains(event.target) || eventIsInsideControlledPopup(trigger, event)) return;

        // Let the current pointer event finish first. This keeps switching
        // directly from one popup to another smooth and avoids stale state.
        queueMicrotask(() => {
          if (trigger.isConnected && trigger.getAttribute('aria-expanded') === 'true') {
            trigger.click();
          }
        });
      });
    };

    const closeWithEscape = (event) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll(OPEN_POPUP_TRIGGER).forEach((trigger) => trigger.click());
    };

    document.addEventListener('pointerdown', closeOpenPopups, true);
    document.addEventListener('keydown', closeWithEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOpenPopups, true);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  return null;
}
