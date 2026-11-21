const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = __dirname;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const document = { hidden: false, addEventListener() {}, getElementById() { return null; } };
const window = { document, navigator: { hardwareConcurrency: 8, deviceMemory: 8 }, addEventListener() {}, matchMedia(q) { return { matches: q.includes('coarse') }; }, localStorage: { getItem() { return null; }, setItem() {} } };
const sandbox = { window, document, console, Math, Date, Map, Set, Array, Object, Number, String, JSON, Infinity, performance: { now: () => 1000 }, requestAnimationFrame: () => 1, setTimeout, clearTimeout };
vm.createContext(sandbox);
for (const file of ['js/entities.js', 'js/upgrades.js', 'js/save.js', 'js/game.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
const Game = window.FantasySurvivor.Game;
assert(Game.CONFIG.performance.desktopFps === 60, 'desktop target is not 60 FPS');
assert(Game.CONFIG.performance.mobileFps === 60, 'mobile target is not 60 FPS');
assert(Game.CONFIG.performance.backgroundFps === 60, 'background animation target is not 60 FPS');

// Verify the player is now drawn as a layered character, not the old single orb.
Game.player = { x: 120, y: 140, radius: 14, invuln: 0 };
const calls = { ellipses: 0, curves: 0, arcs: 0, strokes: 0, fills: 0, gradients: 0 };
const gradient = { addColorStop() {} };
const ctx = {
  save() {}, restore() {}, translate() {}, rotate() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() { calls.curves++; },
  ellipse() { calls.ellipses++; }, arc() { calls.arcs++; }, fill() { calls.fills++; }, stroke() { calls.strokes++; },
  fillRect() {}, strokeRect() {}, setLineDash() {},
  createRadialGradient() { calls.gradients++; return gradient; },
  set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set globalAlpha(v) {}, set globalCompositeOperation(v) {}
};
Game.drawPlayer(ctx, 1.25);
assert(calls.ellipses >= 4, 'character sprite is missing layered body/robe/face/ground shapes');
assert(calls.curves >= 8, 'character sprite is missing detailed silhouette curves');
assert(calls.arcs >= 4 && calls.strokes >= 4 && calls.fills >= 4, 'character sprite details were not rendered');
console.log('STAGE6.13 CHECKS PASSED: desktop/mobile/background 60 FPS configuration; layered Canvas character sprite rendering.');
