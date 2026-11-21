const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('js/game.js', 'utf8');
const checks = [
  ['proximity starts charge', /if \(distance <= triggerDistance\) \{\s*this\.startSuicideCharge\(enemy\);/],
  ['charge duration is one second', /source\.fuseTimer = 1\.0;/],
  ['charging enemies stop moving', /enemy\.vx = 0;\s*enemy\.vy = 0;\s*if \(enemy\.fuseTimer <= 0\) this\.triggerSuicideExplosion\(enemy\);/],
  ['death starts charge instead of instant explosion', /if \(enemy\.specialMode === "suicide" && !enemy\.exploded\) \{\s*this\.startSuicideCharge\(enemy\);/],
  ['charging enemy ignores further damage', /if \(!enemy \|\| enemy\.dead \|\| enemy\.suicideCharging\) return;/],
  ['visual fuse progress uses one-second duration', /1 - enemy\.fuseTimer \/ 1\.0/],
  ['explosion remains guarded against duplicate triggers', /if \(!source \|\| source\.dead \|\| source\.exploded\) return false;/]
];
let failed = 0;
for (const [name, pattern] of checks) {
  const ok = pattern.test(source);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
try { new vm.Script(source, { filename: 'js/game.js' }); console.log('PASS game.js syntax'); }
catch (e) { console.error('FAIL game.js syntax', e); failed++; }
if (failed) process.exit(1);
