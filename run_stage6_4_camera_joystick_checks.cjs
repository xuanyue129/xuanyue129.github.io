const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const fakeWindow = {
  devicePixelRatio: 1,
  addEventListener() {},
  matchMedia() { return { matches: true }; },
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
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// v3 legacy saves migrate to v8 and receive a safe default joystick position.
const save = app.Save.normalize({ version:3, gold:7, settings:{ masterVolume:55, particles:true, screenShake:false } });
assert(save.version === 8, 'save version did not migrate to v8');
assert(save.settings.joystickPosition.x === 0.86 && save.settings.joystickPosition.y === 0.78, 'legacy save joystick default incorrect');
const clampedSave = app.Save.normalize({ version:4, settings:{ joystickPosition:{x:5,y:-1} } });
assert(clampedSave.settings.joystickPosition.x === 0.92 && clampedSave.settings.joystickPosition.y === 0.1, 'saved joystick coordinates were not clamped');

// The world is larger than the viewport, and the camera keeps the player centered while inside map bounds.
Game.arenaCanvas = { getBoundingClientRect() { return { width:844, height:390 }; } };
Game.arenaContext = { setTransform() {} };
Game.player = app.Entities.createPlayer({ x:2100, y:1500, radius:14, speed:200 });
Game.resize();
assert(Game.viewWidth === 844 && Game.viewHeight === 390, 'viewport dimensions were not read from canvas');
assert(Game.cameraZoom === 0.66, 'mobile camera zoom was not applied');
Game.player.x = Game.arenaWidth / 2;
Game.player.y = Game.arenaHeight / 2;
Game.updateCamera();
const screenX = (Game.player.x - Game.cameraX) * Game.cameraZoom;
const screenY = (Game.player.y - Game.cameraY) * Game.cameraZoom;
assert(Math.abs(screenX - Game.viewWidth/2) < 0.01, 'camera did not center player horizontally');
assert(Math.abs(screenY - Game.viewHeight/2) < 0.01, 'camera did not center player vertically');
assert(Game.arenaWidth > Game.viewWidth * 3 && Game.arenaHeight > Game.viewHeight * 3, 'world map is not substantially larger than viewport');

// At map edge camera clamps to world edge and player remains inside the world bounds.
Game.player.x = 10; Game.player.y = 10;
Game.keepPlayerInBounds(); Game.updateCamera();
assert(Game.player.x > 0 && Game.player.y > 0 && Game.cameraX === 0 && Game.cameraY === 0, 'map boundary clamping failed');
assert((Game.player.x - Game.cameraX) * Game.cameraZoom < Game.viewWidth / 2, 'player should move off center as camera reaches the world edge');

// Spawned small monsters enter around the current camera viewport rather than the far outer edge of the huge world.
Game.enemies = [];
Game.player.x = Game.arenaWidth / 2; Game.player.y = Game.arenaHeight / 2; Game.updateCamera();
Game.spawnEnemy(1);
const spawned = Game.enemies[0];
const enemyScreenX = (spawned.x - Game.cameraX) * Game.cameraZoom;
const enemyScreenY = (spawned.y - Game.cameraY) * Game.cameraZoom;
const edgeDistance = Math.min(Math.abs(enemyScreenX), Math.abs(enemyScreenX - Game.viewWidth), Math.abs(enemyScreenY), Math.abs(enemyScreenY - Game.viewHeight));
assert(edgeDistance <= 24, 'new enemies are not spawning near the visible camera perimeter');

// Custom joystick position maps to percentage coordinates and clears old right/bottom anchors.
Game.joystickElement = { style: {}, classList:{toggle(){}}, setAttribute(){} };
Game.setJoystickPosition({x:0.32,y:0.64});
assert(Game.joystickElement.style.left === '32%' && Game.joystickElement.style.top === '64%', 'joystick custom position not applied');
assert(Game.joystickElement.style.right === 'auto' && Game.joystickElement.style.bottom === 'auto', 'legacy anchors override custom joystick position');
Game.setJoystickPosition({x:1,y:0});
assert(Game.joystickPosition.x === 0.92 && Game.joystickPosition.y === 0.1, 'joystick position was not clamped');

// Rendering code has a fixed viewport clear, world camera transform and explicit finite map boundary.
const source = fs.readFileSync(path.join(root,'js/game.js'),'utf8');
assert(/ctx\.clearRect\(0, 0, viewW, viewH\)/.test(source), 'render does not clear viewport dimensions');
assert(/ctx\.translate\(-this\.cameraX \* this\.cameraZoom, -this\.cameraY \* this\.cameraZoom\)/.test(source), 'clamped camera translation missing');
assert(/ctx\.strokeRect\(0, 0, worldW, worldH\)/.test(source), 'map boundary drawing missing');
const ui = fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
assert(/control\.addEventListener\(\"pointerdown\"/.test(ui) && /control\.addEventListener\(\"pointermove\"/.test(ui), 'joystick preview drag handlers missing');
assert(/this\.saveData\.settings\.joystickPosition = \{ \.\.\.this\.pendingJoystickPosition \}/.test(ui), 'joystick position is not persisted after drag');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(/id=\"joystickPreviewArea\"/.test(html) && /id=\"joystickPreviewControl\"/.test(html), 'mobile joystick preview UI missing');

console.log('STAGE6.4 CAMERA / JOYSTICK TESTS PASSED: v8 save migration, expanded world, centered camera, finite map edges, customizable mobile joystick position.');
