/* Nav: scrolled state, hide on scroll-down, active link, mobile sheet. */
(function () {
  PP.ready(function () {
    var nav = document.querySelector('[data-nav]');
    if (!nav) return;
    var burger = nav.querySelector('[data-nav-burger]');
    var sheet = nav.querySelector('[data-nav-sheet]');
    var lastY = scrollY;

    function onScroll() {
      var y = scrollY;
      nav.classList.toggle('is-scrolled', y > 24);
      var open = burger && burger.getAttribute('aria-expanded') === 'true';
      nav.classList.toggle('is-hidden', !open && y > 480 && y > lastY + 4);
      if (y < lastY - 4 || y < 480) nav.classList.remove('is-hidden');
      lastY = y;
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
