/* Features — "The spec sheet": heading reveal + stage filter.
   Filter buttons (aria-pressed) collapse non-matching groups via the
   .is-collapsed grid-rows transition in features.css; a single underline
   slides to the active tab; a polite live region announces the count. */
(function () {
  'use strict';

  PP.ready(function () {
    var root = document.getElementById('features');
    if (!root) return;

    var filtersEl = root.querySelector('[data-features-filters]');
    var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-filter]'));
    var ink = root.querySelector('[data-features-ink]');
    var countEl = root.querySelector('[data-features-count]');
    var groups = Array.prototype.slice.call(root.querySelectorAll('.features__group'));
    var current = 'all';
    var refreshTimer = null;


    /* ---------- underline ---------- */
    function moveInk(instant) {
      if (!ink || !filtersEl) return;
      var btn = filtersEl.querySelector('[aria-pressed="true"]');
      if (!btn) return;
      if (instant) filtersEl.classList.add('is-instant');
      // offsetLeft is relative to the positioned filters container (scroll-safe).
      ink.style.setProperty('--ink-x', btn.offsetLeft + 'px');
      ink.style.setProperty('--ink-w', String(btn.offsetWidth));
      if (instant) {
        void ink.offsetWidth;
        filtersEl.classList.remove('is-instant');
      }
    }

    /* ---------- filtering ---------- */
    function apply(filter, opts) {
      opts = opts || {};
      current = filter;
      if (opts.instant) root.classList.add('is-instant');
      var lead = null;

      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === filter));
      });

      groups.forEach(function (g) {
        var match = filter === 'all' || g.getAttribute('data-group') === filter;
        g.classList.toggle('is-collapsed', !match);
        if (match) {
          g.removeAttribute('inert');
          g.removeAttribute('aria-hidden');
          if (!lead) lead = g;
        } else {
          g.setAttribute('inert', '');
          g.setAttribute('aria-hidden', 'true');
        }
        g.classList.remove('is-lead');
      });
      if (lead) lead.classList.add('is-lead');

      // Counts stages, not features (the approved figure is "20+ features";
      // listed rows include sub-items). Filtered: "Stage 2 of 6", so it is
      // clear (especially on phones, which open filtered) that more exist.
      if (countEl) {
        var idx = groups.indexOf(lead);
        countEl.textContent = filter === 'all'
          ? 'All ' + groups.length + ' stages'
          : 'Stage ' + (idx + 1) + ' of ' + groups.length;
      }

      moveInk(opts.instant);
      if (opts.instant) {
        void root.offsetHeight;
        root.classList.remove('is-instant');
      }

      // Keep the active tab visible inside the horizontally scrolling row (mobile).
      if (!opts.instant && filtersEl && filtersEl.scrollWidth > filtersEl.clientWidth) {
        var btn = filtersEl.querySelector('[aria-pressed="true"]');
        if (btn) {
          var target = btn.offsetLeft - (filtersEl.clientWidth - btn.offsetWidth) / 2;
          filtersEl.scrollTo({ left: Math.max(0, target), behavior: PP.reducedMotion ? 'auto' : 'smooth' });
        }
      }

      // Page height changed: re-measure ScrollTriggers below once the collapse settles.
      if (!opts.instant && window.ScrollTrigger) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, PP.reducedMotion ? 50 : 900);
      }
    }

    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter');
        if (f !== current) apply(f);
      });
      // Left/Right arrows move between filters (all remain individually tabbable).
      b.addEventListener('keydown', function (e) {
        var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        buttons[(i + dir + buttons.length) % buttons.length].focus();
      });
    });

    // Phones open on the first stage (the full sheet is ~30 rows in one
    // column); "All" stays one tap away and the live count says what is shown.
    var narrow = window.matchMedia('(max-width: 640px)').matches;
    apply(narrow ? 'learn' : 'all', { instant: true });
    root.classList.add('is-ready');
    // Live only after the initial state, so nothing is announced on load.
    if (countEl) countEl.setAttribute('aria-live', 'polite');

    // Edge fade on the scrolling tab row (phones) drops once the end is reached.
    function syncEdge() {
      if (!filtersEl) return;
      var end = filtersEl.scrollLeft + filtersEl.clientWidth >= filtersEl.scrollWidth - 2;
      filtersEl.classList.toggle('is-end', end);
      filtersEl.classList.toggle('is-scrolled', filtersEl.scrollLeft > 2);
    }
    if (filtersEl) filtersEl.addEventListener('scroll', syncEdge, { passive: true });

    // Re-measure the underline when layout or fonts change.
    if ('ResizeObserver' in window && filtersEl) {
      new ResizeObserver(function () { moveInk(true); syncEdge(); }).observe(filtersEl);
    } else {
      window.addEventListener('resize', function () { moveInk(true); syncEdge(); });
    }
    syncEdge();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveInk(true); });

    /* ---------- heading reveal (matches the hero) ---------- */
    if (!window.gsap || PP.reducedMotion || !window.ScrollTrigger) return;
    var title = root.querySelector('.features__title');
    if (window.SplitText && title) {
      SplitText.create(title, {
        type: 'lines,words',
        mask: 'lines',
        linesClass: 'features-line',
        autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.words, {
            yPercent: 110, duration: 1.2, stagger: 0.05, ease: 'expo.out',
            scrollTrigger: { trigger: title, start: 'top 88%', once: true },
          });
        },
      });
    }
  });
})();
