/* How it works — "the loop, panel by panel".
   ≥900px with motion: adds .how--pinned, pins the stage and scrubs the five
   panels sideways. One timeline drives a single value (pos, 0..4, with short
   holds on each panel); render() derives every transform from it, so the
   screen parallax, its 0.92→1 scale, the faster numeral drift, the text fade
   and the rail all stay in lock-step with the scrubbed track.
   <900px with motion: vertical sequence with simple reveals.
   Reduced motion / no GSAP: nothing runs; the static layout is complete. */
(function () {
  'use strict';

  PP.ready(function () {
    var sec = document.getElementById('how');
    if (!sec || !window.gsap || !window.ScrollTrigger || PP.reducedMotion) return;

    var stage = sec.querySelector('[data-how-stage]');
    var track = sec.querySelector('[data-how-track]');
    var panels = [].slice.call(sec.querySelectorAll('[data-how-panel]'));
    var fill = sec.querySelector('[data-how-fill]');
    var steps = [].slice.call(sec.querySelectorAll('[data-how-go]'));
    var coda = sec.querySelector('[data-how-coda]');
    if (!stage || !track || !panels.length) return;

    headReveal(sec);

    var mm = gsap.matchMedia();
    mm.add('(min-width: 900px)', function () {
      var cleanup = pinned();
      revealCoda();
      return cleanup;
    });
    mm.add('(max-width: 899.98px)', function () {
      stacked();
      revealCoda();
    });

    /* ---------- desktop: pinned horizontal track ---------- */
    function pinned() {
      sec.classList.add('how--pinned');

      var n = panels.length;
      var HOLD = 0.4; // timeline units each panel rests at centre
      var W = stage.clientWidth || innerWidth;
      var state = { pos: 0 };
      var parts = panels.map(function (p) {
        var shot = p.querySelector('[data-how-shot]');
        return {
          shotX: gsap.quickSetter(shot, 'x', 'px'),
          shotS: gsap.quickSetter(shot, 'scale'),
          numX: gsap.quickSetter(p.querySelector('[data-how-num]'), 'x', 'px'),
          textO: gsap.quickSetter(p.querySelector('.how__text'), 'opacity'),
          shot: shot,
          num: p.querySelector('[data-how-num]'),
          text: p.querySelector('.how__text'),
        };
      });
      var setTrackX = gsap.quickSetter(track, 'x', 'px');
      var setFill = fill ? gsap.quickSetter(fill, 'scaleX') : function () {};
      var active = -1;

      function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
      function render() {
        var pos = state.pos;
        setTrackX(-pos * W);
        for (var i = 0; i < n; i++) {
          var d = i - pos;              // >0: panel is to the right of centre
          var ad = Math.abs(d);
          if (ad > 1.6) continue;       // offscreen — leave it
          var near = Math.min(ad, 1);
          parts[i].shotX(d * W * 0.07);           // screen travels a touch faster than its text
          parts[i].shotS(1 - 0.08 * near);        // 0.92 at the edge → 1 at centre
          parts[i].numX(d * W * 0.24);            // the numeral drifts fastest
          parts[i].textO(1 - 0.85 * clamp01((ad - 0.12) / 0.5));
        }
        setFill((pos + 1) / n);
        var a = Math.round(pos);
        if (a !== active) {
          active = a;
          steps.forEach(function (b, j) {
            b.classList.toggle('is-active', j === a);
            b.classList.toggle('is-past', j < a);
            if (j === a) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
          });
        }
      }

      var tl = gsap.timeline({
        onUpdate: render,
        scrollTrigger: {
          trigger: stage,
          start: 'top top',
          end: function () { return '+=' + Math.round(track.scrollWidth); },
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: function () { W = stage.clientWidth || innerWidth; render(); },
        },
      });
      tl.to({}, { duration: HOLD });
      for (var i = 1; i < n; i++) {
        tl.to(state, { pos: i, duration: 1, ease: 'power1.inOut' }).to({}, { duration: HOLD });
      }
      render();

      // Rail: jump to a step (time where that panel is centred, mid-hold).
      function onGo(e) {
        var i = parseInt(e.currentTarget.getAttribute('data-how-go'), 10) || 0;
        var st = tl.scrollTrigger;
        if (!st) return;
        var t = i === 0 ? HOLD / 2 : i * (1 + HOLD) + HOLD / 2;
        var y = st.start + (t / tl.duration()) * (st.end - st.start);
        if (PP.lenis) PP.lenis.scrollTo(y, { duration: 1.4 });
        else window.scrollTo({ top: y, behavior: 'smooth' });
      }
      steps.forEach(function (b) { b.addEventListener('click', onGo); });

      // The first screen settles onto the page as the stage arrives.
      var firstFrame = panels[0].querySelector('.how__frame');
      gsap.fromTo(firstFrame, { scale: 0.94, y: 48 }, {
        scale: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: stage, start: 'top bottom', end: 'top top', scrub: 0.8 },
      });

      // Load the visible-theme screens a little before the stage arrives so
      // panels never pop in mid-scrub.
      ScrollTrigger.create({
        trigger: sec, start: 'top bottom+=1200', once: true,
        onEnter: function () {
          sec.querySelectorAll('.how__img').forEach(function (img) {
            if (getComputedStyle(img).display !== 'none') img.loading = 'eager';
          });
        },
      });

      return function () {
        steps.forEach(function (b) {
          b.removeEventListener('click', onGo);
          b.classList.remove('is-active', 'is-past');
          b.removeAttribute('aria-current');
        });
        sec.classList.remove('how--pinned');
        var els = [track, fill, firstFrame];
        parts.forEach(function (p) { els.push(p.shot, p.num, p.text); });
        gsap.set(els.filter(Boolean), { clearProps: 'transform,opacity' });
      };
    }

    /* ---------- phones: vertical sequence, simple reveals ---------- */
    function stacked() {
      panels.forEach(function (p) {
        gsap.from(p.querySelectorAll('.how__num, .how__title, .how__copy, .how__tools'), {
          y: 24, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06,
          scrollTrigger: { trigger: p, start: 'top 84%', once: true },
        });
        var shot = p.querySelector('.how__shot');
        gsap.from(shot, {
          y: 36, opacity: 0, scale: 0.97, duration: 1.1, ease: 'expo.out',
          scrollTrigger: { trigger: shot, start: 'top 90%', once: true },
        });
      });
    }

    function revealCoda() {
      if (!coda) return;
      gsap.from(coda, {
        y: 20, opacity: 0, duration: 1, ease: 'expo.out',
        scrollTrigger: { trigger: coda, start: 'top bottom', once: true },
      });
    }
  });

  /* Heading: masked word rise (as the hero), then eyebrow + lead. */
  function headReveal(sec) {
    var title = sec.querySelector('.how__heading');
    var rest = sec.querySelectorAll('.how__eyebrow, .how__lead');
    var trig = function () { return { trigger: sec.querySelector('.how__head'), start: 'top 82%', once: true }; };
    gsap.from(rest, { y: 18, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.12, scrollTrigger: trig() });
    if (!title) return;
    if (window.SplitText) {
      SplitText.create(title, {
        type: 'lines,words',
        mask: 'lines',
        linesClass: 'how__line',
        autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.words, {
            yPercent: 110, duration: 1.1, stagger: 0.045, ease: 'expo.out',
            scrollTrigger: { trigger: title, start: 'top 85%', once: true },
          });
        },
      });
    } else {
      gsap.from(title, { y: 32, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: trig() });
    }
  }
})();
