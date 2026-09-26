/**
 * outs.js — Outs & draw-probability engine
 * -------------------------------------------
 * "Outs" here means: remaining unseen cards that upgrade hero's best-5-card
 * hand CATEGORY (e.g. from one pair to two pair, from a flush draw to a
 * made flush, etc.) relative to the current board. This is a standard,
 * commonly-used working definition of outs; it does not know the
 * opponent's hidden cards, so an "out" is not a guarantee of winning —
 * it is a card that measurably improves hero's hand.
 *
 * Probabilities use exact hypergeometric combinatorics (no outs×2 / outs×4
 * shortcuts), given how many card(s) remain to be dealt.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'), require('./evaluator.js'));
  } else {
    root.Outs = factory(root.Cards, root.Evaluator);
  }
}(typeof self !== 'undefined' ? self : this, function (Cards, Evaluator) {
  'use strict';

  function nCr(n, r) {
    if (r < 0 || r > n) return 0;
    r = Math.min(r, n - r);
    let num = 1, den = 1;
    for (let i = 0; i < r; i++) { num *= (n - i); den *= (i + 1); }
    return num / den;
  }

  /**
   * heroCards: [id,id], board: array of 3 or 4 known board cards, deadCards: extra removed cards
   * Returns: { outs:[ids], count, category improvements detail, probNext, probByRiver, cardsToCome }
   */
  function computeOuts(heroCards, board, deadCards) {
    if (board.length !== 3 && board.length !== 4) {
      return { outs: [], count: 0, cardsToCome: 5 - board.length, probNext: null, probByRiver: null, breakdown: [] };
    }
    const blocked = new Set([...heroCards, ...board, ...(deadCards || [])]);
    const unseen = Cards.FULL_DECK.filter((id) => !blocked.has(id));

    const before = Evaluator.evaluateBest(heroCards.concat(board));

    const outs = [];
    const breakdown = []; // { card, newCategory, categoryName }

    for (const card of unseen) {
      const after = Evaluator.evaluateBest(heroCards.concat(board, [card]));
      const isWeakPairUp = before.category === 0 && after.category === 1; // pairing an overcard from
      // no-pair is too unreliable an "improvement" to count as a real out —
      // it doesn't reliably indicate hero moves ahead, so we exclude it.
      if (after.category > before.category && !isWeakPairUp) {
        outs.push(card);
        breakdown.push({ card, categoryName: after.name, category: after.category });
      }
    }

    const cardsToCome = 5 - board.length; // 2 on flop, 1 on turn
    const unseenCount = unseen.length;
    const outsCount = outs.length;

    let probNext = null, probByRiver = null;
    if (cardsToCome === 1) {
      probNext = outsCount / unseenCount;
      probByRiver = probNext;
    } else if (cardsToCome === 2) {
      probNext = outsCount / unseenCount; // hitting on the very next (turn) card
      const missBoth = nCr(unseenCount - outsCount, 2) / nCr(unseenCount, 2);
      probByRiver = 1 - missBoth;
    }

    return {
      outs, count: outsCount, breakdown,
      cardsToCome, unseenCount,
      probNext, probByRiver,
      currentCategory: before.category, currentCategoryName: before.name
    };
  }

  return { computeOuts, nCr };
}));
