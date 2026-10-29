/* ==========================================================================
   Showcase — "the theatre". One PP.device laptop plays the student
   walkthroughs, one chapter per feature.

   >= 900px with motion: the stage is pinned and scroll drives the chapters.
   Each chapter owns SEG viewport-heights of scroll; crossing into one swaps
   the laptop's scene (crossfade + a slight slide in the scroll direction),
   the caption and the chapter bar, whose active line fills with the scroll
   position inside the chapter. While the reader rests, the scene loops.
   Clicking a chapter (or arrow keys on the tablist) scrolls to its segment.

   < 900px with motion: a normal tablist; scenes auto-advance on completion
   and the active line shows real playback progress.
   Reduced motion: no pin, no autoplay — each chapter shows its final frame.
   ========================================================================== */
(function () {
  'use strict';

  var ORDER = ['learning', 'coding', 'anvi', 'assessment', 'interview', 'analytics', 'resume'];
  var SEG = 0.72;          // viewport heights of scroll per chapter (pinned)
  var LOOP_GAP = 700;      // ms between loops of a resting chapter

  function pad(v) { return (v < 10 ? '0' : '') + v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  PP.ready(function () {
    var root = document.getElementById('showcase');
    if (!root) return;

    var pinEl = root.querySelector('[data-showcase-pin]');
    var tablist = root.querySelector('[data-showcase-tabs]');
    var panel = root.querySelector('#showcase-panel');
    var deviceEl = root.querySelector('[data-showcase-device]');
    var capWrap = root.querySelector('[data-showcase-captions]');
    var toggle = root.querySelector('[data-showcase-play]');
    var reduced = PP.reducedMotion;
    var hasGSAP = !!window.gsap;
    var motion = hasGSAP && !reduced;

    /* ---------- scenes: fixed order, skip anything not registered ---------- */
    var scenes = [];
    ORDER.forEach(function (id) {
      var tab = tablist.querySelector('[data-scene="' + id + '"]');
      var cap = capWrap.querySelector('[data-cap="' + id + '"]');
      var hasMedia = deviceEl.hasAttribute('data-media-src-' + id);
      if (!tab) return;
      if (!(PP.demos && PP.demos.get(id)) && !hasMedia) {
        tab.remove();
        if (cap) cap.remove();
        return;
      }
      scenes.push({
        id: id, tab: tab, cap: cap,
        fill: tab.querySelector('.showcase__line i'),
        parts: cap ? cap.querySelectorAll('.showcase__kicker, .showcase__cap-text, .showcase__feats li') : [],
      });
    });

    var n = scenes.length;
    if (!n || !PP.device) {
      [tablist, capWrap, root.querySelector('.showcase__meta')].forEach(function (el) { if (el) el.hidden = true; });
      return;
    }
    tablist.style.setProperty('--chapters', n);
    scenes.forEach(function (s, i) {
      var num = s.tab.querySelector('[data-num]');
      if (num) num.textContent = pad(i + 1);
      var capNum = s.cap && s.cap.querySelector('[data-cap-num]');
      if (capNum) capNum.textContent = pad(i + 1);
      if (s.cap) s.cap.hidden = false;   // JS controls visibility via .is-active
    });
    if (n < 2) tablist.hidden = true;
    // Keep the lead's count honest if a scene is missing.
    var WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
    var countEl = root.querySelector('[data-showcase-count]');
    if (countEl && WORDS[n - 1]) countEl.textContent = WORDS[n - 1];

    /* ---------- state ---------- */
    var idx = 0;
    var mode = 'static';        // 'static' | 'pinned'
    var userPaused = reduced;   // reduced motion: no autoplay
    var st = null;              // pinned ScrollTrigger
    var jumpTarget = null;      // chapter a click/key is scrolling to
    var jumpTimer = 0;
    var swapTimer = 0;
    var shownId = scenes[0].id;

    var dev = PP.device(deviceEl, {
      scene: scenes[0].id,
      autoplay: !reduced,
      onComplete: onSceneEnd,
      label: 'PeerPrep student walkthrough',
    });

    function onSceneEnd(id) {
      // Reduced motion seeks to the final frame on mount (which fires
      // onComplete): a replay started with Play ends here — show "Play" again.
      if (reduced) { if (!userPaused) { userPaused = true; syncToggle(); } return; }
      if (userPaused || id !== scenes[idx].id) return;
      if (mode === 'pinned') {
        // Resting inside a chapter: keep its visualisation running.
        setTimeout(function () {
          var tl = dev.timeline();
          if (mode === 'pinned' && !userPaused && dev.current === id && tl) tl.restart();
        }, LOOP_GAP);
        return;
      }
      go(idx + 1, { auto: true });
    }

    /* ---------- chrome ---------- */
    function setFill(s, v) {
      if (!s.fill) return;
      var t = 'scaleX(' + v.toFixed(4) + ')';
      if (s.fill.style.transform !== t) s.fill.style.transform = t;
    }

    function select(i, dir) {
      scenes.forEach(function (s, j) {
        var on = j === i;
        s.tab.setAttribute('aria-selected', String(on));
        s.tab.tabIndex = on ? 0 : -1;
        if (s.cap) {
          var was = s.cap.classList.contains('is-active');
          s.cap.classList.toggle('is-active', on);
          s.cap.setAttribute('aria-hidden', String(!on));
          if (on && !was && motion) {
            // Kicker, headline, then the three sub-feature lines.
            gsap.fromTo(s.parts, { y: 14 * (dir || 1), opacity: 0 }, {
              y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.055, overwrite: true,
            });
          }
        }
        if (mode !== 'pinned') setFill(s, on && reduced ? 1 : 0);
      });
      panel.setAttribute('aria-labelledby', scenes[i].tab.id);
      if (scenes[i].cap) panel.setAttribute('aria-describedby', scenes[i].cap.id);
      else panel.removeAttribute('aria-describedby');
    }

    function keepInView(tab) {
      if (tablist.scrollWidth <= tablist.clientWidth + 2) return;
      var left = tab.offsetLeft - parseFloat(getComputedStyle(tablist).paddingLeft || 0);
      try { tablist.scrollTo({ left: left, behavior: reduced ? 'auto' : 'smooth' }); }
      catch (e) { tablist.scrollLeft = left; }
    }

    /* Scene swap: device.show() crossfades the screen (250 ms out, mount, in);
       the content also slides a few pixels in the scroll direction so the
       change reads as physical. Debounced while pinned so a fast scroll past
       several chapters only mounts the one it lands on. */
    function swapScene(i, dir, delay) {
      var id = scenes[i].id;
      clearTimeout(swapTimer);
      swapTimer = setTimeout(function () {
        // Compare with what was last requested, not dev.current: show()
        // mounts 250 ms later, so a quick back-and-forth must not be skipped.
        if (shownId === id) { if (!userPaused) dev.play(); return; }
        shownId = id;
        dev.show(id);
        if (motion) {
          var stage = dev.stage;
          gsap.killTweensOf(stage);
          gsap.timeline()
            .to(stage, { y: -10 * dir, scale: 0.992, duration: 0.25, ease: 'power2.in' })
            .fromTo(stage, { y: 18 * dir, scale: 0.985 }, { y: 0, scale: 1, duration: 0.9, ease: 'expo.out' }, 0.26)
            .set(stage, { clearProps: 'transform' });
        }
        if (!userPaused) dev.play();
      }, delay || 0);
    }

    // Static mode: select + swap immediately.
    function go(i, opts) {
      opts = opts || {};
      var next = ((i % n) + n) % n;
      var dir = next >= idx ? 1 : -1;
      idx = next;
      select(idx, dir);
      keepInView(scenes[idx].tab);
      if (!opts.auto && !reduced && userPaused) { userPaused = false; }
      swapScene(idx, dir, 0);
      syncToggle();
    }

    // Pinned mode: scroll to the start of chapter i's segment.
    function scrollToChapter(i) {
      if (!st) return;
      i = Math.max(0, Math.min(n - 1, i));
      var len = st.end - st.start;
      var y = Math.round(st.start + ((i + 0.04) / n) * len) + 1;
      if (userPaused) { userPaused = false; syncToggle(); }
      jumpTarget = i;
      clearTimeout(jumpTimer);
      var dist = Math.abs(i - idx);
      var dur = Math.min(2.2, 0.9 + 0.22 * dist);
      jumpTimer = setTimeout(function () { jumpTarget = null; landed(); }, dur * 1000 + 400);
      if (PP.lenis) {
        PP.lenis.scrollTo(y, { duration: dur, onComplete: function () { jumpTarget = null; landed(); } });
      } else {
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }
    function landed() { if (mode === 'pinned') swapScene(idx, 1, 0); }

    function syncToggle() {
      toggle.textContent = userPaused ? 'Play' : 'Pause';
      toggle.setAttribute('data-state', userPaused ? 'paused' : 'playing');
      toggle.setAttribute('aria-label', (userPaused ? 'Play' : 'Pause') + ' walkthrough');
    }

    toggle.addEventListener('click', function () {
      userPaused = !userPaused;
      if (userPaused) { dev.pause(); syncToggle(); return; }
      dev.play();
      var tl = dev.timeline();
      // Finished (e.g. the reduced-motion final frame): replay this chapter.
      if (tl && tl.progress() >= 1) tl.restart();
      syncToggle();
    });

    /* ---------- tabs: click + roving keyboard ---------- */
    function activate(i) {
      if (mode === 'pinned') scrollToChapter(i);
      else go(i);
    }
    scenes.forEach(function (s, i) {
      s.tab.addEventListener('click', function () { activate(i); });
    });
    tablist.addEventListener('keydown', function (e) {
      var k = e.key;
      var base = mode === 'pinned' && jumpTarget !== null ? jumpTarget : idx;
      var next = null;
      if (k === 'ArrowRight' || k === 'ArrowDown') next = base + 1;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') next = base - 1;
      else if (k === 'Home') next = 0;
      else if (k === 'End') next = n - 1;
      if (next === null) return;
      e.preventDefault();
      if (mode === 'pinned') {
        next = Math.max(0, Math.min(n - 1, next));
        scrollToChapter(next);
        scenes[next].tab.tabIndex = 0;
        try { scenes[next].tab.focus({ preventScroll: true }); } catch (err) { scenes[next].tab.focus(); }
      } else {
        go(next);
        try { scenes[idx].tab.focus({ preventScroll: true }); } catch (err) { scenes[idx].tab.focus(); }
      }
    });

    /* ---------- static mode: progress line from the real timeline ---------- */
    var lastP = -1;
    function tick() {
      if (mode === 'pinned') return;
      var s = scenes[idx];
      var tl = dev.current === s.id ? dev.timeline() : null;
      var p = tl ? clamp01(tl.progress()) : 0;
      if (reduced) p = 1;
      if (Math.abs(p - lastP) > 0.0005) { lastP = p; setFill(s, p); }
    }
    if (hasGSAP) gsap.ticker.add(tick);
    else setInterval(tick, 250);

    select(0, 1);
    syncToggle();
    tick();

    // Scrolling chapter row (phones): edge fades drop at each end.
    function syncEdge() {
      var max = tablist.scrollWidth - tablist.clientWidth;
      tablist.classList.toggle('is-scrolled', tablist.scrollLeft > 2);
      tablist.classList.toggle('is-end', max <= 2 || tablist.scrollLeft >= max - 2);
    }
    tablist.addEventListener('scroll', syncEdge, { passive: true });
    addEventListener('resize', syncEdge);
    syncEdge();

    if (!motion || !window.ScrollTrigger) return;

    /* ---------- desktop: pinned, scroll-driven chapters ---------- */
    var mm = gsap.matchMedia();
    mm.add('(min-width: 900px)', function () {
      mode = 'pinned';
      root.classList.add('showcase--pinned');

      function render(self) {
        var x = clamp01(self.progress) * n;
        var i = Math.min(n - 1, Math.floor(x));
        var local = clamp01(x - i);
        scenes.forEach(function (s, j) { setFill(s, j < i ? 1 : j === i ? local : 0); });
        if (i === idx) return;
        var dir = i > idx ? 1 : -1;
        idx = i;
        select(i, dir);
        // During a click/key jump, only the destination scene is mounted.
        if (jumpTarget === null || jumpTarget === i) swapScene(i, dir, jumpTarget === null ? 140 : 0);
      }

      st = ScrollTrigger.create({
        trigger: pinEl,
        start: 'top top',
        end: function () { return '+=' + Math.round(innerHeight * SEG * n); },
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: render,
        onRefresh: render,
      });
      render(st);

      // Nav links to #showcase: core.js scrolls to the section with a -72px
      // header offset, which would stop short of the pin with the chapter bar
      // cut off. This listener runs after core's, so its target wins: land
      // exactly where the pin engages (chapter 01, whole stage in view).
      function onAnchor(e) {
        var a = e.target.closest && e.target.closest('a[href="#showcase"]');
        if (!a || !st || !PP.lenis) return;
        jumpTarget = null;
        PP.lenis.scrollTo(Math.ceil(st.start) + 1);
      }
      document.addEventListener('click', onAnchor);

      // A section above can change height after load (fonts, images, a
      // late-settling layout) without a ScrollTrigger refresh; the pin then
      // engages late and the stage visibly jumps. Watch everything above and
      // re-measure when it really changes.
      var ro = null, roTimer = 0, heights = new Map();
      if ('ResizeObserver' in window) {
        ro = new ResizeObserver(function (entries) {
          var changed = false;
          entries.forEach(function (en) {
            var h = Math.round(en.target.getBoundingClientRect().height);
            if (heights.has(en.target) && Math.abs(heights.get(en.target) - h) > 1) changed = true;
            heights.set(en.target, h);
          });
          if (!changed) return;
          clearTimeout(roTimer);
          roTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 120);
        });
        for (var el = root.previousElementSibling; el; el = el.previousElementSibling) ro.observe(el);
      }

      return function () {
        document.removeEventListener('click', onAnchor);
        if (ro) ro.disconnect();
        clearTimeout(roTimer);
        st = null;
        jumpTarget = null;
        mode = 'static';
        root.classList.remove('showcase--pinned');
        lastP = -1;
        scenes.forEach(function (s, j) { setFill(s, 0); });
        if (!userPaused) dev.play();
      };
    });

    /* ---------- entrance: heading lines, then the laptop rises once ---------- */
    var title = root.querySelector('.showcase__title');
    var head = root.querySelectorAll('.showcase__head .eyebrow, .showcase__lead');
    var trigger = { trigger: root, start: 'top 72%', once: true };

    if (window.SplitText && title) {
      SplitText.create(title, {
        type: 'lines,words',
        mask: 'lines',
        linesClass: 'showcase-line',
        autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.words, { yPercent: 110, duration: 1.2, stagger: 0.05, ease: 'expo.out', scrollTrigger: trigger });
        },
      });
    } else if (title) {
      gsap.from(title, { y: 32, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: trigger });
    }
    gsap.from(head, { y: 16, opacity: 0, duration: 1, stagger: 0.1, ease: 'expo.out', delay: 0.15, scrollTrigger: trigger });

    // The chapter bar enters with the laptop (not on its own trigger), so it
    // is never still hidden while the walkthrough it controls is on screen.
    gsap.timeline({
      defaults: { ease: 'expo.out' },
      scrollTrigger: { trigger: root, start: 'top 80%', once: true },
    })
      .from(root.querySelector('.showcase__stage'), { y: 40, opacity: 0, duration: 1.2 }, 0)
      .from([tablist, capWrap, root.querySelector('.showcase__meta')], { y: 16, opacity: 0, duration: 1, stagger: 0.08 }, 0.3);
  });
})();
