// SOLMAR HEAT — the story: five jobs for the fixer Dante Voss.
// Each mission is a list of steps; a step has a marker, a check, and an
// on-enter hook. Failing (busted/wasted) restarts the current mission.
import { state, setObjective, showToast, dist2 } from './config.js';
import { addWanted, spawnEnemies, nearestStealableCar } from './entities.js';
import { sfxMissionDone, sfxPickup } from './audio.js';

export const MISSIONS = [
  {
    name: 'Job 1 — Wheels',
    reward: 300,
    intro: 'Dante Voss: "First rule of this town, Rook — never walk when you can drive. Get yourself some wheels."',
    steps: [
      {
        text: 'Steal a car (walk up to one and press E)',
        hint: 'Any parked or traffic car will do. The law will notice.',
        marker: () => {
          const c = nearestStealableCar(500);
          return c ? { x: c.x, z: c.z } : { x: -210, z: 30 };
        },
        check: () => !!state.player.inCar,
      },
      {
        text: 'Drive the car to the garage',
        hint: 'Follow the yellow marker on the minimap.',
        marker: () => ({ x: -210, z: 30 }),
        check: () => state.player.inCar && dist2(state.player.x, state.player.z, -210, 30) < 9 * 9,
      },
    ],
  },
  {
    name: 'Job 2 — Courier',
    reward: 500,
    intro: 'Dante Voss: "A package needs to reach the pier. Fast. No questions, no stops."',
    steps: [
      {
        text: 'Pick up the package at the plaza',
        hint: 'Walk or drive into the marker.',
        marker: () => ({ x: -30, z: 90 }),
        check: () => dist2(state.player.x, state.player.z, -30, 90) < 7 * 7,
        onEnter: () => { sfxPickup(); },
      },
      {
        text: 'Deliver the package to the pier — 100 seconds!',
        hint: 'Cut across town. Watch the timer.',
        marker: () => ({ x: 90, z: 285 }),
        timer: 100,
        check: () => dist2(state.player.x, state.player.z, 90, 285) < 8 * 8,
      },
    ],
  },
  {
    name: 'Job 3 — Heat',
    reward: 400,
    intro: 'Dante Voss: "The SBPD has your plate. Shake them. Sixty seconds, no jail."',
    steps: [
      {
        text: 'Lose the cops — survive 60 seconds!',
        hint: 'Keep moving. Break line of sight and the heat fades.',
        marker: () => ({ x: 210, z: -210 }),
        timer: 60,
        onEnter: () => { addWanted(2, 'The SBPD is on you!'); },
        check: () => state.missionTimer <= 0,
      },
    ],
  },
  {
    name: 'Job 4 — Street War',
    reward: 800,
    intro: 'Dante Voss: "The Vultures jumped one of my runners in the plaza. End it. All six."',
    steps: [
      {
        text: 'Take out all 6 Vultures in the plaza',
        hint: 'On foot. Click to shoot, R to reload. Use the buildings as cover.',
        marker: () => ({ x: -30, z: 90 }),
        onEnter: () => {
          const spots = [];
          for (let i = 0; i < 6; i += 1) {
            const a = (i / 6) * Math.PI * 2;
            spots.push({ x: -30 + Math.cos(a) * 18, z: 90 + Math.sin(a) * 18 });
          }
          spawnEnemies(spots);
          state.missionKillsAtStart = state.kills;
        },
        check: () => state.kills - (state.missionKillsAtStart || 0) >= 6,
      },
    ],
  },
  {
    name: 'Job 5 — The Big Score',
    reward: 1500,
    intro: 'Dante Voss: "Last one, Rook. Solmar Bay Bank. In, out, gone — and we are even."',
    steps: [
      {
        text: 'Reach the Solmar Bay Bank',
        hint: 'Downtown, by the tall towers.',
        marker: () => ({ x: 30, z: -30 }),
        check: () => dist2(state.player.x, state.player.z, 30, -30) < 9 * 9,
      },
      {
        text: 'Grab the cash!',
        hint: 'Walk into the vault marker.',
        marker: () => ({ x: 30, z: -30 }),
        onEnter: () => { /* arrives at the bank */ },
        check: () => dist2(state.player.x, state.player.z, 30, -30) < 5 * 5,
        onDone: () => {
          state.cash += 2000;
          addWanted(3, 'The alarm is screaming — $2,000 in the bag!');
        },
      },
      {
        text: 'Escape to the safehouse — lose the heat or outrun it',
        hint: 'Three stars. Drive like your life depends on it.',
        marker: () => ({ x: 210, z: 210 }),
        check: () => dist2(state.player.x, state.player.z, 210, 210) < 9 * 9,
      },
    ],
  },
];

function currentMission() { return MISSIONS[state.missionIndex]; }
function currentStep() {
  const m = currentMission();
  return m ? m.steps[state.missionStep] : null;
}

export function startMission(index) {
  state.missionIndex = index;
  state.missionStep = 0;
  state.missionTimer = -1;
  state.missionDone = false;
  const m = currentMission();
  if (!m) return;
  showToast(m.name);
  setObjective(m.name, '', '');
  startStep();
}

function startStep() {
  const step = currentStep();
  if (!step) return;
  const m = currentMission();
  state.missionTimer = step.timer ? step.timer : -1;
  setObjective(m.name, step.text, step.hint);
  if (step.onEnter) step.onEnter();
}

function completeMission() {
  const m = currentMission();
  state.cash += m.reward;
  sfxMissionDone();
  showToast(m.name + ' complete! +$' + m.reward);
  if (state.missionIndex + 1 >= MISSIONS.length) {
    state.missionDone = true;
    state.phase = 'complete';
    return;
  }
  startMission(state.missionIndex + 1);
}

export function failMissionTimer() {
  showToast('Too slow — Dante is not impressed. Try again.');
  startMission(state.missionIndex);
}

export function updateMissions(dt) {
  if (state.phase !== 'playing') return;
  const step = currentStep();
  if (!step) return;
  // timer
  if (state.missionTimer > 0) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      state.missionTimer = 0;
      if (!step.check()) {
        failMissionTimer();
        return;
      }
    }
  }
  if (step.check()) {
    if (step.onDone) step.onDone();
    state.missionStep += 1;
    if (state.missionStep >= currentMission().steps.length) {
      completeMission();
    } else {
      sfxPickup();
      startStep();
    }
  }
}

export function activeMarker() {
  const step = currentStep();
  if (!step || state.phase !== 'playing') return null;
  return step.marker();
}

export function resetStory() {
  state.cash = 0;
  state.kills = 0;
  state.wanted = 0;
  state.wantedHeat = 0;
  state.health = 100;
  state.finePaid = false;
  state.missionKillsAtStart = 0;
  for (const e of state.enemies) e.dead = true;
  startMission(0);
}
