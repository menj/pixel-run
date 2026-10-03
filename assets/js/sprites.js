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

  /* ---------- dino, 22 x 22 ---------- */
  // Deep boxy head with a short snout and brow ridge, an upright body,
  // tiny forearms and thick legs, so it reads as a dino rather than a
  // lizard or crocodile.
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
    '..........dddddddddd..',
    '.........dddddddddddd.',
    '.........dddd####ddddd',
    '.........dddddeedddddd',
    '.........ddddde#dddddd',
    '.........ddddddddddd#d',
    '.........ddddddd#w#w#d',
    '.........dddddddddddd.',
    '........ddddddddddd...',
    '.......dddddddddd.....',
    '....dddddddddlllll....',
    '..dddgdddddddllllldd..',
    'dddddddddddddllllld...',
    '.dddddddddddllllll....',
    '...ddddddddddlllll....',
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
    '..................dddd####dddd',
    'ddd......dddddddd.dddddeeddddd',
    '.ddd...dddddddddddddddde#dddd#',
    '..dddddddddddddddddddddddddddd',
    '...dddddddddddddddddddddd#w#w#',
    '...ddddddddllllllldddddddddddd',
    '...ddddddddlllllllllldd.......',
    '......dddddlllllllll..d.......',
    '.......dddddddddddd...........',
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

  /* ---------- penguin ---------- */
  var PENGUIN_PALETTE = {
    k: '#2B2D42',
    w: '#FFFFFF',
    o: '#F4A261',
    '#': '#0F1020',
  };
  var PENGUIN_STAND = [
    '.......kkkkkkk........',
    '.....kkkkkkkkkkk......',
    '....kkkkkkkkkkkkk.....',
    '....kkkkkkkkwwkkk.....',
    '....kkkkkkkkw#kkoooo..',
    '....kkkkkkkkkkkkooo...',
    '.....kkkkkkkkkkkk.....',
    '....kkkkwwwwwwkkkk....',
    '...kkkkwwwwwwwwkkkk...',
    '..kkkkkwwwwwwwwwkkk...',
    '.kkkkkkwwwwwwwwwwkkk..',
    '.kkkkkkwwwwwwwwwwkk...',
    '.kkkkkkwwwwwwwwwwk....',
    '..kkkkkwwwwwwwwwk.....',
    '...kkkkkwwwwwwwkk.....',
    '....kkkkkwwwwkkkk.....',
    '.....kkkkkkkkkk.......',
    '.....kkkkkkkkkk.......',
    '.......oo..oo.........',
    '.......oo..oo.........',
    '......ooo..ooo........',
    '......oooo.oooo.......',
  ];
  var PENGUIN_RUNA = [
    '.......kkkkkkk........',
    '.....kkkkkkkkkkk......',
    '....kkkkkkkkkkkkk.....',
    '....kkkkkkkkwwkkk.....',
    '....kkkkkkkkw#kkoooo..',
    '....kkkkkkkkkkkkooo...',
    '.....kkkkkkkkkkkk.....',
    '....kkkkwwwwwwkkkk....',
    '...kkkkwwwwwwwwkkkk...',
    '..kkkkkwwwwwwwwwkkk...',
    '.kkkkkkwwwwwwwwwwkkk..',
    '.kkkkkkwwwwwwwwwwkk...',
    '.kkkkkkwwwwwwwwwwk....',
    '..kkkkkwwwwwwwwwk.....',
    '...kkkkkwwwwwwwkk.....',
    '....kkkkkwwwwkkkk.....',
    '.....kkkkkkkkkk.......',
    '.....kkkkkkkkkk.......',
    '.......oo..oo.........',
    '.......oo...oo........',
    '......ooo...ooo.......',
    '......oooo..oooo......',
  ];
  var PENGUIN_RUNB = [
    '.......kkkkkkk........',
    '.....kkkkkkkkkkk......',
    '....kkkkkkkkkkkkk.....',
    '....kkkkkkkkwwkkk.....',
    '....kkkkkkkkw#kkoooo..',
    '....kkkkkkkkkkkkooo...',
    '.....kkkkkkkkkkkk.....',
    '....kkkkwwwwwwkkkk....',
    '...kkkkwwwwwwwwkkkk...',
    '..kkkkkwwwwwwwwwkkk...',
    '.kkkkkkwwwwwwwwwwkkk..',
    '.kkkkkkwwwwwwwwwwkk...',
    '.kkkkkkwwwwwwwwwwk....',
    '..kkkkkwwwwwwwwwk.....',
    '...kkkkkwwwwwwwkk.....',
    '....kkkkkwwwwkkkk.....',
    '.....kkkkkkkkkk.......',
    '.....kkkkkkkkkk.......',
    '.......oo..oo.........',
    '......oo...oo.........',
    '.....ooo...ooo........',
    '.....oooo..oooo.......',
  ];
  var PENGUIN_DUCKA = [
    '.................kkkkkkk......',
    '................kkkkkkkkkkk...',
    '................kkkkkkwwkkk...',
    '................kkkkkkw#kkoooo',
    '...kkkkkkkkkkkkkkkkkkkkkkkkooo',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkk...',
    '.kkkkkkwwwwwwwwwwwwwwwwkkkk...',
    '..kkkkkwwwwwwwwwwwwwwwkkk.....',
    '....kkkkkkkkkkkkkkkkkkk.......',
    '......kkkkkkkkkkkkk...........',
    '..........oo.....oo...........',
    '.........ooo....ooo...........',
  ];
  var PENGUIN_DUCKB = [
    '.................kkkkkkk......',
    '................kkkkkkkkkkk...',
    '................kkkkkkwwkkk...',
    '................kkkkkkw#kkoooo',
    '...kkkkkkkkkkkkkkkkkkkkkkkkooo',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkk...',
    '.kkkkkkwwwwwwwwwwwwwwwwkkkk...',
    '..kkkkkwwwwwwwwwwwwwwwkkk.....',
    '....kkkkkkkkkkkkkkkkkkk.......',
    '......kkkkkkkkkkkkk...........',
    '..........oo......oo..........',
    '.........ooo.....ooo..........',
  ];

  /* ---------- robot ---------- */
  var ROBOT_PALETTE = {
    m: '#8D99AE',
    h: '#CAD2DC',
    a: '#5C677D',
    b: '#2B86C5',
    y: '#FFD700',
    r: '#FF477E',
    '#': '#1B1F3B',
  };
  var ROBOT_STAND = [
    '...........y..........',
    '...........m..........',
    '.......mmmmmmmmmmm....',
    '......mhhhhhhhhhhm....',
    '......m#####rr###m....',
    '......m##########m....',
    '......mmmbmbmbmbmm....',
    '..........mm..........',
    '....mmmmmmmmmmmmmm....',
    '..aamhhhhhhhhhhhhmaa..',
    '..aamhhhhbbbbhhhhmaa..',
    '..aamhhhhbyybhhhhmaa..',
    '..aamhhhhbbbbhhhhmaa..',
    '..aamhhhhhhhhhhhhmaa..',
    '....mmmmmmmmmmmmmm....',
    '.....mmmmmmmmmmmm.....',
    '......aaa....aaa......',
    '......aaa....aaa......',
    '......aaa....aaa......',
    '......aaa....aaa......',
    '.....aaaaa..aaaaa.....',
    '.....aaaaa..aaaaa.....',
  ];
  var ROBOT_RUNA = [
    '...........y..........',
    '...........m..........',
    '.......mmmmmmmmmmm....',
    '......mhhhhhhhhhhm....',
    '......m#####rr###m....',
    '......m##########m....',
    '......mmmbmbmbmbmm....',
    '..........mm..........',
    '....mmmmmmmmmmmmmm....',
    '..aamhhhhhhhhhhhhmaa..',
    '..aamhhhhbbbbhhhhmaa..',
    '..aamhhhhbyybhhhhmaa..',
    '..aamhhhhbbbbhhhhmaa..',
    '..aamhhhhhhhhhhhhmaa..',
    '....mmmmmmmmmmmmmm....',
    '.....mmmmmmmmmmmm.....',
    '......aaa....aaa......',
    '......aaa....aaa......',
    '......aaa.....aaa.....',
    '......aaa.....aaa.....',
    '.....aaaaa...aaaaa....',
    '.....aaaaa...aaaaa....',
  ];
  var ROBOT_RUNB = [
    '...........y..........',
    '...........m..........',
    '.......mmmmmmmmmmm....',
    '......mhhhhhhhhhhm....',
    '......m#####rr###m....',
    '......m##########m....',
    '......mmmbmbmbmbmm....',
    '..........mm..........',
    '....mmmmmmmmmmmmmm....',
    '..aamhhhhhhhhhhhhmaa..',
    '..aamhhhhbbbbhhhhmaa..',
    '..aamhhhhbyybhhhhmaa..',
    '..aamhhhhbbbbhhhhmaa..',
    '..aamhhhhhhhhhhhhmaa..',
    '....mmmmmmmmmmmmmm....',
    '.....mmmmmmmmmmmm.....',
    '......aaa....aaa......',
    '......aaa....aaa......',
    '.....aaa......aaa.....',
    '.....aaa......aaa.....',
    '....aaaaa.....aaaaa...',
    '....aaaaa.....aaaaa...',
  ];
  var ROBOT_DUCKA = [
    '.................mmmmmmmmmmmm.',
    '................mhhhhhhhhhhhhm',
    '................m#####rr#####m',
    '................m############m',
    '................mmmmmmmmmmmmmm',
    '...mmmmmmmmmmmmmmmmmmmmmmmm...',
    '...mhhhhhhhhhhhhhhhhhhhhhhm...',
    '...mhhhhhhhhbyybhhhhhhhhhhm...',
    '...mmmmmmmmmmmmmmmmmmmmmmmm...',
    '....aaaaaaaaaaaaaaaaaaaaaa....',
    '......aaaa........aaaa........',
    '.....aaaaaa......aaaaaa.......',
  ];
  var ROBOT_DUCKB = [
    '.................mmmmmmmmmmmm.',
    '................mhhhhhhhhhhhhm',
    '................m#####rr#####m',
    '................m############m',
    '................mmmmmmmmmmmmmm',
    '...mmmmmmmmmmmmmmmmmmmmmmmm...',
    '...mhhhhhhhhhhhhhhhhhhhhhhm...',
    '...mhhhhhhhhbyybhhhhhhhhhhm...',
    '...mmmmmmmmmmmmmmmmmmmmmmmm...',
    '....aaaaaaaaaaaaaaaaaaaaaa....',
    '.......aaaa......aaaa.........',
    '......aaaaaa....aaaaaa........',
  ];

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
    penguin: {
      palette: PENGUIN_PALETTE,
      flash: true,
      frames: {
        stand: PENGUIN_STAND,
        runA:  PENGUIN_RUNA,
        runB:  PENGUIN_RUNB,
        duckA: PENGUIN_DUCKA,
        duckB: PENGUIN_DUCKB,
      },
    },
    robot: {
      palette: ROBOT_PALETTE,
      flash: true,
      frames: {
        stand: ROBOT_STAND,
        runA:  ROBOT_RUNA,
        runB:  ROBOT_RUNB,
        duckA: ROBOT_DUCKA,
        duckB: ROBOT_DUCKB,
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

  /* ---------- refinement: more detail, smoother edges, light and shade ----------
     The grids above are the hand-drawn designs. Every frame is processed once
     at load so the sprites look sharper on modern screens:
       1. Scale2x (EPX) doubles the resolution and rounds off staircase edges
          without blurring or inventing colours.
       2. A light-and-shade pass lightens cells on upper edges and darkens cells
          on lower edges of the main colours (light from above), which gives
          volume. Small details such as eyes and teeth are left alone.
       3. A thin one-cell outline is added around the result.
       4. Transparent padding restores the original sprite size, so hitboxes
          and ground contact are unchanged.
     After this, one grid cell is one game unit (SCALE = 1). */

  function mixHex(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var target = f > 0 ? 255 : 0, a = Math.abs(f);
    r = Math.round(r + (target - r) * a);
    g = Math.round(g + (target - g) * a);
    b = Math.round(b + (target - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function cellAt(rows, x, y) {
    return (y < 0 || x < 0 || y >= rows.length || x >= rows[0].length) ? '.' : rows[y][x];
  }

  function scale2x(rows) {
    var h = rows.length, w = rows[0].length, out = [];
    for (var y = 0; y < h; y++) {
      var r0 = '', r1 = '';
      for (var x = 0; x < w; x++) {
        var P = rows[y][x];
        var A = cellAt(rows, x, y - 1), B = cellAt(rows, x + 1, y);
        var C = cellAt(rows, x - 1, y), D = cellAt(rows, x, y + 1);
        r0 += ((C === A && C !== D && A !== B) ? A : P) + ((A === B && A !== C && B !== D) ? B : P);
        r1 += ((D === C && D !== B && C !== A) ? C : P) + ((B === D && B !== A && D !== C) ? D : P);
      }
      out.push(r0, r1);
    }
    return out;
  }

  // Palette extended with a lighter and a darker variant of every colour.
  function shadedPalette(palette) {
    var out = {}, keys = Object.keys(palette), hi = {}, lo = {};
    keys.forEach(function (k, i) {
      out[k] = palette[k];
      if (k === '#') return;
      hi[k] = String.fromCharCode(0x100 + i * 2);
      lo[k] = String.fromCharCode(0x101 + i * 2);
      out[hi[k]] = mixHex(palette[k], 0.22);
      out[lo[k]] = mixHex(palette[k], -0.26);
    });
    return { palette: out, hi: hi, lo: lo };
  }

  function lightAndShade(rows, sp) {
    var h = rows.length, w = rows[0].length, count = {}, total = 0, y, x;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var c = rows[y][x];
      if (c !== '.' && c !== '#') { count[c] = (count[c] || 0) + 1; total++; }
    }
    var major = {};
    Object.keys(count).forEach(function (k) { if (count[k] > total * 0.06 && sp.hi[k]) major[k] = true; });
    function solid(xx, yy) { var ch = cellAt(rows, xx, yy); return ch !== '.' && ch !== '#'; }
    var out = [];
    for (y = 0; y < h; y++) {
      var line = '';
      for (x = 0; x < w; x++) {
        var ch = rows[y][x];
        if (!major[ch]) { line += ch; continue; }
        var top = !solid(x, y - 1) || (!solid(x - 1, y - 1) && !solid(x - 1, y));
        var bot = !solid(x, y + 1) || !solid(x + 1, y);
        var top2 = !solid(x, y - 2), bot2 = !solid(x, y + 2);
        if (bot || (bot2 && !top)) line += sp.lo[ch];
        else if (top || (top2 && !bot2)) line += sp.hi[ch];
        else line += ch;
      }
      out.push(line);
    }
    return out;
  }

  function refineFrame(rows, sp) {
    var framed = outline(lightAndShade(scale2x(rows), sp));       // (2h + 2) x (2w + 2)
    var side = '.', blank = new Array(framed[0].length + 3).join('.');
    var padded = framed.map(function (l) { return side + l + side; });
    return [blank, blank].concat(padded);                        // (2h + 4) x (2w + 4)
  }

  Object.keys(SETS).forEach(function (id) {
    var set = SETS[id], sp = shadedPalette(set.palette);
    Object.keys(set.frames).forEach(function (name) {
      set.frames[name] = refineFrame(set.frames[name], sp);
    });
    set.palette = sp.palette;
  });

  // The frames are final, so the loader's outline step becomes a no-op.
  var api = { SCALE: 1, SETS: SETS, outline: function (rows) { return rows; } };
  if (typeof window !== 'undefined') window.PixelRunSprites = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
