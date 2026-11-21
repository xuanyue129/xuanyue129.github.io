const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const assert = (ok, message) => { if (!ok) throw new Error(message); };

// Game/save/entity integration harness.
const stored = new Map();
const fakeWindow = {
  devicePixelRatio: 1,
  addEventListener() {},
  matchMedia() { return { matches: false }; },
  localStorage: { getItem(k) { return stored.get(k) ?? null; }, setItem(k,v) { stored.set(k,v); }, removeItem(k) { stored.delete(k); } },
  confirm() { return true; }, setTimeout, clearTimeout
};
const fakeDocument = { hidden: false, addEventListener() {}, getElementById() { return null; } };
const sandbox = {
  window: fakeWindow, document: fakeDocument, console, Math, Date, Map, Set, Array, Object, Number, String,
  JSON, Infinity, performance: { now: () => 1000 }, requestAnimationFrame: () => 1, setTimeout, clearTimeout
};
vm.createContext(sandbox);
for (const file of ['js/entities.js','js/upgrades.js','js/save.js','js/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), sandbox, { filename:file });
}
const app = fakeWindow.FantasySurvivor;
const Game = app.Game;
Game.particlesEnabled = false;
Game.setProgression({ permanentUpgrades: { offlineRate:0, damage:0, goldRate:0, expRate:0 } }, 1);
Game.arenaWidth = 6000; Game.arenaHeight = 4000; Game.viewWidth = 900; Game.viewHeight = 600;
Game.cameraX = 100; Game.cameraY = 100; Game.cameraZoom = 1;
Game.callbacks = { onHUD() {} };
Game.start();
assert(Game.player.speed === 200 && Game.CONFIG.player.speed === 200, 'initial player movement speed was not reduced to 200');

// Fresh defaults and migration of untouched Stage 6.10 defaults; custom settings remain unchanged.
const defaults = app.Save.defaults();
assert(defaults.settings.masterVolume === 100 && defaults.settings.bgmVolume === 15 && defaults.settings.sfxVolume === 100, 'audio defaults are not 100/15/100');
const migratedDefaults = app.Save.normalize({ version:7, settings:{ masterVolume:70, bgmVolume:35, sfxVolume:80 } });
assert(migratedDefaults.version === 8 && migratedDefaults.settings.masterVolume === 100 && migratedDefaults.settings.bgmVolume === 15 && migratedDefaults.settings.sfxVolume === 100, 'untouched old volume defaults were not migrated');
const custom = app.Save.normalize({ version:7, settings:{ masterVolume:55, bgmVolume:22, sfxVolume:66 } });
assert(custom.settings.masterVolume === 55 && custom.settings.bgmVolume === 22 && custom.settings.sfxVolume === 66, 'custom audio volumes were overwritten during migration');
const mixed = app.Save.normalize({ version:7, settings:{ masterVolume:55, bgmVolume:35, sfxVolume:80 } });
assert(mixed.settings.masterVolume === 55 && mixed.settings.bgmVolume === 15 && mixed.settings.sfxVolume === 100, 'mixed custom/default audio values did not migrate per slider');

// Boss defeat starts a one-minute normal enemy window; special modes resume when it expires.
const red = app.Entities.createEnemy({ id:11, x:1200, y:1200, kind:'normal', speed:55, baseSpeed:55, radius:13, hp:30, maxHp:30, color:'#D98E91', specialArchetype:'ranged', dead:false });
const yellow = app.Entities.createEnemy({ id:12, x:1300, y:1200, kind:'fast', speed:140, baseSpeed:140, radius:10, hp:22, maxHp:22, color:'#E7B978', specialArchetype:'suicide', dead:false });
const boss = app.Entities.createEnemy({ id:13, isBoss:true, bossLevel:10, x:2000, y:1800, radius:46, hp:1, maxHp:1, dead:false, color:'#8D58D8' });
Game.enemies = [red, yellow, boss]; Game.boss = boss; Game.bossActive = true; Game.active = true;
Game.killBoss(boss);
assert(Game.bossMusicUnlocked === true, 'first Boss did not unlock persistent in-run BGM');
assert(Game.postBossEnemyMode === true && Game.enemyModeSuppressionTimer === 60, 'Boss defeat did not start 60-second normal-mode grace period');
assert(red.specialMode === null && yellow.specialMode === null && yellow.speed === 140, 'enemies did not revert to their original modes/speeds for one minute');
Game.updatePostBossEnemyMode(59.9);
assert(Game.enemyModeSuppressionTimer > 0 && yellow.specialMode === null, 'enemy special modes resumed before the one-minute period ended');
Game.updatePostBossEnemyMode(0.11);
assert(Game.enemyModeSuppressionTimer === 0 && red.specialMode === 'ranged', 'red enemy did not return to ranged mode after cooldown');
assert(yellow.specialMode === 'suicide' && Math.abs(yellow.speed - 231) < 1e-9, 'yellow enemy did not become a faster suicide attacker');

// A ranged enemy holds distance and fires a pooled hostile projectile.
Game.player.x = 1000; Game.player.y = 1000; Game.player.hp = 3; Game.player.invuln = 0;
Game.enemies = [app.Entities.createEnemy({ id:21, x:700, y:1000, kind:'normal', speed:70, baseSpeed:70, radius:13, hp:30, maxHp:30, specialMode:'ranged', rangedCooldown:0, dead:false })];
Game.enemyShots.length = 0; Game.spawnTimer = 99;
Game.updateEnemies(0.01, 1);
assert(Game.enemyShots.length === 1, 'ranged enemy did not launch a projectile');
const hpBeforeShot = Game.player.hp;
Game.enemyShots[0].x = Game.player.x; Game.enemyShots[0].y = Game.player.y; Game.enemyShots[0].vx = 0; Game.enemyShots[0].vy = 0;
Game.updateEnemyProjectiles(0.01);
assert(Game.player.hp === hpBeforeShot - 1 && Game.enemyShots.length === 0, 'hostile projectile did not remove itself and cost one heart');

// Suicide enemy stops for one second, then explodes. Death by damage starts the same one-second fuse.
Game.player.x = 300; Game.player.y = 200; Game.player.hp = 3; Game.player.invuln = 0;
const bomber = app.Entities.createEnemy({ id:31, x:200, y:200, kind:'fast', speed:231, baseSpeed:140, radius:10, hp:22, maxHp:22, specialMode:'suicide', fuseTimer:-1, dead:false, color:'#E7B978' });
const victim = app.Entities.createEnemy({ id:32, x:250, y:200, kind:'normal', speed:55, baseSpeed:55, radius:13, hp:30, maxHp:30, dead:false, color:'#D98E91' });
const immuneBoss = app.Entities.createEnemy({ id:33, isBoss:true, bossLevel:10, x:270, y:200, radius:46, hp:500, maxHp:500, dead:false, color:'#8D58D8' });
Game.enemies = [bomber, victim, immuneBoss];
Game.killEnemy(bomber);
assert(!bomber.dead && bomber.suicideCharging && bomber.fuseTimer === 1, 'death did not start a one-second suicide charge');
assert(!victim.dead, 'nearby enemy was hit before the bomber finished charging');
Game.updateEnemies(1.01, 1);
assert(bomber.dead && victim.dead, 'suicide explosion did not kill nearby normal enemies after its fuse');
assert(immuneBoss.hp === 500 && !immuneBoss.dead, 'Boss took damage from a suicide explosion');
assert(Game.player.hp === 2, 'player inside the suicide explosion radius did not lose exactly one heart');

// Fuse path and static pause before blast.
const fuser = app.Entities.createEnemy({ id:41, x:500, y:500, kind:'fast', speed:231, baseSpeed:140, radius:10, hp:22, maxHp:22, specialMode:'suicide', fuseTimer:-1, dead:false, color:'#E7B978' });
Game.enemies = [fuser]; Game.player.x = 550; Game.player.y = 500; Game.player.invuln = 1; Game.spawnTimer = 99;
Game.updateEnemies(0.01, 1);
assert(fuser.fuseTimer === 1, 'suicide enemy did not start its one-second fuse at close range');
const fuseX = fuser.x, fuseY = fuser.y;
Game.updateEnemies(0.2, 1);
assert(fuser.x === fuseX && fuser.y === fuseY && fuser.fuseTimer < 1, 'suicide enemy moved during its fuse');
Game.updateEnemies(0.81, 1);
assert(fuser.dead, 'suicide enemy did not explode when its one-second fuse expired');

// Broadphase separates Bosses and small enemies without all-pairs scanning.
const largeBoss = app.Entities.createEnemy({ id:51, isBoss:true, x:1000, y:1000, radius:46, dead:false });
const overlapSmall = app.Entities.createEnemy({ id:52, x:1000, y:1000, radius:13, dead:false });
const otherSmall = app.Entities.createEnemy({ id:53, x:1000, y:1000, radius:13, dead:false });
Game.enemies = [largeBoss, overlapSmall, otherSmall];
Game.separateEnemyBodies(80);
const bossDistance = Math.hypot(largeBoss.x-overlapSmall.x, largeBoss.y-overlapSmall.y);
const smallDistance = Math.hypot(overlapSmall.x-otherSmall.x, overlapSmall.y-otherSmall.y);
assert(bossDistance >= largeBoss.radius + overlapSmall.radius + 1, `Boss and small enemy still overlap (${bossDistance})`);
assert(smallDistance >= overlapSmall.radius + otherSmall.radius + 1, `small enemies still overlap (${smallDistance})`);
assert(fs.readFileSync(path.join(root,'js/game.js'),'utf8').includes('const passes = Math.max(1, Math.min(20, iterations | 0))'), 'separation pass count is not bounded for performance');

// Dense cluster stress case: 45 overlapping entities including five Boss bodies.
Game.enemies = [];
for (let i = 0; i < 45; i += 1) Game.enemies.push(app.Entities.createEnemy({
  id: 100 + i, x: 3000 + (i % 3), y: 2000 + (i % 3),
  radius: i % 9 === 0 ? 46 : 13, isBoss: i % 9 === 0, dead: false
}));
Game.separateEnemyBodies(80);
let remainingOverlaps = 0;
for (let i = 0; i < Game.enemies.length; i += 1) for (let j = i + 1; j < Game.enemies.length; j += 1) {
  const a = Game.enemies[i], b = Game.enemies[j];
  if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + 1) remainingOverlaps += 1;
}
assert(remainingOverlaps === 0, `dense Boss/enemy cluster retained ${remainingOverlaps} overlaps after separation`);

// Audio scene transitions and preload gating: no pre-Boss music; first Boss waits for full preload;
// BGM then continues across post-Boss combat without restarting.
class FakeAudio {
  constructor(src) { this.src=src || ""; this.loop=false; this.preload=""; this.volume=1; this.paused=true; this.ended=false; this.playCount=0; this.listeners={}; FakeAudio.lastInstance=this; }
  setAttribute() {}
  addEventListener(name, fn) { this.listeners[name]=fn; }
  load() {}
  play() { this.playCount++; this.paused=false; return Promise.resolve(); }
  pause() { this.paused=true; }
}
let finishPreload;
const delayedFetch = new Promise(resolve => { finishPreload = resolve; });
const audioDoc = { hidden:false, addEventListener() {}, removeEventListener() {} };
const audioWindow = {
  Audio:FakeAudio, addEventListener() {}, fetch:() => delayedFetch,
  URL:{ createObjectURL:() => "blob:fully-preloaded-bgm" }
};
const audioSandbox = { window:audioWindow, document:audioDoc, console, Promise, Math, Number, String, Object, Array, Map };
vm.createContext(audioSandbox);
vm.runInContext(fs.readFileSync(path.join(root,'js/audio.js'),'utf8'), audioSandbox, {filename:'js/audio.js'});
(async () => {
  const audio = audioWindow.FantasySurvivor.Audio;
  const bgm = FakeAudio.lastInstance;
  assert(audio.getVolume() === 1 && audio.getBgmVolume() === 0.15 && audio.getSfxVolume() === 1, 'audio API defaults are not 100/15/100');
  assert(bgm.preload === "none" && !bgm.src, 'audio element started a duplicate network load before fetch preload');
  audio.setScene('menu');
  const initialUnlock = audio.unlock();
  // Simulate the first user gesture being the Start button: capture-phase unlock begins,
  // then the click handler switches to combat before the async preload can complete.
  audio.setScene('combat');
  await Promise.resolve();
  assert(audio.isMusicPlaying() === false, 'BGM briefly played after starting the run but before the first Boss');
  const bossStart = audio.setScene('boss');
  await Promise.resolve();
  assert(audio.isMusicPlaying() === false, 'BGM began before the full MP3 preload completed');
  finishPreload({ ok:true, blob:() => Promise.resolve({ size:5000000 }) });
  await Promise.all([initialUnlock, bossStart]);
  assert(bgm.src === 'blob:fully-preloaded-bgm' && audio.isMusicPlaying(), 'preloaded Blob source did not start at first Boss appearance');
  const playCount = bgm.playCount;
  await audio.setScene('postBoss');
  assert(audio.isMusicPlaying() === true, 'BGM stopped after the first Boss was defeated');
  assert(bgm.playCount === playCount, 'BGM restarted instead of continuing after Boss defeat');
  audio.setMasterVolume(1); audio.setBgmVolume(0.15); audio.setSfxVolume(1);
  assert(Math.abs(bgm.volume - 0.15) < 1e-6, 'new BGM default level does not resolve to 15% at 100% master volume');
  audio.setScene('combat');
  assert(audio.isMusicPlaying() === false, 'BGM did not stop when the scene was returned to pre-Boss combat');
  console.log('STAGE6.11 CHECKS PASSED: 100/15/100 volume defaults and migration; player speed reduction; Boss-unlocked continuous BGM with full-file preload gating; 60-second enemy reset; ranged and suicide enemy behavior; explosion immunity for Boss; pooled hostile bullets; dense Boss-inclusive spatial-grid separation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
