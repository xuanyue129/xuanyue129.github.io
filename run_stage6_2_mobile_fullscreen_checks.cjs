const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const main = read('js/main.js');
const checks = [
  ['mobile site mode is applied on entry', /applyMobileSiteMode\(\)/.test(main) && /mobile-site-mode/.test(main)],
  ['mobile layout uses full dynamic viewport', /body\.mobile-site-mode \.site-shell[\s\S]*?height:\s*100dvh/.test(css)],
  ['mobile top navigation is hidden for viewport use', /body\.mobile-site-mode \.topbar[\s\S]*?display:\s*none/.test(css)],
  ['mobile footer is hidden for viewport use', /body\.mobile-site-mode \.site-footer/.test(css)],
  ['mobile main region consumes viewport', /body\.mobile-site-mode main[\s\S]*?height:\s*100%/.test(css)],
  ['mobile joystick right position is applied', /body\.mobile-site-mode \.mobile-joystick[\s\S]*?right:\s*max\(/.test(css)],
  ['joystick hint describes customizable positioning', /手机使用可自定义位置的轮盘/.test(html)],
  ['fullscreen remains tied to start interaction', /enterMobileImmersiveMode\(\)/.test(read('js/ui.js')) && /requestFullscreen/.test(read('js/ui.js'))],
  ['viewport resize triggers canvas refresh', /addEventListener\('resize', refreshViewport/.test(main)]
];
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}
if (!process.exitCode) console.log(`STAGE6.2 MOBILE FULLSCREEN CHECKS PASSED (${checks.length}/${checks.length}).`);
