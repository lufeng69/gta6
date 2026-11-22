// SOLMAR HEAT — bootstrap, camera, input, the game loop, save/load and
// the ?shot= staging used for the entry's screenshots.
import * as THREE from 'three';
import { state, clamp, angleLerp, showToast, setObjective } from './config.js';
import { buildCity, collideBuildings } from './city.js';
import {
  initEntities, buildPlayerMesh, updatePlayerOnFoot, updatePlayerCar,
  updateTraffic, updatePeds, updateEnemies, updateWanted, playerShoot,
  nearestStealableCar, enterCar, exitCar,
} from './entities.js';
import { startMission, updateMissions, activeMarker, resetStory } from './missions.js';
import { updateHUD, drawMinimap } from './hud.js';
import { initAudio, updateAudio, setMuted, sfxClick, resumeAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'solmar-heat-save-v1';

let renderer;
let scene;
let camera;
let playerMesh;
let beacon;
let beaconGem;
let tracerGroup;
let enterCooldown = 0;
let shotStaged = false;
let shotReadyAt = -1;

// ---------------- setup ----------------
function init() {
  const canvas = $('game');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // ACES filmic grade, Nov 22 polish: warmer highlights, deeper dusk
  // shadows — the sunset sky and neon read as one picture, not flat lambert
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

  buildCity(scene);
  initEntities(scene);

  playerMesh = buildPlayerMesh();
  scene.add(playerMesh);

  // mission beacon: a pillar of light + a floating marker gem
  beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 35;
  beacon.add(pillar);
  beaconGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  beaconGem.position.y = 5;
  beacon.add(beaconGem);
  scene.add(beacon);

  tracerGroup = new THREE.Group();
  scene.add(tracerGroup);

  // player start: on the street by the garage
  state.player.x = -210;
  state.player.z = 60;
  state.player.heading = Math.PI / 2;

  bindInput();
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // screenshot staging (?shot=start|drive|chase|mission)
  const params = new URLSearchParams(window.location.search);
  state.shot = params.get('shot');
  state.shotSeed = Number(params.get('seed') || 1);
  if (state.shot === 'start') {
    window.__shotReady = true;
  } else if (state.shot) {
    startGame(false);
    stageShot(state.shot);
    shotReadyAt = 2.2;
  }

  // title screen buttons
  $('startbtn').addEventListener('click', () => { sfxClick(); startGame(true); });
  $('continuebtn').addEventListener('click', () => { sfxClick(); startGame(false, true); });
  $('resumebtn').addEventListener('click', () => { sfxClick(); resumeGame(); });
  $('restartbtn').addEventListener('click', () => { sfxClick(); resetStory(); resumeGame(); });
  $('retrybtn').addEventListener('click', () => {
    sfxClick();
    if (state.phase === 'complete') {
      $('endscreen').classList.add('hidden');
      $('hud').classList.remove('hidden');
      setObjective('Free Roam', 'Solmar Bay is yours.', 'Drive, explore, cause trouble — the city never sleeps.');
      state.phase = 'playing';
    } else {
      respawn();
    }
  });
  updateContinueButton();
  updateHUD();

  // debug hook for automated play-tests (read-only state view)
  window.__solmar = { state, scene, camera, beacon, marker: activeMarker };

  renderer.setAnimationLoop(tick);
}

function updateContinueButton() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.missionIndex === 'number') $('continuebtn').classList.remove('hidden');
    }
  } catch (e) { /* no storage */ }
}

// ---------------- input ----------------
function bindInput() {
  const keymap = {
    KeyW: 'fwd', ArrowUp: 'fwd',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
    Space: 'jump',
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    const k = keymap[e.code];
    if (k) state.input[k] = true;
    if (e.code === 'KeyE' && state.phase === 'playing' && state.time - enterCooldown > 0.4) {
      enterCooldown = state.time;
      toggleCar();
    }
    if (e.code === 'KeyR' && state.phase === 'playing') {
      state.player.ammo = 12;
      showToast('Reloaded.');
    }
    if (e.code === 'KeyP' && state.phase === 'playing') saveGame();
    if (e.code === 'KeyM') setMuted(!state.muted);
    if (e.code === 'Escape' && state.phase === 'playing') pauseGame();
  });
  window.addEventListener('keyup', (e) => {
    const k = keymap[e.code];
    if (k) state.input[k] = false;
  });
  const canvas = $('game');
  canvas.addEventListener('mousedown', (e) => {
    if (state.phase !== 'playing') return;
    if (e.button === 0) {
      state.input.shooting = true;
      playerShoot(camera);
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.input.shooting = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (state.phase !== 'playing') return;
    if (document.pointerLockElement === canvas) {
      state.camera.yaw -= e.movementX * 0.0026;
      state.camera.pitch = clamp(state.camera.pitch + e.movementY * 0.0022, -0.15, 0.9);
    } else if (e.buttons === 2) {
      state.camera.yaw -= e.movementX * 0.004;
      state.camera.pitch = clamp(state.camera.pitch + e.movementY * 0.003, -0.15, 0.9);
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('click', () => {
    resumeAudio();
    if (state.phase === 'playing' && document.pointerLockElement !== canvas) {
      lockPointer(canvas);
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && state.phase === 'playing' && !state.shot) {
      pauseGame();
    }
  });
}

function lockPointer(canvas) {
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => { /* headless or denied: ignore */ });
  } catch (err) { /* headless: ignore */ }
}

function toggleCar() {
  const p = state.player;
  if (p.inCar) {
    exitCar();
    showToast('You left the car.');
    return;
  }
  const car = nearestStealableCar(4.5);
  if (car) {
    enterCar(car);
  } else {
    showToast('No car close enough — walk up to one.');
  }
}

// ---------------- flow ----------------
function startGame(fresh) {
  initAudio();
  $('titlescreen').classList.add('hidden');
  $('endscreen').classList.add('hidden');
  $('pausescreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  state.phase = 'playing';
  if (fresh) {
    resetStory();
  } else {
    // continue from a save, or from mission 1 with cash 0
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        state.cash = s.cash || 0;
        state.player.x = s.x ?? -210;
        state.player.z = s.z ?? 60;
        state.player.heading = Math.PI / 2;
        state.health = 100;
        state.wanted = 0;
        startMission(s.missionIndex || 0);
      } else {
        resetStory();
      }
    } catch (e) {
      resetStory();
    }
  }
  lockPointer($('game'));
}

function resumeGame() {
  $('pausescreen').classList.add('hidden');
  state.phase = 'playing';
  lockPointer($('game'));
}

function pauseGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  saveGame(true);
  $('pausescreen').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function respawn() {
  $('endscreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  const p = state.player;
  p.inCar = null;
  p.x = -30; p.z = -210; p.y = 0; p.vy = 0;
  p.heading = Math.PI;
  state.health = 100;
  state.wanted = 0;
  state.wantedHeat = 0;
  state.bustTimer = 0;
  state.finePaid = false;
  for (const c of state.police) c.kind = 'traffic';
  state.police = [];
  for (const e of state.enemies) { e.dead = true; e.group.visible = false; }
  state.phase = 'playing';
  startMission(state.missionIndex);
  saveGame(true);
}

function saveGame(silent) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      missionIndex: state.missionIndex,
      cash: state.cash,
      x: state.player.x,
      z: state.player.z,
    }));
    if (!silent) showToast('Game saved.');
  } catch (e) { /* no storage */ }
}

// ---------------- screenshot staging ----------------
function stageShot(name) {
  const p = state.player;
  if (name === 'drive') {
    // courier delivery, mid-drive through downtown
    startMission(1);
    state.missionStep = 1;
    state.missionTimer = 88;
    setObjective('Job 2 — Courier', 'Deliver the package to the pier — 100 seconds!', 'Cut across town. Watch the timer.');
    const car = nearestStealableCar(500);
    if (car) {
      car.x = -60; car.z = 34.2; car.heading = Math.PI / 2;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
      enterCarSilent(car);
      car.speed = 16;
    }
    state.input.fwd = true; // keep the car rolling for the shot
    state.camera.yaw = Math.PI / 2;
    state.camera.pitch = 0.3;
  } else if (name === 'chase') {
    // 3-star chase through the avenues
    startMission(2);
    state.missionStep = 0;
    state.missionTimer = 42;
    setObjective('Job 3 — Heat', 'Lose the cops — survive 60 seconds!', 'Keep moving. Break line of sight and the heat fades.');
    const car = nearestStealableCar(500);
    if (car) {
      car.x = 0; car.z = 34.2; car.heading = Math.PI / 2;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
      enterCarSilent(car);
      car.speed = 22;
    }
    state.wanted = 3;
    state.wantedHeat = 1;
    state.lastCrimeAt = state.time;
    state.input.fwd = true; // keep the car rolling for the shot
    // flank the player slightly ahead so the pursuit reads in the frame
    // (police behind the player would sit behind the camera)
    const flank = [
      { dx: 12, z: 25.8 },
      { dx: 6, z: 42.6 },
    ];
    state.police.forEach((pc, i) => {
      const f = flank[i % flank.length];
      pc.x = (car ? car.x : 0) + f.dx;
      pc.z = f.z;
      pc.axis = 'x'; pc.dir = 1; pc.street = 30; pc.lane = pc.z - 30;
      pc.heading = Math.PI / 2;
      pc.speed = 22;
      pc.nextCross = 90;
      pc.group.position.set(pc.x, 0, pc.z);
      pc.group.rotation.y = pc.heading;
    });
    state.camera.yaw = Math.PI / 2;
    state.camera.pitch = 0.34;
  } else if (name === 'mission') {
    // street war: Rook on foot, Vultures in the plaza — off the street
    // centre line so the camera does not stare straight down the dashes
    startMission(3);
    p.x = -22; p.z = 102; p.y = 0;
    p.heading = Math.PI; // face north, toward the plaza
    state.camera.yaw = Math.PI;
    state.camera.pitch = 0.12;
    // Rook is mid-firefight for the shot: tracers and muzzle flashes
    // in frame, and the crosshair reads as combat, not a stroll
    state.input.shooting = true;
  }
}

function enterCarSilent(car) {
  const p = state.player;
  p.inCar = car;
  car.kind = 'player';
  car.speed = 0;
  state.carsStolen += 1;
}

// ---------------- camera ----------------
function updateCamera(dt) {
  const p = state.player;
  const cam = state.camera;
  if (p.inCar) {
    // chase cam drifts behind the car; mouse can look around briefly
    cam.yaw = angleLerp(cam.yaw, p.inCar.heading, Math.min(1, dt * 1.6));
    cam.dist = 11;
  } else {
    cam.dist = 8;
  }
  const cp = clamp(cam.pitch, -0.15, 0.9);
  const horiz = cam.dist * Math.cos(cp);
  const height = 1.8 + cam.dist * Math.sin(cp);
  const fx = Math.sin(cam.yaw);
  const fz = Math.cos(cam.yaw);
  let cx = p.x - fx * horiz;
  let cz = p.z - fz * horiz;
  let cy = p.y + height;
  // pull the camera in if a building is in the way
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const sx = p.x + (cx - p.x) * t;
    const sz = p.z + (cz - p.z) * t;
    const sy = p.y + 1.6 + (cy - (p.y + 1.6)) * t;
    let blocked = false;
    for (const b of state.buildings) {
      if (sx > b.minX - 0.4 && sx < b.maxX + 0.4 && sz > b.minZ - 0.4 && sz < b.maxZ + 0.4 && sy < b.h) { blocked = true; break; }
    }
    if (blocked) {
      const back = Math.max(2.5, cam.dist * (t - 1 / steps));
      cx = p.x - fx * back * Math.cos(cp);
      cz = p.z - fz * back * Math.cos(cp);
      cy = p.y + 1.8 + back * Math.sin(cp);
      break;
    }
  }
  camera.position.set(cx, cy, cz);
  camera.lookAt(p.x + fx * 3, p.y + 1.7, p.z + fz * 3);
}

// ---------------- tracers ----------------
function updateTracers() {
  while (tracerGroup.children.length > 0) tracerGroup.remove(tracerGroup.children[0]);
  const now = state.time;
  for (const s of state.shots) {
    const age = now - s.at;
    if (age > 0.14) continue;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(s.from.x, s.from.y, s.from.z),
      new THREE.Vector3(s.to.x, s.to.y, s.to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: s.player ? 0xffe08a : 0xff6a5a, transparent: true, opacity: 1 - age / 0.14 });
    tracerGroup.add(new THREE.Line(geo, mat));
  }
  state.shots = state.shots.filter((s) => now - s.at <= 0.14);
}

// ---------------- main loop ----------------
let lastNow = performance.now();
function tick(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
  lastNow = now;

  if (state.phase === 'playing') {
    state.time += dt;
    const p = state.player;
    if (p.inCar) updatePlayerCar(dt);
    else updatePlayerOnFoot(dt, playerMesh);
    playerMesh.visible = !p.inCar;
    updateTraffic(dt);
    updatePeds(dt);
    updateEnemies(dt);
    updateWanted(dt);
    updateMissions(dt);
    if (state.input.shooting && !p.inCar) playerShoot(camera);
    // beacon follows the active mission marker
    const mk = activeMarker();
    if (mk) {
      beacon.visible = true;
      beacon.position.set(mk.x, 0, mk.z);
      beaconGem.position.y = 5 + Math.sin(state.time * 3) * 0.8;
      beaconGem.rotation.y = state.time * 2;
    } else {
      beacon.visible = false;
    }
    updateTracers();
    updateAudio(p.inCar ? Math.abs(p.inCar.speed) / 40 : p.speed / 10, state.police.length > 0);
    updateHUD();
    drawMinimap();
    // end screens
    if (state.phase === 'busted') showEnd('BUSTED', 'The SBPD hauled you in. You lost $100 in fines and the heat — but Dante still wants his jobs done.');
    else if (state.phase === 'wasted') showEnd('WASTED', 'Solmar Bay chewed you up. The hospital patched you up; the jobs are still waiting.');
    else if (state.phase === 'complete') showEnd('STORY COMPLETE', 'Five jobs. The bank. The escape. Dante Voss tears up the $50,000 marker — Solmar Bay is yours now, Rook. Free roam: keep driving.');
  } else if (state.phase === 'title') {
    // slow orbit around downtown for the title backdrop — closer and
    // lower than before, so the towers and billboards fill the frame
    state.time += dt;
    const t = state.time * 0.05;
    camera.position.set(Math.sin(t) * 170, 70, Math.cos(t) * 170);
    camera.lookAt(0, 10, 0);
  }

  if ((state.phase === 'busted' || state.phase === 'wasted') && !state.finePaid) {
    state.finePaid = true;
    state.cash = Math.max(0, state.cash - 100);
  }

  if (state.phase !== 'title') updateCamera(dt);
  renderer.render(scene, camera);

  // screenshot staging: signal readiness after the scene has settled
  if (state.shot && !shotStaged && shotReadyAt > 0 && state.time >= shotReadyAt) {
    shotStaged = true;
    window.__shotReady = true;
  }
}

function showEnd(title, text) {
  $('endtitle').textContent = title;
  $('endtext').textContent = text;
  $('endscreen').classList.remove('hidden');
  $('retrybtn').textContent = state.phase === 'complete' ? 'FREE ROAM' : 'BACK ON THE STREET';
  if (document.pointerLockElement) document.exitPointerLock();
}

init();
