/* ============================================================
   PIXEL RUN — sprite bitmaps
   ------------------------------------------------------------
   Every sprite is a grid of characters. '.' is transparent; any
   other character is looked up in the sprite's palette. A 1-cell
   outline in the palette's '#' colour is added automatically
   around the silhouette (8-neighbour), so the grids below contain
   only the fill. Interior dark details (pupils, mouths, nostrils)
   use '#' directly.

   Cell size on the canvas is SCALE px. Final sprite size is
   (cols + 2) * SCALE by (rows + 2) * SCALE.
   ============================================================ */
(function () {
  'use strict';

  var SCALE = 2;

  /* ---------- dino (T-rex), 22 x 22 ---------- */
  // Big head with an open, toothy jaw, a stout upright body, tiny
  // forearms and thick legs, so it reads as a T-rex rather than a lizard.
  var DINO_PALETTE = {
    d: '#5A8B3A', // sage body
    g: '#46722C', // darker back spots
    l: '#A4C964', // lime belly
    e: '#DBDB30', // eye
    w: '#FFFFFF', // tooth
    '#': '#0F1F0F',
  };

  // rows 0..15: head, neck, body, tail; rows 16..21: legs
  var DINO_BODY = [
    '.........ddddddddddd..',
    '........dddddddddddddd',
    '........dddddeeddddddd',
    '........ddddde#ddddddd',
    '........dddddddddddddd',
    '.......ddddddd#w#w#w#w',
    '.......dddddddddddd...',
    '......dddddddddd......',
    '....dddgddddddlll.....',
    '..dddddddgddddllll....',
    '.dddgdddddddlllldd....',
    'ddddddddddddlllld.....',
    'dddddddddddllllll.....',
    '.ddddddddddllllll.....',
    '..dddddddddlllll......',
    '....dddddddddddd......',
  ];
  var DINO_LEGS = {
    stand: [
      '.....dddd..dddd.......',
      '.....dddd..dddd.......',
      '.....dddd..dddd.......',
      '.....dddd..dddd.......',
      '.....ddddd.ddddd......',
      '.....ddddd.ddddd......',
    ],
    runA: [
      '.....dddd..dddd.......',
      '.....dddd..dddd.......',
      '.....dddd...dddd......',
      '.....dddd...dddd......',
      '.....ddddd............',
      '.....ddddd............',
    ],
    runB: [
      '.....dddd..dddd.......',
      '.....dddd..dddd.......',
      '....dddd...dddd.......',
      '....dddd...dddd.......',
      '...........ddddd......',
      '...........ddddd......',
    ],
  };

  function dinoFrame(legs) {
    return DINO_BODY.concat(legs);
  }

  /* ---------- dino ducking, 30 x 12 ---------- */
  var DINO_DUCK_BODY = [
    '..................dddddddddddd',
    '..................dddeeddddddd',
    '..................ddde#ddddddd',
    '..................dddddddddddd',
    '...ddddddddddddddddd#w#w#w#w#w',
    '.dddddddddddddddddddd.........',
    'ddddddddddddlllllllll.........',
    '.ddddddddddlllllllllll........',
    '..dddddddddllllllllll.........',
    '....dddddddddddddd............',
  ];
  var DINO_DUCK_LEGS = {
    a: [
      '.......ddd....ddd.............',
      '......ddddd...................',
    ],
    b: [
      '.......ddd....ddd.............',
      '..............ddddd...........',
    ],
  };

  /* ---------- cat (orange tabby), 22 x 22 ---------- */
  var CAT_PALETTE = {
    o: '#F4A261', // orange
    s: '#E76F51', // stripe
    l: '#FFEACC', // cream
    p: '#FFB3C1', // ear inner
    n: '#FF477E', // nose
    e: '#06A77D', // eye
    '#': '#3A1F0F',
  };

  var CAT_BODY = [
    '.............o....o...',
    '............opo..opo..',
    '............ooooooooo.',
    '............oooooeeoo.',
    '.o..........oooooe#oo.',
    '.oo.........ooollllln.',
    '..so........oooll#ll..',
    '..oo.........oolllll..',
    '...ooosoosoosoolll....',
    '....oosoosoosoolll....',
    '....oosoosoosoolll....',
    '....ooooooooooolll....',
    '....ooooolllllllll....',
    '....ooollllllllll.....',
    '.....oolllllllll......',
    '......ollllllll.......',
  ];
  var CAT_LEGS = {
    stand: [
      '......oo.....oo.......',
      '......oo.....oo.......',
      '......oo.....oo.......',
      '......oo.....oo.......',
      '.....llll...llll......',
      '.....llll...llll......',
    ],
    runA: [
      '......oo.....oo.......',
      '......oo.....oo.......',
      '......oo.....llll.....',
      '......oo.....llll.....',
      '.....llll.............',
      '.....llll.............',
    ],
    runB: [
      '......oo.....oo.......',
      '......oo.....oo.......',
      '.....llll....oo.......',
      '.....llll....oo.......',
      '............llll......',
      '............llll......',
    ],
  };

  /* ---------- cat ducking, 30 x 12 ---------- */
  var CAT_DUCK_BODY = [
    '.....................oo..oo...',
    '....................oooooooooo',
    '....................ooooeeoooo',
    '....ooosooosooosooooooooe#oooo',
    '...' + 'oooo' + 's' + 'ooo' + 's' + 'ooo' + 's' + 'oooooooo' + 'lllll' + 'n',
    '.oooooooooooooooooooooooll#ll.',
    'oooooooooooooooollllllllllll..',
    '.ooooooooollllllllllllll......',
    '...ooooolllllllllllll.........',
    '.....oolllllllllllll..........',
  ];
  var CAT_DUCK_LEGS = {
    a: [
      '.......oo.......oo............',
      '......llll....................',
    ],
    b: [
      '.......oo.......oo............',
      '...............llll...........',
    ],
  };

  /* ---------- cactus ---------- */
  var CACTUS_PALETTE = {
    c: '#52B788',
    h: '#95D5B2',
    b: '#FF477E',
    k: '#FFB3C1',
    '#': '#1B4332',
  };
  var CACTUS_SMALL = [
    '..bk..',
    '..cc..',
    '..ch..',
    'c.ch..',
    'c.ch.c',
    'cccc.c',
    '..chcc',
    '..ch..',
    '..ch..',
    '..ch..',
    '..ch..',
    '..ch..',
    '..ch..',
    '..cc..',
    '..cc..',
  ];
  var CACTUS_SMALL_PLAIN = ['..cc..'].concat(CACTUS_SMALL.slice(1));
  var CACTUS_BIG = [
    '....bk.....',
    '....ccc....',
    '....chc....',
    '....chc....',
    '....chc....',
    '....chc....',
    'cc..chc....',
    'ch..chc....',
    'ch..chc..cc',
    'ch..chc..ch',
    'ccccchc..ch',
    '....chc..ch',
    '....chc..ch',
    '....chccccc',
    '....chc....',
    '....chc....',
    '....chc....',
    '....chc....',
    '....chc....',
    '....chc....',
    '....chc....',
    '....chc....',
    '....ccc....',
  ];

  /* ---------- bird, 16 x 10 ---------- */
  var BIRD_PALETTE = {
    v: '#7209B7',
    m: '#F72585',
    y: '#FFB703',
    w: '#FFFFFF',
    '#': '#2A0A44',
  };
  var BIRD_UP = [
    '......mmm.......',
    '.....mmmm.......',
    '....mmmmm...vv..',
    '...vvvmmmv.vvvv.',
    'v.vvvvvvvvvvvwv.',
    'vvvvvvvvvvvvvvyy',
    '.mvvvvvvvvvvv...',
    '..mvvvvvvvvv....',
    '....vvvvvv......',
    '................',
  ];
  var BIRD_DOWN = [
    '................',
    '............vv..',
    '...vvvvvvv.vvvv.',
    'v.vvvvvvvvvvvwv.',
    'vvvvvvvvvvvvvvyy',
    '.mvvvvvvvvvvv...',
    '..mvvmmmmvvv....',
    '....mmmmm.......',
    '.....mmmm.......',
    '......mmm.......',
  ];

  /* ---------- gift boxes, 7 x 9 ---------- */
  var GIFT = [
    '.r...r.',
    '.rr.rr.',
    '..rrr..',
    'bbbrbbb',
    'bbbrbbb',
    'rrrrrrr',
    'bbbrbbb',
    'bbbrbbb',
    'kkkrkkk',
  ];
  var BOMB_PALETTE   = { b: '#FF477E', r: '#FFD700', k: '#C9184A', '#': '#3A0A1A' };
  var SHIELD_PALETTE = { b: '#48CAE4', r: '#FFFFFF', k: '#06A0B8', '#': '#08313A' };

  /* ---------- helpers ---------- */

  // Overlay b onto a: non-transparent cells of b win.
  function merge(a, b) {
    var out = '';
    for (var i = 0; i < a.length; i++) out += b[i] !== '.' ? b[i] : a[i];
    return out;
  }

  // Add a 1-cell outline around the silhouette (8-neighbour).
  function outline(rows) {
    var h = rows.length, w = rows[0].length, out = [];
    for (var r = -1; r <= h; r++) {
      var line = '';
      for (var c = -1; c <= w; c++) {
        var inside = r >= 0 && r < h && c >= 0 && c < w;
        var ch = inside ? rows[r][c] : '.';
        if (ch !== '.') { line += ch; continue; }
        var near = false;
        for (var dr = -1; dr <= 1 && !near; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < h && cc >= 0 && cc < w && rows[rr][cc] !== '.') { near = true; break; }
          }
        }
        line += near ? '#' : '.';
      }
      out.push(line);
    }
    return out;
  }

  var SETS = {
    dino: {
      palette: DINO_PALETTE,
      flash: true,
      frames: {
        stand: dinoFrame(DINO_LEGS.stand),
        runA:  dinoFrame(DINO_LEGS.runA),
        runB:  dinoFrame(DINO_LEGS.runB),
        duckA: DINO_DUCK_BODY.concat(DINO_DUCK_LEGS.a),
        duckB: DINO_DUCK_BODY.concat(DINO_DUCK_LEGS.b),
      },
    },
    cat: {
      palette: CAT_PALETTE,
      flash: true,
      frames: {
        stand: CAT_BODY.concat(CAT_LEGS.stand),
        runA:  CAT_BODY.concat(CAT_LEGS.runA),
        runB:  CAT_BODY.concat(CAT_LEGS.runB),
        duckA: CAT_DUCK_BODY.concat(CAT_DUCK_LEGS.a),
        duckB: CAT_DUCK_BODY.concat(CAT_DUCK_LEGS.b),
      },
    },
    cactus: {
      palette: CACTUS_PALETTE,
      frames: { small: CACTUS_SMALL, smallPlain: CACTUS_SMALL_PLAIN, big: CACTUS_BIG },
    },
    bird: {
      palette: BIRD_PALETTE,
      frames: { up: BIRD_UP, down: BIRD_DOWN },
    },
    bomb:   { palette: BOMB_PALETTE,   frames: { box: GIFT } },
    shield: { palette: SHIELD_PALETTE, frames: { box: GIFT } },
  };

  var api = { SCALE: SCALE, SETS: SETS, outline: outline };
  if (typeof window !== 'undefined') window.PixelRunSprites = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
