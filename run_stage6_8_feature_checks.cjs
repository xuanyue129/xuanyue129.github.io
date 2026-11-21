const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const listeners = {};
const fakeWindow = {
  devicePixelRatio: 1,
  addEventListener(type, fn) { listeners[type] = fn; },
  matchMedia() { return { matches: false }; },
  localStorage: { data: new Map(), getItem(k) { return this.data.get(k) ?? null; }, setItem(k,v) { this.data.set(k,v); }, removeItem(k) { this.data.delete(k); } },
  confirm() { return true; }, setTimeout, clearTimeout
};
const fakeDocument = { hidden: false, addEventListener() {}, getElementById() { return null; } };
const sandbox = {
  window: fakeWindow, document: fakeDocument, console, Math, Date, Map, Set, Array, Object, Number, String,
  JSON, Infinity, performance: { now: () => 1000 }, requestAnimationFrame: () => 1,
  setTimeout, clearTimeout
};
vm.createContext(sandbox);
for (const file of ['js/entities.js','js/upgrades.js','js/save.js','js/game.js','js/ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), sandbox, { filename:file });
}
const app = fakeWindow.FantasySurvivor;
const Game = app.Game;
Game.particlesEnabled = false;
Game.setProgression({ permanentUpgrades: { maxHp:0, damage:0, goldRate:0, expRate:0 } }, 1);
Game.callbacks = { onHUD() {}, onChestPickup() { Game.chestCallbackCount = (Game.chestCallbackCount || 0) + 1; } };
Game.start();

// XP cost grows early and plateaus at exactly 325.
if (!(Game.expToNextLevel(1) < Game.expToNextLevel(5))) throw new Error('XP curve does not increase in early levels');
if (Game.expToNextLevel(30) !== 325 || Game.expToNextLevel(1000) !== 325) throw new Error('XP requirement does not cap at 325');

// Fortune Backlash is percentage damage based on each target's maximum health.
Game.player.fortuneUnlocked = true;
Game.player.fortuneAuraTimer = 2;
Game.player.fortuneAuraDuration = 2;
Game.player.fortuneDamage = 0.12;
Game.player.fortuneRadius = 500;
Game.enemies = [app.Entities.createEnemy({ id:800, x:Game.player.x + 20, y:Game.player.y, hp:100, maxHp:100, radius:10, dead:false })];
Game.updateFortuneAura(0.5);
if (Math.abs(Game.enemies[0].hp - 94) > 0.001) throw new Error('Fortune percentage damage should deal 6% max HP over 0.5 seconds');

// Lv.40 has two bosses; Lv.50 has three. Each boss drops an individual chest.
Game.enemies = []; Game.bossQueue = [40]; Game.bossActive = false; Game.boss = null; Game.drops = [];
Game.startNextBoss();
let bosses = Game.enemies.filter(e => e.isBoss && !e.dead);
if (bosses.length !== 2) throw new Error(`Lv.40 should spawn 2 bosses, got ${bosses.length}`);
Game.killBoss(bosses[0]);
if (!Game.bossActive || !Game.boss || Game.boss === bosses[0]) throw new Error('Boss group ended before every boss was defeated');
Game.killBoss(bosses[1]);
if (Game.bossActive || Game.enemies.some(e => e.isBoss && !e.dead)) throw new Error('Boss group remained active after all defeats');
if (Game.drops.filter(d => d.kind === 'chest').length !== 2) throw new Error('each defeated Boss should drop one treasure chest');
Game.removeDeadEnemies();
Game.bossQueue = [50]; Game.bossActive = false; Game.boss = null;
Game.startNextBoss();
bosses = Game.enemies.filter(e => e.isBoss && !e.dead);
if (bosses.length !== 3) throw new Error(`Lv.50 should spawn 3 bosses, got ${bosses.length}`);

// Each boss may summon elites three times, then the summon slot is removed and future charges chain three dashes.
const boss = bosses[0];
Game.enemies = [boss];
for (let i=0;i<3;i++) Game.spawnBossMinions(boss);
if (boss.summonUses !== 3 || Game.enemies.filter(e => e.isBossMinion).length !== 9) throw new Error('Boss elite summon quota is not three uses');
Game.player.x = Math.max(900, boss.x + 500); Game.player.y = Math.max(900, boss.y + 500);
boss.bossNextAttack = 9; boss.bossAttackTimer = 0; boss.bossMode = 'idle';
Game.updateBossEnemy(boss, 0.01);
if (boss.summonUses !== 3 || boss.bossMode !== 'idle') throw new Error('Boss continued summoning elites after the third use');
boss.bossNextAttack = 10; boss.bossAttackTimer = 0; boss.bossMode = 'idle';
Game.updateBossEnemy(boss, 0.01);
if (boss.bossMode !== 'chargeTell' || boss.chargeBurstRemaining !== 2) throw new Error('Boss did not switch to a triple-charge sequence');
for (let dash=0; dash<3; dash++) {
  boss.bossMode = 'charge'; boss.chargeRemaining = 1; boss.chargeDirX = 0; boss.chargeDirY = 1;
  Game.updateBossEnemy(boss, 0.01);
  if (dash < 2 && boss.bossMode !== 'chargeTell') throw new Error(`triple charge ended early at dash ${dash+1}`);
  if (dash === 2 && boss.bossMode !== 'idle') throw new Error('triple charge did not end after exactly three dashes');
}

// Chest proximity pauses the run and notifies UI exactly once.
Game.enemies = []; Game.drops = [];
Game.player.x = 500; Game.player.y = 500; Game.active = true; Game.paused = false;
Game.spawnChest(500, 500);
Game.updateDrops(0.016);
if (!Game.paused || Game.chestCallbackCount !== 1 || Game.drops.some(d => d.kind === 'chest')) throw new Error('chest proximity pickup did not pause/open reward flow');

// A triple-pick reward can apply two selections without consuming the level, then consume it on the third.
Game.paused = false;
Game.pendingLevelUps = 1;
const card = { apply(p) { p.damage = (p.damage || 1) + 1; } };
Game.applyUpgrade(card, false);
if (Game.pendingLevelUps !== 1) throw new Error('first bonus pick consumed the original level-up');
Game.applyUpgrade(card, false);
if (Game.pendingLevelUps !== 1) throw new Error('second bonus pick consumed the original level-up');
Game.applyUpgrade(card, true);
if (Game.pendingLevelUps !== 0) throw new Error('third pick did not consume exactly one level-up');
if (Game.player.upgradeRefreshes !== 5) throw new Error('run should begin with five upgrade refreshes');

// UI wiring exposes reroll, triple-pick and all three chest rewards.
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const ui = fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
for (const id of ['upgradeRefreshButton','upgradeRefreshCount','chestRewardModal']) if (!html.includes(`id="${id}"`)) throw new Error(`missing UI element ${id}`);
for (const action of ['refresh-upgrade','chest-reward','test-audio']) if (!ui.includes(`"${action}"`)) throw new Error(`missing UI action ${action}`);
for (const reward of ['heal','triple','refresh']) if (!html.includes(`data-reward="${reward}"`)) throw new Error(`missing chest reward ${reward}`);
if (!ui.includes('player.triplePickPending') || !ui.includes('upgradeRefreshes -= 1')) throw new Error('reroll/triple-pick logic not wired');

// Exercise real UI handlers with lightweight element stubs: 5 rerolls and exactly 3 sequential picks.
app.Audio = { playSfx() {} };
const UI = app.UI;
UI.saveData = app.Save.defaults();
UI.refreshMenu = () => {};
UI.closeModal = () => {};
UI.openModal = () => {};
UI.elements = {
  upgradeCards: { innerHTML: '' }, upgradeTitle: { textContent: '' }, upgradeSubtitle: { textContent: '' },
  upgradeRefreshCount: { textContent: '' }, upgradeRefreshButton: { disabled: false, setAttribute() {} }
};
Game.player.upgradeRefreshes = 5;
UI.currentUpgradeLevel = 1; UI.currentUpgradeCount = 1;
UI.renderUpgradeDraft();
UI.refreshUpgradeCards();
if (Game.player.upgradeRefreshes !== 4 || UI.elements.upgradeRefreshCount.textContent !== '4') throw new Error('refresh button did not spend/update one reroll');
let continued = 0;
Game.continueAfterUpgrade = () => { continued += 1; };
Game.pendingLevelUps = 1;
Game.player.triplePickPending = true;
UI.renderUpgradeDraft();
const buffCountBefore = Game.player.buffCount;
UI.chooseUpgrade(0);
if (Game.pendingLevelUps !== 1 || UI.triplePickRemaining !== 2) throw new Error('first triple-pick selection accounting failed');
UI.chooseUpgrade(0);
if (Game.pendingLevelUps !== 1 || UI.triplePickRemaining !== 1) throw new Error('second triple-pick selection accounting failed');
UI.chooseUpgrade(0);
if (Game.pendingLevelUps !== 0 || UI.triplePickRemaining !== 0 || continued !== 1 || Game.player.buffCount !== buffCountBefore + 3) throw new Error('triple-pick did not apply three choices and consume one level-up');

// All three treasure reward choices have the intended effects.
Game.resume = () => { Game.resumeCount = (Game.resumeCount || 0) + 1; };
Game.player.maxHp = 5; Game.player.hp = 1;
UI.chooseChestReward('heal');
if (Game.player.hp !== 3) throw new Error('chest healing reward did not restore two hearts');
const rerollsBeforeChest = Game.player.upgradeRefreshes;
UI.chooseChestReward('refresh');
if (Game.player.upgradeRefreshes !== rerollsBeforeChest + 3) throw new Error('chest refresh reward did not grant three rerolls');
Game.player.triplePickPending = false;
UI.chooseChestReward('triple');
if (!Game.player.triplePickPending || Game.resumeCount !== 3) throw new Error('chest triple-pick reward did not arm the next upgrade choice');

console.log('STAGE6.8 FEATURE TESTS PASSED: XP cap 325, percentage Fortune damage, Lv.40/Lv.50 boss scaling, three-summon limit, triple charge, boss treasure drop/proximity pickup, triple pick accounting, five initial rerolls and UI wiring.');
