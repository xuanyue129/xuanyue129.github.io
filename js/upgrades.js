/* 局内强化与局外成长接口占位。实际抽卡和价格计算将在阶段 4 实现。 */
(function (global) {
  "use strict";
  const RARITIES = {
    common: { name: "普通", color: "#A7B0BA", weight: 65 },
    rare: { name: "稀有", color: "#58B9F6", weight: 25 },
    epic: { name: "史诗", color: "#B68AFF", weight: 8 },
    legendary: { name: "传说", color: "#F0C56A", weight: 2 }
  };
  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Upgrades = {
    rarities: RARITIES,
    getPermanentPrice(baseCost, level, growth) {
      return Math.floor(baseCost * Math.pow(growth || 1.32, Math.max(0, level || 0)));
    }
  };
})(window);
