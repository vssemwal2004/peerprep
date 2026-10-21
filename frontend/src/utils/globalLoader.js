// The index.html intro forms the full logo by ~1.2s after navigation; never cut it off half-way.
const MIN_VISIBLE_MS = 1200;

// Fades out and removes the boot loader defined in index.html. Safe to call more than once.
export function hideGlobalLoader() {
  const loader = document.getElementById('global-loader');
  if (!loader || loader.dataset.hiding) return;
  loader.dataset.hiding = 'true';
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
  setTimeout(() => {
    // rAF ensures the browser has painted at least one frame of the page before we fade
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 450);
      });
    });
  }, wait);
}
