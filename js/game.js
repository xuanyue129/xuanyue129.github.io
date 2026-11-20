/*
 * 阶段 3：可运行的生存战斗循环。
 * 负责输入、移动、自动攻击、敌人刷新、碰撞、元素附着/反应、掉落、升级、死亡结算与渲染。
 * 继续使用 window.FantasySurvivor.Game，保持阶段 2 的 init/start/pause/resume/stop 接口。
 */
(function (global) {
  "use strict";

  const CONFIG = Object.freeze({
    player: {
      hp: 100,
      speed: 240,
      damage: 12,
      attackInterval: 0.85,
      attackRange: 280,
      projectileSpeed: 500,
      projectileRadius: 5,
      radius: 14,
      invulnerability: 0.65,
      pickupRadius: 78
    },
    spawn: {
      initialInterval: 1.15,
      minimumInterval: 0.45,
      intervalDecreasePerWave: 0.075,
      maxEnemies: 90,
      waveSeconds: 60,
      edgePadding: 34
    },
    enemy: {
      normalHp: 32,
      normalSpeed: 55,
      normalDamage: 8,
      fastHp: 22,
      fastSpeed: 92,
      fastDamage: 6,
      eliteHp: 165,
      eliteSpeed: 48,
      eliteDamage: 14,
      contactRadius: 13
    },
    projectile: {
      life: 1.25,
      radius: 5
    },
    drops: {
      expLife: 20,
      goldLife: 20,
      expRadius: 6,
      goldRadius: 6,
      goldChance: 0.48,
      magnetSpeed: 230
    },
    particles: {
      highLimit: 600,
      lowLimit: 180
    },
    grid: {
      cellSize: 120
    }
  });

  const REACTIONS = {
    "electro|water": { name: "感电", color: "#4FC3F7", multiplier: 1.35, radius: 104, chain: 3 },
    "dendro|fire": { name: "燃烧", color: "#FF7A45", multiplier: 1.2, burn: true },
    "cryo|electro": { name: "超导", color: "#B3E5FC", multiplier: 1.55, radius: 100, slow: true },
    "fire|water": { name: "蒸发", color: "#F3DFA8", multiplier: 1.85, radius: 66 },
    "electro|fire": { name: "超载", color: "#B388FF", multiplier: 1.65, radius: 118 },
    "cryo|fire": { name: "融化", color: "#FFB7A2", multiplier: 1.9, radius: 60 },
    "cryo|water": { name: "冻结", color: "#B3E5FC", multiplier: 1.15, freeze: true },
    "dendro|water": { name: "绽生", color: "#8BC34A", multiplier: 1.4, radius: 90 },
    "anemo|fire": { name: "火元素扩散", color: "#80CBC4", multiplier: 1.3, radius: 135 },
    "anemo|water": { name: "水元素扩散", color: "#80CBC4", multiplier: 1.3, radius: 135 },
    "anemo|electro": { name: "雷元素扩散", color: "#80CBC4", multiplier: 1.3, radius: 135 },
    "anemo|dendro": { name: "草元素扩散", color: "#80CBC4", multiplier: 1.3, radius: 135 },
    "anemo|cryo": { name: "冰元素扩散", color: "#80CBC4", multiplier: 1.3, radius: 135 },
    "anemo|geo": { name: "结晶扩散", color: "#80CBC4", multiplier: 1.3, radius: 135 },
    "geo|fire": { name: "火晶共鸣", color: "#FFCA28", multiplier: 1.45, radius: 76 },
    "geo|water": { name: "水晶共鸣", color: "#FFCA28", multiplier: 1.45, radius: 76 },
    "electro|dendro": { name: "激化", color: "#B388FF", multiplier: 1.55, radius: 86 },
    "dendro|geo": { name: "根晶共鸣", color: "#8BC34A", multiplier: 1.4, radius: 76 },
    "cryo|dendro": { name: "霜蔓共鸣", color: "#B3E5FC", multiplier: 1.4, radius: 76 },
    "anemo|geo": { name: "风岩共鸣", color: "#80CBC4", multiplier: 1.4, radius: 86 },
    "cryo|geo": { name: "碎晶", color: "#FFCA28", multiplier: 1.5, radius: 86 }
  };

  const Game = {
    CONFIG,
    REACTIONS,

    backgroundCanvas: null,
    backgroundContext: null,
    arenaCanvas: null,
    arenaContext: null,
    width: 0,
    height: 0,
    arenaWidth: 0,
    arenaHeight: 0,

    stars: [],
    motes: [],
    enemies: [],
    projectiles: [],
    drops: [],
    particles: [],
    enemyGrid: new Map(),

    player: null,
    element: null,
    keys: new Set(),

    active: false,
    paused: false,
    inRun: false,
    gameOverHandled: false,
    initialized: false,

    elapsed: 0,
    spawnTimer: 0.8,
    hudTimer: 0,
    lastTime: 0,
    rafId: 0,
    shakeTime: 0,
    shakeStrength: 0,
    particlesEnabled: true,
    screenShakeEnabled: true,
    runKills: 0,
    runGold: 0,
    runExperience: 0,
    lastReaction: "等待元素附着……",
    callbacks: {},

    init(options) {
      this.backgroundCanvas = options.backgroundCanvas || null;
      this.backgroundContext = this.backgroundCanvas
        ? this.backgroundCanvas.getContext("2d")
        : null;
      this.arenaCanvas = options.arenaCanvas || null;
      this.arenaContext = this.arenaCanvas
        ? this.arenaCanvas.getContext("2d")
        : null;

      this.resize();

      if (!this.initialized) {
        this._onResize = () => this.resize();
        this._onKeyDown = (event) => this.handleKeyDown(event);
        this._onKeyUp = (event) => this.handleKeyUp(event);
        this._onVisibility = () => {
          if (document.hidden && this.active && !this.paused) {
            this.pause();
            if (typeof this.callbacks.onPause === "function") {
              this.callbacks.onPause("visibility");
            }
          }
        };

        global.addEventListener("resize", this._onResize, { passive: true });
        global.addEventListener("keydown", this._onKeyDown);
        global.addEventListener("keyup", this._onKeyUp);
        document.addEventListener("visibilitychange", this._onVisibility);
        this.initialized = true;
      }

      this.lastTime = performance.now();
      if (!this.rafId) {
        this.rafId = requestAnimationFrame((time) => this.loop(time));
      }
    },

    setCallbacks(callbacks) {
      this.callbacks = Object.assign({}, callbacks || {});
    },

    resizeCanvas(canvas, context) {
      if (!canvas || !context) return null;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width || 1);
      const height = Math.max(1, rect.height || 1);
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height };
    },

    resize() {
      const bg = this.resizeCanvas(this.backgroundCanvas, this.backgroundContext);
      if (bg) {
        this.width = bg.width;
        this.height = bg.height;
        this.makeStars();
      }

      const arena = this.resizeCanvas(this.arenaCanvas, this.arenaContext);
      if (arena) {
        this.arenaWidth = arena.width;
        this.arenaHeight = arena.height;
        if (this.player) this.keepPlayerInBounds();
      }
    },

    makeStars() {
      const count = Math.max(45, Math.min(145, Math.floor((this.width * this.height) / 10500)));
      this.stars = Array.from({ length: count }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height * 0.78,
        radius: 0.45 + Math.random() * 1.35,
        phase: Math.random() * Math.PI * 2,
        speed: 0.45 + Math.random() * 1.25
      }));
      this.motes = Array.from({ length: Math.min(28, Math.floor(count / 3)) }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: 0.8 + Math.random() * 1.8,
        drift: 4 + Math.random() * 10,
        alpha: 0.12 + Math.random() * 0.22
      }));
    },

    handleKeyDown(event) {
      if (!this.active || this.paused) return;
      const supported = [
        "KeyW", "KeyA", "KeyS", "KeyD",
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
      ];
      if (supported.includes(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
      }
    },

    handleKeyUp(event) {
      this.keys.delete(event.code);
    },

    start(elementId) {
      this.clearRunEntities();
      this.element = global.FantasySurvivor.Elements.get(elementId) ||
        global.FantasySurvivor.Elements.get("water");

      this.active = true;
      this.paused = false;
      this.inRun = true;
      this.gameOverHandled = false;
      this.elapsed = 0;
      this.spawnTimer = 0.65;
      this.hudTimer = 0;
      this.runKills = 0;
      this.runGold = 0;
      this.runExperience = 0;
      this.lastReaction = "等待元素附着……";
      this.shakeTime = 0;
      this.shakeStrength = 0;
      this.keys.clear();

      this.resize();
      this.player = global.FantasySurvivor.Entities.createPlayer({
        x: this.arenaWidth / 2,
        y: this.arenaHeight / 2,
        hp: CONFIG.player.hp,
        maxHp: CONFIG.player.hp,
        speed: CONFIG.player.speed,
        damage: CONFIG.player.damage,
        attackInterval: CONFIG.player.attackInterval,
        attackRange: CONFIG.player.attackRange,
        projectileSpeed: CONFIG.player.projectileSpeed,
        projectileRadius: CONFIG.player.projectileRadius,
        radius: CONFIG.player.radius,
        invuln: 0,
        exp: 0,
        level: 1,
        pickupRadius: CONFIG.player.pickupRadius,
        element: this.element.id
      });

      this.lastTime = performance.now();
      this.updateHUD(true);
      this.renderArena(this.elapsed);
    },

    pause() {
      if (!this.active || this.paused) return;
      this.paused = true;
      this.keys.clear();
    },

    resume() {
      if (!this.inRun || !this.paused) return;
      this.paused = false;
      this.active = true;
      this.lastTime = performance.now();
      this.keys.clear();
    },

    stop() {
      this.active = false;
      this.paused = false;
      this.inRun = false;
      this.keys.clear();
      this.player = null;
      this.element = null;
      this.clearRunEntities();
      this.lastReaction = "等待元素附着……";
    },

    clearRunEntities() {
      const entities = global.FantasySurvivor.Entities;
      this.enemies.forEach((item) => entities.release("enemy", item));
      this.projectiles.forEach((item) => entities.release("projectile", item));
      this.drops.forEach((item) => entities.release("drop", item));
      this.particles.forEach((item) => entities.release("particle", item));
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.drops.length = 0;
      this.particles.length = 0;
      this.enemyGrid.clear();
    },

    setParticlesEnabled(value) {
      this.particlesEnabled = Boolean(value);
    },

    setScreenShakeEnabled(value) {
      this.screenShakeEnabled = Boolean(value);
    },

    loop(time) {
      const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
      this.lastTime = time;

      this.drawBackground(time / 1000);

      if (this.active && !this.paused) {
        this.update(dt);
      }

      if (this.inRun) {
        this.renderArena(this.elapsed);
      }

      this.rafId = requestAnimationFrame((nextTime) => this.loop(nextTime));
    },

    update(dt) {
      if (!this.player || !this.active) return;

      this.elapsed += dt;
      const wave = this.getWave();
      this.player.invuln = Math.max(0, this.player.invuln - dt);
      this.player.hitFlash = Math.max(0, this.player.hitFlash - dt);
      this.shakeTime = Math.max(0, this.shakeTime - dt);

      this.updatePlayerMovement(dt);
      this.updateEnemies(dt, wave);
      this.rebuildEnemyGrid();
      this.updateAutoAttack(dt);
      this.updateProjectiles(dt);
      this.updateDrops(dt);
      this.updateParticles(dt);
      this.removeDeadEnemies();

      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = 0.10;
        this.updateHUD(false);
      }

      if (this.player.hp <= 0) {
        this.finishRun();
      }
    },

    getWave() {
      return Math.floor(this.elapsed / CONFIG.spawn.waveSeconds) + 1;
    },

    updatePlayerMovement(dt) {
      const p = this.player;
      let dx = 0;
      let dy = 0;

      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx += 1;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy -= 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy += 1;

      if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
      }

      p.vx = dx * p.speed;
      p.vy = dy * p.speed;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.keepPlayerInBounds();
    },

    keepPlayerInBounds() {
      if (!this.player || !this.arenaWidth || !this.arenaHeight) return;
      const margin = this.player.radius + 5;
      this.player.x = Math.max(margin, Math.min(this.arenaWidth - margin, this.player.x));
      this.player.y = Math.max(margin, Math.min(this.arenaHeight - margin, this.player.y));
    },

    updateEnemies(dt, wave) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.length < CONFIG.spawn.maxEnemies) {
        this.spawnEnemy(wave);
        const interval = Math.max(
          CONFIG.spawn.minimumInterval,
          CONFIG.spawn.initialInterval - (wave - 1) * CONFIG.spawn.intervalDecreasePerWave
        );
        this.spawnTimer = interval * (0.86 + Math.random() * 0.28);
      }

      const p = this.player;
      for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = this.enemies[i];
        if (enemy.dead) continue;

        enemy.flash = Math.max(0, enemy.flash - dt);
        enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
        enemy.slowTime = Math.max(0, enemy.slowTime - dt);
        enemy.freezeTime = Math.max(0, enemy.freezeTime - dt);
        enemy.burnTime = Math.max(0, enemy.burnTime - dt);

        if (enemy.burnTime > 0) {
          enemy.burnTick -= dt;
          if (enemy.burnTick <= 0) {
            enemy.burnTick = 0.55;
            this.damageEnemy(enemy, enemy.burnDamage, false);
            this.spawnBurst(enemy.x, enemy.y, "#FF7A45", 2, 12);
          }
        }

        if (enemy.dead) continue;

        const vx = p.x - enemy.x;
        const vy = p.y - enemy.y;
        const distance = Math.hypot(vx, vy) || 1;
        const frozen = enemy.freezeTime > 0;
        const slowFactor = enemy.slowTime > 0 ? 0.58 : 1;
        const moveFactor = frozen ? 0 : slowFactor;

        enemy.vx = (vx / distance) * enemy.speed * moveFactor;
        enemy.vy = (vy / distance) * enemy.speed * moveFactor;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;

        const collisionDistance = p.radius + enemy.radius;
        const contactDx = p.x - enemy.x;
        const contactDy = p.y - enemy.y;
        const contactDistance = Math.hypot(contactDx, contactDy) || 1;
        if (contactDistance < collisionDistance && enemy.contactCooldown <= 0) {
          enemy.contactCooldown = 0.72;
          this.damagePlayer(enemy.damage);
          const push = (collisionDistance - contactDistance + 3) * 0.55;
          enemy.x -= (contactDx / contactDistance) * push;
          enemy.y -= (contactDy / contactDistance) * push;
        }
      }
    },

    spawnEnemy(wave) {
      const entities = global.FantasySurvivor.Entities;
      const w = this.arenaWidth;
      const h = this.arenaHeight;
      if (w < 20 || h < 20) return;

      const side = Math.floor(Math.random() * 4);
      const pad = CONFIG.spawn.edgePadding;
      let x;
      let y;

      if (side === 0) { x = Math.random() * w; y = -pad; }
      else if (side === 1) { x = w + pad; y = Math.random() * h; }
      else if (side === 2) { x = Math.random() * w; y = h + pad; }
      else { x = -pad; y = Math.random() * h; }

      const roll = Math.random();
      let kind = "normal";
      if (wave >= 3 && roll < 0.10) kind = "elite";
      else if (wave >= 2 && roll < 0.31) kind = "fast";

      const hpScale = 1 + (wave - 1) * 0.13;
      const damageScale = 1 + (wave - 1) * 0.07;
      let hp = CONFIG.enemy.normalHp * hpScale;
      let speed = CONFIG.enemy.normalSpeed + (wave - 1) * 2.2;
      let damage = CONFIG.enemy.normalDamage * damageScale;
      let radius = CONFIG.enemy.contactRadius;
      let color = "#D98E91";

      if (kind === "fast") {
        hp = CONFIG.enemy.fastHp * hpScale;
        speed = CONFIG.enemy.fastSpeed + (wave - 1) * 2.5;
        damage = CONFIG.enemy.fastDamage * damageScale;
        radius = 10;
        color = "#E7B978";
      } else if (kind === "elite") {
        hp = CONFIG.enemy.eliteHp * hpScale;
        speed = CONFIG.enemy.eliteSpeed + (wave - 1) * 1.5;
        damage = CONFIG.enemy.eliteDamage * damageScale;
        radius = 18;
        color = "#B388FF";
      }

      const elementIds = global.FantasySurvivor.Elements.list()
        .map((item) => item.id)
        .filter((id) => id !== this.element.id);
      const affinity = elementIds[Math.floor(Math.random() * elementIds.length)];

      this.enemies.push(entities.acquire("enemy", {
        x, y, hp, maxHp: hp, speed, damage, radius, kind, color,
        contactCooldown: 0, flash: 0, slowTime: 0, freezeTime: 0,
        burnTime: 0, burnTick: 0, burnDamage: 0,
        affinity,
        elementMarks: { [affinity]: this.elapsed + 25 },
        dead: false
      }));
    },

    rebuildEnemyGrid() {
      this.enemyGrid.clear();
      const size = CONFIG.grid.cellSize;
      for (let i = 0; i < this.enemies.length; i += 1) {
        const enemy = this.enemies[i];
        if (enemy.dead) continue;
        const gx = Math.floor(enemy.x / size);
        const gy = Math.floor(enemy.y / size);
        const key = gx + "," + gy;
        let bucket = this.enemyGrid.get(key);
        if (!bucket) {
          bucket = [];
          this.enemyGrid.set(key, bucket);
        }
        bucket.push(enemy);
      }
    },

    queryEnemies(x, y, radius) {
      const size = CONFIG.grid.cellSize;
      const minX = Math.floor((x - radius) / size);
      const maxX = Math.floor((x + radius) / size);
      const minY = Math.floor((y - radius) / size);
      const maxY = Math.floor((y + radius) / size);
      const result = [];

      for (let gx = minX; gx <= maxX; gx += 1) {
        for (let gy = minY; gy <= maxY; gy += 1) {
          const bucket = this.enemyGrid.get(gx + "," + gy);
          if (bucket) {
            for (let i = 0; i < bucket.length; i += 1) result.push(bucket[i]);
          }
        }
      }
      return result;
    },

    findNearestEnemy() {
      const p = this.player;
      const candidates = this.queryEnemies(p.x, p.y, p.attackRange);
      let nearest = null;
      let bestDistance = p.attackRange * p.attackRange;

      for (let i = 0; i < candidates.length; i += 1) {
        const enemy = candidates[i];
        if (enemy.dead) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestDistance) {
          bestDistance = distanceSq;
          nearest = enemy;
        }
      }
      return nearest;
    },

    updateAutoAttack(dt) {
      const p = this.player;
      p.attackTimer -= dt;
      if (p.attackTimer > 0) return;

      const target = this.findNearestEnemy();
      if (!target) {
        p.attackTimer = 0.12;
        return;
      }

      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const distance = Math.hypot(dx, dy) || 1;
      const entities = global.FantasySurvivor.Entities;
      const projectile = entities.acquire("projectile", {
        x: p.x,
        y: p.y,
        vx: (dx / distance) * p.projectileSpeed,
        vy: (dy / distance) * p.projectileSpeed,
        damage: p.damage,
        radius: p.projectileRadius,
        life: CONFIG.projectile.life,
        color: this.element.color,
        element: this.element.id,
        dead: false
      });
      this.projectiles.push(projectile);
      this.spawnBurst(p.x, p.y, this.element.color, 2, 14);
      p.attackTimer = p.attackInterval;
    },

    updateProjectiles(dt) {
      const entities = global.FantasySurvivor.Entities;
      for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
        const shot = this.projectiles[i];
        shot.life -= dt;
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;

        if (shot.life <= 0 || shot.x < -40 || shot.y < -40 ||
            shot.x > this.arenaWidth + 40 || shot.y > this.arenaHeight + 40) {
          entities.release("projectile", this.projectiles.splice(i, 1)[0]);
          continue;
        }

        const nearby = this.queryEnemies(shot.x, shot.y, 26);
        let hit = null;
        for (let j = 0; j < nearby.length; j += 1) {
          const enemy = nearby[j];
          if (enemy.dead) continue;
          const dx = enemy.x - shot.x;
          const dy = enemy.y - shot.y;
          const rr = enemy.radius + shot.radius;
          if (dx * dx + dy * dy <= rr * rr) {
            hit = enemy;
            break;
          }
        }

        if (hit) {
          this.damageEnemy(hit, shot.damage, true);
          if (!hit.dead) this.applyElement(hit, shot.element, shot.damage);
          this.spawnBurst(shot.x, shot.y, shot.color, 4, 42);
          entities.release("projectile", this.projectiles.splice(i, 1)[0]);
        }
      }
    },

    applyElement(enemy, elementId, baseDamage) {
      if (!enemy || enemy.dead) return;
      const now = this.elapsed;
      const marks = enemy.elementMarks || (enemy.elementMarks = {});

      Object.keys(marks).forEach((id) => {
        if (marks[id] <= now) delete marks[id];
      });

      const previous = Object.keys(marks).find((id) => id !== elementId && marks[id] > now);
      marks[elementId] = now + 4.5;

      if (previous) {
        this.triggerReaction(enemy, previous, elementId, baseDamage);
        enemy.elementMarks = {};
        enemy.elementMarks[elementId] = now + 2.5;
      }
    },

    triggerReaction(enemy, first, second, baseDamage) {
      if (!enemy || enemy.dead) return;
      const pair = [first, second].sort().join("|");
      const reaction = REACTIONS[pair] || {
        name: "元素共鸣",
        color: this.element.color,
        multiplier: 1.25,
        radius: 58
      };

      this.lastReaction = reaction.name;
      if (typeof this.callbacks.onReaction === "function") {
        this.callbacks.onReaction(reaction.name, reaction.color);
      }

      this.damageEnemy(enemy, baseDamage * reaction.multiplier, false);
      this.spawnBurst(enemy.x, enemy.y, reaction.color, 18, 105);

      if (reaction.burn && !enemy.dead) {
        enemy.burnTime = Math.max(enemy.burnTime, 3.2);
        enemy.burnTick = 0.3;
        enemy.burnDamage = Math.max(2, baseDamage * 0.42);
      }

      if (reaction.freeze && !enemy.dead) {
        enemy.freezeTime = Math.max(enemy.freezeTime, 1.45);
      }

      if (reaction.slow && !enemy.dead) {
        enemy.slowTime = Math.max(enemy.slowTime, 3.0);
      }

      if (reaction.radius) {
        const targets = this.queryEnemies(enemy.x, enemy.y, reaction.radius);
        for (let i = 0; i < targets.length; i += 1) {
          const other = targets[i];
          if (other === enemy || other.dead) continue;
          const distance = Math.hypot(other.x - enemy.x, other.y - enemy.y);
          if (distance <= reaction.radius) {
            this.damageEnemy(other, baseDamage * reaction.multiplier * 0.45, false);
            if (reaction.slow) other.slowTime = Math.max(other.slowTime, 1.8);
          }
        }
      }

      if (reaction.chain) {
        const targets = this.queryEnemies(enemy.x, enemy.y, 180)
          .filter((item) => item !== enemy && !item.dead)
          .sort((a, b) => {
            const da = Math.hypot(a.x - enemy.x, a.y - enemy.y);
            const db = Math.hypot(b.x - enemy.x, b.y - enemy.y);
            return da - db;
          })
          .slice(0, reaction.chain);

        targets.forEach((other) => {
          this.damageEnemy(other, baseDamage * 0.55, false);
          this.spawnBurst(other.x, other.y, reaction.color, 5, 44);
        });
      }
    },

    damageEnemy(enemy, amount, showHit) {
      if (!enemy || enemy.dead) return;
      enemy.hp -= Math.max(0, amount);
      if (showHit) enemy.flash = 0.09;
      if (enemy.hp <= 0) this.killEnemy(enemy);
    },

    killEnemy(enemy) {
      if (enemy.dead) return;
      enemy.dead = true;
      this.runKills += 1;
      this.spawnDrop(enemy.x + (Math.random() - 0.5) * 12,
        enemy.y + (Math.random() - 0.5) * 12, "exp", enemy.kind === "elite" ? 12 : (enemy.kind === "fast" ? 6 : 5));

      if (Math.random() < CONFIG.drops.goldChance || enemy.kind === "elite") {
        const value = enemy.kind === "elite"
          ? 8 + Math.floor(Math.random() * 5)
          : 1 + Math.floor(Math.random() * 3);
        this.spawnDrop(enemy.x, enemy.y, "gold", value);
      }

      this.spawnBurst(enemy.x, enemy.y, enemy.color, enemy.kind === "elite" ? 18 : 9, 80);
    },

    removeDeadEnemies() {
      const entities = global.FantasySurvivor.Entities;
      for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
        if (this.enemies[i].dead) {
          entities.release("enemy", this.enemies.splice(i, 1)[0]);
        }
      }
    },

    spawnDrop(x, y, kind, value) {
      const entities = global.FantasySurvivor.Entities;
      this.drops.push(entities.acquire("drop", {
        x, y,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        kind,
        value,
        radius: kind === "gold" ? CONFIG.drops.goldRadius : CONFIG.drops.expRadius,
        life: kind === "gold" ? CONFIG.drops.goldLife : CONFIG.drops.expLife,
        color: kind === "gold" ? "#F0C56A" : "#4FC3F7",
        dead: false
      }));
    },

    updateDrops(dt) {
      const p = this.player;
      const entities = global.FantasySurvivor.Entities;

      for (let i = this.drops.length - 1; i >= 0; i -= 1) {
        const drop = this.drops[i];
        drop.life -= dt;
        if (drop.life <= 0) {
          entities.release("drop", this.drops.splice(i, 1)[0]);
          continue;
        }

        const dx = p.x - drop.x;
        const dy = p.y - drop.y;
        const distance = Math.hypot(dx, dy) || 1;
        const magnetRange = p.pickupRadius + 42;

        if (distance < magnetRange) {
          const speed = CONFIG.drops.magnetSpeed * (distance < 38 ? 1.45 : 1);
          drop.vx = (dx / distance) * speed;
          drop.vy = (dy / distance) * speed;
        } else {
          drop.vx *= Math.pow(0.08, dt);
          drop.vy *= Math.pow(0.08, dt);
        }

        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;

        if (distance < p.radius + drop.radius + 5) {
          if (drop.kind === "gold") {
            this.runGold += drop.value;
          } else {
            this.addExperience(drop.value);
          }
          this.spawnBurst(drop.x, drop.y, drop.color, 5, 35);
          entities.release("drop", this.drops.splice(i, 1)[0]);
        }
      }
    },

    addExperience(amount) {
      const p = this.player;
      this.runExperience += amount;
      p.exp += amount;
      while (p.exp >= this.expToNextLevel(p.level)) {
        p.exp -= this.expToNextLevel(p.level);
        p.level += 1;
        p.maxHp += 3;
        p.hp = Math.min(p.maxHp, p.hp + 5);
        p.damage += 0.8;
        p.attackInterval = Math.max(0.42, p.attackInterval * 0.992);
        if (typeof this.callbacks.onLevelUp === "function") {
          this.callbacks.onLevelUp(p.level);
        }
      }
    },

    expToNextLevel(level) {
      return Math.round(20 + 10 * Math.pow(Math.max(0, level - 1), 1.25));
    },

    damagePlayer(amount) {
      const p = this.player;
      if (!p || p.invuln > 0 || !this.active) return;
      p.hp = Math.max(0, p.hp - amount);
      p.invuln = CONFIG.player.invulnerability;
      p.hitFlash = 0.18;
      if (this.screenShakeEnabled) {
        this.shakeTime = 0.16;
        this.shakeStrength = 4;
      }
      this.spawnBurst(p.x, p.y, "#FF8B91", 11, 65);
      if (typeof this.callbacks.onPlayerHit === "function") {
        this.callbacks.onPlayerHit(p.hp, p.maxHp);
      }
    },

    spawnBurst(x, y, color, count, speed) {
      if (!this.particlesEnabled) return;
      const limit = this.getParticleLimit();
      const entities = global.FantasySurvivor.Entities;
      for (let i = 0; i < count && this.particles.length < limit; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = speed * (0.35 + Math.random() * 0.75);
        const life = 0.22 + Math.random() * 0.48;
        this.particles.push(entities.acquire("particle", {
          x, y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          size: 1.2 + Math.random() * 2.6,
          life,
          maxLife: life,
          color,
          alpha: 1,
          drag: 0.92
        }));
      }
    },

    getParticleLimit() {
      const isMobile = global.matchMedia && global.matchMedia("(max-width: 767px)").matches;
      return isMobile ? CONFIG.particles.lowLimit : CONFIG.particles.highLimit;
    },

    updateParticles(dt) {
      const entities = global.FantasySurvivor.Entities;
      for (let i = this.particles.length - 1; i >= 0; i -= 1) {
        const particle = this.particles[i];
        particle.life -= dt;
        if (particle.life <= 0) {
          entities.release("particle", this.particles.splice(i, 1)[0]);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        const drag = Math.pow(particle.drag, dt * 60);
        particle.vx *= drag;
        particle.vy *= drag;
        particle.alpha = particle.life / particle.maxLife;
      }
    },

    updateHUD(force) {
      if (!this.player || typeof this.callbacks.onHUD !== "function") return;
      if (!force && this.hudTimer > 0) return;
      const p = this.player;
      const expRequired = this.expToNextLevel(p.level);
      this.callbacks.onHUD({
        hp: Math.ceil(p.hp),
        maxHp: p.maxHp,
        hpPercent: Math.max(0, p.hp / p.maxHp * 100),
        level: p.level,
        exp: p.exp,
        expRequired,
        expPercent: Math.min(100, p.exp / expRequired * 100),
        gold: this.runGold,
        kills: this.runKills,
        wave: this.getWave(),
        time: this.elapsed,
        element: this.element,
        reaction: this.lastReaction
      });
    },

    finishRun() {
      if (this.gameOverHandled || !this.player) return;
      this.gameOverHandled = true;
      this.active = false;
      this.paused = false;
      this.keys.clear();

      const result = {
        duration: this.elapsed,
        kills: this.runKills,
        level: this.player.level,
        gold: this.runGold,
        experience: this.runExperience,
        element: this.element ? this.element.id : "water"
      };

      this.updateHUD(true);
      if (typeof this.callbacks.onGameOver === "function") {
        this.callbacks.onGameOver(result);
      }
    },

    drawBackground(time) {
      const ctx = this.backgroundContext;
      if (!ctx || !this.width || !this.height) return;
      const w = this.width;
      const h = this.height;
      ctx.clearRect(0, 0, w, h);

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#09172B");
      sky.addColorStop(0.48, "#122944");
      sky.addColorStop(1, "#07111F");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.52, h * 0.38, 0, w * 0.52, h * 0.38, Math.max(w, h) * 0.52);
      glow.addColorStop(0, "rgba(82, 137, 174, 0.19)");
      glow.addColorStop(1, "rgba(7, 17, 31, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      if (this.particlesEnabled) {
        this.stars.forEach((star) => {
          const alpha = 0.28 + (Math.sin(time * star.speed + star.phase) + 1) * 0.23;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "#DCEBFA";
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          ctx.fill();
        });
        this.motes.forEach((mote) => {
          const y = (mote.y - time * mote.drift * 0.18 + h) % h;
          ctx.globalAlpha = mote.alpha;
          ctx.fillStyle = "#9CC7D8";
          ctx.beginPath();
          ctx.arc(mote.x, y, mote.radius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      this.drawIsland(ctx, w * 0.16, h * 0.60, w * 0.22, h * 0.12, time * 0.08, 0.55);
      this.drawIsland(ctx, w * 0.82, h * 0.52, w * 0.24, h * 0.16, -time * 0.06, 0.72);
      this.drawIsland(ctx, w * 0.54, h * 0.73, w * 0.36, h * 0.14, time * 0.04, 0.30);

      const haze = ctx.createLinearGradient(0, h * 0.58, 0, h);
      haze.addColorStop(0, "rgba(80, 133, 158, 0)");
      haze.addColorStop(1, "rgba(27, 57, 77, 0.34)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, h * 0.48, w, h * 0.52);
    },

    drawIsland(ctx, x, y, width, height, drift, alpha) {
      const floatY = Math.sin(drift) * 5;
      ctx.save();
      ctx.translate(x, y + floatY);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#0A1728";
      ctx.strokeStyle = "rgba(117, 157, 178, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-width * 0.52, 0);
      ctx.quadraticCurveTo(-width * 0.20, -height * 0.48, 0, -height * 0.36);
      ctx.quadraticCurveTo(width * 0.30, -height * 0.55, width * 0.53, -height * 0.02);
      ctx.lineTo(width * 0.24, height * 0.28);
      ctx.lineTo(width * 0.12, height * 0.72);
      ctx.lineTo(-width * 0.12, height * 0.53);
      ctx.lineTo(-width * 0.34, height * 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(232, 200, 122, 0.22)";
      ctx.beginPath();
      ctx.moveTo(-width * 0.28, -height * 0.12);
      ctx.quadraticCurveTo(0, -height * 0.42, width * 0.26, -height * 0.14);
      ctx.stroke();
      ctx.restore();
    },

    renderArena(time) {
      const ctx = this.arenaContext;
      const w = this.arenaWidth;
      const h = this.arenaHeight;
      if (!ctx || !w || !h) return;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (this.shakeTime > 0 && this.screenShakeEnabled) {
        const strength = this.shakeStrength * (this.shakeTime / 0.16);
        ctx.translate((Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength);
      }

      const bg = ctx.createRadialGradient(w * 0.5, h * 0.48, 10, w * 0.5, h * 0.48, Math.max(w, h) * 0.72);
      bg.addColorStop(0, "#1C3B56");
      bg.addColorStop(0.55, "#10263E");
      bg.addColorStop(1, "#081525");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = "rgba(132, 174, 193, 0.09)";
      ctx.lineWidth = 1;
      for (let r = 60; r < Math.max(w, h); r += 60) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.38, r * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(232, 200, 122, 0.14)";
      ctx.setLineDash([3, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      this.drawDrops(ctx, time);
      this.drawEnemies(ctx);
      this.drawProjectiles(ctx);
      this.drawPlayer(ctx, time);
      this.drawParticles(ctx);
      ctx.restore();
    },

    drawDrops(ctx, time) {
      this.drops.forEach((drop) => {
        const pulse = 1 + Math.sin(time * 5 + drop.x * 0.02) * 0.12;
        ctx.save();
        ctx.translate(drop.x, drop.y);
        ctx.rotate(time * 0.8);
        ctx.globalAlpha = Math.min(1, drop.life / 1.2);
        ctx.fillStyle = drop.color;
        if (drop.kind === "gold") {
          ctx.beginPath();
          ctx.arc(0, 0, drop.radius * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,245,202,.85)";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -drop.radius * 1.4 * pulse);
          ctx.lineTo(drop.radius * pulse, 0);
          ctx.lineTo(0, drop.radius * 1.4 * pulse);
          ctx.lineTo(-drop.radius * pulse, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    },

    drawEnemies(ctx) {
      this.enemies.forEach((enemy) => {
        if (enemy.dead) return;
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        const color = enemy.flash > 0 ? "#FFFFFF" : enemy.color;
        const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, enemy.radius * 2.5);
        glow.addColorStop(0, color + "88");
        glow.addColorStop(1, color + "00");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(255,255,255,.48)";
        ctx.lineWidth = enemy.kind === "elite" ? 2 : 1;
        ctx.beginPath();
        if (enemy.kind === "elite") {
          ctx.moveTo(0, -enemy.radius);
          ctx.lineTo(enemy.radius * 0.88, -enemy.radius * 0.15);
          ctx.lineTo(enemy.radius * 0.62, enemy.radius * 0.86);
          ctx.lineTo(-enemy.radius * 0.62, enemy.radius * 0.86);
          ctx.lineTo(-enemy.radius * 0.88, -enemy.radius * 0.15);
          ctx.closePath();
        } else {
          ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        if (enemy.hp < enemy.maxHp || enemy.kind === "elite") {
          const barWidth = enemy.radius * 2.4;
          ctx.fillStyle = "rgba(4,10,18,.75)";
          ctx.fillRect(-barWidth / 2, -enemy.radius - 9, barWidth, 3);
          ctx.fillStyle = enemy.kind === "elite" ? "#B388FF" : "#E68B83";
          ctx.fillRect(-barWidth / 2, -enemy.radius - 9, barWidth * Math.max(0, enemy.hp / enemy.maxHp), 3);
        }
        if (enemy.affinity && enemy.elementMarks && enemy.elementMarks[enemy.affinity] > this.elapsed) {
          const affinity = global.FantasySurvivor.Elements.get(enemy.affinity);
          if (affinity) {
            ctx.strokeStyle = affinity.color;
            ctx.globalAlpha = 0.66;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, enemy.radius + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        if (enemy.freezeTime > 0) {
          ctx.strokeStyle = "#B3E5FC";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      });
    },

    drawProjectiles(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.projectiles.forEach((shot) => {
        const gradient = ctx.createRadialGradient(shot.x, shot.y, 0, shot.x, shot.y, shot.radius * 3.8);
        gradient.addColorStop(0, "#FFFFFF");
        gradient.addColorStop(0.28, shot.color);
        gradient.addColorStop(1, shot.color + "00");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, shot.radius * 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shot.color;
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    },

    drawPlayer(ctx, time) {
      if (!this.player) return;
      const p = this.player;
      const color = this.element ? this.element.color : "#4FC3F7";
      const bob = Math.sin(time * 4) * 1.5;
      const blink = p.invuln > 0 && Math.floor(time * 18) % 2 === 0;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.globalAlpha = blink ? 0.48 : 1;

      const aura = ctx.createRadialGradient(0, 0, 2, 0, 0, 48);
      aura.addColorStop(0, color + "99");
      aura.addColorStop(1, color + "00");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.globalAlpha *= 0.8;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 25, 10, time * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = blink ? 0.48 : 1;

      const orb = ctx.createRadialGradient(-5, -6, 1, 0, 0, 17);
      orb.addColorStop(0, "#FFFFFF");
      orb.addColorStop(0.27, color);
      orb.addColorStop(1, "#193B57");
      ctx.fillStyle = orb;
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },

    drawParticles(ctx) {
      if (!this.particlesEnabled) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.particles.forEach((particle) => {
        ctx.globalAlpha = Math.max(0, particle.alpha);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  };

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Game = Game;
})(window);
