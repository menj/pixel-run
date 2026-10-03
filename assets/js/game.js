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
const W = canvas.width;
const H = canvas.height;

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
  penguin: { name: 'Miney',  blurb: 'Hold jump to glide',   unlock: 300, glide: true },
  robot:   { name: 'Mo',     blurb: 'Starts with a shield', unlock: 600, startShield: 180 },
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
function px(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/* ---------- sprites (bitmaps from sprites.js, pre-rendered once) ---------- */
const SPRITE_DATA = window.PixelRunSprites;
const SPRITE_SCALE = SPRITE_DATA.SCALE;

// Rasterize an outlined character grid to an offscreen canvas.
function rasterize(rows, palette) {
  const s = SPRITE_SCALE;
  const c = document.createElement('canvas');
  c.width = rows[0].length * s;
  c.height = rows.length * s;
  const g = c.getContext('2d');
  for (let r = 0; r < rows.length; r++) {
    for (let col = 0; col < rows[r].length; col++) {
      const ch = rows[r][col];
      if (ch === '.') continue;
      g.fillStyle = palette[ch] || '#FF00FF';
      g.fillRect(col * s, r * s, s, s);
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
const SPR = buildSprites(SPRITE_DATA);

function blit(img, x, y) {
  ctx.drawImage(img, Math.round(x), Math.round(y));
}

// Draw a sprite scaled around its feet (bottom centre) for squash and stretch.
function blitScaled(img, x, y, sx, sy) {
  if (sx === 1 && sy === 1) { blit(img, x, y); return; }
  const w = img.width * sx, h = img.height * sy;
  ctx.drawImage(img, Math.round(x + (img.width - w) / 2), Math.round(y + img.height - h), Math.round(w), Math.round(h));
}

/* ---------- drawing: player (dino or cat) ---------- */
function drawPlayer() {
  const set = SPR.normal[game.character] ? game.character : 'dino';
  const flash = dino.hurtFlash > 0 && (dino.hurtFlash % 6 < 3);
  const frames = flash ? SPR.flash[set] : SPR.normal[set];
  const phaseA = Math.floor(game.tick / 5) % 2 === 0;

  if (dino.ducking && !dino.jumping) {
    blit(phaseA ? frames.duckA : frames.duckB, dino.x, GROUND_Y - DUCK_H);
    return;
  }
  let f;
  if (game.state !== 'running' || dino.jumping) f = frames.stand;
  else f = phaseA ? frames.runA : frames.runB;
  const bob = game.state === 'idle' ? Math.round(Math.sin(game.tick / 12) * 3) : 0;
  let sx = 1, sy = 1;
  if (game.state === 'running') {
    if (dino.squash > 0) { const t = dino.squash / 6; sx = 1 + 0.18 * t; sy = 1 - 0.18 * t; }
    else if (dino.jumping && dino.vy < -6) { sx = 0.92; sy = 1.08; }
  }
  blitScaled(f, dino.x, dino.y + bob, sx, sy);
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

/* ---------- drawing: ground ---------- */
function drawGround() {
  const offset = Math.floor(game.tick * game.speed) % 32;

  // base ground band
  ctx.fillStyle = COL.groundBase;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // ground top line
  ctx.fillStyle = COL.groundDark;
  ctx.fillRect(0, GROUND_Y, W, 2);

  // dashes / pebbles travelling left
  for (let i = -1; i < W / 32 + 2; i++) {
    const x = i * 32 - offset;
    const seed = (i * 9301 + 49297) % 233280;
    const r = (seed / 233280);
    if (r < 0.4) {
      px(x + 4,  GROUND_Y + 6, 8, 2, COL.pebble1);
    } else if (r < 0.7) {
      px(x + 16, GROUND_Y + 10, 4, 2, COL.pebble2);
    } else {
      px(x + 8, GROUND_Y + 14, 2, 2, COL.groundDark);
    }
  }

  // sub-shadow band
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, GROUND_Y + 18, W, H - GROUND_Y - 18);
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
    // sun
    ctx.fillStyle = COL.sunGlow;
    ctx.beginPath();
    ctx.arc(arcX, arcY, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.sun;
    ctx.beginPath();
    ctx.arc(arcX, arcY, 16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // moon
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(arcX, arcY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.moon;
    ctx.beginPath();
    ctx.arc(arcX, arcY, 14, 0, Math.PI * 2);
    ctx.fill();
    // crescent shadow
    ctx.fillStyle = sky.top;
    ctx.beginPath();
    ctx.arc(arcX - 6, arcY - 3, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // stars when night-ish
  if (sky.isNight) {
    for (const s of stars) {
      const tw = 0.5 + Math.sin((game.tick + s.seed) * 0.05) * 0.5;
      ctx.fillStyle = `rgba(255,215,0,${0.4 + tw * 0.6})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
      if (s.size > 1) {
        ctx.fillStyle = `rgba(255,255,255,${tw})`;
        ctx.fillRect(s.x, s.y - 1, 1, 1);
        ctx.fillRect(s.x, s.y + s.size, 1, 1);
        ctx.fillRect(s.x - 1, s.y, 1, 1);
        ctx.fillRect(s.x + s.size, s.y, 1, 1);
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
}

function activateShield() {
  game.shieldT = game.shieldMax;
  spawnSparkle(dino.x + 22, dino.y + 24);
  SFX.shield();
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
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
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
  game.overTimer = setTimeout(() => overlay.classList.remove('hidden'), 450);
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

  if (game.state !== 'running') {
    // still animate clouds + stars softly when idle
    if (game.state === 'idle') {
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
  }

  if (dino.hurtFlash > 0) dino.hurtFlash--;
  updateParticles();
}

/* ---------- render ---------- */
function render() {
  const sky = currentSky();
  drawSky(sky);

  // screen shake moves the world, not the sky, so no edges show
  ctx.save();
  if (game.shake > 0) {
    const m = game.shake * 0.5;
    ctx.translate(Math.round((Math.random() - 0.5) * m * 2), Math.round((Math.random() - 0.5) * m * 2));
  }

  // clouds
  for (const c of clouds) drawCloud(c);

  drawGround();

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
