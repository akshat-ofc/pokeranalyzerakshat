/**
 * evaluator.js — Texas Hold'em hand evaluator
 * --------------------------------------------
 * Categories (higher = better):
 *   8 Straight Flush (incl. Royal Flush as A-high straight flush)
 *   7 Four of a Kind
 *   6 Full House
 *   5 Flush
 *   4 Straight
 *   3 Three of a Kind
 *   2 Two Pair
 *   1 One Pair
 *   0 High Card
 *
 * evaluate5(cardIds) -> { category, tiebreak:[5 ints], score:int, name:string }
 * evaluate7(cardIds) -> best 5-card evaluation among C(7,5)=21 combos,
 *                       plus the winning 5 cards.
 *
 * `score` packs category+tiebreakers into one integer so two hands can be
 * compared with a single `>` / `<` / `===`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'));
  } else {
    root.Evaluator = factory(root.Cards);
  }
}(typeof self !== 'undefined' ? self : this, function (Cards) {
  'use strict';

  const CATEGORY_NAMES = [
    'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
    'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
  ];

  const BASE = 15; // ranks are 0..14, always < 15

  function packScore(category, tiebreak) {
    let score = category;
    for (let i = 0; i < 5; i++) {
      score = score * BASE + (tiebreak[i] || 0);
    }
    return score;
  }

  /** Detect the best straight in a sorted-descending unique rank array (values 2..14). Returns high card of straight or 0. */
  function bestStraightHigh(uniqueDescRanks) {
    // Build a presence set, also allow Ace as 1 for wheel
    const present = new Set(uniqueDescRanks);
    const hasAce = present.has(14);
    // Check from highest possible straight (14 down to 5) — 14-13-12-11-10 ... 6-5-4-3-2
    for (let high = 14; high >= 5; high--) {
      let ok = true;
      for (let k = 0; k < 5; k++) {
        const need = high - k;
        const val = need === 1 && hasAce ? 14 : need; // wheel: treat rank 1 as Ace
        if (need === 1) {
          if (!hasAce) { ok = false; break; }
        } else if (!present.has(need)) { ok = false; break; }
      }
      if (ok) return high === 5 ? 5 : high; // wheel's "high" card for comparison purposes is 5
    }
    return 0;
  }

  /**
   * Evaluate exactly 5 cards (array of int ids 0..51).
   */
  function evaluate5(cardIds) {
    const ranks = cardIds.map(Cards.rankValue).sort((a, b) => b - a);
    const suits = cardIds.map(Cards.suitIndex);

    const isFlush = suits.every((s) => s === suits[0]);

    const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);
    const straightHigh = bestStraightHigh(uniqueRanks);

    // count occurrences per rank
    const countMap = new Map();
    for (const r of ranks) countMap.set(r, (countMap.get(r) || 0) + 1);
    // groups sorted by [count desc, rank desc]
    const groups = Array.from(countMap.entries())
      .map(([rank, count]) => ({ rank, count }))
      .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));

    const countsShape = groups.map((g) => g.count).join('');

    if (isFlush && straightHigh) {
      return { category: 8, tiebreak: [straightHigh, 0, 0, 0, 0], score: packScore(8, [straightHigh]), name: straightHigh === 14 ? 'Royal Flush' : 'Straight Flush' };
    }
    if (countsShape === '41') {
      const quad = groups[0].rank, kicker = groups[1].rank;
      return { category: 7, tiebreak: [quad, kicker, 0, 0, 0], score: packScore(7, [quad, kicker]), name: 'Four of a Kind' };
    }
    if (countsShape === '32') {
      const trips = groups[0].rank, pair = groups[1].rank;
      return { category: 6, tiebreak: [trips, pair, 0, 0, 0], score: packScore(6, [trips, pair]), name: 'Full House' };
    }
    if (isFlush) {
      return { category: 5, tiebreak: ranks, score: packScore(5, ranks), name: 'Flush' };
    }
    if (straightHigh) {
      return { category: 4, tiebreak: [straightHigh, 0, 0, 0, 0], score: packScore(4, [straightHigh]), name: 'Straight' };
    }
    if (countsShape === '311') {
      const trips = groups[0].rank;
      const kickers = groups.slice(1).map((g) => g.rank);
      return { category: 3, tiebreak: [trips, ...kickers], score: packScore(3, [trips, ...kickers]), name: 'Three of a Kind' };
    }
    if (countsShape === '221') {
      const [p1, p2] = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
      const kicker = groups[2].rank;
      return { category: 2, tiebreak: [p1, p2, kicker, 0, 0], score: packScore(2, [p1, p2, kicker]), name: 'Two Pair' };
    }
    if (countsShape === '2111') {
      const pair = groups[0].rank;
      const kickers = groups.slice(1).map((g) => g.rank);
      return { category: 1, tiebreak: [pair, ...kickers], score: packScore(1, [pair, ...kickers]), name: 'One Pair' };
    }
    return { category: 0, tiebreak: ranks, score: packScore(0, ranks), name: 'High Card' };
  }

  // Precompute C(7,5) index combinations once.
  const COMBOS_7_5 = (() => {
    const idx = [0, 1, 2, 3, 4, 5, 6];
    const out = [];
    const combo = (start, chosen) => {
      if (chosen.length === 5) { out.push(chosen.slice()); return; }
      for (let i = start; i < 7; i++) {
        chosen.push(idx[i]);
        combo(i + 1, chosen);
        chosen.pop();
      }
    };
    combo(0, []);
    return out; // 21 combinations of indices
  })();

  /**
   * Evaluate the best 5-card hand from up to 7 cards (works for 5,6,7 length).
   */
  function evaluateBest(cardIds) {
    if (cardIds.length === 5) {
      const r = evaluate5(cardIds);
      r.bestFive = cardIds.slice();
      return r;
    }
    if (cardIds.length < 5) throw new Error('Need at least 5 cards to evaluate');

    let best = null;
    if (cardIds.length === 7) {
      for (const combo of COMBOS_7_5) {
        const hand = combo.map((i) => cardIds[i]);
        const res = evaluate5(hand);
        if (!best || res.score > best.score) { best = res; best.bestFive = hand; }
      }
      return best;
    }
    // generic case (6 cards): choose 5 of n
    const n = cardIds.length;
    const chosen = [];
    const recurse = (start) => {
      if (chosen.length === 5) {
        const hand = chosen.map((i) => cardIds[i]);
        const res = evaluate5(hand);
        if (!best || res.score > best.score) { best = res; best.bestFive = hand; }
        return;
      }
      for (let i = start; i < n; i++) {
        chosen.push(i);
        recurse(i + 1);
        chosen.pop();
      }
    };
    recurse(0);
    return best;
  }

  function compare(handA, handB) {
    if (handA.score > handB.score) return 1;
    if (handA.score < handB.score) return -1;
    return 0;
  }

  return { CATEGORY_NAMES, evaluate5, evaluateBest, compare, packScore };
}));
