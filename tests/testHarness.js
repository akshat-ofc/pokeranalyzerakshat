/**
 * testHarness.js — zero-dependency test runner
 */
let passCount = 0;
let failCount = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failCount++;
    failures.push({ name, error: e });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`      ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'Assertion failed'}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'Expected truthy value');
}

function section(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function summary() {
  console.log(`\n${'-'.repeat(50)}`);
  console.log(`${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
}

module.exports = { test, assertEqual, assertClose, assertTrue, section, summary };
