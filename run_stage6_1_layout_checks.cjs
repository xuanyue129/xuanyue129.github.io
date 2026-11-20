const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const ui = read('js/ui.js');
const game = read('js/game.js');
const main = read('js/main.js');
const checks = [
  ['portrait prompt exists', /class="orientation-prompt"/.test(html)],
  ['orientation prompt has a landscape action', /data-action="landscape"/.test(html)],
  ['viewport uses safe area', /viewport-fit=cover/.test(html)],
  ['orientation action is wired', /case "landscape": this\.requestLandscape\(\)/.test(ui)],
  ['fullscreen API requested', /requestFullscreen/.test(ui)],
  ['landscape lock attempted', /orientation\.lock\("landscape"\)/.test(ui)],
  ['mobile game immersive class enabled', /mobile-game-active/.test(ui)],
  ['portrait orientation prompt media rule exists', /orientation:\s*portrait/.test(css)],
  ['coarse pointer landscape layout exists', /pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)/.test(css)],
  ['full viewport dynamic height layout exists', /height:\s*100dvh/.test(css)],
  ['joystick is visible in landscape immersive mode', /body\.mobile-game-active \.mobile-joystick \{[^}]*display:\s*block/s.test(css)],
  ['joystick is positioned over the arena', /body\.mobile-game-active \.mobile-joystick \{[^}]*position:\s*absolute/s.test(css)],
  ['resize observer watches arena', /new global\.ResizeObserver/.test(game)],
  ['orientation and fullscreen refresh canvas', /orientationchange/.test(main) && /fullscreenchange/.test(main) && /visualViewport/.test(main)]
];
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}
if (!process.exitCode) console.log(`STAGE6.1 LAYOUT CHECKS PASSED (${checks.length}/${checks.length}).`);
