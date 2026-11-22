// SOLMAR HEAT — the city of Solmar Bay: ground, streets, buildings, lamps,
// palms, beach and water. Everything procedural; no downloaded assets.
// Exports buildCity(scene) which fills state.buildings with collision boxes
// and returns useful spawn points.
import * as THREE from 'three';
import { CITY, state, rand, randInt, pick, mulberry32 } from './config.js';

const PALETTE = [0xe8dcc8, 0xd8c2a8, 0xc9d6e2, 0xe2b8a0, 0xf2ead8, 0xb8c8d8, 0xd8a8a0, 0xc8d8c0];
const GLASS = [0x9fc4e8, 0x7fb2d9, 0xa8c8e0];

function groundTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const world = CITY.half * 2 + 120; // texture covers -330..330
  const toPx = (v) => ((v + world / 2) / world) * S;
  // base: warm sand/grass
  g.fillStyle = '#b59a6a'; g.fillRect(0, 0, S, S);
  // beach + water on the south edge (z > 270)
  g.fillStyle = '#e8d9a8'; g.fillRect(0, toPx(270), S, toPx(300) - toPx(270));
  g.fillStyle = '#2f7fc4'; g.fillRect(0, toPx(300), S, S - toPx(300));
  g.fillStyle = '#5aa8dd';
  for (let i = 0; i < 40; i += 1) {
    const y = toPx(305 + Math.random() * 20);
    g.fillRect(toPx(-330 + Math.random() * 660), y, 30 + Math.random() * 60, 2);
  }
  // blocks
  const pitch = CITY.pitch;
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const x0 = -CITY.half + bx * pitch + CITY.street / 2;
      const z0 = -CITY.half + bz * pitch + CITY.street / 2;
      g.fillStyle = '#8a8f96';
      g.fillRect(toPx(x0), toPx(z0), toPx(x0 + CITY.blockSize) - toPx(x0), toPx(z0 + CITY.blockSize) - toPx(z0));
      // sidewalk rim
      g.fillStyle = '#b9bec4';
      g.fillRect(toPx(x0 + 1.5), toPx(z0 + 1.5), toPx(x0 + CITY.blockSize - 1.5) - toPx(x0 + 1.5), toPx(z0 + CITY.blockSize - 1.5) - toPx(z0 + 1.5));
      g.fillStyle = '#9aa0a8';
      g.fillRect(toPx(x0 + 3), toPx(z0 + 3), toPx(x0 + CITY.blockSize - 3) - toPx(x0 + 3), toPx(z0 + CITY.blockSize - 3) - toPx(z0 + 3));
    }
  }
  // streets: dark asphalt with centre dashes and crosswalks
  g.fillStyle = '#3a3f46';
  const centers = [];
  for (let i = 0; i <= CITY.blocks; i += 1) centers.push(-CITY.half + i * pitch);
  for (const cx of centers) {
    g.fillRect(toPx(cx - CITY.street / 2), 0, toPx(cx + CITY.street / 2) - toPx(cx - CITY.street / 2), toPx(270));
    g.fillRect(0, toPx(cx - CITY.street / 2), toPx(270), toPx(cx + CITY.street / 2) - toPx(cx - CITY.street / 2));
  }
  // centre dashes
  g.fillStyle = '#e8d34d';
  for (const cx of centers) {
    for (let v = -CITY.half; v < CITY.half; v += 12) {
      g.fillRect(toPx(cx) - 1, toPx(v), 2, 5);
      g.fillRect(toPx(v), toPx(cx) - 1, 5, 2);
    }
  }
  // crosswalk stripes at every intersection
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const cx of centers) {
    for (const cz of centers) {
      for (let k = -2; k <= 2; k += 1) {
        g.fillRect(toPx(cx - 6 + k * 2.4), toPx(cz - 9), 1.4, 3);
        g.fillRect(toPx(cx - 6 + k * 2.4), toPx(cz + 6), 1.4, 3);
        g.fillRect(toPx(cx - 9), toPx(cz - 6 + k * 2.4), 3, 1.4);
        g.fillRect(toPx(cx + 6), toPx(cz - 6 + k * 2.4), 3, 1.4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      g.fillStyle = Math.random() < lit ? '#ffe9a8' : '#2c3846';
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  // golden-hour gradient sky: amber horizon melting into dusk blue.
  // Rendered as an equirect background, so the title orbit and every
  // screenshot sit under the same sunset instead of a flat blue.
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#5f8fd0');
  grad.addColorStop(0.42, '#9fc0e4');
  grad.addColorStop(0.55, '#f7c98a');
  grad.addColorStop(0.66, '#ff9a5c');
  grad.addColorStop(0.75, '#e8b98a');
  grad.addColorStop(1, '#3a5a7a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  // low sun glow on the horizon
  const glow = g.createRadialGradient(760, 330, 8, 760, 330, 180);
  glow.addColorStop(0, 'rgba(255,236,180,0.95)');
  glow.addColorStop(0.35, 'rgba(255,190,110,0.55)');
  glow.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1024, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function billboardTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 192);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(8, 8, 496, 176);
  g.fillStyle = fg;
  g.font = 'bold 64px Arial';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(20261119);
  // neon billboards for the downtown towers, first three only
  const BILLBOARDS = [
    ['SOLMAR BAY', '#101c3a', '#ffd34d'],
    ['★ CASINO ★', '#3a0a2e', '#ff6bd8'],
    ['HEAT', '#7a1010', '#ffe9a8'],
  ];
  let billboardIdx = 0;
  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(660, 660),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);

  // buildings: 1-3 per block, varied heights, window textures
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = [];
  for (const col of PALETTE) {
    mats.push(new THREE.MeshLambertMaterial({
      map: windowTexture('#' + col.toString(16).padStart(6, '0'), 0.35),
    }));
  }
  const glassMat = new THREE.MeshLambertMaterial({
    map: windowTexture('#5a7a96', 0.55),
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4440 });
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  state.buildings = [];
  const pitch = CITY.pitch;
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const x0 = -CITY.half + bx * pitch + CITY.street / 2 + 2;
      const z0 = -CITY.half + bz * pitch + CITY.street / 2 + 2;
      const n = 1 + Math.floor(rng() * 3);
      const cx = x0 + CITY.blockSize / 2;
      const cz = z0 + CITY.blockSize / 2;
      // a taller landmark tower near the centre
      const central = Math.abs(bx - 4) <= 1 && Math.abs(bz - 4) <= 1;
      for (let k = 0; k < n; k += 1) {
        const w = 12 + rng() * 14;
        const d = 12 + rng() * 14;
        const h = central && k === 0 ? 55 + rng() * 45 : 10 + rng() * (rng() < 0.25 ? 42 : 20);
        const px = cx + (k === 0 ? 0 : (rng() - 0.5) * (CITY.blockSize - w - 4));
        const pz = cz + (k === 0 ? 0 : (rng() - 0.5) * (CITY.blockSize - d - 4));
        const mat = rng() < 0.2 ? glassMat : mats[Math.floor(rng() * mats.length)];
        const m = new THREE.Mesh(boxGeo, mat);
        m.scale.set(w, h, d);
        m.position.set(px, h / 2, pz);
        scene.add(m);
        state.buildingsMeshes.push(m);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.scale.set(w * 0.7, 1.2, d * 0.7);
        roof.position.set(px, h + 0.6, pz);
        scene.add(roof);
        // rooftop AC unit on about half the roofs: the skyline reads
        // lived-in from the title orbit instead of flat grey slabs
        if (rng() < 0.5) {
          const ac = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x9aa2a8 }));
          ac.scale.set(2.6, 1.1, 2.2);
          ac.position.set(px + w * 0.2, h + 1.7, pz - d * 0.18);
          scene.add(ac);
        }
        // one neon billboard per downtown landmark tower, facing the avenue
        if (central && k === 0 && billboardIdx < BILLBOARDS.length) {
          const [text, bg, fg] = BILLBOARDS[billboardIdx];
          billboardIdx += 1;
          const board = new THREE.Mesh(
            new THREE.PlaneGeometry(18, 6.75),
            new THREE.MeshBasicMaterial({ map: billboardTexture(text, bg, fg), side: THREE.DoubleSide }),
          );
          board.position.set(px, h - 5, pz + d / 2 + 0.3);
          scene.add(board);
        }
        state.buildings.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2, h });
      }
    }
  }

  // street lamps along the avenues
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.9 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const centers = [];
  for (let i = 0; i <= CITY.blocks; i += 1) centers.push(-CITY.half + i * pitch);
  for (const cx of centers) {
    for (let v = -CITY.half + 30; v < CITY.half; v += 60) {
      for (const [lx, lz] of [[cx + 7.4, v], [cx - 7.4, v + 30]]) {
        if (lz > CITY.half) continue;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx, 3, lz);
        scene.add(pole);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(lx, 6.2, lz);
        scene.add(lamp);
      }
    }
  }

  // palm trees along the beach front and a few in plazas
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 2.2, 6);
  function palm(x, z) {
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 3.5, z);
    t.rotation.z = (rng() - 0.5) * 0.15;
    scene.add(t);
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(x, 7.6, z);
    scene.add(l);
  }
  for (let x = -CITY.half + 10; x <= CITY.half; x += 30) palm(x, 282);
  for (let i = 0; i < 14; i += 1) palm(rand(-260, 260), rand(-260, 260));

  // traffic lights at the four central intersections
  const lightPoleMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xff2020, emissiveIntensity: 0.8 });
  const greenMat = new THREE.MeshLambertMaterial({ color: 0x2aff66, emissive: 0x20ff55, emissiveIntensity: 0.8 });
  for (const [ix, iz] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), lightPoleMat);
    pole.position.set(ix + 8.5, 3.5, iz + 8.5);
    scene.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), lightPoleMat);
    box.position.set(ix + 8.5, 7.2, iz + 8.5);
    scene.add(box);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), (ix + iz) % 2 === 0 ? greenMat : redMat);
    dot.position.set(ix + 8.5, 7.7, iz + 8.9);
    scene.add(dot);
  }

  // sun + sky: low golden-hour sun, warm haze on the horizon
  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.1);
  sun.position.set(260, 140, 80);
  scene.add(sun);
  scene.fog = new THREE.Fog(0xe8c49a, 320, 720);
  scene.background = skyTexture();

  return {
    // handy spawn points, all on streets
    garage: { x: -210, z: 30 },
    bank: { x: 30, z: -30 },
    safehouse: { x: 210, z: 210 },
    plaza: { x: -30, z: 90 },
    hospital: { x: -30, z: -210 },
    pier: { x: 90, z: 285 },
  };
}

// Circle (x,z,r) vs building AABBs: push out, return the push vector.
export function collideBuildings(x, z, r) {
  let px = x;
  let pz = z;
  let hit = false;
  for (const b of state.buildings) {
    const cx = Math.max(b.minX, Math.min(px, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
    const dx = px - cx;
    const dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        px = cx + (dx / d) * r;
        pz = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = px - b.minX; const pr = b.maxX - px;
        const pt = pz - b.minZ; const pb = b.maxZ - pz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) px = b.minX - r;
        else if (m === pr) px = b.maxX + r;
        else if (m === pt) pz = b.minZ - r;
        else pz = b.maxZ + r;
      }
    }
  }
  return { x: px, z: pz, hit };
}

export function clampToCity(x, z) {
  return {
    x: Math.max(-CITY.half - 6, Math.min(CITY.half + 6, x)),
    z: Math.max(-CITY.half - 6, Math.min(296, z)),
  };
}
