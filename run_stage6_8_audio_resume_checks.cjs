const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const listeners = {};
const stored = new Map();
class FakeAudio {
  static instances = [];
  constructor(src) { FakeAudio.instances.push(this); this.src = src; this.loop = false; this.preload = ''; this.volume = 1; this.paused = true; this.ended = false; this.playCount = 0; }
  setAttribute() {}
  addEventListener() {}
  play() { this.playCount++; this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
class FakeParam { setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeNode {
  constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); }
  connect() {} start() {} stop() {}
}
class FakeAudioContext {
  static instances = [];
  constructor() { FakeAudioContext.instances.push(this); this.state = 'suspended'; this.currentTime = 1; this.destination = {}; this.oscillators = []; }
  resume() { return Promise.resolve().then(() => { this.state = 'running'; }); }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createGain() { return new FakeNode(); }
}
const fakeDocument = { hidden:false, addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {} };
const fakeWindow = {
  Audio: FakeAudio, AudioContext: FakeAudioContext, addEventListener() {},
  localStorage: { getItem(k) { return stored.get(k) ?? null; }, setItem(k,v) { stored.set(k,v); }, removeItem(k) { stored.delete(k); } }
};
const sandbox = { window:fakeWindow, document:fakeDocument, console, Date, Math, Map, Set, Number, String, Object, Array, Promise };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/audio.js'),'utf8'), sandbox, { filename:'js/audio.js' });

(async () => {
  const audio = fakeWindow.FantasySurvivor.Audio;
  audio.unlock();
  // This is the exact first-interaction race: SFX is requested while resume() is pending.
  audio.playSfx('runStart');
  audio.playSfx('playerHit');
  await Promise.resolve();
  await Promise.resolve();
  const context = FakeAudioContext.instances[0];
  if (!context || context.state !== 'running') throw new Error('AudioContext did not resume from the initial user gesture');
  if (context.oscillators.length < 4) throw new Error(`queued SFX were not replayed after resume: ${context.oscillators.length} oscillator nodes`);
  if (!FakeAudio.instances[0] || FakeAudio.instances[0].playCount !== 1) throw new Error('BGM did not start with the same unlock gesture');
  audio.testSfx();
  if (context.oscillators.length < 8) throw new Error('settings SFX test button has no audible sound pattern');
  console.log('STAGE6.9 AUDIO RESUME REGRESSION TEST PASSED: initially suspended AudioContext resumes, first-interaction sound effects are queued and replayed, BGM unlock remains functional, settings test chime creates oscillator nodes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
