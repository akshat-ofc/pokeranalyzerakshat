/**
 * equity.js — Equity calculation core
 * -------------------------------------
 * Pure functions with no DOM dependency so this file can run identically
 * on the main thread or inside a Web Worker.
 *
 * An "opponent" descriptor is one of:
 *   { type: 'exact',  cards: [id, id] }
 *   { type: 'range',  combos: [[id,id], ...] }   // already blocked-filtered by caller is NOT required; we filter live
 *   { type: 'random' }                            // any two remaining cards
 *
 * A "state" object:
 *   {
 *     hero: [id, id],
 *     board: [id, id, ...]  // 0..5 known board cards
 *     dead: [id, ...]       // cards known to be out of play (optional)
 *     opponents: [opponentDescriptor, ...]
 *   }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'), require('./evaluator.js'));
  } else {
    root.Equity = factory(root.Cards, root.Evaluator);
  }
}(typeof self !== 'undefined' ? self : this, function (Cards, Evaluator) {
  'use strict';

  function permanentlyBlocked(state) {
    const blocked = new Set([...state.hero, ...state.board, ...(state.dead || [])]);
    for (const opp of state.opponents) {
      if (opp.type === 'exact') { blocked.add(opp.cards[0]); blocked.add(opp.cards[1]); }
    }
    return blocked;
  }

  /** Can we use exact enumeration? Only when every opponent has exact known cards
   *  and the number of unknown board cards is small enough to be fast. */
  function canEnumerateExact(state) {
    const allExact = state.opponents.every((o) => o.type === 'exact');
    const unknownBoard = 5 - state.board.length;
    return allExact && unknownBoard <= 3; // up to preflop w/ known opponents: C(45,3) ~ 14190, still fast
  }

  function kCombinations(arr, k) {
    const results = [];
    const n = arr.length;
    const combo = [];
    (function rec(start) {
      if (combo.length === k) { results.push(combo.slice()); return; }
      for (let i = start; i < n; i++) {
        combo.push(arr[i]);
        rec(i + 1);
        combo.pop();
      }
    })(0);
    return results;
  }

  /**
   * Given hero + N exact opponents + a known partial board, enumerate every
   * possible completion of the board and tally win/tie/lose for hero.
   */
  function exactEnumerate(state) {
    const blocked = permanentlyBlocked(state);
    const deck = Cards.FULL_DECK.filter((id) => !blocked.has(id));
    const unknownCount = 5 - state.board.length;

    let win = 0, tie = 0, lose = 0, total = 0, equitySum = 0;
    const oppHands = state.opponents.map((o) => o.cards);
    const categoryCounts = new Array(9).fill(0);

    if (unknownCount === 0) {
      total = 1;
      const r = fullShowdown(state.hero, oppHands, state.board);
      equitySum += r.share;
      categoryCounts[r.heroCategory]++;
      if (r.isTie) tie++; else if (r.heroWins) win++; else lose++;
      return { win, tie, lose, total, equity: equitySum / total, method: 'exact', categoryCounts };
    }

    const combos = kCombinations(deck, unknownCount);
    for (const extra of combos) {
      const fullBoard = state.board.concat(extra);
      const r = fullShowdown(state.hero, oppHands, fullBoard);
      equitySum += r.share;
      categoryCounts[r.heroCategory]++;
      if (r.isTie) tie++; else if (r.heroWins) win++; else lose++;
      total++;
    }
    return { win, tie, lose, total, equity: total > 0 ? equitySum / total : 0, method: 'exact', categoryCounts };
  }

  /**
   * Returns 1 if hero wins outright, 0 if hero ties for the win, -1 if hero loses.
   */
  function scoreShowdown(heroCards, oppHandsArr, board) {
    const heroEval = Evaluator.evaluateBest(heroCards.concat(board));
    let maxScore = heroEval.score;
    let winnersBesidesHero = 0;
    for (const oppCards of oppHandsArr) {
      const oe = Evaluator.evaluateBest(oppCards.concat(board));
      if (oe.score > maxScore) { maxScore = oe.score; }
    }
    if (heroEval.score < maxScore) return -1;
    // hero is at least tied for best; count how many opponents also match maxScore
    let tiedCount = 0;
    for (const oppCards of oppHandsArr) {
      const oe = Evaluator.evaluateBest(oppCards.concat(board));
      if (oe.score === maxScore) tiedCount++;
    }
    return tiedCount > 0 ? 0 : 1;
  }

  /** Full showdown returning per-seat scores, used by Monte Carlo where we need equity shares. */
  function fullShowdown(heroCards, oppHandsArr, board) {
    const heroEval = Evaluator.evaluateBest(heroCards.concat(board));
    const scores = [heroEval.score];
    for (const oc of oppHandsArr) scores.push(Evaluator.evaluateBest(oc.concat(board)).score);
    const maxScore = Math.max(...scores);
    const winners = scores.reduce((acc, s, i) => { if (s === maxScore) acc.push(i); return acc; }, []);
    const heroWins = winners.includes(0);
    return { heroWins, isTie: heroWins && winners.length > 1, share: heroWins ? 1 / winners.length : 0, heroCategory: heroEval.category };
  }

  /**
   * Runs `iterations` Monte Carlo trials. Calls onProgress(done, total) periodically
   * if provided (used to report simulation progress from a worker).
   * `rng` is a function returning [0,1) — pass a seeded RNG for deterministic tests.
   */
  function monteCarlo(state, iterations, rng, onProgress, chunkSize) {
    rng = rng || Math.random;
    chunkSize = chunkSize || 2000;

    const blocked = permanentlyBlocked(state);
    const baseDeck = Cards.FULL_DECK.filter((id) => !blocked.has(id));

    // Pre-filter each range opponent's combos against permanently blocked cards once.
    const opponents = state.opponents.map((o) => {
      if (o.type === 'range') {
        const filtered = o.combos.filter(([a, b]) => !blocked.has(a) && !blocked.has(b));
        return { type: 'range', combos: filtered };
      }
      return o;
    });

    let win = 0, tie = 0, loseCount = 0;
    let equitySum = 0;
    const categoryCounts = new Array(9).fill(0);

    for (let done = 0; done < iterations; done++) {
      const usedThisIter = new Set();
      const oppHands = [];
      let valid = true;

      // Shuffle a working copy of the deck for this iteration (Fisher-Yates, partial)
      const deck = baseDeck.slice();
      // partial shuffle helper: swap-draw from the deck avoiding usedThisIter is
      // unnecessary because deck already excludes permanently blocked cards; we
      // just need to avoid re-using cards consumed by range/random opponents or
      // the board within this same iteration.
      shuffleArray(deck, rng);
      let deckPtr = 0;

      for (const opp of opponents) {
        if (opp.type === 'exact') {
          oppHands.push(opp.cards);
          continue; // already globally blocked
        }
        if (opp.type === 'range') {
          const candidates = opp.combos.filter(([a, b]) => !usedThisIter.has(a) && !usedThisIter.has(b));
          if (candidates.length === 0) { valid = false; break; }
          const pick = candidates[Math.floor(rng() * candidates.length)];
          usedThisIter.add(pick[0]); usedThisIter.add(pick[1]);
          oppHands.push(pick);
          continue;
        }
        // random: draw next two unused cards from shuffled deck
        const hand = [];
        while (hand.length < 2 && deckPtr < deck.length) {
          const c = deck[deckPtr++];
          if (usedThisIter.has(c)) continue;
          hand.push(c); usedThisIter.add(c);
        }
        if (hand.length < 2) { valid = false; break; }
        oppHands.push(hand);
      }

      if (!valid) { continue; }

      // deal remaining board cards
      const neededBoard = 5 - state.board.length;
      const extraBoard = [];
      while (extraBoard.length < neededBoard && deckPtr < deck.length) {
        const c = deck[deckPtr++];
        if (usedThisIter.has(c)) continue;
        extraBoard.push(c); usedThisIter.add(c);
      }
      if (extraBoard.length < neededBoard) { continue; }

      const fullBoard = state.board.concat(extraBoard);
      const result = fullShowdown(state.hero, oppHands, fullBoard);
      equitySum += result.share;
      categoryCounts[result.heroCategory]++;
      if (result.isTie) tie++;
      else if (result.heroWins) win++;
      else loseCount++;

      if (onProgress && (done + 1) % chunkSize === 0) {
        onProgress(done + 1, iterations);
      }
    }

    const total = win + tie + loseCount;
    return {
      win, tie, lose: loseCount, total,
      equity: total > 0 ? equitySum / total : 0,
      method: 'montecarlo',
      iterations,
      categoryCounts
    };
  }

  function shuffleArray(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  /** Standard error estimate for a Monte Carlo win-rate style proportion. */
  function marginOfError(pFraction, n) {
    if (n <= 0) return 0;
    const se = Math.sqrt((pFraction * (1 - pFraction)) / n);
    return se * 1.96; // ~95% CI half-width, as a fraction (0..1)
  }

  return { canEnumerateExact, exactEnumerate, monteCarlo, marginOfError, permanentlyBlocked, fullShowdown };
}));
