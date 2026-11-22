// SOLMAR HEAT — shared constants, world state and small helpers.
// One mutable `state` object is the whole game: every module reads and writes it,
// main.js drives the update order. Nothing here touches the network.

export const CITY = {
  blocks: 9, // 9 x 9 blocks
  pitch: 60, // block + street, in metres
  street: 16, // street width
  half: 270, // city spans -270..270 on each axis; beach/water beyond +270 south
  blockSize: 44,
};

export const WORLD = {
  groundY: 0,
  gravity: 22,
  playerWalk: 6,
  playerRun: 10,
  playerRadius: 0.55,
  carRadius: 2.3,
  maxWanted: 5,
  // arcade car feel, tuned Nov 22: a touch quicker off the line and less
  // draggy at speed, so the getaway actually feels like one
  carMaxFwd: 40,
  carMaxRev: 10,
  carAccel: 16,
  carDrag: 0.45,
};

// Street centre lines, one per axis: streets at -270, -210, ..., 270.
export function streetCenters() {
  const out = [];
  for (let i = 0; i <= CITY.blocks; i += 1) out.push(-CITY.half + i * CITY.pitch);
  return out;
}
export function nearestStreet(v) {
  const centers = streetCenters();
  let best = centers[0];
  for (const c of centers) if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  return best;
}
// Is (x,z) on a street (within the asphalt, not inside a block)?
export function onStreet(x, z) {
  const m = CITY.pitch;
  const fx = (((x + CITY.half) % m) + m) % m;
  const fz = (((z + CITY.half) % m) + m) % m;
  const edge = CITY.street / 2;
  return fx < edge || fx > m - edge || fz < edge || fz > m - edge;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
// A seeded random so screenshot staging is repeatable.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the game state (one object, shared by every module) ----
export const state = {
  phase: 'title', // title | playing | paused | busted | wasted | complete
  time: 0,
  cash: 0,
  health: 100,
  missionIndex: 0,
  missionStep: 0,
  missionTimer: -1, // seconds left, -1 = no timer
  missionDone: false,
  wanted: 0,
  wantedHeat: 0, // 0..1, how "hot" the chase is (police near / fresh crime)
  lastCrimeAt: -999,
  kills: 0,
  carsStolen: 0,
  muted: false,
  shot: null, // ?shot= staging name, or null
  shotSeed: 1,
  // player
  player: {
    x: 0, z: 30, y: 0, vy: 0, heading: 0, onGround: true,
    inCar: null, // the car object the player drives, or null
    speed: 0, armed: true, ammo: 12, reloadAt: 0, lastShotAt: -9, lastHurtAt: -9,
  },
  camera: { yaw: Math.PI, pitch: -0.32, dist: 8 },
  input: {
    fwd: false, back: false, left: false, right: false, run: false, jump: false,
    mouseDX: 0, mouseDY: 0, shooting: false, shootQueued: false,
  },
  // world collections, filled by city/entities modules
  buildings: [], // {minX,maxX,minZ,maxZ,h}
  buildingsMeshes: [], // building meshes, for bullet raycasts
  shots: [], // tracer lines {from,to,at,player?}
  hitAt: -9, // last time the player hit an enemy
  cars: [], // traffic + police + parked; each {kind, group, x,z,heading,speed,...}
  peds: [],
  enemies: [],
  police: [],
  markers: [], // {x,z,label,kind}
  objective: { name: '', text: '', hint: '' },
  toast: '',
  toastAt: -9,
  bustTimer: 0, // seconds a cop has been touching the player on foot
  finePaid: false, // the $100 bust/wasted fine, charged once per bust
  missionKillsAtStart: 0,
  save: null,
};

export function setObjective(name, text, hint) {
  state.objective = { name, text, hint: hint || '' };
}
export function showToast(text) {
  state.toast = text;
  state.toastAt = state.time;
}
