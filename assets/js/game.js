/* ============================================================
   PIXEL RUN — COLOUR EDITION
   A vivid take on the offline runner. Switch between dino, cat, penguin & robot.
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
const ovResult = document.getElementById('ov-result');
const ovMedal  = document.getElementById('ov-medal');
const ovBest   = document.getElementById('ov-best');
const ovName   = document.getElementById('ov-name');
const ovSend   = document.getElementById('ov-send');
const ovStatus = document.getElementById('ov-status');
const lbOpen   = document.getElementById('lb-open');
const lbModal  = document.getElementById('lb-modal');
const lbClose  = document.getElementById('lb-close');
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
  overTimer: 0,       // pending game-over panel timeout id
  nextMilestone: 100, // next score that triggers the milestone flash
};

/* ---------- player ---------- */
const GRAVITY = 0.7;
const JUMP_V  = -13.5;
const STAND_H = 48;   // standing sprite height (sprites.js: 22 rows + outline, x2)
const DUCK_H  = 28;   // ducking sprite height (12 rows + outline, x2)

const dino = {
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
  blit(f, dino.x, dino.y + bob);
}

/* ---------- obstacles: cactus ---------- */
function makeCactus() {
  const big = Math.random() < 0.45;
  if (big) {
    return {
      type: 'cactus',
      x: W + 20,
      y: GROUND_Y - 50,
      w: 26, h: 50,
      hitbox: { x: 4, y: 4, w: 18, h: 44 },
    };
  }
  const cluster = 1 + Math.floor(Math.random() * 3);
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
  const y = heights[Math.floor(Math.random() * heights.length)];
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
  const kind = Math.random() < 0.65 ? 'bomb' : 'shield';
  // float at jumpable heights so the player has to commit to grab them
  const tier = Math.random();
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
    bobSeed: Math.random() * 100,
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
  if (!dino.jumping) {
    dino.vy = JUMP_V;
    dino.jumping = true;
    dino.ducking = false;
    spawnDust(dino.x + 8, GROUND_Y - 4);
    SFX.jump();
  }
}
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

window.addEventListener('keydown', (e) => {
  if (isTypingTarget(e.target)) return; // Space, R and M must not fire while naming a score
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (game.state === 'over') restart();
    else jump();
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
});
canvas.addEventListener('pointerdown', () => {
  if (game.state === 'over') restart();
  else jump();
});

/* character picker */
document.querySelectorAll('.char-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.char;
    game.character = choice;
    document.querySelectorAll('.char-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

/* ---------- game flow ---------- */
function startGame() {
  game.state = 'running';
  game.runStart = Date.now();
  overlay.classList.add('hidden');
  SFX.swoosh();
}

// Score thresholds for the game-over medal.
const MEDALS = { bronze: 100, silver: 300, gold: 600 };

function gameOver() {
  game.state = 'over';
  const newBest = game.score > game.hi;
  if (newBest) {
    game.hi = game.score;
    storageSet(HI_KEY, String(game.hi));
  }
  spawnExplosion(dino.x + 24, dino.y + 24);
  dino.hurtFlash = 30;
  game.hitFlash = 10;
  SFX.gameover();
  ovTitle.textContent = 'GAME OVER';
  ovSub.innerHTML = `Score <span class="accent-gold">${pad(game.score)}</span> · press <span class="key">R</span> or tap to retry`;

  // Submission UI: only offer in online mode with a working API.
  if (gameMode === 'online' && API_AVAILABLE && game.score > 0) {
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
  ovMedal.hidden = !tier;
  if (tier) {
    ovMedal.dataset.tier = tier;
    ovMedal.querySelector('.medal-label').textContent = tier.toUpperCase();
  }
  ovBest.hidden = !newBest;
  ovResult.hidden = !tier && !newBest;

  // Brief hit-stop so the collision registers before the panel appears.
  clearTimeout(game.overTimer);
  game.overTimer = setTimeout(() => overlay.classList.remove('hidden'), 450);
}

function restart() {
  clearTimeout(game.overTimer);
  ovResult.hidden = true;
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
      ovStatus.textContent = 'Leaderboard is offline — your best stays on this device';
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

  const url = `${API_BASE}/get-scores.php?limit=20${filter !== 'all' ? '&character=' + filter : ''}`;
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

const CHAR_ICONS = { dino: '🦖', cat: '🐱', penguin: '🐧', robot: '🤖' };

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
        <div class="lb-icon-cell">${icon}</div>
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
  if (dino.jumping) {
    dino.vy += GRAVITY;
    dino.y += dino.vy;
    if (dino.y >= GROUND_Y - STAND_H) {
      dino.y = GROUND_Y - STAND_H;
      dino.vy = 0;
      dino.jumping = false;
      spawnDust(dino.x + 8, GROUND_Y - 4);
      SFX.land();
    }
  }

  // obstacle spawn
  game.spawnCD--;
  if (game.spawnCD <= 0) {
    const minGap = Math.max(40, 90 - game.speed * 2);
    const r = Math.random();
    let o;
    if (r < 0.2 && game.speed > 6) {
      o = makeBird();
    } else {
      o = makeCactus();
    }
    obstacles.push(o);
    game.spawnCD = minGap + Math.floor(Math.random() * 70);
  }

  // gift spawn — shows up periodically as a reward to grab
  game.giftCD--;
  if (game.giftCD <= 0) {
    gifts.push(makeGift());
    // next gift roughly every 12–22 seconds
    game.giftCD = 720 + Math.floor(Math.random() * 600);
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

  drawPlayer();

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
  hiEl.textContent = pad(game.hi);
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
