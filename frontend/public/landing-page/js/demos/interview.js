/* ========================================================================
   Demo scene: the current student-side ANVI interview room.
   A complete first frame is rendered before motion begins. The timeline only
   changes call state, captions and the docked question/transcript panel.
   ======================================================================== */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var ICONS = {
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>',
    captions: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h3M14 10h3M7 14h4M14 14h3"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16M7 9h3M7 13h3"/>',
    phone: '<path d="M6.6 10.8c3.6-1.6 7.2-1.6 10.8 0l2-2.9c.5-.8.3-1.8-.5-2.3C14.3 2.8 9.7 2.8 5.1 5.6c-.8.5-1 1.5-.5 2.3z"/><path d="m8 11-1.5 4M16 11l1.5 4"/>',
    sparkle: '<path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    repeat: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8.5A7 7 0 0 1 18.8 7L20 12M4 12l1.2 5A7 7 0 0 0 18 15.5"/>',
    pause: '<rect x="7" y="5" width="3" height="14" rx="1"/><rect x="14" y="5" width="3" height="14" rx="1"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'
  };

  function icon(name, cls) {
    return '<svg class="' + (cls || 'anvi-demo__icon') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  function wave(count, cls) {
    var html = '';
    for (var i = 0; i < count; i++) html += '<i class="' + cls + '" style="--i:' + i + '"></i>';
    return html;
  }

  function anviMark() {
    return '<span class="anvi-demo__mark" aria-hidden="true">' +
      '<span class="anvi-demo__mark-ring anvi-demo__mark-ring--a"></span>' +
      '<span class="anvi-demo__mark-ring anvi-demo__mark-ring--b"></span>' +
      '<span class="anvi-demo__mark-core">A</span>' +
    '</span>';
  }

  function markup() {
    return '' +
      '<div class="anvi-demo__backdrop" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<header class="anvi-demo__header">' +
        '<div class="anvi-demo__brand">' + anviMark() + '<span><b>AI Mock Interview</b><small>Backend Developer · Product round</small></span></div>' +
        '<div class="anvi-demo__session">' +
          '<span class="anvi-demo__live"><i></i>Live</span>' +
          '<span class="anvi-demo__timer">' + icon('clock') + '<b data-anvi-time>08:42</b></span>' +
          '<span class="anvi-demo__end">' + icon('phone') + 'End interview</span>' +
        '</div>' +
      '</header>' +
      '<div class="anvi-demo__room">' +
        '<main class="anvi-demo__main">' +
          '<div class="anvi-demo__tiles">' +
            '<section class="anvi-demo__tile anvi-demo__tile--anvi" data-anvi-tile>' +
              '<div class="anvi-demo__aurora" aria-hidden="true"></div>' +
              '<div class="anvi-demo__orb" aria-hidden="true"><span class="anvi-demo__orbit anvi-demo__orbit--one"></span><span class="anvi-demo__orbit anvi-demo__orbit--two"></span><span class="anvi-demo__orb-core">' + icon('sparkle') + '</span></div>' +
              '<div class="anvi-demo__plate"><span class="anvi-demo__levels" data-anvi-levels>' + wave(3, 'anvi-demo__level') + '</span><b>ANVI</b><span>· AI Interviewer</span></div>' +
              '<span class="anvi-demo__phase anvi-demo__phase--speaking"><i></i>Speaking</span>' +
              '<span class="anvi-demo__phase anvi-demo__phase--thinking"><i></i>Thinking</span>' +
            '</section>' +
            '<section class="anvi-demo__tile anvi-demo__tile--you" data-you-tile>' +
              '<div class="anvi-demo__you-avatar"><span>AS</span><i></i></div>' +
              '<div class="anvi-demo__you-wave">' + wave(19, 'anvi-demo__you-bar') + '</div>' +
              '<div class="anvi-demo__plate">' + icon('mic') + '<b>Aarav (You)</b><span>· Mic on</span></div>' +
              '<span class="anvi-demo__phase anvi-demo__phase--listening"><i></i>Answering</span>' +
            '</section>' +
          '</div>' +
          '<section class="anvi-demo__captions" aria-label="Live captions">' +
            '<div class="anvi-demo__caption-head"><span>' + icon('captions') + 'Live captions</span><em>English (India)</em></div>' +
            '<div class="anvi-demo__caption-lines">' +
              '<p class="anvi-demo__caption anvi-demo__caption--question">Tell me about a performance bottleneck you found, and how you improved it.</p>' +
              '<p class="anvi-demo__caption anvi-demo__caption--answer">I traced the slow queries, added the right database index, and cached our busiest event requests.</p>' +
              '<p class="anvi-demo__caption anvi-demo__caption--follow">Good. How did you measure the impact of that change?</p>' +
            '</div>' +
          '</section>' +
          '<footer class="anvi-demo__footer">' +
            '<span class="anvi-demo__status anvi-demo__status--speak"><i></i>ANVI is speaking</span>' +
            '<span class="anvi-demo__status anvi-demo__status--listen"><i></i>ANVI is listening</span>' +
            '<span class="anvi-demo__status anvi-demo__status--think"><i></i>Preparing a follow-up</span>' +
            '<div class="anvi-demo__controls" role="presentation">' +
              '<span class="anvi-demo__control">' + icon('mic') + '<small>M</small></span>' +
              '<span class="anvi-demo__control anvi-demo__control--active">' + icon('captions') + '<small>C</small></span>' +
              '<span class="anvi-demo__control anvi-demo__control--active">' + icon('panel') + '</span>' +
              '<i class="anvi-demo__divider"></i><span class="anvi-demo__hangup">' + icon('phone') + 'End</span>' +
            '</div>' +
          '</footer>' +
        '</main>' +
        '<aside class="anvi-demo__side" aria-label="Interview panel">' +
          '<div class="anvi-demo__tabs"><span class="is-active" data-anvi-qtab>Question</span><span data-anvi-ttab>Transcript<i>5</i></span></div>' +
          '<div class="anvi-demo__panels">' +
            '<section class="anvi-demo__panel anvi-demo__panel--question" data-anvi-question>' +
              '<div class="anvi-demo__eyebrow"><span>Current conversation</span><em class="anvi-demo__follow-chip">Follow-up</em></div>' +
              '<div class="anvi-demo__questions"><p class="anvi-demo__question anvi-demo__question--first">Tell me about a performance bottleneck you found, and how you improved it.</p><p class="anvi-demo__question anvi-demo__question--follow">How did you measure the impact of that change?</p></div>' +
              '<div class="anvi-demo__tips"><h3>Voice tips</h3>' +
                '<div><span>' + icon('pause') + '</span><p><b>Pause for 2 seconds</b><small>ANVI takes a pause as the end of your answer.</small></p></div>' +
                '<div><span>' + icon('repeat') + '</span><p><b>Say “repeat”</b><small>Hear the current question again.</small></p></div>' +
                '<div><span>' + icon('mic') + '</span><p><b>Just speak naturally</b><small>There is nothing to click while answering.</small></p></div>' +
              '</div>' +
            '</section>' +
            '<section class="anvi-demo__panel anvi-demo__panel--transcript" data-anvi-transcript>' +
              '<div class="anvi-demo__transcript-head"><span>Conversation</span><em>Auto-saved</em></div><ol>' +
                '<li class="is-anvi">' + anviMark() + '<p><b>ANVI</b><span>Which project best demonstrates your backend engineering skills?</span></p></li>' +
                '<li class="is-you"><span class="anvi-demo__mini-you">AS</span><p><b>You</b><span>Campus Pulse, an event platform I built with Node.js and PostgreSQL.</span></p></li>' +
                '<li class="is-anvi">' + anviMark() + '<p><b>ANVI</b><span>Tell me about a performance bottleneck you found, and how you improved it.</span></p></li>' +
                '<li class="is-you anvi-demo__new-line" data-anvi-answer-line><span class="anvi-demo__mini-you">AS</span><p><b>You</b><span>I traced the slow queries, added the right database index, and cached our busiest event requests.</span></p></li>' +
                '<li class="is-anvi anvi-demo__new-line" data-anvi-follow-line>' + anviMark() + '<p><b>ANVI</b><span>Good. How did you measure the impact of that change?</span></p></li>' +
              '</ol>' +
            '</section>' +
          '</div>' +
          '<div class="anvi-demo__privacy">' + icon('shield') + '<span><b>Private practice session</b>Your transcript is saved; call audio is not.</span></div>' +
        '</aside>' +
      '</div>';
  }

  PP.demos.register('interview', {
    title: 'AI Mock Interview',
    route: '/student/ai-interviews/room/sde-intern-practice',
    nav: 'interviews',
    caption: 'Speak naturally with ANVI, follow the live question, and review the conversation as it is transcribed.',
    description: 'A live student-side ANVI mock interview with an AI interviewer, student call tile, live captions, session timer, question guidance and a real-time transcript. ANVI listens to the student answer and asks a contextual follow-up.',
    duration: 12400,
    create: function (root) {
      root.innerHTML = markup();
      if (!window.gsap) return null;
      var q = function (selector) { return root.querySelector(selector); };
      var qa = function (selector) { return root.querySelectorAll(selector); };
      var tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
      function set0(target, vars) { gsap.set(target, vars); tl.set(target, vars, 0); }
      function show(target, at, vars) { tl.to(target, Object.assign({ autoAlpha: 1, duration: 0.32 }, vars || {}), at); }
      function hide(target, at, vars) { tl.to(target, Object.assign({ autoAlpha: 0, duration: 0.24 }, vars || {}), at); }

      var anviTile = q('[data-anvi-tile]');
      var youTile = q('[data-you-tile]');
      var levels = qa('.anvi-demo__level');
      var youBars = qa('.anvi-demo__you-bar');
      var speaking = q('.anvi-demo__phase--speaking');
      var thinking = q('.anvi-demo__phase--thinking');
      var answering = q('.anvi-demo__phase--listening');
      var statusSpeak = q('.anvi-demo__status--speak');
      var statusListen = q('.anvi-demo__status--listen');
      var statusThink = q('.anvi-demo__status--think');
      var capQuestion = q('.anvi-demo__caption--question');
      var capAnswer = q('.anvi-demo__caption--answer');
      var capFollow = q('.anvi-demo__caption--follow');
      var questionPanel = q('[data-anvi-question]');
      var transcriptPanel = q('[data-anvi-transcript]');
      var qTab = q('[data-anvi-qtab]');
      var tTab = q('[data-anvi-ttab]');
      var firstQuestion = q('.anvi-demo__question--first');
      var followQuestion = q('.anvi-demo__question--follow');
      var followChip = q('.anvi-demo__follow-chip');
      var answerLine = q('[data-anvi-answer-line]');
      var followLine = q('[data-anvi-follow-line]');
      var time = q('[data-anvi-time]');

      set0([thinking, answering, statusListen, statusThink, capAnswer, capFollow, transcriptPanel, followQuestion, followChip, answerLine, followLine], { autoAlpha: 0 });
      set0([speaking, statusSpeak, capQuestion, questionPanel, firstQuestion], { autoAlpha: 1 });
      set0(anviTile, { '--talk': 1 });
      set0(youTile, { '--listen': 0 });
      set0(transcriptPanel, { x: 18 });
      set0(questionPanel, { x: 0 });
      set0([answerLine, followLine], { y: 12 });
      set0(followQuestion, { y: 10 });

      Array.prototype.forEach.call(levels, function (bar, i) {
        tl.to(bar, { scaleY: 1.75 - i * 0.22, duration: 0.2, repeat: 15, yoyo: true, ease: 'sine.inOut', delay: i * 0.06 }, 0);
      });
      hide(speaking, 3.25); hide(statusSpeak, 3.25); hide(capQuestion, 3.2, { y: -5 });
      tl.to(anviTile, { '--talk': 0, duration: 0.35 }, 3.15);
      show(answering, 3.45); show(statusListen, 3.45); show(capAnswer, 3.5, { y: 0 });
      tl.to(youTile, { '--listen': 1, duration: 0.35 }, 3.4);
      Array.prototype.forEach.call(youBars, function (bar, i) {
        var peak = 0.4 + ((i * 7) % 11) / 10;
        tl.to(bar, { scaleY: peak, duration: 0.16 + (i % 3) * 0.03, repeat: 17, yoyo: true, ease: 'sine.inOut' }, 3.45 + (i % 4) * 0.025);
      });

      hide(questionPanel, 6.55, { x: -14 });
      tl.set(qTab, { className: '' }, 6.55).set(tTab, { className: 'is-active' }, 6.55);
      show(transcriptPanel, 6.7, { x: 0, duration: 0.42 });
      show(answerLine, 7.0, { y: 0, duration: 0.45 });
      if (time) tl.set(time, { textContent: '08:51' }, 6.1);

      hide(answering, 7.7); hide(statusListen, 7.7);
      tl.to(youTile, { '--listen': 0, duration: 0.3 }, 7.65);
      show(thinking, 7.85); show(statusThink, 7.85); hide(capAnswer, 7.8, { y: -5 });
      tl.to(q('.anvi-demo__orb-core'), { rotate: 180, duration: 1.15, ease: 'power2.inOut' }, 7.8);
      show(followLine, 8.55, { y: 0, duration: 0.4 });

      hide(transcriptPanel, 9.05, { x: 14 });
      tl.set(tTab, { className: '' }, 9.2).set(qTab, { className: 'is-active' }, 9.2);
      hide(firstQuestion, 9.15, { y: -8 });
      show(questionPanel, 9.25, { x: 0, duration: 0.42 });
      show([followQuestion, followChip], 9.45, { y: 0, duration: 0.42 });
      hide(thinking, 9.55); hide(statusThink, 9.55);
      show(speaking, 9.7); show(statusSpeak, 9.7); show(capFollow, 9.7, { y: 0 });
      tl.to(anviTile, { '--talk': 1, duration: 0.35 }, 9.65);
      Array.prototype.forEach.call(levels, function (bar, i) {
        tl.to(bar, { scaleY: 1.65 - i * 0.18, duration: 0.18, repeat: 12, yoyo: true, ease: 'sine.inOut', delay: i * 0.04 }, 9.7);
      });
      tl.to({}, { duration: 0.01 }, 12.39);
      return tl;
    }
  });
})();
