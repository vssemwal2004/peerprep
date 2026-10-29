/* ==========================================================================
   PP.device(container, options) — realistic laptop that plays demo scenes.

   var dev = PP.device(el, {
     scene: 'dashboard',      // first scene id (from PP.demos)
     autoplay: true,          // play when visible (never with reduced motion)
     loop: true,              // restart the scene when it ends (ignored if onComplete set)
     onComplete: fn(id),      // called when a scene's timeline ends (e.g. advance to next)
     lidOpen: false,          // scrub a gentle tilt as the device scrolls into view
     base3d: false,           // full 3D laptop: lid back + keyboard deck + floor, so the
                              // caller can animate --lid (-90deg closed → 0 open), --tilt,
                              // --lift and --boot (screen power-on overlay, 1 → 0)
     label: 'PeerPrep student dashboard'   // accessible name
   });
   dev.show('coding');  dev.play();  dev.pause();  dev.el;  dev.stage;  dev.current

   A [data-media-src] on the container (or opts.media[id]) swaps a scripted
   scene for a real screen recording (mp4/webm/gif/webp).
   ========================================================================== */
(function () {
  'use strict';

  var W = 1360;
  var H_FLAT = 880;
  var H_3D = 940; // room for the keyboard deck seen slightly from above

  var ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    learning: '<path d="M2 6.5 12 3l10 3.5-10 3.5z"/><path d="M6 8.5V14c0 1.7 2.7 3 6 3s6-1.3 6-3V8.5"/>',
    coding: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    assessments: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    interviews: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
    analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    resume: '<path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z"/><path d="M14 2.5v5h5M9 13h6M9 17h4"/>',
    challenges: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  };
  var NAV = ['dashboard', 'learning', 'coding', 'assessments', 'interviews', 'analytics', 'resume', 'challenges'];
  var NAV_LABEL = {
    dashboard: 'Dashboard', learning: 'Learning', coding: 'PrepCoding', assessments: 'Assessments',
    interviews: 'Interviews', analytics: 'Analytics', resume: 'Resume', challenges: 'Challenges',
  };

  function svg(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }

  function template(base3d) {
    var nav = NAV.map(function (id) {
      return '<span class="app__nav" data-nav="' + id + '" title="' + NAV_LABEL[id] + '">' + svg(ICONS[id]) + '</span>';
    }).join('');
    var mark =
      '<img class="device__logo device__logo--light" src="assets/mark-light.png" alt="" width="99" height="99" />' +
      '<img class="device__logo device__logo--dark" src="assets/mark-dark.png" alt="" width="99" height="99" />';
    return (
      '<div class="device__scaler"><div class="device__body">' +
        '<div class="device__floor"></div>' +
        (base3d
          ? '<div class="device__deck-top"><span class="device__keys"></span><span class="device__pad"></span></div>'
          : '') +
        '<div class="device__lid">' +
          (base3d ? '<div class="device__lid-back">' + mark + '</div>' : '') +
          '<div class="device__lid-front"><span class="device__camera"></span>' +
          '<div class="device__screen">' +
            (base3d ? '<div class="device__boot">' + mark + '<span class="device__boot-bar"><i></i></span></div>' : '') +
            '<div class="app-browser">' +
              '<div class="app-browser__lights"><i></i><i></i><i></i></div>' +
              '<div class="app-browser__url">' + svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>') +
                '<b>peerprep.co.in</b><span data-dev-route></span></div>' +
              '<div></div>' +
            '</div>' +
            '<div class="app">' +
              '<nav class="app__side">' +
                '<img class="app__mark app__mark--light" src="assets/mark-light.png" alt="" width="32" height="32" />' +
                '<img class="app__mark app__mark--dark" src="assets/mark-dark.png" alt="" width="32" height="32" />' +
                nav +
                '<span class="app__avatar">AS</span>' +
              '</nav>' +
              '<div class="app__top">' +
                '<span class="app__title" data-dev-title></span>' +
                '<span class="app__search">' + svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>') + 'Search problems, topics, companies</span>' +
                '<span class="app__bell">' + svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>') + '</span>' +
                '<span class="app__me">AS</span>' +
              '</div>' +
              '<div class="demo-root" data-dev-stage></div>' +
            '</div>' +
          '</div>' +
          '</div>' +
        '</div>' +
        '<div class="device__hinge"></div>' +
        '<div class="device__deck"><span class="device__notch"></span></div>' +
        '<div class="device__feet"></div>' +
      '</div></div>'
    );
  }

  PP.device = function (container, opts) {
    opts = opts || {};
    container.classList.add('device');
    if (opts.base3d) container.classList.add('device--3d');
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', opts.label || 'PeerPrep product walkthrough');
    container.innerHTML = template(!!opts.base3d);
    var H = opts.base3d ? H_3D : H_FLAT;

    var scaler = container.querySelector('.device__scaler');
    var stage = container.querySelector('[data-dev-stage]');
    var routeEl = container.querySelector('[data-dev-route]');
    var titleEl = container.querySelector('[data-dev-title]');
    var navEls = container.querySelectorAll('[data-nav]');
    var autoplay = opts.autoplay !== false && !PP.reducedMotion;
    var tl = null;
    var visible = false;
    var wantPlay = autoplay;
    var api = {
      el: container, stage: stage, current: null,
      // Elements that consume the scrubbed --tilt/--lift/--dscale, --lid,
      // --boot and --boot-bar (registered non-inherited in device.css).
      parts: {
        body: container.querySelector('.device__body'),
        lid: container.querySelector('.device__lid'),
        boot: container.querySelector('.device__boot'),
        bootBar: container.querySelector('.device__boot-bar i'),
      },
    };

    // ---- scale to container ----
    function fit() {
      var s = container.clientWidth / W;
      scaler.style.transform = 'scale(' + s + ')';
      container.style.height = (H * s).toFixed(1) + 'px';
    }
    fit();
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(container);
    else addEventListener('resize', fit);

    // ---- scenes ----
    function mediaFor(id) {
      if (opts.media && opts.media[id]) return opts.media[id];
      return container.getAttribute('data-media-src-' + id) || null;
    }

    // Each scene is built once into its own .demo-scene wrapper and kept.
    // Rebuilding the DOM and timeline on every chapter change cost 70-150 ms
    // of main-thread work in the middle of a scroll.
    var built = {};   // id -> { root, tl }
    var active = null;

    function build(id) {
      if (built[id]) return built[id];
      var def = PP.demos.get(id);
      var root = document.createElement('div');
      root.className = 'demo-scene demo-' + id + ' is-idle';
      stage.appendChild(root);
      var scene = built[id] = { root: root, tl: null };
      var media = mediaFor(id);
      if (media) {
        root.innerHTML = /\.(mp4|webm)$/i.test(media)
          ? '<video class="demo-media" src="' + media + '" muted loop playsinline></video>'
          : '<img class="demo-media" src="' + media + '" alt="" />';
        return scene;
      }
      if (!def || !window.gsap) return scene;
      try {
        scene.tl = def.create(root) || null;
      } catch (e) {
        console.error('[PP.device] scene failed:', id, e);
        return scene;
      }
      if (!scene.tl) return scene;
      scene.tl.pause();
      scene.tl.eventCallback('onComplete', function () {
        if (api.current !== id) return;
        if (opts.onComplete) opts.onComplete(id);
        else if (opts.loop !== false) setTimeout(function () { if (api.current === id && tl) tl.restart(); }, 400);
      });
      return scene;
    }

    function activeVideo() { return active && active.root.querySelector('video'); }

    function mount(id) {
      var def = PP.demos.get(id);
      if (active) {
        active.root.classList.add('is-idle');
        if (active.tl) active.tl.pause();
        var prev = activeVideo();
        if (prev) prev.pause();
      }
      api.current = id;
      if (def) {
        routeEl.textContent = def.route || '';
        titleEl.textContent = def.title || '';
        navEls.forEach(function (n) { n.classList.toggle('is-active', n.getAttribute('data-nav') === def.nav); });
        container.setAttribute('aria-label', (opts.label ? opts.label + ' — ' : '') + (def.description || def.title || ''));
      }
      active = build(id);
      active.root.classList.remove('is-idle');
      tl = active.tl;
      var video = activeVideo();
      if (video && autoplay && wantPlay && visible) video.play();
      if (!tl) return;
      // Same state a freshly built scene had: time 0, playing only if wanted.
      if (PP.reducedMotion) tl.progress(1).pause();
      else {
        tl.restart();
        if (!(wantPlay && visible)) tl.pause();
      }
    }

    api.show = function (id) {
      if (!api.current || PP.reducedMotion) { mount(id); return; }
      stage.classList.add('is-swapping');
      setTimeout(function () { mount(id); stage.classList.remove('is-swapping'); }, 250);
    };
    api.play = function () { wantPlay = true; if (tl && visible) tl.play(); var v = activeVideo(); if (v) v.play(); };
    api.pause = function () { wantPlay = false; if (tl) tl.pause(); var v = activeVideo(); if (v) v.pause(); };

    // Builds scenes ahead of time in idle slots, and never while the page is
    // scrolling, so the first visit to a chapter does not pay for its DOM.
    var lastScroll = 0;
    addEventListener('scroll', function () { lastScroll = performance.now(); }, { passive: true });
    api.prepare = function (ids) {
      var queue = ids.filter(function (id) { return !built[id] && PP.demos.get(id); });
      var idle = window.requestIdleCallback
        ? function (fn) { requestIdleCallback(fn, { timeout: 3000 }); }
        : function (fn) { setTimeout(fn, 300); };
      function next() {
        if (!queue.length) return;
        if (performance.now() - lastScroll < 400) { setTimeout(function () { idle(next); }, 400); return; }
        build(queue.shift());
        idle(next);
      }
      idle(next);
    };
    api.isPlaying = function () { return wantPlay; };
    api.timeline = function () { return tl; };

    // ---- play only while visible ----
    function sync() {
      if (!tl) return;
      if (wantPlay && visible && !document.hidden) tl.play();
      else tl.pause();
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; sync(); }, { threshold: 0.15 }).observe(container);
    } else visible = true;
    document.addEventListener('visibilitychange', sync);

    // ---- lid opening on scroll ----
    if (opts.lidOpen && window.gsap && window.ScrollTrigger && !PP.reducedMotion) {
      // The laptop leans back (screen facing up, seen from above) and settles
      // upright as it scrolls into view — like lifting a lid toward you.
      gsap.fromTo(api.parts.body,
        { '--tilt': '24deg' },
        {
          '--tilt': '0deg', ease: 'none',
          scrollTrigger: { trigger: container, start: 'top 100%', end: 'top 25%', scrub: 0.6 },
        });
    }

    if (opts.scene) mount(opts.scene);
    return api;
  };
})();
