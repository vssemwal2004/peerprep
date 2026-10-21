/* Demo scene: coordinator / placement-team reports
   (route /coordinator/assessment/reports). Fictional demo data only.
   Stage is 1128 x 680 logical px. The markup's default state IS the first
   frame; the timeline only animates changes:
     1. sort the candidate table by Readiness (rows glide to new places)
     2. review a flagged session (status -> Reviewed, KPI counts update)
     3. Export CSV -> "Report exported" toast, held as the payoff. */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var B = 'dm-admin__';
  var ROW_H = 42; // must match .dm-admin__tr height in css/demos/admin.css

  var ICON = {
    chev: '<path d="m6 9 6 6 6-6"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20"/>',
    down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  };
  function ic(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  var CURSOR = '<div class="dm-cursor"><span class="dm-cursor__ring"></span><svg class="dm-cursor__ptr" viewBox="0 0 24 24"><path d="M5 2.8v15.6l4.3-4.1 2.9 6.6 2.6-1.1-2.9-6.5h6z"/></svg></div>';

  // Candidate rows in initial (A–Z) order. Fictional people.
  // [name, roll, assessments, avg score, readiness, integrity: ok|rev|flag]
  var ROWS = [
    ['Aarav S.', '23CSE014', '6/6', 70, 68, 'ok'],
    ['Ananya R.', '23CSE021', '6/6', 88, 91, 'ok'],
    ['Dev K.', '23CSE033', '5/6', 61, 58, 'flag'],
    ['Ishita P.', '23CSE040', '6/6', 74, 72, 'ok'],
    ['Kabir S.', '23CSE047', '4/6', 49, 43, 'rev'],
    ['Meera J.', '23CSE052', '6/6', 79, 77, 'ok'],
    ['Rohan T.', '23CSE066', '5/6', 55, 51, 'flag'],
    ['Riya M.', '23CSE071', '6/6', 85, 88, 'ok'],
  ];
  var REVIEW_ROW = 2; // Dev K. — the session the coordinator reviews

  function band(r) { return r >= 80 ? 'ready' : r >= 60 ? 'track' : r >= 40 ? 'dev' : 'focus'; }
  function initials(n) { return n.replace(/[^A-Z]/g, '').slice(0, 2); }

  function integrity(state) {
    if (state === 'flag') {
      return '<span class="' + B + 'pill ' + B + 'pill--flag">' + ic('flag') + 'Flagged for review</span>';
    }
    if (state === 'rev') {
      return '<span class="' + B + 'pill ' + B + 'pill--rev">' + ic('check') + 'Reviewed</span>';
    }
    return '<span class="' + B + 'pill ' + B + 'pill--ok">Clean</span>';
  }

  function rowsHtml() {
    return ROWS.map(function (r, i) {
      var isReviewTarget = i === REVIEW_ROW;
      var stateCell = isReviewTarget
        ? '<span class="' + B + 'swap"><span class="' + B + 'st-a">' + integrity('flag') + '</span><span class="' + B + 'st-b">' + integrity('rev') + '</span></span>'
        : integrity(r[5]);
      var action = r[5] === 'flag'
        ? (isReviewTarget
          ? '<span class="' + B + 'act ' + B + 'act--review"><span class="' + B + 'act-a">Review</span><span class="' + B + 'act-b">View</span></span>'
          : '<span class="' + B + 'act ' + B + 'act--review">Review</span>')
        : '<span class="' + B + 'act">View</span>';
      return '' +
        '<div class="' + B + 'tr' + (isReviewTarget ? ' ' + B + 'tr--target' : '') + '" data-i="' + i + '">' +
          '<span class="' + B + 'who"><span class="' + B + 'av">' + initials(r[0]) + '</span><span class="' + B + 'who-t"><b>' + r[0] + '</b><small>' + r[1] + '</small></span></span>' +
          '<span class="' + B + 'num">' + r[2] + '</span>' +
          '<span class="' + B + 'num">' + r[3] + '%</span>' +
          '<span class="' + B + 'rd ' + B + 'rd--' + band(r[4]) + '"><span class="' + B + 'rd-track"><i style="width:' + r[4] + '%"></i></span><b>' + r[4] + '</b></span>' +
          '<span class="' + B + 'int">' + stateCell + '</span>' +
          '<span class="' + B + 'act-cell">' + action + '</span>' +
        '</div>';
    }).join('');
  }

  // Readiness distribution for a 214-student cohort (fictional).
  var DIST = [
    ['Ready', '80–100', 38, 'ready'],
    ['On track', '60–79', 81, 'track'],
    ['Developing', '40–59', 63, 'dev'],
    ['Needs focus', 'Below 40', 32, 'focus'],
  ];
  var TOPICS = [
    ['Dynamic Programming', 41],
    ['Graphs', 48],
    ['OS · Deadlocks', 53],
    ['SQL Joins', 57],
  ];

  function html() {
    var dist = DIST.map(function (d) {
      return '<li class="' + B + 'dist-row ' + B + 'dist-row--' + d[3] + '">' +
        '<span class="' + B + 'dist-l"><b>' + d[0] + '</b><small>' + d[1] + '</small></span>' +
        '<span class="' + B + 'dist-track"><i style="width:' + (d[2] / 81 * 100).toFixed(1) + '%"></i></span>' +
        '<span class="' + B + 'dist-n"><b>' + d[2] + '</b><small>' + Math.round(d[2] / 214 * 100) + '%</small></span>' +
      '</li>';
    }).join('');
    var topics = TOPICS.map(function (t) {
      return '<li><span>' + t[0] + '</span><span class="' + B + 'tp-bar"><i style="width:' + t[1] + '%"></i></span><b>' + t[1] + '%</b></li>';
    }).join('');

    return '' +
    '<div class="' + B + 'wrap">' +
      '<header class="' + B + 'head">' +
        '<div class="' + B + 'title-wrap">' +
          '<p class="' + B + 'crumb">Assessment Reports <span>/</span> Cohort overview</p>' +
          '<div class="dm-h3 ' + B + 'title">Preparation readiness</div>' +
        '</div>' +
        '<div class="' + B + 'controls">' +
          '<span class="' + B + 'select ' + B + 'select--cohort">' + ic('users') + '<span>B.Tech CSE &middot; Semester 7</span>' + ic('chev', B + 'chev') + '</span>' +
          '<span class="' + B + 'select">' + ic('cal') + '<span>Last 30 days</span>' + ic('chev', B + 'chev') + '</span>' +
          '<span class="' + B + 'select ' + B + 'excel">Download Excel</span>' +
          '<span class="' + B + 'export">' + ic('down') +
            '<span class="' + B + 'ex-swap"><span class="' + B + 'ex-a">Export CSV</span><span class="' + B + 'ex-b">Exporting&hellip;</span></span>' +
          '</span>' +
        '</div>' +
      '</header>' +

      '<section class="' + B + 'kpis">' +
        '<div class="' + B + 'kpi"><span class="' + B + 'kpi-l">Students active</span><b class="' + B + 'kpi-v">196</b><small>of 214 in cohort</small></div>' +
        '<div class="' + B + 'kpi"><span class="' + B + 'kpi-l">Assessments completed</span><b class="' + B + 'kpi-v">1,148</b><small><em class="' + B + 'up">+86</em> this week</small></div>' +
        '<div class="' + B + 'kpi"><span class="' + B + 'kpi-l">Avg readiness</span><b class="' + B + 'kpi-v">64<span class="' + B + 'unit">%</span></b><small><em class="' + B + 'up">+3 pts</em> vs last month</small></div>' +
        '<div class="' + B + 'kpi ' + B + 'kpi--flag"><span class="' + B + 'kpi-l">Flagged sessions</span><b class="' + B + 'kpi-v ' + B + 'flagn">5</b><small><span class="' + B + 'revn">12</span> sessions reviewed</small></div>' +
      '</section>' +

      '<div class="' + B + 'grid">' +
        '<div class="' + B + 'side">' +
          '<section class="' + B + 'card ' + B + 'dist">' +
            '<div class="' + B + 'card-h"><div class="dm-h4">Readiness distribution</div><span class="' + B + 'meta">214 students</span></div>' +
            '<ul class="' + B + 'dist-list">' + dist + '</ul>' +
          '</section>' +
          '<section class="' + B + 'card ' + B + 'topics">' +
            '<div class="' + B + 'card-h"><div class="dm-h4">Topics needing focus</div><span class="' + B + 'meta">Coding accuracy</span></div>' +
            '<ul class="' + B + 'tp-list">' + topics + '</ul>' +
          '</section>' +
        '</div>' +

        '<section class="' + B + 'card ' + B + 'table">' +
          '<div class="' + B + 'card-h"><div class="dm-h4">Candidate performance</div>' +
            '<span class="' + B + 'tools"><span class="' + B + 'search">Search candidates&hellip;</span><span class="' + B + 'filter">' + ic('filter') + 'All assessments</span></span>' +
          '</div>' +
          '<div class="' + B + 'thead">' +
            '<span class="' + B + 'th ' + B + 'th--name">Candidate' + ic('arrowUp', B + 'sort ' + B + 'sort--name') + '</span>' +
            '<span class="' + B + 'th">Attempted</span>' +
            '<span class="' + B + 'th">Avg score</span>' +
            '<span class="' + B + 'th ' + B + 'th--rd">Readiness' + ic('arrowDown', B + 'sort ' + B + 'sort--rd') + '</span>' +
            '<span class="' + B + 'th">Integrity</span>' +
            '<span class="' + B + 'th"></span>' +
          '</div>' +
          '<div class="' + B + 'tbody">' + rowsHtml() + '</div>' +
          '<div class="' + B + 'tfoot"><span>Showing 8 of 214</span><span class="' + B + 'pager"><i>Prev</i><i class="is-on">1</i><i>2</i><i>3</i><i>Next</i></span></div>' +
        '</section>' +
      '</div>' +

      '<div class="' + B + 'toast" role="status">' +
        '<span class="' + B + 'toast-ic">' + ic('check') + '</span>' +
        '<span class="' + B + 'toast-t"><b>Report exported</b><small>btech-cse-sem7-report.csv &middot; 214 rows</small></span>' +
      '</div>' +
    '</div>' + CURSOR;
  }

  // Position of an element inside the stage (ignores transforms).
  function pt(el, root, fx, fy) {
    var x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x + el.offsetWidth * (fx == null ? 0.5 : fx), y: y + el.offsetHeight * (fy == null ? 0.5 : fy) };
  }

  PP.demos.register('admin', {
    title: 'Reports',
    route: '/coordinator/assessment/reports',
    nav: 'analytics',
    caption: 'Cohort readiness, integrity review and exports for coordinators and placement teams.',
    description: 'Animated walkthrough of a PeerPrep coordinator reports screen with fictional demo data for the B.Tech CSE Semester 7 cohort: students active, assessments completed, average readiness and sessions flagged for review, a readiness distribution, topics needing focus and a candidate performance table. The cursor sorts the table by readiness, reviews a flagged session so its status changes to Reviewed, then clicks Export CSV and a Report exported confirmation appears.',
    duration: 11500,
    // Story beats (seconds) — the universities section legend follows these.
    steps: [
      { start: 0, end: 3.0 },   // rank the cohort by readiness
      { start: 3.0, end: 6.1 }, // review a flagged session
      { start: 6.1, end: 11.5 }, // export the report
    ],
    create: function (root) {
      root.innerHTML = html();
      var q = function (s) { return root.querySelector('.' + B + s); };
      var cursor = root.querySelector('.dm-cursor');
      var ptr = root.querySelector('.dm-cursor__ptr');
      var ring = root.querySelector('.dm-cursor__ring');
      var rows = Array.prototype.slice.call(root.querySelectorAll('.' + B + 'tr'));
      var target = q('tr--target');
      var thRd = q('th--rd');
      var exportBtn = q('export');

      // Sorted order by readiness (desc) -> each row's new index.
      var order = ROWS.map(function (r, i) { return i; }).sort(function (a, b) { return ROWS[b][4] - ROWS[a][4]; });
      var newIndex = [];
      order.forEach(function (rowI, k) { newIndex[rowI] = k; });

      var tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

      function moveTo(getPt, at, dur) {
        tl.to(cursor, {
          x: function () { return getPt().x; },
          y: function () { return getPt().y; },
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
      tl.set(cursor, { x: 640, y: 646 }, 0)
        .set(ring, { opacity: 0 }, 0)
        .set(rows, { y: 0 }, 0)
        .set(q('sort--name'), { autoAlpha: 1 }, 0)
        .set(q('sort--rd'), { autoAlpha: 0, y: -3 }, 0)
        .set(thRd, { '--on': 0 }, 0)
        .set(target, { '--hl': 0 }, 0)
        .set(q('st-a'), { autoAlpha: 1, y: 0 }, 0)
        .set(q('st-b'), { autoAlpha: 0, y: 5 }, 0)
        .set(q('act-a'), { autoAlpha: 1 }, 0)
        .set(q('act-b'), { autoAlpha: 0 }, 0)
        .set(q('flagn'), { innerText: 5 }, 0)
        .set(q('revn'), { innerText: 12 }, 0)
        .set(q('kpi--flag'), { '--tick': 0 }, 0)
        .set(q('ex-a'), { autoAlpha: 1 }, 0)
        .set(q('ex-b'), { autoAlpha: 0 }, 0)
        .set(exportBtn, { '--busy': 0 }, 0)
        .set(q('toast'), { autoAlpha: 0, y: 14 }, 0);

      /* ---------- 1. sort by Readiness ---------- */
      moveTo(function () { return pt(thRd, root, 0.42, 0.55); }, 0.5, 1.1);
      click(1.75);
      tl.to(thRd, { '--on': 1, duration: 0.3, ease: 'none' }, 1.8)
        .to(q('sort--name'), { autoAlpha: 0, duration: 0.2 }, 1.8)
        .to(q('sort--rd'), { autoAlpha: 1, y: 0, duration: 0.35 }, 1.85);
      rows.forEach(function (row, i) {
        tl.to(row, { y: (newIndex[i] - i) * ROW_H, duration: 0.75, ease: 'power3.inOut' }, 1.9 + Math.abs(newIndex[i] - i) * 0.015);
      });

      /* ---------- 2. review Dev K.'s flagged session ---------- */
      var reviewBtn = target.querySelector('.' + B + 'act');
      function reviewPt() {
        var p = pt(reviewBtn, root, 0.5, 0.55);
        return { x: p.x, y: p.y + (newIndex[REVIEW_ROW] - REVIEW_ROW) * ROW_H };
      }
      moveTo(function () {
        var p = reviewPt();
        return { x: p.x - 180, y: p.y + 6 };
      }, 3.1, 0.9);
      tl.to(target, { '--hl': 1, duration: 0.25, ease: 'none' }, 3.75);
      moveTo(reviewPt, 4.05, 0.6);
      click(4.75);
      tl.to(q('act-a'), { autoAlpha: 0, duration: 0.15 }, 4.8)
        .to(q('act-b'), { autoAlpha: 1, duration: 0.3 }, 4.95)
        .to(reviewBtn, { '--done': 1, duration: 0.3, ease: 'none' }, 4.95)
        .to(q('st-a'), { autoAlpha: 0, y: -5, duration: 0.22, ease: 'power1.in' }, 4.85)
        .to(q('st-b'), { autoAlpha: 1, y: 0, duration: 0.4 }, 5.05)
        .to(q('kpi--flag'), { '--tick': 1, duration: 0.3, ease: 'none' }, 5.15)
        .to(q('flagn'), { innerText: 4, snap: { innerText: 1 }, duration: 0.25, ease: 'none' }, 5.2)
        .to(q('revn'), { innerText: 13, snap: { innerText: 1 }, duration: 0.25, ease: 'none' }, 5.2)
        .to(q('kpi--flag'), { '--tick': 0, duration: 0.6, ease: 'none' }, 5.9)
        .to(target, { '--hl': 0, duration: 0.4, ease: 'none' }, 6.0);

      /* ---------- 3. Export CSV ---------- */
      moveTo(function () { return pt(exportBtn, root, 0.5, 0.55); }, 6.0, 1.15);
      click(7.3);
      tl.to(exportBtn, { scale: 0.97, duration: 0.1, ease: 'power1.out' }, 7.3)
        .to(exportBtn, { scale: 1, duration: 0.3, ease: 'power2.out' }, 7.4)
        .to(exportBtn, { '--busy': 1, duration: 0.2, ease: 'none' }, 7.35)
        .to(q('ex-a'), { autoAlpha: 0, duration: 0.15 }, 7.35)
        .to(q('ex-b'), { autoAlpha: 1, duration: 0.2 }, 7.45)
        .to(q('ex-b'), { autoAlpha: 0, duration: 0.2 }, 8.15)
        .to(q('ex-a'), { autoAlpha: 1, duration: 0.25 }, 8.3)
        .to(exportBtn, { '--busy': 0, duration: 0.25, ease: 'none' }, 8.25)
        .to(q('toast'), { autoAlpha: 1, y: 0, duration: 0.55, ease: 'expo.out' }, 8.3);
      // drift away from the button and hold the payoff
      moveTo(function () { return pt(q('tfoot'), root, 0.36, 0.6); }, 8.8, 1.1);
      tl.to({}, { duration: 0.01 }, 11.5);
      return tl;
    },
  });
})();
