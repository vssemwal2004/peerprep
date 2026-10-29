/* How it works: a scroll-controlled horizontal product story.
   Native vertical scrolling drives the five scenes from right to left while
   the stage remains pinned. No carousel buttons, timers, or gesture traps. */
(function () {
  'use strict';

  PP.ready(function () {
    var section = document.getElementById('how');
    if (!section) return;

    var shell = section.querySelector('[data-how-scroll]');
    var track = section.querySelector('[data-how-track]');
    var panels = [].slice.call(section.querySelectorAll('[data-how-panel]'));
    var steps = [].slice.call(section.querySelectorAll('[data-how-go]'));
    var fill = section.querySelector('[data-how-fill]');
    if (!shell || !track || !panels.length) return;

    var active = -1;
    var visible = false;
    var ticking = false;
    var start = 0;
    var distance = 1;
    var lastProgress = -1;
    var lastY = window.scrollY;
    var direction = 1;
    var snapTimer = null;
    var snapping = false;

    section.classList.add('how--scroll');
    section.style.setProperty('--how-scenes', panels.length);
    track.setAttribute('aria-live', 'polite');

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function mount(index) {
      var panel = panels[index];
      var host = panel && panel.querySelector('[data-how-live]');
      if (!host || host.dataset.mounted || !PP.device) return host && host.__howDevice;
      var scene = host.getAttribute('data-how-live');
      if (!scene || !PP.demos.get(scene)) return null;

      host.dataset.mounted = 'true';
      host.__howDevice = PP.device(host, {
        scene: scene,
        autoplay: index === active && visible,
        loop: true,
        base3d: false,
        label: host.getAttribute('aria-label') || 'PeerPrep product walkthrough',
      });
      host.closest('.how__frame').classList.add('is-live');
      if (index !== active || !visible) host.__howDevice.pause();
      return host.__howDevice;
    }

    function deviceAt(index) {
      var host = panels[index] && panels[index].querySelector('[data-how-live]');
      return host && host.__howDevice;
    }

    function activate(index) {
      if (index === active) return;
      var oldDevice = deviceAt(active);
      if (oldDevice) oldDevice.pause();
      active = index;

      panels.forEach(function (panel, i) {
        var selected = i === active;
        panel.classList.toggle('is-active', selected);
        panel.setAttribute('aria-hidden', String(!selected));
        if (selected) panel.removeAttribute('inert');
        else panel.setAttribute('inert', '');
      });
      steps.forEach(function (step, i) {
        step.classList.toggle('is-active', i === active);
        step.classList.toggle('is-past', i < active);
        if (i === active) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });

      mount(active);
      if (active > 0) mount(active - 1);
      if (active < panels.length - 1) mount(active + 1);
      var nextDevice = deviceAt(active);
      if (nextDevice && visible) nextDevice.play();
    }

    function measure() {
      var rect = shell.getBoundingClientRect();
      start = rect.top + window.scrollY;
      distance = Math.max(1, shell.offsetHeight - window.innerHeight);
    }

    function render() {
      ticking = false;
      // Content above this story includes responsive/lazy media. Reading the
      // shell's live document position prevents late layout changes from
      // offsetting the scene checkpoints.
      start = shell.getBoundingClientRect().top + window.scrollY;
      var progress = clamp((window.scrollY - start) / distance, 0, 1);
      if (Math.abs(progress - lastProgress) < 0.0001) return;
      lastProgress = progress;

      var rawPosition = progress * (panels.length - 1);
      var selected = clamp(Math.round(rawPosition), 0, panels.length - 1);
      // Keep one complete product scene centred. Scroll chooses the scene;
      // CSS supplies the short horizontal hand-off between those positions.
      var position = selected;
      activate(selected);

      panels.forEach(function (panel, i) {
        var delta = i - position;
        var proximity = Math.abs(delta);
        var onStage = proximity < 1.08;
        var text = panel.querySelector('.how__text');
        var shot = panel.querySelector('.how__shot');

        panel.classList.toggle('is-scroll-visible', onStage);
        panel.style.visibility = onStage ? 'visible' : 'hidden';
        panel.style.opacity = String(clamp(1 - proximity, 0, 1));
        panel.style.transform = 'translate3d(' + (delta * 100) + '%,0,0)';

        if (!PP.reducedMotion) {
          if (text) text.style.transform = 'translate3d(' + (delta * 42) + 'px,0,0)';
          if (shot) shot.style.transform = 'translate3d(' + (delta * 86) + 'px,0,0) scale(' + (1 - Math.min(proximity, 1) * 0.035) + ')';
        }
      });

      if (fill) fill.style.transform = 'scaleX(' + (selected / (panels.length - 1)) + ')';
    }

    function finishSnap() {
      snapping = false;
      lastY = window.scrollY;
      lastProgress = -1;
      requestRender();
    }

    function settleScene() {
      snapTimer = null;
      if (snapping || PP.reducedMotion) return;

      measure();
      var y = window.scrollY;
      var end = start + distance;
      var targetIndex;

      // When entering from above, finish the approach so the first product
      // is shown as a full frame instead of being cropped below the fold.
      if (y < start) {
        if (direction < 0 || y < start - window.innerHeight * 0.28) return;
        targetIndex = 0;
      } else if (y > end) {
        return;
      } else {
        var raw = clamp((y - start) / distance, 0, 1) * (panels.length - 1);
        var nearest = Math.round(raw);
        // A deliberate scroll beyond a small dead-zone continues in the
        // user's direction; tiny touchpad movement settles back cleanly.
        if (Math.abs(raw - nearest) <= 0.08) targetIndex = nearest;
        else targetIndex = direction > 0 ? Math.ceil(raw) : Math.floor(raw);
        targetIndex = clamp(targetIndex, 0, panels.length - 1);
      }

      var targetY = start + distance * (targetIndex / (panels.length - 1));
      if (Math.abs(targetY - y) < 3) return;
      snapping = true;

      if (PP.lenis) {
        PP.lenis.scrollTo(targetY, {
          duration: 0.58,
          force: true,
          onComplete: finishSnap,
        });
      } else {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
        window.setTimeout(finishSnap, 620);
      }
      // Defensive release for browsers that interrupt smooth scrolling.
      window.setTimeout(function () { if (snapping) finishSnap(); }, 850);
    }

    function requestRender() {
      var y = window.scrollY;
      if (Math.abs(y - lastY) > 1) direction = y > lastY ? 1 : -1;
      lastY = y;
      if (!snapping && !PP.reducedMotion) {
        window.clearTimeout(snapTimer);
        snapTimer = window.setTimeout(settleScene, 135);
      }
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(render);
    }

    panels.forEach(function (panel, i) {
      panel.id = 'how-panel-' + i;
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', 'Step ' + (i + 1) + ' of ' + panels.length);
    });
    steps.forEach(function (step) { step.setAttribute('aria-hidden', 'true'); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        var device = deviceAt(active);
        if (device) {
          if (visible) device.play();
          else device.pause();
        }
      }, { threshold: 0.08 }).observe(shell);
    } else {
      visible = true;
    }

    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', function () {
      window.clearTimeout(snapTimer);
      measure();
      lastProgress = -1;
      requestRender();
    }, { passive: true });

    measure();
    activate(0);
    mount(1);
    render();
  });
})();
