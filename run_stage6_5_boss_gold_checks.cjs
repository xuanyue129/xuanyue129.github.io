const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const listeners = {};
const storage = new Map();
const fakeWindow = {
  devicePixelRatio: 1,
  addEventListener(type, fn) { listeners[type] = fn; },
  matchMedia() { return { matches: false }; },
  localStorage: {
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(k, v); },
    removeItem(k) { storage.delete(k); }
  },
  confirm() { return true; }, setTimeout, clearTimeout,
  requestAnimationFrame(fn) { return setTimeout(() => fn(Date.now()), 16); },
  cancelAnimationFrame(id) { clearTimeout(id); },
  performance
};
const fakeDocument = { hidden: false, addEventListener() {}, getElementById() { return null; } };
const math = Object.create(Math);
math.random = () => 0.1;
const sandbox = {
  window: fakeWindow, document: fakeDocument, console, Math: math, Date, Map, Set, Array, Object, Number, String,
  JSON, Infinity, performance, requestAnimationFrame: fakeWindow.requestAnimationFrame,
  cancelAnimationFrame: fakeWindow.cancelAnimationFrame, setTimeout, clearTimeout
};
vm.createContext(sandbox);
for (const file of ['js/entities.js', 'js/upgrades.js', 'js/save.js', 'js/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const app = fakeWindow.FantasySurvivor;
const Game = app.Game;
Game.particlesEnabled = false;
Game.arenaWidth = 2600; Game.arenaHeight = 1800;
Game.viewWidth = 900; Game.viewHeight = 600; Game.cameraZoom = 1;
Game.elapsed = 0;
Game.callbacks = { onHUD(data) { Game.lastHud = data; } };
Game.player = app.Entities.createPlayer({ x: 1200, y: 900, hp: 3, maxHp: 3, radius: 14, goldMultiplier: 1.2, globalMultiplier: 1.1 });
Game.runGold = 0;
Game.drops = [];

// 1. Gold is credited immediately, with the 3x multiplier and existing progression multipliers.
const firstAward = Game.awardGold(10);
if (firstAward !== 39 || Game.runGold !== 39) throw new Error(`gold 3x calculation wrong: ${firstAward}`);
const dropsBefore = Game.drops.length;
const compatibilityAward = Game.spawnDrop(100, 100, 'gold', 5);
if (compatibilityAward !== 19 || Game.drops.length !== dropsBefore) throw new Error('gold spawn path created a visible drop instead of direct credit');
if (Game.runGold !== 58) throw new Error('direct gold total incorrect');

// 2. First boss HP is lower, and each subsequent encounter grows by a fixed amount.
Game.enemies = []; Game.projectiles = []; Game.bossQueue = [10]; Game.bossActive = false; Game.boss = null;
Game.startNextBoss();
const firstBossHp = Game.boss.maxHp;
if (firstBossHp !== 520) throw new Error(`first boss HP should be 520 at wave 1, got ${firstBossHp}`);
Game.killBoss(Game.boss);
if (Game.drops.some(drop => drop.kind === 'gold')) throw new Error('boss reward created a gold drop');
Game.bossQueue = [20]; Game.startNextBoss();
const secondBossHp = Game.boss.maxHp;
if (secondBossHp !== 840 || secondBossHp <= firstBossHp) throw new Error(`second boss HP should be 840 and exceed first: ${secondBossHp}`);
Game.killBoss(Game.boss);
Game.bossQueue = [30]; Game.startNextBoss();
const thirdBossHp = Game.boss.maxHp;
if (thirdBossHp !== 1160 || thirdBossHp <= secondBossHp) throw new Error(`third boss HP should be 1160 and exceed second: ${thirdBossHp}`);

// 3. Offline income is also tripled, with the matching tripled cap.
const now = Date.now();
storage.set(app.Save.STORAGE_KEY, JSON.stringify({
  version: 4, gold: 0, lastSeenAt: now - 3600000,
  permanentUpgrades: {}, stats: { bestWave: 1 }, settings: {}
}));
const loaded = app.Save.load();
if (loaded.offlineReward.gold !== 9 || loaded.gold !== 9) throw new Error(`offline gold should be tripled to 9 per hour at wave 1, got ${loaded.offlineReward.gold}`);
if (app.Save.OFFLINE.maxGold !== 540 || app.Save.OFFLINE.goldMultiplier !== 3) throw new Error('offline cap / multiplier not tripled');

// 4. UI has a floating gain label and animated counter; the arena has no gold drawing branch.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
if (!html.includes('id="hudGoldGain"') || !ui.includes('animateGoldCounter(data.gold)') || !css.includes('hud-gold-gain-float')) {
  throw new Error('gold HUD count / floating animation missing');
}
if (/spawnDrop\([^\n]*["']gold["']/.test(gameSource)) throw new Error('game still spawns visible gold drops');
if (/if\s*\(drop\.kind\s*===\s*["']gold["']\)/.test(gameSource)) throw new Error('gold drawing branch still exists');
console.log('STAGE6.5 BOSS / GOLD TESTS PASSED: first boss HP reduced, later bosses scale per encounter, gold is direct credited and tripled, offline rewards tripled, HUD counter animation present, no ground gold entities/rendering.');
