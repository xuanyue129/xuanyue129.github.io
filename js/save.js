/* 阶段6存档：版本迁移、备份、自动保存与离线收益结算。 */
(function (global) {
  "use strict";
  const STORAGE_KEY = "fantasy-survivor-save-v1";
  const BACKUP_KEY = "fantasy-survivor-save-backup-v1";
  const VERSION = 8;
  const OFFLINE = Object.freeze({ maxHours: 8, baseGoldPerHour: 3, waveBonusPerHour: 1.25, goldMultiplier: 3, maxGold: 540 });
  const clamp = (v, min, max, fallback) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  function defaults() {
    return {
      version: VERSION, schemaVersion: VERSION, updatedAt: Date.now(), lastSeenAt: Date.now(),
      gold: 0, shards: 0, prestigeCount: 0,
      permanentUpgrades: { offlineRate: 0, damage: 0, goldRate: 0, expRate: 0 },
      stats: { lifetimeKills: 0, bestSurvivalSeconds: 0, bestLevel: 1, bestWave: 1 },
      settings: { masterVolume: 100, bgmVolume: 15, sfxVolume: 100, audioEnabled: true, particles: true, screenShake: true, joystickPosition: { x: 0.86, y: 0.78 } }
    };
  }
  function migrate(data) {
    if (!data || typeof data !== 'object') return defaults();
    let d = { ...data };
    const oldVersion = Number(d.version || d.schemaVersion || 1);
    if (oldVersion < 2) {
      d = { ...d, version: 2, permanentUpgrades: d.permanentUpgrades || {}, shards: Number(d.shards) || 0,
        prestigeCount: Number(d.prestigeCount) || 0,
        stats: { ...(d.stats || {}), bestWave: Number(d.stats && d.stats.bestWave) || 1 } };
    }
    if (oldVersion < 3) {
      const upgrades = { ...(d.permanentUpgrades || {}) };
      // 旧版每级 +12 HP；新版改为每级 +1 颗心，按约 3 个旧等级折算。
      upgrades.maxHp = Math.min(10, Math.floor((Number(upgrades.maxHp) || 0) / 3));
      d = { ...d, permanentUpgrades: upgrades, version: 3, schemaVersion: 3 };
    }
    if (oldVersion < 4) {
      const settings = { ...(d.settings || {}) };
      settings.joystickPosition = settings.joystickPosition || { x: 0.86, y: 0.78 };
      d = { ...d, settings, version: 4, schemaVersion: 4 };
    }
    if (oldVersion < 5) {
      const settings = { ...(d.settings || {}) };
      // 旧版 masterVolume 继续作为总音量；为新音频通道补齐独立默认值。
      settings.bgmVolume = settings.bgmVolume == null ? 70 : settings.bgmVolume;
      settings.sfxVolume = settings.sfxVolume == null ? 80 : settings.sfxVolume;
      settings.audioEnabled = settings.audioEnabled !== false;
      d = { ...d, settings, version: 5, schemaVersion: 5 };
    }
    if (oldVersion < 6) {
      const settings = { ...(d.settings || {}) };
      // 降低 BGM：将已有用户的背景音乐滑块值减半，保留其总音量与音效设置。
      const previousBgm = Number(settings.bgmVolume);
      settings.bgmVolume = Number.isFinite(previousBgm) ? Math.round(previousBgm * 0.5) : 35;
      d = { ...d, settings, version: 6, schemaVersion: 6 };
    }
    if (oldVersion < 7) {
      const upgrades = { ...(d.permanentUpgrades || {}) };
      // 原“初始生命上限”永久升级改为“离线收益倍率”，将旧等级等比例继承，避免旧存档投入归零。
      upgrades.offlineRate = upgrades.offlineRate == null ? (Number(upgrades.maxHp) || 0) : upgrades.offlineRate;
      delete upgrades.maxHp;
      d = { ...d, permanentUpgrades: upgrades, version: 7, schemaVersion: 7 };
    }
    if (oldVersion < 8) {
      const settings = { ...(d.settings || {}) };
      // 仅把旧版未改动的默认值迁移到新默认值，保留玩家主动调整过的音量。
      if (Number(settings.masterVolume) === 70) settings.masterVolume = 100;
      if (Number(settings.bgmVolume) === 35 || settings.bgmVolume == null) settings.bgmVolume = 15;
      if (Number(settings.sfxVolume) === 80 || settings.sfxVolume == null) settings.sfxVolume = 100;
      d = { ...d, settings, version: 8, schemaVersion: 8 };
    }
    return d;
  }
  function normalize(data) {
    const base = defaults(); const d = migrate(data);
    const s = d.settings || {}; const st = d.stats || {}; const up = d.permanentUpgrades || {};
    return {
      ...base, ...d, version: VERSION, schemaVersion: VERSION,
      gold: clamp(d.gold, 0, 1e12, 0), shards: clamp(d.shards, 0, 1e9, 0),
      prestigeCount: clamp(d.prestigeCount, 0, 1e9, 0),
      permanentUpgrades: { offlineRate: clamp(up.offlineRate,0,20,0), damage: clamp(up.damage,0,1000,0), goldRate: clamp(up.goldRate,0,1000,0), expRate: clamp(up.expRate,0,1000,0) },
      stats: { ...base.stats, ...st, lifetimeKills: clamp(st.lifetimeKills,0,1e12,0), bestSurvivalSeconds: clamp(st.bestSurvivalSeconds,0,1e9,0), bestLevel: clamp(st.bestLevel,1,1e6,1), bestWave: clamp(st.bestWave,1,1e6,1) },
      settings: {
        masterVolume: clamp(s.masterVolume,0,100,100),
        bgmVolume: clamp(s.bgmVolume,0,100,15),
        sfxVolume: clamp(s.sfxVolume,0,100,100),
        audioEnabled: s.audioEnabled !== false,
        particles: s.particles !== false, screenShake: s.screenShake !== false,
        joystickPosition: {
          x: clamp(s.joystickPosition && s.joystickPosition.x, 0.08, 0.92, 0.86),
          y: clamp(s.joystickPosition && s.joystickPosition.y, 0.10, 0.90, 0.78)
        }
      },
      lastSeenAt: clamp(d.lastSeenAt,0,Date.now(),Date.now()), updatedAt: clamp(d.updatedAt,0,Date.now(),Date.now())
    };
  }
  function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function save(data) {
    const normalized = normalize(data); normalized.updatedAt = Date.now();
    try {
      const old = global.localStorage.getItem(STORAGE_KEY);
      if (old) global.localStorage.setItem(BACKUP_KEY, old);
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      Object.assign(data, normalized); return true;
    } catch (error) { console.warn('[Save] 写入失败', error); return false; }
  }
  function load() {
    let raw = null;
    try { raw = parse(global.localStorage.getItem(STORAGE_KEY)); if (!raw) raw = parse(global.localStorage.getItem(BACKUP_KEY)); }
    catch (error) { console.warn('[Save] localStorage 不可用', error); }
    const data = normalize(raw);
    const now = Date.now();
    const elapsedHours = Math.min(OFFLINE.maxHours, Math.max(0, (now - data.lastSeenAt) / 3600000));
    const wave = Math.max(1, data.stats.bestWave || 1);
    const offlineRateMultiplier = 1 + Math.max(0, Number(data.permanentUpgrades.offlineRate) || 0) * 0.10;
    const offlineGold = Math.min(OFFLINE.maxGold, Math.floor(elapsedHours * (OFFLINE.baseGoldPerHour + (wave - 1) * OFFLINE.waveBonusPerHour) * OFFLINE.goldMultiplier * offlineRateMultiplier));
    data.offlineReward = { hours: elapsedHours, gold: offlineGold, wave, multiplier: offlineRateMultiplier };
    data.gold += offlineGold;
    data.lastSeenAt = now;
    save(data);
    return data;
  }
  function reset() {
    try { global.localStorage.removeItem(STORAGE_KEY); global.localStorage.removeItem(BACKUP_KEY); }
    catch (error) { console.warn('[Save] 重置失败', error); }
    return defaults();
  }
  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Save = { STORAGE_KEY, BACKUP_KEY, VERSION, OFFLINE, defaults, migrate, normalize, load, save, reset };
})(window);
