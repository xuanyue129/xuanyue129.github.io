const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const fakeDocument = { hidden: false, addEventListener() {}, getElementById() { return null; } };
const fakeWindow = {
  devicePixelRatio: 2,
  navigator: { hardwareConcurrency: 8, deviceMemory: 8 },
  document: fakeDocument,
  addEventListener() {},
  matchMedia() { return { matches: false }; },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  confirm() { return true; }, setTimeout, clearTimeout
};
const sandbox = {
  window: fakeWindow, document: fakeDocument, console, Math, Date, Map, Set, Array, Object, Number, String,
  JSON, Infinity, performance: { now: () => 1000 }, requestAnimationFrame: () => 1, setTimeout, clearTimeout
};
vm.createContext(sandbox);
for (const file of ['js/entities.js', 'js/upgrades.js', 'js/save.js', 'js/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const app = fakeWindow.FantasySurvivor;
const Game = app.Game;
Game.particlesEnabled = false;
Game.setProgression({ permanentUpgrades: { offlineRate: 0, damage: 0, goldRate: 0, expRate: 0 } }, 1);
Game.arenaWidth = 6000; Game.arenaHeight = 4000; Game.viewWidth = 900; Game.viewHeight = 600;
Game.cameraX = 100; Game.cameraY = 100; Game.cameraZoom = 1;
Game.callbacks = { onHUD() {}, onPlayerHit() {} };
Game.start();

// Experience: enemy rewards rise in small steps, never exceed ten; Boss reward remains fixed.
Game.elapsed = 0;
assert(Game.getEnemyExpReward({ kind: 'normal' }) === 5, 'normal enemy did not start at 5 XP');
assert(Game.getEnemyExpReward({ kind: 'fast' }) === 6, 'fast enemy bonus should remain within the same cap');
assert(Game.getEnemyExpReward({ kind: 'elite' }) === 7, 'elite enemy bonus should remain within the same cap');
Game.elapsed = 60 * 2 * 5;
assert(Game.getEnemyExpReward({ kind: 'normal' }) === 10, 'normal enemy reward did not reach 10 after progression');
Game.elapsed = 60 * 2 * 40;
assert(Game.getEnemyExpReward({ kind: 'normal' }) === 10, 'late-wave normal enemy XP continued to grow');
assert(Game.getEnemyExpReward({ kind: 'fast' }) === 10 && Game.getEnemyExpReward({ kind: 'elite' }) === 10, 'special enemy XP exceeded the 10-point cap');
Game.drops.length = 0;
Game.spawnDrop(100, 100, 'exp', 999);
assert(Game.drops[0].value === 10 && Game.drops[0].maxReward === 10, 'normal XP pickup was not clamped at 10');
Game.drops.length = 0;
Game.spawnDrop(100, 100, 'exp', 999, Game.CONFIG.experience.bossReward);
assert(Game.drops[0].value === 25, 'Boss XP reward was not clamped to fixed 25');
Game.player.expMultiplier = 5; Game.player.globalMultiplier = 1;
assert(Game.addExperience(100, 10) === 10, 'experience multipliers bypassed the per-enemy XP limit');
assert(Game.addExperience(100, 25) === 25, 'Boss reward cap was not retained after applying multipliers');

// Fortune duration upgrade is +1.0 second, not +1.5.
const durationCard = app.Upgrades.CARDS.find(card => card.id === 'fortuneDuration');
assert(durationCard && durationCard.desc.includes('增加 1 秒') && !durationCard.desc.includes('1.5'), 'fortune duration description was not updated');
const fortuneState = { fortuneUnlocked: true, fortuneAuraDuration: 1 };
durationCard.apply(fortuneState);
assert(fortuneState.fortuneAuraDuration === 2, 'fortune duration upgrade did not add exactly one second');

// A hit applies a directional impulse and the character is pushed away from the source.
Game.active = true; Game.paused = false;
Game.player.hp = 3; Game.player.invuln = 0; Game.player.fortuneUnlocked = false;
Game.player.x = 1000; Game.player.y = 1000;
Game.player.vx = 0; Game.player.vy = 0; Game.player.knockbackX = 0; Game.player.knockbackY = 0;
const startX = Game.player.x;
assert(Game.damagePlayer(1, 900, 1000) === true, 'valid hit was not applied');
assert(Game.player.hp === 2 && Game.player.knockbackX > 0, 'hit did not reduce one heart and apply directional knockback');
Game.keys.clear(); Game.touchMoveX = 0; Game.touchMoveY = 0;
Game.updatePlayerMovement(0.1);
assert(Game.player.x > startX + 10, 'player was not physically displaced by knockback');

// Charging suicide enemy scales up and shows its full blast-radius warning ring.
const fuser = app.Entities.createEnemy({ id: 12, x: 500, y: 500, kind: 'fast', speed: 231, baseSpeed: 140, radius: 10,
  hp: 22, maxHp: 22, specialMode: 'suicide', fuseTimer: 0.3, dead: false, color: '#E7B978' });
Game.enemies = [fuser]; Game.elapsed = 1;
const calls = { scales: [], arcs: [], dashed: 0 };
const ctx = {
  save() {}, restore() {}, translate() {}, scale(x, y) { calls.scales.push([x, y]); },
  beginPath() {}, arc(x, y, radius) { calls.arcs.push(radius); }, fill() {}, stroke() {},
  moveTo() {}, lineTo() {}, closePath() {}, fillRect() {}, strokeRect() {},
  setLineDash(value) { if (value && value.length) calls.dashed += 1; },
  globalAlpha: 1, lineWidth: 1, fillStyle: '', strokeStyle: ''
};
Game.drawEnemies(ctx);
assert(calls.scales.some(([x]) => x > 1.3), 'suicide enemy did not visibly inflate while charging');
assert(calls.arcs.some(radius => radius >= 108), 'full explosion radius was not drawn around charging enemy');
assert(calls.dashed > 0, 'explosion radius warning ring was not made visually distinct');

// Rendering quality/performance: cap DPR, draw FPS and particle load; simulation remains RAF-driven.
assert(Game.CONFIG.performance.desktopFps === 60 && Game.CONFIG.performance.mobileFps === 60, 'arena frame-rate caps are missing');
assert(Game.CONFIG.performance.backgroundFps === 60, 'background frame-rate cap is missing');
assert(Game.CONFIG.particles.highLimit <= 300 && Game.CONFIG.particles.lowLimit <= 110, 'particle caps were not reduced');
const canvas = { width: 0, height: 0, getBoundingClientRect() { return { width: 100, height: 50 }; } };
let transformDpr = 0;
Game.resizeCanvas(canvas, { setTransform(dpr) { transformDpr = dpr; } });
assert(canvas.width === 115 && canvas.height === 57 && transformDpr === 1.15, 'desktop canvas DPR was not capped at 1.15');
fakeWindow.matchMedia = () => ({ matches: true });
Game.resizeCanvas(canvas, { setTransform(dpr) { transformDpr = dpr; } });
assert(canvas.width === 100 && canvas.height === 50 && transformDpr === 1, 'mobile canvas DPR was not capped at 1.0');
fakeWindow.matchMedia = () => ({ matches: false });
fakeWindow.navigator.hardwareConcurrency = 4;
Game.resizeCanvas(canvas, { setTransform(dpr) { transformDpr = dpr; } });
assert(canvas.width === 85 && canvas.height === 43 && transformDpr === 0.85, 'low-power canvas DPR was not capped at 0.85');
fakeWindow.navigator.hardwareConcurrency = 8;
let bgRenders = 0, arenaRenders = 0;
const savedBackground = Game.drawBackground, savedArena = Game.renderArena;
Game.drawBackground = () => { bgRenders += 1; };
Game.renderArena = () => { arenaRenders += 1; };
Game.inRun = true; Game.active = false; Game.lastTime = 0; Game.lastBackgroundRenderAt = 0; Game.lastArenaRenderAt = 0;
Game.loop(10); Game.loop(40); Game.loop(90);
Game.drawBackground = savedBackground; Game.renderArena = savedArena; Game.inRun = false;
assert(arenaRenders === 2 && bgRenders === 2, `60 FPS render scheduling did not update at the expected cadence (arena=${arenaRenders}, background=${bgRenders})`);

console.log('STAGE6.13 CHECKS PASSED: charging bomber growth and blast-radius warning; directional player knockback; +1s Fortune duration; 5-to-10 XP progression and per-pickup caps; fixed Boss XP; render FPS/DPR/particle reductions.');
