/**
 * run-all.js — runs every *.test.js file in this directory in its own
 * process (so each file's local pass/fail counters don't leak into the
 * next) and prints a combined summary at the end.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();

let totalPass = 0, totalFail = 0, anyFail = false;

for (const file of files) {
  console.log(`\n${'='.repeat(60)}\nRUNNING: ${file}\n${'='.repeat(60)}`);
  try {
    const output = execFileSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
    process.stdout.write(output);
    const m = output.match(/(\d+) passed, (\d+) failed/);
    if (m) { totalPass += Number(m[1]); totalFail += Number(m[2]); }
  } catch (e) {
    anyFail = true;
    process.stdout.write(e.stdout || '');
    console.log(`\n(process for ${file} exited with a failure)`);
    const m = (e.stdout || '').match(/(\d+) passed, (\d+) failed/);
    if (m) { totalPass += Number(m[1]); totalFail += Number(m[2]); }
  }
}

console.log(`\n${'#'.repeat(60)}`);
console.log(`GRAND TOTAL: ${totalPass} passed, ${totalFail} failed across ${files.length} test files`);
console.log('#'.repeat(60));

if (totalFail > 0 || anyFail) process.exitCode = 1;
