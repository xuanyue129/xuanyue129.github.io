/* 阶段 2：Canvas 幻想背景与竞技场演示骨架，不包含战斗逻辑。 */
(function (global) {
  "use strict";
  const prefersReducedMotion = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const Game = {
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
    active: false,
    paused: false,
    element: null,
    lastTime: 0,
    elapsed: 0,
    rafId: 0,
    particlesEnabled: true,
    initialized: false,

    init(options) {
      this.backgroundCanvas = options.backgroundCanvas;
      this.backgroundContext = this.backgroundCanvas ? this.backgroundCanvas.getContext("2d") : null;
      this.arenaCanvas = options.arenaCanvas || null;
      this.arenaContext = this.arenaCanvas ? this.arenaCanvas.getContext("2d") : null;
      this.resize();
      global.addEventListener("resize", () => this.resize(), { passive: true });
      this.initialized = true;
      this.lastTime = performance.now();
      if (!this.rafId) this.rafId = requestAnimationFrame((time) => this.loop(time));
    },

    resizeCanvas(canvas, context) {
      if (!canvas || !context) return null;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width || global.innerWidth);
      const height = Math.max(1, rect.height || global.innerHeight);
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

    loop(time) {
      const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
      this.lastTime = time;
      if (!prefersReducedMotion) this.elapsed += dt;
      this.drawBackground(this.elapsed);
      if (this.active && !this.paused) this.drawArena(this.elapsed);
      this.rafId = requestAnimationFrame((nextTime) => this.loop(nextTime));
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
      const floatY = prefersReducedMotion ? 0 : Math.sin(drift) * 5;
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

    start(elementId) {
      this.element = global.FantasySurvivor.Elements.get(elementId) || global.FantasySurvivor.Elements.get("water");
      this.active = true;
      this.paused = false;
      this.elapsed = 0;
      this.resize();
      this.drawArena(this.elapsed);
    },

    pause() { this.paused = true; },
    resume() { this.paused = false; this.lastTime = performance.now(); },
    stop() { this.active = false; this.paused = false; this.element = null; },
    setParticlesEnabled(value) { this.particlesEnabled = Boolean(value); },

    drawArena(time) {
      const ctx = this.arenaContext;
      const w = this.arenaWidth;
      const h = this.arenaHeight;
      if (!ctx || !w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.48, 10, w * 0.5, h * 0.48, Math.max(w, h) * 0.72);
      bg.addColorStop(0, "#1C3B56");
      bg.addColorStop(0.55, "#10263E");
      bg.addColorStop(1, "#081525");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = "rgba(132, 174, 193, 0.13)";
      ctx.lineWidth = 1;
      for (let r = 70; r < Math.max(w, h); r += 58) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.38, r * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(232, 200, 122, 0.13)";
      ctx.setLineDash([3, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const color = this.element ? this.element.color : "#4FC3F7";
      const bob = prefersReducedMotion ? 0 : Math.sin(time * 1.5) * 4;
      const playerGlow = ctx.createRadialGradient(0, bob, 2, 0, bob, 66);
      playerGlow.addColorStop(0, color + "99");
      playerGlow.addColorStop(1, color + "00");
      ctx.fillStyle = playerGlow;
      ctx.beginPath();
      ctx.arc(0, bob, 66, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, bob, 32, 12, time * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const orb = ctx.createRadialGradient(-5, bob - 7, 1, 0, bob, 20);
      orb.addColorStop(0, "#FFFFFF");
      orb.addColorStop(0.25, color);
      orb.addColorStop(1, "#18324A");
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(0, bob, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (this.particlesEnabled) {
        for (let i = 0; i < 18; i += 1) {
          const angle = (i / 18) * Math.PI * 2 + time * 0.12;
          const radius = 48 + (i % 3) * 15;
          const px = w / 2 + Math.cos(angle) * radius;
          const py = h / 2 + Math.sin(angle) * radius * 0.55;
          ctx.globalAlpha = 0.28 + (Math.sin(time * 2 + i) + 1) * 0.18;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, i % 4 === 0 ? 2 : 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  };

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Game = Game;
})(window);
