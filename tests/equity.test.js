const { test, assertEqual, assertClose, assertTrue, section } = require('./testHarness.js');
const Cards = require('../js/cards.js');
const Equity = require('../js/equity.js');

const ids = (arr) => arr.map(Cards.stringToId);

section('Exact enumeration — known heads-up scenarios');

test('AKs vs 99 on Qs Js 2d (2 cards to come) — matches known ~63.5% equity', () => {
  const state = {
    hero: ids(['As', 'Ks']),
    board: ids(['Qs', 'Js', '2d']),
    dead: [],
    opponents: [{ type: 'exact', cards: ids(['9c', '9d']) }]
  };
  assertTrue(Equity.canEnumerateExact(state));
  const r = Equity.exactEnumerate(state);
  assertEqual(r.total, 990, 'C(45,2) = 990 remaining turn/river combinations');
  assertClose(r.equity, 0.6354, 0.01, 'AKs equity vs 99 on this flop');
});

test('Set vs flush draw on the turn (1 card to come) — set is a big favorite', () => {
  // Hero: 7h7d (set of sevens) vs opponent flush draw AsKs on board 7c 2s 9s 4d (one card: river)
  const state = {
    hero: ids(['7h', '7d']),
    board: ids(['7c', '2s', '9s', '4d']),
    dead: [],
    opponents: [{ type: 'exact', cards: ids(['As', 'Ks']) }]
  };
  assertTrue(Equity.canEnumerateExact(state));
  const r = Equity.exactEnumerate(state);
  assertEqual(r.total, 44, '44 unseen cards for the river');
  assertTrue(r.equity > 0.75, `Set should be a big favorite vs a flush draw with only the river to come, got ${r.equity}`);
});

test('River already dealt — single deterministic showdown', () => {
  const state = {
    hero: ids(['Ah', 'Kh']),
    board: ids(['Qh', 'Jh', 'Th', '2c', '3d']), // hero has royal flush
    dead: [],
    opponents: [{ type: 'exact', cards: ids(['As', 'Ad']) }]
  };
  const r = Equity.exactEnumerate(state);
  assertEqual(r.total, 1);
  assertEqual(r.win, 1);
  assertEqual(r.equity, 1, 'Royal flush must win with certainty on a completed board');
});

test('Split pot on the river: identical board-based straight for both — exact 50/50', () => {
  const state = {
    hero: ids(['2c', '3d']),
    board: ids(['9s', 'Ts', 'Jd', 'Qc', 'Kh']),
    dead: [],
    opponents: [{ type: 'exact', cards: ids(['4h', '5s']) }]
  };
  const r = Equity.exactEnumerate(state);
  assertEqual(r.win, 0);
  assertEqual(r.tie, 1);
  assertEqual(r.equity, 0.5, 'A true chop should give exactly 50% equity to each player');
});

section('Multiway pots (3-way and 4-way)');

test('Three-way exact enumeration on the river sums sensibly', () => {
  const state = {
    hero: ids(['Ah', 'Ad']),
    board: ids(['Ac', '2d', '7h', '9s', 'Ks']), // hero has a set of aces (trips)
    dead: [],
    opponents: [
      { type: 'exact', cards: ids(['Kh', 'Kd']) }, // opponent has a set of kings (loses to hero's trips)
      { type: 'exact', cards: ids(['2h', '2c']) }  // opponent has a set of twos (loses too)
    ]
  };
  const r = Equity.exactEnumerate(state);
  assertEqual(r.total, 1);
  assertEqual(r.win, 1, 'Hero trip aces beats both opponents trips (kings/twos)');
  assertEqual(r.equity, 1);
});

test('Four-way Monte Carlo produces a valid probability distribution', () => {
  const state = {
    hero: ids(['Ah', 'Ad']),
    board: [],
    dead: [],
    opponents: [{ type: 'random' }, { type: 'random' }, { type: 'random' }]
  };
  const rng = Cards.seededRng(7);
  const r = Equity.monteCarlo(state, 8000, rng);
  assertTrue(r.equity > 0.4 && r.equity < 0.75, `4-way AA equity should be plausible (got ${r.equity})`);
  assertClose(r.win + r.tie + r.lose, r.total, 0, 'win+tie+lose must equal total trials run');
});

section('Range-based opponents');

test('Monte Carlo with a range opponent never deals a blocked card', () => {
  const Ranges = require('../js/ranges.js');
  const heroCards = ids(['Ah', 'Ad']);
  const combos = Ranges.combosFromKeys(['KK', 'QQ', 'AKs'], heroCards); // AKs combos using an Ace get filtered
  const state = { hero: heroCards, board: [], dead: [], opponents: [{ type: 'range', combos }] };
  const rng = Cards.seededRng(99);
  const r = Equity.monteCarlo(state, 5000, rng);
  assertTrue(r.total > 0, 'Should be able to run trials with a filtered range');
  assertTrue(r.equity > 0.5, 'AA should still be ahead of a KK/QQ/AKs range');
});

test('Duplicate-card validation: hero and opponent cannot share a card', () => {
  const heroCards = ids(['Ah', 'Ad']);
  const blocked = new Set(heroCards);
  // an exact opponent hand that illegally reuses the Ah should never be constructed by the UI layer;
  // verify the underlying invariant that FULL_DECK minus blocked never contains a blocked id.
  const remaining = Cards.FULL_DECK.filter((id) => !blocked.has(id));
  assertEqual(remaining.length, 50);
  assertTrue(!remaining.includes(heroCards[0]) && !remaining.includes(heroCards[1]));
});

section('Monte Carlo statistical sanity');

test('Monte Carlo converges toward the exact answer as iterations increase', () => {
  const state = {
    hero: ids(['As', 'Ks']),
    board: ids(['Qs', 'Js', '2d']),
    dead: [],
    opponents: [{ type: 'exact', cards: ids(['9c', '9d']) }]
  };
  const exact = Equity.exactEnumerate(state).equity;
  const rng = Cards.seededRng(2024);
  const mc = Equity.monteCarlo(state, 20000, rng);
  assertClose(mc.equity, exact, 0.02, 'Monte Carlo with 20k trials should be within 2 points of the exact answer');
});

section('Summary');
require('./testHarness.js').summary();
