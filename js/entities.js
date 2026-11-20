/* 实体接口占位。阶段 3 在此实现玩家、敌人、投射物和掉落物。 */
(function (global) {
  "use strict";
  const Entities = {
    createPlayer(options) {
      return { type: "player", x: 0, y: 0, health: 100, maxHealth: 100, level: 1, exp: 0, ...(options || {}) };
    },
    createEnemy(options) {
      return { type: "enemy", x: 0, y: 0, health: 30, maxHealth: 30, ...(options || {}) };
    },
    createProjectile(options) {
      return { type: "projectile", x: 0, y: 0, vx: 0, vy: 0, damage: 12, ...(options || {}) };
    },
    createDrop(options) {
      return { type: "drop", x: 0, y: 0, value: 1, ...(options || {}) };
    }
  };
  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Entities = Entities;
})(window);
