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
for (const file of ['js/entities.js','js/upgrades.js','js/save.js','js/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), sandbox, { filename:file });
}
const app = fakeWindow.FantasySurvivor;
const Game = app.Game;
Game.particlesEnabled = false;
Game.active = true;
Game.inRun = true;
Game.arenaWidth = 960;
Game.arenaHeight = 540;
Game.callbacks = { onHUD(data) { Game.lastHud = data; }, onLevelUp() {} };

// Start defaults: one-second vortex and fortune windows.
Game.setProgression({permanentUpgrades:{maxHp:0,damage:0,goldRate:0,expRate:0}}, 1);
Game.start();
if (Game.player.vortexDuration !== 1 || Game.player.fortuneAuraDuration !== 1) throw new Error('initial vortex/fortune duration should be 1 second');

// Fortune backlash is an invulnerability window after it has been unlocked and triggered.
Game.player.fortuneUnlocked = true;
Game.player.hp = 3;
Game.player.invuln = 0;
if (!Game.damagePlayer(1) || Game.player.hp !== 2 || Game.player.fortuneAuraTimer !== 1) throw new Error('fortune backlash did not start on hit');
Game.player.invuln = 0;
if (Game.damagePlayer(1) !== false || Game.player.hp !== 2) throw new Error('fortune backlash did not block damage');

// The vortex spawned by the gather build uses the 1-second starting duration.
Game.player.vortexUnlocked = true;
Game.player.vortexCount = 1;
Game.player.vortexDuration = 1;
Game.spawnVortices({x:Game.player.x+80,y:Game.player.y});
if (Game.vortices[Game.vortices.length-1].duration !== 1) throw new Error('vortex default duration incorrect');
Game.vortices.length = 0;

// Reaching level 10 clears small monsters, spawns one large boss and resumes normal spawning.
Game.enemies = [app.Entities.createEnemy({id:900,x:80,y:80,hp:50,maxHp:50,radius:13,kind:'normal',dead:false})];
Game.rebuildEnemyGrid();
Game.player.level = 9;
Game.player.exp = 0;
Game.paused = false;
Game.active = true;
Game.inRun = true;
Game.addExperience(Game.expToNextLevel(9));
if (!Game.bossActive || !Game.boss || Game.boss.bossLevel !== 10) throw new Error('level 10 did not summon a boss');
if (Game.enemies.length !== 1 || !Game.enemies[0].isBoss) throw new Error('boss entry did not clear all small monsters');
if (Game.boss.radius <= 40) throw new Error('boss size is not larger than regular enemies');
Game.paused = false;
Game.spawnTimer = 0;
Game.updateEnemies(0.05, 1);
if (!Game.enemies.some(e => !e.isBoss && !e.isBossMinion)) throw new Error('normal enemies did not spawn during boss fight');
if (Game.CONFIG.boss.chargeDistance !== 190) throw new Error('boss base charge distance was not halved');

// Boss charge uses a telegraph and its movement line can damage the player.
Game.player.x = Game.boss.x + 60;
Game.player.y = Game.boss.y;
Game.player.hp = 3;
Game.player.invuln = 0;
Game.player.fortuneAuraTimer = 0;
Game.boss.bossMode = 'chargeTell';
Game.boss.bossModeTimer = 0.001;
Game.boss.chargeDirX = 1;
Game.boss.chargeDirY = 0;
Game.updateBossEnemy(Game.boss, 0.01);
Game.updateBossEnemy(Game.boss, 0.15);
if (Game.player.hp !== 2 || !Game.boss.chargeHit) throw new Error('boss charge failed to hit player');

// Electric barriers damage on contact, while fortune backlash makes contact harmless.
Game.player.x = 480; Game.player.y = 270;
Game.player.invuln = 0; Game.player.fortuneAuraTimer = 0;
Game.player.hp = 3;
Game.bossBarriers = [{x1:480,y1:20,x2:480,y2:520,phase:'active',timer:2,activeDuration:2,hitCooldown:0}];
Game.updateBossBarriers(0.05);
if (Game.player.hp !== 2) throw new Error('electric barrier did not damage on contact');
Game.player.hp = 3; Game.player.invuln = 0; Game.player.fortuneAuraTimer = 0.8;
Game.bossBarriers[0].hitCooldown = 0;
Game.updateBossBarriers(0.05);
if (Game.player.hp !== 3) throw new Error('fortune invulnerability did not block electric barrier');

// Boss summons exactly three purple elite minions with twice the normal elite speed.
Game.boss.bossMode = 'idle';
Game.spawnBossMinions(Game.boss);
const minions = Game.enemies.filter(e => e.isBossMinion);
const baseEliteSpeed = (Game.CONFIG.enemy.eliteSpeed + (Game.getWave()-1)*1.5) * 1.5;
if (minions.length !== 3 || minions.some(e => e.speed !== baseEliteSpeed * 2 || e.kind !== 'bossElite' || e.color !== '#B56BFF')) throw new Error('boss minion summon invalid');

// Killing the boss removes its summoned minions and allows normal enemy spawning again.
const bossRef = Game.boss;
Game.killEnemy(bossRef);
if (Game.bossActive || Game.boss !== null || !minions.every(e => e.dead)) throw new Error('boss defeat cleanup failed');
if (!Game.drops.some(d => d.kind === 'chest')) throw new Error('boss defeat did not drop a treasure chest');
Game.removeDeadEnemies();
Game.spawnTimer = 0;
Game.updateEnemies(0.05, 1);
if (Game.bossActive || !Game.enemies.some(e => !e.isBoss && !e.isBossMinion)) throw new Error('normal spawning did not resume after boss defeat');

// The real J keydown event clears and instantly kills all currently active enemies.
Game.enemies.push(app.Entities.createEnemy({id:1200,x:300,y:300,hp:50,maxHp:50,radius:13,kind:'normal',dead:false}));
Game.inRun = true; Game.active = true; Game.paused = false;
let keyPrevented = false;
Game.handleKeyDown({code:'KeyJ',repeat:false,preventDefault(){keyPrevented=true;}});
if (!keyPrevented || Game.enemies.some(e => !e.dead)) throw new Error('J keydown did not clear-screen kill');

console.log('STAGE6.8 BOSS REGRESSION TESTS PASSED: fortune invulnerability, 1s defaults, level-10 boss, normal spawns during boss, halved charge range, boss treasure drop, electric barrier, triple 2x-speed purple minions, post-boss respawn, J clear-screen cheat.');
