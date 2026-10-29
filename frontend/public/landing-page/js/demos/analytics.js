/* ==========================================================================
   Demo scene — Analytics (Performance & readiness)
   Scripted recreation of /student/analytics with fictional data.
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
    trend: SVG('<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
    trophy: SVG('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    target: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    chev: SVG('<path d="m6 9 6 6 6-6"/>', ' class="dm-an__chev"'),
    building: SVG('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>'),
    flame: SVG('<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4.5-9.5C13.5 8 12 9 11 9c0-2.5-1-5-3-7 0 4-4 6.5-4 12 0 4.3 3.6 8 8 8z"/>', ' class="dm-an__flame"'),
    spark: SVG('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
    arrow: SVG('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    alert: SVG('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
    info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
    check: SVG('<path d="M20 6 9 17l-5-5"/>', ' stroke-width="3"'),
    bench: SVG('<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>')
  };

  function odo(digits) {
    var strip = '';
    for (var d = 0; d < 10; d++) strip += '<span>' + d + '</span>';
    var cols = '';
    for (var i = 0; i < digits; i++) cols += '<span class="dm-odo__col"><span class="dm-odo__strip">' + strip + '</span></span>';
    return '<span class="dm-odo" aria-hidden="true">' + cols + '</span>';
  }
  function digitsOf(v, n) {
    var s = String(v);
    while (s.length < n) s = '0' + s;
    return s.split('').map(Number);
  }

  /* ---- fictional data ---- */
  var READY = 68;
  var MODS = [
    { k: 'Coding', s: 'DSA accuracy', v: 72 },
    { k: 'Assessments', s: 'Adjusted average', v: 64 },
    { k: 'Learning', s: 'Completion', v: 81 },
    { k: 'Interviews', s: 'Peer feedback average', v: 58 }
  ];
  var TREND = [41, 44, 43, 50, 53, 57, 62, 68];
  var TOPICS = [
    { k: 'Arrays & Hashing', v: 86, strong: true },
    { k: 'Two Pointers', v: 78 },
    { k: 'Trees', v: 67 },
    { k: 'Graphs', v: 52, gap: true },
    { k: 'Dynamic Programming', v: 41, gap: true }
  ];
  var GAPS = [
    { k: 'Arrays & Hashing', cur: 86, tgt: 75 },
    { k: 'Trees', cur: 67, tgt: 65 },
    { k: 'Graphs', cur: 52, tgt: 70 },
    { k: 'Dynamic Programming', cur: 41, tgt: 70 }
  ];

  /* ---- trend chart geometry ---- */
  var CW = 368, CH = 148, X0 = 30, X1 = 352;
  function px(i) { return X0 + (X1 - X0) * i / (TREND.length - 1); }
  function py(v) { return 12 + (80 - v) / 50 * 108; }
  function smoothPath(pts) {
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }

  var uid = 0;

  function build(root, id) {
    var pts = TREND.map(function (v, i) { return [px(i), py(v)]; });
    var line = smoothPath(pts);
    var area = line + ' L' + X1 + ' 124 L' + X0 + ' 124 Z';
    var grid = [40, 60, 80].map(function (v) {
      return '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + py(v) + '" y2="' + py(v) + '"/>';
    }).join('');
    var axis = [40, 60, 80].map(function (v) {
      return '<text x="0" y="' + (py(v) + 3) + '">' + v + '</text>';
    }).join('') + TREND.map(function (v, i) {
      return '<text x="' + px(i) + '" y="142" text-anchor="middle">W' + (i + 1) + '</text>';
    }).join('');
    var dots = pts.map(function (p, i) {
      return '<circle class="dm-an__pt" data-pt="' + i + '" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i === pts.length - 1 ? 5 : 3) + '"/>';
    }).join('');
    var last = pts[pts.length - 1];

    var week = [10, 16, 8, 18, 3, 14, 20].map(function (h, i) {
      return '<i' + (i === 4 ? ' class="is-off"' : '') + ' style="height:' + h + 'px"></i>';
    }).join('');

    var mods = MODS.map(function (m) {
      return '<div class="dm-an__mod"><div class="dm-an__mod-row">' + m.k + '<small>' + m.s + '</small><b>' + m.v + '</b></div>' +
        '<div class="dm-an__bar"><i data-w="' + m.v + '"></i></div></div>';
    }).join('');

    var topics = TOPICS.map(function (t) {
      var cls = t.v >= 75 ? 'is-hi' : t.v >= 55 ? 'is-mid' : 'is-lo';
      return '<div class="dm-an__trow"' + (t.gap ? ' data-gaprow' : '') + '><span class="dm-an__trow-bg"></span>' +
        '<div class="dm-an__trow-h">' + PP.esc(t.k) +
        (t.strong ? '<span class="dm-an__tag dm-an__tag--ok">Strong</span>' : '') +
        (t.gap ? '<span class="dm-an__tag dm-an__tag--bad">Gap</span>' : '') +
        '<b>' + t.v + '%</b></div>' +
        '<div class="dm-an__bar"><i class="' + cls + '" data-w="' + t.v + '"></i></div></div>';
    }).join('');

    var gaps = GAPS.map(function (g) {
      var met = g.cur >= g.tgt, diff = g.cur - g.tgt;
      return '<div class="dm-an__gap" data-gap>' +
        '<div class="dm-an__gap-h">' + PP.esc(g.k) +
          '<span class="dm-an__nums"><b>' + g.cur + '</b> / ' + g.tgt + '</span>' +
          '<span class="dm-an__delta ' + (met ? 'is-met' : 'is-gap') + '">' + (met ? '+' + diff : '−' + (-diff)) + '</span></div>' +
        '<div class="dm-an__gbar">' +
          '<span class="is-cur' + (met ? ' is-met' : '') + '" data-w="' + g.cur + '"></span>' +
          (met ? '' : '<span class="is-gapseg" style="left:' + g.cur + '%;width:' + (g.tgt - g.cur) + '%"></span>') +
          '<span class="is-tgt" style="left:' + g.tgt + '%"></span>' +
        '</div></div>';
    }).join('');

    root.innerHTML =
      '<div class="dm-an">' +
      '<div class="dm-an__top">' +
        '<div><div class="dm-an__kicker">Student analytics</div><div class="dm-h3">Performance &amp; readiness</div></div>' +
        '<span class="dm-an__spacer"></span>' +
        '<span class="dm-an__sync"><i></i>Updated just now</span>' +
        '<div class="dm-an__tabs" role="presentation"><span aria-selected="true">Overview</span><span>Coding</span><span>Assessments</span><span>Interviews</span><span>Learning</span><span>Placement</span></div>' +
      '</div>' +

      /* readiness */
      '<div class="dm-an__card dm-an__ready">' +
        '<div class="dm-an__ch"><div class="dm-h4">Overall readiness</div><span class="dm-an__pill dm-an__pill--brand">Last 30 days</span></div>' +
        '<div class="dm-an__ring"><svg viewBox="0 0 150 150" aria-hidden="true">' +
          
          '<circle class="dm-an__ring-track" cx="75" cy="75" r="66"/>' +
          '<circle class="dm-an__ring-bar" data-ring cx="75" cy="75" r="66" pathLength="100"/>' +
        '</svg><div class="dm-an__ring-c"><div class="dm-an__ring-num"><span data-odo="ready">' + odo(2) + '</span><small>/100</small></div><div class="dm-an__ring-lbl">Readiness</div></div></div>' +
        '<div class="dm-an__status" data-status><span class="dm-an__pill dm-an__pill--warn">' + IC.trend + 'Improving</span>' +
          '<p>Momentum is building. Keep the routine steady.</p></div>' +
        '<div class="dm-an__tiles">' +
          '<div class="dm-an__tile"><div class="dm-an__tile-k">Consistency</div><div class="dm-an__tile-v"><span data-odo="cons">' + odo(2) + '</span><small>/100</small><span class="dm-an__week" data-week>' + week + '</span></div></div>' +
          '<div class="dm-an__tile"><div class="dm-an__tile-k">Current streak</div><div class="dm-an__tile-v"><span data-odo="streak">' + odo(2) + '</span><small>days</small><small class="dm-an__best">Best 21</small></div></div>' +
        '</div>' +
        '<div class="dm-an__mods"><div class="dm-an__mods-h"><span>Module scores</span><span>/100</span></div>' + mods + '</div>' +
      '</div>' +

      /* trend */
      '<div class="dm-an__card dm-an__trend">' +
        '<div class="dm-an__ch"><div><div class="dm-h4">Readiness trend</div><small>Last 8 weeks</small></div><span class="dm-an__pill dm-an__pill--ok">' + IC.trend + '+27 pts</span></div>' +
        '<svg class="dm-an__chart" viewBox="0 0 ' + CW + ' ' + CH + '" aria-hidden="true">' +
          '<defs><linearGradient id="' + id + '-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--brand);stop-opacity:.16"/><stop offset="1" style="stop-color:var(--brand);stop-opacity:0"/></linearGradient>' +
          '<clipPath id="' + id + '-clip"><rect data-clip x="0" y="0" width="0" height="' + CH + '"/></clipPath></defs>' +
          '<g class="dm-an__grid">' + grid + '</g><g class="dm-an__axis">' + axis + '</g>' +
          '<g clip-path="url(#' + id + '-clip)"><path d="' + area + '" fill="url(#' + id + '-ag)"/><path class="dm-an__line" d="' + line + '"/></g>' +
          
          dots +
        '</svg>' +
        '<span class="dm-an__end-lbl" data-endlbl style="left:' + (14 + last[0] - 96) + 'px;top:' + (52 + last[1] - 34) + 'px">This week · 68</span>' +
      '</div>' +

      /* strongest / focus */
      '<div class="dm-an__sf">' +
        '<div class="is-good" data-sf><div class="dm-an__sf-k"><span class="dm-an__sf-ic">' + IC.trophy + '</span>Strongest area</div><div class="dm-an__sf-v">Arrays &amp; Hashing</div><div class="dm-an__sf-s">86% accuracy · verified</div></div>' +
        '<div class="is-focus" data-sf><div class="dm-an__sf-k"><span class="dm-an__sf-ic">' + IC.target + '</span>Focus area</div><div class="dm-an__sf-v">Dynamic Programming</div><div class="dm-an__sf-s">41% accuracy · 17 attempts</div></div>' +
      '</div>' +

      /* topics */
      '<div class="dm-an__card dm-an__topics">' +
        '<div class="dm-an__ch"><div><div class="dm-h4">Coding accuracy by topic</div><small>Verified from your submissions</small></div><span class="dm-an__pill">PrepCoding</span></div>' +
        '<div class="dm-an__trows">' + topics + '</div>' +
      '</div>' +

      /* benchmark */
      '<div class="dm-an__card dm-an__bench">' +
        '<div class="dm-an__ch"><div><div class="dm-h4">Company benchmark</div><small>Compare your evidence with company benchmarks.</small></div></div>' +
        '<div class="dm-an__select" data-select data-open="0">' + IC.building +
          '<span class="dm-an__select-lbl"><span class="is-ph" data-sel="a">Select a benchmark</span><span data-sel="b" style="opacity:0">Product SDE benchmark</span></span>' + IC.chev + '</div>' +
        '<div class="dm-an__menu" data-menu>' +
          '<div class="dm-an__opt"><span class="dm-an__opt-hl"></span><i class="is-a"></i><span>Service SDE benchmark</span><small>5 skills</small></div>' +
          '<div class="dm-an__opt" data-opt><span class="dm-an__opt-hl" data-opthl></span><i class="is-b"></i><span>Product SDE benchmark</span><small>6 skills</small></div>' +
          '<div class="dm-an__opt"><span class="dm-an__opt-hl"></span><i class="is-c"></i><span>Data Analyst benchmark</span><small>5 skills</small></div>' +
        '</div>' +
        '<div class="dm-an__empty" data-empty>' + IC.bench + '<span>Choose a benchmark to see target vs current.</span></div>' +
        '<div class="dm-an__gaps" data-gaps style="opacity:0">' +
          '<div class="dm-an__legend"><span><i></i>Current</span><span><i class="is-t"></i>Target</span><span><i class="is-g"></i>Gap</span></div>' +
          gaps +
          '<div class="dm-an__verified" data-verified>' + IC.alert + 'Verified gaps:<span class="dm-an__pill dm-an__pill--bad">DP</span><span class="dm-an__pill dm-an__pill--bad">Graphs</span></div>' +
        '</div>' +
      '</div>' +

      /* next step */
      '<div class="dm-an__card dm-an__next" data-next>' +
        '<div class="dm-an__next-in">' +
          '<div class="dm-an__next-k">Recommended next step<span class="dm-an__next-upd" data-upd>Updated for Product SDE</span></div>' +
          '<div class="dm-an__next-body" data-nextold>' +
            '<div class="dm-an__next-t">Finish the Graphs module in Learning</div>' +
            '<div class="dm-an__next-chips"><span class="dm-an__pill">Graphs</span><span class="dm-an__pill">2 lessons left</span></div>' +
            '<div class="dm-an__next-ev"><b>Evidence:</b> Graphs accuracy 52% across 23 attempts; module 60% complete.</div>' +
          '</div>' +
          '<div class="dm-an__next-body" data-nextbody>' +
            '<div class="dm-an__next-t">Solve 3 medium DP problems</div>' +
            '<div class="dm-an__next-chips"><span class="dm-an__pill">Dynamic Programming</span><span class="dm-an__pill dm-an__diff">Medium × 3</span></div>' +
            '<div class="dm-an__next-ev"><b>Evidence:</b> DP accuracy 41% across 17 attempts, 29 pts below the Product SDE target.</div>' +
          '</div>' +
          '<span class="dm-an__go" data-goold>Open Learning' + IC.arrow + '</span>' +
          '<span class="dm-an__go" data-go>Open QuickPrep' + IC.arrow + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="dm-an__foot">' + IC.info + '<b>Readiness is preparation guidance, not a hiring prediction.</b><span>Analytics use tracked PeerPrep activity and configured scoring rules.</span></div>' +

      '<div class="dm-cursor" aria-hidden="true"><span class="dm-cursor__ripple"></span>' +
        '<svg class="dm-cursor__arrow" viewBox="0 0 24 24"><path d="M4 2.5v16.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.4h6z"/></svg></div>' +
      '</div>';
  }

  PP.demos.register('analytics', {
    title: 'Analytics',
    route: '/student/analytics',
    nav: 'analytics',
    caption: 'See readiness, consistency and topic accuracy, compare against a company benchmark, and get the next best step.',
    description: 'Animated recreation of the PeerPrep analytics overview with fictional data. Overall readiness is 68 out of 100 with the status "Improving", alongside module scores for Coding, Assessments, Learning and Interviews, a consistency score of 74, a 12-day streak and an eight-week readiness trend. The strongest area is Arrays & Hashing and the focus area is Dynamic Programming, with topic accuracy bars. The cursor opens the company benchmark selector and picks "Product SDE benchmark"; target-versus-current bars appear and mark verified gaps in DP and Graphs, which are also highlighted in the topic list. The recommended next step updates to "Solve 3 medium DP problems", with the evidence behind it and an Open QuickPrep button. A footnote states that readiness is preparation guidance, not a hiring prediction.',
    duration: 11200,
    create: function (root) {
      var id = 'dman' + (++uid);
      build(root, id);
      var $ = function (s) { return root.querySelector(s); };
      var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
      var odoStrips = function (k) { return $$('[data-odo="' + k + '"] .dm-odo__strip'); };

      // The overview is already populated: final values are static markup state.
      $$('.dm-an__mod [data-w], .dm-an__trow [data-w]').forEach(function (b) { b.style.width = b.getAttribute('data-w') + '%'; });
      $('[data-ring]').style.strokeDashoffset = 100 - READY;
      $('[data-clip]').setAttribute('width', CW);
      [['ready', READY], ['cons', 74], ['streak', 12]].forEach(function (p) {
        var s = odoStrips(p[0]), dg = digitsOf(p[1], s.length);
        s.forEach(function (el, i) { el.style.transform = 'translateY(' + (-dg[i] * 10) + '%)'; });
      });
      if (!window.gsap) return null;

      var tl = gsap.timeline({ paused: true });
      // initial state: applied now (first frame) and recorded at 0 (restart)
      function at0(t, v) { gsap.set(t, v); tl.set(t, v, 0); }

      var cur = $('.dm-cursor'), arrow = $('.dm-cursor__arrow'), rip = $('.dm-cursor__ripple');
      var gapRows = $$('[data-gap]');

      at0(cur, { x: 640, y: 600, opacity: 1 });
      at0(arrow, { scale: 1 });
      at0(rip, { opacity: 0, scale: 0.3 });
      at0($('[data-menu]'), { autoAlpha: 0, y: -4 });
      at0($('.dm-an__chev'), { rotation: 0 });
      at0($('[data-select]'), { attr: { 'data-open': '0' } });
      at0($('[data-opthl]'), { opacity: 0 });
      at0($('[data-sel="a"]'), { opacity: 1, y: 0 });
      at0($('[data-sel="b"]'), { opacity: 0, y: 6 });
      at0($('[data-empty]'), { autoAlpha: 1 });
      at0($('[data-gaps]'), { autoAlpha: 0 });
      at0($$('.dm-an__gbar > .is-cur'), { width: '0%' });
      at0($$('.is-tgt'), { opacity: 0 });
      at0($$('.is-gapseg'), { scaleX: 0 });
      at0($$('.dm-an__delta'), { opacity: 0 });
      at0($('[data-verified]'), { opacity: 0 });
      at0($$('[data-gaprow] .dm-an__trow-bg, [data-gaprow] .dm-an__tag--bad'), { opacity: 0 });
      at0($('[data-nextold]'), { autoAlpha: 1, y: 0 });
      at0($('[data-nextbody]'), { autoAlpha: 0, y: 8 });
      at0($('[data-goold]'), { autoAlpha: 1 });
      at0($('[data-go]'), { autoAlpha: 0 });
      at0($('[data-upd]'), { autoAlpha: 0 });
      at0($('[data-next]'), { attr: { 'data-fresh': '0' } });
      at0($('[data-go]'), { attr: { 'data-hover': '0' } });

      function click(at) {
        tl.to(arrow, { scale: 0.82, duration: 0.09, ease: 'power2.out' }, at)
          .to(arrow, { scale: 1, duration: 0.25, ease: 'power2.out' }, at + 0.09)
          .fromTo(rip, { scale: 0.3, opacity: 0.55 }, { scale: 1.6, opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, at);
      }

      // ---------- 1. open benchmark selector, pick Product SDE ----------
      tl.to(cur, { x: 884, y: 160, duration: 1.0, ease: 'power3.inOut' }, 0.6);
      click(1.7);
      tl.set($('[data-select]'), { attr: { 'data-open': '1' } }, 1.75)
        .to($('[data-menu]'), { autoAlpha: 1, y: 0, duration: 0.28, ease: 'power2.out' }, 1.75)
        .to($('.dm-an__chev'), { rotation: 180, duration: 0.3 }, 1.75)
        .to(cur, { x: 905, y: 243, duration: 0.6, ease: 'power2.inOut' }, 2.1)
        .to($('[data-opthl]'), { opacity: 1, duration: 0.15 }, 2.6);
      click(2.95);
      tl.to($('[data-menu]'), { autoAlpha: 0, y: -4, duration: 0.2, ease: 'power2.in' }, 3.05)
        .set($('[data-select]'), { attr: { 'data-open': '0' } }, 3.1)
        .to($('.dm-an__chev'), { rotation: 0, duration: 0.25 }, 3.05)
        .to($('[data-sel="a"]'), { opacity: 0, y: -6, duration: 0.2 }, 3.1)
        .to($('[data-sel="b"]'), { opacity: 1, y: 0, duration: 0.3 }, 3.2)
        .to($('[data-empty]'), { autoAlpha: 0, duration: 0.25 }, 3.15)
        .to($('[data-gaps]'), { autoAlpha: 1, duration: 0.3 }, 3.25)
        .to(cur, { x: 1060, y: 330, duration: 0.8, ease: 'power2.inOut' }, 3.3);

      // ---------- 2. target vs current fills in ----------
      gapRows.forEach(function (row, i) {
        var at = 3.35 + i * 0.14;
        var c = row.querySelector('.is-cur');
        tl.to(c, { width: c.getAttribute('data-w') + '%', duration: 0.9, ease: 'power3.out' }, at)
          .to(row.querySelector('.is-tgt'), { opacity: 1, duration: 0.3 }, at + 0.5)
          .to(row.querySelector('.dm-an__delta'), { opacity: 1, duration: 0.3 }, at + 0.7);
        var seg = row.querySelector('.is-gapseg');
        if (seg) tl.to(seg, { scaleX: 1, duration: 0.55, ease: 'power2.out' }, at + 0.8);
      });
      tl.to($('[data-verified]'), { opacity: 1, duration: 0.45 }, 4.8)
        .to($$('[data-gaprow] .dm-an__trow-bg, [data-gaprow] .dm-an__tag--bad'), { opacity: 1, duration: 0.45, stagger: 0.08 }, 5.0);

      // ---------- 3. recommended next step updates ----------
      tl.set($('[data-next]'), { attr: { 'data-fresh': '1' } }, 5.7)
        .to($('[data-nextold]'), { autoAlpha: 0, y: -6, duration: 0.22, ease: 'power2.in' }, 5.7)
        // old and new buttons share a position and differ in width: never overlap them
        .to($('[data-goold]'), { autoAlpha: 0, duration: 0.2, ease: 'power2.in' }, 5.7)
        .to($('[data-nextbody]'), { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 5.9)
        .to($('[data-go]'), { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, 6.0)
        .to($('[data-upd]'), { autoAlpha: 1, duration: 0.4 }, 6.2)
        .to(cur, { x: 868, y: 612, duration: 1.0, ease: 'power3.inOut' }, 6.6)
        .set($('[data-go]'), { attr: { 'data-hover': '1' } }, 7.55);

      // hold the payoff
      tl.to({}, { duration: 2.0 }, 9.2);
      return tl;
    }
  });
})();