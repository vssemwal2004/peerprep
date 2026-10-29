let removalTimer = null;

/**
 * Hides the dependency-free boot loader rendered by index.html.
 * Safe to call more than once and from routes that mount after it was removed.
 */
export function hideGlobalLoader() {
  if (typeof document === 'undefined') return;
  const loader = document.getElementById('global-loader');
  if (!loader) return;

  loader.classList.add('fade-out');

  const remove = () => {
    if (removalTimer) {
      clearTimeout(removalTimer);
      removalTimer = null;
    }
    loader.remove();
  };

  loader.addEventListener('transitionend', remove, { once: true });
  removalTimer = setTimeout(remove, 500);
}
