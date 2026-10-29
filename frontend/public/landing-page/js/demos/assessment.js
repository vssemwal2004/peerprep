/* ==========================================================================
   Demo scene — Assessment attempt (company-based mock)
   Scripted recreation of the PeerPrep assessment attempt screen with
   fictional content. The student answers the last two questions of the
   MCQ / Short section, saves, opens "Submit assessment?", confirms, and the
   attempt is submitted. Monitoring is shown as status only.

   First frame (t=0) is a complete screen: every initial state is applied
   immediately with gsap.set AND recorded at 0 on the timeline (restart-safe).
   ========================================================================== */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var SVG = function (d, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>';
  };
  var IC = {
    check: SVG('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    cloud: SVG('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>'),
    clock: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    cam: SVG('<rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>'),
    full: SVG('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
    focus: SVG('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/>'),
    shield: SVG('<path d="M12 21s7.5-3.6 7.5-9.5V5.5L12 3 4.5 5.5v6C4.5 17.4 12 21 12 21z"/>'),
    flag: SVG('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    left: SVG('<path d="m15 18-6-6 6-6"/>'),
    right: SVG('<path d="m9 18 6-6-6-6"/>'),
    done: SVG('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.4"')
  };

  // Palette state for questions 1..20 at t=0
  // a = answered, n = not answered (visited), m = marked for review, c = current, v = not visited
  var PAL = 'aaaaaaaaaanaamaaaacv'.split('');

  var CURSOR =
    '<div class="dm-cursor" aria-hidden="true"><span class="dm-cursor__ripple"></span>' +
    '<svg class="dm-cursor__arrow" viewBox="0 0 24 24"><path d="M4 2.5v16.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.4h6z"/></svg></div>';

  function chars(text) {
    return text.split('').map(function (c) { return '<i>' + PP.esc(c) + '</i>'; }).join('');
  }

  function markup() {
    var cells = PAL.map(function (s, i) {
      return '<span class="dm-as__cell" data-cell="' + (i + 1) + '" data-s="' + s + '">' + (i + 1) + '</span>';
    }).join('');
    var opts = [['A', 'O(1)'], ['B', 'O(log n)'], ['C', 'O(n)'], ['D', 'O(n log n)']].map(function (o) {
      return '<div class="dm-as__opt" data-opt="' + o[0] + '"><span class="dm-as__radio"><i></i></span><b>' + o[0] + '</b><span class="dm-as__opt-t">' + o[1] + '</span></div>';
    }).join('');

    return '' +
    '<div class="dm-as">' +
      /* ---------- header ---------- */
      '<header class="dm-as__head">' +
        '<div class="dm-as__ttl"><b>Product SDE &middot; Mock Assessment 3</b><span>Company-based mock &middot; 60 min &middot; 50 marks</span></div>' +
        '<div class="dm-as__tabs"><span class="is-on">MCQ / Short Questions<em>20</em></span><span>Coding Questions<em>2</em></span></div>' +
        '<span class="dm-as__save">' +
          '<span class="dm-as__save-s" data-save="ok">' + IC.cloud + 'Answers saved to server</span>' +
          '<span class="dm-as__save-s dm-as__save-s--ing" data-save="ing"><i class="dm-as__spin"></i>Saving&hellip;</span>' +
        '</span>' +
        '<div class="dm-as__timer">' + IC.clock + '<span><small>Time left</small><b data-timer>04:12</b></span></div>' +
        '<span class="dm-as__submit" data-submit>Submit</span>' +
      '</header>' +

      /* ---------- question ---------- */
      '<main class="dm-as__q">' +
        '<div class="dm-as__layer" data-q="19">' +
          '<div class="dm-as__meta"><b>Question 19</b><span>of 20</span><span class="dm-as__tag">MCQ</span><span class="dm-as__marks">+2 marks &middot; &minus;0.5 for a wrong answer</span></div>' +
          '<p class="dm-as__text">A balanced binary search tree holds <em>n</em> keys. What is the worst-case time complexity of searching for a key?</p>' +
          '<div class="dm-as__opts">' + opts + '</div>' +
        '</div>' +
        '<div class="dm-as__layer" data-q="20">' +
          '<div class="dm-as__meta"><b>Question 20</b><span>of 20</span><span class="dm-as__tag">One-line Answer</span><span class="dm-as__marks">+2 marks</span></div>' +
          '<p class="dm-as__text">Which data structure is typically used to evaluate a postfix expression such as <code>2&nbsp;3&nbsp;4&nbsp;*&nbsp;+</code>?</p>' +
          '<label class="dm-as__lbl">Your answer</label>' +
          '<span class="dm-as__input" data-input data-focus="0"><span class="dm-as__ph" data-ph>Type your response here...</span><span class="dm-as__typed" data-typed>' + chars('Stack') + '</span><span class="dm-as__caret"></span></span>' +
          '<p class="dm-as__note">Answers are case-insensitive. Your progress is auto-saved continuously.</p>' +
        '</div>' +
        '<div class="dm-as__prog">' +
          '<span class="dm-as__prog-k">Section progress</span>' +
          '<span class="dm-as__prog-bar"><i data-prog></i></span>' +
          '<span class="dm-as__prog-v"><span class="dm-as__prog-n"><span class="dm-as__prog-s" data-prog-s><span>17</span><span>18</span><span>19</span></span></span>&thinsp;/ 20 attempted</span>' +
        '</div>' +
        '<footer class="dm-as__foot">' +
          '<span class="dm-as__btn">' + IC.left + 'Previous</span>' +
          '<span class="dm-as__btn">Clear</span>' +
          '<span class="dm-as__sp"></span>' +
          '<span class="dm-as__btn">' + IC.flag + 'Mark &amp; Next</span>' +
          '<span class="dm-as__btn dm-as__btn--primary" data-next>Save &amp; Next' + IC.right + '</span>' +
        '</footer>' +
      '</main>' +

      /* ---------- rail ---------- */
      '<aside class="dm-as__rail">' +
        '<section class="dm-as__pal">' +
          '<div class="dm-as__rh"><b>Question palette</b><span>MCQ / Short</span></div>' +
          '<div class="dm-as__grid">' + cells + '</div>' +
          '<div class="dm-as__legend">' +
            '<span><i data-s="a"></i>Answered</span><span><i data-s="n"></i>Not answered</span>' +
            '<span><i data-s="m"></i>Marked for review</span><span><i data-s="v"></i>Not visited</span>' +
          '</div>' +
        '</section>' +
        '<section class="dm-as__mon">' +
          '<div class="dm-as__rh"><b>Monitoring</b><span>Set by your institution</span></div>' +
          '<div class="dm-as__cam">' +
            '<svg viewBox="0 0 120 76" aria-hidden="true"><circle cx="60" cy="31" r="13"/><path d="M30 76c2-17 14-26 30-26s28 9 30 26z"/></svg>' +
            '<span>Camera preview</span>' +
          '</div>' +
          '<ul class="dm-as__checks">' +
            '<li>' + IC.cam + 'Camera active<em>OK</em></li>' +
            '<li>' + IC.full + 'Fullscreen active<em>OK</em></li>' +
            '<li>' + IC.focus + 'Page focused<em>OK</em></li>' +
            '<li>' + IC.shield + 'Warning count<b>0</b></li>' +
          '</ul>' +
        '</section>' +
      '</aside>' +

      /* ---------- submit dialog ---------- */
      '<div class="dm-as__veil" data-veil></div>' +
      '<div class="dm-as__dlg" data-dlg role="dialog" aria-label="Submit assessment">' +
        '<div class="dm-as__dl" data-dl="confirm">' +
          '<div class="dm-h4">Submit assessment?</div>' +
          '<p>You still have about <b>4 minutes</b> left. Answers cannot be changed after you submit.</p>' +
          '<table class="dm-as__tbl"><thead><tr><th>Section</th><th>Attempted</th><th>Marked</th><th>Not answered</th></tr></thead><tbody>' +
            '<tr><td>MCQ / Short Questions</td><td><b>19</b> / 20</td><td>1</td><td>1</td></tr>' +
            '<tr><td>Coding Questions</td><td><b>2</b> / 2</td><td>0</td><td>0</td></tr>' +
          '</tbody></table>' +
          '<div class="dm-as__dbtns"><span class="dm-as__btn">Cancel</span><span class="dm-as__btn dm-as__btn--ink" data-yes><span data-yes-a>Yes, Submit</span><span data-yes-b><i class="dm-as__spin dm-as__spin--inv"></i>Submitting&hellip;</span></span></div>' +
        '</div>' +
        '<div class="dm-as__dl dm-as__dl--done" data-dl="done">' +
          '<span class="dm-as__ok">' + IC.done + '</span>' +
          '<div class="dm-h4">Assessment submitted successfully</div>' +
          '<p>21 of 22 questions attempted. Results are released on the schedule your institution has set.</p>' +
          '<span class="dm-as__btn">Back to assessments</span>' +
        '</div>' +
      '</div>' +
      CURSOR +
    '</div>';
  }

  PP.demos.register('assessment', {
    title: 'Assessments',
    route: '/student/assessments/attempt/product-sde-mock-3',
    nav: 'assessments',
    caption: 'Timed sections, a question palette, autosave and monitoring status — then a clear summary before you submit.',
    description: 'Animated recreation of a PeerPrep company-based mock assessment attempt with fictional content. The header shows the MCQ / Short Questions and Coding Questions sections, an "Answers saved to server" indicator and a countdown timer at about four minutes left. The student selects O(log n) for question 19, clicks Save & Next, types "Stack" as the one-line answer to question 20 and saves again; the question palette marks both as answered. A monitoring panel shows camera, fullscreen and page-focus status with a warning count of zero. The student clicks Submit, reviews a summary of attempted, marked and unanswered questions per section, confirms, and sees "Assessment submitted successfully".',
    duration: 12800,
    create: function (root) {
      root.innerHTML = markup();
      var $ = function (s) { return root.querySelector(s); };
      var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
      if (!window.gsap) return null;

      var tl = gsap.timeline({ paused: true });
      // initial state: applied now (first frame) and recorded at 0 (restart)
      function at0(t, v) { gsap.set(t, v); tl.set(t, v, 0); }

      var cur = $('.dm-cursor'), arrow = $('.dm-cursor__arrow'), rip = $('.dm-cursor__ripple');
      var q19 = $('[data-q="19"]'), q20 = $('[data-q="20"]');
      var optB = $('[data-opt="B"]');
      var next = $('[data-next]');
      var input = $('[data-input]');
      var saveOk = $('[data-save="ok"]'), saveIng = $('[data-save="ing"]');
      var timer = $('[data-timer]');
      var veil = $('[data-veil]'), dlg = $('[data-dlg]');
      var dConfirm = $('[data-dl="confirm"]'), dDone = $('[data-dl="done"]');
      var yes = $('[data-yes]');

      at0(cur, { x: 520, y: 600, opacity: 1 });
      at0(arrow, { scale: 1 });
      at0(rip, { opacity: 0, scale: 0.3 });
      at0(q19, { autoAlpha: 1, x: 0 });
      at0(q20, { autoAlpha: 0, x: 24 });
      at0(optB, { attr: { 'data-on': '0' } });
      at0($('[data-cell="19"]'), { attr: { 'data-s': 'c' } });
      at0($('[data-cell="20"]'), { attr: { 'data-s': 'v' } });
      at0(input, { attr: { 'data-focus': '0' } });
      at0($('[data-ph]'), { display: 'inline' });
      at0($$('[data-typed] > i'), { display: 'none' });
      at0(saveOk, { autoAlpha: 1, y: 0 });
      at0(saveIng, { autoAlpha: 0, y: 6 });
      at0(timer, { textContent: '04:12' });
      at0(veil, { autoAlpha: 0 });
      at0(dlg, { autoAlpha: 0, y: 14 });
      at0(dConfirm, { autoAlpha: 1 });
      at0(dDone, { autoAlpha: 0 });
      at0($('[data-yes-a]'), { autoAlpha: 1 });
      at0($('[data-yes-b]'), { autoAlpha: 0 });
      at0([next, yes, $('[data-submit]')], { scale: 1 });
      var prog = $('[data-prog]'), progS = $('[data-prog-s]');
      at0(prog, { width: '85%' });
      at0(progS, { y: 0 });

      function move(x, y, at, d) { tl.to(cur, { x: x, y: y, duration: d || 0.7, ease: 'power3.inOut' }, at); }
      function click(at, el) {
        tl.to(arrow, { scale: 0.82, duration: 0.09, ease: 'power2.out' }, at)
          .to(arrow, { scale: 1, duration: 0.25, ease: 'power2.out' }, at + 0.09)
          .fromTo(rip, { scale: 0.3, opacity: 0.55 }, { scale: 1.6, opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, at);
        if (el) tl.to(el, { scale: 0.97, duration: 0.08 }, at).to(el, { scale: 1, duration: 0.25, ease: 'power2.out' }, at + 0.08);
      }
      function save(at) {
        tl.to(saveOk, { autoAlpha: 0, y: -6, duration: 0.18 }, at)
          .to(saveIng, { autoAlpha: 1, y: 0, duration: 0.2 }, at + 0.05)
          .to(saveIng, { autoAlpha: 0, y: -6, duration: 0.18 }, at + 0.6)
          .fromTo(saveOk, { y: 6 }, { autoAlpha: 1, y: 0, duration: 0.25, immediateRender: false }, at + 0.68);
      }

      // countdown: one tick per second (seekable text sets)
      for (var s = 1; s <= 12; s++) {
        var left = 252 - s, mm = Math.floor(left / 60), ss = left % 60;
        tl.set(timer, { textContent: '0' + mm + ':' + (ss < 10 ? '0' : '') + ss }, s);
      }

      /* 1. choose B on question 19 */
      move(250, 326, 0.35, 0.85);
      click(1.3, optB);
      tl.set(optB, { attr: { 'data-on': '1' } }, 1.33);

      /* 2. Save & Next -> question 20 */
      move(672, 632, 1.85, 0.8);
      click(2.8, next);
      save(2.85);
      tl.set($('[data-cell="19"]'), { attr: { 'data-s': 'a' } }, 3.05)
        .set($('[data-cell="20"]'), { attr: { 'data-s': 'c' } }, 3.1)
        .to(q19, { autoAlpha: 0, x: -24, duration: 0.3, ease: 'power2.in' }, 2.95)
        .to(q20, { autoAlpha: 1, x: 0, duration: 0.45, ease: 'power3.out' }, 3.22)
        .to(prog, { width: '90%', duration: 0.6, ease: 'power2.out' }, 3.05)
        .to(progS, { y: -18, duration: 0.35, ease: 'power2.out' }, 3.05);

      /* 3. type the one-line answer */
      move(220, 291, 3.55, 0.75);
      click(4.4, null);
      tl.set(input, { attr: { 'data-focus': '1' } }, 4.43)
        .set($('[data-ph]'), { display: 'none' }, 4.62);
      $$('[data-typed] > i').forEach(function (c, i) { tl.set(c, { display: 'inline' }, 4.62 + i * 0.11); });

      /* 4. save again */
      move(672, 632, 5.35, 0.75);
      tl.set(input, { attr: { 'data-focus': '0' } }, 6.05);
      click(6.15, next);
      save(6.2);
      tl.set($('[data-cell="20"]'), { attr: { 'data-s': 'a' } }, 6.4)
        .to(prog, { width: '95%', duration: 0.6, ease: 'power2.out' }, 6.4)
        .to(progS, { y: -36, duration: 0.35, ease: 'power2.out' }, 6.4);

      /* 5. Submit -> summary dialog */
      move(1058, 40, 6.75, 0.85);
      click(7.7, $('[data-submit]'));
      tl.to(veil, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, 7.8)
        .to(dlg, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 7.85);

      /* 6. confirm -> submitted */
      move(704, 445, 8.6, 0.8);
      click(9.65, yes);
      tl.to($('[data-yes-a]'), { autoAlpha: 0, duration: 0.15 }, 9.7)
        .to($('[data-yes-b]'), { autoAlpha: 1, duration: 0.2 }, 9.75)
        .to(dConfirm, { autoAlpha: 0, duration: 0.3 }, 10.35)
        .to(dDone, { autoAlpha: 1, duration: 0.45, ease: 'power2.out' }, 10.5);
      move(668, 452, 10.4, 0.9);

      // hold the payoff
      tl.to({}, { duration: 1.5 }, 11.3);
      return tl;
    }
  });
})();
