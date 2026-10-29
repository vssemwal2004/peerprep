/* ==========================================================================
   Demo scene: Anvi AI — getting unstuck with a direction, not an answer.
   Wrong Answer on a hidden test -> Ask Anvi -> hint streams in ->
   student rewrites a few lines themselves -> Run passes -> Submit Accepted.
   Everything is driven by tweens/sets on one paused timeline (no onUpdate
   text writes), so seek(), restart() and reduced-motion end states render.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var I = {
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    upload: '<path d="M12 13v8"/><path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="m8 17 4-4 4 4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    bad: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
    build: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'
  };
  function ic(name, cls) {
    return '<svg class="' + (cls || 'dm-anvi__ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[name] + '</svg>';
  }

  // Tiny Python highlighter for the fixed demo snippets.
  var KW = /^(class|def|for|in|if|return|range|len|enumerate|self)$/;
  function hl(src) {
    return src.replace(/([A-Za-z_]\w*|\d+|[^\sA-Za-z_\d]+|\s+)/g, function (tok) {
      var t = PP.esc(tok);
      if (/^(range|len|enumerate)$/.test(tok)) return '<span class="dm-anvi__t-b">' + t + '</span>';
      if (tok === 'self') return '<span class="dm-anvi__t-s">' + t + '</span>';
      if (KW.test(tok)) return '<span class="dm-anvi__t-k">' + t + '</span>';
      if (/^(Solution|pairSum)$/.test(tok)) return '<span class="dm-anvi__t-f">' + t + '</span>';
      if (/^\d+$/.test(tok)) return '<span class="dm-anvi__t-n">' + t + '</span>';
      if (/^[=+\-<>!]+$/.test(tok)) return '<span class="dm-anvi__t-o">' + t + '</span>';
      return t;
    });
  }
  function line(src) {
    var m = /^(\s*)(.*)$/.exec(src);
    return '<div class="dm-anvi__ln"><span class="dm-anvi__ind">' + m[1] + '</span>' + hl(m[2]) + '</div>';
  }
  function typedLine(src) {
    var m = /^(\s*)(.*)$/.exec(src);
    return '<div class="dm-anvi__ln dm-anvi__ln--new"><span class="dm-anvi__ind">' + m[1] + '</span>' +
      '<span class="dm-anvi__ty" style="--n:' + m[2].length + '">' + hl(m[2]) + '</span><i class="dm-anvi__caret"></i></div>';
  }

  var OLD = [
    '        for i in range(len(nums)):',
    '            for j in range(i, len(nums)):',
    '                if nums[i] + nums[j] == target:',
    '                    return [i, j]'
  ];
  var NEW = [
    '        seen = {}',
    '        for i, x in enumerate(nums):',
    '            if target - x in seen:',
    '                return [seen[target - x], i]',
    '            seen[x] = i'
  ];

  // Hint copy, word-tokenised so it can "stream" with property tweens.
  var HINT = 'Starting j at i lets a number pair with itself — that\'s why hidden test 58 fails. ' +
    'Comparing every pair is also [O(n²)] work. Could you look up the number you still need in [O(1)] time instead?';
  function hintHTML() {
    var out = [];
    HINT.replace(/\[([^\]]+)\]|(\S+)/g, function (_, mark, word) {
      if (mark) out.push('<span class="dm-anvi__w"><mark class="dm-anvi__mark">' + PP.esc(mark) + '</mark></span>');
      else out.push('<span class="dm-anvi__w">' + PP.esc(word) + '</span>');
      return '';
    });
    return out.join(' ');
  }

  var CURSOR =
    '<div class="dm-cursor" aria-hidden="true"><span class="dm-cursor__ripple"></span>' +
    '<svg class="dm-cursor__arrow" viewBox="0 0 24 24"><path d="M5 3.2v15.6l4.3-4.1 2.7 6.1 2.6-1.1-2.7-6h5.9z"/></svg></div>';

  function markup() {
    var gutter = '';
    for (var n = 1; n <= 7; n++) gutter += '<span>' + n + '</span>';

    return '' +
    '<div class="dm-anvi__app">' +

      /* ---------- toolbar ---------- */
      '<div class="dm-anvi__bar">' +
        '<div class="dm-anvi__nav">' +
          '<span class="dm-anvi__navbtn dm-anvi__navbtn--wide">' + ic('list') + 'Problem list</span>' +
          '<span class="dm-anvi__navbtn">' + ic('left') + '</span>' +
          '<span class="dm-anvi__navbtn">' + ic('right') + '</span>' +
        '</div>' +
        '<span class="dm-anvi__run">' + ic('play') + 'Run</span>' +
        '<span class="dm-anvi__submit">' + ic('upload') + 'Submit</span>' +
        '<span class="dm-anvi__ask"><span class="dm-anvi__ask-orb">' + ic('bulb') + '</span>Ask Anvi</span>' +
        '<span class="dm-anvi__lang">Python 3' + ic('chev') + '</span>' +
      '</div>' +

      /* ---------- problem pane ---------- */
      '<section class="dm-anvi__pane dm-anvi__prob">' +
        '<div class="dm-anvi__tabs"><span class="is-on">Description</span><span>Editorial</span><span>Solution</span><span>Submissions</span></div>' +
        '<div class="dm-anvi__probbody">' +
          '<div class="dm-h3 dm-anvi__title">1. Pair Sum to Target</div>' +
          '<div class="dm-anvi__meta">' +
            '<span class="dm-anvi__diff">Easy</span>' +
            '<span class="dm-anvi__pill">' + ic('tag') + 'Topics</span>' +
            '<span class="dm-anvi__pill">' + ic('build') + 'Companies</span>' +
            '<span class="dm-anvi__pill dm-anvi__pill--anvi">' + ic('bulb') + 'Anvi</span>' +
          '</div>' +
          '<div class="dm-anvi__desc">' +
            '<p>Given an integer array <code>nums</code> and a value <code>target</code>, find the two positions whose values add up to <code>target</code> and return their indices.</p>' +
            '<p>Exactly one such pair exists, and a position can’t be paired with itself.</p>' +
            '<div class="dm-anvi__ex"><b>Example 1</b>' +
              '<div><span>Input:</span> nums = [2,7,11,15], target = 9</div>' +
              '<div><span>Output:</span> [0,1]</div></div>' +
            '<div class="dm-anvi__ex"><b>Example 2</b>' +
              '<div><span>Input:</span> nums = [3,2,4], target = 6</div>' +
              '<div><span>Output:</span> [1,2]</div></div>' +
            '<p class="dm-anvi__cons"><b>Constraints</b><br>2 ≤ nums.length ≤ 10⁴ · −10⁹ ≤ nums[i] ≤ 10⁹</p>' +
          '</div>' +
        '</div>' +

        /* Anvi panel */
        '<aside class="dm-anvi__panel" aria-hidden="true">' +
          '<header class="dm-anvi__ph">' +
            '<span class="dm-anvi__orb">' + ic('bulb', 'dm-anvi__orb-ic') + '</span>' +
            '<div class="dm-anvi__ph-txt"><b>Anvi</b><span>Hint</span>' +
              '<small>Your AI coding guide for a focused next step</small></div>' +
            '<span class="dm-anvi__px">' + ic('x') + '</span>' +
          '</header>' +
          '<dl class="dm-anvi__ctx">' +
            '<div><dt>Looking at</dt><dd>Your submission &middot; Python 3</dd></div>' +
            '<div><dt>Failed on</dt><dd><code>nums = [3,3], target = 6</code></dd></div>' +
          '</dl>' +
          '<div class="dm-anvi__hintwrap">' +
            '<div class="dm-anvi__think">Reading your submission…</div>' +
            '<p class="dm-anvi__hint">' + hintHTML() + '</p>' +
          '</div>' +
          '<div class="dm-anvi__note">' + ic('info') +
            '<div><b>A direction to try, not a full solution.</b><span>Write the fix in your own code — Anvi won’t write it for you.</span></div></div>' +
          '<dl class="dm-anvi__ctx dm-anvi__rel">' +
            '<div><dt>Concept</dt><dd>Hash map lookups &middot; O(1) average</dd></div>' +
            '<div><dt>Revisit</dt><dd>Data Structures &middot; Ch. 1, Hashing</dd></div>' +
          '</dl>' +
          '<div class="dm-anvi__pfoot"><span class="dm-anvi__fresh">' + ic('refresh') + 'A fresh angle</span><span class="dm-anvi__pmeta">One focused approach</span></div>' +
        '</aside>' +
      '</section>' +

      /* ---------- editor ---------- */
      '<section class="dm-anvi__pane dm-anvi__ed">' +
        '<div class="dm-anvi__edh"><span class="dm-anvi__edtab">' + ic('code') + 'Code</span><span class="dm-anvi__edmeta">Python 3 · Auto-saved</span></div>' +
        '<div class="dm-anvi__code">' +
          '<div class="dm-anvi__gut">' + gutter + '</div>' +
          '<div class="dm-anvi__src">' +
            line('class Solution:') +
            line('    def pairSum(self, nums, target):') +
            '<div class="dm-anvi__old"><span class="dm-anvi__sel"></span>' + OLD.map(line).join('') + '</div>' +
            NEW.map(typedLine).join('') +
          '</div>' +
          '<span class="dm-anvi__curline"></span>' +
        '</div>' +
      '</section>' +

      /* ---------- console ---------- */
      '<section class="dm-anvi__pane dm-anvi__con">' +
        '<div class="dm-anvi__ctabs"><span class="dm-anvi__ct dm-anvi__ct--case">Testcase</span><span class="dm-anvi__ct dm-anvi__ct--res">Test Result</span>' +
          '<span class="dm-anvi__cline"></span></div>' +
        '<div class="dm-anvi__cbody">' +

          /* S0 testcase */
          '<div class="dm-anvi__st dm-anvi__st--case">' +
            '<div class="dm-anvi__cases"><span class="is-on">Case 1</span><span>Case 2</span><span>Case 3</span></div>' +
            '<label>nums =</label><div class="dm-anvi__box">[2,7,11,15]</div>' +
            '<label>target =</label><div class="dm-anvi__box">9</div>' +
          '</div>' +

          /* S1 / S3 / S5 progress */
          '<div class="dm-anvi__st dm-anvi__st--busy dm-anvi__busy1"><span class="dm-anvi__spin"></span>Judging on all test cases…</div>' +
          '<div class="dm-anvi__st dm-anvi__st--busy dm-anvi__busy2"><span class="dm-anvi__spin"></span>Running sample cases…</div>' +
          '<div class="dm-anvi__st dm-anvi__st--busy dm-anvi__busy3"><span class="dm-anvi__spin"></span>Judging on all test cases…</div>' +

          /* S2 wrong answer */
          '<div class="dm-anvi__st dm-anvi__st--wa">' +
            '<div class="dm-anvi__vhead dm-anvi__vhead--bad">' + ic('bad') +
              '<div><b>Wrong Answer</b><span>Your output did not match the expected output for this input.</span></div>' +
              '<em>57 / 63 testcases passed</em></div>' +
            '<div class="dm-anvi__io"><label>Input · hidden test 58</label><div class="dm-anvi__box">nums = [3,3], target = 6</div></div>' +
            '<div class="dm-anvi__io2">' +
              '<div><label>Expected output</label><div class="dm-anvi__box dm-anvi__box--ok">[0,1]</div></div>' +
              '<div><label>Your output</label><div class="dm-anvi__box dm-anvi__box--bad">[0,0]</div></div>' +
            '</div>' +
          '</div>' +

          /* S4 run passed */
          '<div class="dm-anvi__st dm-anvi__st--run">' +
            '<div class="dm-anvi__vhead dm-anvi__vhead--ok">' + ic('ok') +
              '<div><b>Accepted</b><span>Sample cases · run before you submit</span></div><em>3 / 3 passed</em></div>' +
            '<div class="dm-anvi__cases dm-anvi__cases--ok"><span>' + ic('ok') + 'Case 1</span><span>' + ic('ok') + 'Case 2</span><span>' + ic('ok') + 'Case 3</span></div>' +
            '<div class="dm-anvi__io"><label>Output · Case 3</label><div class="dm-anvi__box dm-anvi__box--ok">[0,1]</div></div>' +
          '</div>' +

          /* S6 accepted */
          '<div class="dm-anvi__st dm-anvi__st--ac">' +
            '<div class="dm-anvi__achead">' +
              '<span class="dm-anvi__acbadge">' + ic('check') + '</span>' +
              '<div><b>Accepted</b><span>63 / 63 testcases passed · Python 3</span></div>' +
            '</div>' +
            '<div class="dm-anvi__stats">' +
              '<div class="dm-anvi__stat">' + ic('clock') + '<span>Runtime</span><b>48 ms</b></div>' +
              '<div class="dm-anvi__stat">' + ic('chip') + '<span>Memory</span><b>17.6 MB</b></div>' +
              '<div class="dm-anvi__stat dm-anvi__stat--wide"><span>Complexity</span><b>O(n) time · O(n) space</b></div>' +
            '</div>' +
          '</div>' +

        '</div>' +
      '</section>' +
    '</div>' + CURSOR;
  }

  PP.demos.register('anvi', {
    title: 'Anvi AI',
    route: '/problems/pair-sum-to-target',
    nav: 'coding',
    caption: 'Stuck on a hidden test? Ask Anvi for a direction to try — then write the fix yourself.',
    description: 'Animated recreation of the PeerPrep coding workspace. A Python solution to Pair Sum to Target is submitted and fails a hidden test case with Wrong Answer, 57 of 63 test cases passed. The student presses Ask Anvi; the Anvi panel slides in and points out that starting j at i lets a number pair with itself, notes that comparing every pair is O(n squared), and asks whether the student could look up the number they still need in constant time. A note says this is a direction, not the full solution. The student rewrites a few lines using a hash map, runs the sample cases (3 of 3 passed) and submits: Accepted, 63 of 63 test cases passed.',
    duration: 13970,
    create: function (root) {
      root.innerHTML = markup();
      var q = function (s) { return root.querySelector(s); };
      var qa = function (s) { return root.querySelectorAll(s); };

      var cursor = q('.dm-cursor');
      var ripple = q('.dm-cursor__ripple');
      var tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
      if (!tl) return tl;

      // Hard-coded stage coordinates (layout is fixed px, 1128 x 680).
      var P = {
        rest: { x: 780, y: 310 },
        run: { x: 515, y: 35 },
        submit: { x: 611, y: 35 },
        ask: { x: 936, y: 35 },
        selA: { x: 540, y: 168 },
        selB: { x: 792, y: 236 },
        park: { x: 1010, y: 300 }
      };

      function move(to, at, dur) {
        tl.to(cursor, { x: to.x, y: to.y, duration: dur || 0.7, ease: 'power2.inOut' }, at);
      }
      function click(at) {
        tl.to(cursor, { scale: 0.82, duration: 0.09, ease: 'power2.out' }, at)
          .to(cursor, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, at + 0.09)
          .fromTo(ripple, { scale: 0.4, autoAlpha: 0.7 }, { scale: 1.5, autoAlpha: 0, duration: 0.55, ease: 'power2.out', immediateRender: false }, at);
      }
      function press(el, at) {
        tl.to(el, { scale: 0.94, duration: 0.09 }, at).to(el, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, at + 0.09);
      }
      function show(el, at, from) {
        tl.fromTo(el, Object.assign({ autoAlpha: 0, y: 8 }, from || {}), { autoAlpha: 1, y: 0, x: 0, scale: 1, duration: 0.45, immediateRender: false }, at);
      }
      function hide(el, at) { tl.to(el, { autoAlpha: 0, duration: 0.2 }, at); }

      var st = {
        caseS: q('.dm-anvi__st--case'), b1: q('.dm-anvi__busy1'), b2: q('.dm-anvi__busy2'), b3: q('.dm-anvi__busy3'),
        wa: q('.dm-anvi__st--wa'), run: q('.dm-anvi__st--run'), ac: q('.dm-anvi__st--ac')
      };
      var panel = q('.dm-anvi__panel');
      var words = qa('.dm-anvi__w');
      var newLines = qa('.dm-anvi__ln--new');
      var con = q('.dm-anvi__con');

      /* ---- clean initial state (also restores on restart) ---- */
      tl.set(cursor, { x: P.rest.x, y: P.rest.y, scale: 1, autoAlpha: 1 }, 0)
        .set(ripple, { autoAlpha: 0, scale: 0.2 }, 0)
        .set([st.b1, st.b2, st.b3, st.wa, st.run, st.ac], { autoAlpha: 0, y: 0 }, 0)
        .set(st.caseS, { autoAlpha: 1, y: 0 }, 0)
        .set(q('.dm-anvi__cline'), { x: 0, width: 72 }, 0)
        .set(q('.dm-anvi__ct--case'), { '--on': 1 }, 0)
        .set(q('.dm-anvi__ct--res'), { '--on': 0 }, 0)
        .set(con, { '--tone': 0, '--ok': 0 }, 0)
        .set(panel, { autoAlpha: 0, x: -12 }, 0)
        .set(q('.dm-anvi__think'), { autoAlpha: 1 }, 0)
        .set(words, { autoAlpha: 0 }, 0)
        .set(qa('.dm-anvi__mark'), { backgroundSize: '0% 100%' }, 0)
        .set([q('.dm-anvi__note'), q('.dm-anvi__rel'), q('.dm-anvi__pfoot')], { autoAlpha: 0, y: 6 }, 0)
        .set([q('.dm-anvi__ask'), q('.dm-anvi__pill--anvi')], { '--on': 0, clearProps: 'color' }, 0)
        .set(q('.dm-anvi__old'), { height: 88, autoAlpha: 1 }, 0)
        .set(q('.dm-anvi__sel'), { scaleX: 0, autoAlpha: 1 }, 0)
        .set(newLines, { height: 0 }, 0)
        .set(qa('.dm-anvi__ty'), { '--p': 0 }, 0)
        .set(qa('.dm-anvi__caret'), { autoAlpha: 0 }, 0)
        .set(q('.dm-anvi__curline'), { y: 0, autoAlpha: 0 }, 0)
        .set(q('.dm-anvi__acbadge'), { scale: 1 }, 0);

      /* ---- 1. submit brute force -> Wrong Answer ---- */
      move(P.submit, 0.25, 0.75);
      click(1.0);
      press(q('.dm-anvi__submit'), 1.0);
      tl.to(q('.dm-anvi__cline'), { x: 82, width: 86, duration: 0.35 }, 1.1)
        .set(q('.dm-anvi__ct--case'), { '--on': 0 }, 1.1)
        .set(q('.dm-anvi__ct--res'), { '--on': 1 }, 1.1);
      hide(st.caseS, 1.08);
      show(st.b1, 1.12);
      hide(st.b1, 1.85);
      show(st.wa, 1.9);
      tl.to(con, { '--tone': 1, duration: 0.5 }, 1.9);

      /* ---- 2. Ask Anvi ---- */
      move(P.ask, 2.45, 0.7);
      click(3.15);
      press(q('.dm-anvi__ask'), 3.15);
      tl.to([q('.dm-anvi__ask'), q('.dm-anvi__pill--anvi')], { '--on': 1, color: '#fff', duration: 0.3 }, 3.2)
        .to(panel, { autoAlpha: 1, x: 0, duration: 0.6, ease: 'power3.out' }, 3.25);
      move(P.park, 3.5, 0.9);
      tl.to(q('.dm-anvi__think'), { autoAlpha: 0, duration: 0.2 }, 4.0)
        .to(words, { autoAlpha: 1, duration: 0.25, stagger: 0.042, ease: 'power1.out' }, 4.05)
        .to(qa('.dm-anvi__mark'), { backgroundSize: '100% 100%', duration: 0.5, stagger: 1.0, ease: 'power2.inOut' }, 4.4)
        .to(q('.dm-anvi__note'), { autoAlpha: 1, y: 0, duration: 0.5 }, 5.75)
        .to(q('.dm-anvi__rel'), { autoAlpha: 1, y: 0, duration: 0.5 }, 5.85)
        .to(q('.dm-anvi__pfoot'), { autoAlpha: 1, y: 0, duration: 0.5 }, 5.95);

      /* ---- 3. student edits the code themselves ---- */
      move(P.selA, 5.8, 0.7);
      tl.to(q('.dm-anvi__sel'), { scaleX: 1, duration: 0.55, ease: 'power1.inOut' }, 6.55);
      move(P.selB, 6.55, 0.55);
      tl.to(q('.dm-anvi__old'), { height: 0, autoAlpha: 0, duration: 0.28, ease: 'power2.in' }, 7.25);
      tl.to(cursor, { x: 990, y: 250, duration: 0.6, ease: 'power2.inOut' }, 7.35);
      tl.set(q('.dm-anvi__curline'), { autoAlpha: 1, y: 44 }, 7.5);

      var t = 7.95; // a short pause: the student works out the approach
      var speed = 0.014;
      newLines.forEach(function (ln, i) {
        var ty = ln.querySelector('.dm-anvi__ty');
        var caret = ln.querySelector('.dm-anvi__caret');
        var n = NEW[i].trim().length;
        tl.to(ln, { height: 22, duration: 0.12, ease: 'power2.out' }, t)
          .set(q('.dm-anvi__curline'), { y: 44 + i * 22 }, t)
          .set(caret, { autoAlpha: 1 }, t)
          .to(ty, { '--p': 1, duration: n * speed, ease: 'steps(' + n + ')' }, t + 0.08);
        t += 0.08 + n * speed + 0.07;
        if (i < newLines.length - 1) tl.set(caret, { autoAlpha: 0 }, t);
      });
      var lastCaret = newLines[newLines.length - 1].querySelector('.dm-anvi__caret');

      /* ---- 4. Run -> samples pass ---- */
      var tRun = t + 0.15; // ~10.15
      move(P.run, tRun - 0.55, 0.6);
      click(tRun + 0.1);
      press(q('.dm-anvi__run'), tRun + 0.1);
      tl.set(lastCaret, { autoAlpha: 0 }, tRun + 0.1);
      tl.to(con, { '--tone': 0, duration: 0.3 }, tRun + 0.15);
      hide(st.wa, tRun + 0.15);
      show(st.b2, tRun + 0.2);
      hide(st.b2, tRun + 0.75);
      show(st.run, tRun + 0.8);

      /* ---- 5. Submit -> Accepted ---- */
      var tSub = tRun + 1.35; // ~11.5
      move(P.submit, tSub - 0.5, 0.5);
      click(tSub);
      press(q('.dm-anvi__submit'), tSub);
      hide(st.run, tSub + 0.05);
      show(st.b3, tSub + 0.1);
      hide(st.b3, tSub + 0.7);
      show(st.ac, tSub + 0.75, { y: 14, scale: 0.98 });
      tl.to(con, { '--ok': 1, duration: 0.6 }, tSub + 0.75)
        .fromTo(q('.dm-anvi__acbadge'), { scale: 0.7 }, { scale: 1, duration: 0.45, ease: 'power3.out', immediateRender: false }, tSub + 0.8)
        .from(qa('.dm-anvi__stat'), { autoAlpha: 0, y: 10, duration: 0.45, stagger: 0.08, immediateRender: false }, tSub + 0.95);
      move({ x: 1060, y: 330 }, tSub + 0.35, 0.9);

      // Hold the payoff.
      tl.to({}, { duration: 1.4 }, tSub + 1.4);
      return tl;
    }
  });
})();
