const { test, assertEqual, assertClose, section } = require('./testHarness.js');
const PotOdds = require('../js/potOdds.js');
const EVCalc = require('../js/ev.js');

section('Pot odds');

test('Spec example: pot 1000, bet 500, call 500 -> required equity 25%', () => {
  const r = PotOdds.calculate({ pot: 1000, bet: 500, call: 500 });
  assertClose(r.requiredEquityPct, 25, 0.001);
});

test('No bet facing hero -> required equity is 0', () => {
  const r = PotOdds.calculate({ pot: 12, bet: 0, call: 0 });
  assertEqual(r.requiredEquity, 0);
});

test('Small call relative to a big pot needs low equity', () => {
  const r = PotOdds.calculate({ pot: 100, bet: 10, call: 10 });
  // required = 10 / (100+10+10) = 8.33%
  assertClose(r.requiredEquityPct, 8.33, 0.01);
});

test('Pot-sized bet requires 33.3% equity (classic result: risk 1 to win 2)', () => {
  const r = PotOdds.calculate({ pot: 100, bet: 100, call: 100 });
  assertClose(r.requiredEquityPct, 33.33, 0.01);
});

section('Expected value');

test('Positive EV when equity comfortably exceeds required equity', () => {
  // pot 12, bet 4, call 4 (from the spec example), equity 66%
  const r = EVCalc.evCall({ equity: 0.66, pot: 12, bet: 4, call: 4 });
  // EV = 0.66*(16) - 0.34*4 = 10.56 - 1.36 = 9.2
  assertClose(r.ev, 9.2, 0.01);
});

test('Negative EV when equity is below required equity', () => {
  const r = EVCalc.evCall({ equity: 0.20, pot: 1000, bet: 500, call: 500 });
  // EV = 0.20*(1500) - 0.80*500 = 300 - 400 = -100
  assertClose(r.ev, -100, 0.01);
});

test('EV is exactly zero at the breakeven equity point', () => {
  const po = PotOdds.calculate({ pot: 1000, bet: 500, call: 500 });
  const r = EVCalc.evCall({ equity: po.requiredEquity, pot: 1000, bet: 500, call: 500 });
  assertClose(r.ev, 0, 0.001, 'EV should be ~0 exactly at the required-equity breakeven point');
});

test('EV always discloses its assumptions', () => {
  const r = EVCalc.evCall({ equity: 0.5, pot: 10, bet: 5, call: 5 });
  assertClose(r.assumptions.length, 3, 0);
});

section('Summary');
require('./testHarness.js').summary();
