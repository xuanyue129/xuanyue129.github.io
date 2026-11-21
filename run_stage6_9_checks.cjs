const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const stored = new Map();
const listeners = {};
const fakeWindow = {
  devicePixelRatio: 1,
  addEventListener(type, fn) { listeners[type] = fn; },
  matchMedia() { return { matches: false }; },
  localStorage: {
    getItem(k) { return stored.has(k) ? stored.get(k) : null; },
    setItem(k, v) { stored.set(k, v); },
    removeItem(k) { stored.delete(k); }
  },
  confirm() { return true; }, setTimeout, clearTimeout
};
const fakeDocument = { hidden: false, addEventListener() {}, getElementById() { return null; } };
const sandbox = {
  window: fakeWindow, document: fakeDocument, console, Math, Date, Map, Set, Array, Object, Number, String,
  JSON, Infinity, performance: { now: () => 1000 }, requestAnimationFrame: () => 1,
  setTimeout, clearTimeout
};
vm.createContext(sandbox);
for (const file of ['js/entities.js', 'js/upgrades.js', 'js/save.js', 'js/game.js', 'js/ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const app = fakeWindow.FantasySurvivor;
const Game = app.Game;
const assert = (ok, message) => { if (!ok) throw new Error(message); };

// New permanent shop replaces starting hearts with offline earnings multiplier.
assert(!Object.hasOwn(app.Upgrades.CONFIG.shop, 'maxHp'), 'permanent max HP upgrade still exists');
assert(Object.hasOwn(app.Upgrades.CONFIG.shop, 'offlineRate'), 'offline earnings upgrade missing');
const oldV6 = app.Save.normalize({ version: 6, permanentUpgrades: { maxHp: 4, damage: 2, goldRate: 1, expRate: 0 } });
assert(oldV6.version === 7 && oldV6.permanentUpgrades.offlineRate === 4, 'V6 permanent heart upgrade was not migrated to offline multiplier');
assert(!Object.hasOwn(oldV6.permanentUpgrades, 'maxHp'), 'legacy permanent maxHp remained in normalized save');

// Offline earnings multiplier applies to calculated offline coins and is preserved in reward summary.
const oneHourAgo = Date.now() - 60 * 60 * 1000;
stored.set(app.Save.STORAGE_KEY, JSON.stringify({
  version: 7, gold: 0, lastSeenAt: oneHourAgo,
  permanentUpgrades: { offlineRate: 2, damage: 0, goldRate: 0, expRate: 0 },
  stats: { bestWave: 1 }, settings: {}
}));
const loaded = app.Save.load();
assert(loaded.offlineReward.multiplier === 1.2, 'offline multiplier summary is not 1.2 at level 2');
assert(loaded.offlineReward.gold === 10, `offline earnings should be 10 at level 2 for one hour, got ${loaded.offlineReward.gold}`);

// New run has no permanent HP increase; permanent offline levels affect only away earnings.
Game.setProgression({ permanentUpgrades: { offlineRate: 10, damage: 0, goldRate: 0, expRate: 0 } }, 1);
Game.arenaWidth = 1800; Game.arenaHeight = 1200; Game.viewWidth = 800; Game.viewHeight = 600;
Game.cameraX = 400; Game.cameraY = 300; Game.player = null;
Game.start();
assert(Game.player.hp === 3 && Game.player.maxHp === 3, 'offline-rate shop upgrade altered starting hearts');

// Force the spawn-kind roll to validate exact 1.5x speeds for normal, fast and elite enemies.
const originalRandom = Math.random;
function spawnAt(wave, roll) {
  const values = [0, 0.5, roll]; let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  Game.enemies = [];
  Game.spawnEnemy(wave);
  Math.random = originalRandom;
  return Game.enemies[0];
}
let enemy = spawnAt(1, 0.9);
assert(enemy.kind === 'normal' && enemy.speed === Game.CONFIG.enemy.normalSpeed * 1.5, 'normal enemy speed is not +50%');
enemy = spawnAt(2, 0.2);
assert(enemy.kind === 'fast' && Math.abs(enemy.speed - (Game.CONFIG.enemy.fastSpeed + 2.5) * 1.5) < 1e-9, 'fast enemy speed is not +50%');
enemy = spawnAt(3, 0.05);
assert(enemy.kind === 'elite' && Math.abs(enemy.speed - (Game.CONFIG.enemy.eliteSpeed + 3) * 1.5) < 1e-9, 'elite enemy speed is not +50%');

// Boss chase/charge and its summoned purple elites receive the same speed increase.
Game.enemies = []; Game.bossQueue = [10]; Game.bossActive = false; Game.boss = null;
Game.startNextBoss();
const boss = Game.enemies.find(e => e.isBoss);
assert(Math.abs(boss.speed - (Game.CONFIG.boss.speed + 10 * 0.65) * 1.5) < 1e-9, 'Boss pursuit speed is not +50%');
Game.player.x = Math.min(Game.arenaWidth - 100, boss.x + 700);
Game.player.y = Math.min(Game.arenaHeight - 100, boss.y + 650);
boss.bossMode = 'charge'; boss.chargeRemaining = 1000; boss.chargeDirX = 1; boss.chargeDirY = 0; boss.chargeHit = true;
const bossX = boss.x;
Game.updateBossEnemy(boss, 0.1);
assert(Math.abs((boss.x - bossX) - Game.CONFIG.boss.chargeSpeed * 1.5 * 0.1) < 1e-7, 'Boss charge movement speed is not +50%');
Game.enemies = [boss];
Game.spawnBossMinions(boss);
const minions = Game.enemies.filter(e => e.isBossMinion);
const expectedMinionSpeed = (Game.CONFIG.enemy.eliteSpeed + (Game.getWave() - 1) * 1.5) * 1.5 * 2;
assert(minions.length === 3 && minions.every(e => Math.abs(e.speed - expectedMinionSpeed) < 1e-9), 'summoned elite minion speed is not +50%');

// Exercise the runtime sound triggers for the player attack, summon attack, vortex and Fortune aura.
const emittedSounds = [];
app.Audio = { playSfx(name) { emittedSounds.push(name); return true; } };
Game.particlesEnabled = false;
Game.enemies = [app.Entities.createEnemy({ id: 9900, x: Game.player.x + 90, y: Game.player.y, hp: 120, maxHp: 120, radius: 10, dead: false })];
Game.rebuildEnemyGrid();
Game.player.attackTimer = 0;
Game.updateAutoAttack(0.01);
assert(emittedSounds.includes('playerAttack'), 'player attack sound did not trigger');
Game.player.petCount = 1; Game.player.petAttackTimers = [0]; Game.player.petCharges = [null];
Game.updatePetAttacks(0.01);
assert(emittedSounds.includes('summonAttack'), 'summon attack sound did not trigger');
Game.player.vortexUnlocked = true;
Game.spawnVortices(Game.enemies[0]);
assert(emittedSounds.includes('vortexSpawn'), 'vortex sound did not trigger');
Game.active = true; Game.player.fortuneUnlocked = true; Game.player.fortuneAuraTimer = 0;
Game.player.invuln = 0; Game.damagePlayer(1);
assert(emittedSounds.includes('fortuneActivate'), 'Fortune Backlash sound did not trigger');

// Sound hooks: distinct attack/selection and each core skill activation.
const audio = fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
for (const sound of ['playerAttack', 'upgradeConfirm', 'summonSpawn', 'summonAttack', 'vortexSpawn', 'fortuneActivate']) {
  assert(audio.includes(`${sound}: [`), `sound pattern missing: ${sound}`);
}
for (const hook of ['playerAttack', 'summonAttack', 'vortexSpawn', 'fortuneActivate']) {
  assert(game.includes(`playSfx("${hook}")`), `gameplay sound hook missing: ${hook}`);
}
assert(ui.includes('playSfx("upgradeConfirm")') && ui.includes('playSfx("summonSpawn")'), 'selection / summon unlock sound hooks missing');
assert(ui.includes('离线收益倍率'), 'offline reward multiplier not displayed');

console.log('STAGE6.9 CHECKS PASSED: +50% normal/fast/elite/Boss/charge/summoned enemy speeds; permanent HP shop item replaced with offline multiplier; V6 migration preserves levels; offline calculation and UI summary; attack, choice-confirm and skill sounds wired.');
