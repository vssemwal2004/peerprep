/* Demo scene: student dashboard (route /student/dashboard).
   Fictional demo data. Stage is 1128 x 680 logical px.
   The markup's default state IS the first frame (the hero laptop shows it
   before the timeline runs); the timeline only animates changes. */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var C_RING = 2 * Math.PI * 46;   // challenge ring circumference
  var C_DONUT = 2 * Math.PI * 38;  // coding-progress donut circumference

  // Position of an element inside the stage (ignores transforms).
  function pt(el, root, fx, fy) {
    var x = 0, y = 0, n = el;
    while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x + el.offsetWidth * (fx == null ? 0.5 : fx), y: y + el.offsetHeight * (fy == null ? 0.5 : fy) };
  }

  var ICON = {
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  function ic(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }
  var CURSOR = '<div class="dm-cursor"><span class="dm-cursor__ring"></span><svg class="dm-cursor__ptr" viewBox="0 0 24 24"><path d="M5 2.8v15.6l4.3-4.1 2.9 6.6 2.6-1.1-2.9-6.5h6z"/></svg></div>';

  // Donut segments (86 / 54 / 12 of 152) with 2px gaps.
  function donutSegs(B) {
    var parts = [['e', 86], ['m', 54], ['h', 12]], total = 152, off = 0, out = '';
    parts.forEach(function (p) {
      var len = C_DONUT * p[1] / total;
      out += '<circle class="' + B + 'seg ' + B + 'seg--' + p[0] + '" cx="50" cy="50" r="38" stroke-dasharray="' + Math.max(0, len - 2).toFixed(2) + ' ' + C_DONUT.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"/>';
      off += len;
    });
    return out;
  }

  function html() {
    var B = 'dm-dashboard__';
    return '' +
    '<div class="' + B + 'wrap">' +
      '<header class="' + B + 'hero">' +
        '<div class="' + B + 'hello-wrap">' +
          '<p class="' + B + 'kicker">Your progress and priorities</p>' +
          '<div class="dm-h3 ' + B + 'hello">Good evening, Aarav</div>' +
          '<p class="' + B + 'sub">Pick up right where you stopped. One problem or one lesson today keeps you moving.</p>' +
        '</div>' +
        '<div class="' + B + 'stats">' +
          '<div class="' + B + 'stat ' + B + 'stat--lvl">' +
            '<div class="' + B + 'stat-top"><span>Level 7</span><span><b class="' + B + 'xp">860</b> / 1,200 XP</span></div>' +
            '<div class="' + B + 'lvl-track"><i class="' + B + 'lvl-fill"></i></div>' +
          '</div>' +
          '<div class="' + B + 'stat ' + B + 'stat--streak">' +
            '<span>Streak</span><b><span class="' + B + 'hn">12</span> days</b>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<div class="' + B + 'grid">' +
        /* ---- column A ---- */
        '<div class="' + B + 'col">' +
          '<section class="' + B + 'card ' + B + 'continue">' +
            '<div class="' + B + 'head"><div class="dm-h4">Continue where you left off</div><span class="' + B + 'tag">Coding</span></div>' +
            '<div class="' + B + 'prob">' +
              '<span class="' + B + 'prob-ic">' + ic('code') + '</span>' +
              '<div class="' + B + 'prob-txt">' +
                '<span class="' + B + 'mono">Your last run &middot; Python</span>' +
                '<b>Longest Unique-Character Window</b>' +
                '<span class="' + B + 'tags"><span class="' + B + 'diff ' + B + 'diff--m">Medium</span><span class="' + B + 'tag">Sliding Window</span><span class="' + B + 'tag">Strings</span></span>' +
              '</div>' +
            '</div>' +
            '<pre class="' + B + 'code"><span><i class="k">def</i> <i class="f">length_of_longest</i>(s):</span>' +
              '<span>    seen, left, best = {}, <i class="n">0</i>, <i class="n">0</i></span>' +
              '<span>    <i class="k">for</i> right, ch <i class="k">in</i> enumerate(s):</span>' +
              '<span>        <i class="k">if</i> ch <i class="k">in</i> seen <i class="k">and</i> seen[ch] &gt;= left:</span></pre>' +
            '<div class="' + B + 'cfoot">' +
              '<span class="' + B + 'status"><i></i>Attempted, not solved yet</span>' +
              '<span class="' + B + 'btn">Resume coding' + ic('arrow') + '</span>' +
            '</div>' +
          '</section>' +

          '<section class="' + B + 'card ' + B + 'progress">' +
            '<div class="' + B + 'head"><div class="dm-h4">Coding progress</div><span class="' + B + 'meta"><b>152</b> solved</span></div>' +
            '<div class="' + B + 'prow">' +
              '<div class="' + B + 'donut">' +
                '<svg viewBox="0 0 100 100" aria-hidden="true">' +
                  '<circle class="' + B + 'donut-track" cx="50" cy="50" r="38"/>' + donutSegs(B) +
                '</svg>' +
                '<span class="' + B + 'donut-c"><b>152</b><small>solved</small></span>' +
              '</div>' +
              '<div class="' + B + 'bars">' +
                '<div class="' + B + 'bar ' + B + 'bar--e"><span>Easy</span><b>86</b><div class="' + B + 'track"><i style="width:57%"></i></div></div>' +
                '<div class="' + B + 'bar ' + B + 'bar--m"><span>Medium</span><b>54</b><div class="' + B + 'track"><i style="width:36%"></i></div></div>' +
                '<div class="' + B + 'bar ' + B + 'bar--h"><span>Hard</span><b>12</b><div class="' + B + 'track"><i style="width:9%"></i></div></div>' +
              '</div>' +
            '</div>' +
            '<div class="' + B + 'next">' +
              '<div class="' + B + 'next-h"><b>Next in practice</b><span>Unsolved, easiest first</span></div>' +
              '<div class="' + B + 'nrow"><span class="' + B + 'diff ' + B + 'diff--e">Easy</span><span class="' + B + 'nrow-t">Anagram Check</span><span class="' + B + 'solve">Solve</span></div>' +
              '<div class="' + B + 'nrow"><span class="' + B + 'diff ' + B + 'diff--m">Medium</span><span class="' + B + 'nrow-t">K-th Largest Value</span><span class="' + B + 'solve">Solve</span></div>' +
            '</div>' +
          '</section>' +
        '</div>' +

        /* ---- column B ---- */
        '<div class="' + B + 'col">' +
          '<section class="' + B + 'card ' + B + 'challenge">' +
            '<div class="' + B + 'head"><div class="dm-h4">Daily challenge</div><span class="' + B + 'meta ' + B + 'mono">ends in 05:42:10</span></div>' +
            '<div class="' + B + 'ringrow">' +
              '<div class="' + B + 'ring">' +
                '<svg viewBox="0 0 110 110" aria-hidden="true">' +
                  '<circle class="' + B + 'ring-track" cx="55" cy="55" r="46"/>' +
                  '<circle class="' + B + 'ring-fill" cx="55" cy="55" r="46" stroke-dasharray="' + C_RING.toFixed(2) + '" stroke-dashoffset="' + (C_RING / 3).toFixed(2) + '"/>' +
                '</svg>' +
                '<span class="' + B + 'ring-c"><span class="' + B + 'rc ' + B + 'rc--a"><b>2/3</b><small>missions</small></span><span class="' + B + 'rc ' + B + 'rc--b"><b>3/3</b><small>all done</small></span></span>' +
              '</div>' +
              '<div class="' + B + 'ringtxt">' +
                '<b>Today\'s missions</b>' +
                '<span>Finish all three to keep your streak and earn bonus XP.</span>' +
                '<span class="' + B + 'xpnote"><span>+<span class="' + B + 'xpn">15</span></span> XP earned today</span>' +
              '</div>' +
            '</div>' +
            '<ul class="' + B + 'missions">' +
              '<li class="is-done"><span class="' + B + 'mcheck">' + ic('check') + '</span><span class="' + B + 'mt">Solve 1 Medium problem</span><span class="' + B + 'mxp">+10 XP</span></li>' +
              '<li class="is-done"><span class="' + B + 'mcheck">' + ic('check') + '</span><span class="' + B + 'mt">Watch a video lesson</span><span class="' + B + 'mxp">+5 XP</span></li>' +
              '<li class="' + B + 'm3"><span class="' + B + 'mbg"></span><span class="' + B + 'mcheck"><span class="' + B + 'mcheck-on">' + ic('check') + '</span></span><span class="' + B + 'mt">Merge Overlapping Ranges<small>Daily challenge &middot; Medium</small></span><span class="' + B + 'mxp">+20 XP</span></li>' +
            '</ul>' +
            '<div class="' + B + 'cta-wrap">' +
              '<span class="' + B + 'cta"><span class="' + B + 'cta-a">Continue challenge' + ic('arrow') + '</span><span class="' + B + 'cta-b">' + ic('check') + 'Completed today</span></span>' +
            '</div>' +
          '</section>' +

          '<section class="' + B + 'card ' + B + 'streak">' +
            '<div class="' + B + 'streak-top">' +
              '<div class="' + B + 'streak-n"><b class="' + B + 'sn">12</b><span>day streak</span></div>' +
              '<div class="' + B + 'best"><small>Best</small><b>21 days</b></div>' +
            '</div>' +
            '<div class="' + B + 'week">' +
              ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d, i) {
                var cls = i < 5 ? ' is-on' : (i === 5 ? ' is-today' : '');
                return '<span class="' + B + 'day' + cls + '"><i>' + (i === 5 ? '<em></em>' : '') + '</i><small>' + d + '</small></span>';
              }).join('') +
            '</div>' +
            '<div class="' + B + 'streak-foot">' +
              '<span class="' + B + 'swap"><span class="' + B + 'sw-a">5 days active this week</span><span class="' + B + 'sw-b">6 days active this week</span></span>' +
              '<span class="' + B + 'swap ' + B + 'swap--chip"><span class="' + B + 'sw-a">Keep it alive today</span><span class="' + B + 'sw-b">Done for today</span></span>' +
            '</div>' +
          '</section>' +
        '</div>' +

        /* ---- column C ---- */
        '<div class="' + B + 'col">' +
          '<section class="' + B + 'card ' + B + 'prep">' +
            '<div class="' + B + 'head"><div class="dm-h4">Prep Score &amp; rank</div><span class="' + B + 'private">' + ic('lock') + 'Only you</span></div>' +
            '<div class="' + B + 'prep-row">' +
              '<div><b class="' + B + 'score">742</b><span class="' + B + 'score-l">Prep Score &middot; <em>+52</em> this month</span></div>' +
              '<svg class="' + B + 'spark" viewBox="0 0 140 48" aria-hidden="true"><path class="' + B + 'spark-area" d="M2 40 L22 36 L40 38 L58 28 L78 30 L96 20 L116 22 L138 10 L138 48 L2 48 Z"/><path class="' + B + 'spark-line" d="M2 40 L22 36 L40 38 L58 28 L78 30 L96 20 L116 22 L138 10"/><circle class="' + B + 'spark-dot" cx="138" cy="10" r="3"/></svg>' +
            '</div>' +
            '<div class="' + B + 'rank"><span>University rank</span><b>#18</b><span class="' + B + 'top">Top 6%</span></div>' +
          '</section>' +

          '<section class="' + B + 'card ' + B + 'up">' +
            '<div class="' + B + 'head"><div class="dm-h4">Coming up</div></div>' +
            '<div class="' + B + 'seg-ctl"><i class="' + B + 'seg-pill"></i><span class="' + B + 'seg-a">Assessments <em>3</em></span><span class="' + B + 'seg-b">Interviews <em>3</em></span></div>' +
            '<div class="' + B + 'lists">' +
              '<ul class="' + B + 'list ' + B + 'list--a">' +
                '<li><span class="' + B + 'li-ic">' + ic('clip') + '</span><span class="' + B + 'li-t"><b>DSA Mock &middot; Product Companies</b><small>Thu, 10:00 AM &middot; 90 min</small></span></li>' +
                '<li><span class="' + B + 'li-ic">' + ic('clip') + '</span><span class="' + B + 'li-t"><b>Semester 7 Aptitude Test</b><small>Closes today, 9:00 PM</small></span><span class="' + B + 'now">Available now</span></li>' +
                '<li><span class="' + B + 'li-ic">' + ic('clip') + '</span><span class="' + B + 'li-t"><b>Operating Systems &middot; Unit Test</b><small>Mon, 2:00 PM &middot; 45 min</small></span></li>' +
              '</ul>' +
              '<ul class="' + B + 'list ' + B + 'list--b">' +
                '<li><span class="' + B + 'li-ic">' + ic('users') + '</span><span class="' + B + 'li-t"><b>Peer interview with Riya M.</b><small>Fri, 6:30 PM &middot; You interview first</small></span></li>' +
                '<li><span class="' + B + 'li-ic">' + ic('mic') + '</span><span class="' + B + 'li-t"><b>AI mock interview</b><small>SDE Fresher &middot; 8 voice questions</small></span><span class="' + B + 'now">Available now</span></li>' +
                '<li><span class="' + B + 'li-ic">' + ic('users') + '</span><span class="' + B + 'li-t"><b>Peer interview with Kabir S.</b><small>Sun, 11:00 AM &middot; You are the candidate</small></span></li>' +
              '</ul>' +
            '</div>' +
          '</section>' +

          '<section class="' + B + 'card ' + B + 'news">' +
            '<div class="' + B + 'news-h"><span class="' + B + 'imp">Important</span><span>From your university</span><small>2h ago</small></div>' +
            '<p>Placement orientation for final-year students moves to Seminar Hall 2 on Monday, 11:00 AM.</p>' +
          '</section>' +
        '</div>' +
      '</div>' +
    '</div>' + CURSOR;
  }

  PP.demos.register('dashboard', {
    title: 'Dashboard',
    route: '/student/dashboard',
    nav: 'dashboard',
    caption: 'Your progress and priorities, the moment you sign in.',
    description: 'Animated walkthrough of the PeerPrep student dashboard with demo data. Aarav sees a greeting, a continue-where-you-left-off card for a coding problem, coding progress split into Easy, Medium and Hard, a day streak, a private Prep Score with university rank, upcoming assessments and interviews, and a university announcement. The cursor switches the Coming up list to interviews, then clicks Continue challenge: the last daily mission is ticked, the progress ring fills to three of three, 20 XP is added to Level 7 and the streak grows to 13 days.',
    duration: 11000,
    create: function (root) {
      root.innerHTML = html();
      var q = function (s) { return root.querySelector('.dm-dashboard__' + s); };
      var qa = function (s) { return root.querySelectorAll('.dm-dashboard__' + s); };
      var cursor = root.querySelector('.dm-cursor');
      var ptr = root.querySelector('.dm-cursor__ptr');
      var ring = root.querySelector('.dm-cursor__ring');

      var ringFill = q('ring-fill');
      var segB = q('seg-b');
      var cta = q('cta');
      var todayDot = root.querySelector('.dm-dashboard__day.is-today em');

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
      tl.set(cursor, { x: 700, y: 404 }, 0)
        .set(ring, { opacity: 0 }, 0)
        .set(ringFill, { attr: { 'stroke-dashoffset': C_RING / 3 } }, 0)
        .set(q('xp'), { innerText: 860 }, 0)
        .set(q('xpn'), { innerText: 15 }, 0)
        .set(q('lvl-fill'), { scaleX: 860 / 1200 }, 0)
        .set(q('seg-pill'), { x: 0 }, 0)
        .set(q('list--a'), { autoAlpha: 1, y: 0 }, 0)
        .set(q('list--b'), { autoAlpha: 0, y: 6 }, 0)
        .set(q('rc--a'), { autoAlpha: 1, y: 0 }, 0)
        .set(q('rc--b'), { autoAlpha: 0, y: 6 }, 0)
        .set(q('mcheck-on'), { autoAlpha: 0, scale: 0.6 }, 0)
        .set(q('mbg'), { autoAlpha: 0 }, 0)
        .set(q('cta-a'), { autoAlpha: 1, y: 0 }, 0)
        .set(q('cta-b'), { autoAlpha: 0 }, 0)
        .set(q('hn'), { innerText: 12 }, 0)
        .set(q('sn'), { innerText: 12 }, 0)
        .set(qa('sw-a'), { autoAlpha: 1, y: 0 }, 0)
        .set(qa('sw-b'), { autoAlpha: 0, y: 6 }, 0)
        .set(todayDot, { scale: 0 }, 0)
        .set(q('rank'), { '--hover': 0 }, 0);

      /* ---------- switch Coming up to interviews ---------- */
      moveTo(segB, 0.6, 1.1, 0.5, 0.55);
      click(1.85);
      tl.to(q('seg-pill'), { x: function () { return segB.offsetLeft - 3; }, duration: 0.45, ease: 'power3.inOut' }, 1.9)
        .to(q('list--a'), { autoAlpha: 0, y: -6, duration: 0.22, ease: 'power1.in' }, 1.9)
        .to(q('list--b'), { autoAlpha: 1, y: 0, duration: 0.4 }, 2.1);

      /* ---------- continue the daily challenge ---------- */
      moveTo(cta, 3.0, 1.1, 0.6, 0.55);
      click(4.3);
      tl.to(cta, { scale: 0.985, duration: 0.1, ease: 'power1.out' }, 4.3)
        .to(cta, { scale: 1, duration: 0.3, ease: 'power2.out' }, 4.4)
        .to(q('cta-a'), { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, 4.45)
        .to(q('cta-b'), { autoAlpha: 1, duration: 0.35 }, 4.55)
        .to(q('mcheck-on'), { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'power2.out' }, 4.6)
        .to(q('mbg'), { autoAlpha: 1, duration: 0.4 }, 4.6)
        .to(ringFill, { attr: { 'stroke-dashoffset': 0 }, duration: 0.9, ease: 'power2.inOut' }, 4.7)
        .to(q('rc--a'), { autoAlpha: 0, y: -6, duration: 0.22, ease: 'power1.in' }, 4.9)
        .to(q('rc--b'), { autoAlpha: 1, y: 0, duration: 0.4 }, 5.1)
        .to(q('xpn'), { innerText: 35, snap: { innerText: 1 }, duration: 0.7, ease: 'power2.out' }, 5.0)
        .to(q('lvl-fill'), { scaleX: 880 / 1200, duration: 0.9, ease: 'power2.out' }, 5.3)
        .to(q('xp'), { innerText: 880, snap: { innerText: 1 }, duration: 0.9, ease: 'power2.out' }, 5.3)
        .to(todayDot, { scale: 1, duration: 0.45, ease: 'power3.out' }, 5.5)
        .to(q('sn'), { innerText: 13, snap: { innerText: 1 }, duration: 0.3, ease: 'none' }, 5.6)
        .to(q('hn'), { innerText: 13, snap: { innerText: 1 }, duration: 0.3, ease: 'none' }, 5.6)
        .to(qa('sw-a'), { autoAlpha: 0, y: -6, duration: 0.22, ease: 'power1.in' }, 5.6)
        .to(qa('sw-b'), { autoAlpha: 1, y: 0, duration: 0.4 }, 5.8);

      /* ---------- glance at the private Prep Score ---------- */
      moveTo(q('rank'), 6.6, 1.1, 0.42, 0.55);
      tl.to(q('rank'), { '--hover': 1, duration: 0.3 }, 7.6);
      // drift off to rest; hold the payoff
      moveTo(q('lists'), 8.6, 1.0, 0.62, 0.9);
      tl.to(q('rank'), { '--hover': 0, duration: 0.3 }, 8.7);
      tl.to({}, { duration: 0.01 }, 11.0);
      return tl;
    },
  });
})();
