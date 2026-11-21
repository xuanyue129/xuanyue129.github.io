const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

class MockAudio {
  constructor() {
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.volume = 1;
    this.playCalls = [];
    this.listeners = {};
  }
  setAttribute() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  load() {}
  pause() { this.paused = true; }
  play() {
    this.playCalls.push(this.currentTime);
    this.paused = false;
    return Promise.resolve();
  }
}

(async () => {
  const audioElement = new MockAudio();
  const document = { hidden: false, addEventListener() {} };
  const window = {
    Audio: function Audio() { return audioElement; },
    fetch: async () => ({ ok: true, blob: async () => ({}) }),
    URL: { createObjectURL: () => 'blob:mock-bgm' },
    document,
    console,
    Promise,
    Map
  };
  const context = vm.createContext({ window, document, console, Promise, Map });
  vm.runInContext(fs.readFileSync('js/audio.js', 'utf8'), context, { filename: 'js/audio.js' });
  const api = window.FantasySurvivor.Audio;
  await api.preloadMusic();
  await api.unlock();
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(audioElement.paused, false, 'menu BGM should be playing after unlock');

  // 普通战斗停止 BGM，但保留原播放进度；首只 Boss 入场必须从 0 秒重播。
  audioElement.currentTime = 47.5;
  await api.setScene('combat');
  assert.strictEqual(audioElement.paused, true, 'combat scene should pause BGM');
  await api.restartMusicFromBeginning();
  await api.setScene('boss');
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(audioElement.currentTime, 0, 'first boss BGM must reset to the beginning');
  assert.strictEqual(audioElement.playCalls.at(-1), 0, 'play() must be invoked at time zero');

  // 后续 Boss/首 Boss 击败后的场景切换不应再次强制归零。
  audioElement.currentTime = 31;
  const playsBefore = audioElement.playCalls.length;
  await api.setScene('postBoss');
  assert.strictEqual(audioElement.currentTime, 31, 'post-boss scene should preserve current playback position');
  assert.strictEqual(audioElement.playCalls.length, playsBefore, 'post-boss transition should not restart playing music');

  console.log('PASS first Boss resets BGM to 0:00');
  console.log('PASS later post-Boss scene preserves playback position');
  console.log('PASS audio.js runtime behavior');
})().catch(error => {
  console.error('FAIL Stage 6.15 BGM checks:', error);
  process.exit(1);
});
