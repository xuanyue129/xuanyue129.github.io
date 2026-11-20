/*
 * 游戏音频模块：同一首 BGM 覆盖主菜单与战斗；音效由 Web Audio API 程序合成。
 * BGM 文件请放在 ./assets/audio/bgm1.mp3。浏览器首次用户交互后启动播放。
 */
(function (global) {
  "use strict";

  const clamp = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  };

  const state = {
    masterVolume: 0.7,
    bgmVolume: 0.7,
    sfxVolume: 0.8,
    enabled: true,
    unlocked: false,
    musicRequested: false,
    audioContext: null,
    lastPlayed: new Map(),
    missingBgmWarned: false
  };

  const bgm = new global.Audio("./assets/audio/bgm1.mp3");
  bgm.loop = true;
  bgm.preload = "auto";
  bgm.setAttribute && bgm.setAttribute("playsinline", "");
  bgm.addEventListener && bgm.addEventListener("error", () => {
    if (state.missingBgmWarned) return;
    state.missingBgmWarned = true;
    console.warn("[Audio] 未能加载 ./assets/audio/bgm1.mp3。请确认 MP3 已放入 assets/audio 目录。" );
  });

  // [频率 Hz, 时长秒, 延迟秒, 波形, 峰值音量, 结束频率 Hz]
  const sounds = {
    ui: [[560, 0.055, 0, "sine", 0.045, 720]],
    runStart: [[392, 0.10, 0, "sine", 0.055, 523], [523, 0.12, 0.075, "sine", 0.06, 784]],
    shoot: [[690, 0.035, 0, "triangle", 0.022, 430]],
    enemyHit: [[260, 0.045, 0, "square", 0.023, 145]],
    enemyDefeat: [[420, 0.07, 0, "triangle", 0.035, 620], [620, 0.065, 0.045, "sine", 0.025, 780]],
    petCharge: [[340, 0.10, 0, "triangle", 0.035, 690], [690, 0.07, 0.07, "sine", 0.025, 900]],
    vortexSpawn: [[220, 0.22, 0, "sine", 0.045, 110], [440, 0.18, 0.08, "triangle", 0.025, 220]],
    coin: [[880, 0.075, 0, "sine", 0.045, 1180], [1320, 0.075, 0.045, "sine", 0.03, 1560]],
    expPickup: [[520, 0.055, 0, "sine", 0.022, 760]],
    levelUp: [[523, 0.12, 0, "sine", 0.05, 523], [659, 0.12, 0.085, "sine", 0.055, 659], [784, 0.14, 0.17, "sine", 0.06, 784], [1047, 0.22, 0.27, "sine", 0.065, 1318]],
    upgrade: [[660, 0.09, 0, "triangle", 0.045, 880], [990, 0.15, 0.075, "sine", 0.05, 1320]],
    playerHit: [[190, 0.16, 0, "sawtooth", 0.075, 74], [105, 0.19, 0.045, "triangle", 0.055, 58]],
    bossAppear: [[130, 0.38, 0, "sawtooth", 0.075, 82], [98, 0.42, 0.16, "triangle", 0.06, 55], [196, 0.20, 0.36, "sine", 0.04, 130]],
    bossCharge: [[150, 0.18, 0, "sawtooth", 0.055, 360], [560, 0.10, 0.11, "square", 0.035, 250]],
    bossBarrier: [[330, 0.12, 0, "square", 0.035, 480], [740, 0.18, 0.08, "sine", 0.04, 920]],
    bossSummon: [[180, 0.16, 0, "sawtooth", 0.05, 270], [270, 0.18, 0.12, "triangle", 0.045, 410]],
    bossDefeat: [[392, 0.12, 0, "sine", 0.04, 523], [523, 0.14, 0.10, "sine", 0.05, 659], [659, 0.18, 0.22, "sine", 0.06, 784], [1047, 0.30, 0.34, "sine", 0.065, 1318]],
    gameOver: [[260, 0.22, 0, "triangle", 0.055, 196], [196, 0.28, 0.18, "sine", 0.045, 130], [130, 0.36, 0.40, "sine", 0.04, 82]]
  };

  function syncMusicVolume() {
    bgm.volume = state.enabled ? clamp(state.masterVolume * state.bgmVolume, 0) : 0;
  }

  function ensureContext() {
    if (state.audioContext) return state.audioContext;
    const Context = global.AudioContext || global.webkitAudioContext;
    if (!Context) return null;
    try {
      state.audioContext = new Context();
      return state.audioContext;
    } catch (error) {
      console.warn("[Audio] Web Audio API 初始化失败，游戏 BGM 仍可独立播放。", error);
      return null;
    }
  }

  function startMusic() {
    state.musicRequested = true;
    if (!state.enabled || !state.unlocked) return Promise.resolve(false);
    syncMusicVolume();
    try {
      const result = bgm.play();
      if (result && typeof result.then === "function") {
        return result.then(() => true).catch(error => {
          if (!state.missingBgmWarned) {
            state.missingBgmWarned = true;
            console.warn("[Audio] BGM 尚未播放。请确认 ./assets/audio/bgm1.mp3 存在，且网页通过 HTTP(S) 访问。", error);
          }
          return false;
        });
      }
      return Promise.resolve(true);
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  function unlock() {
    state.unlocked = true;
    const context = ensureContext();
    if (context && context.state === "suspended" && typeof context.resume === "function") {
      context.resume().catch(() => {});
    }
    // 必须从用户手势回调中直接发起 play()，以满足浏览器自动播放策略。
    return startMusic();
  }

  function playSfx(name) {
    if (!state.enabled || state.sfxVolume <= 0) return false;
    const pattern = sounds[name];
    if (!pattern) return false;
    const context = ensureContext();
    if (!context || context.state === "suspended") {
      if (context && typeof context.resume === "function") context.resume().catch(() => {});
      return false;
    }

    const now = context.currentTime;
    const throttle = name === "shoot" ? 0.085
      : name === "enemyHit" ? 0.075
      : name === "enemyDefeat" ? 0.06
      : name === "coin" ? 0.09
      : name === "expPickup" ? 0.09 : 0;
    const previous = state.lastPlayed.has(name) ? state.lastPlayed.get(name) : -Infinity;
    if (throttle && now - previous < throttle) return false;
    state.lastPlayed.set(name, now);

    const master = state.masterVolume * state.sfxVolume;
    try {
      pattern.forEach(([frequency, duration, delay, wave, peak, endFrequency]) => {
        const startAt = now + delay;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, startAt);
        if (endFrequency && oscillator.frequency.exponentialRampToValueAtTime) {
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startAt + duration);
        }
        const gain = envelope.gain;
        gain.setValueAtTime(0.0001, startAt);
        gain.linearRampToValueAtTime(Math.max(0.0001, peak * master), startAt + 0.008);
        gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        oscillator.connect(envelope);
        envelope.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration + 0.015);
      });
      return true;
    } catch (error) {
      console.warn("[Audio] 音效播放失败：", name, error);
      return false;
    }
  }

  function setEnabled(value) {
    state.enabled = Boolean(value);
    syncMusicVolume();
    if (!state.enabled) {
      bgm.pause();
    } else if (state.unlocked && state.musicRequested) {
      startMusic();
    }
  }

  const api = {
    unlock,
    startMusic,
    playSfx,
    playUi() { return playSfx("ui"); },
    setVolume(value) { state.masterVolume = clamp(value, 0.7); syncMusicVolume(); },
    setMasterVolume(value) { state.masterVolume = clamp(value, 0.7); syncMusicVolume(); },
    setBgmVolume(value) { state.bgmVolume = clamp(value, 0.7); syncMusicVolume(); },
    setSfxVolume(value) { state.sfxVolume = clamp(value, 0.8); },
    setEnabled,
    getVolume() { return state.masterVolume; },
    getBgmVolume() { return state.bgmVolume; },
    getSfxVolume() { return state.sfxVolume; },
    isEnabled() { return state.enabled; },
    isMusicPlaying() { return !bgm.paused && !bgm.ended; },
    getMusicSource() { return "./assets/audio/bgm1.mp3"; }
  };

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.unlocked && state.musicRequested && state.enabled && bgm.paused) startMusic();
  });

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Audio = api;
})(window);
