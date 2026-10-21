/* Hero: headline reveal + laptop playing the dashboard walkthrough. */
(function () {
  PP.ready(function () {
    var hero = document.getElementById('hero');
    if (!hero) return;

    var deviceEl = hero.querySelector('[data-hero-device]');
    var dev = null;
    if (deviceEl && PP.device) {
      dev = PP.device(deviceEl, {
        scene: PP.demos.get('dashboard') ? 'dashboard' : (PP.demos.list()[0] || {}).id,
        autoplay: true,
        loop: true,
        base3d: true,
        label: 'PeerPrep student dashboard',
      });
    }
    if (dev) openSequence(hero, dev);

    var field = hero.querySelector('[data-hero-field]');
    if (field && field.getContext) lineField(field, hero);

    if (!window.gsap || PP.reducedMotion) return;

    var title = hero.querySelector('.hero__title');
    var rest = hero.querySelectorAll('.hero__eyebrow, .hero__lead, .hero__ctas, .hero__note');
    var tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

    if (window.SplitText && title) {
      // Split on the final font's metrics (no re-wrap after the swap); the
      // title stays hidden until then so it never flashes unsplit.
      gsap.set(title, { autoAlpha: 0 });
      PP.fontsReady(function () {
        gsap.set(title, { autoAlpha: 1 });
        SplitText.create(title, {
          type: 'lines,words',
          mask: 'lines',
          autoSplit: true,
          onSplit: function (self) {
            return gsap.from(self.words, { yPercent: 110, duration: 1.2, stagger: 0.05, ease: 'expo.out', delay: 0.1 });
          },
        });
      });
    } else if (title) {
      tl.from(title, { y: 40, opacity: 0, duration: 1.2 }, 0.1);
    }

    tl.from(rest, { y: 18, opacity: 0, duration: 1, stagger: 0.08 }, 0.35)
      .from(hero.querySelector('.hero__stage'), { y: 60, opacity: 0, duration: 1.4 }, 0.55);
  });

  /* Desktop only: pin the stage while the laptop opens from closed, powers on
     and three dashboard areas are pointed out. Phones and reduced motion get
     the open laptop playing normally (the CSS default). */
  function openSequence(hero, dev) {
    if (!window.gsap || !window.ScrollTrigger || PP.reducedMotion) return;
    var pin = hero.querySelector('[data-hero-pin]');
    var el = dev.el;
    var cue = hero.querySelector('[data-hero-cue]');
    var marks = hero.querySelectorAll('.hero__mark');
    var notesWrap = hero.querySelector('[data-hero-notes]');
    var notes = hero.querySelectorAll('.hero__note-item');
    var floor = hero.querySelector('.hero__floor');
    var intro = hero.querySelector('.hero__intro');
    var mm = gsap.matchMedia();

    /* Spotlight boxes are measured from the dashboard's real cards (layout
       offsets ignore the laptop's 3D transforms), so they always frame the
       card exactly; hero.css keeps fixed percentages as the fallback. */
    var CARDS = ['.dm-dashboard__continue', '.dm-dashboard__challenge', '.dm-dashboard__prep'];
    function placeMarks() {
      var screen = el.querySelector('.device__screen');
      if (!screen || !screen.offsetWidth) return;
      var SW = screen.offsetWidth, SH = screen.offsetHeight, PAD = 6;
      CARDS.forEach(function (sel, i) {
        var card = el.querySelector(sel);
        if (!card || !marks[i]) return;
        var x = 0, y = 0, n = card;
        while (n && n !== screen) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
        if (n !== screen) return;
        var pct = function (v, of) { return (v / of * 100).toFixed(3) + '%'; };
        marks[i].style.left = pct(x - PAD, SW);
        marks[i].style.top = pct(y - PAD, SH);
        marks[i].style.width = pct(card.offsetWidth + PAD * 2, SW);
        marks[i].style.height = pct(card.offsetHeight + PAD * 2, SH);
      });
    }

    mm.add('(min-width: 900px)', function () {
      hero.classList.add('is-sequenced');
      var opened = false;
      dev.pause();
      placeMarks();

      function setNote(i) {
        notes.forEach(function (n, k) { n.classList.toggle('is-active', k === i); });
      }

      // The headline copy lifts away as the laptop rises into its pinned
      // place, so nothing is left half-cut at the top edge while pinned.
      if (intro) {
        gsap.fromTo(intro, { autoAlpha: 1, y: 0 }, {
          autoAlpha: 0, y: -48, ease: 'none',
          scrollTrigger: {
            trigger: hero, start: 'top+=120 top',
            endTrigger: pin, end: 'top top+=96',
            scrub: 0.6, invalidateOnRefresh: true,
          },
        });
      }

      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: pin,
          start: 'top top+=96', // clear of the header bar
          end: '+=170%',
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: placeMarks,
          onUpdate: function (self) {
            var p = self.progress;
            // The dashboard only runs once the screen is on.
            if (p > 0.52 && !opened) { opened = true; dev.play(); }
            else if (p <= 0.52 && opened) { opened = false; dev.pause(); }
            setNote(p < 0.58 ? -1 : p < 0.72 ? 0 : p < 0.86 ? 1 : 2);
          },
        },
      });

      // Closed: the machine lies on the desk, seen from above at ~38° —
      // a foreshortened slab — then the lid lifts and the view comes level.
      // (--lift -370px: the closed slab sits high enough in the device box
      // that its top edge shows on the first screen, above the fold.)
      // Each property is scrubbed on the element that uses it (they are
      // registered non-inherited in device.css), so a frame restyles four
      // elements instead of the whole dashboard inside the screen.
      var P = dev.parts;
      tl.fromTo(P.body, { '--tilt': '-38deg', '--lift': '-370px', '--dscale': 0.84 },
          { '--tilt': '0deg', '--lift': '0px', '--dscale': 1, ease: 'power2.inOut', duration: 0.5 }, 0)
        .fromTo(P.lid, { '--lid': '-90deg' }, { '--lid': '0deg', ease: 'power2.inOut', duration: 0.5 }, 0)
        .to(cue, { autoAlpha: 0, y: -12, duration: 0.08 }, 0.04)
        // One shared rise for the row, opacity-only per caption, so the three
        // rules never sit at different heights mid-animation.
        .fromTo(notesWrap, { y: 16 }, { y: 0, duration: 0.1 }, 0.44)
        .fromTo(notes, { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.02, duration: 0.08 }, 0.44)
        // The floor only appears as the machine lands on it: the closed,
        // lifted slab never hovers over a visible grid.
        .fromTo(floor, { opacity: 0 }, { opacity: 0.8, duration: 0.2 }, 0.32)
        // The power-on overlay shows from the start (closed lid) until 0.47.
        .fromTo(P.bootBar, { '--boot-bar': 0 }, { '--boot-bar': 1, duration: 0.16 }, 0.3)
        .fromTo(P.boot, { '--boot': 1 }, { '--boot': 0, duration: 0.07 }, 0.47)
        // Spotlights: one region at a time, each held briefly.
        .to(marks[0], { opacity: 1, duration: 0.03 }, 0.58)
        .to(marks[0], { opacity: 0, duration: 0.03 }, 0.70)
        .to(marks[1], { opacity: 1, duration: 0.03 }, 0.72)
        .to(marks[1], { opacity: 0, duration: 0.03 }, 0.84)
        .to(marks[2], { opacity: 1, duration: 0.03 }, 0.86)
        .to(marks[2], { opacity: 0, duration: 0.03 }, 0.97)
        .to({}, { duration: 0.03 }, 0.97);

      if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeMarks);

      return function () {
        hero.classList.remove('is-sequenced');
        gsap.set(P.body, { clearProps: '--tilt,--lift,--dscale' });
        gsap.set(P.lid, { clearProps: '--lid' });
        gsap.set([P.boot, P.bootBar], { clearProps: '--boot,--boot-bar' });
        setNote(-1);
        dev.play();
      };
    });
  }

  /* A field of flowing horizontal hairlines behind the headline (layered sine
     displacement, every 7th line in the brand colour). Drifts very slowly and
     yields softly around the pointer — the owner asked for a creative hero
     background, so it moves, but calmly. Still frame for reduced motion;
     paused offscreen and in hidden tabs. */
  function lineField(canvas, hero) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    var ink = '', brand = '';
    var T = 2.4;
    var mouse = { x: -9999, y: -9999, k: 0 };
    var raf = 0, last = 0, visible = true;

    function readColors() {
      var cs = getComputedStyle(document.documentElement);
      ink = cs.getPropertyValue('--ink').trim() || '#000';
      brand = cs.getPropertyValue('--brand').trim() || '#00a1db';
    }
    function resize() {
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      var lines = w < 700 ? 22 : 34;
      var gap = h / (lines + 1);
      var step = w < 700 ? 14 : 10;
      for (var i = 1; i <= lines; i++) {
        var y0 = i * gap;
        var accent = i % 7 === 3;
        ctx.beginPath();
        for (var x = -step; x <= w + step; x += step) {
          var n =
            Math.sin(x * 0.0042 + T * 0.6 + i * 0.35) * 10 +
            Math.sin(x * 0.0093 - T * 0.45 + i * 0.8) * 6 +
            Math.sin(x * 0.0017 + T * 0.25 - i * 0.12) * 14;
          var dx = x - mouse.x, dy = y0 - mouse.y;
          var bulge = mouse.k ? Math.exp(-(dx * dx + dy * dy) / 20000) * 18 * mouse.k : 0;
          var y = y0 + n * (0.45 + i / lines) - bulge;
          if (x === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = accent ? brand : ink;
        ctx.globalAlpha = accent ? 0.28 : 0.07;
        ctx.lineWidth = accent ? 1.1 : 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    var pending = 0;
    function redraw() {
      if (pending) return;
      pending = requestAnimationFrame(function () { pending = 0; resize(); draw(); });
    }

    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - last > 40) { // ~25fps is plenty for slow drift
        T += 0.01;
        mouse.k += ((mouse.x > -9000 ? 1 : 0) - mouse.k) * 0.06;
        draw();
        last = now;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && !PP.reducedMotion) raf = requestAnimationFrame(frame); }

    readColors();
    resize();
    draw();
    addEventListener('resize', redraw);
    addEventListener('pp:themechange', function () { readColors(); draw(); });
    if (PP.reducedMotion) return;

    hero.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    hero.addEventListener('pointerleave', function () { mouse.x = mouse.y = -9999; });
    document.addEventListener('visibilitychange', start);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; start(); }).observe(canvas);
    }
    start();
  }
})();
