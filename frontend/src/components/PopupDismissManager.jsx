import { useEffect } from 'react';

const OPEN_POPUP_TRIGGER = 'button[aria-expanded="true"]';

function getPopupBoundary(trigger) {
  return trigger.closest('[data-platform-popup-root]')
    || trigger.closest('.relative')
    || trigger.parentElement;
}

export default function PopupDismissManager() {
  useEffect(() => {
    const closeOpenPopups = (event) => {
      document.querySelectorAll(OPEN_POPUP_TRIGGER).forEach((trigger) => {
        const boundary = getPopupBoundary(trigger);
        if (boundary?.contains(event.target)) return;

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
