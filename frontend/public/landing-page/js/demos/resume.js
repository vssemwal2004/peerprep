/* ==========================================================================
   Demo scene — Resume Builder
   Scripted recreation of /student/resume with fictional data (Aarav Sharma).
   Every state change is a tween or tl.set so the timeline is fully seekable
   and restartable (no onUpdate-driven text).
   ========================================================================== */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var SVG = function (d, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>';
  };
  var IC = {
    grip: '<svg class="dm-resume__grip" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    eye: SVG('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', ' class="dm-resume__eye"'),
    lock: SVG('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', ' class="dm-resume__eye"'),
    user: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    cap: SVG('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>'),
    brief: SVG('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'),
    code: SVG('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'),
    bolt: SVG('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    award: SVG('<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>'),
    check: SVG('<path d="M20 6 9 17l-5-5"/>', ' stroke-width="3"'),
    bulb: SVG('<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>'),
    dl: SVG('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>'),
    file: SVG('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/>')
  };

  function chars(text) {
    return text.split('').map(function (c) { return '<i>' + PP.esc(c) + '</i>'; }).join('');
  }
  // Reveal the hidden <i> chars of several containers in lockstep.
  function typeSync(tl, els, at, speed) {
    var lists = els.map(function (e) { return e.querySelectorAll(':scope > i'); });
    var n = lists[0].length;
    for (var k = 0; k < n; k++) {
      for (var j = 0; j < lists.length; j++) {
        if (lists[j][k]) tl.set(lists[j][k], { display: 'inline' }, at + k * speed);
      }
    }
    return at + n * speed;
  }
  function odo(digits) {
    var strip = '';
    for (var d = 0; d < 10; d++) strip += '<span>' + d + '</span>';
    var cols = '';
    for (var i = 0; i < digits; i++) cols += '<span class="dm-odo__col"><span class="dm-odo__strip">' + strip + '</span></span>';
    return '<span class="dm-odo" aria-hidden="true">' + cols + '</span>';
  }
  function odoDigits(v, n) {
    var s = String(v);
    while (s.length < n) s = '0' + s;
    return s.split('').map(Number);
  }

  var DATA = {
    name: 'Aarav Sharma',
    head: 'Software Engineer · Backend',
    bullet: 'Reduced API latency by 38% by caching hot queries'
  };

  var SECTIONS = [
    { key: 'basic', name: 'Basic Details', ic: IC.user, tag: 'FIXED HEADER', lock: true },
    { key: 'edu', name: 'Education', ic: IC.cap },
    { key: 'exp', name: 'Experience', ic: IC.brief },
    { key: 'proj', name: 'Projects', ic: IC.code },
    { key: 'skills', name: 'Technical Skills', ic: IC.bolt },
    { key: 'ach', name: 'Achievements', ic: IC.award }
  ];

  function rowsHTML() {
    return SECTIONS.map(function (s, i) {
      return '<div class="dm-resume__row" data-row="' + s.key + '" data-drag="0" data-active="' + (i === 0 ? '1' : '0') + '"' + ' style="top:' + i * 36 + 'px">' +
        (s.lock ? '<span style="width:14px"></span>' : IC.grip) +
        '<span class="dm-resume__row-ic">' + s.ic + '</span>' +
        '<span class="dm-resume__row-name">' + s.name + '</span>' +
        (s.tag ? '<span class="dm-resume__row-tag">' + s.tag + '</span>' + IC.lock
               : '<span class="dm-resume__pill dm-resume__pill--ok">Ready</span>' + IC.eye) +
        '</div>';
    }).join('');
  }

  function thumb(n, on) {
    return '<div class="dm-resume__thumb"' + (on ? ' data-on="1"' : '') + '>' +
      '<i class="h"></i><i class="s"></i><i></i><i></i><i class="s"></i><i></i><i></i><i class="s"></i><i></i>' +
      '</div><div class="dm-resume__thumb-n">' + n + '</div>';
  }

  function build(root) {
    root.innerHTML =
      '<div class="dm-resume">' +

      /* ---- top bar ---- */
      '<div class="dm-resume__card dm-resume__top">' +
        '<div class="dm-resume__title"><div class="dm-h3">Resume Builder</div>' +
          '<div class="dm-resume__meta"><span class="dm-resume__pill dm-resume__pill--brand">Professional A4</span>' +
          '<span class="dm-resume__save"><span data-save="ok"><i class="dm-resume__dot"></i>Saved</span>' +
          '<span data-save="dirty" style="opacity:0"><i class="dm-resume__dot dm-resume__dot--warn"></i>Unsaved changes</span></span></div>' +
        '</div>' +
        '<span class="dm-resume__sep"></span>' +
        '<div class="dm-resume__q">' +
          '<div class="dm-resume__ring"><svg viewBox="0 0 50 50" aria-hidden="true">' +
                        '<circle class="dm-resume__ring-track" cx="25" cy="25" r="20"/>' +
            '<circle class="dm-resume__ring-bar" data-ring cx="25" cy="25" r="20" pathLength="100"/>' +
          '</svg><span class="dm-resume__ring-val"><span data-odo-q>' + odo(2) + '</span><small>%</small></span></div>' +
          '<div><div class="dm-resume__kicker">Resume quality</div>' +
            '<div class="dm-resume__q-status"><span data-qs="a">Good progress</span><span data-qs="b" style="opacity:0">Strong foundation</span></div></div>' +
        '</div>' +
        '<div class="dm-resume__checks">' +
          '<div class="dm-resume__check" data-check="m"><span class="dm-resume__check-ic"><span class="is-todo"></span><span class="is-done">' + IC.check + '</span></span>Measurable results' +
            '<span class="dm-resume__check-val"><span data-cv="a">0</span><span data-cv="b" style="opacity:0">1</span></span></div>' +
          '<div class="dm-resume__check" data-check="b"><span class="dm-resume__check-ic"><span class="is-todo"></span><span class="is-done">' + IC.check + '</span></span>Bullet count' +
            '<span class="dm-resume__check-val"><span data-cv="a">4</span><span data-cv="b" style="opacity:0">5</span></span></div>' +
        '</div>' +
        '<div class="dm-resume__sugg">' +
          '<div data-sugg="a">' + IC.bulb + '<span>Add a number or measurable result where it is genuinely available.</span></div>' +
          '<div data-sugg="b" style="opacity:0">' + IC.bulb + '<span>Consider adding GitHub or a portfolio link.</span></div>' +
        '</div>' +
        '<button class="dm-resume__dl" type="button" tabindex="-1">' +
          '<span class="dm-resume__dl-face" data-dl="a">' + IC.dl + 'Download PDF</span>' +
          '<span class="dm-resume__dl-face" data-dl="b" style="opacity:0"><i class="dm-resume__spin"></i>Preparing</span>' +
        '</button>' +
      '</div>' +

      /* ---- outline ---- */
      '<div class="dm-resume__card dm-resume__outline">' +
        '<div class="dm-resume__head"><div class="dm-h4">Document outline</div><span>Drag to arrange sections</span></div>' +
        '<div class="dm-resume__rows">' + rowsHTML() + '</div>' +
      '</div>' +

      /* ---- form ---- */
      '<div class="dm-resume__card dm-resume__form">' +
        '<div class="dm-resume__panel" data-panel="basic">' +
          '<div class="dm-resume__head"><div class="dm-h4">Basic Details</div><span class="dm-resume__pill dm-resume__pill--ok">Ready</span></div>' +
          '<div class="dm-resume__fields"><div class="dm-resume__grid">' +
            '<label class="dm-resume__field"><span class="dm-resume__label">Full Name</span>' +
              '<span class="dm-resume__input">' + PP.esc(DATA.name) + '</span></label>' +
            '<label class="dm-resume__field"><span class="dm-resume__label">Professional headline</span>' +
              '<span class="dm-resume__input">' + PP.esc(DATA.head) + '</span></label>' +
            '<label class="dm-resume__field"><span class="dm-resume__label">Location</span><span class="dm-resume__input">Dehradun, India</span></label>' +
            '<label class="dm-resume__field"><span class="dm-resume__label">Email</span><span class="dm-resume__input">aarav.sharma@example.com</span></label>' +
            '<label class="dm-resume__field"><span class="dm-resume__label">LinkedIn</span><span class="dm-resume__input">linkedin.com/in/your-name</span></label>' +
            '<label class="dm-resume__field"><span class="dm-resume__label">GitHub <em>Optional</em></span><span class="dm-resume__input"><span class="dm-resume__ph">github.com/username</span></span></label>' +
          '</div></div>' +
        '</div>' +
        '<div class="dm-resume__panel" data-panel="proj" style="opacity:0;visibility:hidden">' +
          '<div class="dm-resume__head"><div class="dm-h4">Projects</div><span class="dm-resume__pill dm-resume__pill--ok">Ready</span></div>' +
          '<div class="dm-resume__fields">' +
            '<span class="dm-resume__label">Project title</span>' +
            '<span class="dm-resume__input">Campus Pulse — Event discovery API</span>' +
            '<span class="dm-resume__label" style="margin-top:8px">Description bullets <em>Action + work + result</em></span>' +
            '<div class="dm-resume__bullets">' +
              '<div class="dm-resume__bul"><span class="dm-resume__input">Designed a REST API serving event listings to student clubs.</span></div>' +
              '<div class="dm-resume__bul"><span class="dm-resume__input">Added role-based access and audit logs for club admins.</span></div>' +
              '<div class="dm-resume__bul dm-resume__bul--new" data-newbul><span class="dm-resume__input" data-in="bul" data-focus="0"><span class="dm-resume__t" data-t="bul-in">' + chars(DATA.bullet) + '</span><span class="dm-resume__caret"></span></span></div>' +
              '<span class="dm-resume__add">' + IC.plus + 'Add bullet</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ---- preview ---- */
      '<div class="dm-resume__card dm-resume__pane">' +
        '<div class="dm-resume__pane-bar"><div class="dm-h4">Resume preview</div><span class="dm-resume__pill">Live</span><span class="dm-resume__spacer"></span>' +
          '<span class="dm-resume__pagepill"><span class="dm-resume__pagedots"><i></i><i></i></span>Page 1 of 2</span></div>' +
        '<div class="dm-resume__paper2" aria-hidden="true"></div>' +
        '<div class="dm-resume__paper">' +
          '<div class="dm-resume__pv-name">' +
            PP.esc(DATA.name) + '</div>' +
          '<div class="dm-resume__pv-head">' + PP.esc(DATA.head) + '</div>' +
          '<div class="dm-resume__pv-contact">Dehradun, India  ·  aarav.sharma@example.com  ·  linkedin.com/in/your-name</div>' +
          '<div class="dm-resume__pv-rule"></div>' +
          '<div class="dm-resume__sec"><div class="dm-h5">Education</div>' +
            '<div class="dm-resume__pv-row"><span>Your University</span><span>2023 – 2027</span></div>' +
            '<div class="dm-resume__pv-sub">B.Tech, Computer Science and Engineering · CGPA 8.6</div></div>' +
          '<div class="dm-resume__sec dm-resume__sec--exp" data-pv="exp"><span class="dm-resume__hl" data-hl="exp"></span><div class="dm-h5">Experience</div>' +
            '<div class="dm-resume__pv-row"><span>Backend Intern, a Bengaluru startup</span><span>May – Jul 2026</span></div>' +
            '<div class="dm-resume__pv-sub">Summer internship</div>' +
            '<ul class="dm-resume__pv-ul"><li>Built REST endpoints for an internal inventory dashboard in Node.js.</li><li>Wrote integration tests for order and payment flows.</li></ul></div>' +
          '<div class="dm-resume__sec" data-pv="proj"><span class="dm-resume__hl" data-hl="proj"></span><div class="dm-h5">Projects</div>' +
            '<div class="dm-resume__pv-row"><span>Campus Pulse — Event discovery API</span><span>2026</span></div>' +
            '<div class="dm-resume__pv-sub">Node.js · PostgreSQL · Redis</div>' +
            '<ul class="dm-resume__pv-ul"><li>Designed a REST API serving event listings to student clubs.</li><li>Added role-based access and audit logs for club admins.</li>' +
            '<li class="is-new" data-pv-new><span class="dm-resume__t" data-t="bul-pv">' + chars(DATA.bullet) + '</span></li></ul></div>' +
          '<div class="dm-resume__sec"><div class="dm-h5">Technical Skills</div>' +
            '<div class="dm-resume__pv-ul"><div class="dm-resume__pv-kv" style="height:14px"><b>Languages:</b> C++, Java, Python, JavaScript</div>' +
            '<div class="dm-resume__pv-kv" style="height:14px"><b>Backend:</b> Node.js, Express, PostgreSQL, Redis</div>' +
            '<div class="dm-resume__pv-kv" style="height:14px"><b>Tools:</b> Git, Docker, Postman, Linux</div></div></div>' +
          '<div class="dm-resume__sec"><div class="dm-h5">Achievements</div>' +
            '<ul class="dm-resume__pv-ul"><li>Finalist, inter-college hackathon (2026).</li><li>Core member, college coding club.</li></ul></div>' +
        '</div>' +
        '<div class="dm-resume__thumbs" aria-hidden="true">' + thumb(1, true) + thumb(2, false) + '</div>' +
        '<div class="dm-resume__fade"></div>' +
      '</div>' +

      /* ---- toast + cursor ---- */
      '<div class="dm-resume__toast" role="status"><span class="dm-resume__toast-ic">' + IC.file + '</span>' +
        '<div><b>PDF ready</b><span>Aarav_Sharma_Resume.pdf · 2 pages · A4</span></div></div>' +
      '<div class="dm-cursor" aria-hidden="true"><span class="dm-cursor__ripple"></span>' +
        '<svg class="dm-cursor__arrow" viewBox="0 0 24 24"><path d="M4 2.5v16.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.4h6z"/></svg></div>' +
      '</div>';
  }

  PP.demos.register('resume', {
    title: 'Resume Builder',
    route: '/student/resume',
    nav: 'resume',
    caption: 'Arrange sections, write measurable bullets, watch the A4 preview and quality score update, download a PDF.',
    description: 'Animated recreation of the PeerPrep Resume Builder for a fictional student, Aarav Sharma. The Projects section is dragged above Experience in the document outline and the live A4 preview reorders to match. The Projects editor opens and a new bullet, "Reduced API latency by 38% by caching hot queries", is typed and appears in the preview as it is written. The resume quality ring rises from 62% to 86%, the Measurable results and Bullet count checks turn green, and the suggestion changes. Finally Download PDF is clicked and a "PDF ready" notification appears.',
    duration: 11100,
    create: function (root) {
      build(root);
      var $ = function (s) { return root.querySelector(s); };
      var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };

      var cur = $('.dm-cursor'), arrow = $('.dm-cursor__arrow'), rip = $('.dm-cursor__ripple');
      var ring = $('[data-ring]');
      var qStrips = $$('[data-odo-q] .dm-odo__strip');
      var rowProj = $('[data-row="proj"]'), rowExp = $('[data-row="exp"]'), rowBasic = $('[data-row="basic"]');
      var pvExp = $('[data-pv="exp"]'), pvProj = $('[data-pv="proj"]');
      var newBul = $('[data-newbul]'), pvNew = $('[data-pv-new]');
      var toast = $('.dm-resume__toast');

      if (!window.gsap) {
        $$('.dm-resume__t > i').forEach(function (i) { i.style.display = 'inline'; });
        return null;
      }

      var tl = gsap.timeline({ paused: true });
      // initial state: applied now (first frame) and recorded at 0 (restart)
      function at0(t, v) { gsap.set(t, v); tl.set(t, v, 0); }

      var q0 = odoDigits(62, 2);
      at0(cur, { x: 260, y: 640, opacity: 1 });
      at0(arrow, { scale: 1 });
      at0(rip, { opacity: 0, scale: 0.3 });
      at0(ring, { strokeDashoffset: 38 });
      at0(qStrips[0], { yPercent: -q0[0] * 10 });
      at0(qStrips[1], { yPercent: -q0[1] * 10 });
      at0([rowProj, rowExp], { y: 0, scale: 1 });
      at0(rowProj, { attr: { 'data-drag': '0', 'data-active': '0' } });
      at0(rowBasic, { attr: { 'data-active': '1' } });
      at0([pvExp, pvProj], { y: 0 });
      at0(newBul, { height: 0 });
      at0(pvNew, { height: 0 });
      at0($('[data-in="bul"]'), { attr: { 'data-focus': '0' } });
      at0($$('.dm-resume__t > i'), { display: 'none' });
      at0($('[data-panel="basic"]'), { autoAlpha: 1, x: 0 });
      at0($('[data-panel="proj"]'), { autoAlpha: 0, x: 16 });
      at0($$('.dm-resume__hl'), { opacity: 0 });
      at0($$('.dm-resume__check-ic .is-done'), { scale: 0 });
      at0($$('.dm-resume__check-ic .is-todo'), { opacity: 1 });
      at0($$('[data-cv="a"], [data-qs="a"], [data-sugg="a"], [data-save="ok"], [data-dl="a"]'), { opacity: 1, y: 0 });
      at0($$('[data-cv="b"], [data-qs="b"], [data-sugg="b"], [data-save="dirty"], [data-dl="b"]'), { opacity: 0, y: 6 });
      at0(toast, { autoAlpha: 0, y: 12 });

      function move(x, y, at, d) {
        tl.to(cur, { x: x, y: y, duration: d || 0.7, ease: 'power3.inOut' }, at);
      }
      function click(at) {
        tl.to(arrow, { scale: 0.82, duration: 0.09, ease: 'power2.out' }, at)
          .to(arrow, { scale: 1, duration: 0.25, ease: 'power2.out' }, at + 0.09)
          .fromTo(rip, { scale: 0.3, opacity: 0.55 }, { scale: 1.6, opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, at);
      }
      function flash(key, at) {
        var el = $('[data-hl="' + key + '"]');
        tl.to(el, { opacity: 1, duration: 0.2 }, at).to(el, { opacity: 0, duration: 0.8, ease: 'power1.out' }, at + 0.5);
      }
      function swap(a, b, at, d) {
        tl.to(a, { opacity: 0, y: -6, duration: d || 0.3, ease: 'power2.in' }, at)
          .fromTo(b, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: d || 0.35, ease: 'power2.out', immediateRender: false }, at + 0.12);
      }
      function dirty(at, clean) {
        swap($('[data-save="ok"]'), $('[data-save="dirty"]'), at, 0.2);
        swap($('[data-save="dirty"]'), $('[data-save="ok"]'), clean, 0.2);
      }

      // ---------- 1. drag Projects above Experience ----------
      var d0 = 0.4;
      move(46, 268, d0, 0.8);
      var grab = d0 + 0.9;
      tl.to(arrow, { scale: 0.86, duration: 0.12 }, grab)
        .set(rowProj, { attr: { 'data-drag': '1' } }, grab)
        .to(rowProj, { scale: 1.02, duration: 0.25, ease: 'power2.out' }, grab)
        .to(rowProj, { y: -36, duration: 0.7, ease: 'power2.inOut' }, grab + 0.2)
        .to(cur, { y: 232, x: 52, duration: 0.7, ease: 'power2.inOut' }, grab + 0.2)
        .to(rowExp, { y: 36, duration: 0.5, ease: 'power3.out' }, grab + 0.42)
        // preview reorders in sync
        .to(pvProj, { y: -91, duration: 0.75, ease: 'power3.inOut' }, grab + 0.35)
        .to(pvExp, { y: 91, duration: 0.75, ease: 'power3.inOut' }, grab + 0.35);
      flash('proj', grab + 0.45);
      var drop = grab + 1.0;
      tl.to(rowProj, { scale: 1, duration: 0.3, ease: 'power2.out' }, drop)
        .set(rowProj, { attr: { 'data-drag': '0' } }, drop + 0.15)
        .to(arrow, { scale: 1, duration: 0.2 }, drop);
      dirty(grab + 0.3, drop + 0.6);

      // ---------- 2. open Projects, add a measurable bullet ----------
      move(150, 233, drop + 0.25, 0.4);
      var openP = drop + 0.65;
      click(openP);
      tl.set(rowBasic, { attr: { 'data-active': '0' } }, openP + 0.05)
        .set(rowProj, { attr: { 'data-active': '1' } }, openP + 0.05)
        .to($('[data-panel="basic"]'), { autoAlpha: 0, x: -16, duration: 0.3, ease: 'power2.in' }, openP + 0.05)
        .to($('[data-panel="proj"]'), { autoAlpha: 1, x: 0, duration: 0.4, ease: 'power2.out' }, openP + 0.25);

      move(92, 581, openP + 0.5, 0.65);
      var addAt = openP + 1.2;
      click(addAt);
      tl.to(newBul, { height: 34, duration: 0.35, ease: 'power2.out' }, addAt + 0.08)
        .set($('[data-in="bul"]'), { attr: { 'data-focus': '1' } }, addAt + 0.2)
        .to(pvNew, { height: 14, duration: 0.35, ease: 'power2.out' }, addAt + 0.08)
        .to(pvExp, { y: 105, duration: 0.35, ease: 'power2.out' }, addAt + 0.08)
        .to(cur, { x: 300, y: 640, duration: 0.6, ease: 'power2.inOut' }, addAt + 0.3);
      flash('proj', addAt + 0.2);
      var tEnd = typeSync(tl, [$('[data-t="bul-in"]'), $('[data-t="bul-pv"]')], addAt + 0.4, 0.032);
      tl.set($('[data-in="bul"]'), { attr: { 'data-focus': '0' } }, tEnd + 0.3);
      dirty(addAt + 0.4, tEnd + 0.5);

      // ---------- 3. quality rises 62 -> 86, checks turn green ----------
      var qa = tEnd + 0.1;
      var q1 = odoDigits(86, 2);
      tl.to(ring, { strokeDashoffset: 14, duration: 1.1, ease: 'power3.inOut' }, qa)
        .to(qStrips[0], { yPercent: -q1[0] * 10, duration: 0.9, ease: 'power3.inOut' }, qa + 0.1)
        .to(qStrips[1], { yPercent: -q1[1] * 10, duration: 1.0, ease: 'power3.inOut' }, qa + 0.05);
      swap($('[data-qs="a"]'), $('[data-qs="b"]'), qa + 0.6);
      ['m', 'b'].forEach(function (k, i) {
        var at = qa + 0.2 + i * 0.3;
        var c = $('[data-check="' + k + '"]');
        tl.to(c.querySelector('.is-todo'), { opacity: 0, duration: 0.15 }, at)
          .to(c.querySelector('.is-done'), { scale: 1, duration: 0.35, ease: 'power2.out' }, at);
        swap(c.querySelector('[data-cv="a"]'), c.querySelector('[data-cv="b"]'), at, 0.2);
      });
      swap($('[data-sugg="a"]'), $('[data-sugg="b"]'), qa + 0.95, 0.35);

      // ---------- 4. Download PDF -> toast ----------
      var dl = qa + 0.9;
      move(1020, 54, dl, 0.9);
      var dlc = dl + 0.9;
      click(dlc);
      swap($('[data-dl="a"]'), $('[data-dl="b"]'), dlc + 0.05, 0.18);
      swap($('[data-dl="b"]'), $('[data-dl="a"]'), dlc + 0.75, 0.18);
      tl.to(toast, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, dlc + 0.8)
        .to(cur, { x: 1030, y: 470, duration: 0.8, ease: 'power2.inOut' }, dlc + 0.9);

      // hold the payoff
      tl.to({}, { duration: 1.8 }, dlc + 1.3);
      return tl;
    }
  });
})();