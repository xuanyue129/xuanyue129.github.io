const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const listeners = {};
const fakeWindow = {
  devicePixelRatio: 1,
  addEventListener(type, fn) { listeners[type] = fn; },
  matchMedia() { return { matches: false }; },
  localStorage: {
    data: new Map(), getItem(k) { return this.data.get(k) ?? null; },
    setItem(k,v) { this.data.set(k,v); }, removeItem(k) { this.data.delete(k); }
  },
  confirm() { return true; },
  setTimeout, clearTimeout,
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
Game.arenaWidth = 800; Game.arenaHeight = 600;
Game.callbacks = { onHUD(data) { Game.lastHud = data; } };

// 1. Three-heart system: exactly one heart is lost per valid hit.
Game.player = app.Entities.createPlayer({x:400,y:300,hp:3,maxHp:3,invuln:0,fortuneUnlocked:false,petCount:0});
Game.damagePlayer(999);
if (Game.player.hp !== 2 || Game.lastHud.hp !== 2) throw new Error('heart hit #1 did not remove exactly one heart');
Game.player.invuln = 0; Game.damagePlayer(1);
if (Game.player.hp !== 1) throw new Error('heart hit #2 incorrect');
Game.player.invuln = 0; Game.damagePlayer(1);
if (Game.player.hp !== 0) throw new Error('heart hit #3 should be fatal');

// 2. Pets charge along a line and hit every enemy encountered, not just the first.
Game.player = app.Entities.createPlayer({x:200,y:200,hp:3,maxHp:3,invuln:0,petCount:1,petAttackTimers:[0],petCharges:[null],petOrbitRadius:58,petTargetRange:390,petChargeDistance:220,petChargeSpeed:900,petChargeWidth:28,petDamage:16,petChargeInterval:1.2});
Game.enemies = [
  app.Entities.createEnemy({id:1,x:260,y:200,hp:100,maxHp:100,radius:10,dead:false}),
  app.Entities.createEnemy({id:2,x:320,y:200,hp:100,maxHp:100,radius:10,dead:false}),
  app.Entities.createEnemy({id:3,x:370,y:200,hp:100,maxHp:100,radius:10,dead:false})
];
Game.rebuildEnemyGrid();
Game.elapsed = 0;
Game.updatePetAttacks(0.01); // charge begins towards closest target
for (let i=0;i<8;i++) Game.updatePetAttacks(0.05);
if (!(Game.enemies[0].hp < 100 && Game.enemies[1].hp < 100 && Game.enemies[2].hp < 100)) {
  throw new Error('pet charge did not hit all targets on its path: '+Game.enemies.map(e=>e.hp).join(','));
}

// 3. Fortune unlock: getting hit starts aura; nearby enemies take continuous damage.
Game.player = app.Entities.createPlayer({x:200,y:200,hp:3,maxHp:3,invuln:0,fortuneUnlocked:true,fortuneAuraTimer:0,fortuneAuraDuration:4,fortuneRadius:100,fortuneDamage:10,fortuneKillHealEvery:Infinity,fortuneRegenInterval:Infinity});
Game.enemies = [app.Entities.createEnemy({id:7,x:250,y:200,hp:100,maxHp:100,radius:10,dead:false})];
Game.active = true;
Game.damagePlayer(50);
if (Game.player.hp !== 2 || Game.player.fortuneAuraTimer !== 4) throw new Error('fortune aura failed to trigger on hit');
Game.updateFortuneAura(1);
if (Game.enemies[0].hp !== 90) throw new Error('fortune aura should deal continuous area damage');

// 4. Fortune recovery cards: kill-threshold, max heart and timed healing are supported.
Game.player.fortuneKillHealEvery = 2;
Game.player.fortuneKillCounter = 1;
Game.player.hp = 1;
Game.killEnemy({id:9,x:220,y:220,hp:0,maxHp:1,radius:10,color:'#fff',kind:'normal',dead:false});
if (Game.player.hp !== 2) throw new Error('kill-count heart recovery failed');
Game.player.maxHp = 4; Game.player.hp = 1; Game.player.fortuneRegenInterval = 10; Game.player.fortuneRegenTimer = 9;
Game.updateFortuneTimedHealing(1);
if (Game.player.hp !== 2) throw new Error('timed heart recovery failed');
const maxHeartCard = app.Upgrades.CARDS.find(c=>c.id==='fortuneMaxHearts');
Game.player.hp = 1; Game.player.maxHp = 4; maxHeartCard.apply(Game.player);
if (Game.player.maxHp !== 5 || Game.player.hp !== 1) throw new Error('max-heart trait should raise the cap without healing');

// 5. Card pool classifications and unlock gates.
const base = {petCount:0, vortexUnlocked:false, fortuneUnlocked:false, attackInterval:0.85, critMultiplier:1.8,
  ricochetChance:0, critChance:0, projectileCount:1, projectilePierce:0, vortexShotsPerSummon:8,
  vortexCount:1,vortexRadius:102,vortexDuration:3.6, fortuneKillHealEvery:Infinity, fortuneRegenInterval:Infinity,
  fortuneRadius:100,fortuneAuraDuration:4.2,maxHp:3};
const eligible0 = app.Upgrades.getEligibleCards(base);
if (!eligible0.some(c=>c.id==='petSummon') || eligible0.some(c=>c.id==='petDamage')) throw new Error('pet unlock gate incorrect');
if (!eligible0.some(c=>c.id==='fortuneUnlock') || eligible0.some(c=>c.id==='fortuneDamage')) throw new Error('fortune unlock gate incorrect');
if (!eligible0.some(c=>c.archetype==='general')) throw new Error('general upgrades missing');
if (app.Upgrades.CARDS.some(c=>['vitality','regeneration','healing'].includes(c.id))) throw new Error('removed life-recovery card still exists');
base.petCount=1; base.petChargeWidth=28; base.petChargeDistance=220; base.petChargeInterval=1.35; base.petChargeSpeed=900; base.vortexUnlocked=true; base.fortuneUnlocked=true;
if (!app.Upgrades.getEligibleCards(base).some(c=>c.id==='petChargeWidth')) throw new Error('pet charge width upgrade missing');

// 6. Old save migration from v2 heart-HP progression to v3 heart progression.
const migrated = app.Save.normalize({version:2,gold:100,permanentUpgrades:{maxHp:9,damage:2,goldRate:1,expRate:1},stats:{bestWave:3}});
if (migrated.version !== 3 || migrated.permanentUpgrades.maxHp !== 3) throw new Error('save migration failed');

// 7. New-run defaults are three integer hearts and no pre-unlocked secondary mechanics.
Game.setProgression({permanentUpgrades:{maxHp:0,damage:0,goldRate:0,expRate:0}},1);
Game.arenaWidth=800; Game.arenaHeight=600; Game.start();
if (Game.player.hp !== 3 || Game.player.maxHp !== 3 || Game.player.petCount !== 0 || Game.player.fortuneUnlocked) throw new Error('run initial state is not three hearts / locked paths');
Game.stop();

// 8. Touch joystick movement vector moves the character.
Game.player = app.Entities.createPlayer({x:300,y:300,hp:3,maxHp:3,speed:200,radius:14});
Game.touchMoveX = 1; Game.touchMoveY = 0;
Game.updatePlayerMovement(0.1);
if (Math.abs(Game.player.x-320)>0.01) throw new Error('touch movement vector not applied');
Game.resetJoystick();

// 9. Weighted draft contains unique cards and supports five categories.
const picked = app.Upgrades.rollCards(3, base);
if (picked.length !== 3 || new Set(picked.map(c=>c.id)).size !== 3) throw new Error('draft did not return 3 unique cards');
const archetypes = new Set(app.Upgrades.CARDS.map(c=>c.archetype));
for (const required of ['shooting','pet','gather','fortune','general']) if (!archetypes.has(required)) throw new Error('missing category '+required);
console.log('STAGE6 LOGIC TESTS PASSED: hearts, pet line-charge, fortune aura/healing, unlock gates, save migration, touch movement, unique drafts.');
