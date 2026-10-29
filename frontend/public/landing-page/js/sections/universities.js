/* ==========================================================================
   For universities
   - Heading: SplitText line-masked word reveal (same treatment as the hero).
   - Audience tabs: WAI-ARIA tabs (click, Left/Right/Home/End), a sliding
     brand underline, and a calm crossfade with the value lines rising in.
   - Laptop: PP.device playing the 'admin' reports scene on loop.
   ========================================================================== */
(function () {
  'use strict';

  PP.ready(function () {
    var root = document.getElementById('universities');
    if (!root) return;

    var hasGSAP = !!window.gsap;
    var motion = hasGSAP && !PP.reducedMotion;

    /* ---------- laptop ---------- */
    var deviceEl = root.querySelector('[data-uni-device]');
    var dev = null;
    if (deviceEl && PP.device && PP.demos.get('admin')) {
      dev = PP.device(deviceEl, {
        scene: 'admin',
        autoplay: true,
        // With reduced motion the device jumps to the end state; its loop
        // handler would then restart (and play) the scene, so no loop there.
        loop: !PP.reducedMotion,
        label: 'PeerPrep coordinator reports',
      });
    }
    legend(root, dev);

    /* ---------- tabs ---------- */
    var tablist = root.querySelector('[data-uni-tabs]');
    var ink = root.querySelector('[data-uni-ink]');
    var tabs = tablist ? Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]')) : [];
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    var current = 0;

    if (tabs.length) {
      root.classList.add('universities--js');

      var placeInk = function (animate) {
        if (!ink) return;
        var t = tabs[current];
        var x = t.offsetLeft;
        var w = t.offsetWidth;
        // Align the underline with the tab's bottom edge (tabs may wrap on phones).
        var y = t.offsetTop + t.offsetHeight - tablist.clientHeight;
        if (motion && animate) {
          gsap.to(ink, { x: x, y: y, scaleX: w, duration: 0.7, ease: 'expo.out', overwrite: true });
        } else if (hasGSAP) {
          gsap.set(ink, { x: x, y: y, scaleX: w });
        } else {
          ink.style.transform = 'translate(' + x + 'px,' + y + 'px) scaleX(' + w + ')';
        }
      };

      var select = function (i, focus) {
        if (i === current) { if (focus) tabs[i].focus(); return; }
        var prev = current;
        current = i;
        tabs.forEach(function (t, k) {
          var on = k === i;
          t.setAttribute('aria-selected', String(on));
          t.tabIndex = on ? 0 : -1;
        });
        if (focus) tabs[i].focus();
        placeInk(true);

        var out = panels[prev];
        var inn = panels[i];
        if (out) { out.classList.remove('is-active'); out.inert = true; }
        if (inn) { inn.classList.add('is-active'); inn.inert = false; }

        if (motion && inn && out) {
          gsap.killTweensOf([out, inn]);
          gsap.fromTo(out, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.25, ease: 'power1.in', clearProps: 'opacity,visibility' });
          var parts = inn.querySelectorAll('.universities__audience, .universities__values li');
          gsap.fromTo(inn, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, delay: 0.12, ease: 'power1.out', clearProps: 'opacity,visibility' });
          gsap.fromTo(parts, { y: 14, autoAlpha: 0 }, {
            y: 0, autoAlpha: 1, duration: 0.8, delay: 0.14, stagger: 0.045, ease: 'expo.out', clearProps: 'transform,opacity,visibility',
          });
        }
      };

      tabs.forEach(function (t, i) {
        t.addEventListener('click', function () { select(i, false); });
        t.addEventListener('keydown', function (e) {
          var n = tabs.length;
          var to = null;
          if (e.key === 'ArrowRight') to = (i + 1) % n;
          else if (e.key === 'ArrowLeft') to = (i - 1 + n) % n;
          else if (e.key === 'Home') to = 0;
          else if (e.key === 'End') to = n - 1;
          if (to === null) return;
          e.preventDefault();
          select(to, true);
        });
      });

      placeInk(false);
      if ('ResizeObserver' in window) new ResizeObserver(function () { placeInk(false); }).observe(tablist);
      else addEventListener('resize', function () { placeInk(false); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeInk(false); });
    }

    if (!motion) return;

    /* ---------- heading reveal ---------- */
    var title = root.querySelector('.universities__title');
    if (window.SplitText && title && window.ScrollTrigger) {
      SplitText.create(title, {
        type: 'lines,words',
        mask: 'lines',
        linesClass: 'uni-line',
        autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.words, {
            yPercent: 110,
            duration: 1.1,
            stagger: 0.04,
            ease: 'expo.out',
            scrollTrigger: { trigger: title, start: 'top 86%', once: true },
          });
        },
      });
    }
  });

  /* ---------- figure legend synced to the demo timeline ----------
     Each beat's hairline fills while that part of the scene plays; clicking
     a beat seeks the demo there (with reduced motion: shows that beat's end
     state, paused). Beat timings come from the scene's `steps`. */
  function legend(root, dev) {
    var list = root.querySelector('[data-uni-steps]');
    var def = PP.demos.get('admin');
    if (!list) return;
    var btns = Array.prototype.slice.call(list.querySelectorAll('[data-step]'));
    var steps = def && def.steps;
    if (!dev || !steps || !window.gsap) { list.closest('.universities__legend').classList.add('is-static'); btns.forEach(function (b) { b.disabled = true; }); return; }
    var fills = btns.map(function (b) { return b.querySelector('.universities__step-bar i'); });
    var lastActive = -1;

    function paint(t) {
      var active = -1;
      steps.forEach(function (s, i) {
        var p = Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start)));
        fills[i].style.setProperty('--p', p.toFixed(4));
        if (t >= s.start && t < s.end) active = i;
      });
      if (t >= steps[steps.length - 1].end) active = steps.length - 1;
      if (active !== lastActive) {
        btns.forEach(function (b, i) { b.classList.toggle('is-active', i === active); });
        lastActive = active;
      }
    }

    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(list);
    }
    gsap.ticker.add(function () {
      if (!visible) return;
      var tl = dev.timeline();
      if (tl) paint(tl.time());
    });

    btns.forEach(function (b, i) {
      b.addEventListener('click', function () {
        var tl = dev.timeline();
        if (!tl) return;
        if (PP.reducedMotion) { tl.pause(steps[i].end - 0.05); }
        else { tl.seek(steps[i].start); dev.play(); }
        paint(tl.time());
      });
    });
  }
})();
