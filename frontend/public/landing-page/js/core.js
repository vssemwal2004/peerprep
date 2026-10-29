/* ==========================================================================
   PeerPrep landing — shared runtime (window.PP)
   Loaded once, before any js/sections/* or js/demos/* file.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasGSAP = typeof window.gsap !== 'undefined';

  var PP = (window.PP = window.PP || {});
  PP.reducedMotion = reduceMQ.matches;
  PP.isTouch = window.matchMedia('(hover: none)').matches;

  if (hasGSAP && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  if (hasGSAP && window.SplitText) gsap.registerPlugin(SplitText);

  /* ---------- ready ---------- */
  var readyQueue = [];
  var isReady = false;
  PP.ready = function (fn) {
    if (isReady) fn();
    else readyQueue.push(fn);
  };
  document.addEventListener('DOMContentLoaded', function () {
    isReady = true;
    readyQueue.splice(0).forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[PP] init error', e); }
    });
    // Keep the readable no-JS state until every critical section has had a
    // chance to initialize. Removing it during parsing made the hero vanish
    // while the remaining scripts downloaded, producing a black screen.
    doc.classList.remove('no-js');
    // Sections init in file order, not page order — sort so pins above
    // push the triggers below them correctly, then measure.
    if (window.ScrollTrigger) { ScrollTrigger.sort(); ScrollTrigger.refresh(); }
    // Web fonts change line wraps (the hero lead re-wraps by ~30px), so
    // everything measured before they arrive is re-measured once they do.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(flushFonts);
      setTimeout(flushFonts, 2500); // never wait on a slow font host
    } else {
      flushFonts();
    }
  });
  window.addEventListener('load', function () {
    if (window.ScrollTrigger) { ScrollTrigger.sort(); ScrollTrigger.refresh(); }
  });

  /* ---------- fontsReady: run after web fonts load (SplitText needs final
     glyph metrics), then re-sort + re-measure every ScrollTrigger. ---------- */
  var fontQueue = [];
  var fontsDone = false;
  PP.fontsReady = function (fn) {
    if (fontsDone) fn();
    else fontQueue.push(fn);
  };
  function flushFonts() {
    if (fontsDone) return;
    fontsDone = true;
    fontQueue.splice(0).forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[PP] init error', e); }
    });
    if (window.ScrollTrigger) { ScrollTrigger.sort(); ScrollTrigger.refresh(); }
  }

  // The intro preloader was removed; kept as an alias for existing callers.
  PP.afterIntro = PP.ready;

  /* ---------- theme ---------- */
  PP.theme = function () { return doc.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; };

  function applyTheme(next) {
    doc.setAttribute('data-theme', next);
    try { localStorage.setItem('pp-theme', next); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#0A0A0B' : '#F7F6F2');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(next === 'dark'));
      b.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
    window.dispatchEvent(new CustomEvent('pp:themechange', { detail: { theme: next } }));
  }

  PP.setTheme = function (next, originEl) {
    if (next === PP.theme()) return;
    if (!document.startViewTransition || PP.reducedMotion) return applyTheme(next);

    // Circular reveal expanding from the toggle button.
    var r = originEl ? originEl.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    var radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var t = document.startViewTransition(function () { applyTheme(next); });
    t.ready.then(function () {
      doc.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 700, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    });
  };

  PP.ready(function () {
    applyTheme(PP.theme());
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        PP.setTheme(PP.theme() === 'dark' ? 'light' : 'dark', btn);
      });
    });
  });

  /* ---------- smooth scroll (Lenis) ---------- */
  PP.lenis = null;
  PP.ready(function () {
    if (PP.reducedMotion || typeof window.Lenis === 'undefined') return;
    var lenis = new Lenis({ duration: 1.15, easing: function (t) { return 1 - Math.pow(1 - t, 4); }, smoothWheel: true });
    PP.lenis = lenis;
    if (hasGSAP && window.ScrollTrigger) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })(0);
    }
  });

  // In-page anchors use Lenis when available.
  // Lenis computes the destination once, when the jump starts; if a pin or
  // late layout shifts the page mid-flight it can land off target. On
  // arrival, re-measure and correct once if it is more than a few px out
  // (unless the page bottom makes the exact position unreachable).
  PP.scrollTo = function (target) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (!PP.lenis) { el.scrollIntoView({ behavior: PP.reducedMotion ? 'auto' : 'smooth' }); return; }
    var OFFSET = -72;
    PP.lenis.scrollTo(el, {
      offset: OFFSET,
      force: true,
      onComplete: function () {
        var miss = el.getBoundingClientRect().top + OFFSET;
        var max = document.documentElement.scrollHeight - innerHeight;
        var atEnd = miss > 0 && scrollY >= max - 2;
        if (Math.abs(miss) > 4 && !atEnd) PP.lenis.scrollTo(el, { offset: OFFSET, force: true, duration: 0.6 });
      },
    });
  };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    PP.scrollTo(el);
    history.replaceState(null, '', id);
  });

  /* ---------- scroll progress bar ---------- */
  PP.ready(function () {
    var bar = document.querySelector('.scroll-progress');
    var fill = bar && bar.firstElementChild;
    if (!fill) return;
    var ticking = false;
    // The page height is measured only when it can change: reading it on
    // every frame (after GSAP has written styles) forced a synchronous layout.
    var max = 0;
    function measure() { max = document.documentElement.scrollHeight - innerHeight; update(); }
    function update() {
      fill.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, scrollY / max) : 0).toFixed(4) + ')';
      ticking = false;
    }
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', measure);
    addEventListener('load', measure);
    if (window.ScrollTrigger) ScrollTrigger.addEventListener('refresh', measure);
    measure();
  });

  /* ---------- reveal on scroll ----------
     [data-reveal]                       → element reveals when in view
     [data-reveal-delay="0.2"]           → seconds
     [data-reveal-stagger="0.08"] parent → auto delay for its [data-reveal] children
  */
  PP.reveal = function (scope) {
    var root = scope || document;
    root.querySelectorAll('[data-reveal-stagger]').forEach(function (group) {
      var step = parseFloat(group.getAttribute('data-reveal-stagger')) || 0.08;
      group.querySelectorAll('[data-reveal]').forEach(function (el, i) {
        if (!el.hasAttribute('data-reveal-delay')) el.style.setProperty('--reveal-delay', (i * step).toFixed(2) + 's');
      });
    });
    root.querySelectorAll('[data-reveal-delay]').forEach(function (el) {
      el.style.setProperty('--reveal-delay', el.getAttribute('data-reveal-delay') + 's');
    });
    var items = root.querySelectorAll('[data-reveal]:not(.is-revealed)');
    if (PP.reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-revealed'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-revealed'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  };
  PP.ready(function () { PP.reveal(); });

  /* ---------- 3D tilt ----------
     [data-tilt] or [data-tilt="10"] (max degrees). Adds .tilt-glare child.
  */
  PP.tilt = function (el) {
    if (PP.reducedMotion || PP.isTouch || el.__tilt) return;
    el.__tilt = true;
    var max = parseFloat(el.getAttribute('data-tilt')) || 8;
    if (!el.querySelector(':scope > .tilt-glare')) {
      var g = document.createElement('span');
      g.className = 'tilt-glare';
      g.setAttribute('aria-hidden', 'true');
      el.appendChild(g);
    }
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      el.style.transform = 'perspective(1000px) rotateX(' + ((0.5 - py) * max).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * max).toFixed(2) + 'deg)';
      el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  };
  PP.ready(function () { document.querySelectorAll('[data-tilt]').forEach(PP.tilt); });

  /* ---------- magnetic buttons: [data-magnetic] ---------- */
  PP.ready(function () {
    if (PP.reducedMotion || PP.isTouch) return;
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.25;
        var y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  });

  /* ---------- count-up: [data-count-to="4000"] [data-count-suffix="+"] ---------- */
  PP.countUp = function (el) {
    var to = parseFloat(el.getAttribute('data-count-to'));
    var suffix = el.getAttribute('data-count-suffix') || '';
    var fmt = function (n) { return Math.round(n).toLocaleString('en-IN') + suffix; };
    if (PP.reducedMotion || !hasGSAP) { el.textContent = fmt(to); return; }
    var o = { v: 0 };
    gsap.to(o, { v: to, duration: 2, ease: 'power3.out', onUpdate: function () { el.textContent = fmt(o.v); } });
  };
  PP.ready(function () {
    var els = document.querySelectorAll('[data-count-to]');
    if (!('IntersectionObserver' in window)) return els.forEach(PP.countUp);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { PP.countUp(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  });

  /* ---------- product demo registry ----------
     A demo is a scripted, looping recreation of a PeerPrep screen.

     PP.demos.register('coding', {
       title: 'PrepCoding',          // tab label
       route: '/problems/two-sum',   // shown in the fake URL bar
       nav: 'coding',                // which app-sidebar item is active
       caption: 'Solve, run, submit', // one-line caption under the frame
       duration: 9000,               // ms the timeline takes (informational)
       create: function (root) {     // build DOM inside root, return a PAUSED gsap timeline
         root.innerHTML = '...';
         return gsap.timeline({ paused: true }) ... ;
       }
     });
  */
  var registry = {};
  var order = [];
  PP.demos = {
    register: function (id, def) {
      if (!registry[id]) order.push(id);
      registry[id] = Object.assign({ id: id }, def);
    },
    get: function (id) { return registry[id]; },
    list: function () { return order.map(function (id) { return registry[id]; }); },
  };

  /* ---------- helpers for demo scripts ---------- */
  // Types text into an element over time inside a timeline.
  PP.typeInto = function (tl, el, text, opts) {
    opts = opts || {};
    var speed = opts.speed || 0.035; // seconds per char
    var at = opts.at;
    var o = { n: 0 };
    tl.to(o, {
      n: text.length,
      duration: text.length * speed,
      ease: 'none',
      onUpdate: function () { el.textContent = text.slice(0, Math.round(o.n)); },
      onStart: function () { el.classList.add('is-typing'); },
      onComplete: function () { el.classList.remove('is-typing'); },
    }, at);
    return tl;
  };

  // Escapes text for innerHTML templates.
  PP.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
})();
