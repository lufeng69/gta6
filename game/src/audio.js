// SOLMAR HEAT — all sound is synthesized with WebAudio: no audio files.
// Engine hum, sirens, gunshots, chimes and a small bassline loop.
// Nov 22 polish: gunshots vary a little shot to shot, and banking a job
// pays out with a cash-register cha-ching.
import { state } from './config.js';

let ctx = null;
let master = null;
let engineOsc = null;
let engineOsc2 = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let musicTimer = null;
let musicStep = 0;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = state.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // engine: two detuned saws through a lowpass
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(lp); engineOsc2.connect(lp);
    lp.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();
    // siren: square wave, frequency flipped by a timer in update()
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 750;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start();
    startMusic();
  } catch (e) {
    ctx = null;
  }
}

export function setMuted(m) {
  state.muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function blip(freq, dur, type, vol, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq || 1800;
  const g = ctx.createGain();
  g.gain.value = vol || 0.5;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export function sfxGunshot() { noiseBurst(0.14, 0.5, 2400); blip(140 * (0.92 + Math.random() * 0.16), 0.08, 'square', 0.18); }
export function sfxCash() { blip(1318, 0.1, 'triangle', 0.28); blip(1760, 0.22, 'triangle', 0.28, 0.08); }
export function sfxEnemyShot() { noiseBurst(0.1, 0.22, 1600); }
export function sfxPickup() { blip(880, 0.12, 'sine', 0.25); blip(1318, 0.18, 'sine', 0.25, 0.09); }
export function sfxMissionDone() {
  [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.28, i * 0.12));
}
export function sfxCrash() { noiseBurst(0.25, 0.5, 900); }
export function sfxBusted() { [392, 330, 262].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.2, i * 0.18)); }
export function sfxClick() { blip(660, 0.06, 'sine', 0.15); }

// A lazy 8-step bassline + hats loop, quiet under the game.
const BASS = [55, 0, 55, 65.4, 55, 0, 49, 58.3];
function startMusic() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx || state.muted || state.phase !== 'playing') return;
    const step = musicStep % 8;
    musicStep += 1;
    if (BASS[step]) blip(BASS[step], 0.32, 'triangle', 0.1);
    if (step % 2 === 0) noiseBurst(0.03, 0.05, 6000);
  }, 260);
}

export function updateAudio(speed01, sirenOn) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (engineGain) {
    engineGain.gain.setTargetAtTime(state.phase === 'playing' ? 0.05 + speed01 * 0.09 : 0, t, 0.1);
    engineOsc.frequency.setTargetAtTime(50 + speed01 * 110, t, 0.1);
    engineOsc2.frequency.setTargetAtTime(75 + speed01 * 160, t, 0.1);
  }
  if (sirenGain && sirenOsc) {
    if (sirenOn && state.phase === 'playing') {
      sirenGain.gain.setTargetAtTime(0.045, t, 0.1);
      sirenOsc.frequency.setTargetAtTime(Math.floor(t * 1.6) % 2 === 0 ? 720 : 980, t, 0.05);
    } else {
      sirenGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }
}
