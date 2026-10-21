/* Demo scene: guided learning (route /student/learning).
   Fictional demo data. Stage is 1128 x 680 logical px. */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var C_BIG = 2 * Math.PI * 24;   // overall completion ring
  var C_MINI = 2 * Math.PI * 9;   // chapter mini ring

  function pt(el, root, fx, fy) {
    var x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x + el.offsetWidth * (fx == null ? 0.5 : fx), y: y + el.offsetHeight * (fy == null ? 0.5 : fy) };
  }

  var ICON = {
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    tree: '<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M10.5 7 7 15.5M13.5 7l3.5 8.5"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    net: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    algo: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V3z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V3z"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17.5h.01"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  };
  function ic(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  function stars(n) {
    var s = '<span class="dm-learning__stars">';
    for (var i = 0; i < 5; i++) s += ic('star', i < n ? 'is-on' : '');
    return s + '</span>';
  }
  var CURSOR = '<div class="dm-cursor"><span class="dm-cursor__ring"></span><svg class="dm-cursor__ptr" viewBox="0 0 24 24"><path d="M5 2.8v15.6l4.3-4.1 2.9 6.6 2.6-1.1-2.9-6.5h6z"/></svg></div>';

  var SUBJECTS = [
    { n: 'Data Structures', t: 'Dr. K. Mehra', c: 4, tp: 26, p: 58, ic: 'tree', nx: 'Height & Diameter of a Tree' },
    { n: 'Operating Systems', t: 'Prof. S. Iyer', c: 5, tp: 31, p: 44, ic: 'cpu', nx: 'Page Replacement Algorithms' },
    { n: 'Database Management Systems', t: 'Dr. P. Nair', c: 5, tp: 28, p: 71, ic: 'db', nx: 'Transactions & ACID' },
    { n: 'Computer Networks', t: 'Prof. A. Bose', c: 4, tp: 24, p: 22, ic: 'net', nx: 'Subnetting & CIDR' },
    { n: 'Design & Analysis of Algorithms', t: 'Dr. R. Khanna', c: 6, tp: 35, p: 35, ic: 'algo', nx: 'Greedy vs Dynamic Programming' },
    { n: 'Aptitude & Reasoning', t: 'Ms. T. Verma', c: 3, tp: 18, p: 80, ic: 'brain', nx: 'Time, Speed & Distance' },
  ];
  var TOPICS = [
    { n: 'Binary Tree Traversals', imp: 5, d: 'Easy', done: true },
    { n: 'Binary Search Trees', imp: 4, d: 'Medium', done: true },
    { n: 'Height & Diameter of a Tree', imp: 4, d: 'Medium', done: false, target: true },
    { n: 'Lowest Common Ancestor', imp: 3, d: 'Medium', done: false },
    { n: 'Segment Trees', imp: 2, d: 'Hard', done: false },
  ];
  var CHAPTERS = [
    { n: 'Arrays & Strings', imp: 5, t: 8, d: 8 },
    { n: 'Linked Lists', imp: 4, t: 6, d: 5 },
    { n: 'Trees', imp: 5, t: 5, d: 2, open: true },
    { n: 'Graphs', imp: 4, t: 7, d: 0 },
  ];

  function html() {
    var B = 'dm-learning__';
    var tiles = SUBJECTS.map(function (s, i) {
      return '<div class="' + B + 'tile' + (i === 0 ? ' ' + B + 'tile--ds' : '') + '">' +
        '<div class="' + B + 'tile-top"><span class="' + B + 'tile-ic">' + ic(s.ic) + '</span><span class="' + B + 'chip">' + s.tp + ' Topics</span></div>' +
        '<b class="' + B + 'tile-n">' + PP.esc(s.n) + '</b>' +
        '<span class="' + B + 'tile-t"><i>' + s.t.split(' ').pop().charAt(0) + '</i>Instructor: ' + s.t + '</span>' +
        '<span class="' + B + 'tile-nx"><small>Up next</small>' + PP.esc(s.nx) + '</span>' +
        '<div class="' + B + 'tile-p"><div class="' + B + 'track"><i style="width:' + s.p + '%"></i></div><span>' + s.p + '%</span></div>' +
        '<div class="' + B + 'tile-f"><span>' + ic('play') + s.c * 4 + '</span><span>' + ic('notes') + s.c * 3 + '</span><span>' + ic('help') + s.tp + '</span><em>' + s.c + ' chapters</em></div>' +
      '</div>';
    }).join('');
    var rows = TOPICS.map(function (t) {
      var dcls = t.d === 'Easy' ? 'e' : t.d === 'Medium' ? 'm' : 'h';
      return '<div class="' + B + 'row' + (t.done ? ' is-done' : '') + (t.target ? ' ' + B + 'row--target' : '') + '">' +
        (t.target ? '<span class="' + B + 'row-bg"></span><span class="' + B + 'row-play"></span>' : '') +
        '<span class="' + B + 'status">' + (t.done ? ic('check') : t.target ? '<span class="' + B + 'status-on">' + ic('check') + '</span>' : '') + '</span>' +
        '<span class="' + B + 'topic">' + PP.esc(t.n) + '</span>' +
        stars(t.imp) +
        '<span class="' + B + 'diff ' + B + 'diff--' + dcls + '">' + t.d + '</span>' +
        '<span class="' + B + 'res ' + B + 'res--v">' + ic('play') + '</span>' +
        '<span class="' + B + 'res">' + ic('notes') + '</span>' +
        '<span class="' + B + 'solve">Solve</span>' +
      '</div>';
    }).join('');

    var chapters = CHAPTERS.map(function (c, i) {
      var full = c.d === c.t;
      var body = c.open ? '<div class="' + B + 'body"><div class="' + B + 'thead"><span>Status</span><span>Topic</span><span>Importance</span><span>Difficulty</span><span>Video</span><span>Notes</span><span>Questions</span></div>' + rows + '</div>' : '';
      return '<div class="' + B + 'ch' + (c.open ? ' ' + B + 'ch--open' : '') + '">' +
        '<div class="' + B + 'ch-h">' +
          ic('chev', B + 'chev') +
          '<b>Chapter ' + (i + 1) + ': ' + c.n + '</b>' +
          stars(c.imp) +
          '<span class="' + B + 'chip">' + c.t + ' Topics</span>' +
          '<span class="' + B + 'mini' + (full ? ' is-full' : '') + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="' + B + 'mini-t" cx="12" cy="12" r="9"/><circle class="' + B + 'mini-f" cx="12" cy="12" r="9" stroke-dashoffset="' + (C_MINI * (1 - c.d / c.t)).toFixed(2) + '"/></svg>' +
            (c.open
              ? '<span class="' + B + 'mini-n"><span class="' + B + 'mn-a">' + c.d + '/' + c.t + '</span><span class="' + B + 'mn-b">' + (c.d + 1) + '/' + c.t + '</span></span>'
              : '<span class="' + B + 'mini-n"><span>' + c.d + '/' + c.t + '</span></span>') +
          '</span>' +
        '</div>' + body +
      '</div>';
    }).join('');

    // Binary tree drawn in the "video lesson"
    var nodes = [[200, 66], [130, 106], [270, 106], [90, 146], [170, 146], [310, 146], [150, 184]];
    var edges = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [4, 6]];
    var svgTree = '<svg class="' + B + 'tree" viewBox="0 0 360 200" aria-hidden="true">' +
      edges.map(function (e) { var a = nodes[e[0]], b = nodes[e[1]]; return '<line class="' + B + 'edge" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }).join('') +
      '<path class="' + B + 'diam" stroke-dashoffset="360" d="M150 184 L170 146 L130 106 L200 66 L270 106 L310 146"/>' +
      nodes.map(function (p, i) { return '<g class="' + B + 'node ' + B + 'node--' + i + '"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="13"/><text x="' + p[0] + '" y="' + (p[1] + 4) + '">' + [8, 3, 10, 1, 6, 14, 4][i] + '</text></g>'; }).join('') +
      '<text class="' + B + 'hlabel ' + B + 'hl-0" x="220" y="58">h = 4</text>' +
      '<text class="' + B + 'hlabel ' + B + 'hl-1" x="72" y="102">h = 3</text>' +
      '<text class="' + B + 'hlabel ' + B + 'hl-4" x="192" y="150">h = 2</text>' +
      '<text class="' + B + 'hlabel ' + B + 'dlabel" x="232" y="190">diameter = 5 edges</text>' +
    '</svg>';

    return '' +
    '<div class="' + B + 'wrap">' +
      /* ---------- view 1: subjects ---------- */
      '<div class="' + B + 'list">' +
        '<header class="' + B + 'lhead">' +
          '<div><span class="' + B + 'kicker">Learning Modules</span><div class="dm-h3">Your subjects this semester</div><p>Faculty-curated videos, notes and practice questions, topic by topic.</p></div>' +
          '<div class="' + B + 'semsum"><b>5 of 6</b><span>subjects in progress</span></div>' +
        '</header>' +
        '<div class="' + B + 'sems"><i class="' + B + 'sem-pill"></i><span>Semester 5</span><span>Semester 6</span><span class="is-on">Semester 7</span><span>Semester 8</span></div>' +
        '<div class="' + B + 'tiles">' + tiles + '</div>' +
      '</div>' +

      /* ---------- view 2: subject detail ---------- */
      '<div class="' + B + 'detail">' +
        '<header class="' + B + 'dhead">' +
          '<span class="' + B + 'back">' + ic('back') + 'My Subjects</span>' +
          '<span class="' + B + 'tile-ic ' + B + 'tone-brand">' + ic('tree') + '</span>' +
          '<div class="' + B + 'dtitle"><div class="dm-h3">Data Structures</div><span>Instructor: Dr. K. Mehra &middot; Semester 7 &middot; 4 chapters</span></div>' +
          '<div class="' + B + 'overall">' +
            '<span class="' + B + 'big"><svg viewBox="0 0 60 60" aria-hidden="true"><circle class="' + B + 'big-t" cx="30" cy="30" r="24"/><circle class="' + B + 'big-f" cx="30" cy="30" r="24" stroke-dasharray="' + C_BIG.toFixed(2) + '" stroke-dashoffset="' + (C_BIG * 0.42).toFixed(2) + '"/></svg><b><em class="' + B + 'pct">58</em>%</b></span>' +
            '<span class="' + B + 'overall-t"><b>Course completion</b><small><em class="' + B + 'done-n">15</em> of 26 topics complete</small></span>' +
          '</div>' +
        '</header>' +
        '<div class="' + B + 'dbody">' +
          '<div class="' + B + 'chapters">' + chapters + '</div>' +
          '<aside class="' + B + 'side">' +
            '<div class="' + B + 'player">' +
              '<div class="' + B + 'player-h"><b>Video Lesson</b><span>Chapter 3 &middot; Trees</span></div>' +
              '<div class="' + B + 'screen">' +
                svgTree +
                '<div class="' + B + 'screen-title"><small>Lesson 3 of 5</small><b>Height &amp; Diameter of a Tree</b></div>' +
                '<span class="' + B + 'bigplay">' + ic('play') + '</span>' +
                '<span class="' + B + 'lesson-done">' + ic('check') + 'Lesson watched</span>' +
                '<div class="' + B + 'empty"><span>' + ic('play') + '</span><b>Pick a topic video to start</b><small>Your watch progress is saved automatically.</small></div>' +
                '<div class="' + B + 'scrub"><i class="' + B + 'scrub-f"></i></div>' +
              '</div>' +
              '<div class="' + B + 'ctrls">' +
                '<span class="' + B + 'pp"><span class="' + B + 'pp-a">' + ic('play') + '</span><span class="' + B + 'pp-b">' + ic('pause') + '</span></span>' +
                ic('vol') +
                '<span class="' + B + 'watched">Watched <em class="' + B + 'wn">0</em>%</span>' +
                '<span class="' + B + 'speed">1x</span>' + ic('full') +
              '</div>' +
            '</div>' +
            '<div class="' + B + 'res-card"><span class="' + B + 'res-ic">' + ic('notes') + '</span><span class="' + B + 'res-t"><b>Study Notes</b><small>Trees &middot; height and diameter (PDF)</small></span><span class="' + B + 'link">View Notes</span></div>' +
            '<div class="' + B + 'res-card"><span class="' + B + 'res-ic">' + ic('help') + '</span><span class="' + B + 'res-t"><b>Practice Questions</b><small>3 linked problems &middot; 1 Easy, 2 Medium</small></span><span class="' + B + 'link">View Questions</span></div>' +
            '<div class="' + B + 'res-card"><span class="' + B + 'res-ic ' + B + 'res-ic--brand">' + ic('play') + '</span><span class="' + B + 'res-t"><b>Up next: Lowest Common Ancestor</b><small>Video lesson &middot; 11 min &middot; Medium</small></span><span class="' + B + 'link">Start</span></div>' +
          '</aside>' +
        '</div>' +
      '</div>' +
    '</div>' + CURSOR;
  }

  PP.demos.register('learning', {
    title: 'Guided Learning',
    route: '/student/learning',
    nav: 'learning',
    caption: 'Semester-wise subjects, video lessons and topic progress in one place.',
    description: 'Animated walkthrough of PeerPrep guided learning with demo data. The Semester 7 subjects appear as tiles with progress. The cursor opens Data Structures, expands Chapter 3: Trees to show topics with importance stars, difficulty, video, notes and practice links, and plays the video lesson on height and diameter of a tree. After the lesson, the topic is marked complete: the chapter moves to three of five topics and course completion rises from 58 to 62 percent.',
    duration: 11600,
    create: function (root) {
      root.innerHTML = html();
      var q = function (s) { return root.querySelector('.dm-learning__' + s); };
      var qa = function (s) { return root.querySelectorAll('.dm-learning__' + s); };
      var cursor = root.querySelector('.dm-cursor');
      var ptr = root.querySelector('.dm-cursor__ptr');
      var ring = root.querySelector('.dm-cursor__ring');

      var list = q('list'), detail = q('detail');
      var tiles = qa('tile');
      var ds = q('tile--ds');
      var chOpen = q('ch--open');
      var chHead = chOpen.querySelector('.dm-learning__ch-h');
      var body = chOpen.querySelector('.dm-learning__body');
      var target = q('row--target');
      var vidBtn = target.querySelector('.dm-learning__res--v');
      var statusBtn = target.querySelector('.dm-learning__status');
      var miniF = chOpen.querySelector('.dm-learning__mini-f');
      var nodes = [];
      for (var i = 0; i < 7; i++) nodes.push(q('node--' + i));

      var tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

      function moveTo(el, at, dur, fx, fy) {
        tl.to(cursor, {
          x: function () { return pt(el, root, fx, fy).x; },
          y: function () { return pt(el, root, fx, fy).y; },
          duration: dur || 0.9, ease: 'power2.inOut',
        }, at);
      }
      function click(at) {
        tl.to(ptr, { scale: 0.86, duration: 0.1, ease: 'power1.out', transformOrigin: '20% 10%' }, at)
          .to(ptr, { scale: 1, duration: 0.18, ease: 'power2.out' }, at + 0.1)
          .set(ring, { scale: 0.4, opacity: 0.7 }, at)
          .to(ring, { scale: 1.4, opacity: 0, duration: 0.5, ease: 'power2.out' }, at);
      }

      /* ---------- t = 0 restates the markup's default (restart-safe) ---------- */
      tl.set(cursor, { x: 940, y: 610 }, 0)
        .set(ring, { opacity: 0 }, 0)
        .set(list, { autoAlpha: 1, x: 0 }, 0)
        .set(ds, { '--hover': 0, scale: 1 }, 0)
        .set(detail, { autoAlpha: 0, x: 16 }, 0)
        .set(q('big-f'), { attr: { 'stroke-dashoffset': C_BIG * (1 - 0.58) } }, 0)
        .set(q('pct'), { innerText: 58 }, 0)
        .set(q('done-n'), { innerText: 15 }, 0)
        .set(body, { height: 0 }, 0)
        .set(chOpen.querySelector('.dm-learning__chev'), { rotate: 0 }, 0)
        .set(q('empty'), { autoAlpha: 1 }, 0)
        .set([q('screen-title'), q('bigplay')], { autoAlpha: 0 }, 0)
        .set(q('lesson-done'), { autoAlpha: 0 }, 0)
        .set(q('scrub-f'), { scaleX: 0 }, 0)
        .set(q('wn'), { innerText: 0 }, 0)
        .set(q('pp-a'), { autoAlpha: 1 }, 0)
        .set(q('pp-b'), { autoAlpha: 0 }, 0)
        .set(nodes, { opacity: 0.35 }, 0)
        .set(qa('node circle'), { attr: { class: '' } }, 0)
        .set(qa('hlabel'), { opacity: 0 }, 0)
        .set(qa('diam'), { attr: { 'stroke-dashoffset': 360 } }, 0)
        .set([q('row-bg'), q('row-play')], { autoAlpha: 0 }, 0)
        .set(q('status-on'), { autoAlpha: 0, scale: 0.6 }, 0)
        .set(miniF, { attr: { 'stroke-dashoffset': C_MINI * (1 - 2 / 5) } }, 0)
        .set(q('mn-a'), { autoAlpha: 1, y: 0 }, 0)
        .set(q('mn-b'), { autoAlpha: 0, y: 6 }, 0);

      /* ---------- open Data Structures ---------- */
      moveTo(ds, 0.4, 1.0, 0.62, 0.5);
      tl.to(ds, { '--hover': 1, duration: 0.25, ease: 'power1.out' }, 1.25);
      click(1.7);
      tl.to(ds, { scale: 0.99, duration: 0.1, ease: 'power1.out' }, 1.7)
        .to(ds, { scale: 1, duration: 0.2 }, 1.8)
        .to(list, { autoAlpha: 0, x: -16, duration: 0.35, ease: 'power2.in' }, 1.9)
        .to(detail, { autoAlpha: 1, x: 0, duration: 0.55 }, 2.15);

      /* ---------- expand Chapter 3 ---------- */
      moveTo(chHead, 2.45, 0.85, 0.3, 0.5);
      click(3.4);
      // thead 30px + 5 topic rows x 48px (border-box)
      tl.to(body, { height: 30 + TOPICS.length * 48, duration: 0.55, ease: 'power3.inOut' }, 3.45)
        .to(chOpen.querySelector('.dm-learning__chev'), { rotate: 90, duration: 0.35 }, 3.45);

      /* ---------- play the video lesson ---------- */
      moveTo(vidBtn, 4.0, 0.75);
      click(4.85);
      tl.to(q('row-play'), { autoAlpha: 1, duration: 0.3 }, 4.9)
        .to(q('empty'), { autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, 4.9)
        .to(q('screen-title'), { autoAlpha: 1, duration: 0.4 }, 5.05)
        .to(q('bigplay'), { autoAlpha: 1, duration: 0.2 }, 5.0)
        .to(q('bigplay'), { autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, 5.35)
        .to(q('pp-a'), { autoAlpha: 0, duration: 0.15 }, 5.35)
        .to(q('pp-b'), { autoAlpha: 1, duration: 0.15 }, 5.4)
        .to(q('scrub-f'), { scaleX: 1, duration: 2.4, ease: 'none' }, 5.3)
        .to(q('wn'), { innerText: 100, snap: { innerText: 1 }, duration: 2.4, ease: 'none' }, 5.3);
      // post-order traversal lights the nodes, heights appear, then the diameter
      [3, 6, 4, 1, 5, 2, 0].forEach(function (ni, k) {
        tl.to(nodes[ni], { opacity: 1, duration: 0.2 }, 5.45 + k * 0.22)
          .set(nodes[ni].querySelector('circle'), { attr: { class: 'is-lit' } }, 5.45 + k * 0.22);
      });
      tl.to(q('hl-4'), { opacity: 1, duration: 0.3 }, 6.05)
        .to(q('hl-1'), { opacity: 1, duration: 0.3 }, 6.25)
        .to(q('hl-0'), { opacity: 1, duration: 0.3 }, 6.9)
        .to(q('diam'), { attr: { 'stroke-dashoffset': 0 }, duration: 0.7, ease: 'power2.inOut' }, 6.95)
        .to(q('dlabel'), { opacity: 1, duration: 0.3 }, 7.4)
        .to(q('pp-b'), { autoAlpha: 0, duration: 0.15 }, 7.7)
        .to(q('pp-a'), { autoAlpha: 1, duration: 0.15 }, 7.75)
        .to(q('lesson-done'), { autoAlpha: 1, duration: 0.35 }, 7.7);

      /* ---------- mark the topic complete ---------- */
      moveTo(statusBtn, 7.5, 0.8);
      click(8.4);
      tl.to(q('status-on'), { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power2.out' }, 8.45)
        .to(q('row-play'), { autoAlpha: 0, duration: 0.3 }, 8.45)
        .to(q('row-bg'), { autoAlpha: 1, duration: 0.4 }, 8.45)
        .to(miniF, { attr: { 'stroke-dashoffset': C_MINI * (1 - 3 / 5) }, duration: 0.6, ease: 'power2.out' }, 8.55)
        .to(q('mn-a'), { autoAlpha: 0, y: -6, duration: 0.2, ease: 'power1.in' }, 8.55)
        .to(q('mn-b'), { autoAlpha: 1, y: 0, duration: 0.35 }, 8.7)
        .to(q('big-f'), { attr: { 'stroke-dashoffset': C_BIG * (1 - 0.62) }, duration: 0.8, ease: 'power2.out' }, 8.8)
        .to(q('pct'), { innerText: 62, snap: { innerText: 1 }, duration: 0.8, ease: 'power2.out' }, 8.8)
        .to(q('done-n'), { innerText: 16, snap: { innerText: 1 }, duration: 0.3, ease: 'none' }, 8.8);
      moveTo(q('overall'), 9.3, 1.0, 0.25, 1.35);

      tl.to({}, { duration: 0.01 }, 11.6);
      return tl;
    },
  });
})();
