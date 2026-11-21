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
    bgmVolume: 0.35,
    sfxVolume: 0.8,
    enabled: true,
    unlocked: false,
    musicRequested: false,
    scene: "menu",
    preloadPromise: null,
    sourceReady: false,
    audioContext: null,
    resumePromise: null,
    pendingSfx: [],
    lastPlayed: new Map(),
    missingBgmWarned: false
  };

  const bgmUrl = "./assets/audio/bgm1.mp3";
  const bgm = new global.Audio(bgmUrl);
  bgm.loop = true;
  bgm.preload = "auto";
  bgm.src = bgmUrl;
  // 尽早让浏览器开始读取媒体资源；同时用 fetch 将 MP3 放入 HTTP 缓存，
  // fetch 失败时仍由 HTMLAudioElement 的原始 URL 负责播放。
  function preloadMusic() {
    if (state.preloadPromise) return state.preloadPromise;
    try { bgm.load(); } catch (_) {}
    if (typeof global.fetch !== "function") return Promise.resolve(false);
    state.preloadPromise = global.fetch(bgmUrl, { cache: "force-cache", credentials: "same-origin" })
      .then(response => {
        if (!response.ok) throw new Error("BGM HTTP " + response.status);
        state.sourceReady = true;
        return response.arrayBuffer();
      })
      .then(() => true)
      .catch(error => {
        console.info("[Audio] BGM 预加载未完成，将由媒体元素继续加载。", error);
        return false;
      });
    return state.preloadPromise;
  }
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
    playerAttack: [[420, 0.10, 0, "sawtooth", 0.052, 980], [980, 0.12, 0.045, "sine", 0.045, 1480], [1480, 0.07, 0.12, "triangle", 0.025, 760]],
    enemyHit: [[260, 0.045, 0, "square", 0.023, 145]],
    enemyDefeat: [[420, 0.07, 0, "triangle", 0.035, 620], [620, 0.065, 0.045, "sine", 0.025, 780]],
    petCharge: [[340, 0.10, 0, "triangle", 0.035, 690], [690, 0.07, 0.07, "sine", 0.025, 900]],
    summonSpawn: [[520, 0.13, 0, "sine", 0.055, 780], [780, 0.19, 0.10, "triangle", 0.045, 1120]],
    summonAttack: [[1180, 0.10, 0, "sine", 0.055, 1760], [1760, 0.12, 0.045, "triangle", 0.042, 920], [920, 0.08, 0.11, "sine", 0.028, 2200]],
    vortexSpawn: [[680, 0.24, 0, "sine", 0.052, 180], [920, 0.28, 0.06, "triangle", 0.038, 260], [520, 0.32, 0.14, "sine", 0.030, 120], [260, 0.22, 0.28, "sine", 0.020, 90]],
    fortuneActivate: [[72, 0.34, 0, "sawtooth", 0.075, 42], [48, 0.42, 0.10, "triangle", 0.070, 32], [110, 0.30, 0.24, "square", 0.040, 58], [38, 0.50, 0.32, "sine", 0.055, 24]],
    coin: [[880, 0.075, 0, "sine", 0.045, 1180], [1320, 0.075, 0.045, "sine", 0.03, 1560]],
    expPickup: [[520, 0.055, 0, "sine", 0.022, 760]],
    levelUp: [[523, 0.12, 0, "sine", 0.05, 523], [659, 0.12, 0.085, "sine", 0.055, 659], [784, 0.14, 0.17, "sine", 0.06, 784], [1047, 0.22, 0.27, "sine", 0.065, 1318]],
    upgrade: [[660, 0.09, 0, "triangle", 0.045, 880], [990, 0.15, 0.075, "sine", 0.05, 1320]],
    upgradeConfirm: [[660, 0.075, 0, "triangle", 0.070, 880], [990, 0.10, 0.065, "sine", 0.060, 1320], [1320, 0.17, 0.13, "sine", 0.042, 1760]],
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

  function resumeContext() {
    const context = ensureContext();
    if (!context) return Promise.resolve(false);
    if (context.state === "running") return Promise.resolve(true);
    if (state.resumePromise) return state.resumePromise;
    if (typeof context.resume !== "function") return Promise.resolve(false);
    state.resumePromise = Promise.resolve(context.resume()).then(() => {
      state.resumePromise = null;
      if (context.state !== "running") return false;
      const queued = state.pendingSfx.splice(0);
      queued.forEach(name => playSfx(name));
      return true;
    }).catch(error => {
      state.resumePromise = null;
      console.warn("[Audio] 音效通道恢复失败。", error);
      return false;
    });
    return state.resumePromise;
  }

  function startMusic() {
    state.musicRequested = true;
    if (!state.enabled || !state.unlocked || (state.scene !== "menu" && state.scene !== "boss")) return Promise.resolve(false);
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
    resumeContext();
    // 只有主界面或 Boss 战场景才在首次手势后开始 BGM。
    if (state.scene === "menu" || state.scene === "boss") return startMusic();
    return Promise.resolve(false);
  }

  function setScene(scene) {
    state.scene = scene;
    const shouldPlay = state.enabled && state.unlocked && (scene === "menu" || scene === "boss");
    if (shouldPlay) {
      startMusic();
    } else {
      state.musicRequested = false;
      if (!bgm.paused) bgm.pause();
      // 保留播放位置，下一次进入 Boss / 主界面时自然续播，不重新请求媒体。
    }
  }

  function playSfx(name) {
    if (!state.enabled || state.sfxVolume <= 0) return false;
    const pattern = sounds[name];
    if (!pattern) return false;
    const context = ensureContext();
    if (!context) return false;
    if (!state.unlocked || context.state !== "running") {
      // 首次手势时 resume() 是异步的；把该音效暂存，在 AudioContext 真正
      // 进入 running 后立即补播，避免开局/首击/首次升级音效被直接丢弃。
      if (state.pendingSfx.length < 8 && !state.pendingSfx.includes(name)) state.pendingSfx.push(name);
      if (state.unlocked) resumeContext();
      return true;
    }

    const now = context.currentTime;
    const throttle = name === "shoot" ? 0.085
      : name === "playerAttack" ? 0.13
      : name === "summonAttack" ? 0.16
      : name === "vortexSpawn" ? 0.18
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
        gain.linearRampToValueAtTime(Math.max(0.0001, Math.min(0.85, peak * master * 1.8)), startAt + 0.008);
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
    } else if (state.unlocked && (state.scene === "menu" || state.scene === "boss")) {
      startMusic();
    }
  }

  const api = {
    unlock,
    startMusic,
    preloadMusic,
    setScene,
    getScene() { return state.scene; },
    playSfx,
    playUi() { return playSfx("ui"); },
    testSfx() { return playSfx("levelUp"); },
    setVolume(value) { state.masterVolume = clamp(value, 0.7); syncMusicVolume(); },
    setMasterVolume(value) { state.masterVolume = clamp(value, 0.7); syncMusicVolume(); },
    setBgmVolume(value) { state.bgmVolume = clamp(value, 0.35); syncMusicVolume(); },
    setSfxVolume(value) { state.sfxVolume = clamp(value, 0.8); },
    setEnabled,
    getVolume() { return state.masterVolume; },
    getBgmVolume() { return state.bgmVolume; },
    getSfxVolume() { return state.sfxVolume; },
    isEnabled() { return state.enabled; },
    isMusicPlaying() { return !bgm.paused && !bgm.ended; },
    getMusicSource() { return "./assets/audio/bgm1.mp3"; }
  };

  // 模块载入即预加载，不等待玩家点击“开始”。
  preloadMusic();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.unlocked && state.enabled && (state.scene === "menu" || state.scene === "boss") && bgm.paused) startMusic();
  });

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Audio = api;
})(window);
