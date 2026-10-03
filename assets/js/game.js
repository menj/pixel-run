/* ============================================================
   PIXEL RUN — COLOUR EDITION
   A vivid take on the offline runner. Pick your runner.
   Backend: PHP server-side rendering + AJAX leaderboard updates.
   Requires assets/js/sprites.js to be loaded first.
   ============================================================ */
(function () {
'use strict';

/* ---------- server config ---------- */
// index.php emits <script type="application/json" id="pixel-run-config">
// with { apiBase, apiAvailable, initialScores, totalRuns, savedRank }.
// standalone.html emits { apiAvailable: false }. Missing block = offline.
function readServerConfig() {
  const el = document.getElementById('pixel-run-config');
  if (!el) return {};
  try {
    const parsed = JSON.parse(el.textContent);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) { return {}; }
}
const SERVER = readServerConfig();
// Set by the server only for a signed-in admin (see admin.php). Anyone can
// edit this script locally, which is why cheated runs are never recorded.
const IS_ADMIN = !!SERVER.isAdmin;
const API_BASE = SERVER.apiBase || './api';

// PHP already verified the database connection on page load,
// so we know up front whether the leaderboard is available.
let API_AVAILABLE = !!SERVER.apiAvailable;

// Cached top scores for the ALL tab; cleared after a submit so the
// next open refetches.
let INITIAL_SCORES = Array.isArray(SERVER.initialScores) ? SERVER.initialScores : [];
let TOTAL_RUNS    = parseInt(SERVER.totalRuns || 0, 10);

/* ---------- persisted player settings ---------- */
const MODE_KEY = 'pixel_run_mode';
const MUTE_KEY = 'pixel_run_muted';
const HI_KEY   = 'pixel_run_hi';
const DAILY_KEY = 'pixel_run_daily_';   // + UTC date
const NAME_KEY = 'pixel_run_name';

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* unavailable */ }
}

// Player-controlled mode. 'online' uses the leaderboard API,
// 'offline' is local-only with no network requests.
let gameMode = (function loadStoredMode() {
  const saved = storageGet(MODE_KEY);
  if (saved === 'online' || saved === 'offline') return saved;
  return API_AVAILABLE ? 'online' : 'offline';
})();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// Logical (design) size. The backing store is resized to the real device
// resolution (see fitCanvas) and drawing is scaled by VIEW, so the game code
// keeps working in these units.
const W = 960;
const H = 320;
let VIEW = 1;   // device pixels per logical unit

const overlay = document.getElementById('overlay');
const ovTitle = document.getElementById('ov-title');
const ovSub   = document.getElementById('ov-sub');
const ovSubmit = document.getElementById('ov-submit');
const ovAgain  = document.getElementById('ov-again');
const ovResult = document.getElementById('ov-result');
const ovMedal  = document.getElementById('ov-medal');
const ovBest   = document.getElementById('ov-best');
const ovName   = document.getElementById('ov-name');
const ovSend   = document.getElementById('ov-send');
const ovStatus = document.getElementById('ov-status');
const lbOpen   = document.getElementById('lb-open');
const lbModal  = document.getElementById('lb-modal');
const lbClose  = document.getElementById('lb-close');
const storyBtn   = document.getElementById('story-btn');
const storyModal = document.getElementById('story-modal');
const storyClose = document.getElementById('story-close');
const storyBody  = document.getElementById('story-body');
const storyTabs  = document.querySelectorAll('.story-tab');
const lbList   = document.getElementById('lb-list');
const lbFoot   = document.getElementById('lb-foot');
const lbTabs   = document.querySelectorAll('.lb-tab');
const modeBtn  = document.getElementById('mode-btn');
const modeNote = document.getElementById('mode-note');
const soundBtn = document.getElementById('sound-btn');
const hiEl = document.getElementById('hi');
const scEl = document.getElementById('sc');

const GROUND_Y = H - 60;

/* ---------- audio (synthesised retro SFX) ---------- */
// Sounds are generated procedurally via Web Audio oscillators and noise
// buffers — no audio files needed, keeping the standalone build truly
// self-contained. Browsers require audio to start in response to a user
// gesture, so the context is created lazily on first play.

let audioCtx = null;
let muted = storageGet(MUTE_KEY) === '1';

function ensureAudio() {
  if (!audioCtx) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    } catch (_) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(opts) {
  if (muted) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const {
    freq = 440, freqEnd = null, dur = 0.1,
    type = 'square', vol = 0.06, delay = 0,
  } = opts;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), t0 + dur);
  }
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(opts) {
  if (muted) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const { dur = 0.1, vol = 0.05, filterFreq = 1000, delay = 0 } = opts;
  const t0 = ctx.currentTime + delay;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const SFX = {
  // Quick rising chiptune blip — classic platformer jump.
  jump:      () => tone({ freq: 220, freqEnd: 660, dur: 0.12, type: 'square', vol: 0.07 }),
  // Soft low thud when paws hit the ground.
  land:      () => noise({ dur: 0.05, vol: 0.05, filterFreq: 280 }),
  // Tiny downward sweep for ducking.
  duck:      () => tone({ freq: 240, freqEnd: 120, dur: 0.06, type: 'triangle', vol: 0.04 }),
  // Bomb pickup: filtered noise burst + low rumble.
  bomb:      () => {
    noise({ dur: 0.35, vol: 0.10, filterFreq: 700 });
    tone({ freq: 140, freqEnd: 30,  dur: 0.35, type: 'sawtooth', vol: 0.10 });
    tone({ freq: 440, freqEnd: 50,  dur: 0.20, type: 'square',   vol: 0.05, delay: 0.02 });
  },
  // Shield pickup: bright ascending C-E-G arpeggio.
  shield:    () => {
    tone({ freq: 523, dur: 0.09, type: 'sine', vol: 0.05 });
    tone({ freq: 659, dur: 0.09, type: 'sine', vol: 0.05, delay: 0.05 });
    tone({ freq: 784, dur: 0.18, type: 'sine', vol: 0.05, delay: 0.10 });
  },
  // Two-note ding for every 100-point milestone.
  milestone: () => {
    tone({ freq: 880,  dur: 0.07, type: 'square',   vol: 0.04 });
    tone({ freq: 1320, dur: 0.12, type: 'triangle', vol: 0.04, delay: 0.06 });
  },
  // Short filtered-noise sweep when a run starts or restarts.
  swoosh:    () => noise({ dur: 0.14, vol: 0.05, filterFreq: 1200 }),
  // Descending four-note sad-trombone for game over.
  gameover:  () => {
    tone({ freq: 523, dur: 0.14, type: 'square', vol: 0.06 });
    tone({ freq: 415, dur: 0.14, type: 'square', vol: 0.06, delay: 0.14 });
    tone({ freq: 311, dur: 0.14, type: 'square', vol: 0.06, delay: 0.28 });
    tone({ freq: 247, dur: 0.40, type: 'square', vol: 0.06, delay: 0.42 });
  },
};

function setMuted(m) {
  muted = !!m;
  storageSet(MUTE_KEY, muted ? '1' : '0');
  updateSoundButton();
}
function toggleMuted() { setMuted(!muted); }

/* ---------- environment palette (sprite palettes live in sprites.js) ---------- */
const COL = {
  groundBase: '#E8A87C',
  groundDark: '#C38D9E',
  pebble1:    '#FFD6A5',
  pebble2:    '#A0C4FF',

  cloud1:     '#FFE5EC',
  cloud2:     '#FFFFFF',

  sun:        '#FFC75F',
  sunGlow:    '#FF9A8B',
  moon:       '#E0E1FF',
};

/* ---------- world / state ---------- */
const game = {
  state: 'idle',     // idle | running | over
  character: 'dino', // 'dino' | 'cat' | 'penguin' | 'robot'
  speed: 2.5,        // gentle stroll to start
  maxSpeed: 11,      // softer ceiling
  speedGrow: 0.0002,  // very slow passive ramp
  speedStep: 0.10,    // gentler bump per obstacle cleared
  cleared: 0,         // obstacles successfully passed
  runStart: 0,        // ms timestamp when current run started
  score: 0,
  hi: 0,
  tick: 0,
  spawnCD: 60,
  giftCD: 360,        // first gift after ~6s
  shieldT: 0,         // shield ticks remaining
  shieldMax: 540,     // ~9s of shield at 60fps
  bombFlash: 0,       // screen flash from bomb pickup
  flashCD: 0,         // gold milestone flash
  hitFlash: 0,        // white flash on collision
  scroll: 0,          // distance travelled, drives the parallax backdrop
  faceKind: '',       // transient reaction face: 'wide' | 'happy'
  faceT: 0,           // ticks left on that face
  nearCD: 0,          // cooldown between near-miss reactions
  idleT: 0,           // ticks spent on the title screen (blinks, then dozes off)
  shake: 0,           // screen-shake ticks left after a crash
  jumpBuf: 0,         // ticks a too-early jump press stays queued
  god: false,         // admin cheat: cannot die (admin sessions only)
  cheated: false,     // this run used god mode; it is never recorded
  mode: 'normal',     // 'normal' | 'daily'
  dailyDate: '',      // UTC date (YYYY-MM-DD) of the current daily course
  dailyBest: 0,       // best score on today's course, this device
  overTimer: 0,       // pending game-over panel timeout id
  nextMilestone: 100, // next score that triggers the milestone flash
};

/* ---------- gameplay RNG (seeded for the daily challenge) ---------- */
// Only decisions that change the course (obstacle type, spacing, gifts) use
// rnd(); particles and scenery keep Math.random so they never disturb it.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
let rnd = Math.random;
function utcDate() { return new Date().toISOString().slice(0, 10); }

/* ---------- characters: names, traits and unlocks ---------- */
// Ids are stored in the database and API and never change; names are what
// players see. unlock is the best score needed (the silver and gold medal
// marks). The daily challenge turns traits off so every run is equal.
const CHARACTERS = {
  dino:    { name: 'Eeny',   blurb: 'Balanced',             unlock: 0 },
  cat:     { name: 'Meeny',  blurb: 'Jumps 10% higher',     unlock: 0,   jump: 1.1 },
  penguin: { name: 'Miny',  blurb: 'Hold jump to glide',   unlock: 300, glide: true },
  robot:   { name: 'Moe',     blurb: 'Starts with a shield', unlock: 600, startShield: 180 },
};
function trait() {
  if (game.mode === 'daily') return CHARACTERS.dino;
  return CHARACTERS[game.character] || CHARACTERS.dino;
}
function isUnlocked(id) {
  const c = CHARACTERS[id];
  return !!c && game.hi >= c.unlock;
}

/* ---------- player ---------- */
const GRAVITY = 0.7;
const JUMP_V  = -13.5;
const JUMP_CUT_V = -8;     // releasing jump early caps the climb here (variable height)
const JUMP_BUFFER = 7;     // ticks a press just before landing is remembered
const GLIDE_G = 0.28;      // gravity while gliding
const GLIDE_MAX_FALL = 3.6;
const STAND_H = 48;   // standing sprite height (sprites.js: 22 rows + outline, x2)
const DUCK_H  = 28;   // ducking sprite height (12 rows + outline, x2)

const dino = {
  jumpHeld: false,
  squash: 0,
  x: 70,
  y: GROUND_Y - STAND_H,
  w: 48,
  h: STAND_H,
  vy: 0,
  jumping: false,
  ducking: false,
  hurtFlash: 0,
  fallT: -1,       // ticks since the knock-over began (-1 = standing)
};

/* ---------- entities ---------- */
const obstacles = [];
const gifts = [];
const clouds = [];
const stars = [];
const particles = [];

/* ---------- environment: day/night cycle ---------- */
const cycleLen = 2400;        // ticks for full day
let cycleT = 600;             // start mid-morning

function dayPhase() {
  // 0..1 across full cycle
  return (cycleT % cycleLen) / cycleLen;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  const p1 = hexToRgb(c1), p2 = hexToRgb(c2);
  return `rgb(${Math.round(lerp(p1.r,p2.r,t))},${Math.round(lerp(p1.g,p2.g,t))},${Math.round(lerp(p1.b,p2.b,t))})`;
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n>>16)&255, g: (n>>8)&255, b: n&255 };
}

/* sky gradient stops by phase */
const skyStops = [
  // dawn (warm rose to peach)
  { top: '#3B1F4F', mid: '#FF6B9D', bot: '#FFD89B' },
  // morning (pinks fade to blue)
  { top: '#87CEEB', mid: '#FDCBF1', bot: '#FFE5EC' },
  // midday (clear sky)
  { top: '#4FC3F7', mid: '#81D4FA', bot: '#E1F5FE' },
  // afternoon (golden)
  { top: '#5B7CFA', mid: '#FFB088', bot: '#FFE3B0' },
  // sunset (vivid orange/magenta)
  { top: '#3D155F', mid: '#FF3CAC', bot: '#FFC75F' },
  // dusk (purple haze)
  { top: '#1A0B2E', mid: '#5B2C6F', bot: '#C1666B' },
  // night (deep blues with stars)
  { top: '#020111', mid: '#0E1A40', bot: '#3D155F' },
  // pre-dawn (cool indigo)
  { top: '#0d0221', mid: '#391965', bot: '#7B2CBF' },
];

function currentSky() {
  const p = dayPhase() * skyStops.length;
  const i = Math.floor(p) % skyStops.length;
  const j = (i + 1) % skyStops.length;
  const t = p - Math.floor(p);
  const A = skyStops[i], B = skyStops[j];
  return {
    top: lerpColor(A.top, B.top, t),
    mid: lerpColor(A.mid, B.mid, t),
    bot: lerpColor(A.bot, B.bot, t),
    isNight: i === 6 || i === 7 || i === 0,
  };
}

/* ---------- pixel art helpers ---------- */
// Fill a rectangle whose edges land on whole device pixels (no blurry seams).
function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  const x0 = Math.round(x * VIEW), y0 = Math.round(y * VIEW);
  const x1 = Math.round((x + w) * VIEW), y1 = Math.round((y + h) * VIEW);
  ctx.fillRect(x0 / VIEW, y0 / VIEW, (x1 - x0) / VIEW, (y1 - y0) / VIEW);
}

/* ---------- sprites (bitmaps from sprites.js, pre-rendered once) ---------- */
const SPRITE_DATA = window.PixelRunSprites;
const SPRITE_SCALE = SPRITE_DATA.SCALE;

// Rasterize an outlined character grid to an offscreen canvas at the current
// device scale. Cell edges are snapped to whole device pixels, so sprites stay
// razor sharp at any zoom or screen density.
function rasterize(rows, palette) {
  const cell = SPRITE_SCALE * VIEW;
  const cols = rows[0].length;
  const c = document.createElement('canvas');
  c.width = Math.round(cols * cell);
  c.height = Math.round(rows.length * cell);
  const g = c.getContext('2d');
  for (let r = 0; r < rows.length; r++) {
    const y0 = Math.round(r * cell), y1 = Math.round((r + 1) * cell);
    for (let col = 0; col < cols; col++) {
      const ch = rows[r][col];
      if (ch === '.') continue;
      g.fillStyle = palette[ch] || '#FF00FF';
      const x0 = Math.round(col * cell);
      g.fillRect(x0, y0, Math.round((col + 1) * cell) - x0, y1 - y0);
    }
  }
  return c;
}

// { normal: { set: { frame: canvas } }, flash: { ...all-white variants } }
// Flash variants are built only for sets that declare flash: true (hurt blink).
function buildSprites(data) {
  const out = { normal: {}, flash: {} };
  for (const [setName, set] of Object.entries(data.SETS)) {
    out.normal[setName] = {};
    if (set.flash) out.flash[setName] = {};
    const white = {};
    for (const k of Object.keys(set.palette)) white[k] = '#FFFFFF';
    for (const [frameName, rows] of Object.entries(set.frames)) {
      const outlined = data.outline(rows);
      out.normal[setName][frameName] = rasterize(outlined, set.palette);
      if (set.flash) out.flash[setName][frameName] = rasterize(outlined, white);
    }
  }
  return out;
}
let SPR = buildSprites(SPRITE_DATA);

/* ---------- crisp rendering: match the backing store to the screen ---------- */
// The canvas CSS size is fluid, but its pixel size used to stay 960x320 and
// the browser stretched it, which blurred or unevened every pixel. Now the
// backing store follows the real on-screen size in device pixels (capped for
// performance), and sprites are rebuilt at that scale.
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(W, Math.min(2880, Math.round(r.width * dpr)));
  const h = Math.round(w * H / W);
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  VIEW = w / W;
  SPR = buildSprites(SPRITE_DATA);
}
if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe(canvas);
window.addEventListener('resize', fitCanvas);
fitCanvas();

// Sprites are rasterised at device resolution, so draw them 1:1 on the device
// pixel grid: no resampling, no blur.
function blit(img, x, y) {
  ctx.drawImage(img, Math.round(x * VIEW) / VIEW, Math.round(y * VIEW) / VIEW, img.width / VIEW, img.height / VIEW);
}

/* ---------- reactions: faces, jokes and the knock-over ---------- */
// Characters react to what happens to them. The sprite's baked-in eye is
// covered with a patch and replaced by an expression drawn on top (see FACES
// in sprites.js), and short jokes float up from the head. Nothing here
// affects gameplay.
const FACES = SPRITE_DATA.FACES;
const quips = [];     // floating jokes
const impacts = [];   // comic impact starbursts

const QUIPS = {
  hit: {
    dino:    ['OOF!', 'RAWR?!', 'MY SNOUT!', 'BONK!', 'WORTH IT'],
    cat:     ['MEOWCH!', 'HISSS!', 'NOT THE FACE', 'FUR REAL?', 'ON PURPOSE!'],
    penguin: ['HONK!', 'NOOT NOOT', 'BRRR-ONK!', 'I SLIPPED', 'WRONG TURN!'],
    robot:   ['ERROR 404', 'BZZT!', 'OOPS.EXE', 'SYSTEM FAIL', 'REBOOTING...'],
  },
  near:      ['PHEW!', 'WHEW!', 'TOO CLOSE!', 'NOT TODAY!', 'CLOSE ONE!', 'SWEAT!'],
  nearRobot: ['RECALCULATING', 'THAT WAS 3MM', 'WHEW.EXE'],
  bomb:      ['KABOOM!', 'BOOM!', 'MIC DROP', 'NICE.', 'BYE CACTI!'],
  shield:    ['SHINY!', 'BUBBLE TIME', 'BRING IT', 'UNTOUCHABLE'],
  milestone: ['LOOK AT ME GO', 'NICE!', 'ZOOM!', 'UNSTOPPABLE'],
};
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

function quip(text, x, y, color, size) {
  quips.push({ text, x, y, vy: -0.55, life: 80, max: 80, color: color || '#FFFFFF', size: size || 10 });
}
function setFace(kind, ticks) {
  game.faceKind = kind;
  game.faceT = ticks;
}
function headPos(pose) {
  const f = FACES[game.character] || FACES.dino;
  const spec = f[pose || 'stand'];
  return { x: dino.x + spec.head[0], y: dino.y + spec.head[1] };
}

function reactHit() {
  dino.fallT = 0;
  impacts.push({ x: dino.x + 47, y: dino.y + 16, t: 0 });
  const h = headPos();
  quip(pick(QUIPS.hit[game.character] || QUIPS.hit.dino), h.x - 4, h.y - 12, '#FFFFFF', 13);
}
function reactNearMiss() {
  setFace('wide', 45);
  const list = game.character === 'robot' ? QUIPS.nearRobot : QUIPS.near;
  const h = headPos();
  quip(pick(list), h.x - 2, h.y - 12, '#7FD6FF', 11);
}

// Per-tick upkeep for faces, jokes and the knock-over; runs in every state.
function updateReactions() {
  if (game.faceT > 0) game.faceT--;
  if (game.nearCD > 0) game.nearCD--;
  if (dino.fallT >= 0 && dino.fallT < 600) dino.fallT++;
  if (game.state === 'idle') {
    game.idleT++;
    // dozing: a little Z drifts up every second or so
    if (game.idleT > 720 && game.idleT % 70 === 0) {
      const h = headPos();
      quip('Z', h.x + 4, h.y, '#BFD7FF', 9 + Math.floor(Math.random() * 4));
    }
  } else {
    game.idleT = 0;
  }
  for (let i = quips.length - 1; i >= 0; i--) {
    const q = quips[i];
    q.y += q.vy;
    q.vy *= 0.985;
    if (--q.life <= 0) quips.splice(i, 1);
  }
  for (let i = impacts.length - 1; i >= 0; i--) {
    if (++impacts[i].t > 14) impacts.splice(i, 1);
  }
}

// Which expression, if any, the character wears right now.
function currentFace() {
  if (game.state === 'over' && dino.fallT >= 0) return 'x';
  if (game.faceT > 0) return game.faceKind;
  if (game.state === 'idle') {
    if (game.idleT > 720) return 'sleep';
    if (game.idleT % 170 < 6) return 'closed';
  }
  return '';
}

const FACE_INK = '#1B1030';
function plusStar(x, y, color) {
  px(x - 1, y, 3, 1, color);
  px(x, y - 1, 1, 3, color);
  px(x, y, 1, 1, '#FFFFFF');
}
// One expression centred on (cx, cy); the robot shows glowing marks on its visor.
function drawEye(set, cx, cy, kind) {
  const x0 = Math.floor(cx - 3), y0 = Math.floor(cy - 3);
  if (set === 'robot') {
    const a = Math.floor(cx - 2), b = Math.floor(cy - 2), c = '#FF477E';
    if (kind === 'x') {
      for (const [dx, dy] of [[0, 0], [3, 0], [1, 1], [2, 1], [1, 2], [2, 2], [0, 3], [3, 3]]) px(a + dx, b + dy, 1, 1, c);
    } else if (kind === 'wide') {
      px(a, b + 1, 4, 2, '#FFFFFF'); px(a + 1, b, 2, 4, '#FFFFFF'); px(a + 1, b + 1, 2, 2, FACE_INK);
    } else if (kind === 'happy') {
      for (const [dx, dy] of [[0, 3], [1, 2], [2, 1], [3, 2], [4, 3]]) px(a + dx, b + dy - 1, 1, 1, c);
    } else {
      px(a, b + 1, 5, 1, c);
    }
    return;
  }
  if (kind === 'x' || kind === 'wide') {
    // white socket, 7 x 7 with clipped corners
    px(x0 + 2, y0, 3, 7, '#FFFFFF'); px(x0 + 1, y0 + 1, 5, 5, '#FFFFFF'); px(x0, y0 + 2, 7, 3, '#FFFFFF');
    if (kind === 'x') {
      for (const [dx, dy] of [[0, 0], [4, 0], [1, 1], [3, 1], [2, 2], [1, 3], [3, 3], [0, 4], [4, 4]]) px(x0 + 1 + dx, y0 + 1 + dy, 1, 1, FACE_INK);
    } else {
      px(x0 + 3, y0 + 2, 3, 3, FACE_INK);   // pupil, looking ahead
    }
  } else if (kind === 'happy') {
    for (const [dx, dy] of [[0, 3], [1, 2], [2, 1], [3, 2], [4, 3]]) px(x0 + 1 + dx, y0 + dy, 1, 1, FACE_INK);
  } else {
    px(x0 + 1, y0 + 3, 5, 1, FACE_INK);     // closed: a sleepy line
  }
}

function drawFace(set, pose, ox, oy, kind) {
  const spec = (FACES[set] || FACES.dino)[pose];
  const pa = spec.patch;
  px(ox + pa[0], oy + pa[1], pa[2], pa[3], spec.fillColor);
  for (const e of spec.eyes) drawEye(set, ox + e[0], oy + e[1], kind);
  const hx = ox + spec.head[0], hy = oy + spec.head[1];

  if (kind === 'x') {
    if (set === 'robot') {
      // short-circuit: flickering sparks
      if (game.tick % 8 < 5) {
        const bx = ox + spec.mouth[0] - 2 + ((game.tick >> 3) % 2) * 5;
        px(bx, hy + 1, 1, 2, '#FFD700'); px(bx + 1, hy + 3, 1, 2, '#FFD700'); px(bx, hy + 5, 1, 2, '#FFFFFF');
      }
    } else {
      // tongue lolling out, wobbling a little
      const wob = Math.round(Math.sin(game.tick * 0.25));
      const tx = Math.floor(ox + spec.mouth[0]) - 1 + wob, ty = Math.floor(oy + spec.mouth[1]);
      px(tx, ty, 3, 5, '#FF6F91'); px(tx + 1, ty + 5, 1, 1, '#FF6F91');
      px(tx + 1, ty + 1, 1, 3, '#D94A6B');
    }
    // dizzy stars circling the head
    for (let i = 0; i < 3; i++) {
      const ang = game.tick * 0.12 + i * 2.094;
      plusStar(Math.round(hx + Math.cos(ang) * 11), Math.round(hy - 3 + Math.sin(ang) * 3.5), '#FFD700');
    }
  } else if (kind === 'wide') {
    const dropY = hy + 2 + (game.tick % 22) * 0.35;                 // sweat drop sliding down
    px(hx - 9, dropY, 2, 2, '#7FD6FF'); px(hx - 9, dropY - 1, 1, 1, '#7FD6FF');
  } else if (kind === 'happy') {
    if (game.tick % 12 < 8) { plusStar(Math.round(hx - 9), Math.round(hy + 2), '#FFE680'); plusStar(Math.round(hx + 9), Math.round(hy - 2), '#FFE680'); }
  }
}

// The knock-over: hop backwards, topple onto the back, bounce once.
function drawFallen(frames, set, kind) {
  const t = dino.fallT;
  const k = Math.min(1, t / 26);
  const settle = t > 26 ? Math.sin((t - 26) * 0.55) * Math.exp(-(t - 26) / 9) * 0.18 : 0;
  const ang = -(Math.PI / 2) * k + settle;
  const hop = Math.sin(Math.min(1, t / 18) * Math.PI) * 16;
  const air = (GROUND_Y - STAND_H - dino.y) * (1 - Math.min(1, t / 12));   // hit mid-jump: come down first
  const lift = Math.abs(Math.sin(ang)) * 24;                               // keep the body on the ground
  ctx.save();
  ctx.translate(dino.x - 16 * k + 24, GROUND_Y - lift - hop - air);
  ctx.rotate(ang);
  ctx.imageSmoothingEnabled = true;                                        // smooth the rotated edges
  const img = frames.stand;
  ctx.drawImage(img, -24, -STAND_H, img.width / VIEW, img.height / VIEW);
  if (kind) {
    ctx.translate(-24, -STAND_H);
    drawFace(set, 'stand', 0, 0, kind);
  }
  ctx.restore();
}

function drawQuips() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const q of quips) {
    const age = q.max - q.life;
    const pop = age < 8 ? 1 + 0.35 * (1 - age / 8) : 1;
    ctx.globalAlpha = Math.min(1, q.life / 22);
    ctx.font = `${Math.round(q.size * pop)}px 'Press Start 2P', 'Courier New', monospace`;
    // keep the whole joke on screen, whatever its length
    const half = ctx.measureText(q.text).width / 2 + 6;
    const x = Math.max(half, Math.min(W - half, q.x));
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1B1030';
    ctx.strokeText(q.text, x, q.y);
    ctx.fillStyle = q.color;
    ctx.fillText(q.text, x, q.y);
  }
  ctx.globalAlpha = 1;
}
function drawImpacts() {
  for (const m of impacts) {
    const r = 5 + m.t * 1.7, a = 1 - m.t / 14;
    ctx.globalAlpha = Math.max(0, a);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2, rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(m.x + Math.cos(ang) * rad, m.y + Math.sin(ang) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = '#FFE066';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#FF7A3C';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Draw a sprite scaled around its feet (bottom centre) for squash and stretch.
function blitScaled(img, x, y, sx, sy) {
  if (sx === 1 && sy === 1) { blit(img, x, y); return; }
  const iw = img.width / VIEW, ih = img.height / VIEW;   // logical size
  const w = iw * sx, h = ih * sy;
  ctx.drawImage(img,
    Math.round((x + (iw - w) / 2) * VIEW) / VIEW, Math.round((y + ih - h) * VIEW) / VIEW,
    Math.round(w * VIEW) / VIEW, Math.round(h * VIEW) / VIEW);
}

/* ---------- drawing: player (dino or cat) ---------- */
function drawPlayer() {
  const set = SPR.normal[game.character] ? game.character : 'dino';
  const flash = dino.hurtFlash > 0 && (dino.hurtFlash % 6 < 3);
  const frames = flash ? SPR.flash[set] : SPR.normal[set];
  const phaseA = Math.floor(game.tick / 5) % 2 === 0;
  const kind = flash ? '' : currentFace();     // no expression while the white hurt-blink shows

  if (game.state === 'over' && dino.fallT >= 0) {
    drawFallen(frames, set, kind);
    return;
  }
  if (dino.ducking && !dino.jumping) {
    const y = GROUND_Y - DUCK_H;
    blit(phaseA ? frames.duckA : frames.duckB, dino.x, y);
    if (kind) drawFace(set, 'duck', Math.round(dino.x * VIEW) / VIEW, Math.round(y * VIEW) / VIEW, kind);
    return;
  }
  let f;
  if (game.state !== 'running' || dino.jumping) f = frames.stand;
  else f = phaseA ? frames.runA : frames.runB;
  const bob = game.state === 'idle' ? Math.round(Math.sin(game.tick / 12) * 3) : 0;
  let sx = 1, sy = 1;
  if (game.state === 'running' && !kind) {
    if (dino.squash > 0) { const t = dino.squash / 6; sx = 1 + 0.18 * t; sy = 1 - 0.18 * t; }
    else if (dino.jumping && dino.vy < -6) { sx = 0.92; sy = 1.08; }
  }
  blitScaled(f, dino.x, dino.y + bob, sx, sy);
  if (kind) drawFace(set, 'stand', Math.round(dino.x * VIEW) / VIEW, Math.round((dino.y + bob) * VIEW) / VIEW, kind);
}

/* ---------- obstacles: cactus ---------- */
function makeCactus() {
  const big = rnd() < 0.45;
  if (big) {
    return {
      type: 'cactus',
      x: W + 20,
      y: GROUND_Y - 50,
      w: 26, h: 50,
      hitbox: { x: 4, y: 4, w: 18, h: 44 },
    };
  }
  const cluster = 1 + Math.floor(rnd() * 3);
  return {
    type: 'cactus_small',
    x: W + 20,
    y: GROUND_Y - 34,
    w: 16 * cluster,
    h: 34,
    cluster,
    hitbox: { x: 2, y: 2, w: 16 * cluster - 4, h: 30 },
  };
}

function drawCactus(o) {
  const c = SPR.normal.cactus;
  if (o.type === 'cactus_small') {
    for (let i = 0; i < o.cluster; i++) {
      blit(i === 0 ? c.small : c.smallPlain, o.x + i * 16, o.y);
    }
    return;
  }
  blit(c.big, o.x, o.y);
}

/* ---------- obstacles: bird ---------- */
function makeBird() {
  const heights = [GROUND_Y - 80, GROUND_Y - 50, GROUND_Y - 30];
  const y = heights[Math.floor(rnd() * heights.length)];
  return {
    type: 'bird',
    x: W + 20,
    y: y,
    w: 36, h: 24,
    hitbox: { x: 4, y: 4, w: 28, h: 16 },
  };
}

function drawBird(o) {
  const flapUp = Math.floor(game.tick / 8) % 2 === 0;
  blit(flapUp ? SPR.normal.bird.up : SPR.normal.bird.down, o.x, o.y);
}

/* ---------- pickups: gift boxes ---------- */
function makeGift() {
  // 65% bombs, 35% shields — bombs are the headline reward
  const kind = rnd() < 0.65 ? 'bomb' : 'shield';
  // float at jumpable heights so the player has to commit to grab them
  const tier = rnd();
  let y;
  if (tier < 0.45) y = GROUND_Y - 50;
  else if (tier < 0.85) y = GROUND_Y - 75;
  else y = GROUND_Y - 100;
  return {
    type: 'gift',
    kind: kind,
    x: W + 20,
    baseY: y,
    y: y,
    w: 18, h: 22,
    hitbox: { x: 0, y: 0, w: 18, h: 22 },
    bobSeed: rnd() * 100,
  };
}

function drawGift(g) {
  const bob = Math.sin((game.tick + g.bobSeed * 30) * 0.08) * 3;
  const x = Math.round(g.x);
  const y = Math.round(g.y + bob);
  blit(SPR.normal[g.kind].box, x, y);

  // sparkle aura
  const sp = (game.tick + Math.floor(g.bobSeed * 30)) % 40;
  if (sp < 20) {
    const a = sp / 20;
    ctx.fillStyle = `rgba(255,215,0,${1 - a})`;
    ctx.fillRect(x - 3 - sp * 0.2, y + 6 + sp * 0.3, 1, 1);
    ctx.fillStyle = `rgba(160,231,255,${1 - a})`;
    ctx.fillRect(x + 21 + sp * 0.2, y + 14 + sp * 0.3, 1, 1);
    ctx.fillStyle = `rgba(255,60,172,${1 - a})`;
    ctx.fillRect(x + 9, y + 1 - sp * 0.3, 1, 1);
  }
}

/* ---------- drawing: clouds ---------- */
function makeCloud() {
  return {
    x: W + 20,
    y: 40 + Math.random() * 100,
    w: 40 + Math.random() * 40,
    speed: 0.5 + Math.random() * 0.7,
    tint: Math.random() < 0.5 ? COL.cloud1 : COL.cloud2,
  };
}

function drawCloud(c) {
  const x = c.x, y = c.y;
  px(x + 4,  y + 6,  c.w - 8, 6, c.tint);
  px(x + 0,  y + 10, c.w,     6, c.tint);
  px(x + 8,  y + 0,  c.w - 16,6, c.tint);
  px(x + 14, y - 4,  c.w - 28,4, c.tint);
}

/* ---------- colour helpers ---------- */
function parseColor(c) {
  if (c[0] === '#') return hexToRgb(c);
  const m = c.match(/\d+/g);
  return { r: +m[0], g: +m[1], b: +m[2] };
}
// Blend colour a toward colour b by t (either may be #hex or rgb()).
function mix(a, b, t) {
  const p = parseColor(a), q = parseColor(b);
  return `rgb(${Math.round(lerp(p.r, q.r, t))},${Math.round(lerp(p.g, q.g, t))},${Math.round(lerp(p.b, q.b, t))})`;
}

/* ---------- drawing: ground ---------- */
function drawGround(sky) {
  const offset = Math.floor(game.tick * game.speed) % 32;

  // base ground band: a gentle vertical gradient instead of a flat fill
  const gg = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  gg.addColorStop(0, '#F2B98C');
  gg.addColorStop(0.45, COL.groundBase);
  gg.addColorStop(1, '#CF9470');
  ctx.fillStyle = gg;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // ground top line, with a soft highlight just under it
  px(0, GROUND_Y, W, 2, COL.groundDark);
  px(0, GROUND_Y + 2, W, 2, 'rgba(255,255,255,0.22)');

  // dashes / pebbles travelling left
  for (let i = -1; i < W / 32 + 2; i++) {
    const x = i * 32 - offset;
    const seed = (i * 9301 + 49297) % 233280;
    const r = (seed / 233280);
    if (r < 0.4) {
      px(x + 4,  GROUND_Y + 8, 8, 2, COL.pebble1);
    } else if (r < 0.7) {
      px(x + 16, GROUND_Y + 12, 4, 2, COL.pebble2);
    } else {
      px(x + 8, GROUND_Y + 16, 2, 2, COL.groundDark);
    }
  }

  // dim the ground as the sky darkens, so night does not have a sunlit floor
  const top = parseColor(sky.top);
  const lum = (0.2126 * top.r + 0.7152 * top.g + 0.0722 * top.b) / 255;   // 0 night .. ~0.7 day
  const dark = Math.max(0, Math.min(0.6, 0.62 - lum * 1.2));
  if (dark > 0.01) px(0, GROUND_Y, W, H - GROUND_Y, `rgba(22,8,56,${dark})`);

  // sub-shadow band
  px(0, GROUND_Y + 22, W, H - GROUND_Y - 22, 'rgba(60,20,70,0.07)');
}

/* ---------- drawing: parallax backdrop ---------- */
// Smooth vector silhouettes (peaks and two dune layers) scrolling at different
// speeds. Their colour is the horizon colour pulled toward a tint, so they sit
// naturally in every time of day.
function drawRidge(scroll, base, amp, f1, f2, phase, fill, jagged) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= W + 8; x += 8) {
    const t = x + scroll;
    let y;
    if (jagged) {
      const tri = 1 - Math.abs(((t * f1 + phase) % 2 + 2) % 2 - 1);   // 0..1 zigzag
      y = base - amp * (0.35 + 0.65 * tri) - amp * 0.25 * Math.sin(t * f2 + phase);
    } else {
      y = base - amp * (0.55 + 0.45 * Math.sin(t * f1 + phase)) - amp * 0.35 * Math.sin(t * f2 + phase * 1.7);
    }
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W + 8, GROUND_Y);
  ctx.closePath();
  ctx.fill();
}

function drawBackdrop(sky) {
  const tint = sky.isNight ? '#241048' : '#9C5A86';
  drawRidge(game.scroll * 0.04, GROUND_Y - 34, 62, 0.0042, 0.011, 1.3, mix(sky.bot, tint, 0.30), true);
  drawRidge(game.scroll * 0.12, GROUND_Y - 14, 34, 0.0075, 0.019, 0.4, mix(sky.bot, tint, 0.46), false);
  drawRidge(game.scroll * 0.26, GROUND_Y - 2,  18, 0.0120, 0.031, 2.1, mix(sky.bot, tint, 0.62), false);
}

/* ---------- drawing: soft shadows under characters and cacti ---------- */
function drawShadow(cx, width, alpha) {
  ctx.fillStyle = `rgba(48,16,64,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y + 3, width / 2, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawShadows() {
  const ducked = dino.ducking && !dino.jumping;
  const lift = Math.max(0, GROUND_Y - (dino.y + STAND_H));       // height above ground
  const k = Math.max(0.35, 1 - lift / 150);                       // shrinks and fades as it jumps
  drawShadow(dino.x + (ducked ? 32 : 22), (ducked ? 58 : 38) * k, 0.26 * k);
  for (const o of obstacles) {
    if (o.type !== 'bird') drawShadow(o.x + o.w / 2, o.w * 0.95, 0.2);
  }
}

/* ---------- drawing: sky + celestials ---------- */
function drawSky(sky) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0,    sky.top);
  g.addColorStop(0.55, sky.mid);
  g.addColorStop(1,    sky.bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GROUND_Y);

  const phase = dayPhase();

  // sun / moon arc
  const arcX = W * 0.15 + (W * 0.7) * ((phase * 2) % 1);
  const arcY = 200 - Math.sin(((phase * 2) % 1) * Math.PI) * 160;

  if (phase < 0.5) {
    // sun: wide soft glow, a warm halo ring, then a shaded core
    const glow = ctx.createRadialGradient(arcX, arcY, 6, arcX, arcY, 120);
    glow.addColorStop(0, 'rgba(255,170,120,0.55)');
    glow.addColorStop(1, 'rgba(255,170,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(arcX, arcY, 120, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,154,139,0.55)';
    ctx.beginPath(); ctx.arc(arcX, arcY, 26, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(arcX - 4, arcY - 5, 2, arcX, arcY, 17);
    core.addColorStop(0, '#FFE9A8');
    core.addColorStop(1, COL.sun);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(arcX, arcY, 17, 0, Math.PI * 2); ctx.fill();
  } else {
    // moon: cool glow, a lit disc and a few craters
    const glow = ctx.createRadialGradient(arcX, arcY, 6, arcX, arcY, 90);
    glow.addColorStop(0, 'rgba(190,200,255,0.35)');
    glow.addColorStop(1, 'rgba(190,200,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(arcX, arcY, 90, 0, Math.PI * 2); ctx.fill();
    const disc = ctx.createRadialGradient(arcX - 4, arcY - 4, 2, arcX, arcY, 15);
    disc.addColorStop(0, '#FFFFFF');
    disc.addColorStop(1, COL.moon);
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(arcX, arcY, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,125,190,0.28)';
    for (const [dx, dy, r] of [[-5, -3, 3.2], [4, 3, 2.6], [-1, 7, 1.8]]) {
      ctx.beginPath(); ctx.arc(arcX + dx, arcY + dy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // stars when night-ish
  if (sky.isNight) {
    for (const s of stars) {
      const tw = 0.5 + Math.sin((game.tick + s.seed) * 0.05) * 0.5;
      px(s.x, s.y, s.size, s.size, `rgba(255,215,0,${0.4 + tw * 0.6})`);
      if (s.size > 1) {
        const glint = `rgba(255,255,255,${tw})`;
        px(s.x, s.y - 1, 1, 1, glint);
        px(s.x, s.y + s.size, 1, 1, glint);
        px(s.x - 1, s.y, 1, 1, glint);
        px(s.x + s.size, s.y, 1, 1, glint);
      }
    }
  }
}

/* ---------- particles (death poof + jump dust) ---------- */
function spawnDust(x, y) {
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: x + Math.random() * 8,
      y: y,
      vx: -2 - Math.random() * 1.5,
      vy: -Math.random() * 1.5,
      life: 18 + Math.random() * 8,
      color: ['#FFD89B','#FFE5EC','#A0C4FF'][Math.floor(Math.random()*3)],
      size: 2 + Math.floor(Math.random()*2),
    });
  }
}

function spawnExplosion(x, y) {
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 4;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1,
      life: 30 + Math.random() * 20,
      color: ['#FF3CAC','#FFD700','#2EC4B6','#7209B7','#F72585','#FFB703'][Math.floor(Math.random()*6)],
      size: 2 + Math.floor(Math.random()*3),
    });
  }
}

function spawnBigBoom(x, y) {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 7;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 2,
      life: 40 + Math.random() * 30,
      color: ['#FF477E','#FFD700','#FF3CAC','#FFB703','#F72585','#FFFFFF'][Math.floor(Math.random()*6)],
      size: 2 + Math.floor(Math.random()*4),
    });
  }
}

function spawnSparkle(x, y) {
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 25 + Math.random() * 15,
      color: ['#48CAE4','#A0E7FF','#FFFFFF','#FFD700'][Math.floor(Math.random()*4)],
      size: 1 + Math.floor(Math.random()*2),
    });
  }
}

function activateBomb() {
  const count = obstacles.length;
  for (const o of obstacles) {
    spawnBigBoom(o.x + o.w / 2, o.y + o.h / 2);
  }
  // shockwave from dino too
  spawnBigBoom(dino.x + 22, dino.y + 22);
  obstacles.length = 0;
  game.score += count * 10; // bonus per nuked obstacle
  game.bombFlash = 22;
  SFX.bomb();
  setFace('wide', 50);
  quip(pick(QUIPS.bomb), headPos().x, headPos().y - 12, '#FF477E', 13);
}

function activateShield() {
  game.shieldT = game.shieldMax;
  spawnSparkle(dino.x + 22, dino.y + 24);
  SFX.shield();
  setFace('happy', 70);
  quip(pick(QUIPS.shield), headPos().x, headPos().y - 12, '#48CAE4', 11);
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) px(p.x, p.y, p.size, p.size, p.color);
}

/* ---------- collision ---------- */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function dinoBox() {
  if (dino.ducking && !dino.jumping) {
    return { x: dino.x + 8, y: GROUND_Y - DUCK_H + 4, w: 52, h: DUCK_H - 6 };
  }
  // excludes the tail tip on the left and the outline; the snout is forgiven
  return { x: dino.x + 8, y: dino.y + 4, w: 34, h: STAND_H - 6 };
}

function obsBox(o) {
  return { x: o.x + o.hitbox.x, y: o.y + o.hitbox.y, w: o.hitbox.w, h: o.hitbox.h };
}

/* ---------- init ---------- */
function seedClouds() {
  for (let i = 0; i < 4; i++) {
    const c = makeCloud();
    c.x = Math.random() * W;
    clouds.push(c);
  }
}
function seedStars() {
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * (GROUND_Y - 80),
      size: Math.random() < 0.3 ? 2 : 1,
      seed: Math.random() * 100,
    });
  }
}
seedClouds();
seedStars();

/* ---------- input ---------- */
function jump() {
  if (game.state === 'idle') startGame();
  if (game.state === 'over') return;
  if (dino.jumping) {
    game.jumpBuf = JUMP_BUFFER;   // pressed a touch early: jump on landing
    return;
  }
  if (!dino.jumping) {
    dino.vy = JUMP_V * (trait().jump || 1);
    dino.jumping = true;
    dino.ducking = false;
    spawnDust(dino.x + 8, GROUND_Y - 4);
    SFX.jump();
  }
}
// Input layers call these so we know whether the button is still held:
// holding climbs higher, and a gliding character glides while held.
function jumpPress() { dino.jumpHeld = true; jump(); }
function jumpRelease() { dino.jumpHeld = false; }
function duckOn() {
  if (game.state !== 'running') return;
  if (!dino.jumping && !dino.ducking) {
    dino.ducking = true;
    SFX.duck();
  }
}
function duckOff() { dino.ducking = false; }

function isTypingTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function closeModals() {
  lbModal.hidden = true;
  if (!storyModal.hidden) {
    storyModal.hidden = true;
    if (storyBtn) storyBtn.focus();
  }
}
window.addEventListener('keydown', (e) => {
  // While a panel is open the keyboard belongs to it, not to the game behind.
  if (!storyModal.hidden || !lbModal.hidden) {
    if (e.code === 'Escape') closeModals();
    return;
  }
  if (isTypingTarget(e.target)) return; // Space, R and M must not fire while naming a score
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (e.repeat) return;          // key auto-repeat must not queue jumps
    if (game.state === 'over') restart();
    else jumpPress();
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    duckOn();
  } else if (e.code === 'KeyR') {
    restart();
  } else if (e.code === 'KeyM') {
    e.preventDefault();
    toggleMuted();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown') duckOff();
  if (e.code === 'Space' || e.code === 'ArrowUp') jumpRelease();
});
window.addEventListener('blur', () => { jumpRelease(); duckOff(); });
canvas.addEventListener('pointerdown', () => {
  if (game.state === 'over') restart();
  else jumpPress();
});
window.addEventListener('pointerup', jumpRelease);
window.addEventListener('pointercancel', jumpRelease);

/* touch: coarse pointers get on-screen buttons and tap wording */
const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
if (COARSE) ovTitle.textContent = 'TAP TO PLAY';

// Hybrid devices (touch laptops, tablets with a keyboard) report a fine
// primary pointer, so also switch the touch UI on the first real touch.
function enableTouchUi() {
  if (document.documentElement.classList.contains('touch-ui')) return;
  document.documentElement.classList.add('touch-ui');
  if (game.state === 'idle') ovTitle.textContent = 'TAP TO PLAY';
}
if (COARSE) document.documentElement.classList.add('touch-ui');
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') enableTouchUi();
}, { passive: true });

// Browsers only allow audio to start from certain events, and on touch
// screens pointerdown is not one of them; pointerup/touchend are. Unlock on
// whichever arrives first, then stop listening.
function unlockAudio() {
  const c = ensureAudio();
  if (c && c.state === 'running') {
    ['pointerup', 'touchend', 'keydown'].forEach((ev) => window.removeEventListener(ev, unlockAudio));
  }
}
['pointerup', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));

// Taps on the dimmed overlay: start from the title screen, or retry from
// game over when there is no name form to protect from stray taps.
overlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#ov-submit, #ov-again')) return;
  if (game.state === 'idle') jumpPress();
  else if (game.state === 'over' && ovSubmit.hidden) restart();
});
ovAgain.addEventListener('click', () => { if (game.state === 'over') restart(); });

const touchJump = document.getElementById('touch-jump');
const touchDuck = document.getElementById('touch-duck');
if (touchJump && touchDuck) {
  touchJump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touchJump.classList.add('pressed');
    if (game.state === 'over') { if (ovSubmit.hidden) restart(); }
    else jumpPress();
  });
  // Keyboard or screen-reader activation (Enter/Space on the focused button).
  touchJump.addEventListener('click', (e) => {
    if (e.detail === 0 && game.state !== 'over') { jumpPress(); setTimeout(jumpRelease, 150); }
  });
  document.getElementById('touch-controls').addEventListener('contextmenu', (e) => e.preventDefault());
  const releaseJump = () => touchJump.classList.remove('pressed');
  touchJump.addEventListener('pointerup', releaseJump);
  touchJump.addEventListener('pointercancel', releaseJump);
  touchJump.addEventListener('pointerleave', releaseJump);

  touchDuck.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touchDuck.setPointerCapture(e.pointerId);
    touchDuck.classList.add('pressed');
    duckOn();
  });
  const releaseDuck = () => { touchDuck.classList.remove('pressed'); duckOff(); };
  touchDuck.addEventListener('pointerup', releaseDuck);
  touchDuck.addEventListener('pointercancel', releaseDuck);
}

/* character picker */
function idleBlurb() {
  if (game.state !== 'idle') return;
  const c = trait();
  ovSub.textContent = game.mode === 'daily'
    ? 'Daily challenge: everyone gets the same course'
    : `${CHARACTERS[game.character].name} · ${c.blurb}`;
}

function refreshPicker() {
  document.querySelectorAll('.char-btn').forEach((btn) => {
    const c = CHARACTERS[btn.dataset.char];
    if (!c) return;
    const open = isUnlocked(btn.dataset.char);
    btn.classList.toggle('locked', !open);
    btn.setAttribute('aria-disabled', open ? 'false' : 'true');
    btn.title = open ? `${c.name} — ${c.blurb}` : `${c.name} — reach a best score of ${c.unlock} to unlock`;
  });
}

document.querySelectorAll('.char-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.char;
    if (!isUnlocked(choice)) {
      showModeNote(`Reach a best score of ${CHARACTERS[choice].unlock} to unlock ${CHARACTERS[choice].name}`);
      return;
    }
    game.character = choice;
    idleBlurb();
    document.querySelectorAll('.char-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

/* ---------- game flow ---------- */
// Everything that must be fresh at the start of every run.
function beginRun() {
  if (game.mode === 'daily') {
    game.dailyDate = utcDate();
    game.dailyBest = parseInt(storageGet(DAILY_KEY + game.dailyDate) || '0', 10) || 0;
    rnd = mulberry32(hashSeed('pixel-run:' + game.dailyDate));
  } else {
    rnd = Math.random;
  }
  game.jumpBuf = 0;
  game.shake = 0;
  game.cheated = game.god;
  dino.squash = 0;
  dino.fallT = -1;
  game.faceT = 0;
  quips.length = 0;
  impacts.length = 0;
  game.shieldT = trait().startShield || 0;
}

function startGame() {
  beginRun();
  game.state = 'running';
  game.runStart = Date.now();
  overlay.classList.add('hidden');
  SFX.swoosh();
}

// Score thresholds for the game-over medal.
const MEDALS = { bronze: 100, silver: 300, gold: 600 };

function gameOver() {
  game.state = 'over';
  const cheated = game.cheated;   // god mode was used: record nothing
  let newBest;
  let unlocked = [];
  const newChapters = [];
  if (cheated) {
    newBest = false;
  } else if (game.mode === 'daily') {
    newBest = game.score > game.dailyBest;
    if (newBest) {
      game.dailyBest = game.score;
      storageSet(DAILY_KEY + game.dailyDate, String(game.score));
    }
  } else {
    const before = game.hi;
    newBest = game.score > game.hi;
    if (newBest) {
      game.hi = game.score;
      storageSet(HI_KEY, String(game.hi));
    }
    unlocked = Object.values(CHARACTERS).filter((c) => c.unlock > before && c.unlock <= game.hi).map((c) => c.name);
    if (unlocked.length) refreshPicker();
    // Chapters beyond a character's first unlock at score marks of their own.
    for (const [id, s] of Object.entries(STORIES)) {
      const c = CHARACTERS[id];
      if (!c || game.hi < c.unlock) continue;
      for (const ch of s.chapters) {
        if (ch.at > c.unlock && ch.at > before && ch.at <= game.hi) newChapters.push(`${c.name}: ${ch.title}`);
      }
    }
    refreshStoryBadge();
  }
  game.shake = 14;
  reactHit();
  if (!cheated) arcadeRecord(game.score);
  spawnExplosion(dino.x + 24, dino.y + 24);
  dino.hurtFlash = 30;
  game.hitFlash = 10;
  SFX.gameover();
  ovTitle.textContent = 'GAME OVER';
  ovSub.innerHTML = COARSE
    ? `Score <span class="accent-gold">${pad(game.score)}</span>`
    : `Score <span class="accent-gold">${pad(game.score)}</span> · press <span class="key">R</span> or tap to retry`;
  if (unlocked.length) ovSub.innerHTML += `<br><span class="accent-gold">${unlocked.join(' & ')} unlocked!</span>`;
  if (newChapters.length) ovSub.innerHTML += `<br><span class="accent-gold">📖 New chapter: ${escapeHtml(newChapters.slice(0, 2).join(' · '))}</span>`;
  if (game.mode === 'daily') ovSub.innerHTML += `<br>Daily ${game.dailyDate}`;
  overlay.classList.add('is-over');
  ovAgain.hidden = false;

  // Submission UI: only offer in online mode with a working API.
  if (gameMode === 'online' && API_AVAILABLE && game.score > 0 && !cheated) {
    ovSubmit.hidden = false;
    ovStatus.textContent = '';
    ovStatus.classList.remove('error');
    ovSend.disabled = false;
    ovSend.textContent = 'SUBMIT';
    const savedName = storageGet(NAME_KEY);
    if (savedName && !ovName.value) ovName.value = savedName;
  } else {
    ovSubmit.hidden = true;
  }

  const tier = game.score >= MEDALS.gold ? 'gold'
             : game.score >= MEDALS.silver ? 'silver'
             : game.score >= MEDALS.bronze ? 'bronze' : '';
  ovMedal.hidden = !tier || cheated;
  if (tier) {
    ovMedal.dataset.tier = tier;
    ovMedal.querySelector('.medal-label').textContent = tier.toUpperCase();
  }
  ovBest.hidden = !newBest;
  ovResult.hidden = cheated || (!tier && !newBest);
  if (cheated) ovSub.innerHTML += '<br><span class="accent-bomb">Admin run — not recorded</span>';

  // Brief hit-stop so the collision registers before the panel appears.
  clearTimeout(game.overTimer);
  game.overTimer = setTimeout(() => overlay.classList.remove('hidden'), 1100);
}

function restart() {
  clearTimeout(game.overTimer);
  ovResult.hidden = true;
  ovAgain.hidden = true;
  overlay.classList.remove('is-over');
  game.hitFlash = 0;
  SFX.swoosh();
  obstacles.length = 0;
  gifts.length = 0;
  particles.length = 0;
  game.speed = 2.5;
  game.cleared = 0;
  game.score = 0;
  game.tick = 0;
  game.spawnCD = 60;
  game.giftCD = 360;
  game.shieldT = 0;
  game.bombFlash = 0;
  game.flashCD = 0;
  game.nextMilestone = 100;
  game.runStart = Date.now();
  dino.y = GROUND_Y - STAND_H;
  dino.vy = 0;
  dino.jumping = false;
  dino.ducking = false;
  dino.hurtFlash = 0;
  beginRun();
  game.state = 'running';
  ovSubmit.hidden = true;
  overlay.classList.add('hidden');
}

function pad(n) {
  return n.toString().padStart(5, '0');
}

/* ---------- leaderboard / API ---------- */
async function checkApi() {
  try {
    const res = await fetch(`${API_BASE}/get-scores.php?limit=1`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data.scores);
  } catch (_) {
    return false;
  }
}

async function submitScore() {
  if (ovSend.disabled) return; // Enter key must not bypass an in-flight or completed submit
  const name = (ovName.value || '').trim();
  if (!/^[A-Za-z0-9 _\-]{1,20}$/.test(name)) {
    ovStatus.textContent = 'Name must be 1–20 letters/numbers';
    ovStatus.classList.add('error');
    return;
  }

  ovSend.disabled = true;
  ovSend.textContent = 'SENDING...';
  ovStatus.textContent = '';
  ovStatus.classList.remove('error');

  const payload = {
    name: name,
    score: game.score,
    character: game.character,
    obstacles: game.cleared,
    duration_ms: game.runStart ? (Date.now() - game.runStart) : 0,
  };
  if (game.mode === 'daily') payload.challenge = game.dailyDate;

  try {
    const res = await fetch(`${API_BASE}/submit-score.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      storageSet(NAME_KEY, name);
      INITIAL_SCORES = []; // the ALL tab must refetch to include this run
      ovStatus.classList.remove('error');
      ovStatus.innerHTML = `Saved! Rank <strong class="accent-gold">#${data.rank}</strong> of ${data.total}`;
      ovSend.textContent = 'SAVED ✓';
    } else if (data.error === 'rate_limited') {
      ovStatus.classList.add('error');
      ovStatus.textContent = 'Slow down — try again in a few seconds';
      ovSend.disabled = false;
      ovSend.textContent = 'RETRY';
    } else if (data.error === 'database_unavailable') {
      ovStatus.classList.add('error');
      ovStatus.textContent = data.reason === 'needs_upgrade'
        ? 'The leaderboard needs a database update (run install.php)'
        : 'Leaderboard is offline — your best stays on this device';
      ovSend.disabled = false;
      ovSend.textContent = 'RETRY';
    } else {
      ovStatus.classList.add('error');
      ovStatus.textContent = `Couldn't save: ${data.error || 'unknown error'}`;
      ovSend.disabled = false;
      ovSend.textContent = 'RETRY';
    }
  } catch (err) {
    ovStatus.classList.add('error');
    ovStatus.textContent = 'Network error — score not saved';
    ovSend.disabled = false;
    ovSend.textContent = 'RETRY';
  }
}

let lbCurrentFilter = 'all';

async function loadLeaderboard(filter = 'all') {
  lbCurrentFilter = filter;
  lbList.innerHTML = '<p class="lb-empty">Loading...</p>';
  lbFoot.textContent = '';

  // Fast path: when 'all' is selected and the server already rendered
  // the data into the page, render from cache without a network round-trip.
  if (filter === 'all' && INITIAL_SCORES.length > 0) {
    renderLeaderboard(INITIAL_SCORES, TOTAL_RUNS);
    return;
  }

  const url = `${API_BASE}/get-scores.php?limit=20${filter === 'daily' ? '&challenge=today' : filter !== 'all' ? '&character=' + filter : ''}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.scores) throw new Error('bad response');
    renderLeaderboard(data.scores, data.total);
    if (filter === 'all') {
      INITIAL_SCORES = data.scores;
      TOTAL_RUNS = data.total;
    }
  } catch (_) {
    lbList.innerHTML = '<p class="lb-empty">Could not load scores</p>';
    lbFoot.textContent = '';
  }
}

// Ids (dino, cat, penguin, robot) are stored in the database and the API and
// never change; these are the names players see.
const CHAR_ICONS = { dino: '🦖', cat: '🐱', penguin: '🐧', robot: '🤖' };
const CHAR_NAMES = Object.fromEntries(Object.entries(CHARACTERS).map(([id, c]) => [id, c.name]));

function renderLeaderboard(scores, total) {
  if (!scores || scores.length === 0) {
    lbList.innerHTML = '<p class="lb-empty">No scores yet. Be the first!</p>';
    lbFoot.textContent = '';
    return;
  }
  const rows = scores.map((row, i) => {
    const rank = i + 1;
    const icon = CHAR_ICONS[row.character_type] || CHAR_ICONS.dino;
    const name = escapeHtml(row.player_name);
    const score = pad(parseInt(row.score, 10));
    return `
      <div class="lb-row" data-rank="${rank}">
        <div class="lb-rank">#${rank}</div>
        <div class="lb-icon-cell" title="${CHAR_NAMES[row.character_type] || CHAR_NAMES.dino}">${icon}</div>
        <div class="lb-name">${name}</div>
        <div class="lb-score">${score}</div>
      </div>`;
  }).join('');
  lbList.innerHTML = rows;
  lbFoot.textContent = `${total} run${total === 1 ? '' : 's'} recorded`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* leaderboard wiring */
ovSend.addEventListener('click', submitScore);
ovName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submitScore(); }
});

lbOpen.addEventListener('click', () => {
  lbModal.hidden = false;
  loadLeaderboard(lbCurrentFilter);
});
lbClose.addEventListener('click', () => { lbModal.hidden = true; });
lbModal.addEventListener('click', (e) => {
  if (e.target === lbModal) lbModal.hidden = true;
});
lbTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    lbTabs.forEach(t => t.classList.toggle('active', t === tab));
    loadLeaderboard(tab.dataset.filter);
  });
});

/* ---------- back to the arcade hub (optional) ---------- */
// Set arcade_url in config.local.php (or arcadeUrl in standalone.html's config
// block) when the game is hosted inside a hub; nothing is shown otherwise.
if (/^(\/|\.{1,2}\/|https?:\/\/)/.test(SERVER.arcadeUrl || '')) {
  const hdr = document.querySelector('header');
  if (hdr) {
    const link = document.createElement('a');
    link.className = 'arcade-link';
    link.href = SERVER.arcadeUrl;
    link.textContent = '‹ ARCADE';
    hdr.insertBefore(link, hdr.firstChild);
  }
}

/* ---------- shared arcade stats ---------- */
// Games hosted on the same domain keep a small record in localStorage under
// 'arcade.stats' ({ "<game id>": { best, plays, last, lastPlayed } }), so an
// arcade hub can show each player's best score on the game cards. Runs that
// used the admin cheat are never recorded.
function arcadeRecord(score) {
  try {
    const all = JSON.parse(localStorage.getItem('arcade.stats') || '{}') || {};
    const s = all['pixel-run'] || { best: 0, plays: 0 };
    s.plays += 1;
    s.last = score;
    if (score > s.best) s.best = score;
    s.lastPlayed = Date.now();
    all['pixel-run'] = s;
    localStorage.setItem('arcade.stats', JSON.stringify(all));
  } catch (_) { /* storage unavailable */ }
}

/* ---------- admin cheat code (god mode) ---------- */
// Only wired up when the server says this browser is a signed-in admin.
// Type IDDQD, or tap the title five times on a touch screen.
const godBadge = document.getElementById('god-badge');
function toggleGod() {
  game.god = !game.god;
  if (game.god && game.state === 'running') game.cheated = true;
  if (godBadge) godBadge.hidden = !game.god;
  showModeNote(game.god ? 'God mode ON (admin): this run will not be recorded' : 'God mode OFF', game.god);
}
if (IS_ADMIN) {
  let typed = '';
  window.addEventListener('keydown', (e) => {
    if (e.repeat || isTypingTarget(e.target) || !storyModal.hidden || !lbModal.hidden) return;
    if (!/^Key[A-Z]$/.test(e.code)) { typed = ''; return; }
    typed = (typed + e.code.slice(3).toLowerCase()).slice(-5);
    if (typed === 'iddqd') { typed = ''; toggleGod(); }
  });
  const title = document.querySelector('header h1');
  if (title) {
    let taps = 0, timer = 0;
    title.addEventListener('pointerdown', () => {
      taps++;
      clearTimeout(timer);
      timer = setTimeout(() => { taps = 0; }, 2000);
      if (taps >= 5) { taps = 0; toggleGod(); }
    });
  }
}

/* ---------- character stories ---------- */
// Text lives in stories.js. A chapter opens once the best score reaches its
// `at` mark, so the medal-style score goals double as story progress.
const STORIES = window.PixelRunStories || {};
const STORY_SEEN_KEY = 'pixel_run_story_seen';   // JSON { id: chapters already read }

function storySeen() {
  try { return JSON.parse(storageGet(STORY_SEEN_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function openChapterCount(id) {
  const s = STORIES[id];
  if (!s || !isUnlocked(id)) return 0;
  return s.chapters.filter((ch) => game.hi >= ch.at).length;
}
function refreshStoryBadge() {
  if (!storyBtn) return;
  const seen = storySeen();
  storyBtn.classList.toggle('has-new', Object.keys(STORIES).some((id) => openChapterCount(id) > (seen[id] || 0)));
}
function storyEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderStory(id) {
  const s = STORIES[id];
  const c = CHARACTERS[id];
  if (!s || !c) return;
  storyTabs.forEach((t) => t.classList.toggle('active', t.dataset.char === id));

  const seen = storySeen();
  const readBefore = seen[id] || 0;
  const open = isUnlocked(id);
  storyBody.textContent = '';
  storyBody.scrollTop = 0;

  const hero = storyEl('div', 'story-hero');
  const portrait = document.createElement('canvas');
  const img = SPR.normal[id] && SPR.normal[id].stand;
  if (img) {
    portrait.width = img.width;
    portrait.height = img.height;
    portrait.getContext('2d').drawImage(img, 0, 0);
  }
  const heading = storyEl('div');
  heading.appendChild(storyEl('h3', '', `${c.name} · ${s.title}`));
  heading.appendChild(storyEl('p', '', open ? c.blurb : s.teaser));
  hero.append(portrait, heading);
  storyBody.appendChild(hero);

  if (!open) {
    const lock = storyEl('div', 'story-chapter locked');
    lock.appendChild(storyEl('h4', '', `🔒 Meet ${c.name}`));
    lock.appendChild(storyEl('p', '', `Reach a best score of ${c.unlock} to unlock ${c.name} and the story.`));
    storyBody.appendChild(lock);
    return;
  }

  s.chapters.forEach((ch, i) => {
    const isOpen = game.hi >= ch.at;
    const box = storyEl('div', 'story-chapter' + (isOpen ? '' : ' locked') + (isOpen && i >= readBefore ? ' is-new' : ''));
    box.appendChild(storyEl('h4', '', isOpen ? `${i + 1}. ${ch.title}` : `🔒 Chapter ${i + 1}`));
    box.appendChild(storyEl('p', '', isOpen ? ch.text : `Reach a best score of ${ch.at} to read on.`));
    storyBody.appendChild(box);
  });

  seen[id] = openChapterCount(id);
  storageSet(STORY_SEEN_KEY, JSON.stringify(seen));
  refreshStoryBadge();
}

function openStory(id) {
  if (game.state === 'running') {
    showModeNote('Finish your run before reading');
    return;
  }
  storyModal.hidden = false;
  renderStory(id || game.character);
  storyClose.focus();
}
if (storyBtn) {
  storyBtn.addEventListener('click', () => openStory(game.character));
  storyClose.addEventListener('click', closeModals);
  storyModal.addEventListener('click', (e) => { if (e.target === storyModal) closeModals(); });
  storyTabs.forEach((t) => t.addEventListener('click', () => renderStory(t.dataset.char)));
  refreshStoryBadge();
}

/* ---------- mode toggle ---------- */
function saveMode(m) {
  storageSet(MODE_KEY, m);
}

function showModeNote(text, isSuccess) {
  if (!text) {
    modeNote.hidden = true;
    return;
  }
  modeNote.textContent = text;
  modeNote.classList.toggle('success', !!isSuccess);
  modeNote.hidden = false;
  // auto-fade after 4s
  clearTimeout(showModeNote._t);
  showModeNote._t = setTimeout(() => { modeNote.hidden = true; }, 4000);
}

function applyMode() {
  if (gameMode === 'online' && API_AVAILABLE) {
    modeBtn.classList.remove('offline', 'checking');
    modeBtn.classList.add('online');
    modeBtn.querySelector('.mode-icon').textContent = '🌐';
    modeBtn.querySelector('.mode-label').textContent = 'ONLINE';
    lbOpen.hidden = false;
  } else {
    modeBtn.classList.remove('online', 'checking');
    modeBtn.classList.add('offline');
    modeBtn.querySelector('.mode-icon').textContent = '📴';
    modeBtn.querySelector('.mode-label').textContent = 'OFFLINE';
    lbOpen.hidden = true;
  }
}

async function setMode(target, userInitiated) {
  if (target === 'online') {
    modeBtn.classList.remove('online', 'offline');
    modeBtn.classList.add('checking');
    modeBtn.querySelector('.mode-icon').textContent = '⏳';
    modeBtn.querySelector('.mode-label').textContent = 'CHECKING';

    const ok = await checkApi();
    if (ok) {
      API_AVAILABLE = true;
      gameMode = 'online';
      saveMode('online');
      applyMode();
      if (userInitiated) showModeNote('Online — scores saved to the leaderboard', true);
    } else {
      API_AVAILABLE = false;
      gameMode = 'offline';
      saveMode('offline');
      applyMode();
      if (userInitiated) {
        showModeNote('Server unreachable — staying offline', false);
      }
    }
  } else {
    API_AVAILABLE = false;
    gameMode = 'offline';
    saveMode('offline');
    applyMode();
    if (userInitiated) showModeNote('Offline — playing locally, no scores submitted', true);
    // Also close any open submission UI from a recent game over.
    if (ovSubmit && !ovSubmit.hidden) ovSubmit.hidden = true;
  }
}

modeBtn.addEventListener('click', () => {
  setMode(gameMode === 'online' ? 'offline' : 'online', true);
});

/* sound mute toggle */
function updateSoundButton() {
  if (!soundBtn) return;
  soundBtn.classList.toggle('muted', muted);
  const icon = soundBtn.querySelector('.sound-icon');
  if (icon) icon.textContent = muted ? '🔇' : '🔊';
  soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  soundBtn.title = muted ? 'Sound off — click to unmute' : 'Sound on — click to mute';
}
if (soundBtn) {
  updateSoundButton();
  soundBtn.addEventListener('click', () => { toggleMuted(); });
}

/* ---------- boot ---------- */
game.hi = Math.max(0, parseInt(storageGet(HI_KEY) || '0', 10) || 0);
refreshPicker();
idleBlurb();

/* ---------- daily challenge toggle ---------- */
// Same seeded course for everyone on a given UTC date, traits switched off,
// and its own leaderboard tab. Works offline too (best is kept on-device).
const dailyBtn = document.getElementById('daily-btn');
function setMode(m) {
  game.mode = m;
  game.dailyDate = utcDate();
  game.dailyBest = parseInt(storageGet(DAILY_KEY + game.dailyDate) || '0', 10) || 0;
  if (dailyBtn) {
    dailyBtn.classList.toggle('active', m === 'daily');
    dailyBtn.setAttribute('aria-pressed', m === 'daily' ? 'true' : 'false');
  }
  if (game.state === 'over') restart();
  else idleBlurb();
}
if (dailyBtn) {
  dailyBtn.addEventListener('click', () => {
    if (game.state === 'running') {
      showModeNote('Finish your run before switching modes');
      return;
    }
    setMode(game.mode === 'daily' ? 'normal' : 'daily');
  });
}

// PHP already reported apiAvailable and the initial scores in the config
// block; no need to ping the API on first load.
applyMode();
if (gameMode === 'online' && !API_AVAILABLE) {
  // saved preference says online but the server says no — fall back gracefully
  gameMode = 'offline';
  saveMode('offline');
  applyMode();
}

// Show post-submit success banner if we just came back from a form POST.
if (typeof SERVER.savedRank === 'number' && SERVER.savedRank > 0) {
  showModeNote(`Saved! Ranked #${SERVER.savedRank} on the leaderboard`, true);
}

/* ---------- update ---------- */
function update() {
  game.tick++;
  cycleT++;
  if (game.flashCD > 0) game.flashCD--;
  if (game.bombFlash > 0) game.bombFlash--;
  if (game.hitFlash > 0) game.hitFlash--;
  if (game.shake > 0) game.shake--;
  updateReactions();

  if (game.state !== 'running') {
    // still animate clouds + stars softly when idle
    if (game.state === 'idle') {
      game.scroll += 0.5;   // the backdrop drifts on the title screen
      for (const c of clouds) {
        c.x -= c.speed;
        if (c.x + c.w < 0) {
          c.x = W + 20;
          c.y = 40 + Math.random() * 100;
        }
      }
    }
    if (dino.hurtFlash > 0) dino.hurtFlash--;
    updateParticles();
    return;
  }

  // speed ramp
  if (game.speed < game.maxSpeed) game.speed += game.speedGrow;
  game.scroll += game.speed;

  // score
  if (game.tick % 6 === 0) game.score++;

  // dino physics
  if (dino.squash > 0) dino.squash--;
  if (dino.jumping) {
    const gliding = trait().glide && dino.jumpHeld && dino.vy > 0;
    dino.vy += gliding ? GLIDE_G : GRAVITY;
    if (gliding && dino.vy > GLIDE_MAX_FALL) dino.vy = GLIDE_MAX_FALL;
    // variable jump height: letting go early stops the climb sooner
    if (!dino.jumpHeld && dino.vy < JUMP_CUT_V) dino.vy = JUMP_CUT_V;
    dino.y += dino.vy;
    if (dino.y >= GROUND_Y - STAND_H) {
      dino.y = GROUND_Y - STAND_H;
      dino.vy = 0;
      dino.jumping = false;
      dino.squash = 6;
      spawnDust(dino.x + 8, GROUND_Y - 4);
      SFX.land();
      if (game.jumpBuf > 0) { game.jumpBuf = 0; jump(); }
    }
  }
  if (game.jumpBuf > 0) game.jumpBuf--;

  // obstacle spawn
  game.spawnCD--;
  if (game.spawnCD <= 0) {
    const minGap = Math.max(40, 90 - game.speed * 2);
    const r = rnd();
    let o;
    if (r < 0.2 && game.speed > 6) {
      o = makeBird();
    } else {
      o = makeCactus();
    }
    obstacles.push(o);
    game.spawnCD = minGap + Math.floor(rnd() * 70);
  }

  // gift spawn — shows up periodically as a reward to grab
  game.giftCD--;
  if (game.giftCD <= 0) {
    gifts.push(makeGift());
    // next gift roughly every 12–22 seconds
    game.giftCD = 720 + Math.floor(rnd() * 600);
  }

  // move obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= game.speed;
    if (obstacles[i].x + obstacles[i].w < 0) {
      // count it as cleared and nudge the speed up a notch
      game.cleared++;
      if (game.speed < game.maxSpeed) {
        game.speed = Math.min(game.maxSpeed, game.speed + game.speedStep);
      }
      obstacles.splice(i, 1);
    }
  }

  // move gifts + pickup detection
  const db2 = dinoBox();
  for (let i = gifts.length - 1; i >= 0; i--) {
    const g = gifts[i];
    g.x -= game.speed;
    const gb = { x: g.x, y: g.y, w: g.w, h: g.h };
    if (rectsOverlap(db2, gb)) {
      if (g.kind === 'bomb') activateBomb();
      else activateShield();
      gifts.splice(i, 1);
      continue;
    }
    if (g.x + g.w < 0) gifts.splice(i, 1);
  }

  // clouds
  for (const c of clouds) {
    c.x -= c.speed + game.speed * 0.12;
    if (c.x + c.w < 0) {
      c.x = W + 20;
      c.y = 40 + Math.random() * 100;
      c.speed = 0.5 + Math.random() * 0.7;
    }
  }

  // stars drift very slowly (parallax)
  for (const s of stars) {
    s.x -= 0.05;
    if (s.x < 0) s.x = W;
  }

  // collision
  const db = dinoBox();
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (rectsOverlap(db, obsBox(o))) {
      if (game.shieldT > 0) {
        // shield shatters the obstacle, dino keeps running
        spawnExplosion(o.x + o.w / 2, o.y + o.h / 2);
        obstacles.splice(i, 1);
        game.score += 5;
      } else if (game.god) {
        game.cheated = true;   // admin god mode: pass straight through
      } else {
        gameOver();
        break;
      }
    } else if (game.nearCD <= 0 && !o.near && game.shieldT <= 0 && !game.god) {
      // close call: overlapping horizontally with a few units of clearance
      const ob = obsBox(o);
      if (db.x < ob.x + ob.w && db.x + db.w > ob.x) {
        const gap = db.y + db.h <= ob.y ? ob.y - (db.y + db.h)
                  : ob.y + ob.h <= db.y ? db.y - (ob.y + ob.h) : -1;
        if (gap >= 0 && gap <= 7) {
          o.near = true;
          game.nearCD = 120;
          reactNearMiss();
        }
      }
    }
  }

  // shield countdown
  if (game.shieldT > 0) {
    game.shieldT--;
    // trail sparkles, scattered over whichever sprite is showing
    if (game.tick % 4 === 0) {
      const ducked = dino.ducking && !dino.jumping;
      particles.push({
        x: dino.x + Math.random() * (ducked ? 64 : 48),
        y: (ducked ? GROUND_Y - DUCK_H : dino.y) + Math.random() * (ducked ? DUCK_H : STAND_H),
        vx: -1 - Math.random(),
        vy: -0.5 + Math.random(),
        life: 20,
        color: ['#48CAE4','#A0E7FF','#FFFFFF'][Math.floor(Math.random()*3)],
        size: 1,
      });
    }
  }

  // milestone every 100 points; tracked as a threshold because bomb and
  // shield bonuses can jump the score straight past a multiple of 100
  if (game.score >= game.nextMilestone) {
    game.nextMilestone += 100;
    game.flashCD = 30;
    SFX.milestone();
    setFace('happy', 60);
    quip(pick(QUIPS.milestone), headPos().x, headPos().y - 12, '#FFD700', 11);
  }

  if (dino.hurtFlash > 0) dino.hurtFlash--;
  updateParticles();
}

/* ---------- render ---------- */
function render() {
  ctx.setTransform(VIEW, 0, 0, VIEW, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const sky = currentSky();
  drawSky(sky);

  // screen shake moves the world, not the sky, so no edges show
  ctx.save();
  if (game.shake > 0) {
    const m = game.shake * 0.5;
    ctx.translate(Math.round((Math.random() - 0.5) * m * 2 * VIEW) / VIEW, Math.round((Math.random() - 0.5) * m * 2 * VIEW) / VIEW);
  }

  // clouds
  for (const c of clouds) drawCloud(c);

  drawBackdrop(sky);
  drawGround(sky);
  drawShadows();

  // obstacles
  for (const o of obstacles) {
    if (o.type === 'bird') drawBird(o);
    else drawCactus(o);
  }

  // gifts (in front of obstacles so the player sees them)
  for (const g of gifts) drawGift(g);

  if (game.god) ctx.globalAlpha = 0.55;
  drawPlayer();
  ctx.globalAlpha = 1;

  // shield bubble
  if (game.shieldT > 0) {
    const ducked = dino.ducking && !dino.jumping;
    const cx = dino.x + (ducked ? 32 : 24);
    const cy = ducked ? GROUND_Y - DUCK_H / 2 : dino.y + 24;
    const pulse = Math.sin(game.tick * 0.2) * 2;
    const r = 38 + pulse;
    // outer glow
    ctx.strokeStyle = `rgba(72,202,228,${0.5 + Math.sin(game.tick*0.15)*0.2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // inner ring
    ctx.strokeStyle = `rgba(160,231,255,0.7)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.stroke();
    // warning flicker when about to expire
    if (game.shieldT < 90 && game.tick % 6 < 3) {
      ctx.strokeStyle = 'rgba(255,71,126,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // shield timer bar
    const w = 60;
    const tx = dino.x - 6;
    const ty = (ducked ? GROUND_Y - DUCK_H : dino.y) - 12;
    ctx.fillStyle = 'rgba(13,2,33,0.6)';
    ctx.fillRect(tx, ty, w, 4);
    ctx.fillStyle = '#48CAE4';
    ctx.fillRect(tx, ty, w * (game.shieldT / game.shieldMax), 4);
  }

  drawParticles();
  drawImpacts();
  drawQuips();
  ctx.restore();

  // bomb flash overlay
  if (game.bombFlash > 0) {
    const a = game.bombFlash / 22;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`;
    ctx.fillRect(0, 0, W, H);
  }

  // collision flash
  if (game.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${game.hitFlash / 10 * 0.8})`;
    ctx.fillRect(0, 0, W, H);
  }

  // score HUD update
  hiEl.textContent = pad(game.mode === 'daily' ? game.dailyBest : game.hi);
  scEl.textContent = pad(game.score);

  // milestone flash (triggered and decayed in update)
  if (game.flashCD > 0) {
    ctx.fillStyle = `rgba(255,215,0,${game.flashCD / 80})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------- loop: fixed 60 Hz simulation, render at display rate ---------- */
// All game logic counts in ticks. Running update() once per animation
// frame would make the game 2x faster on a 120 Hz display and 2.4x on
// 144 Hz, so frames are accumulated and update() runs at a fixed step.
const STEP_MS = 1000 / 60;
let lastFrame = 0;
let accumulator = 0;

function loop(now) {
  if (!lastFrame) lastFrame = now;
  accumulator += Math.min(now - lastFrame, 250); // cap the catch-up after a background tab
  lastFrame = now;
  while (accumulator >= STEP_MS) {
    update();
    accumulator -= STEP_MS;
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

})();
