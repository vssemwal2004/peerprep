/* ==========================================================================
   Manifesto — "Who we are" statement sequence
   Desktop (>= 900px) with motion: the stage is pinned for ~3.3 viewports and
   a single scrubbed timeline plays
     1. "Placement prep is scattered."  (revealed on entry, lifts + blurs out)
     2. "Every switch between tools costs you progress." (words rise in, out)
     3. h2 "PeerPrep brings it into one place." (words rise in, then lifts)
     4. nine real screens on ONE tilted plane rise from below, flatten to 0deg
        and scale toward the viewer until the dashboard tile dominates;
        the payoff line fades in beneath it.
   Only transform / opacity / filter are animated; will-change is set while
   the pin is active. Phones, reduced motion and no-GSAP keep the static
   stacked layout (core.js reveals).
   ========================================================================== */
(function () {
  'use strict';

  PP.ready(function () {
    var root = document.querySelector('[data-mf]');
    if (!root || !window.gsap || !window.ScrollTrigger || PP.reducedMotion) return;

    var pin = root.querySelector('[data-mf-pin]');
    var plane = root.querySelector('[data-mf-plane]');
    var line1 = root.querySelector('[data-mf-line="1"]');
    var line2 = root.querySelector('[data-mf-line="2"]');
    var line3 = root.querySelector('[data-mf-line="3"]');
    var cap = root.querySelector('[data-mf-cap]');
    var payoff = root.querySelector('[data-mf-payoff]');
    var meter = root.querySelector('[data-mf-meter]');
    var head = root.querySelector('.manifesto__head');
    var others = root.querySelectorAll('[data-mf-tile]:not([data-mf-center])');
    if (!pin || !plane || !line1 || !line2 || !line3) return;

    var mm = gsap.matchMedia();

    mm.add('(min-width: 900px)', function () {
      root.classList.add('is-cine');
      // Pinned elements are driven by GSAP — settle the CSS reveal state so
      // its transitions never fight the scrubbed transforms.
      pin.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('is-revealed'); });

      var splits = [];
      function words(el) {
        if (!window.SplitText) return [el];
        var s = SplitText.create(el, { type: 'words', mask: 'words', wordsClass: 'mf-w', tag: 'span', aria: 'none' });
        splits.push(s);
        return s.words;
      }
      var w1 = words(line1);
      var w2 = words(line2);
      var w3 = words(line3);

      var vh = function () { return window.innerHeight; };
      // Plane starts at ~58% of the viewport width (small and far).
      var s0 = function () { return Math.min(0.34, (window.innerWidth * 0.58) / plane.offsetWidth); };
      var animated = [plane, line1, line2, line3];

      gsap.set(plane, { x: 0, xPercent: -50, yPercent: -50 });

      // The screens sit inside a clipped, pinned stage, so native lazy loading
      // would only fetch them once they are on screen. Fetch the current
      // theme's set as the section approaches (and the other set on toggle).
      // decode() hands each screen to the compositor's decode cache ahead of
      // time, so its first frame on screen does not wait on a WebP decode.
      var wanted = false;
      function preload() {
        wanted = true;
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        plane.querySelectorAll(dark ? '.manifesto__img--dark' : '.manifesto__img--light')
          .forEach(function (img) {
            img.loading = 'eager';
            if (img.decode) img.decode().catch(function () {});
          });
      }

      // Background tiles dim behind a veil in the page colour: the same blend
      // as fading the tile, but a veil is its own layer, so it changes on the
      // compositor instead of repainting the whole plane every frame.
      var veils = Array.prototype.map.call(others, function (tile) {
        var v = document.createElement('span');
        v.className = 'manifesto__veil';
        v.setAttribute('aria-hidden', 'true');
        tile.appendChild(v);
        return v;
      });
      function onTheme() { if (wanted) preload(); }
      ScrollTrigger.create({ trigger: root, start: 'top 250%', once: true, onEnter: preload });
      window.addEventListener('pp:themechange', onTheme);

      // Beat 1 rises in as the section arrives (before the pin engages).
      var intro = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 62%', toggleActions: 'play none none reverse' },
      });
      intro.from(w1, { yPercent: 135, duration: 1.1, stagger: 0.06, ease: 'expo.out' })
        // (the inner span, so this never fights the scrubbed exit on the <p>)
        .from(cap.firstElementChild || cap, { opacity: 0, y: 14, duration: 0.9, ease: 'expo.out' }, 0.35);

      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: pin,
          start: 'top top',
          end: function () { return '+=' + Math.round(vh() * 3.3); },
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onToggle: function (self) {
            animated.forEach(function (el) {
              el.style.willChange = self.isActive ? (el === plane ? 'transform' : 'transform, opacity') : '';
            });
          },
        },
      });

      tl.fromTo(meter, { scaleX: 0 }, { scaleX: 1, duration: 8 }, 0)

        // 1 → out (lift + fade only: a scrubbed blur filter re-renders the
        // whole headline layer on the GPU every frame)
        .to(line1, { yPercent: -35, opacity: 0, duration: 1, ease: 'power2.in' }, 0.9)
        .to(cap, { y: -24, opacity: 0, duration: 0.7, ease: 'power2.in' }, 0.9)

        // 2 → in, hold, out
        .from(w2, { yPercent: 135, duration: 0.9, stagger: 0.07, ease: 'power3.out' }, 1.6)
        .to(line2, { yPercent: -35, opacity: 0, duration: 1, ease: 'power2.in' }, 3.7)

        // 3 → in, hold
        .from(w3, { yPercent: 135, duration: 0.9, stagger: 0.07, ease: 'power3.out' }, 4.4)

        // 4 → the wall rises on its tilted plane while the heading lifts
        .to(line3, { y: function () { return -vh() * 0.26; }, scale: 0.58, duration: 1.2, ease: 'power2.inOut' }, 6.5)
        .fromTo(plane,
          { y: function () { return vh() * 0.95; }, scale: s0, rotationX: 22 },
          { y: function () { return vh() * 0.16; }, duration: 1.5, ease: 'power2.out' }, 6.5)

        // … then flattens and comes toward the viewer; dashboard dominates
        .to(plane, { y: function () { return -vh() * 0.03; }, scale: 1, rotationX: 0, duration: 2.6, ease: 'power1.inOut' }, 8)
        .to(line3, { y: function () { return -vh() * 0.38; }, opacity: 0, duration: 0.8, ease: 'power1.in' }, 7.7)
        .to(head, { opacity: 0, y: -16, duration: 0.7, ease: 'power1.in' }, 7.9)
        .fromTo(veils, { opacity: 0 }, { opacity: 0.6, duration: 1.4 }, 9.2) // = tile at 0.4 over the page
        .fromTo(payoff, { opacity: 0, yPercent: -50, y: 18 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 9.9)
        .to({}, { duration: 0.4 }, 10.7);

      return function () {
        window.removeEventListener('pp:themechange', onTheme);
        root.classList.remove('is-cine');
        veils.forEach(function (v) { v.remove(); });
        splits.forEach(function (s) { s.revert(); });
        animated.forEach(function (el) { el.style.willChange = ''; });
      };
    });
  });
})();
