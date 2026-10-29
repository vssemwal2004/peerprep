/* ==========================================================================
   Tracks — "Your path, drawn"
   - Tablist: click / Left / Right / Up / Down / Home / End (automatic
     activation), roving tabindex, aria-selected; one tabpanel whose
     aria-labelledby follows the selected tab. A sliding thumb marks the
     selected segment (4-up row or the 2x2 mobile grid).
   - The route: one SVG curve, rebuilt from the measured node positions on
     every resize (rising left→right on desktop, a straight rail on mobile).
   - Scroll-in: frames rise onto their baseline in sequence, the curve draws
     itself and fills each node as it reaches it; the last node pulses once.
   - Switch: the curve re-draws from the start; changed screens crossfade and
     slide (0.08s stagger); tool names and facts roll.
   - Reduced motion / no GSAP: instant switches, final states throughout.
   ========================================================================== */
(function () {
  'use strict';

  var SCREENS = {
    learning: { url: 'peerprep.co.in/learning', alt: 'Guided Learning: a Data Structures subject with chapter progress, a topic table and a video lesson' },
    coding: { url: 'peerprep.co.in/problems', alt: 'PrepCoding workspace: an accepted submission with runtime, memory and every test case passed' },
    assessment: { url: 'peerprep.co.in/assessments', alt: 'A company-based mock assessment in progress with a question palette, timer and monitoring panel' },
    interview: { url: 'peerprep.co.in/interviews', alt: 'AI voice mock interview with a follow-up question and the conversation transcript' },
    analytics: { url: 'peerprep.co.in/analytics', alt: 'Performance and readiness analytics with topic accuracy and a company benchmark that marks verified gaps' },
    resume: { url: 'peerprep.co.in/resume', alt: 'Resume builder with a document outline, quality checks and a live A4 preview' },
  };

  // Learn · Practice · Prove · Improve — [screen, tool] per stage.
  var TARGETS = {
    sde: {
      stages: [['learning', 'Guided Learning modules'], ['coding', 'PrepCoding by topic'], ['assessment', 'Company-based mock assessment'], ['analytics', 'Company benchmark gaps']],
      facts: { focus: 'Arrays · Graphs · DP', format: 'Coding + MCQ, timed', interview: 'AI + peer mocks' },
    },
    service: {
      stages: [['learning', 'OOP and DBMS modules'], ['coding', 'PrepCoding, Easy to Medium'], ['assessment', 'Mock and college assessments'], ['resume', 'Resume quality checks']],
      facts: { focus: 'Aptitude · OOP · DBMS', format: 'MCQ + coding sections', interview: 'Peer + AI mocks' },
    },
    analyst: {
      stages: [['learning', 'SQL and aptitude modules'], ['assessment', 'Timed mock assessments'], ['interview', 'AI voice mock interview'], ['analytics', 'Readiness trend and focus area']],
      facts: { focus: 'Aptitude · SQL · Data interpretation', format: 'MCQ + short answer, timed', interview: 'AI mocks with transcripts' },
    },
    intern: {
      stages: [['learning', 'Fundamentals, topic by topic'], ['coding', 'PrepCoding with Anvi hints'], ['resume', 'Resume builder, live preview'], ['interview', 'AI mock interview practice']],
      facts: { focus: 'Arrays · Strings · OOP basics', format: 'College and mock assessments', interview: 'Peer mocks, both roles' },
    },
  };

  var SVGNS = 'http://www.w3.org/2000/svg';

  PP.ready(function () {
    var root = document.getElementById('tracks');
    if (!root) return;

    var tablist = root.querySelector('[data-tracks-tablist]');
    var thumb = root.querySelector('[data-tracks-thumb]');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panel = root.querySelector('[data-tracks-panel]');
    var route = root.querySelector('[data-tracks-route]');
    var svg = root.querySelector('[data-tracks-curve]');
    var trackPath = root.querySelector('[data-tracks-track]');
    var linePath = root.querySelector('[data-tracks-line]');
    var stages = Array.prototype.slice.call(root.querySelectorAll('[data-tracks-stage]'));
    if (!tablist || !tabs.length || !panel || !route || !svg || stages.length !== 4) return;

    var st = stages.map(function (s) {
      return {
        el: s,
        node: s.querySelector('[data-tracks-node]'),
        shot: s.querySelector('.tracks__shot'),
        screen: s.querySelector('[data-tracks-screen]'),
        url: s.querySelector('[data-tracks-url]'),
        step: s.querySelector('.tracks__step'),
        tool: s.querySelector('[data-tracks-tool]'),
      };
    });
    var facts = {};
    Array.prototype.forEach.call(root.querySelectorAll('[data-tracks-fact]'), function (el) {
      facts[el.getAttribute('data-tracks-fact')] = el;
    });

    var animated = !!window.gsap && !PP.reducedMotion;
    var current = 0;
    var keyOf = function (i) { return tabs[i].getAttribute('data-target'); };
    var switchTl = null;
    var introTl = null;
    var introDone = !animated;
    var nodeFrac = [0.15, 0.4, 0.65, 0.9];

    root.classList.add('tracks--ready');
    if (animated) root.classList.add('tracks--anim');

    /* ---------- selector thumb ---------- */
    function placeThumb(i, animate) {
      if (!thumb) return;
      var t = tabs[i];
      var props = { x: t.offsetLeft, y: t.offsetTop, width: t.offsetWidth, height: t.offsetHeight };
      if (window.gsap) {
        gsap.to(thumb, Object.assign(props, { duration: animate && animated ? 0.6 : 0, ease: 'expo.out', overwrite: true }));
      } else {
        thumb.style.transform = 'translate(' + props.x + 'px,' + props.y + 'px)';
        thumb.style.width = props.width + 'px';
        thumb.style.height = props.height + 'px';
      }
    }

    /* ---------- the curve ---------- */
    // Catmull-Rom through the points, as cubic Béziers.
    function smoothPath(p) {
      var d = 'M' + p[0].x.toFixed(1) + ' ' + p[0].y.toFixed(1);
      for (var i = 0; i < p.length - 1; i++) {
        var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
        var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      return d;
    }

    function buildCurve() {
      var r = route.getBoundingClientRect();
      if (!r.width) return;
      var W = r.width, H = r.height;
      var pts = st.map(function (s) {
        var n = s.node.getBoundingClientRect();
        return { x: n.left + n.width / 2 - r.left, y: n.top + n.height / 2 - r.top };
      });
      var vertical = Math.abs(pts[3].x - pts[0].x) < 4;
      var all;
      if (vertical) {
        var lastBottom = st[3].el.getBoundingClientRect().bottom - r.top;
        all = [{ x: pts[0].x, y: pts[0].y }].concat(pts.slice(1), [{ x: pts[0].x, y: Math.min(H, lastBottom) }]);
      } else {
        // A growth curve: almost level at the start, steepening, easing out past the last node.
        var y0 = pts[0].y + (pts[0].y - pts[1].y) * 0.35;
        var yN = Math.max(2, pts[3].y - 8);
        all = [{ x: 0, y: y0 }].concat(pts, [{ x: W, y: yN }]);
      }
      var d = smoothPath(all);
      svg.setAttribute('viewBox', '0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1));
      svg.setAttribute('width', W.toFixed(1));
      svg.setAttribute('height', H.toFixed(1));
      trackPath.setAttribute('d', d);
      linePath.setAttribute('d', d);
      svg.removeAttribute('hidden');

      // Where along the line each node sits (0–1), so nodes fill as it arrives.
      try {
        var L = linePath.getTotalLength();
        var axis = vertical ? 'y' : 'x';
        var steps = 240, k = 0;
        nodeFrac = pts.map(function (p) {
          while (k < steps && linePath.getPointAtLength((k / steps) * L)[axis] < p[axis] - 0.5) k++;
          return k / steps;
        });
      } catch (e) { /* keep the defaults */ }
    }

    // Time (0–1) at which a power2.inOut tween reaches progress p.
    function inv(p) { return p < 0.5 ? Math.sqrt(p / 2) : 1 - Math.sqrt((1 - p) / 2); }

    function drawInto(tl, at, dur) {
      tl.fromTo(linePath, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, ease: 'power2.inOut' }, at);
      st.forEach(function (s, i) {
        tl.call(function () {
          s.node.classList.add('is-reached');
          if (i === st.length - 1) {
            s.node.classList.remove('is-pulse');
            void s.node.offsetWidth;
            s.node.classList.add('is-pulse');
          }
        }, null, at + dur * inv(nodeFrac[i]));
      });
    }

    function resetNodes() {
      st.forEach(function (s) { s.node.classList.remove('is-reached', 'is-pulse'); });
    }

    /* ---------- content ---------- */
    function makeLayer(id) {
      var s = SCREENS[id];
      var layer = document.createElement('div');
      layer.className = 'tracks__layer';
      layer.setAttribute('data-screen', id);
      ['light', 'dark'].forEach(function (theme) {
        var img = document.createElement('img');
        img.className = 'tracks__img tracks__img--' + theme;
        img.src = 'assets/screens/' + id + '-' + theme + '.webp';
        img.width = 1692; img.height = 1020;
        img.decoding = 'async';
        if (theme === 'light') img.alt = s.alt;
        else { img.alt = ''; img.setAttribute('aria-hidden', 'true'); }
        layer.appendChild(img);
      });
      return layer;
    }
    function layers(s) { return Array.prototype.slice.call(s.screen.querySelectorAll('.tracks__layer')); }

    // Put the DOM in the final, settled state for target `key`.
    function settle(key) {
      if (switchTl) { switchTl.kill(); switchTl = null; }
      var data = TARGETS[key];
      st.forEach(function (s, i) {
        var id = data.stages[i][0];
        var ls = layers(s);
        var keep = ls[ls.length - 1];
        ls.slice(0, -1).forEach(function (l) { l.remove(); });
        if (!keep || keep.getAttribute('data-screen') !== id) {
          if (keep) keep.remove();
          keep = makeLayer(id);
          s.screen.appendChild(keep);
        }
        s.url.textContent = SCREENS[id].url;
        s.tool.textContent = data.stages[i][1];
        if (window.gsap) gsap.set([keep, s.tool], { clearProps: 'transform,opacity,visibility' });
        s.node.classList.remove('is-pulse');
        s.node.classList.add('is-reached');
      });
      Object.keys(facts).forEach(function (f) {
        facts[f].textContent = data.facts[f];
        if (window.gsap) gsap.set(facts[f], { clearProps: 'transform' });
      });
      if (window.gsap) gsap.set(linePath, { strokeDashoffset: 0 });
    }

    function roll(tl, el, text, at) {
      tl.to(el, { yPercent: -110, duration: 0.32, ease: 'power2.in' }, at)
        .call(function () { el.textContent = text; }, null, at + 0.32)
        .fromTo(el, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: 'expo.out', immediateRender: false }, at + 0.32);
    }

    function transitionTo(prevKey, key) {
      settle(prevKey);
      var data = TARGETS[key];
      var tl = gsap.timeline({ onComplete: function () { if (switchTl === tl) switchTl = null; } });
      switchTl = tl;

      resetNodes();
      gsap.set(linePath, { strokeDashoffset: 1 });
      drawInto(tl, 0.15, 1.2);

      st.forEach(function (s, i) {
        var at = i * 0.08;
        var id = data.stages[i][0];
        var old = layers(s).pop();
        if (!old || old.getAttribute('data-screen') !== id) {
          var next = makeLayer(id);
          s.screen.appendChild(next);
          tl.fromTo(next, { yPercent: 9, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.85, ease: 'expo.out' }, at + 0.05);
          if (old) {
            tl.to(old, { yPercent: -5, autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, at)
              .call(function () { old.remove(); }, null, at + 0.9);
          }
          tl.call(function () { s.url.textContent = SCREENS[id].url; }, null, at + 0.2);
        }
        if (s.tool.textContent !== data.stages[i][1]) roll(tl, s.tool, data.stages[i][1], at);
      });
      Object.keys(facts).forEach(function (f, i) {
        if (facts[f].textContent !== data.facts[f]) roll(tl, facts[f], data.facts[f], 0.1 + i * 0.08);
      });
    }

    /* ---------- selection ---------- */
    function select(i, focus) {
      if (i < 0 || i >= tabs.length) return;
      if (focus) tabs[i].focus();
      if (i === current) return;
      var prevKey = keyOf(current);
      current = i;
      tabs.forEach(function (t, k) {
        t.setAttribute('aria-selected', String(k === i));
        t.tabIndex = k === i ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', tabs[i].id);
      placeThumb(i, true);

      if (!animated) { settle(keyOf(i)); return; }
      if (!introDone) finishIntro();
      transitionTo(prevKey, keyOf(i));
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i, false); });
    });
    tablist.addEventListener('keydown', function (e) {
      var n = tabs.length, next = null;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': next = (current + 1) % n; break;
        case 'ArrowLeft': case 'ArrowUp': next = (current - 1 + n) % n; break;
        case 'Home': next = 0; break;
        case 'End': next = n - 1; break;
      }
      if (next === null) return;
      e.preventDefault();
      select(next, true);
    });

    /* ---------- layout ---------- */
    var raf = 0;
    function relayout() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { placeThumb(current, false); buildCurve(); });
    }
    placeThumb(current, false);
    buildCurve();
    window.addEventListener('resize', relayout);
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(route);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

    if (!animated) return;

    /* ---------- warm the other screens once the section is near ---------- */
    var warmed = false;
    function warm() {
      if (warmed) return;
      warmed = true;
      var theme = PP.theme();
      Object.keys(SCREENS).forEach(function (id) { var im = new Image(); im.decoding = 'async'; im.src = 'assets/screens/' + id + '-' + theme + '.webp'; });
    }
    tablist.addEventListener('pointerenter', warm, { once: true });
    tablist.addEventListener('focusin', warm, { once: true });

    /* ---------- heading reveal ---------- */
    var title = root.querySelector('.tracks__title');
    if (window.SplitText && window.ScrollTrigger && title) {
      SplitText.create(title, {
        type: 'lines,words',
        mask: 'lines',
        linesClass: 'tracks-line',
        autoSplit: true,
        onSplit: function (self) {
          return gsap.from(self.words, {
            yPercent: 110, duration: 1.1, stagger: 0.05, ease: 'expo.out',
            scrollTrigger: { trigger: title, start: 'top 86%', once: true },
          });
        },
      });
    }

    /* ---------- head + selector fade up (JS-owned so nothing hides without JS) ---------- */
    var headBits = [root.querySelector('.tracks__eyebrow'), root.querySelector('.tracks__lead'), tablist].filter(Boolean);
    if (window.ScrollTrigger) {
      gsap.set(headBits, { y: 24, autoAlpha: 0 });
      ScrollTrigger.create({
        trigger: root.querySelector('.tracks__head'),
        start: 'top 86%',
        once: true,
        onEnter: function () {
          gsap.to(headBits, {
            y: 0, autoAlpha: 1, duration: 1, ease: 'expo.out', stagger: 0.12,
            onComplete: function () { gsap.set(headBits, { clearProps: 'transform,opacity,visibility' }); placeThumb(current, false); },
          });
        },
      });
    }

    /* ---------- scroll-in: frames rise, the route draws ---------- */
    var shots = st.map(function (s) { return s.shot; });
    var captions = [];
    st.forEach(function (s) { captions.push(s.step, s.tool.parentNode.parentNode); });

    function finishIntro() {
      introDone = true;
      if (introTl) introTl.progress(1).kill();
      introTl = null;
      gsap.set(shots.concat(captions), { clearProps: 'transform,opacity,visibility' });
      if (trigger) trigger.kill();
    }

    resetNodes();
    gsap.set(linePath, { strokeDashoffset: 1 });
    gsap.set(shots, { y: 56, autoAlpha: 0 });
    gsap.set(captions, { y: 14, autoAlpha: 0 });

    function playIntro() {
      if (introDone) return;
      introDone = true;
      warm();
      var tl = gsap.timeline({
        onComplete: function () {
          introTl = null;
          gsap.set(shots.concat(captions), { clearProps: 'transform,opacity,visibility' });
        },
      });
      introTl = tl;
      tl.to(shots, { y: 0, autoAlpha: 1, duration: 1.1, ease: 'expo.out', stagger: 0.12 }, 0)
        .to(captions, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'expo.out', stagger: 0.06 }, 0.25);
      drawInto(tl, 0.35, 1.6);
    }

    var trigger = null;
    if (window.ScrollTrigger) {
      trigger = ScrollTrigger.create({ trigger: route, start: 'top 78%', once: true, onEnter: playIntro });
      // Loaded already past the section (e.g. a deep link below it): show it settled.
      if (route.getBoundingClientRect().bottom < 0) { playIntro(); if (introTl) introTl.progress(1); }
    } else {
      playIntro();
    }
  });
})();
