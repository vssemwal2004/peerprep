/* ==========================================================================
   Demo scene: PrepCoding — problem library → workspace → Run → Submit → Accepted
   Stage: 1128 x 680 logical px. All state changes are render-based GSAP tweens
   (no callbacks), so seek(), restart() and reverse all land on exact frames.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.PP || !PP.demos) return;

  var C = 'dm-coding__';

  /* ---------- icons ---------- */
  function ic(path, cls) {
    return '<svg class="' + (cls || C + 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var I = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    half: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
    play: '<path d="M7 5v14l11-7z" fill="currentColor"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M5 19h14"/>',
    // Anvi gives a hint, so a plain line lightbulb (no AI sparkle).
    bulb: '<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7V16h6v-.1c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    chip: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  /* ---------- fictional library data ---------- */
  var ROWS = [
    { n: 1, t: 'Pair Sum to Target', tags: ['Array', 'Hash Table'], acc: 52.4, d: 'Easy', s: 'none', hit: true },
    { n: 14, t: 'Longest Unique-Character Window', tags: ['String', 'Sliding Window'], acc: 34.1, d: 'Medium', s: 'solved' },
    { n: 27, t: 'Widest Container Between Walls', tags: ['Two Pointers', 'Greedy'], acc: 55.0, d: 'Medium', s: 'attempted' },
    { n: 39, t: 'Rainwater Between Bars', tags: ['Stack', 'Two Pointers'], acc: 61.8, d: 'Hard', s: 'none' },
    { n: 52, t: 'Pair Sum in a Sorted Array', tags: ['Two Pointers', 'Binary Search'], acc: 60.2, d: 'Medium', s: 'solved', hit: true },
    { n: 68, t: 'Islands in a Grid', tags: ['Graph', 'BFS'], acc: 58.7, d: 'Medium', s: 'solved' },
    { n: 85, t: 'Fewest Coins for an Amount', tags: ['Dynamic Programming'], acc: 43.9, d: 'Medium', s: 'attempted' },
    { n: 103, t: 'Pair Sum in a BST', tags: ['Tree', 'Hash Table'], acc: 61.0, d: 'Easy', s: 'none', hit: true },
    { n: 117, t: 'Smallest Covering Window', tags: ['String', 'Sliding Window'], acc: 42.6, d: 'Hard', s: 'none' }
  ];

  /* ---------- code (Python 3) ---------- */
  var STARTER = [
    'class Solution:',
    '    def pairSum(self, nums: List[int], target: int) -> List[int]:'
  ];
  var TYPED = [ // [indent, text]
    [8, 'seen = {}'],
    [8, 'for i, x in enumerate(nums):'],
    [12, 'need = target - x'],
    [12, 'if need in seen:'],
    [16, 'return [seen[need], i]'],
    [12, 'seen[x] = i'],
    [8, 'return []']
  ];
  var KW = /^(class|def|for|in|if|return|not|and|or|while|else|elif|None|True|False)$/;
  var BI = /^(enumerate|List|int|range|len|dict)$/;

  function tokenize(src) {
    var out = [], m, re = /(\s+)|([A-Za-z_]\w*)|(\d+)|(->|==|[\[\]{}():,.=+\-*<>])/g, prev = '';
    while ((m = re.exec(src))) {
      var tx = m[0], k = 'p';
      if (m[1]) k = 'w';
      else if (m[2]) {
        if (KW.test(tx)) k = 'k';
        else if (BI.test(tx)) k = 'b';
        else if (tx === 'self') k = 's';
        else if (prev === 'def' || prev === 'class') k = 'f';
        else k = 'v';
        prev = tx;
      } else if (m[3]) k = 'n';
      out.push([k, tx]);
    }
    return out;
  }
  function staticLine(src) {
    return tokenize(src).map(function (t) {
      return t[0] === 'w' ? t[1] : '<span class="' + C + 'tk--' + t[0] + '">' + PP.esc(t[1]) + '</span>';
    }).join('');
  }
  // Typed line: every character is its own <i>, revealed with display sets.
  function typedLine(src) {
    return tokenize(src).map(function (t) {
      var chars = t[1].split('').map(function (ch) { return '<i>' + PP.esc(ch) + '</i>'; }).join('');
      return '<span class="' + C + 'tk--' + t[0] + '">' + chars + '</span>';
    }).join('');
  }

  // Deterministic jitter so every loop types identically.
  function rng(seed) { return function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }

  function diffClass(d) { return d === 'Easy' ? 'easy' : d === 'Medium' ? 'med' : 'hard'; }
  function statusIcon(s) {
    if (s === 'solved') return '<span class="' + C + 'st ' + C + 'st--solved" title="Solved">' + ic(I.checkCircle) + '</span>';
    if (s === 'attempted') return '<span class="' + C + 'st ' + C + 'st--att" title="Attempted">' + ic(I.half) + '</span>';
    return '<span class="' + C + 'st ' + C + 'st--none"></span>';
  }
  function titleHTML(r) {
    var t = PP.esc(r.t);
    if (r.hit) t = t.replace('Pair Sum', '<mark class="' + C + 'mark">Pair Sum</mark>');
    return '<span class="' + C + 'num">' + r.n + '.</span> ' + t;
  }

  function buildLibrary() {
    var rows = ROWS.map(function (r, i) {
      return '<div class="' + C + 'row' + (r.hit ? ' is-hit' : ' is-miss') + '" data-i="' + i + '">' +
        '<div class="' + C + 'c ' + C + 'c--st">' + statusIcon(r.s) + '</div>' +
        '<div class="' + C + 'c ' + C + 'c--title">' + titleHTML(r) + '</div>' +
        '<div class="' + C + 'c ' + C + 'c--tags">' + r.tags.map(function (t) { return '<span class="' + C + 'tag">' + t + '</span>'; }).join('') + '</div>' +
        '<div class="' + C + 'c ' + C + 'c--acc"><span>' + r.acc.toFixed(1) + '%</span><span class="' + C + 'accbar"><b style="width:' + r.acc + '%"></b></span></div>' +
        '<div class="' + C + 'c ' + C + 'c--diff"><span class="' + C + 'diff ' + C + 'diff--' + diffClass(r.d) + '">' + r.d + '</span></div>' +
        '<div class="' + C + 'c ' + C + 'c--fav">' + ic(I.star) + '</div>' +
        '</div>';
    }).join('');

    return '' +
      '<section class="' + C + 'lib">' +
        '<header class="' + C + 'libhead">' +
          '<div>' +
            '<p class="' + C + 'kicker">PrepCoding · Library</p>' +
            '<div class="dm-h3 ' + C + 'h">Questions <span class="' + C + 'count">4,000+</span></div>' +
          '</div>' +
          '<div class="' + C + 'headright">' +
            '<div class="' + C + 'progress">' +
              '<span class="' + C + 'ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14" class="' + C + 'ringbg"/><circle cx="18" cy="18" r="14" class="' + C + 'ringfg" pathLength="100"/></svg><b>152</b></span>' +
              '<div class="' + C + 'progtext"><span>Solved</span>' +
                '<span class="' + C + 'emh"><i class="' + C + 'dot ' + C + 'dot--easy"></i>86<i class="' + C + 'dot ' + C + 'dot--med"></i>54<i class="' + C + 'dot ' + C + 'dot--hard"></i>12</span>' +
              '</div>' +
            '</div>' +
            '<span class="' + C + 'surprise">' + ic(I.dice) + 'Surprise me</span>' +
          '</div>' +
        '</header>' +
        '<div class="' + C + 'toolbar">' +
          '<div class="' + C + 'search">' + ic(I.search) + '<span class="' + C + 'ph">Search questions</span><span class="' + C + 'q"></span><b class="' + C + 'caret ' + C + 'caret--search"></b></div>' +
          '<span class="' + C + 'fchip">Topic' + ic(I.chev) + '</span>' +
          '<span class="' + C + 'fchip">Company' + ic(I.chev) + '</span>' +
          '<span class="' + C + 'fchip ' + C + 'fchip--diff"><i class="' + C + 'dot ' + C + 'dot--easy"></i><i class="' + C + 'dot ' + C + 'dot--med"></i><i class="' + C + 'dot ' + C + 'dot--hard"></i>Difficulty' + ic(I.chev) + '</span>' +
          '<span class="' + C + 'fchip">Status' + ic(I.chev) + '</span>' +
          '<span class="' + C + 'sort">' + ic(I.sort) + 'Recently asked</span>' +
        '</div>' +
        '<div class="' + C + 'table">' +
          '<div class="' + C + 'thead">' +
            '<div class="' + C + 'c ' + C + 'c--st">Status</div>' +
            '<div class="' + C + 'c ' + C + 'c--title">Title</div>' +
            '<div class="' + C + 'c ' + C + 'c--tags">Topics</div>' +
            '<div class="' + C + 'c ' + C + 'c--acc">Acceptance</div>' +
            '<div class="' + C + 'c ' + C + 'c--diff">Difficulty</div>' +
            '<div class="' + C + 'c ' + C + 'c--fav"></div>' +
          '</div>' +
          '<div class="' + C + 'rows">' + rows + '</div>' +
          '<div class="' + C + 'tfoot"><span class="' + C + 'shown ' + C + 'shown--all">Showing 9 of 4,000+ questions</span><span class="' + C + 'shown ' + C + 'shown--hit">3 matches for “pair sum”</span><span class="' + C + 'pager">' + ic(I.left) + '<b>1</b><span>2</span><span>3</span>' + ic(I.right) + '</span></div>' +
        '</div>' +
      '</section>';
  }

  function buildWorkspace() {
    var codeRows = '';
    STARTER.forEach(function (src, i) {
      codeRows += '<div class="' + C + 'ln"><span class="' + C + 'lnum">' + (i + 1) + '</span><span class="' + C + 'src">' + staticLine(src) + '</span></div>';
    });
    TYPED.forEach(function (row, i) {
      codeRows += '<div class="' + C + 'ln ' + C + 'ln--typed' + (i === 0 ? ' is-first' : '') + '" data-l="' + i + '">' +
        '<span class="' + C + 'lnum">' + (i + 3) + '</span>' +
        '<span class="' + C + 'src">' + new Array(row[0] + 1).join(' ') + typedLine(row[1]) + '<b class="' + C + 'caret ' + C + 'caret--code"></b></span></div>';
    });

    var dist = [6, 14, 30, 58, 92, 74, 51, 38, 27, 20, 15, 11, 8, 6, 4, 3];
    var bars = dist.map(function (h, i) {
      return '<span class="' + C + 'bar' + (i === 3 ? ' is-you' : '') + '" style="--h:' + h + '%"></span>';
    }).join('');

    return '' +
      '<section class="' + C + 'ws">' +
        '<header class="' + C + 'strip">' +
          '<span class="' + C + 'iconbtn">' + ic(I.back) + '</span>' +
          '<span class="' + C + 'crumb">PrepCoding <i>/</i> Arrays &amp; Hashing <i>/</i> <b>Pair Sum to Target</b></span>' +
          '<span class="' + C + 'navbtns"><span class="' + C + 'iconbtn">' + ic(I.left) + '</span><span class="' + C + 'iconbtn">' + ic(I.list) + '</span><span class="' + C + 'iconbtn">' + ic(I.right) + '</span></span>' +
          '<span class="' + C + 'stripright">' +
            '<span class="' + C + 'timer">' + ic(I.clock) + '<span class="' + C + 'tval">00:06:41</span></span>' +
            '<span class="' + C + 'anvi">' + ic(I.bulb) + 'Ask Anvi</span>' +
          '</span>' +
        '</header>' +

        /* ---- left: statement ---- */
        '<div class="' + C + 'card ' + C + 'left">' +
          '<div class="' + C + 'tabs"><span class="' + C + 'tab ' + C + 'tab--desc">Description</span><span class="' + C + 'tab">Editorial</span><span class="' + C + 'tab ' + C + 'tab--subs">Submissions</span><i class="' + C + 'tabline"></i></div>' +
          '<div class="' + C + 'stmt">' +
            '<div class="dm-h4 ' + C + 'ptitle">1. Pair Sum to Target</div>' +
            '<div class="' + C + 'pmeta"><span class="' + C + 'diff ' + C + 'diff--easy">Easy</span><span class="' + C + 'tag">Array</span><span class="' + C + 'tag">Hash Table</span><span class="' + C + 'pacc">Acceptance 52.4%</span></div>' +
            '<p class="' + C + 'para">Given an integer array <code>nums</code> and a value <code>target</code>, find the two positions whose values add up to <code>target</code> and return their indices. Exactly one such pair exists, and a position can’t be paired with itself.</p>' +
            '<p class="' + C + 'exh">Example 1</p>' +
            '<div class="' + C + 'ex"><p><b>Input:</b> nums = [2,7,11,15], target = 9</p><p><b>Output:</b> [0,1]</p><p class="' + C + 'exnote"><b>Explanation:</b> nums[0] + nums[1] = 9, so return [0, 1].</p></div>' +
            '<p class="' + C + 'exh">Example 2</p>' +
            '<div class="' + C + 'ex"><p><b>Input:</b> nums = [3,2,4], target = 6</p><p><b>Output:</b> [1,2]</p></div>' +
            '<p class="' + C + 'exh">Constraints</p>' +
            '<ul class="' + C + 'cons"><li><code>2 ≤ nums.length ≤ 10⁴</code></li><li><code>−10⁹ ≤ nums[i], target ≤ 10⁹</code></li><li>Exactly one valid answer exists.</li></ul>' +
            '<div class="' + C + 'anvihint">' + ic(I.bulb) + '<p><b>Stuck?</b> Press Ask Anvi for a direction to try, not a full solution.</p></div>' +
          '</div>' +

          /* verdict (Submissions tab) */
          '<div class="' + C + 'verdict">' +
            '<div class="' + C + 'vtop">' +
              '<span class="' + C + 'medal">' + ic(I.check) + '</span>' +
              '<div><p class="' + C + 'vlabel">Accepted</p><p class="' + C + 'vsub"><b class="' + C + 'vpass">63</b> / 63 testcases passed</p><p class="' + C + 'vmeta">Submitted just now · Python 3</p></div>' +
            '</div>' +
            '<div class="' + C + 'metrics">' +
              '<div class="' + C + 'metric">' + ic(I.bolt) + '<span>Runtime</span><p><b class="' + C + 'rt">48</b> ms</p><em>Beats 91.2%</em></div>' +
              '<div class="' + C + 'metric">' + ic(I.chip) + '<span>Memory</span><p><b>17.6</b> MB</p><em>Beats 64.0%</em></div>' +
            '</div>' +
            '<div class="' + C + 'distcard">' +
              '<div class="' + C + 'disthead"><span>Runtime distribution</span><span class="' + C + 'youtag">You · 48 ms</span></div>' +
              '<div class="' + C + 'bars">' + bars + '</div>' +
              '<div class="' + C + 'axis"><span>20 ms</span><span>60 ms</span><span>100 ms</span><span>140 ms</span></div>' +
            '</div>' +
            '<div class="' + C + 'next"><span>Up next</span><b>52. Pair Sum in a Sorted Array</b>' + ic(I.arrow) + '</div>' +
          '</div>' +
        '</div>' +

        /* ---- right: editor ---- */
        '<div class="' + C + 'card ' + C + 'editor">' +
          '<div class="' + C + 'edhead">' +
            '<span class="' + C + 'lang">Python 3' + ic(I.chev) + '</span>' +
            '<span class="' + C + 'saved">' + ic(I.check) + 'Saved</span>' +
            '<span class="' + C + 'btn ' + C + 'btn--run"><span class="' + C + 'blabel ' + C + 'blabel--idle">' + ic(I.play) + 'Run</span><span class="' + C + 'blabel ' + C + 'blabel--busy"><i class="' + C + 'spin"></i>Running…</span></span>' +
            '<span class="' + C + 'btn ' + C + 'btn--submit"><span class="' + C + 'blabel ' + C + 'blabel--idle">' + ic(I.upload) + 'Submit</span><span class="' + C + 'blabel ' + C + 'blabel--busy"><i class="' + C + 'spin"></i>Submitting…</span></span>' +
          '</div>' +
          '<div class="' + C + 'code">' +
            '<i class="' + C + 'curline"></i>' +
            codeRows +
            '<div class="' + C + 'suggest"><p class="is-on"><span class="' + C + 'tk--b">enumerate</span><em>built-in</em></p><p><span>enum</span><em>module</em></p></div>' +
          '</div>' +
        '</div>' +

        /* ---- bottom: tests ---- */
        '<div class="' + C + 'card ' + C + 'tests">' +
          '<div class="' + C + 'ttabs"><span class="' + C + 'ttab ' + C + 'ttab--case">' + ic(I.checkCircle) + 'Testcase</span><span class="' + C + 'ttab ' + C + 'ttab--res">' + ic(I.list) + 'Test Result</span><i class="' + C + 'ttabline"></i>' +
            '<span class="' + C + 'tsum"><b>3/3</b> passed · 36 ms</span></div>' +
          '<div class="' + C + 'tbody">' +
            '<div class="' + C + 'tlayer ' + C + 'tlayer--case">' +
              '<div class="' + C + 'cases"><span class="' + C + 'case is-on">Case 1</span><span class="' + C + 'case">Case 2</span><span class="' + C + 'case">Case 3</span><span class="' + C + 'case ' + C + 'case--add">+</span></div>' +
              '<div class="' + C + 'fields"><div><span>nums =</span><p>[2,7,11,15]</p></div><div><span>target =</span><p>9</p></div></div>' +
            '</div>' +
            '<div class="' + C + 'tlayer ' + C + 'tlayer--run">' +
              '<div class="' + C + 'runbar"><i></i></div><p class="' + C + 'runmsg">Running sample tests…</p>' +
            '</div>' +
            '<div class="' + C + 'tlayer ' + C + 'tlayer--res">' +
              '<p class="' + C + 'okline">' + ic(I.checkCircle) + 'All test cases passed.</p>' +
              '<div class="' + C + 'cases">' +
                '<span class="' + C + 'case ' + C + 'case--res is-on"><i>' + ic(I.check) + '</i>Case 1</span>' +
                '<span class="' + C + 'case ' + C + 'case--res"><i>' + ic(I.check) + '</i>Case 2</span>' +
                '<span class="' + C + 'case ' + C + 'case--res"><i>' + ic(I.check) + '</i>Case 3</span>' +
              '</div>' +
              '<div class="' + C + 'fields ' + C + 'fields--3"><div><span>Input</span><p>[2,7,11,15], 9</p></div><div><span>Output</span><p>[0,1]</p></div><div><span>Expected</span><p>[0,1]</p></div></div>' +
            '</div>' +
            '<div class="' + C + 'tlayer ' + C + 'tlayer--sub">' +
              '<div class="' + C + 'evalhead"><span class="' + C + 'evaltxt"><span class="' + C + 'ev-a">Evaluating against full test suite</span><span class="' + C + 'ev-b">All test cases passed</span></span><span class="' + C + 'evalcount"><b class="' + C + 'evaln">0</b> / 63</span></div>' +
              '<div class="' + C + 'evalbar"><i></i></div>' +
              '<div class="' + C + 'dots">' + new Array(64).join('<i></i>') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  PP.demos.register('coding', {
    title: 'PrepCoding',
    route: '/problems',
    nav: 'coding',
    caption: 'Search the library, open a problem, write code, run samples, submit.',
    description: 'Animated recreation of the PrepCoding screen with fictional data. A student searches the problem library for "pair sum", filtering by topic, company and difficulty, and opens the Easy problem Pair Sum to Target. In the coding workspace the problem statement, examples and constraints sit on the left and a Python editor on the right. The student types a hash-map solution, clicks Run and all 3 sample test cases pass, then clicks Submit. The full test suite is evaluated and the verdict Accepted appears with 63 of 63 test cases passed, a runtime of 48 milliseconds, memory used, and a runtime distribution chart.',
    duration: 13850,
    create: function (root) {
      root.innerHTML =
        '<div class="' + C + 'app" aria-hidden="true">' +
          buildLibrary() + buildWorkspace() +
          '<div class="dm-cursor"><span class="dm-cursor__ripple"></span>' +
            '<svg class="dm-cursor__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 2.8 19.6 12.4l-6.9 1.5 4.1 7.3-3 1.6-4-7.3-5.2 4.7z"/></svg>' +
          '</div>' +
        '</div>';

      var q = function (s) { return root.querySelector(s); };
      var qa = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
      var tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });

      var cur = q('.dm-cursor'), arrow = q('.dm-cursor__arrow'), rip = q('.dm-cursor__ripple');
      var lib = q('.' + C + 'lib'), ws = q('.' + C + 'ws');

      /* initial transforms (CSS owns opacity/visibility) */
      gsap.set(cur, { x: 930, y: 610 });
      gsap.set(ws, { x: 16 });
      gsap.set(q('.' + C + 'verdict'), { y: 16 });
      gsap.set(q('.' + C + 'medal'), { scale: 0.7 });
      gsap.set(qa('.' + C + 'bar'), { scaleY: 0, transformOrigin: '50% 100%' });
      gsap.set(q('.' + C + 'evalbar i'), { scaleX: 0, transformOrigin: '0 50%' });
      gsap.set(q('.' + C + 'runbar i'), { xPercent: -100 });
      gsap.set(q('.' + C + 'suggest'), { y: -4 });
      gsap.set(q('.' + C + 'youtag'), { y: 6 });

      function move(x, y, at, d) {
        d = d || 0.7;
        tl.to(cur, { x: x, duration: d, ease: 'power2.inOut' }, at)
          .to(cur, { y: y, duration: d, ease: 'power3.inOut' }, at);
      }
      function click(at, target) {
        tl.to(arrow, { scale: 0.78, duration: 0.09, ease: 'power2.out' }, at)
          .to(arrow, { scale: 1, duration: 0.22, ease: 'back.out(3)' }, at + 0.09)
          .set(rip, { scale: 0.2, opacity: 0.9 }, at)
          .to(rip, { scale: 1.7, opacity: 0, duration: 0.55, ease: 'power2.out' }, at);
        if (target) tl.to(target, { scale: 0.95, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.inOut' }, at);
      }
      function typeText(el, text, at, speed) {
        // One hidden <i> per character, revealed by sets: seek- and
        // restart-safe (an innerText tween reverted to "0" on restart).
        el.innerHTML = text.split('').map(function (c) { return '<i>' + PP.esc(c) + '</i>'; }).join('');
        Array.prototype.forEach.call(el.children, function (ch, i) {
          tl.set(ch, { display: 'inline' }, at + (i + 1) * speed);
        });
        return at + text.length * speed;
      }

      /* ============ 1 · Library (0 – 3.1s) ============ */
      tl.to({}, { duration: 0.3 }, 0);
      move(196, 109, 0.25, 0.75);
      click(1.0);
      tl.to(q('.' + C + 'search'), { '--focus': 1, duration: 0.25 }, 1.02)
        .set(q('.' + C + 'ph'), { display: 'none' }, 1.12)
        .set(q('.' + C + 'caret--search'), { display: 'inline-block' }, 1.02);
      var tEnd = typeText(q('.' + C + 'q'), 'pair sum', 1.15, 0.075);

      // filter rows down to the matches
      var misses = qa('.' + C + 'row.is-miss');
      tl.to(misses, { opacity: 0, x: -14, duration: 0.25, stagger: 0.025, ease: 'power1.in' }, tEnd + 0.05)
        .to(misses, { height: 0, borderBottomWidth: 0, duration: 0.38, stagger: 0.025, ease: 'power3.inOut' }, tEnd + 0.18)
        .to(qa('.' + C + 'mark'), { '--hl': 1, duration: 0.3 }, tEnd + 0.4)
        .to(q('.' + C + 'shown--all'), { autoAlpha: 0, duration: 0.2 }, tEnd + 0.2)
        .to(q('.' + C + 'pager'), { autoAlpha: 0, duration: 0.2 }, tEnd + 0.2)
        .to(q('.' + C + 'shown--hit'), { autoAlpha: 1, duration: 0.25 }, tEnd + 0.35);

      // hover + open the first match
      move(160, 207, 2.15, 0.6);
      var firstRow = q('.' + C + 'row');
      tl.to(firstRow, { '--hover': 1, duration: 0.2 }, 2.6);
      click(2.85);

      /* ============ 2 · Workspace in (3.0 – 3.6s) ============ */
      tl.to(lib, { autoAlpha: 0, x: -16, duration: 0.35, ease: 'power2.in' }, 3.0)
        .to(ws, { autoAlpha: 1, x: 0, scale: 1, duration: 0.55, ease: 'power3.out' }, 3.2);

      /* ============ 3 · Typing (3.8 – ~6.9s) ============ */
      move(612, 167, 3.55, 0.55);
      click(4.12);
      var codeEl = q('.' + C + 'code');
      var curline = q('.' + C + 'curline');
      gsap.set(curline, { y: 40 });
      tl.to(curline, { autoAlpha: 1, duration: 0.2 }, 4.15);
      // move the pointer out of the way while typing
      move(842, 300, 4.3, 0.6);

      var rand = rng(7);
      var t = 4.3;
      var lines = qa('.' + C + 'ln--typed');
      var sugg = q('.' + C + 'suggest');
      lines.forEach(function (ln, li) {
        var caret = ln.querySelector('.' + C + 'caret');
        if (li > 0) {
          t += 0.07; // Enter (auto-indent)
          tl.set(ln, { display: 'flex' }, t);
          tl.set(lines[li - 1].querySelector('.' + C + 'caret'), { display: 'none' }, t);
        }
        tl.set(curline, { y: 40 + li * 20 }, t);
        tl.set(caret, { display: 'inline-block' }, t);
        var chars = Array.prototype.slice.call(ln.querySelectorAll('i'));
        chars.forEach(function (ch, ci) {
          t += 0.01 + rand() * 0.016 + (ch.textContent === ' ' ? 0.008 : 0);
          tl.set(ch, { display: 'inline' }, t);
          if (li === 1 && ci === 14) tl.to(sugg, { autoAlpha: 1, y: 0, duration: 0.12 }, t);
          if (li === 1 && ci === 20) tl.to(sugg, { autoAlpha: 0, duration: 0.1 }, t);
        });
      });
      var typedEnd = t; // ≈ 6.8s

      /* ============ 4 · Run (≈7.0 – 8.7s) ============ */
      var runBtn = q('.' + C + 'btn--run');
      var tRun = typedEnd + 0.55;
      move(941, 84, typedEnd + 0.05, 0.5);
      click(tRun, runBtn);
      tl.to(runBtn.querySelector('.' + C + 'blabel--idle'), { autoAlpha: 0, duration: 0.12 }, tRun + 0.05)
        .to(runBtn.querySelector('.' + C + 'blabel--busy'), { autoAlpha: 1, duration: 0.12 }, tRun + 0.08)
        .to(q('.' + C + 'ttabline'), { x: 104, width: 112, duration: 0.3, ease: 'power3.inOut' }, tRun + 0.05)
        .to(q('.' + C + 'ttab--res'), { '--on': 1, duration: 0.2 }, tRun + 0.05)
        .to(q('.' + C + 'ttab--case'), { '--on': 0, duration: 0.2 }, tRun + 0.05)
        .to(q('.' + C + 'tlayer--case'), { autoAlpha: 0, duration: 0.15 }, tRun + 0.05)
        .to(q('.' + C + 'tlayer--run'), { autoAlpha: 1, duration: 0.15 }, tRun + 0.1)
        .to(q('.' + C + 'runbar i'), { xPercent: 100, duration: 0.8, ease: 'power1.inOut' }, tRun + 0.1);
      var tRes = tRun + 0.9;
      tl.to(q('.' + C + 'tlayer--run'), { autoAlpha: 0, duration: 0.12 }, tRes)
        .to(q('.' + C + 'tlayer--res'), { autoAlpha: 1, duration: 0.2 }, tRes)
        .fromTo(q('.' + C + 'okline'), { y: 6 }, { y: 0, duration: 0.3, immediateRender: false }, tRes)
        .to(qa('.' + C + 'case--res'), { '--pass': 1, duration: 0.18, stagger: 0.12 }, tRes + 0.08)
        .to(q('.' + C + 'tsum'), { autoAlpha: 1, duration: 0.25 }, tRes + 0.35)
        .to(runBtn.querySelector('.' + C + 'blabel--busy'), { autoAlpha: 0, duration: 0.12 }, tRes)
        .to(runBtn.querySelector('.' + C + 'blabel--idle'), { autoAlpha: 1, duration: 0.12 }, tRes + 0.05);

      /* ============ 5 · Submit (≈8.9 – 10.4s) ============ */
      var subBtn = q('.' + C + 'btn--submit');
      move(1051, 84, tRes + 0.35, 0.4);
      var tSub = tRes + 0.85;
      click(tSub, subBtn);
      tl.to(subBtn.querySelector('.' + C + 'blabel--idle'), { autoAlpha: 0, duration: 0.12 }, tSub + 0.05)
        .to(subBtn.querySelector('.' + C + 'blabel--busy'), { autoAlpha: 1, duration: 0.12 }, tSub + 0.08)
        .to(q('.' + C + 'tlayer--res'), { autoAlpha: 0, duration: 0.15 }, tSub + 0.05)
        .to(q('.' + C + 'tsum'), { autoAlpha: 0, duration: 0.15 }, tSub + 0.05)
        .to(q('.' + C + 'tlayer--sub'), { autoAlpha: 1, duration: 0.2 }, tSub + 0.1)
        .to(q('.' + C + 'evalbar i'), { scaleX: 1, duration: 1.25, ease: 'power1.inOut' }, tSub + 0.15)
        .fromTo(q('.' + C + 'evaln'), { innerText: 0 }, { innerText: 63, snap: { innerText: 1 }, duration: 1.25, ease: 'power1.inOut', immediateRender: false }, tSub + 0.15)
        .to(qa('.' + C + 'dots i'), { '--ok': 1, duration: 0.05, stagger: 1.2 / 63 }, tSub + 0.15);
      move(760, 420, tSub + 0.3, 0.9);

      /* ============ 6 · Verdict (≈10.5s →) ============ */
      var tV = tSub + 1.45;
      tl.to(subBtn.querySelector('.' + C + 'blabel--busy'), { autoAlpha: 0, duration: 0.12 }, tV)
        .to(subBtn.querySelector('.' + C + 'blabel--idle'), { autoAlpha: 1, duration: 0.12 }, tV + 0.05)
        .to(q('.' + C + 'tabline'), { x: 190, duration: 0.35, ease: 'power3.inOut' }, tV)
        .to(q('.' + C + 'tab--subs'), { '--on': 1, duration: 0.2 }, tV)
        .to(q('.' + C + 'tab--desc'), { '--on': 0, duration: 0.2 }, tV)
        .to(q('.' + C + 'stmt'), { autoAlpha: 0, y: -10, duration: 0.25 }, tV)
        .to(q('.' + C + 'verdict'), { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, tV + 0.12)
        .to(q('.' + C + 'medal'), { scale: 1, duration: 0.45, ease: 'power3.out' }, tV + 0.2)
        .fromTo(q('.' + C + 'rt'), { innerText: 120 }, { innerText: 48, snap: { innerText: 1 }, duration: 0.8, ease: 'power3.out', immediateRender: false }, tV + 0.35)
        .to(qa('.' + C + 'metric'), { '--in': 1, duration: 0.4, stagger: 0.1 }, tV + 0.3)
        .to(qa('.' + C + 'bar'), { scaleY: 1, duration: 0.55, stagger: 0.03, ease: 'power3.out' }, tV + 0.45)
        .to(q('.' + C + 'youtag'), { autoAlpha: 1, y: 0, duration: 0.3 }, tV + 0.9)
        .to(q('.' + C + 'tlayer--sub'), { '--done': 1, duration: 0.3 }, tV);

      // hold the payoff
      tl.to({}, { duration: 1.8 });
      return tl;
    }
  });
})();
