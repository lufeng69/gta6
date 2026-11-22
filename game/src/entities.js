// SOLMAR HEAT — cars, traffic, police, pedestrians, enemies and shooting.
// All meshes are built from boxes/cylinders/spheres: no downloaded assets.
import * as THREE from 'three';
import {
  CITY, WORLD, state, clamp, rand, randInt, pick, dist2, angleLerp,
  nearestStreet, onStreet, showToast,
} from './config.js';
import { collideBuildings, clampToCity } from './city.js';
import { sfxGunshot, sfxEnemyShot, sfxCrash } from './audio.js';

const CAR_COLORS = [0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x2c3e50, 0x16a085, 0xd35400];
const CAR_NAMES = ['Comet', 'Stallion', 'Bison', 'Falcon', 'Vortex', 'Cheetah', 'Rhino', 'Mantis', 'Sultan', 'Phoenix'];
const PED_SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xfd79a8];

let sceneRef = null;
let raycaster = null;

// ---------- mesh factories ----------
function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2027 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.2), darkMat);
  cabin.position.set(0, 1.1, -0.2);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 0.7 });
  for (const hx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    h.position.set(hx, 0.62, 2.21);
    g.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xdd2222, emissive: 0xaa1111, emissiveIntensity: 0.6 });
  for (const hx of [-0.7, 0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    t.position.set(hx, 0.62, -2.21);
    g.add(t);
  }
  let lightBar = null;
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.52, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
    red.position.set(-0.32, 1.66, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 1 }));
    blue.position.set(0.32, 1.66, -0.2);
    g.add(blue);
    lightBar = { red, blue };
  }
  g.userData = { wheels, lightBar, tailMat };
  return g;
}

function makePersonMesh(shirt, pants) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.24);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.14, 0.38, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.14, 0.38, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.4, 1.12, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.4, 1.12, 0);
  g.add(legL, legR, torso, head, armL, armR);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

export function buildPlayerMesh() {
  const g = makePersonMesh(0xc0392b, 0x2c3e50);
  // Rook's gun, held in the right hand
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  );
  gun.position.set(0.4, 1.05, 0.3);
  g.add(gun);
  g.userData.gun = gun;
  return g;
}

// ---------- spawning ----------
export function initEntities(scene) {
  sceneRef = scene;
  raycaster = new THREE.Raycaster();
  // parked cars on the streets
  for (let i = 0; i < 16; i += 1) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const centers = [];
    for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
    const street = pick(centers);
    const along = rand(-CITY.half + 20, CITY.half - 20);
    const lane = pick([-1, 1]) * 4.2;
    const x = axis === 'x' ? along : street + lane;
    const z = axis === 'x' ? street + lane : along;
    spawnCar('parked', x, z, axis === 'x' ? (lane > 0 ? 0 : Math.PI) : (lane > 0 ? -Math.PI / 2 : Math.PI / 2));
  }
  // traffic
  for (let i = 0; i < 14; i += 1) spawnTrafficCar(true);
  // pedestrians
  for (let i = 0; i < 22; i += 1) spawnPed(true);
}

function spawnCar(kind, x, z, heading) {
  const color = kind === 'police' ? 0xf2f2f2 : kind === 'taxi' ? 0xf7c600 : pick(CAR_COLORS);
  const group = makeCarMesh(color, kind);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  sceneRef.add(group);
  const car = {
    kind, group, x, z, heading, speed: 0, color,
    name: kind === 'police' ? 'SBPD Interceptor' : pick(CAR_NAMES),
    axis: 'x', dir: 1, street: nearestStreet(z), lane: 4.2, nextCross: 0,
    cruise: rand(8, 12), stuck: 0, flashAt: 0, ramAt: 0,
  };
  state.cars.push(car);
  return car;
}

function spawnTrafficCar(anywhere) {
  const centers = [];
  for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const dir = Math.random() < 0.5 ? 1 : -1;
  const street = pick(centers);
  // right-hand traffic: moving +x -> lane south (+z); moving -x -> lane north
  const lane = axis === 'x' ? (dir > 0 ? 4.2 : -4.2) : (dir > 0 ? -4.2 : 4.2);
  let along;
  if (anywhere) along = rand(-CITY.half, CITY.half);
  else along = (dir > 0 ? -CITY.half - 20 : CITY.half + 20);
  const x = axis === 'x' ? along : street + lane;
  const z = axis === 'x' ? street + lane : along;
  const car = spawnCar(Math.random() < 0.12 ? 'taxi' : 'traffic', x, z, 0);
  car.axis = axis; car.dir = dir; car.street = street; car.lane = lane;
  car.heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? Math.PI : 0);
  car.speed = car.cruise;
  car.nextCross = nextCrossCoord(car);
  return car;
}

function nextCrossCoord(car) {
  const centers = [];
  for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
  const along = car.axis === 'x' ? car.x : car.z;
  for (const c of centers) {
    if (car.dir > 0 && c > along + 1) return c;
    if (car.dir < 0 && c < along - 1) return c;
  }
  return car.dir > 0 ? CITY.half + 40 : -CITY.half - 40;
}

function spawnPed(anywhere) {
  const centers = [];
  for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
  const street = pick(centers);
  const along = rand(-CITY.half, CITY.half);
  const side = pick([-1, 1]) * (CITY.street / 2 + 1.5);
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const x = axis === 'x' ? along : street + side;
  const z = axis === 'x' ? street + side : along;
  const group = makePersonMesh(pick(PED_SHIRTS), pick([0x2c3e50, 0x5d4037, 0x37474f]));
  group.position.set(x, 0, z);
  sceneRef.add(group);
  const ped = {
    group, x, z, heading: rand(0, Math.PI * 2), speed: rand(1.2, 2.2),
    axis, dir: pick([-1, 1]), street, side, fleeAt: -9, downAt: -9, walkPhase: rand(0, 6),
  };
  state.peds.push(ped);
  return ped;
}

// ---------- wanted / police ----------
export function addWanted(n, why) {
  if (state.phase !== 'playing') return;
  state.wanted = Math.min(WORLD.maxWanted, state.wanted + n);
  state.lastCrimeAt = state.time;
  state.wantedHeat = 1;
  if (why) showToast(why);
  const want = Math.min(state.wanted, 3);
  const have = state.police.length;
  for (let i = have; i < want; i += 1) spawnPoliceCar();
}

function spawnPoliceCar() {
  const p = state.player;
  // spawn on a street 60-90 m from the player
  const centers = [];
  for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
  let x; let z;
  for (let tries = 0; tries < 20; tries += 1) {
    const street = pick(centers);
    const along = rand(-CITY.half, CITY.half);
    if (Math.random() < 0.5) { x = along; z = street + 4.2; } else { x = street - 4.2; z = along; }
    if (dist2(x, z, p.x, p.z) > 60 * 60 && dist2(x, z, p.x, p.z) < 110 * 110) break;
  }
  const car = spawnCar('police', x, z, 0);
  car.axis = 'x'; car.dir = 1; car.street = nearestStreet(z); car.lane = 4.2;
  car.heading = Math.PI / 2; car.speed = 16; car.cruise = 20;
  car.nextCross = nextCrossCoord(car);
  state.police.push(car);
  return car;
}

export function updateWanted(dt) {
  // decay: no crime for 25 s and no police within 70 m -> lose a star every 10 s
  if (state.wanted > 0 && state.time - state.lastCrimeAt > 25) {
    const p = state.player;
    let near = false;
    for (const c of state.police) if (dist2(c.x, c.z, p.x, p.z) < 70 * 70) { near = true; break; }
    if (!near) {
      state.wantedHeat = Math.max(0, state.wantedHeat - dt / 10);
      if (state.wantedHeat <= 0) {
        state.wanted -= 1;
        state.wantedHeat = state.wanted > 0 ? 1 : 0;
        if (state.wanted === 0) {
          showToast('You lost the cops.');
          // police give up and drive off
          for (const c of state.police) c.kind = 'traffic';
          state.police = [];
        }
      }
    }
  }
  if (state.wanted === 0 && state.police.length > 0) {
    for (const c of state.police) c.kind = 'traffic';
    state.police = [];
  }
}

// ---------- per-frame updates ----------
function driveCarAlongStreets(car, dt, targetSpeed) {
  // move along current axis; at the next intersection pick a turn
  const along = car.axis === 'x' ? car.x : car.z;
  const arrived = car.dir > 0 ? along >= car.nextCross : along <= car.nextCross;
  if (arrived) {
    const centers = [];
    for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
    const atEdge = car.nextCross >= CITY.half + 30 || car.nextCross <= -CITY.half - 30;
    if (atEdge) {
      // turn around at the city edge
      car.dir *= -1;
      car.lane *= -1;
      car.heading += Math.PI;
    } else {
      // choose a turn: straight / left / right (police steer toward the player)
      let choice = Math.random();
      if (car.kind === 'police') {
        const p = state.player;
        const dx = p.x - car.x;
        const dz = p.z - car.z;
        const wantX = Math.abs(dx) > Math.abs(dz);
        const curAlongX = car.axis === 'x';
        if (wantX !== curAlongX) choice = 0.82; // turn onto the player's axis
        else choice = 0.1; // keep going straight
      }
      if (choice < 0.68) {
        // straight
      } else if (choice < 0.84) {
        turnCar(car, -1);
      } else {
        turnCar(car, 1);
      }
    }
    car.nextCross = nextCrossCoord(car);
  }
  // accelerate toward target speed
  car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
  const step = car.speed * dt;
  if (car.axis === 'x') car.x += car.dir * step;
  else car.z += car.dir * step;
  // lane position + heading smoothing
  const targetHeading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? Math.PI : 0);
  car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 6));
  if (car.axis === 'x') car.z = car.street + car.lane;
  else car.x = car.street + car.lane;
}

function turnCar(car, side) {
  // side -1 = left, +1 = right, relative to travel direction
  const oldAxis = car.axis;
  const oldDir = car.dir;
  car.axis = oldAxis === 'x' ? 'z' : 'x';
  // turning left from +x goes to -z; right from +x goes to +z, etc.
  let newDir;
  if (oldAxis === 'x' && oldDir > 0) newDir = side < 0 ? -1 : 1;
  else if (oldAxis === 'x' && oldDir < 0) newDir = side < 0 ? 1 : -1;
  else if (oldAxis === 'z' && oldDir > 0) newDir = side < 0 ? 1 : -1;
  else newDir = side < 0 ? -1 : 1;
  car.dir = newDir;
  const along = oldAxis === 'x' ? car.x : car.z;
  car.street = nearestStreet(along);
  car.lane = car.axis === 'x' ? (newDir > 0 ? 4.2 : -4.2) : (newDir > 0 ? -4.2 : 4.2);
  // snap onto the new street
  if (car.axis === 'x') car.z = car.street + car.lane;
  else car.x = car.street + car.lane;
}

function carAheadBlocked(car) {
  for (const o of state.cars) {
    if (o === car || o.kind === 'parked') continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 14 * 14) continue;
    // is it ahead of us?
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const dot = dx * fx + dz * fz;
    if (dot > 0 && d2 < 12 * 12) return true;
  }
  return false;
}

export function updateTraffic(dt) {
  const p = state.player;
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    const car = state.cars[i];
    if (car.kind === 'parked') continue;
    if (car === p.inCar) continue;
    if (car.kind === 'police') {
      // police chase: faster, and ram the player when close
      const d2 = dist2(car.x, car.z, p.x, p.z);
      const target = d2 < 30 * 30 ? 24 : 19;
      driveCarAlongStreets(car, dt, carAheadBlocked(car) ? Math.min(target, 8) : target);
      if (d2 < 5 * 5) {
        // ramming the player
        if (p.inCar) {
          const dx = p.x - car.x;
          const dz = p.z - car.z;
          const d = Math.sqrt(d2) || 1;
          p.inCar.x += (dx / d) * 2.2 * dt * 10;
          p.inCar.z += (dz / d) * 2.2 * dt * 10;
          if (state.time - car.ramAt > 1.2) {
            car.ramAt = state.time;
            sfxCrash();
            state.health = Math.max(1, state.health - 4);
            state.lastHurtAt = state.time;
          }
        } else if (d2 < 3.2 * 3.2) {
          // on foot: being touched by a cop starts a bust
          state.bustTimer += dt;
          if (state.bustTimer > 2.2) {
            state.phase = 'busted';
            return;
          }
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt);
      }
      // light bar flash
      const on = Math.floor(state.time * 4) % 2 === 0;
      if (car.group.userData.lightBar) {
        car.group.userData.lightBar.red.material.emissiveIntensity = on ? 2.2 : 0.15;
        car.group.userData.lightBar.blue.material.emissiveIntensity = on ? 0.15 : 2.2;
      }
    } else {
      // normal traffic
      const blocked = carAheadBlocked(car);
      driveCarAlongStreets(car, dt, blocked ? 0 : car.cruise);
    }
    // recycle far traffic back near the player
    if (car.kind === 'traffic' || car.kind === 'taxi') {
      if (dist2(car.x, car.z, p.x, p.z) > 340 * 340) {
        state.cars.splice(i, 1);
        sceneRef.remove(car.group);
        spawnTrafficCar(false);
      }
    }
    // sync mesh
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    const spin = car.speed * dt * 2.4;
    for (const w of car.group.userData.wheels) w.rotation.x += spin;
  }
  // boxed-in while driving: police adjacent and player nearly stopped -> busted
  if (p.inCar && state.wanted > 0) {
    let adjacent = 0;
    for (const c of state.police) if (dist2(c.x, c.z, p.x, p.z) < 7 * 7) adjacent += 1;
    if (adjacent >= 2 && Math.abs(p.inCar.speed) < 3) {
      state.bustTimer += dt;
      if (state.bustTimer > 4) state.phase = 'busted';
    } else {
      state.bustTimer = Math.max(0, state.bustTimer - dt);
    }
  }
}

export function updatePeds(dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.downAt > 0) {
      if (state.time - ped.downAt > 2.5) {
        // get back up elsewhere
        ped.downAt = -9;
        const spot = randomSidewalkSpot();
        ped.x = spot.x; ped.z = spot.z; ped.axis = spot.axis; ped.street = spot.street; ped.side = spot.side;
        ped.group.rotation.x = 0;
        ped.group.position.set(ped.x, 0, ped.z);
      }
      continue;
    }
    const d2 = dist2(ped.x, ped.z, p.x, p.z);
    let speed = ped.speed;
    if (state.time - ped.fleeAt < 3) speed = ped.speed * 2.4;
    else if (d2 < 12 * 12 && state.time - state.lastCrimeAt < 4) { ped.fleeAt = state.time; speed = ped.speed * 2.4; }
    // walk along the sidewalk; turn at intersections
    const along = ped.axis === 'x' ? ped.x : ped.z;
    const centers = [];
    for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
    let nextCross = ped.dir > 0 ? CITY.half + 40 : -CITY.half - 40;
    for (const c of centers) {
      if (ped.dir > 0 && c > along + 1) { nextCross = c; break; }
      if (ped.dir < 0 && c < along - 1) { nextCross = c; break; }
    }
    if ((ped.dir > 0 && along >= nextCross) || (ped.dir < 0 && along <= nextCross)) {
      if (Math.random() < 0.4) {
        // turn onto the crossing street
        ped.axis = ped.axis === 'x' ? 'z' : 'x';
        ped.street = nearestStreet(ped.axis === 'x' ? ped.z : ped.x);
        ped.side = pick([-1, 1]) * (CITY.street / 2 + 1.5);
        ped.dir = pick([-1, 1]);
      } else {
        ped.dir *= -1;
      }
    }
    const step = speed * dt * ped.dir;
    if (ped.axis === 'x') { ped.x += step; ped.z = ped.street + ped.side; }
    else { ped.z += step; ped.x = ped.street + ped.side; }
    const targetHeading = ped.axis === 'x' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? Math.PI : 0);
    ped.heading = angleLerp(ped.heading, targetHeading, Math.min(1, dt * 8));
    ped.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.group.userData.legL.rotation.x = swing;
    ped.group.userData.legR.rotation.x = -swing;
    ped.group.userData.armL.rotation.x = -swing * 0.7;
    ped.group.userData.armR.rotation.x = swing * 0.7;
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = ped.heading;
    // hit by the player's car?
    if (p.inCar && Math.abs(p.inCar.speed) > 3 && d2 < 2.6 * 2.6) {
      ped.downAt = state.time;
      ped.group.rotation.x = -Math.PI / 2;
      ped.group.position.y = 0.4;
      addWanted(1, 'You hit a pedestrian!');
    }
  }
}

function randomSidewalkSpot() {
  const centers = [];
  for (let k = 0; k <= CITY.blocks; k += 1) centers.push(-CITY.half + k * CITY.pitch);
  const street = pick(centers);
  const along = rand(-CITY.half, CITY.half);
  const side = pick([-1, 1]) * (CITY.street / 2 + 1.5);
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  return {
    x: axis === 'x' ? along : street + side,
    z: axis === 'x' ? street + side : along,
    axis, street, side,
  };
}

// ---------- enemies (rival gang) ----------
export function spawnEnemies(positions) {
  for (const pos of positions) {
    const group = makePersonMesh(0x8e44ad, 0x1a1a1a);
    group.position.set(pos.x, 0, pos.z);
    sceneRef.add(group);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    gun.position.set(0.4, 1.05, 0.3);
    group.add(gun);
    state.enemies.push({ group, x: pos.x, z: pos.z, hp: 100, heading: 0, shootAt: state.time + rand(0.5, 1.5), walkPhase: rand(0, 6), dead: false });
  }
}

export function updateEnemies(dt) {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d2 = dist2(e.x, e.z, p.x, p.z);
    const d = Math.sqrt(d2);
    if (d < 45) {
      // face and approach the player, stop at 16 m and shoot
      e.heading = angleLerp(e.heading, Math.atan2(p.x - e.x, p.z - e.z), Math.min(1, dt * 6));
      if (d > 16) {
        const step = 4.2 * dt;
        const nx = e.x + Math.sin(e.heading) * step;
        const nz = e.z + Math.cos(e.heading) * step;
        const col = collideBuildings(nx, nz, 0.6);
        e.x = col.x; e.z = col.z;
        e.walkPhase += dt * 9;
      }
      if (state.time >= e.shootAt && d < 42) {
        e.shootAt = state.time + rand(0.9, 1.7);
        sfxEnemyShot();
        // tracer flash: brief line is drawn by main.js via state.shots
        state.shots.push({ from: { x: e.x, y: 1.4, z: e.z }, to: { x: p.x, y: 1.2, z: p.z }, at: state.time });
        if (Math.random() < 0.34) {
          state.health = Math.max(0, state.health - randInt(7, 12));
          state.lastHurtAt = state.time;
          if (state.health <= 0) state.phase = 'wasted';
        }
      }
    }
    const swing = Math.sin(e.walkPhase) * 0.45;
    e.group.userData.legL.rotation.x = swing;
    e.group.userData.legR.rotation.x = -swing;
    e.group.position.set(e.x, 0, e.z);
    e.group.rotation.y = e.heading;
  }
}

// ---------- shooting ----------
export function playerShoot(camera) {
  const p = state.player;
  if (p.inCar || state.time - p.lastShotAt < 0.16) return;
  if (p.ammo <= 0) {
    if (state.time - p.reloadAt > 0.5) {
      p.reloadAt = state.time;
      p.ammo = 12;
      showToast('Reloaded.');
    }
    return;
  }
  p.lastShotAt = state.time;
  p.ammo -= 1;
  sfxGunshot();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 80;
  const targets = [];
  for (const e of state.enemies) if (!e.dead) targets.push(e.group);
  for (const b of state.buildingsMeshes || []) targets.push(b);
  const hits = raycaster.intersectObjects(targets, true);
  let end = null;
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point;
    // which enemy did we hit?
    let obj = hit.object;
    while (obj) {
      const e = state.enemies.find((en) => en.group === obj);
      if (e && !e.dead) {
        e.hp -= 34;
        state.hitAt = state.time;
        if (e.hp <= 0) {
          e.dead = true;
          e.group.visible = false;
          state.kills += 1;
          showToast('Rival down. (' + state.kills + ')');
        }
        break;
      }
      obj = obj.parent;
    }
  } else {
    end = raycaster.ray.at(80, new THREE.Vector3());
  }
  const start = camera.position.clone();
  state.shots.push({ from: { x: start.x, y: start.y, z: start.z }, to: { x: end.x, y: end.y, z: end.z }, at: state.time, player: true });
}

// ---------- player on foot ----------
export function updatePlayerOnFoot(dt, mesh) {
  const p = state.player;
  const inp = state.input;
  const moveSpeed = inp.run ? WORLD.playerRun : WORLD.playerWalk;
  let fx = 0;
  let fz = 0;
  if (inp.fwd) { fx += Math.sin(state.camera.yaw); fz += Math.cos(state.camera.yaw); }
  if (inp.back) { fx -= Math.sin(state.camera.yaw); fz -= Math.cos(state.camera.yaw); }
  if (inp.left) { fx -= Math.cos(state.camera.yaw); fz += Math.sin(state.camera.yaw); }
  if (inp.right) { fx += Math.cos(state.camera.yaw); fz -= Math.sin(state.camera.yaw); }
  const len = Math.hypot(fx, fz);
  if (len > 0.01) {
    fx /= len; fz /= len;
    const nx = p.x + fx * moveSpeed * dt;
    const nz = p.z + fz * moveSpeed * dt;
    const col = collideBuildings(nx, nz, WORLD.playerRadius);
    p.x = col.x; p.z = col.z;
    const cl = clampToCity(p.x, p.z);
    p.x = cl.x; p.z = cl.z;
    p.heading = angleLerp(p.heading, Math.atan2(fx, fz), Math.min(1, dt * 12));
    p.speed = moveSpeed;
  } else {
    p.speed = 0;
  }
  // gravity / jump
  if (inp.jump && p.onGround) { p.vy = 8; p.onGround = false; }
  p.vy -= WORLD.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  // animate
  const phase = state.time * (p.speed > 0 ? (inp.run ? 13 : 9) : 0);
  const swing = p.speed > 0 ? Math.sin(phase) * 0.55 : 0;
  mesh.userData.legL.rotation.x = swing;
  mesh.userData.legR.rotation.x = -swing;
  mesh.userData.armL.rotation.x = -swing * 0.6;
  mesh.userData.armR.rotation.x = p.armed ? -1.2 : swing * 0.6;
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.y = p.heading;
  // health regen
  if (state.time - state.lastHurtAt > 8 && state.health > 0 && state.health < 100) {
    state.health = Math.min(100, state.health + 6 * dt);
  }
}

// ---------- player driving ----------
export function updatePlayerCar(dt) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  const inp = state.input;
  const maxFwd = WORLD.carMaxFwd;
  const maxRev = WORLD.carMaxRev;
  const accel = inp.fwd ? WORLD.carAccel : inp.back ? -20 : 0;
  car.speed += accel * dt;
  car.speed -= car.speed * WORLD.carDrag * dt; // drag
  if (!inp.fwd && !inp.back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  car.speed = clamp(car.speed, -maxRev, maxFwd);
  // brake lights flare while the player holds the brake
  if (car.group.userData.tailMat) {
    car.group.userData.tailMat.emissiveIntensity = (inp.back && car.speed > 1) ? 2.4 : 0.6;
  }
  const steer = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
  const spd = Math.abs(car.speed);
  if (spd > 0.2 && steer !== 0) {
    const rate = 1.55 * clamp(spd / 14, 0.25, 1);
    car.heading += steer * rate * dt * (car.speed >= 0 ? 1 : -1);
  }
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const col = collideBuildings(nx, nz, WORLD.carRadius);
  if (col.hit && spd > 6) {
    sfxCrash();
    car.speed *= 0.35;
  }
  car.x = col.x; car.z = col.z;
  const cl = clampToCity(car.x, car.z);
  if (cl.x !== car.x || cl.z !== car.z) { car.x = cl.x; car.z = cl.z; car.speed *= 0.5; }
  // bump into other cars
  for (const o of state.cars) {
    if (o === car || o.kind === 'parked') continue;
    const d2 = dist2(car.x, car.z, o.x, o.z);
    if (d2 < 4.6 * 4.6 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (4.6 - d) / 2;
      const ux = (car.x - o.x) / d;
      const uz = (car.z - o.z) / d;
      car.x += ux * push; car.z += uz * push;
      o.x -= ux * push; o.z -= uz * push;
      if (Math.abs(car.speed) > 8) { sfxCrash(); car.speed *= 0.6; }
    }
  }
  // run over pedestrians
  for (const ped of state.peds) {
    if (ped.downAt > 0) continue;
    if (dist2(car.x, car.z, ped.x, ped.z) < 2.6 * 2.6 && Math.abs(car.speed) > 3) {
      ped.downAt = state.time;
      ped.group.rotation.x = -Math.PI / 2;
      ped.group.position.y = 0.4;
      addWanted(1, 'You hit a pedestrian!');
    }
  }
  p.x = car.x; p.z = car.z;
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  const spin = car.speed * dt * 2.4;
  for (const w of car.group.userData.wheels) w.rotation.x += spin;
  // body lean
  car.group.rotation.z = -steer * clamp(spd / 38, 0, 1) * 0.05;
}

export function nearestStealableCar(maxDist) {
  const p = state.player;
  let best = null;
  let bestD = maxDist * maxDist;
  for (const car of state.cars) {
    if (car.kind === 'police') continue;
    const d2 = dist2(car.x, car.z, p.x, p.z);
    if (d2 < bestD) { bestD = d2; best = car; }
  }
  return best;
}

export function enterCar(car) {
  const p = state.player;
  p.inCar = car;
  car.kind = 'player';
  car.speed = 0;
  state.carsStolen += 1;
  addWanted(1, 'You stole a ' + car.name + '!');
}

export function exitCar() {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  p.inCar = null;
  // step out to the side
  const sideX = car.x + Math.cos(car.heading) * 2.6;
  const sideZ = car.z - Math.sin(car.heading) * 2.6;
  const col = collideBuildings(sideX, sideZ, WORLD.playerRadius);
  p.x = col.x; p.z = col.z;
  p.heading = car.heading;
}
