// SOLMAR HEAT — the HUD: cash, health, wanted stars, objective, speed,
// toast messages, and the canvas minimap.
import { CITY, state, clamp } from './config.js';
import { activeMarker } from './missions.js';

const $ = (id) => document.getElementById(id);

function wantedStars() {
  let s = '';
  for (let i = 0; i < 5; i += 1) s += i < state.wanted ? '★' : '<span class="off">★</span>';
  return s;
}

export function updateHUD() {
  $('cash').textContent = '$' + state.cash.toLocaleString('en-US');
  $('healthfill').style.width = clamp(state.health, 0, 100) + '%';
  $('healthfill').style.background = state.health > 50
    ? 'linear-gradient(90deg,#37d67a,#a5ff6b)'
    : state.health > 25 ? 'linear-gradient(90deg,#e8a13a,#ffd34d)' : 'linear-gradient(90deg,#d63a37,#ff7a6b)';
  $('missioncount').textContent = 'MISSION ' + Math.min(state.missionIndex + 1, 5) + ' / 5';
  $('wanted').innerHTML = wantedStars();
  $('missionname').textContent = state.objective.name;
  $('objectivetext').textContent = state.objective.text;
  $('objectivehint').textContent = state.objective.hint;
  const timerEl = $('timer');
  if (state.missionTimer > 0) {
    timerEl.classList.remove('hidden');
    timerEl.textContent = Math.ceil(state.missionTimer) + 's';
  } else {
    timerEl.classList.add('hidden');
  }
  const speedo = $('speedo');
  if (state.player.inCar) {
    speedo.classList.remove('hidden');
    $('speednum').textContent = Math.round(Math.abs(state.player.inCar.speed) * 3.6);
    $('vehiclename').textContent = state.player.inCar.name;
  } else {
    speedo.classList.add('hidden');
  }
  $('crosshair').classList.toggle('hidden', !!state.player.inCar || state.phase !== 'playing');
  // toast (3 s)
  const toastEl = $('toast');
  if (state.time - state.toastAt < 3 && state.toast) {
    toastEl.textContent = state.toast;
    toastEl.style.opacity = '1';
  } else {
    toastEl.style.opacity = '0';
  }
  // damage vignette + hitmarker
  const dmg = $('damaged');
  dmg.style.opacity = state.time - state.lastHurtAt < 0.45 ? String(1 - (state.time - state.lastHurtAt) / 0.45) : '0';
  const hm = $('hitmark');
  hm.style.opacity = state.time - state.hitAt < 0.18 ? '1' : '0';
}

export function drawMinimap() {
  const cv = $('minimap');
  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const world = CITY.half * 2 + 120; // -330..330
  const s = W / world;
  const px = (x) => (x + world / 2) * s;
  const pz = (z) => (z + world / 2) * s;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#16222f';
  g.fillRect(0, 0, W, H);
  // water (south)
  g.fillStyle = '#2f7fc4';
  g.fillRect(0, pz(300), W, H - pz(300));
  g.fillStyle = '#e8d9a8';
  g.fillRect(0, pz(270), W, pz(300) - pz(270));
  // blocks
  g.fillStyle = '#46586a';
  const pitch = CITY.pitch;
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const x0 = -CITY.half + bx * pitch + CITY.street / 2;
      const z0 = -CITY.half + bz * pitch + CITY.street / 2;
      g.fillRect(px(x0), pz(z0), CITY.blockSize * s, CITY.blockSize * s);
    }
  }
  // mission marker (pulsing yellow diamond)
  const mk = activeMarker();
  if (mk) {
    const pulse = 5 + Math.sin(state.time * 5) * 2;
    g.fillStyle = '#ffd34d';
    g.beginPath();
    g.moveTo(px(mk.x), pz(mk.z) - pulse);
    g.lineTo(px(mk.x) + pulse, pz(mk.z));
    g.lineTo(px(mk.x), pz(mk.z) + pulse);
    g.lineTo(px(mk.x) - pulse, pz(mk.z));
    g.closePath();
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1;
    g.stroke();
  }
  // traffic (grey) and parked cars (dark grey)
  for (const car of state.cars) {
    if (car.kind === 'police') continue;
    g.fillStyle = car === state.player.inCar ? '#ffffff' : 'rgba(200,210,220,0.85)';
    g.fillRect(px(car.x) - 2, pz(car.z) - 2, 4, 4);
  }
  // enemies (purple)
  for (const e of state.enemies) {
    if (e.dead) continue;
    g.fillStyle = '#c86bff';
    g.beginPath();
    g.arc(px(e.x), pz(e.z), 3, 0, Math.PI * 2);
    g.fill();
  }
  // police (flashing blue/red)
  const flashBlue = Math.floor(state.time * 3) % 2 === 0;
  for (const c of state.police) {
    g.fillStyle = flashBlue ? '#3a86ff' : '#ff3a3a';
    g.beginPath();
    g.arc(px(c.x), pz(c.z), 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1;
    g.stroke();
  }
  // player (white triangle, rotated to heading)
  const p = state.player;
  g.save();
  g.translate(px(p.x), pz(p.z));
  g.rotate(Math.atan2(Math.sin(p.heading), -Math.cos(p.heading)));
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#000';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -7);
  g.lineTo(5, 6);
  g.lineTo(-5, 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  // north tick
  g.fillStyle = '#fff';
  g.font = 'bold 11px Arial';
  g.fillText('N', 6, 13);
}
