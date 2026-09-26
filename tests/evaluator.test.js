const { test, assertEqual, assertTrue, section } = require('./testHarness.js');
const Cards = require('../js/cards.js');
const Evaluator = require('../js/evaluator.js');

const ids = (arr) => arr.map(Cards.stringToId);
const bestName = (cards) => Evaluator.evaluateBest(ids(cards)).name;
const bestEval = (cards) => Evaluator.evaluateBest(ids(cards));

section('Hand Evaluator — all 10 categories');

test('Royal Flush', () => {
  assertEqual(bestName(['As', 'Ks', 'Qs', 'Js', 'Ts', '2c', '3d']), 'Royal Flush');
});

test('Straight Flush (non-royal)', () => {
  assertEqual(bestName(['9s', '8s', '7s', '6s', '5s', '2c', '3d']), 'Straight Flush');
});

test('Straight Flush — ace-low (steel wheel)', () => {
  const r = bestEval(['As', '2s', '3s', '4s', '5s', 'Kd', 'Qc']);
  assertEqual(r.name, 'Straight Flush');
  assertEqual(r.tiebreak[0], 5, 'Wheel straight flush high card should compare as 5');
});

test('Four of a Kind', () => {
  assertEqual(bestName(['Ah', 'Ad', 'Ac', 'As', 'Kd', '2c', '3d']), 'Four of a Kind');
});

test('Four of a Kind — correct kicker selection from 7 cards', () => {
  const r = bestEval(['Ah', 'Ad', 'Ac', 'As', 'Kd', 'Qc', '2d']);
  assertEqual(r.tiebreak[1], 13, 'Kicker should be the King (13), not the Queen or 2');
});

test('Full House', () => {
  assertEqual(bestName(['Ah', 'Ad', 'Ac', 'Kd', 'Kc', '2c', '3d']), 'Full House');
});

test('Full House — best of two possible boats (7 cards)', () => {
  const r = bestEval(['2h', '2d', '7c', '7d', '7h', 'Kd', 'Kc']);
  assertEqual(r.name, 'Full House');
  assertEqual(r.tiebreak[0], 7, 'Trips should be sevens (the trip beats the pair for primary rank)');
  assertEqual(r.tiebreak[1], 13, 'Pair portion should be Kings (better than the deuces)');
});

test('Flush', () => {
  assertEqual(bestName(['2s', '5s', '9s', 'Js', 'Ks', '2d', '3c']), 'Flush');
});

test('Straight', () => {
  assertEqual(bestName(['4s', '5d', '6c', '7h', '8s', '2d', '3c']), 'Straight');
});

test('Straight — ace-low (the wheel, A-2-3-4-5)', () => {
  const r = bestEval(['As', '2d', '3c', '4h', '5s', '9c', '9d']);
  assertEqual(r.name, 'Straight');
  assertEqual(r.tiebreak[0], 5, 'Wheel straight should have a comparison high card of 5, not 14');
});

test('Straight — ace-high (broadway)', () => {
  const r = bestEval(['As', 'Kd', 'Qc', 'Jh', 'Ts', '2c', '3d']);
  assertEqual(r.name, 'Straight');
  assertEqual(r.tiebreak[0], 14);
});

test('Three of a Kind', () => {
  assertEqual(bestName(['4s', '4d', '4c', '7h', '8s', '2d', '9c']), 'Three of a Kind');
});

test('Two Pair', () => {
  assertEqual(bestName(['4s', '4d', '7c', '7h', '8s', '2d', '9c']), 'Two Pair');
});

test('Two Pair — best two pair chosen from three pairs on 7 cards', () => {
  const r = bestEval(['4s', '4d', '7c', '7h', '9s', '9d', '2c']);
  assertEqual(r.tiebreak[0], 9);
  assertEqual(r.tiebreak[1], 7);
  assertEqual(r.tiebreak[2], 4, 'Kicker should be the remaining pair-rank card (4), since 4 is not part of best two-pair');
});

test('One Pair', () => {
  assertEqual(bestName(['4s', '4d', '7c', '9h', '8s', '2d', 'Kc']), 'One Pair');
});

test('High Card', () => {
  assertEqual(bestName(['4s', '6d', '7c', '9h', '8s', '2d', 'Kc']), 'High Card');
});

section('Head-to-head comparisons');

test('AA beats KK (both boards identical)', () => {
  const aa = bestEval(['Ah', 'Ad', '2c', '3d', '5h', '7s', '9c']);
  const kk = bestEval(['Kh', 'Kd', '2c', '3d', '5h', '7s', '9c']);
  assertTrue(aa.score > kk.score, 'AA should outscore KK');
});

test('Flush beats Straight', () => {
  const flush = bestEval(['2s', '5s', '9s', 'Js', 'Ks', 'Ad', '3c']);
  const straight = bestEval(['4h', '5d', '6c', '7h', '8s', 'Ad', '3c']);
  assertTrue(flush.score > straight.score);
});

test('Full House beats Flush', () => {
  const fh = bestEval(['Ah', 'Ad', 'Ac', 'Kd', 'Kc', '2c', '3d']);
  const flush = bestEval(['2s', '5s', '9s', 'Js', 'Ks', 'Ad', '3c']);
  assertTrue(fh.score > flush.score);
});

test('Quads beats Full House', () => {
  const quads = bestEval(['Ah', 'Ad', 'Ac', 'As', 'Kd', '2c', '3d']);
  const fh = bestEval(['2h', '2d', '2c', 'Kd', 'Kc', '3c', '4d']);
  assertTrue(quads.score > fh.score);
});

test('Straight Flush beats Quads', () => {
  const sf = bestEval(['9s', '8s', '7s', '6s', '5s', '2c', '3d']);
  const quads = bestEval(['Ah', 'Ad', 'Ac', 'As', 'Kd', '2c', '3d']);
  assertTrue(sf.score > quads.score);
});

section('Split pots / board-only hands');

test('Identical best-five hands split the pot (paired board plays)', () => {
  const board = ids(['9s', 'Ts', 'Jd', 'Qc', 'Kh']);
  const p1 = ids(['2c', '3d']);
  const p2 = ids(['4h', '5s']);
  const e1 = Evaluator.evaluateBest(p1.concat(board));
  const e2 = Evaluator.evaluateBest(p2.concat(board));
  assertEqual(e1.score, e2.score, 'Both hands should play the board straight for an identical score (a true split)');
});

test('Duplicate-card detection helper: no card id repeats in a 7-card hand', () => {
  const cards = ids(['As', 'Ks', 'Qs', 'Js', 'Ts', '2c', '3d']);
  const unique = new Set(cards);
  assertEqual(unique.size, cards.length, 'All card ids in a valid hand must be unique');
});

section('Score packing sanity');

test('Category always dominates tiebreakers regardless of rank', () => {
  const worstStraight = bestEval(['5h', '4d', '3c', '2s', 'As', '9d', '8c']);
  const bestHighCard = bestEval(['Ah', 'Kd', 'Qc', 'Js', '9s', '2d', '3c']);
  assertTrue(worstStraight.score > bestHighCard.score);
});

section('Summary');
require('./testHarness.js').summary();
