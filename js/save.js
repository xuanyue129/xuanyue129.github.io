/* 存档基础设施：阶段 2 先保存设置与基础统计，后续阶段扩展完整成长数据。 */
(function (global) {
  "use strict";
  const STORAGE_KEY = "fantasy-survivor-save-v1";
  const BACKUP_KEY = "fantasy-survivor-save-backup-v1";
  const VERSION = 1;

  function defaults() {
    return {
      schemaVersion: VERSION,
      updatedAt: Date.now(),
      gold: 0,
      shards: 0,
      prestigeCount: 0,
      permanentUpgrades: {},
      stats: { lifetimeKills: 0, bestSurvivalSeconds: 0, bestLevel: 1 },
      settings: { masterVolume: 70, particles: true, screenShake: true },
      lastSeenAt: Date.now()
    };
  }

  function safeParse(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (error) { return null; }
  }

  function normalize(data) {
    const base = defaults();
    if (!data || typeof data !== "object") return base;
    const settings = data.settings && typeof data.settings === "object" ? data.settings : {};
    const stats = data.stats && typeof data.stats === "object" ? data.stats : {};
    return {
      ...base,
      ...data,
      schemaVersion: VERSION,
      permanentUpgrades: data.permanentUpgrades && typeof data.permanentUpgrades === "object" ? data.permanentUpgrades : {},
      stats: { ...base.stats, ...stats },
      settings: {
        masterVolume: clampNumber(settings.masterVolume, 0, 100, 70),
        particles: settings.particles !== false,
        screenShake: settings.screenShake !== false
      },
      updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : Date.now(),
      lastSeenAt: Number.isFinite(data.lastSeenAt) ? data.lastSeenAt : Date.now()
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function load() {
    try {
      const primary = safeParse(global.localStorage.getItem(STORAGE_KEY));
      if (primary) return normalize(primary);
      const backup = safeParse(global.localStorage.getItem(BACKUP_KEY));
      if (backup) return normalize(backup);
    } catch (error) {
      console.warn("[Save] 当前环境无法访问 localStorage，将使用临时默认数据。", error);
    }
    return defaults();
  }

  function save(data) {
    const normalized = normalize(data);
    normalized.updatedAt = Date.now();
    try {
      const previous = global.localStorage.getItem(STORAGE_KEY);
      if (previous) global.localStorage.setItem(BACKUP_KEY, previous);
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return true;
    } catch (error) {
      console.warn("[Save] 存档写入失败。", error);
      return false;
    }
  }

  function reset() {
    const fresh = defaults();
    try {
      global.localStorage.removeItem(STORAGE_KEY);
      global.localStorage.removeItem(BACKUP_KEY);
    } catch (error) {
      console.warn("[Save] 清理本地存档失败。", error);
    }
    return fresh;
  }

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Save = { STORAGE_KEY, VERSION, defaults, load, save, reset, normalize };
})(window);
