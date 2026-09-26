const { test, assertEqual, assertClose, assertTrue, section } = require('./testHarness.js');
const Cards = require('../js/cards.js');
const Outs = require('../js/outs.js');
const Decision = require('../js/decision.js');
const BoardTexture = require('../js/boardTexture.js');

const ids = (arr) => arr.map(Cards.stringToId);

section('Outs engine — exact hypergeometric math');

test('Nut flush draw on the flop: 9 outs, 19.1% next card, 35.0% by river', () => {
  const r = Outs.computeOuts(ids(['As', 'Ks']), ids(['2s', '7s', '9d']));
  assertEqual(r.count, 9);
  assertClose(r.probNext * 100, 19.1, 0.1);
  assertClose(r.probByRiver * 100, 35.0, 0.1);
});

test('Open-ended straight draw on the flop: 8 outs', () => {
  const r = Outs.computeOuts(ids(['8h', '9c']), ids(['6d', '7c', '2h']));
  assertEqual(r.count, 8);
});

test('Turn-only draw (1 card to come): probNext equals probByRiver', () => {
  const r = Outs.computeOuts(ids(['As', 'Ks']), ids(['2s', '7s', '9d', '4h']));
  assertEqual(r.probNext, r.probByRiver);
});

test('Pairing an overcard from no-pair is NOT counted as an out (too weak/unreliable)', () => {
  const r = Outs.computeOuts(ids(['Ah', 'Kd']), ids(['9s', '4d', '2c']));
  // Hero has ace-king high, no pair, no draw — any out here should only be
  // straight/flush-type jumps (there are none), not simple overcard pairing.
  assertEqual(r.count, 0);
});

test('Outs never double count the same card twice', () => {
  const r = Outs.computeOuts(ids(['8s', '9s']), ids(['7s', '6d', '2s']));
  const unique = new Set(r.outs);
  assertEqual(unique.size, r.outs.length);
});

section('Board texture analysis');

test('Monotone board is flagged correctly', () => {
  const t = BoardTexture.analyze(ids(['2s', '7s', 'Ks']));
  assertEqual(t.flushness, 'monotone');
  assertTrue(t.flushPossible);
});

test('Paired board is flagged correctly', () => {
  const t = BoardTexture.analyze(ids(['7s', '7d', '2c']));
  assertTrue(t.paired);
  assertTrue(t.fullHousePossible);
});

test('Dry rainbow board has no flush/straight possibility flagged incorrectly', () => {
  const t = BoardTexture.analyze(ids(['2s', '9d', 'Kc']));
  assertEqual(t.flushness, 'rainbow');
});

section('Decision engine — transparent, labeled reasoning');

test('Clear pot-odds favorite -> CALL (or better), with a fact-labeled reason', () => {
  const d = Decision.decide({
    equityPct: 66, requiredEquityPct: 25, callAmount: 4, betAmount: 4, pot: 12,
    effectiveStack: 100, ev: 9.2, opponentRangeIsRandomOrWide: false, confidence: 'HIGH'
  });
  assertTrue(d.action === 'CALL' || d.action === 'RAISE');
  assertTrue(d.reasons.some((r) => r.type === 'fact' && r.label === 'Pot odds'));
});

test('Equity well below required equity -> FOLD', () => {
  const d = Decision.decide({
    equityPct: 20, requiredEquityPct: 35, callAmount: 500, betAmount: 500, pot: 1000,
    effectiveStack: 5000, ev: -100, opponentRangeIsRandomOrWide: false, confidence: 'HIGH'
  });
  assertEqual(d.action, 'FOLD');
});

test('No bet facing hero -> CHECK or BET, never CALL/FOLD', () => {
  const d = Decision.decide({
    equityPct: 40, requiredEquityPct: 0, callAmount: 0, betAmount: 0, pot: 20,
    effectiveStack: 100, ev: 0, opponentRangeIsRandomOrWide: false, confidence: 'MEDIUM'
  });
  assertTrue(d.action === 'CHECK' || d.action === 'BET');
});

test('All-in call with insufficient equity -> FOLD, not ALL-IN', () => {
  const d = Decision.decide({
    equityPct: 30, requiredEquityPct: 50, callAmount: 100, betAmount: 60, pot: 40,
    effectiveStack: 100, ev: -20, opponentRangeIsRandomOrWide: false, confidence: 'HIGH'
  });
  assertEqual(d.action, 'FOLD');
});

test('Decision engine always appends an explicit non-certainty disclaimer', () => {
  const d = Decision.decide({
    equityPct: 80, requiredEquityPct: 20, callAmount: 10, betAmount: 10, pot: 10,
    effectiveStack: 100, ev: 50, opponentRangeIsRandomOrWide: false, confidence: 'HIGH'
  });
  assertTrue(d.reasons.some((r) => r.type === 'disclaimer'));
});

test('Random/wide opponent modeling triggers an explicit uncertainty flag', () => {
  const d = Decision.decide({
    equityPct: 55, requiredEquityPct: 25, callAmount: 10, betAmount: 10, pot: 10,
    effectiveStack: 100, ev: 5, opponentRangeIsRandomOrWide: true, confidence: 'LOW'
  });
  assertTrue(d.reasons.some((r) => r.type === 'uncertain'));
});

section('Summary');
require('./testHarness.js').summary();
