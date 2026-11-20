/*
 * 战斗核心：移动、自动攻击、敌人刷新、碰撞、掉落、升级与结算。
 * 局内成长统一由升级三选一的祝福卡驱动，不再包含角色元素或元素反应系统。
 */
(function (global) {
  "use strict";

  const CONFIG = Object.freeze({
    player: {
      hp: 3,
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
    },
    progression: { goldPerLevel: 1, expPerLevel: 1 },
    boss: {
      firstLevel: 10,
      levelInterval: 10,
      baseHp: 700,
      hpPerLevel: 90,
      radius: 46,
      speed: 46,
      contactDamage: 12,
      attackInterval: 2.25,
      chargeTell: 0.82,
      chargeSpeed: 690,
      chargeDistance: 760,
      barrierTell: 0.9,
      barrierDuration: 3.4,
      barrierCooldown: 0.75,
      summonCount: 3
    }
  });

  const THEME_COLOR = "#70C8E8";
  const PROJECTILE_CRIT_COLOR = "#F0C56A";

  const Game = {
    CONFIG,

    backgroundCanvas: null,
    backgroundContext: null,
    arenaCanvas: null,
    arenaContext: null,
    width: 0,
    height: 0,
    arenaWidth: 0,
    arenaHeight: 0,
    viewWidth: 0,
    viewHeight: 0,
    cameraZoom: 1,
    cameraX: 0,
    cameraY: 0,
    worldScale: 4.2,

    stars: [],
    motes: [],
    enemies: [],
    projectiles: [],
    drops: [],
    particles: [],
    vortices: [],
    enemyGrid: new Map(),
    nextEnemyId: 1,
    boss: null,
    bossActive: false,
    bossQueue: [],
    bossBarriers: [],
    bossAnnouncement: "",
    bossAnnouncementTimer: 0,

    player: null,
    keys: new Set(),
    joystickElement: null,
    joystickKnob: null,
    joystickPointerId: null,
    joystickPosition: { x: 0.86, y: 0.78 },
    touchMoveX: 0,
    touchMoveY: 0,

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
    pendingLevelUps: 0,
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
      this.joystickElement = options.joystickElement || null;
      this.joystickKnob = options.joystickKnob || null;
      this.bindJoystick();

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
        global.addEventListener("orientationchange", this._onResize, { passive: true });
        if (typeof global.ResizeObserver === "function" && this.arenaCanvas && this.arenaCanvas.parentElement) {
          this._resizeObserver = new global.ResizeObserver(this._onResize);
          this._resizeObserver.observe(this.arenaCanvas.parentElement);
        }
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

    bindJoystick() {
      const element = this.joystickElement;
      if (!element || element.dataset.bound === "true") return;
      element.dataset.bound = "true";
      const move = (event) => {
        if (this.joystickPointerId !== event.pointerId) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxTravel = Math.max(12, Math.min(rect.width, rect.height) * 0.31);
        let dx = event.clientX - centerX;
        let dy = event.clientY - centerY;
        const length = Math.hypot(dx, dy);
        if (length > maxTravel) {
          dx = dx / length * maxTravel;
          dy = dy / length * maxTravel;
        }
        this.touchMoveX = dx / maxTravel;
        this.touchMoveY = dy / maxTravel;
        if (this.joystickKnob) {
          this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }
        event.preventDefault();
      };
      const release = (event) => {
        if (this.joystickPointerId !== event.pointerId) return;
        this.joystickPointerId = null;
        this.touchMoveX = 0;
        this.touchMoveY = 0;
        if (this.joystickKnob) this.joystickKnob.style.transform = "translate(-50%, -50%)";
        if (element.hasPointerCapture && element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
        event.preventDefault();
      };
      element.addEventListener("pointerdown", (event) => {
        if (!this.active || this.paused) return;
        this.joystickPointerId = event.pointerId;
        if (element.setPointerCapture) element.setPointerCapture(event.pointerId);
        move(event);
        event.preventDefault();
      });
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", release);
      element.addEventListener("pointercancel", release);
      element.addEventListener("lostpointercapture", release);
    },

    setJoystickPosition(position) {
      const rawX = Number(position && position.x);
      const rawY = Number(position && position.y);
      const x = Math.max(0.08, Math.min(0.92, Number.isFinite(rawX) ? rawX : 0.86));
      const y = Math.max(0.10, Math.min(0.90, Number.isFinite(rawY) ? rawY : 0.78));
      this.joystickPosition = { x, y };
      this.applyJoystickPosition();
      return this.joystickPosition;
    },

    applyJoystickPosition() {
      const element = this.joystickElement;
      if (!element) return;
      element.style.left = `${this.joystickPosition.x * 100}%`;
      element.style.top = `${this.joystickPosition.y * 100}%`;
      element.style.right = "auto";
      element.style.bottom = "auto";
      element.style.transform = "translate(-50%, -50%)";
    },

    resetJoystick() {
      this.joystickPointerId = null;
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      if (this.joystickKnob) this.joystickKnob.style.transform = "translate(-50%, -50%)";
    },

    setCallbacks(callbacks) {
      this.callbacks = Object.assign({}, callbacks || {});
    },

    setProgression(saveData, shardMultiplier) {
      this.saveData = saveData || null;
      this.shardMultiplier = Number(shardMultiplier) || 1;
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
        this.viewWidth = arena.width;
        this.viewHeight = arena.height;
        const mobile = (global.matchMedia && global.matchMedia("(pointer: coarse), (max-width: 900px)").matches) || this.viewWidth <= 900;
        // 手机上缩小镜头倍率，减少角色与怪物占屏比例，扩大可视范围。
        this.cameraZoom = mobile ? 0.66 : 0.84;
        this.arenaWidth = Math.max(this.viewWidth / this.cameraZoom * this.worldScale, 2200);
        this.arenaHeight = Math.max(this.viewHeight / this.cameraZoom * this.worldScale, 1600);
        if (this.player) {
          this.keepPlayerInBounds();
          this.updateCamera();
        } else {
          this.cameraX = Math.max(0, (this.arenaWidth - this.viewWidth / this.cameraZoom) / 2);
          this.cameraY = Math.max(0, (this.arenaHeight - this.viewHeight / this.cameraZoom) / 2);
        }
        this.applyJoystickPosition();
      }
    },

    updateCamera() {
      if (!this.player || !this.viewWidth || !this.viewHeight) return;
      const visibleWidth = this.viewWidth / this.cameraZoom;
      const visibleHeight = this.viewHeight / this.cameraZoom;
      this.cameraX = Math.max(0, Math.min(this.arenaWidth - visibleWidth, this.player.x - visibleWidth / 2));
      this.cameraY = Math.max(0, Math.min(this.arenaHeight - visibleHeight, this.player.y - visibleHeight / 2));
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
      if (event.code === "KeyJ" && this.inRun && this.active && !this.paused && !event.repeat) {
        event.preventDefault();
        this.cheatClearScreen();
        return;
      }
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

    start() {
      this.clearRunEntities();

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
      this.pendingLevelUps = 0;
      this.boss = null;
      this.bossActive = false;
      this.bossQueue = [];
      this.bossBarriers.length = 0;
      this.bossAnnouncement = "";
      this.bossAnnouncementTimer = 0;
      this.shakeTime = 0;
      this.shakeStrength = 0;
      this.keys.clear();
      this.resetJoystick();

      this.resize();
      const permanent = (this.saveData && this.saveData.permanentUpgrades) || {};
      const shardMultiplier = this.shardMultiplier || 1;
      const startingHearts = Math.max(3, Math.min(20, Math.floor((3 + (permanent.maxHp || 0)) * shardMultiplier)));
      const startingDamage = (CONFIG.player.damage + (permanent.damage || 0) * 1.5) * shardMultiplier;
      this.player = global.FantasySurvivor.Entities.createPlayer({
        x: this.arenaWidth / 2,
        y: this.arenaHeight / 2,
        hp: startingHearts,
        maxHp: startingHearts,
        speed: CONFIG.player.speed,
        damage: startingDamage,
        attackInterval: CONFIG.player.attackInterval,
        attackRange: CONFIG.player.attackRange,
        projectileSpeed: CONFIG.player.projectileSpeed,
        projectileRadius: CONFIG.player.projectileRadius,
        radius: CONFIG.player.radius,
        invuln: 0,
        exp: 0,
        level: 1,
        pickupRadius: CONFIG.player.pickupRadius,
        projectileCount: 1, projectilePierce: 0,
        ricochetChance: 0, critChance: 0, critMultiplier: 1.8,
        damageReduction: 0,
        buffCount: 0,
        petCount: 0,
        petDamage: startingDamage * 0.9,
        petChargeDistance: 220,
        petChargeWidth: 28,
        petChargeInterval: 1.35,
        petChargeSpeed: 900,
        petTargetRange: 390,
        petOrbitRadius: 58,
        petAttackTimers: [],
        petCharges: [],
        vortexUnlocked: false, vortexShotCounter: 0, vortexShotsPerSummon: 8,
        vortexCount: 1, vortexDamage: 8, vortexRadius: 102,
        vortexDuration: 1.0, vortexPullStrength: 190,
        fortuneUnlocked: false,
        fortuneDamage: 7,
        fortuneRadius: 100,
        fortuneAuraDuration: 1.0,
        fortuneAuraTimer: 0,
        fortuneKillHealEvery: Infinity,
        fortuneKillCounter: 0,
        fortuneRegenInterval: Infinity,
        fortuneRegenTimer: 0,
        bossBarrierCooldown: 0,
        goldMultiplier: 1 + (permanent.goldRate || 0) * 0.08,
        expMultiplier: 1 + (permanent.expRate || 0) * 0.07,
        globalMultiplier: shardMultiplier
      });
      this.updateCamera();

      this.lastTime = performance.now();
      this.updateHUD(true);
      this.renderArena(this.elapsed);
    },

    pause() {
      if (!this.active || this.paused) return;
      this.paused = true;
      this.keys.clear();
      this.resetJoystick();
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
      this.resetJoystick();
      this.player = null;
      this.clearRunEntities();
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
      this.vortices.length = 0;
      this.enemyGrid.clear();
      this.nextEnemyId = 1;
      this.boss = null;
      this.bossActive = false;
      this.bossQueue = [];
      this.bossBarriers.length = 0;
      this.bossAnnouncement = "";
      this.bossAnnouncementTimer = 0;
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
      this.player.bossBarrierCooldown = Math.max(0, (this.player.bossBarrierCooldown || 0) - dt);
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      this.bossAnnouncementTimer = Math.max(0, this.bossAnnouncementTimer - dt);
      this.updatePlayerMovement(dt);
      this.updateEnemies(dt, wave);
      this.updateBossBarriers(dt);
      this.updateVortices(dt);
      this.updateFortuneAura(dt);
      this.updateFortuneTimedHealing(dt);
      this.separateEnemyBodies(80);
      this.rebuildEnemyGrid();
      this.updateAutoAttack(dt);
      this.updatePetAttacks(dt);
      this.updateProjectiles(dt);
      this.updateDrops(dt);
      this.updateParticles(dt);
      this.removeDeadEnemies();

      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.updateHUD(true);
        this.hudTimer = 0.10;
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
      dx += this.touchMoveX;
      dy += this.touchMoveY;

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
      this.updateCamera();
    },

    keepPlayerInBounds() {
      if (!this.player || !this.arenaWidth || !this.arenaHeight) return;
      const margin = this.player.radius + 5;
      this.player.x = Math.max(margin, Math.min(this.arenaWidth - margin, this.player.x));
      this.player.y = Math.max(margin, Math.min(this.arenaHeight - margin, this.player.y));
    },

    updateEnemies(dt, wave) {
      if (!this.bossActive) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.enemies.length < CONFIG.spawn.maxEnemies) {
          this.spawnEnemy(wave);
          const interval = Math.max(
            CONFIG.spawn.minimumInterval,
            CONFIG.spawn.initialInterval - (wave - 1) * CONFIG.spawn.intervalDecreasePerWave
          );
          this.spawnTimer = interval * (0.86 + Math.random() * 0.28);
        }
      }

      const p = this.player;
      for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = this.enemies[i];
        if (enemy.dead) continue;
        enemy.flash = Math.max(0, enemy.flash - dt);
        enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);

        if (enemy.isBoss) {
          this.updateBossEnemy(enemy, dt);
          continue;
        }

        const vx = p.x - enemy.x;
        const vy = p.y - enemy.y;
        const distance = Math.hypot(vx, vy) || 1;
        enemy.vx = (vx / distance) * enemy.speed;
        enemy.vy = (vy / distance) * enemy.speed;
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

    queueBossForLevel(level) {
      if (!Number.isFinite(level) || level < CONFIG.boss.firstLevel || level % CONFIG.boss.levelInterval !== 0) return;
      if (this.bossQueue.includes(level) || (this.boss && this.boss.bossLevel === level)) return;
      this.bossQueue.push(level);
      this.bossQueue.sort((a, b) => a - b);
      if (!this.bossActive) this.startNextBoss();
    },

    startNextBoss() {
      if (this.bossActive || !this.bossQueue.length || !this.player) return;
      const level = this.bossQueue.shift();
      const entities = global.FantasySurvivor.Entities;

      // Boss 入场时清空所有普通小怪及旧战斗投射物，战斗期间暂停普通刷怪。
      this.enemies.forEach(enemy => entities.release("enemy", enemy));
      this.enemies.length = 0;
      this.projectiles.forEach(shot => entities.release("projectile", shot));
      this.projectiles.length = 0;
      this.enemyGrid.clear();
      this.bossBarriers.length = 0;

      const waveScale = 1 + (this.getWave() - 1) * 0.14;
      const hp = Math.round((CONFIG.boss.baseHp + level * CONFIG.boss.hpPerLevel) * waveScale);
      const visibleWidth = this.viewWidth / this.cameraZoom;
      const visibleHeight = this.viewHeight / this.cameraZoom;
      const x = Math.max(CONFIG.boss.radius + 12, Math.min(this.arenaWidth - CONFIG.boss.radius - 12, this.player.x + (Math.random() - 0.5) * visibleWidth * 0.38));
      const y = Math.max(CONFIG.boss.radius + 18, Math.min(this.arenaHeight - CONFIG.boss.radius - 18, this.player.y - visibleHeight * 0.28));
      const boss = entities.acquire("enemy", {
        id: this.nextEnemyId++, isBoss: true, bossLevel: level,
        x, y, hp, maxHp: hp, speed: CONFIG.boss.speed + level * 0.65,
        damage: CONFIG.boss.contactDamage, radius: CONFIG.boss.radius,
        kind: "boss", color: "#8D58D8", flash: 0, contactCooldown: 0,
        dead: false, bossMode: "idle", bossModeTimer: 0,
        bossAttackTimer: CONFIG.boss.attackInterval, bossNextAttack: 0,
        chargeDirX: 0, chargeDirY: 0, chargeRemaining: 0,
        chargeHit: false, barrierCooldown: 0
      });
      this.enemies.push(boss);
      this.boss = boss;
      this.bossActive = true;
      this.spawnTimer = 999999;
      this.bossAnnouncement = `BOSS 来袭 · Lv.${level}`;
      this.bossAnnouncementTimer = 2.4;
      this.spawnBurst(boss.x, boss.y, "#C9A2FF", 42, 190);
      this.updateHUD(true);
    },

    updateBossEnemy(boss, dt) {
      const p = this.player;
      if (!p || boss.dead) return;

      if (boss.bossMode === "chargeTell") {
        boss.bossModeTimer -= dt;
        if (boss.bossModeTimer <= 0) {
          boss.bossMode = "charge";
          boss.chargeRemaining = Math.max(CONFIG.boss.chargeDistance, Math.hypot(this.viewWidth, this.viewHeight) / this.cameraZoom * 1.2);
          boss.chargeHit = false;
        }
        return;
      }

      if (boss.bossMode === "charge") {
        const step = Math.min(boss.chargeRemaining, CONFIG.boss.chargeSpeed * dt);
        const oldX = boss.x;
        const oldY = boss.y;
        boss.x += boss.chargeDirX * step;
        boss.y += boss.chargeDirY * step;
        boss.chargeRemaining -= step;
        if (!boss.chargeHit) {
          const hitRadius = boss.radius + p.radius + 3;
          if (this.distancePointToSegmentSquared(p.x, p.y, oldX, oldY, boss.x, boss.y) <= hitRadius * hitRadius) {
            this.damagePlayer(boss.damage + 5);
            boss.chargeHit = true;
          }
        }
        if (boss.chargeRemaining <= 0 || boss.x < -boss.radius || boss.y < -boss.radius || boss.x > this.arenaWidth + boss.radius || boss.y > this.arenaHeight + boss.radius) {
          boss.bossMode = "idle";
          boss.bossAttackTimer = 1.05;
          boss.x = Math.max(boss.radius, Math.min(this.arenaWidth - boss.radius, boss.x));
          boss.y = Math.max(boss.radius, Math.min(this.arenaHeight - boss.radius, boss.y));
        }
        return;
      }

      // Boss 闲置时缓慢追踪玩家，保留走位空间。
      const dx = p.x - boss.x;
      const dy = p.y - boss.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance > 155) {
        boss.x += dx / distance * boss.speed * 0.52 * dt;
        boss.y += dy / distance * boss.speed * 0.52 * dt;
      }
      const contactDistance = p.radius + boss.radius;
      const currentDistance = Math.hypot(p.x - boss.x, p.y - boss.y);
      if (currentDistance < contactDistance && boss.contactCooldown <= 0) {
        boss.contactCooldown = 0.9;
        this.damagePlayer(boss.damage);
      }

      boss.bossAttackTimer -= dt;
      if (boss.bossAttackTimer > 0) return;
      const pattern = boss.bossNextAttack % 3;
      boss.bossNextAttack += 1;
      if (pattern === 0) {
        const aimX = p.x - boss.x;
        const aimY = p.y - boss.y;
        const aimLength = Math.hypot(aimX, aimY) || 1;
        boss.chargeDirX = aimX / aimLength;
        boss.chargeDirY = aimY / aimLength;
        boss.bossMode = "chargeTell";
        boss.bossModeTimer = CONFIG.boss.chargeTell;
        this.bossAnnouncement = "警告：Boss 即将冲撞";
        this.bossAnnouncementTimer = CONFIG.boss.chargeTell;
      } else if (pattern === 1) {
        this.spawnBossBarrier();
        boss.bossAttackTimer = CONFIG.boss.barrierTell + CONFIG.boss.barrierDuration + 0.6;
      } else {
        this.spawnBossMinions(boss);
        boss.bossAttackTimer = 2.0;
      }
    },

    spawnBossBarrier() {
      const p = this.player;
      const left = this.cameraX;
      const top = this.cameraY;
      const w = this.viewWidth / this.cameraZoom;
      const h = this.viewHeight / this.cameraZoom;
      const vertical = Math.random() < 0.5;
      let x1, y1, x2, y2;
      if (vertical) {
        const offset = (Math.random() < 0.5 ? -1 : 1) * Math.max(80, w * (0.13 + Math.random() * 0.13));
        const x = Math.max(left + 24, Math.min(left + w - 24, p.x + offset));
        x1 = x; y1 = top + 12; x2 = x; y2 = top + h - 12;
      } else {
        const offset = (Math.random() < 0.5 ? -1 : 1) * Math.max(70, h * (0.18 + Math.random() * 0.14));
        const y = Math.max(top + 24, Math.min(top + h - 24, p.y + offset));
        x1 = left + 12; y1 = y; x2 = left + w - 12; y2 = y;
      }
      this.bossBarriers.push({ x1, y1, x2, y2, phase: "warning", timer: CONFIG.boss.barrierTell, activeDuration: CONFIG.boss.barrierDuration, hitCooldown: 0 });
      this.bossAnnouncement = "警告：带电屏障形成";
      this.bossAnnouncementTimer = CONFIG.boss.barrierTell;
    },

    updateBossBarriers(dt) {
      if (!this.bossBarriers.length) return;
      const p = this.player;
      for (let i = this.bossBarriers.length - 1; i >= 0; i -= 1) {
        const barrier = this.bossBarriers[i];
        barrier.timer -= dt;
        if (barrier.phase === "warning" && barrier.timer <= 0) {
          barrier.phase = "active";
          barrier.timer = barrier.activeDuration;
        } else if (barrier.phase === "active") {
          barrier.hitCooldown = Math.max(0, barrier.hitCooldown - dt);
          const distanceSq = this.distancePointToSegmentSquared(p.x, p.y, barrier.x1, barrier.y1, barrier.x2, barrier.y2);
          if (distanceSq <= (p.radius + 9) ** 2 && barrier.hitCooldown <= 0) {
            this.damagePlayer(1);
            barrier.hitCooldown = CONFIG.boss.barrierCooldown;
          }
          if (barrier.timer <= 0) this.bossBarriers.splice(i, 1);
        }
      }
    },

    spawnBossMinions(boss) {
      const entities = global.FantasySurvivor.Entities;
      const waveScale = 1 + (this.getWave() - 1) * 0.12;
      for (let i = 0; i < CONFIG.boss.summonCount; i += 1) {
        const angle = Math.PI * 2 * i / CONFIG.boss.summonCount + this.elapsed;
        const x = Math.max(22, Math.min(this.arenaWidth - 22, boss.x + Math.cos(angle) * 78));
        const y = Math.max(22, Math.min(this.arenaHeight - 22, boss.y + Math.sin(angle) * 78));
        const baseSpeed = CONFIG.enemy.eliteSpeed + (this.getWave() - 1) * 1.5;
        const hp = Math.round(CONFIG.enemy.eliteHp * waveScale * 0.8);
        this.enemies.push(entities.acquire("enemy", {
          id: this.nextEnemyId++, isBossMinion: true,
          x, y, hp, maxHp: hp, speed: baseSpeed * 2,
          damage: CONFIG.enemy.eliteDamage * waveScale,
          radius: 14, kind: "bossElite", color: "#B56BFF",
          contactCooldown: 0, flash: 0, dead: false
        }));
      }
      this.bossAnnouncement = "Boss 召唤了 3 只紫色精英";
      this.bossAnnouncementTimer = 1.9;
      this.spawnBurst(boss.x, boss.y, "#B66CFF", 26, 145);
    },

    killBoss(boss) {
      if (!boss || boss.dead) return;
      boss.dead = true;
      this.runKills += 1;
      this.spawnBurst(boss.x, boss.y, "#D3B4FF", 64, 230);
      this.spawnDrop(boss.x, boss.y, "exp", Math.max(35, Math.floor(boss.bossLevel * 5)));
      this.spawnDrop(boss.x + 22, boss.y, "gold", 35 + boss.bossLevel);
      // Boss 召唤的小怪随 Boss 一同退场，普通刷怪随后恢复。
      for (const enemy of this.enemies) {
        if (enemy !== boss && enemy.isBossMinion && !enemy.dead) {
          enemy.dead = true;
          this.runKills += 1;
        }
      }
      this.boss = null;
      this.bossActive = false;
      this.bossBarriers.length = 0;
      this.bossAnnouncement = "Boss 已击败！继续冒险";
      this.bossAnnouncementTimer = 2.4;
      this.spawnTimer = 1.0;
      this.updateHUD(true);
      if (this.bossQueue.length) this.startNextBoss();
    },

    cheatClearScreen() {
      if (!this.inRun || !this.active || this.paused) return false;
      const targets = this.enemies.slice();
      for (const enemy of targets) {
        if (!enemy.dead) this.damageEnemy(enemy, enemy.hp + 1, true);
      }
      this.bossBarriers.length = 0;
      this.bossAnnouncement = "开发作弊：清屏秒杀";
      this.bossAnnouncementTimer = 1.6;
      this.updateHUD(true);
      return true;
    },

    spawnEnemy(wave) {
      const entities = global.FantasySurvivor.Entities;
      const w = this.arenaWidth;
      const h = this.arenaHeight;
      if (w < 20 || h < 20) return;

      const side = Math.floor(Math.random() * 4);
      const pad = CONFIG.spawn.edgePadding;
      const visibleWidth = this.viewWidth / this.cameraZoom;
      const visibleHeight = this.viewHeight / this.cameraZoom;
      const left = this.cameraX;
      const top = this.cameraY;
      let x;
      let y;

      if (side === 0) { x = left + Math.random() * visibleWidth; y = top - pad; }
      else if (side === 1) { x = left + visibleWidth + pad; y = top + Math.random() * visibleHeight; }
      else if (side === 2) { x = left + Math.random() * visibleWidth; y = top + visibleHeight + pad; }
      else { x = left - pad; y = top + Math.random() * visibleHeight; }
      x = Math.max(8, Math.min(w - 8, x));
      y = Math.max(8, Math.min(h - 8, y));

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

      // 新敌人尽量从未被占据的位置入场，避免刚生成时就重叠。
      for (let attempt = 0; attempt < 18; attempt += 1) {
        let occupied = false;
        for (const other of this.enemies) {
          if (other.dead) continue;
          const gap = radius + other.radius + 3;
          if ((other.x - x) ** 2 + (other.y - y) ** 2 < gap * gap) {
            occupied = true;
            break;
          }
        }
        if (!occupied) break;
        if (side === 0 || side === 2) x = Math.random() * w;
        else y = Math.random() * h;
      }

      this.enemies.push(entities.acquire("enemy", {
        id: this.nextEnemyId++,
        x, y, hp, maxHp: hp, speed, damage, radius, kind, color,
        contactCooldown: 0, flash: 0, dead: false
      }));
    },

    // 逐对推开相交的敌人。多轮松弛可处理一大群敌人挤在同一位置的情况。
    separateEnemyBodies(iterations = 8) {
      const active = this.enemies.filter(enemy => !enemy.dead && !enemy.isBoss);
      if (active.length < 2) return;
      const passes = Math.max(1, Math.min(80, iterations | 0));
      for (let pass = 0; pass < passes; pass += 1) {
        let moved = false;
        for (let i = 0; i < active.length - 1; i += 1) {
          const a = active[i];
          for (let j = i + 1; j < active.length; j += 1) {
            const b = active[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let distanceSq = dx * dx + dy * dy;
            const minDistance = a.radius + b.radius + 1.25;
            if (distanceSq >= minDistance * minDistance) continue;

            let distance;
            if (distanceSq < 0.0001) {
              // 同坐标时以实体 ID 产生稳定方向，避免随机抖动。
              const angle = ((a.id * 97 + b.id * 57) % 360) * Math.PI / 180;
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              distance = 1;
            } else {
              distance = Math.sqrt(distanceSq);
              dx /= distance;
              dy /= distance;
            }

            const overlap = minDistance - distance;
            const push = overlap * 0.51 + 0.015;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
            moved = true;
          }
        }
        if (!moved) break;
      }
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

    findNearestEnemyFrom(x, y, range, excludedIds = []) {
      const candidates = this.queryEnemies(x, y, range);
      const excluded = new Set(excludedIds || []);
      let nearest = null;
      let bestDistance = range * range;
      for (const enemy of candidates) {
        if (enemy.dead || excluded.has(enemy.id)) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestDistance) {
          bestDistance = distanceSq;
          nearest = enemy;
        }
      }
      return nearest;
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
      const baseAngle = Math.atan2(dy, dx);
      const count = Math.max(1, Math.min(7, Math.floor(p.projectileCount || 1)));
      const spreadStep = 0.12;
      const entities = global.FantasySurvivor.Entities;

      for (let i = 0; i < count; i += 1) {
        const angle = baseAngle + (i - (count - 1) / 2) * spreadStep;
        const critical = p.critChance > 0 && Math.random() < p.critChance;
        const projectile = entities.acquire("projectile", {
          x: p.x,
          y: p.y,
          vx: Math.cos(angle) * p.projectileSpeed,
          vy: Math.sin(angle) * p.projectileSpeed,
          damage: p.damage * (critical ? p.critMultiplier : 1),
          radius: p.projectileRadius,
          life: CONFIG.projectile.life,
          color: critical ? PROJECTILE_CRIT_COLOR : THEME_COLOR,
          isCritical: critical,
          isPet: false,
          ricochetChance: p.ricochetChance || 0,
          ricochetsLeft: 3,
          pierceRemaining: Math.max(0, Math.floor(p.projectilePierce || 0)),
          hitEnemies: [],
          dead: false
        });
        this.projectiles.push(projectile);
      }

      this.spawnBurst(p.x, p.y, THEME_COLOR, 2 + count, 14);
      p.attackTimer = p.attackInterval;

      // 每轮主角射击计数一次，与本轮子弹数量无关。
      if (p.vortexUnlocked) {
        p.vortexShotCounter += 1;
        while (p.vortexShotCounter >= p.vortexShotsPerSummon) {
          p.vortexShotCounter -= p.vortexShotsPerSummon;
          this.spawnVortices(target);
        }
      }
    },

    updatePetAttacks(dt) {
      const p = this.player;
      if (!p || !p.petCount) return;
      if (!Array.isArray(p.petAttackTimers)) p.petAttackTimers = [];
      if (!Array.isArray(p.petCharges)) p.petCharges = [];
      while (p.petAttackTimers.length < p.petCount) p.petAttackTimers.push(0.25);
      while (p.petCharges.length < p.petCount) p.petCharges.push(null);
      p.petAttackTimers.length = p.petCount;
      p.petCharges.length = p.petCount;

      const count = p.petCount;
      const phase = this.elapsed * 0.95;
      for (let i = 0; i < count; i += 1) {
        let charge = p.petCharges[i];
        if (charge) {
          const step = Math.min(charge.distance - charge.travelled, charge.speed * dt);
          const nextX = charge.x + charge.dirX * step;
          const nextY = charge.y + charge.dirY * step;
          const hitWidth = charge.width * 0.5;
          for (const enemy of this.enemies) {
            if (enemy.dead || charge.hitEnemies.includes(enemy.id)) continue;
            const distanceSq = this.distancePointToSegmentSquared(enemy.x, enemy.y, charge.x, charge.y, nextX, nextY);
            const collisionRadius = hitWidth + enemy.radius;
            if (distanceSq <= collisionRadius * collisionRadius) {
              charge.hitEnemies.push(enemy.id);
              this.damageEnemy(enemy, charge.damage, true);
              this.spawnBurst(enemy.x, enemy.y, "#C7B4FF", 3, 30);
            }
          }
          charge.x = nextX;
          charge.y = nextY;
          charge.travelled += step;
          if (charge.travelled >= charge.distance - 0.5) {
            p.petCharges[i] = null;
            p.petAttackTimers[i] = p.petChargeInterval;
          }
          continue;
        }

        p.petAttackTimers[i] -= dt;
        if (p.petAttackTimers[i] > 0) continue;
        const angle = phase + i * Math.PI * 2 / count;
        const petX = p.x + Math.cos(angle) * p.petOrbitRadius;
        const petY = p.y + Math.sin(angle) * p.petOrbitRadius * 0.66;
        const target = this.findNearestEnemyFrom(petX, petY, p.petTargetRange);
        if (!target) {
          p.petAttackTimers[i] = 0.2;
          continue;
        }

        const dx = target.x - petX;
        const dy = target.y - petY;
        const length = Math.hypot(dx, dy) || 1;
        p.petCharges[i] = {
          x: petX, y: petY, startX: petX, startY: petY,
          dirX: dx / length, dirY: dy / length,
          travelled: 0, distance: p.petChargeDistance,
          speed: p.petChargeSpeed, width: p.petChargeWidth,
          damage: p.petDamage, hitEnemies: []
        };
        this.spawnBurst(petX, petY, "#B99AFF", 4, 35);
      }
    },

    distancePointToSegmentSquared(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq <= 0.0001) return (px - x1) ** 2 + (py - y1) ** 2;
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
      const nearestX = x1 + t * dx;
      const nearestY = y1 + t * dy;
      return (px - nearestX) ** 2 + (py - nearestY) ** 2;
    },

    spawnVortices(target) {
      const p = this.player;
      if (!p || !p.vortexUnlocked) return;
      const amount = Math.max(1, Math.min(4, p.vortexCount || 1));
      const baseAngle = target ? Math.atan2(target.y - p.y, target.x - p.x) : this.elapsed;
      for (let i = 0; i < amount; i += 1) {
        const angle = baseAngle + (amount > 1 ? i * Math.PI * 2 / amount : 0) + (Math.random() - 0.5) * 0.5;
        const offset = amount > 1 ? 46 : 0;
        const x = (target ? target.x : p.x) + Math.cos(angle) * offset;
        const y = (target ? target.y : p.y) + Math.sin(angle) * offset;
        this.vortices.push({
          x, y,
          radius: p.vortexRadius,
          duration: p.vortexDuration,
          maxDuration: p.vortexDuration,
          damage: p.vortexDamage,
          pullStrength: p.vortexPullStrength,
          rotation: Math.random() * Math.PI * 2
        });
      }
      // 限制场上漩涡总量，避免后期特效与计算量无限累积。
      while (this.vortices.length > 12) this.vortices.shift();
    },

    updateVortices(dt) {
      if (!this.vortices.length) return;
      for (let i = this.vortices.length - 1; i >= 0; i -= 1) {
        const vortex = this.vortices[i];
        vortex.duration -= dt;
        vortex.rotation += dt * 2.2;
        if (vortex.duration <= 0) {
          this.vortices.splice(i, 1);
          continue;
        }

        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          const dx = vortex.x - enemy.x;
          const dy = vortex.y - enemy.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= vortex.radius) continue;

          // 越靠近外缘牵引越弱，接近中心时保留少量回旋空间。
          const normalized = 1 - distance / vortex.radius;
          const pull = Math.min(Math.max(0, distance - 4), vortex.pullStrength * normalized * dt);
          if (distance > 0.001 && pull > 0) {
            enemy.x += dx / distance * pull;
            enemy.y += dy / distance * pull;
          }
          this.damageEnemy(enemy, vortex.damage * dt, false);
        }
      }
    },

    updateFortuneAura(dt) {
      const p = this.player;
      if (!p || !p.fortuneUnlocked || p.fortuneAuraTimer <= 0) return;
      p.fortuneAuraTimer = Math.max(0, p.fortuneAuraTimer - dt);
      const radiusSq = p.fortuneRadius * p.fortuneRadius;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        if (dx * dx + dy * dy <= radiusSq) {
          this.damageEnemy(enemy, p.fortuneDamage * dt, false);
        }
      }
    },

    updateFortuneTimedHealing(dt) {
      const p = this.player;
      if (!p || !p.fortuneUnlocked || !Number.isFinite(p.fortuneRegenInterval)) return;
      p.fortuneRegenTimer += dt;
      if (p.fortuneRegenTimer >= p.fortuneRegenInterval) {
        p.fortuneRegenTimer -= p.fortuneRegenInterval;
        if (p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          this.updateHUD(true);
        }
      }
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
          if (enemy.dead || (shot.hitEnemies && shot.hitEnemies.includes(enemy.id))) continue;
          const dx = enemy.x - shot.x;
          const dy = enemy.y - shot.y;
          const rr = enemy.radius + shot.radius;
          if (dx * dx + dy * dy <= rr * rr) {
            hit = enemy;
            break;
          }
        }

        if (hit) {
          if (!shot.hitEnemies) shot.hitEnemies = [];
          shot.hitEnemies.push(hit.id);
          this.damageEnemy(hit, shot.damage, true);
          this.spawnBurst(shot.x, shot.y, shot.color, shot.isCritical ? 7 : 4, shot.isCritical ? 58 : 42);

          const canRicochet = !shot.isPet && shot.ricochetsLeft > 0 &&
            shot.ricochetChance > 0 && Math.random() < shot.ricochetChance;
          const nextTarget = canRicochet
            ? this.findNearestEnemyFrom(hit.x, hit.y, 230, shot.hitEnemies)
            : null;

          if (nextTarget) {
            const dx = nextTarget.x - hit.x;
            const dy = nextTarget.y - hit.y;
            const distance = Math.hypot(dx, dy) || 1;
            const speed = Math.hypot(shot.vx, shot.vy) || CONFIG.player.projectileSpeed;
            shot.x = hit.x;
            shot.y = hit.y;
            shot.vx = dx / distance * speed;
            shot.vy = dy / distance * speed;
            shot.life = Math.max(shot.life, 0.42);
            shot.ricochetsLeft -= 1;
            this.spawnBurst(hit.x, hit.y, "#9FE7F2", 5, 36);
          } else if (shot.pierceRemaining > 0) {
            shot.pierceRemaining -= 1;
          } else {
            entities.release("projectile", this.projectiles.splice(i, 1)[0]);
          }
        }
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
      if (enemy.isBoss) {
        this.killBoss(enemy);
        return;
      }
      enemy.dead = true;
      this.runKills += 1;
      const p = this.player;
      if (p && p.fortuneUnlocked && Number.isFinite(p.fortuneKillHealEvery)) {
        p.fortuneKillCounter += 1;
        if (p.fortuneKillCounter >= p.fortuneKillHealEvery) {
          p.fortuneKillCounter = 0;
          if (p.hp < p.maxHp) {
            p.hp = Math.min(p.maxHp, p.hp + 1);
            this.updateHUD(true);
          }
        }
      }
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
            this.runGold += Math.max(1, Math.floor(drop.value * (p.goldMultiplier || 1) * (p.globalMultiplier || 1)));
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
      const gained = Math.max(0, amount * (p.expMultiplier || 1) * (p.globalMultiplier || 1));
      this.runExperience += gained;
      p.exp += gained;
      while (p.exp >= this.expToNextLevel(p.level)) {
        p.exp -= this.expToNextLevel(p.level);
        p.level += 1;
        this.pendingLevelUps += 1;
        this.queueBossForLevel(p.level);
      }
      this.updateHUD(true);
      if (this.pendingLevelUps > 0 && !this.paused) {
        this.pause();
        if (typeof this.callbacks.onLevelUp === "function") this.callbacks.onLevelUp(p.level, this.pendingLevelUps);
      }
    },

    applyUpgrade(card) {
      if (!this.player || !card || typeof card.apply !== "function") return false;
      card.apply(this.player);
      this.player.buffCount = (this.player.buffCount || 0) + 1;
      this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
      this.updateHUD(true);
      return true;
    },

    continueAfterUpgrade() {
      if (this.pendingLevelUps > 0) {
        if (typeof this.callbacks.onLevelUp === "function") this.callbacks.onLevelUp(this.player.level, this.pendingLevelUps);
      } else {
        this.resume();
      }
    },

    expToNextLevel(level) {
      return Math.round(20 + 10 * Math.pow(Math.max(0, level - 1), 1.25));
    },

    damagePlayer(amount) {
      const p = this.player;
      if (!p || p.invuln > 0 || !this.active) return false;
      // 气运反噬的持续期间完全无敌，碰撞、电墙与冲撞都无法扣心。
      if (p.fortuneUnlocked && p.fortuneAuraTimer > 0) return false;
      // 生命值按整颗心计数：每次有效受击固定扣除 1 颗心。
      p.hp = Math.max(0, Math.floor(p.hp) - 1);
      p.invuln = CONFIG.player.invulnerability;
      p.hitFlash = 0.18;
      if (p.fortuneUnlocked) p.fortuneAuraTimer = p.fortuneAuraDuration;
      if (this.screenShakeEnabled) {
        this.shakeTime = 0.16;
        this.shakeStrength = 4;
      }
      this.spawnBurst(p.x, p.y, "#FF8B91", 11, 65);
      if (typeof this.callbacks.onPlayerHit === "function") {
        this.callbacks.onPlayerHit(p.hp, p.maxHp);
      }
      this.updateHUD(true);
      return true;
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

    updateHUD() {
      if (!this.player || typeof this.callbacks.onHUD !== "function") return;
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
        buffs: this.player.buffCount || 0,
        bossActive: Boolean(this.bossActive),
        bossLevel: this.boss ? this.boss.bossLevel : 0,
        bossHp: this.boss ? this.boss.hp : 0,
        bossMaxHp: this.boss ? this.boss.maxHp : 0
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
        experience: Math.floor(this.runExperience),
        wave: this.getWave()
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
      const viewW = this.viewWidth || this.arenaWidth;
      const viewH = this.viewHeight || this.arenaHeight;
      const worldW = this.arenaWidth;
      const worldH = this.arenaHeight;
      if (!ctx || !viewW || !viewH || !worldW || !worldH) return;

      ctx.clearRect(0, 0, viewW, viewH);
      ctx.save();
      if (this.shakeTime > 0 && this.screenShakeEnabled) {
        const strength = this.shakeStrength * (this.shakeTime / 0.16);
        ctx.translate((Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength);
      }

      // 固定在屏幕上的地面底色，世界物件则由摄像机变换绘制。
      const bg = ctx.createRadialGradient(viewW * 0.5, viewH * 0.46, 10, viewW * 0.5, viewH * 0.46, Math.max(viewW, viewH) * 0.86);
      bg.addColorStop(0, "#1C3B56");
      bg.addColorStop(0.55, "#10263E");
      bg.addColorStop(1, "#081525");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, viewW, viewH);

      const visibleLeft = this.cameraX;
      const visibleTop = this.cameraY;
      ctx.save();
      // 直接使用已限制在地图边界内的相机左上角；靠近地图边缘时不再把世界外区域卷入画面。
      ctx.translate(-this.cameraX * this.cameraZoom, -this.cameraY * this.cameraZoom);
      ctx.scale(this.cameraZoom, this.cameraZoom);

      // 以世界坐标绘制网格和明确的地图边界，地图不会无限延伸。
      const grid = 180;
      ctx.strokeStyle = "rgba(132, 174, 193, 0.075)";
      ctx.lineWidth = 1 / this.cameraZoom;
      ctx.beginPath();
      const startX = Math.floor(visibleLeft / grid) * grid;
      const endX = Math.min(worldW, visibleLeft + viewW / this.cameraZoom + grid);
      const startY = Math.floor(visibleTop / grid) * grid;
      const endY = Math.min(worldH, visibleTop + viewH / this.cameraZoom + grid);
      for (let x = startX; x <= endX; x += grid) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
      for (let y = startY; y <= endY; y += grid) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
      ctx.stroke();
      ctx.strokeStyle = "rgba(232, 200, 122, 0.72)";
      ctx.lineWidth = 4 / this.cameraZoom;
      ctx.setLineDash([24, 18]);
      ctx.strokeRect(0, 0, worldW, worldH);
      ctx.setLineDash([]);

      this.drawDrops(ctx, time);
      this.drawVortices(ctx, time);
      this.drawFortuneAura(ctx, time);
      this.drawBossHazards(ctx, time);
      this.drawEnemies(ctx);
      this.drawProjectiles(ctx);
      this.drawPlayer(ctx, time);
      this.drawPets(ctx, time);
      this.drawParticles(ctx);
      ctx.restore();

      // Boss 血条与公告属于屏幕 HUD，不随地图缩放。
      this.drawBossHUD(ctx);
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

        if (enemy.isBoss) {
          // 大体型紫晶守关 Boss：环形护甲、尖角与核心，确保明显区别于小怪。
          ctx.rotate(Math.sin(this.elapsed * 1.2) * 0.035);
          ctx.strokeStyle = "rgba(229,204,255,.92)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius * 1.08, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#6537A8";
          ctx.strokeStyle = "#D8B6FF";
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          for (let k = 0; k < 12; k += 1) {
            const a = k * Math.PI / 6;
            const r = k % 2 === 0 ? enemy.radius * 1.06 : enemy.radius * 0.78;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          const core = ctx.createRadialGradient(-8, -10, 2, 0, 0, enemy.radius * 0.72);
          core.addColorStop(0, "#F8EEFF");
          core.addColorStop(0.26, "#C89CFF");
          core.addColorStop(0.72, "#7D4BC2");
          core.addColorStop(1, "#321B5D");
          ctx.fillStyle = core;
          ctx.beginPath(); ctx.arc(0, 0, enemy.radius * 0.72, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#FFF7FF";
          ctx.beginPath(); ctx.ellipse(-12, -4, 4.5, 6, -0.2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(12, -4, 4.5, 6, 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#4B2A70";
          ctx.beginPath(); ctx.arc(-12, -3, 2, 0, Math.PI * 2); ctx.arc(12, -3, 2, 0, Math.PI * 2); ctx.fill();
        } else {
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(255,255,255,.48)";
        ctx.lineWidth = (enemy.kind === "elite" || enemy.kind === "bossElite") ? 2 : 1;
        ctx.beginPath();
        if (enemy.kind === "elite" || enemy.kind === "bossElite") {
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
        }

        if (!enemy.isBoss && (enemy.hp < enemy.maxHp || enemy.kind === "elite" || enemy.kind === "bossElite")) {
          const barWidth = enemy.radius * 2.4;
          ctx.fillStyle = "rgba(4,10,18,.75)";
          ctx.fillRect(-barWidth / 2, -enemy.radius - 9, barWidth, 3);
          ctx.fillStyle = (enemy.kind === "elite" || enemy.kind === "bossElite") ? "#B388FF" : "#E68B83";
          ctx.fillRect(-barWidth / 2, -enemy.radius - 9, barWidth * Math.max(0, enemy.hp / enemy.maxHp), 3);
        }
        ctx.restore();
      });
    },

    drawBossHazards(ctx, time) {
      if (this.boss && this.boss.bossMode === "chargeTell") {
        const boss = this.boss;
        const length = Math.max(CONFIG.boss.chargeDistance, Math.hypot(this.viewWidth, this.viewHeight) / this.cameraZoom * 0.72);
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(time * 18) * 0.16;
        ctx.strokeStyle = "#FF7B9C";
        ctx.lineWidth = boss.radius * 1.18;
        ctx.lineCap = "round";
        ctx.setLineDash([16, 12]);
        ctx.beginPath();
        ctx.moveTo(boss.x, boss.y);
        ctx.lineTo(boss.x + boss.chargeDirX * length, boss.y + boss.chargeDirY * length);
        ctx.stroke();
        ctx.restore();
      }

      if (!this.bossBarriers.length) return;
      ctx.save();
      this.bossBarriers.forEach(barrier => {
        const warning = barrier.phase === "warning";
        const alpha = warning ? 0.3 + Math.sin(time * 24) * 0.2 : 0.88;
        ctx.globalAlpha = alpha;
        ctx.lineCap = "round";
        ctx.strokeStyle = warning ? "#F3D67D" : "#74D9FF";
        ctx.shadowColor = warning ? "#F3D67D" : "#45BFFF";
        ctx.shadowBlur = warning ? 8 : 20;
        ctx.lineWidth = warning ? 4 : 11;
        ctx.setLineDash(warning ? [12, 10] : []);
        ctx.beginPath(); ctx.moveTo(barrier.x1, barrier.y1); ctx.lineTo(barrier.x2, barrier.y2); ctx.stroke();
        if (!warning) {
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(239,250,255,.96)";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(barrier.x1, barrier.y1); ctx.lineTo(barrier.x2, barrier.y2); ctx.stroke();
          for (let k = 0; k < 9; k += 1) {
            const t = (k + ((time * 2.7) % 1)) / 9;
            const x = barrier.x1 + (barrier.x2 - barrier.x1) * t;
            const y = barrier.y1 + (barrier.y2 - barrier.y1) * t;
            ctx.beginPath(); ctx.arc(x, y, 3 + Math.sin(time * 20 + k) * 1.3, 0, Math.PI * 2); ctx.fillStyle = "#F4FCFF"; ctx.fill();
          }
        }
      });
      ctx.restore();
    },

    drawBossHUD(ctx) {
      const boss = this.boss;
      if (boss && !boss.dead) {
        const width = Math.min(this.viewWidth * 0.62, 460);
        const x = (this.viewWidth - width) / 2;
        const y = 18;
        ctx.save();
        ctx.fillStyle = "rgba(12,7,28,.84)";
        ctx.strokeStyle = "rgba(210,178,255,.72)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, width, 28, 8); else ctx.rect(x, y, width, 28);
        ctx.fill(); ctx.stroke();
        const fillWidth = Math.max(0, width - 8) * Math.max(0, boss.hp / boss.maxHp);
        const gradient = ctx.createLinearGradient(x + 4, y, x + width - 4, y);
        gradient.addColorStop(0, "#8C4BD0"); gradient.addColorStop(1, "#D19AFF");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x + 4, y + 4, fillWidth, 20, 5); else ctx.fillRect(x + 4, y + 4, fillWidth, 20);
        ctx.fill();
        ctx.fillStyle = "#F7EDFF";
        ctx.font = "bold 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`守关 Boss · Lv.${boss.bossLevel}`, this.viewWidth / 2, y + 14);
        ctx.restore();
      }
      if (this.bossAnnouncementTimer > 0 && this.bossAnnouncement) {
        const alpha = Math.min(1, this.bossAnnouncementTimer * 1.6);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(16,8,30,.78)";
        ctx.strokeStyle = "rgba(207,174,255,.75)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const width = Math.min(this.viewWidth - 32, Math.max(210, this.bossAnnouncement.length * 17 + 34));
        const x = (this.viewWidth - width) / 2;
        const y = boss && !boss.dead ? 58 : 22;
        if (ctx.roundRect) ctx.roundRect(x, y, width, 34, 9); else ctx.rect(x, y, width, 34);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#F4E9FF";
        ctx.font = "600 14px system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(this.bossAnnouncement, this.viewWidth / 2, y + 17, width - 16);
        ctx.restore();
      }
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
      const color = THEME_COLOR;
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

    drawFortuneAura(ctx, time) {
      const p = this.player;
      if (!p || p.fortuneAuraTimer <= 0) return;
      const fade = Math.min(1, p.fortuneAuraTimer / 0.55);
      const radius = p.fortuneRadius;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.18 + fade * 0.2;
      const glow = ctx.createRadialGradient(p.x, p.y, radius * 0.12, p.x, p.y, radius);
      glow.addColorStop(0, "rgba(240,197,106,0.24)");
      glow.addColorStop(0.72, "rgba(240,197,106,0.08)");
      glow.addColorStop(1, "rgba(240,197,106,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = "rgba(255,219,133,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 8]);
      ctx.lineDashOffset = -time * 28;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * (0.92 + Math.sin(time * 5) * 0.025), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },

    drawVortices(ctx, time) {
      if (!this.vortices.length) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.vortices.forEach(vortex => {
        const fade = Math.min(1, vortex.duration / 0.45, vortex.duration / vortex.maxDuration * 1.8);
        const radius = vortex.radius;
        const glow = ctx.createRadialGradient(vortex.x, vortex.y, 2, vortex.x, vortex.y, radius);
        glow.addColorStop(0, "rgba(116, 229, 218, 0.22)");
        glow.addColorStop(0.52, "rgba(93, 190, 206, 0.10)");
        glow.addColorStop(1, "rgba(93, 190, 206, 0)");
        ctx.globalAlpha = Math.max(0.15, fade);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(vortex.x, vortex.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(139, 231, 220, 0.82)";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([8, 7]);
        ctx.lineDashOffset = -time * 34;
        ctx.beginPath();
        ctx.arc(vortex.x, vortex.y, radius * 0.92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let arm = 0; arm < 3; arm += 1) {
          const angle = vortex.rotation + arm * Math.PI * 2 / 3;
          ctx.beginPath();
          ctx.ellipse(vortex.x, vortex.y, radius * 0.72, radius * 0.25, angle, angle, angle + Math.PI * 1.18);
          ctx.strokeStyle = "rgba(159, 239, 226, 0.72)";
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(220, 255, 248, 0.9)";
        ctx.beginPath();
        ctx.arc(vortex.x, vortex.y, 4.5 + Math.sin(time * 9 + vortex.rotation) * 1.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    },

    drawPets(ctx, time) {
      const p = this.player;
      if (!p || !p.petCount) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < p.petCount; i += 1) {
        const charge = p.petCharges && p.petCharges[i];
        let x;
        let y;
        let angle;
        if (charge) {
          x = charge.x;
          y = charge.y;
          angle = Math.atan2(charge.dirY, charge.dirX);
          const trailLength = Math.min(charge.travelled, 70);
          ctx.save();
          ctx.lineCap = "round";
          ctx.strokeStyle = "rgba(196,174,255,0.38)";
          ctx.lineWidth = Math.max(5, charge.width * 0.72);
          ctx.beginPath();
          ctx.moveTo(x - charge.dirX * trailLength, y - charge.dirY * trailLength);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.strokeStyle = "rgba(236,226,255,0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - charge.dirX * trailLength, y - charge.dirY * trailLength);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.restore();
        } else {
          angle = time * 0.95 + i * Math.PI * 2 / p.petCount;
          x = p.x + Math.cos(angle) * p.petOrbitRadius;
          y = p.y + Math.sin(angle) * p.petOrbitRadius * 0.66;
        }
        const glow = ctx.createRadialGradient(x, y, 1, x, y, 19);
        glow.addColorStop(0, "rgba(245,239,255,1)");
        glow.addColorStop(0.36, "rgba(185,154,255,0.75)");
        glow.addColorStop(1, "rgba(185,154,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = "#D8CBFF";
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(0, -6);
        ctx.lineTo(-7, 0);
        ctx.lineTo(0, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
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
