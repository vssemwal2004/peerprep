/* ==========================================================================
   Demo scene: AI voice mock interview room.
   The AI interviewer asks Q3 -> student records an answer -> transcript
   appears -> "Use this answer" -> the interviewer asks a follow-up based on
   the answer. No scores, no evaluation report — just the conversation.

   First frame (t=0) is complete: the interviewer is mid-question, transcript populated.
   Initial states are applied immediately (gsap.set) and recorded at 0 on the
   timeline, so the scene is seek-safe and restartable.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var I = {
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
    redo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    vol: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    text: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  function ic(n, cls) {
    return '<svg class="' + (cls || 'dm-interview__ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + '</svg>';
  }
  function words(text, cls) {
    return text.split(' ').map(function (w) { return '<span class="' + cls + '">' + PP.esc(w) + '</span>'; }).join(' ');
  }
  function bars(n, cls) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<i class="' + cls + '"></i>';
    return s;
  }
  // Deterministic PRNG so the "audio" looks the same every loop.
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var Q3 = 'Tell me about a performance problem you hit in that project. What did you change, and why?';
  var ANSWER = 'Event listings slowed down at peak times. I added an index on the event date and cached hot queries in Redis — API latency dropped by about 38 percent.';
  var FOLLOW = 'How did you measure that improvement?';

  var uid = 0;

  // Flat illustrated portrait that sits on the bottom edge of a call tile.
  function avatarSVG(id) {
    return '' +
    '<svg class="dm-interview__avatar" viewBox="0 0 280 280" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '-face" x1="0" y1="0" x2="0" y2="1"><stop class="dm-interview__s-f1" offset="0"/><stop class="dm-interview__s-f2" offset="1"/></linearGradient></defs>' +
      '<g class="dm-interview__a-body">' +
        '<path class="dm-interview__a-shirt" d="M40 280c8-56 46-82 100-82s92 26 100 82z"/>' +
        '<path class="dm-interview__a-collar" d="M98 204l42 44 42-44"/>' +
        '<path class="dm-interview__a-tie" d="M130 210l10 12 10-12-10-10z"/>' +
        '<path class="dm-interview__a-tie" d="M140 222l-8 58h16z"/>' +
        '<ellipse class="dm-interview__a-hairback" cx="140" cy="128" rx="72" ry="83"/>' +
        '<ellipse cx="140" cy="133" rx="59" ry="69" fill="url(#' + id + '-face)"/>' +
        '<path class="dm-interview__a-hair" d="M79 115c1-55 28-77 64-77 48 0 70 34 63 83-8-28-23-40-44-43-25 22-52 24-83 37z"/>' +
        '<path class="dm-interview__a-brow" d="M100 125q13-8 25 0M155 125q13-8 25 0"/>' +
        '<g class="dm-interview__a-eyes"><ellipse cx="113" cy="139" rx="4" ry="6"/><ellipse cx="167" cy="139" rx="4" ry="6"/></g>' +
        '<path class="dm-interview__a-nose" d="M137 148q-5 10 2 12"/>' +
        '<ellipse class="dm-interview__a-mouth" cx="140" cy="179" rx="13" ry="3"/>' +
        '<path class="dm-interview__a-smile" d="M126 178q14 9 28 0"/>' +
        '<path class="dm-interview__a-ear" d="M67 128q-10 0-10 16t11 16M212 128q10 0 10 16t-11 16"/>' +
        '<path class="dm-interview__a-band" d="M53 139c0-28 17-46 38-47M227 139c0-28-17-46-38-47"/>' +
        '<rect class="dm-interview__a-cup" x="44" y="133" width="18" height="39" rx="9"/>' +
        '<rect class="dm-interview__a-cup" x="218" y="133" width="18" height="39" rx="9"/>' +
      '</g>' +
    '</svg>';
  }

  var CURSOR =
    '<div class="dm-cursor" aria-hidden="true"><span class="dm-cursor__ripple"></span>' +
    '<svg class="dm-cursor__arrow" viewBox="0 0 24 24"><path d="M5 3.2v15.6l4.3-4.1 2.7 6.1 2.6-1.1-2.7-6h5.9z"/></svg></div>';

  function markup(id) {
    var segs = '';
    for (var i = 0; i < 8; i++) segs += '<i class="dm-interview__seg' + (i < 2 ? ' is-done' : i === 2 ? ' is-now' : '') + '"></i>';
    var timer = '';
    for (var s = 0; s <= 23; s++) timer += '<span>' + (s < 10 ? '0' : '') + s + '</span>';

    return '' +
    /* ---------- header ---------- */
    '<header class="dm-interview__head">' +
      '<span class="dm-interview__back">' + ic('back') + '</span>' +
      '<div class="dm-interview__ttl"><b>AI mock interview</b><span><i class="dm-interview__live"></i>In progress · auto-saved</span></div>' +
      '<span class="dm-interview__chip">' + ic('briefcase') + 'SDE Intern · Product company</span>' +
      '<span class="dm-interview__chip">' + ic('layers') + 'Section 2 · Projects</span>' +
      '<div class="dm-interview__prog">' +
        '<div class="dm-interview__qof"><b>Question 3 of 8</b><span class="dm-interview__fu">· Follow-up 1</span></div>' +
        '<div class="dm-interview__segs">' + segs + '</div>' +
      '</div>' +
    '</header>' +

    /* ---------- stage ---------- */
    '<section class="dm-interview__stage">' +
      '<div class="dm-interview__avcol">' +
        '<div class="dm-interview__tile">' +
          avatarSVG(id) +
          '<span class="dm-interview__tname"><b>AI interviewer</b>Voice interview</span>' +
        '</div>' +
        '<div class="dm-interview__status">' +
          '<span class="dm-interview__stx dm-interview__stx--ready"><i></i>Interviewer is ready</span>' +
          '<span class="dm-interview__stx dm-interview__stx--speak"><i></i>Interviewer is speaking</span>' +
          '<span class="dm-interview__stx dm-interview__stx--listen"><i></i>Interviewer is listening</span>' +
          '<span class="dm-interview__stx dm-interview__stx--think"><i></i>Interviewer is preparing the next question</span>' +
        '</div>' +
        '<div class="dm-interview__voice">' + bars(40, 'dm-interview__vb') + '</div>' +
        '<div class="dm-interview__play"><span class="dm-interview__pbtn">' + ic('pause') + 'Pause question</span><span class="dm-interview__voicenote">AI-generated voice</span></div>' +
      '</div>' +

      /* question */
      '<div class="dm-interview__qcard">' +
        '<div class="dm-interview__qlayer dm-interview__q1">' +
          '<div class="dm-interview__qeb"><span>Question 3</span><em>Projects</em></div>' +
          '<p class="dm-interview__qtext">' + PP.esc(Q3) + '</p>' +
        '</div>' +
        '<div class="dm-interview__qlayer dm-interview__q2">' +
          '<div class="dm-interview__qeb"><span>Follow-up 1</span><em>Based on your answer</em></div>' +
          '<p class="dm-interview__qtext dm-interview__qtext--lg">' + words(FOLLOW, 'dm-interview__fw') + '</p>' +
        '</div>' +
        '<span class="dm-interview__qplay">' + ic('vol') + 'Play question</span>' +
      '</div>' +

      /* answer panel */
      '<div class="dm-interview__ans">' +
        '<div class="dm-interview__as dm-interview__as--ready">' +
          '<p class="dm-interview__hint">Use your microphone to answer. Review the transcript before continuing.</p>' +
        '</div>' +
        '<div class="dm-interview__as dm-interview__as--rec">' +
          '<div class="dm-interview__recrow"><span class="dm-interview__recdot"></span>REC' +
            '<span class="dm-interview__timer">0:<span class="dm-interview__tw"><span class="dm-interview__ts">' + timer + '</span></span><em> / 3:00</em></span></div>' +
          '<div class="dm-interview__rwave">' + bars(48, 'dm-interview__rb') + '</div>' +
          '<p class="dm-interview__hint">Listening… speak your answer, then stop recording. Maximum 3 minutes.</p>' +
        '</div>' +
        '<div class="dm-interview__micwrap">' +
          '<span class="dm-interview__mic">' +
            '<span class="dm-interview__mic-rec"></span>' +
            ic('mic', 'dm-interview__mic-ic dm-interview__mic-ic--mic') +
            ic('stop', 'dm-interview__mic-ic dm-interview__mic-ic--stop') +
          '</span>' +
          '<span class="dm-interview__miclbl dm-interview__miclbl--rec">Record answer</span>' +
          '<span class="dm-interview__miclbl dm-interview__miclbl--stop">Stop recording</span>' +
        '</div>' +
        '<div class="dm-interview__as dm-interview__as--prep">' +
          '<span class="dm-interview__shim"></span><span class="dm-interview__shim"></span><span class="dm-interview__shim dm-interview__shim--s"></span>' +
          '<p>Preparing your transcript…</p>' +
        '</div>' +
        '<div class="dm-interview__as dm-interview__as--review">' +
          '<div class="dm-interview__rvh">' + ic('text') + '<b>Your recorded answer</b><span>0:23 · transcribed</span></div>' +
          '<p class="dm-interview__rvt">' + words(ANSWER, 'dm-interview__aw') + '</p>' +
          '<span class="dm-interview__again">' + ic('redo') + 'Record again</span>' +
          '<span class="dm-interview__use">' + ic('check') + 'Use this answer</span>' +
        '</div>' +
      '</div>' +
    '</section>' +

    /* ---------- transcript rail ---------- */
    '<aside class="dm-interview__rail">' +
      '<div class="dm-interview__rh">' + ic('text') + '<b>Conversation transcript</b>' +
        '<span class="dm-interview__cnt"><span class="dm-interview__cw"><span class="dm-interview__cs"><span>4</span><span>5</span><span>6</span><span>7</span></span></span>&nbsp;lines</span></div>' +
      '<div class="dm-interview__list">' +
        '<div class="dm-interview__div">Section 1 · Introduction</div>' +
        '<div class="dm-interview__li dm-interview__li--ai"><b>Interviewer</b>Hello, I’ll be your AI interviewer today and guide you through this practice interview. Shall we begin with your projects?</div>' +
        '<div class="dm-interview__li dm-interview__li--you"><b>You</b>Sure, I’m ready.</div>' +
        '<div class="dm-interview__div">Section 2 · Projects</div>' +
        '<div class="dm-interview__li dm-interview__li--ai"><b>Interviewer</b>Which project on your resume best shows your backend skills?</div>' +
        '<div class="dm-interview__li dm-interview__li--you"><b>You</b>Campus Pulse — a Node.js and PostgreSQL API that serves event listings to three student clubs.</div>' +
        '<div class="dm-interview__li dm-interview__li--ai dm-interview__li--new dm-interview__n1"><b>Interviewer</b>' + PP.esc(Q3) + '</div>' +
        '<div class="dm-interview__li dm-interview__li--you dm-interview__li--new dm-interview__n2"><b>You</b>' + PP.esc(ANSWER) + '</div>' +
        '<div class="dm-interview__li dm-interview__li--ai dm-interview__li--new dm-interview__n3"><b>Interviewer</b>Follow-up — ' + PP.esc(FOLLOW.charAt(0).toLowerCase() + FOLLOW.slice(1)) + '</div>' +
      '</div>' +
      '<div class="dm-interview__rf">' +
        '<span class="dm-interview__consent">' + ic('shield') + 'Resume-based questions · consent given</span>' +
        '<p>' + ic('lock') + 'Your recording is transcribed; the audio is not saved by this app.</p>' +
      '</div>' +
    '</aside>' + CURSOR;
  }

  PP.demos.register('interview', {
    title: 'AI Mock Interview',
    route: '/student/ai-interviews/room/sde-intern-practice',
    nav: 'interviews',
    caption: 'Answer out loud, review your transcript, and handle a follow-up — practise the conversation, not just the answer.',
    description: 'Animated recreation of the PeerPrep AI voice mock interview room for an SDE Intern practice interview, Section 2: Projects, question 3 of 8. The AI interviewer, shown in a call tile, speaks the question while a voice waveform moves: tell me about a performance problem you hit in that project, what did you change and why. The student presses the microphone, a live waveform and timer show the recording, then stops. A speech-to-text transcript of the answer appears with Record again and Use this answer buttons. After the student uses the answer, the interviewer prepares and asks a follow-up based on it: how did you measure that improvement. A transcript rail on the right collects the Interviewer and You lines. A note says resume-based questions are used with consent. No scores are shown.',
    duration: 13600,
    create: function (root) {
      var id = 'dm-aiv-' + (++uid);
      root.innerHTML = markup(id);
      if (!window.gsap) return null;
      var q = function (s) { return root.querySelector(s); };
      var qa = function (s) { return root.querySelectorAll(s); };
      var tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
      var rand = rng(7);
      // initial state: applied now (first frame) and recorded at 0 (restart)
      function at0(t, v) { gsap.set(t, v); tl.set(t, v, 0); }

      var cursor = q('.dm-cursor');
      var ripple = q('.dm-cursor__ripple');
      var P = {
        rest: { x: 300, y: 640 },
        mic: { x: 548, y: 434 },
        use: { x: 632, y: 608 },
        park: { x: 700, y: 520 }
      };
      function move(to, at, dur) { tl.to(cursor, { x: to.x, y: to.y, duration: dur || 0.7, ease: 'power2.inOut' }, at); }
      function click(at) {
        tl.to(cursor, { scale: 0.86, duration: 0.09, ease: 'power2.out' }, at)
          .to(cursor, { scale: 1, duration: 0.22, ease: 'power2.out' }, at + 0.09)
          .fromTo(ripple, { scale: 0.3, autoAlpha: 0.55 }, { scale: 1.8, autoAlpha: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, at);
      }
      function press(el, at) {
        tl.to(el, { scale: 0.95, duration: 0.09 }, at).to(el, { scale: 1, duration: 0.25, ease: 'power2.out' }, at + 0.09);
      }
      var stx = {
        ready: q('.dm-interview__stx--ready'), speak: q('.dm-interview__stx--speak'),
        listen: q('.dm-interview__stx--listen'), think: q('.dm-interview__stx--think')
      };
      function status(name, at) {
        Object.keys(stx).forEach(function (k) {
          tl.to(stx[k], { autoAlpha: k === name ? 1 : 0, duration: 0.25 }, at);
        });
      }
      // Deterministic waveform motion inside a window, settling to `rest`.
      function wave(barsEls, t0, t1, peak, step, rest) {
        step = step || 0.13;
        var n = barsEls.length;
        Array.prototype.forEach.call(barsEls, function (b, i) {
          var env = 0.35 + 0.65 * Math.sin(Math.PI * (i + 0.5) / n);
          var kf = [];
          for (var t = t0; t < t1; t += step) kf.push({ scaleY: Math.max(0.1, env * peak * (0.25 + 0.75 * rand())), duration: step, ease: 'sine.inOut' });
          kf.push({ scaleY: rest, duration: 0.25 });
          tl.to(b, { keyframes: kf }, t0);
        });
      }
      function mouth(t0, t1) {
        var kf = [];
        for (var t = t0; t < t1; t += 0.11) kf.push({ attr: { ry: 3 + Math.round(rand() * 8) }, duration: 0.11, ease: 'sine.inOut' });
        kf.push({ attr: { ry: 3 }, duration: 0.15 });
        tl.to(q('.dm-interview__a-mouth'), { keyframes: kf }, t0)
          .to(q('.dm-interview__a-smile'), { autoAlpha: 0, duration: 0.15 }, t0)
          .to(q('.dm-interview__a-smile'), { autoAlpha: 1, duration: 0.2 }, t1 + 0.1);
      }
      function speaking(t0, t1) {
        mouth(t0, t1);
        wave(qa('.dm-interview__vb'), t0, t1, 1, 0.12, 0.08);
        tl.to(q('.dm-interview__tile'), { '--speak': 1, duration: 0.3 }, t0)
          .to(q('.dm-interview__tile'), { '--speak': 0, duration: 0.4 }, t1);
      }

      var states = {
        ready: q('.dm-interview__as--ready'), rec: q('.dm-interview__as--rec'),
        prep: q('.dm-interview__as--prep'), review: q('.dm-interview__as--review')
      };
      var micwrap = q('.dm-interview__micwrap');
      var mic = q('.dm-interview__mic');
      var newLis = [q('.dm-interview__n1'), q('.dm-interview__n2'), q('.dm-interview__n3')];
      var cntH = 18;

      /* ---- initial state: the interviewer is mid-way through asking Q3 ---- */
      var vb = qa('.dm-interview__vb');
      Array.prototype.forEach.call(vb, function (b, i) {
        var env = 0.35 + 0.65 * Math.sin(Math.PI * (i + 0.5) / vb.length);
        at0(b, { scaleY: Math.max(0.1, env * (0.3 + 0.6 * Math.abs(Math.sin(i * 1.7)))) });
      });
      at0(cursor, { x: P.rest.x, y: P.rest.y, scale: 1, autoAlpha: 1 });
      at0(ripple, { autoAlpha: 0, scale: 0.3 });
      at0(stx.speak, { autoAlpha: 1 });
      at0([stx.ready, stx.listen, stx.think], { autoAlpha: 0 });
      at0(q('.dm-interview__tile'), { '--speak': 1 });
      at0(qa('.dm-interview__rb'), { scaleY: 0.08 });
      at0(q('.dm-interview__a-mouth'), { attr: { ry: 4 } });
      at0(q('.dm-interview__a-smile'), { autoAlpha: 0 });
      at0(q('.dm-interview__a-eyes'), { scaleY: 1, transformOrigin: '50% 50%' });
      at0(q('.dm-interview__q1'), { autoAlpha: 1, y: 0 });
      at0(q('.dm-interview__q2'), { autoAlpha: 0, y: 10 });
      at0(qa('.dm-interview__fw'), { autoAlpha: 0 });
      at0(q('.dm-interview__fu'), { autoAlpha: 0 });
      at0(states.ready, { autoAlpha: 1, y: 0 });
      at0([states.rec, states.prep, states.review], { autoAlpha: 0, y: 0 });
      at0(micwrap, { autoAlpha: 0.45, y: 0, scale: 1 });
      at0(mic, { scale: 1 });
      at0(q('.dm-interview__mic-rec'), { autoAlpha: 0 });
      at0(q('.dm-interview__mic-ic--mic'), { autoAlpha: 1 });
      at0(q('.dm-interview__mic-ic--stop'), { autoAlpha: 0 });
      at0(q('.dm-interview__miclbl--rec'), { autoAlpha: 1 });
      at0(q('.dm-interview__miclbl--stop'), { autoAlpha: 0 });
      at0(q('.dm-interview__ts'), { y: 0 });
      at0(qa('.dm-interview__aw'), { autoAlpha: 0 });
      at0([q('.dm-interview__again'), q('.dm-interview__use')], { autoAlpha: 0, y: 6, scale: 1 });
      at0(newLis, { maxHeight: 0, autoAlpha: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 });
      at0(q('.dm-interview__cs'), { y: 0 });
      at0(q('.dm-interview__qplay'), { autoAlpha: 0 });
      at0(q('.dm-interview__pbtn'), { autoAlpha: 1 });

      var END = 13.6;
      // natural blinks only — no idle floating
      [2.2, 5.4, 8.1, 12.4].forEach(function (t) {
        tl.to(q('.dm-interview__a-eyes'), { scaleY: 0.1, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut' }, t);
      });

      function addLine(el, at, cnt) {
        tl.to(el, { maxHeight: 160, autoAlpha: 1, marginTop: 10, paddingTop: 10, paddingBottom: 10, duration: 0.6, ease: 'power3.out' }, at)
          .to(q('.dm-interview__cs'), { y: -cntH * cnt, duration: 0.35, ease: 'power2.out' }, at);
      }

      /* ---- 1. the interviewer finishes asking Q3 ---- */
      speaking(0, 2.9);
      status('ready', 3.05);
      addLine(newLis[0], 3.05, 1);
      tl.to(micwrap, { autoAlpha: 1, duration: 0.3 }, 3.0)
        .to(q('.dm-interview__qplay'), { autoAlpha: 1, duration: 0.3 }, 3.1)
        .to(q('.dm-interview__pbtn'), { autoAlpha: 0.45, duration: 0.3 }, 3.05);

      /* ---- 2. record ---- */
      move(P.mic, 2.55, 0.85);
      click(3.5);
      press(mic, 3.5);
      var r0 = 3.6, r1 = 6.4;
      tl.to(states.ready, { autoAlpha: 0, duration: 0.2 }, r0)
        .fromTo(states.rec, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, immediateRender: false }, r0)
        .to(q('.dm-interview__mic-rec'), { autoAlpha: 1, duration: 0.3 }, r0)
        .to(q('.dm-interview__mic-ic--mic'), { autoAlpha: 0, duration: 0.2 }, r0)
        .to(q('.dm-interview__mic-ic--stop'), { autoAlpha: 1, duration: 0.3 }, r0 + 0.1)
        .to(q('.dm-interview__miclbl--rec'), { autoAlpha: 0, duration: 0.2 }, r0)
        .to(q('.dm-interview__miclbl--stop'), { autoAlpha: 1, duration: 0.3 }, r0 + 0.1)
        .to(q('.dm-interview__ts'), { y: -23 * 20, duration: r1 - r0, ease: 'steps(23)' }, r0);
      status('listen', r0);
      wave(qa('.dm-interview__rb'), r0 + 0.1, r1, 1, 0.11, 0.08);
      move({ x: 560, y: 446 }, 5.2, 0.6);
      move(P.mic, 5.95, 0.4);

      /* ---- 3. stop -> transcript ---- */
      click(r1 + 0.05);
      press(mic, r1 + 0.05);
      tl.to(states.rec, { autoAlpha: 0, duration: 0.2 }, r1 + 0.1)
        .to(micwrap, { autoAlpha: 0, duration: 0.25 }, r1 + 0.1)
        .fromTo(states.prep, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, immediateRender: false }, r1 + 0.15);
      status('ready', r1 + 0.1);
      var d0 = 7.05;
      tl.to(states.prep, { autoAlpha: 0, duration: 0.2 }, d0 - 0.1)
        .fromTo(states.review, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, immediateRender: false }, d0)
        .to(qa('.dm-interview__aw'), { autoAlpha: 1, duration: 0.25, stagger: 0.03 }, d0 + 0.15)
        .to([q('.dm-interview__again'), q('.dm-interview__use')], { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08 }, d0 + 1.2);
      move({ x: 470, y: 560 }, 6.7, 0.9);

      /* ---- 4. use this answer -> follow-up ---- */
      move(P.use, 8.45, 0.65);
      click(9.2);
      press(q('.dm-interview__use'), 9.2);
      tl.to(states.review, { autoAlpha: 0, y: -8, duration: 0.3 }, 9.35)
        .set(q('.dm-interview__mic-rec'), { autoAlpha: 0 }, 9.4)
        .set(q('.dm-interview__mic-ic--mic'), { autoAlpha: 1 }, 9.4)
        .set(q('.dm-interview__mic-ic--stop'), { autoAlpha: 0 }, 9.4)
        .set(q('.dm-interview__miclbl--rec'), { autoAlpha: 1 }, 9.4)
        .set(q('.dm-interview__miclbl--stop'), { autoAlpha: 0 }, 9.4)
        .to(states.ready, { autoAlpha: 1, duration: 0.4 }, 9.55)
        .to(micwrap, { autoAlpha: 0.45, duration: 0.4 }, 9.55);
      addLine(newLis[1], 9.4, 2);
      move(P.park, 9.5, 0.9);
      status('think', 9.5);
      tl.to(q('.dm-interview__q1'), { autoAlpha: 0, y: -10, duration: 0.4, ease: 'power2.in' }, 9.75)
        .to(q('.dm-interview__qplay'), { autoAlpha: 0, duration: 0.3 }, 9.75)
        .to(q('.dm-interview__pbtn'), { autoAlpha: 1, duration: 0.3 }, 10.15)
        .to(q('.dm-interview__q2'), { autoAlpha: 1, y: 0, duration: 0.45 }, 10.0)
        .to(q('.dm-interview__fu'), { autoAlpha: 1, duration: 0.45 }, 10.1);
      // the interviewer starts speaking as soon as the follow-up card lands (no empty card)
      status('speak', 10.15);
      speaking(10.2, 11.6);
      tl.to(qa('.dm-interview__fw'), { autoAlpha: 1, duration: 0.35, stagger: 0.2, ease: 'power2.out' }, 10.25);
      status('ready', 11.7);
      addLine(newLis[2], 11.7, 3);
      tl.to(micwrap, { autoAlpha: 1, duration: 0.4 }, 11.75)
        .to(q('.dm-interview__qplay'), { autoAlpha: 1, duration: 0.3 }, 11.75)
        .to(q('.dm-interview__pbtn'), { autoAlpha: 0.45, duration: 0.3 }, 11.7);

      tl.to({}, { duration: 0.01 }, END - 0.01);
      return tl;
    }
  });
})();
