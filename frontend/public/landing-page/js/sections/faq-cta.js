/* FAQ accordion, final-CTA reveal, footer anchor fallback. */
(function () {
  'use strict';

  /* ---------- FAQ accordion ---------- */
  function initFaq() {
    var faq = document.getElementById('faq');
    if (!faq) return;
    var items = Array.prototype.slice.call(faq.querySelectorAll('.faq__item'));
    if (!items.length) return;

    var refreshTimer = null;
    function refreshLater() {
      if (!window.ScrollTrigger) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 760);
    }

    function setOpen(item, open) {
      var btn = item.querySelector('.faq__btn');
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    }

    items.forEach(function (item) {
      var btn = item.querySelector('.faq__btn');
      if (!btn) return;
      setOpen(item, btn.getAttribute('aria-expanded') === 'true');
      btn.addEventListener('click', function () {
        // Items toggle independently: collapsing another answer above would
        // shift the row the reader just tapped out from under them.
        setOpen(item, !item.classList.contains('is-open'));
        refreshLater();
      });
      // Arrow-key movement between questions.
      btn.addEventListener('keydown', function (e) {
        var i = items.indexOf(item), next = null;
        if (e.key === 'ArrowDown') next = items[Math.min(items.length - 1, i + 1)];
        else if (e.key === 'ArrowUp') next = items[Math.max(0, i - 1)];
        else if (e.key === 'Home') next = items[0];
        else if (e.key === 'End') next = items[items.length - 1];
        if (next) { e.preventDefault(); next.querySelector('.faq__btn').focus(); }
      });
    });

    // Only collapse answers once JS is ready to open them again. Collapse
    // instantly (no transition) so ScrollTrigger measures the final layout.
    faq.classList.add('is-enhanced', 'is-settling');
    void faq.offsetHeight;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { faq.classList.remove('is-settling'); });
    });
  }

  /* ---------- Heading reveal (same language as the hero) ---------- */
  function splitReveal(el, lineClass) {
    if (!el || !window.gsap || !window.SplitText || !window.ScrollTrigger || PP.reducedMotion) return;
    SplitText.create(el, {
      type: 'lines,words',
      mask: 'lines',
      linesClass: lineClass,
      autoSplit: true,
      onSplit: function (self) {
        return gsap.from(self.words, {
          yPercent: 110,
          duration: 1.1,
          stagger: 0.04,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
      },
    });
  }

  function initCta() {
    var cta = document.getElementById('cta');
    if (!cta) return;

    if (!window.gsap || !window.ScrollTrigger || PP.reducedMotion) return; // static final state

    var rest = cta.querySelectorAll('.cta__eyebrow, .cta__lead, .cta__actions, .cta__more');
    gsap.from(rest, {
      y: 18, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out',
      scrollTrigger: { trigger: cta.querySelector('.cta__inner'), start: 'top 85%', once: true },
    });
  }

  /* ---------- Footer: fall back to #features if a product anchor is missing ---------- */
  function initFooter() {
    document.querySelectorAll('[data-footer-anchors] a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute('href');
      if (id.length > 1 && !document.querySelector(id)) {
        a.setAttribute('href', document.getElementById('features') ? '#features' : '#top');
      }
    });
  }

  PP.ready(function () {
    initFaq();
    initFooter();
    splitReveal(document.querySelector('#faq .faq__title'), 'faq-line');
    splitReveal(document.querySelector('#cta .cta__title'), 'cta-line');
    initCta();
  });
})();
