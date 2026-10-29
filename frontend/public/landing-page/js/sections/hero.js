/* Hero: a fully-open dashboard with an automatic, cursor-led product tour.
   The tour is time based rather than scroll based, so it behaves consistently
   with a mouse, touch, keyboard, and browsers without scroll-timeline APIs. */
(function () {
  'use strict';

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
        label: 'PeerPrep student dashboard live walkthrough',
      });
    }
    if (dev) dashboardTour(hero, dev);

    var field = hero.querySelector('[data-hero-field]');
    if (field && field.getContext) lineField(field, hero);
    factsReveal(hero);

    // CSS owns the entrance so the headline never depends on an animation CDN.
    // Mark the first viewport ready in the same DOM-ready task. Waiting for a
    // later frame briefly exposed only the dark page background on slow CPUs.
    hero.classList.add('is-ready');
  });

  function factsReveal(hero) {
    var facts = hero.querySelector('[data-hero-facts]');
    if (!facts) return;
    var cards = [].slice.call(facts.querySelectorAll('[data-hero-fact]'));
    var trust = hero.querySelector('.hero__trust');
    var played = false;

    hero.classList.add('hero--facts-ready');

    function format(value) {
      return value.toLocaleString ? value.toLocaleString('en-US') : String(value);
    }

    function count(el, delay) {
      var target = parseInt(el.getAttribute('data-hero-count'), 10);
      if (!target || PP.reducedMotion) { el.textContent = format(target || 0); return; }
      window.setTimeout(function () {
        var started = performance.now();
        var duration = target > 100 ? 1150 : 900;
        el.textContent = '0';
        function frame(now) {
          var progress = Math.min(1, (now - started) / duration);
          var eased = 1 - Math.pow(1 - progress, 4);
          el.textContent = format(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }, delay);
    }

    function reveal() {
      if (played) return;
      played = true;
      cards.forEach(function (card, i) {
        var delay = PP.reducedMotion ? 0 : i * 95;
        window.setTimeout(function () { card.classList.add('is-visible'); }, delay);
        var counter = card.querySelector('[data-hero-count]');
        if (counter) count(counter, delay + 90);
      });
      if (trust) window.setTimeout(function () { trust.classList.add('is-visible'); }, PP.reducedMotion ? 0 : cards.length * 95 + 80);
    }

    if (PP.reducedMotion || !('IntersectionObserver' in window)) { reveal(); return; }
    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      reveal();
    }, { threshold: .22, rootMargin: '0px 0px -8% 0px' });
    observer.observe(facts);
  }

  function dashboardTour(hero, dev) {
    var marks = [].slice.call(hero.querySelectorAll('.hero__mark'));
    var notes = [].slice.call(hero.querySelectorAll('.hero__note-item'));
    var cursor = hero.querySelector('[data-hero-cursor]');
    var selectors = ['.dm-dashboard__continue', '.dm-dashboard__challenge', '.dm-dashboard__prep'];
    var index = -1;
    var timer = 0;
    var visible = true;

    hero.classList.add('is-auto-tour');

    function placeMarks() {
      var screen = dev.el.querySelector('.device__screen');
      if (!screen || !screen.offsetWidth) return;
      var sw = screen.offsetWidth;
      var sh = screen.offsetHeight;
      var pad = 7;
      selectors.forEach(function (selector, i) {
        var card = dev.el.querySelector(selector);
        var mark = marks[i];
        if (!card || !mark) return;
        var x = 0;
        var y = 0;
        var node = card;
        while (node && node !== screen) {
          x += node.offsetLeft;
          y += node.offsetTop;
          node = node.offsetParent;
        }
        if (node !== screen) return;
        mark.style.left = ((x - pad) / sw * 100).toFixed(3) + '%';
        mark.style.top = ((y - pad) / sh * 100).toFixed(3) + '%';
        mark.style.width = ((card.offsetWidth + pad * 2) / sw * 100).toFixed(3) + '%';
        mark.style.height = ((card.offsetHeight + pad * 2) / sh * 100).toFixed(3) + '%';
      });
      show(index < 0 ? 0 : index);
    }

    function show(next) {
      index = next;
      marks.forEach(function (mark, i) { mark.classList.toggle('is-active', i === index); });
      notes.forEach(function (note, i) { note.classList.toggle('is-active', i === index); });
      if (!cursor || !marks[index]) return;
      var mark = marks[index];
      var left = parseFloat(mark.style.left) || 0;
      var top = parseFloat(mark.style.top) || 0;
      var width = parseFloat(mark.style.width) || 0;
      var height = parseFloat(mark.style.height) || 0;
      cursor.style.setProperty('--cursor-x', Math.min(94, left + width * .72).toFixed(2) + '%');
      cursor.style.setProperty('--cursor-y', Math.min(90, top + height * .62).toFixed(2) + '%');
      cursor.classList.remove('is-clicking');
      requestAnimationFrame(function () { cursor.classList.add('is-clicking'); });
    }

    function schedule() {
      clearTimeout(timer);
      if (!visible || document.hidden || PP.reducedMotion) return;
      timer = setTimeout(function () {
        show((index + 1) % marks.length);
        schedule();
      }, 3200);
    }

    notes.forEach(function (note, i) {
      note.tabIndex = 0;
      note.setAttribute('role', 'button');
      note.setAttribute('aria-label', 'Show ' + note.querySelector('strong').textContent);
      function select() { show(i); schedule(); }
      note.addEventListener('click', select);
      note.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
    });

    if ('ResizeObserver' in window) new ResizeObserver(placeMarks).observe(dev.el);
    else addEventListener('resize', placeMarks);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) { dev.play(); schedule(); } else { dev.pause(); clearTimeout(timer); }
      }, { threshold: .12 }).observe(hero.querySelector('[data-hero-pin]'));
    }
    document.addEventListener('visibilitychange', schedule);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { placeMarks(); show(0); schedule(); });
    });
  }

  /* Calm line field behind the headline. It is capped at ~25fps and pauses
     outside the viewport to keep the landing page light on low-end devices. */
  function lineField(canvas, hero) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = 0, h = 0;
    var ink = '', brand = '';
    var phase = 2.4;
    var pointer = { x: -9999, y: -9999, amount: 0 };
    var raf = 0, last = 0, visible = true;

    function readColors() {
      var styles = getComputedStyle(document.documentElement);
      ink = styles.getPropertyValue('--ink').trim() || '#000';
      brand = styles.getPropertyValue('--brand').trim() || '#00a1db';
    }
    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      var lines = w < 700 ? 18 : 28;
      var gap = h / (lines + 1);
      var step = w < 700 ? 18 : 14;
      for (var i = 1; i <= lines; i++) {
        var y0 = i * gap;
        var accent = i % 7 === 3;
        ctx.beginPath();
        for (var x = -step; x <= w + step; x += step) {
          var wave = Math.sin(x * .0042 + phase * .6 + i * .35) * 10 + Math.sin(x * .0093 - phase * .45 + i * .8) * 6;
          var dx = x - pointer.x, dy = y0 - pointer.y;
          var lift = pointer.amount ? Math.exp(-(dx * dx + dy * dy) / 20000) * 18 * pointer.amount : 0;
          var y = y0 + wave * (.45 + i / lines) - lift;
          if (x === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = accent ? brand : ink;
        ctx.globalAlpha = accent ? .24 : .055;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - last > 40) {
        phase += .01;
        pointer.amount += ((pointer.x > -9000 ? 1 : 0) - pointer.amount) * .06;
        draw(); last = now;
      }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && !PP.reducedMotion) raf = requestAnimationFrame(frame); }
    function redraw() { resize(); draw(); }

    readColors(); redraw();
    addEventListener('resize', redraw);
    addEventListener('pp:themechange', function () { readColors(); draw(); });
    if (PP.reducedMotion) return;
    hero.addEventListener('pointermove', function (event) {
      var rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
    });
    hero.addEventListener('pointerleave', function () { pointer.x = pointer.y = -9999; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; start(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', start);
    start();
  }
})();
