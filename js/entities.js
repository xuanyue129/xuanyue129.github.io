/* 实体工厂与对象池。保留阶段 2 的 create* 接口，并增加 acquire/release 供战斗循环复用。 */
(function (global) {
  "use strict";

  const LIMITS = {
    enemy: 180,
    projectile: 260,
    enemyProjectile: 180,
    drop: 260,
    particle: 900
  };

  const pools = {
    enemy: [],
    projectile: [],
    enemyProjectile: [],
    drop: [],
    particle: []
  };

  const DEFAULTS = {
    enemy: {
      type: "enemy", x: 0, y: 0, vx: 0, vy: 0,
      hp: 30, maxHp: 30, speed: 55, radius: 13,
      damage: 8, color: "#D98E91", kind: "normal",
      contactCooldown: 0, flash: 0, dead: false
    },
    projectile: {
      type: "projectile", x: 0, y: 0, vx: 0, vy: 0,
      damage: 12, radius: 5, life: 1.2, color: "#70C8E8",
      isCritical: false, pierceRemaining: 0, hitEnemies: [], dead: false
    },
    enemyProjectile: {
      type: "enemyProjectile", x: 0, y: 0, vx: 0, vy: 0,
      damage: 1, radius: 6, life: 4, color: "#FF9A78", dead: false
    },
    drop: {
      type: "drop", x: 0, y: 0, vx: 0, vy: 0,
      value: 1, kind: "exp", radius: 6, life: 18,
      color: "#4FC3F7", dead: false
    },
    particle: {
      type: "particle", x: 0, y: 0, vx: 0, vy: 0,
      size: 3, life: 0.5, maxLife: 0.5,
      color: "#FFFFFF", alpha: 1, drag: 0.96
    }
  };

  function make(type, options) {
    const entity = Object.assign({}, DEFAULTS[type], options || {});
    return entity;
  }

  function acquire(type, options) {
    const pool = pools[type];
    const entity = pool && pool.length ? pool.pop() : {};

    Object.keys(entity).forEach((key) => {
      delete entity[key];
    });

    Object.assign(entity, DEFAULTS[type], options || {});
    return entity;
  }

  function release(type, entity) {
    const pool = pools[type];
    if (!pool || !entity || pool.length >= LIMITS[type]) return;
    pool.push(entity);
  }

  function createPlayer(options) {
    return Object.assign({
      type: "player",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      speed: 200,
      damage: 12,
      attackInterval: 0.85,
      attackTimer: 0.25,
      attackRange: 280,
      projectileSpeed: 500,
      projectileRadius: 5,
      radius: 14,
      invuln: 0,
      exp: 0,
      level: 1,
      pickupRadius: 78,
      hitFlash: 0
    }, options || {});
  }

  const Entities = {
    createPlayer,
    createEnemy(options) { return make("enemy", options); },
    createProjectile(options) { return make("projectile", options); },
    createDrop(options) { return make("drop", options); },
    createParticle(options) { return make("particle", options); },
    acquire,
    release,
    poolStats() {
      return {
        enemy: pools.enemy.length,
        projectile: pools.projectile.length,
        enemyProjectile: pools.enemyProjectile.length,
        drop: pools.drop.length,
        particle: pools.particle.length
      };
    },
    clearPools() {
      Object.keys(pools).forEach((key) => { pools[key].length = 0; });
    }
  };

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Entities = Entities;
})(window);
