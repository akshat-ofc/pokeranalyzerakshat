const { test, assertEqual, assertTrue, section } = require('./testHarness.js');
const Ranges = require('../js/ranges.js');
const Cards = require('../js/cards.js');

section('Range matrix fundamentals');

test('169 canonical hands total', () => {
  assertEqual(Ranges.ALL_HANDS.length, 169);
});

test('1326 total combinations across the full range', () => {
  assertEqual(Ranges.TOTAL_COMBOS, 1326);
});

test('Pocket pair has 6 combos, suited has 4, offsuit has 12', () => {
  assertEqual(Ranges.comboCountForKey('AA'), 6);
  assertEqual(Ranges.comboCountForKey('AKs'), 4);
  assertEqual(Ranges.comboCountForKey('AKo'), 12);
});

test('Grid diagonal is all pairs; above diagonal suited; below diagonal offsuit', () => {
  const grid = Ranges.GRID_META;
  assertEqual(grid[0][0].type, 'pair');
  assertEqual(grid[0][1].type, 'suited'); // row 0 (A), col 1 (K) -> AKs
  assertEqual(grid[1][0].type, 'offsuit'); // row 1 (K), col 0 (A) -> AKo
});

section('Text notation parsing');

test('Parses a mixed list: pairs, suited/offsuit, dash ranges, plus ranges', () => {
  const { keys, errors } = Ranges.parseRangeText('AA,KK,QQ,AKs,AQs,JJ-TT,T9s+');
  assertEqual(errors.length, 0);
  assertTrue(keys.includes('AA') && keys.includes('KK') && keys.includes('QQ'));
  assertTrue(keys.includes('AKs') && keys.includes('AQs'));
  assertTrue(keys.includes('JJ') && keys.includes('TT'));
  assertTrue(keys.includes('T9s'));
});

test('Rejects invalid tokens with a helpful error, without throwing', () => {
  const { keys, errors } = Ranges.parseRangeText('AA,ZZ,AKq');
  assertTrue(errors.length === 2);
  assertTrue(keys.includes('AA'));
});

test('Pair-plus notation expands correctly (88+)', () => {
  const { keys } = Ranges.parseRangeText('88+');
  ['88', '99', 'TT', 'JJ', 'QQ', 'KK', 'AA'].forEach((k) => assertTrue(keys.includes(k), `missing ${k}`));
  assertTrue(!keys.includes('77'));
});

section('Combo expansion & blocked-card filtering');

test('Expanding AA yields exactly 6 unique 2-card combos', () => {
  const combos = Ranges.expandKeyToCombos('AA');
  assertEqual(combos.length, 6);
  const seen = new Set(combos.map((c) => c.slice().sort().join('-')));
  assertEqual(seen.size, 6);
});

test('combosFromKeys excludes combos that use a blocked (hero) card', () => {
  const heroAceSpade = Cards.stringToId('As');
  const combos = Ranges.combosFromKeys(['AA'], [heroAceSpade]);
  // 6 total AA combos normally; blocking As removes the 3 combos that include As
  assertEqual(combos.length, 3);
  combos.forEach((c) => assertTrue(!c.includes(heroAceSpade)));
});

section('Top-percent presets');

test('Top 10% preset selects roughly 10% of combos', () => {
  const keys = Ranges.topPercentKeys(10);
  const combos = Ranges.combosFromKeys(keys, []);
  const pct = combos.length / Ranges.TOTAL_COMBOS;
  assertTrue(pct >= 0.08 && pct <= 0.13, `expected ~10%, got ${(pct * 100).toFixed(1)}%`);
});

test('Top 20% is a superset of Top 10%', () => {
  const top10 = new Set(Ranges.topPercentKeys(10));
  const top20 = new Set(Ranges.topPercentKeys(20));
  for (const k of top10) assertTrue(top20.has(k), `${k} from top10 missing in top20`);
});

section('Summary');
require('./testHarness.js').summary();
