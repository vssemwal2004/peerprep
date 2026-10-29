// Keep the boot screen perceptible without delaying a page that is already ready.
const MIN_VISIBLE_MS = 420;

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
        setTimeout(() => loader.remove(), 280);
      });
    });
  }, wait);
}
