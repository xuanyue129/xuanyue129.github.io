const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const stored = new Map();

class FakeAudio {
  static instances = [];
  constructor(src) { FakeAudio.instances.push(this); this.src = src; this.loop = false; this.preload = ''; this.volume = 1; this.paused = true; this.ended = false; this.playCount = 0; this.handlers = {}; }
  setAttribute() {}
  addEventListener(name, fn) { this.handlers[name] = fn; }
  play() { this.playCount += 1; this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
class FakeParam {
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); this.type = 'sine'; this.started = false; this.stopped = false; }
  connect() {}
  start() { this.started = true; }
  stop() { this.stopped = true; }
}
class FakeAudioContext {
  static instances = [];
  constructor() { FakeAudioContext.instances.push(this); this.state = 'running'; this.currentTime = 1; this.destination = {}; this.oscillators = []; }
  createOscillator() { const node = new FakeNode(); this.oscillators.push(node); return node; }
  createGain() { return new FakeNode(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
const listeners = {};
const fakeDocument = { hidden: false, baseURI: 'https://example.test/game/', addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {} };
const fakeWindow = {
  Audio: FakeAudio,
  AudioContext: FakeAudioContext,
  fetch() { return Promise.resolve({ ok:true, blob() { return Promise.resolve({ size:5000000 }); } }); },
  URL: { createObjectURL() { return 'blob:audio-test'; } },
  addEventListener() {},
  localStorage: { getItem(k) { return stored.get(k) ?? null; }, setItem(k,v) { stored.set(k,v); }, removeItem(k) { stored.delete(k); } }
};
const sandbox = { window: fakeWindow, document: fakeDocument, console, Date, Math, JSON, Map, Set, Number, String, Object, Array, Promise };
vm.createContext(sandbox);
for (const file of ['js/save.js', 'js/audio.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const app = fakeWindow.FantasySurvivor;

// 1. Existing V4 saves migrate to V8 without losing their volume or joystick position.
const migrated = app.Save.normalize({
  version: 4, gold: 1234,
  settings: { masterVolume: 42, joystickPosition: { x: 0.55, y: 0.63 } }
});
if (migrated.version !== 8 || migrated.gold !== 1234) throw new Error('V4 save migration lost data or failed to bump version');
if (migrated.settings.masterVolume !== 42 || migrated.settings.bgmVolume !== 15 || migrated.settings.sfxVolume !== 100 || migrated.settings.audioEnabled !== true) {
  throw new Error('V4 audio settings migration defaults incorrect');
}
if (migrated.settings.joystickPosition.x !== 0.55) throw new Error('V4 joystick setting was not preserved');

// 2. One shared looped track is started from unlock gesture using the requested relative path.
const audio = app.Audio;
if (audio.getMusicSource() !== './assets/audio/bgm1.mp3') throw new Error('BGM relative source path incorrect');
const bgmElement = FakeAudio.instances[0];
if (!bgmElement || bgmElement.loop !== true || bgmElement.preload !== 'none') throw new Error('BGM preload gate was not initialized');

(async () => {
// 2. One shared looped track starts from the unlock gesture after preload.
await audio.unlock();
if (bgmElement.playCount !== 1 || bgmElement.paused) throw new Error('unlock did not start BGM');

// 3. Master and BGM channels combine, and global mute pauses the same audio element.
audio.setMasterVolume(0.5);
audio.setBgmVolume(0.4);
if (Math.abs(bgmElement.volume - 0.2) > 0.0001) throw new Error(`BGM volume mix incorrect: ${bgmElement.volume}`);
audio.setEnabled(false);
if (!bgmElement.paused || bgmElement.volume !== 0 || audio.playSfx('playerHit') !== false) throw new Error('global mute did not disable music and SFX');
audio.setEnabled(true);
await audio.startMusic();
if (bgmElement.paused) throw new Error('unmuting after unlock did not resume shared BGM');

// 4. Procedural sound effects use Web Audio oscillators; they need no external SFX assets.
audio.setSfxVolume(0.8);
const supportedSfx = ['ui','runStart','shoot','playerAttack','enemyHit','enemyDefeat','petCharge','summonSpawn','summonAttack','vortexSpawn','fortuneActivate','coin','expPickup','levelUp','upgrade','upgradeConfirm','playerHit','bossAppear','bossCharge','bossBarrier','bossSummon','bossDefeat','gameOver'];
for (const name of supportedSfx) {
  if (!audio.playSfx(name)) throw new Error(`procedural SFX did not play: ${name}`);
}
const audioContext = FakeAudioContext.instances[0];
if (!audioContext || audioContext.oscillators.length < supportedSfx.length) throw new Error('SFX oscillator nodes were not created');

// 5. Markup, saved controls, and gameplay hooks are wired.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
const save = fs.readFileSync(path.join(root, 'js/save.js'), 'utf8');
const requiredIds = ['bgmVolumeInput','bgmVolumeOutput','sfxVolumeInput','sfxVolumeOutput','audioEnabledInput'];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`) || !ui.includes(`"${id}"`)) throw new Error(`audio setting control missing: ${id}`);
}
if (!ui.includes('Audio.unlock()') || !ui.includes('setBgmVolume') || !ui.includes('setSfxVolume') || !ui.includes('setEnabled')) throw new Error('UI audio wiring incomplete');
if (!game.includes('playSfx("playerAttack")') || !game.includes('playSfx("playerHit")') || !game.includes('playSfx("bossAppear")') || !game.includes('playSfx("bossDefeat")')) throw new Error('gameplay SFX hooks missing');
if (!save.includes('const VERSION = 8') || !save.includes('bgmVolume: clamp') || !save.includes('audioEnabled: s.audioEnabled !== false')) throw new Error('audio settings schema V8 incomplete');
if (!fs.existsSync(path.join(root, 'assets/audio/README.md'))) throw new Error('BGM asset placement instructions missing');
if (fs.existsSync(path.join(root, 'assets/audio/bgm1.mp3'))) throw new Error('unexpected bundled MP3: supplied local file was not part of current chat upload');
console.log('STAGE6.11 AUDIO REGRESSION TESTS PASSED: V4->V8 migration, asynchronous BGM preload gate, looped shared track, volume mixing/mute, procedural WebAudio SFX and gameplay hooks verified. NOTE: place the user-supplied bgm1.mp3 at assets/audio/bgm1.mp3 before deployment.');
})().catch(error => { console.error(error); process.exitCode = 1; });
