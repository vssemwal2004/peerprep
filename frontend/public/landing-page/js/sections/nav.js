/* Nav: scrolled state, hide on scroll-down, active link, mobile sheet. */
(function () {
  PP.ready(function () {
    var nav = document.querySelector('[data-nav]');
    if (!nav) return;
    var burger = nav.querySelector('[data-nav-burger]');
    var sheet = nav.querySelector('[data-nav-sheet]');
    var lastY = scrollY;
    // Hide/show needs a sustained run in one direction. Lenis eases every
    // scroll, so single-event deltas swing between large and tiny; comparing
    // them to a fixed step made the bar (and logo) flicker in and out.
    var HIDE_AFTER = 96, SHOW_AFTER = 48, TOP_ZONE = 480;
    var run = 0;
    var hidden = false;
    var scrolled = null;

    function setHidden(v) {
      if (v === hidden) return;
      hidden = v;
      nav.classList.toggle('is-hidden', v);
    }
    function onScroll() {
      var y = scrollY;
      var dy = y - lastY;
      lastY = y;
      if ((y > 24) !== scrolled) { scrolled = y > 24; nav.classList.toggle('is-scrolled', scrolled); }
      var open = burger && burger.getAttribute('aria-expanded') === 'true';
      if (open || y < TOP_ZONE) { run = 0; setHidden(false); return; }
      if (!dy) return;
      if ((dy > 0) !== (run > 0)) run = 0; // direction changed: start a new run
      run += dy;
      if (run > HIDE_AFTER) setHidden(true);
      else if (run < -SHOW_AFTER) setHidden(false);
    }
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    function setOpen(open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      sheet.hidden = !open;
    }
    if (burger && sheet) {
      burger.addEventListener('click', function () { setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
      sheet.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    }

    // Highlight the link for the section in view.
    var links = Array.prototype.slice.call(nav.querySelectorAll('.nav__links a[href^="#"]'));
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (a) {
      var s = document.querySelector(a.getAttribute('href'));
      if (s) io.observe(s);
    });
  });
})();
