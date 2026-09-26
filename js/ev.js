/**
 * ev.js — Expected value calculator
 * -------------------------------------
 * EV(call) = equity * (pot after villain's bet, i.e. what hero can win)
 *            - (1 - equity) * call
 *
 * "pot after villain's bet" = pot + bet  (the amount currently in the
 * middle that hero can win, NOT counting hero's own call — hero's call
 * is returned to them when they win, so it is not a gain).
 *
 * This is a single-street, showdown-only EV model. It does NOT include:
 *   - future betting rounds / implied odds
 *   - fold equity from bluffing/raising
 *   - rake
 * These are stated explicitly wherever EV is shown, so the number is
 * never presented as a complete strategic answer.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EVCalc = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function evCall({ equity, pot, bet, call }) {
    const amountWinnable = pot + bet;
    const ev = equity * amountWinnable - (1 - equity) * call;
    return {
      ev,
      amountWinnable,
      call,
      equity,
      assumptions: [
        'Single street modeled to showdown (no future betting rounds).',
        'No fold equity assumed (opponent never folds in this model).',
        'Equity is taken from the calculated win+tie share given current assumptions.'
      ]
    };
  }

  /** EV of a bet/raise sized `betSize`, assuming a simple fold/call split. This is
   *  necessarily speculative (a real opponent's fold frequency is unknown) so it
   *  is always presented as a scenario, not a fact. */
  function evBetScenario({ equity, pot, betSize, villainCallFrequency }) {
    const foldFreq = 1 - villainCallFrequency;
    const evWhenCalled = equity * (pot + betSize * 2) - (1 - equity) * betSize;
    // simplified: fold => win current pot; call => showdown EV above (hero already put betSize in)
    const evFold = pot;
    const ev = foldFreq * evFold + villainCallFrequency * evWhenCalled;
    return {
      ev, evFold, evWhenCalled, foldFreq, villainCallFrequency,
      assumptions: [
        `Assumes villain folds ${(foldFreq * 100).toFixed(0)}% of the time and calls ${(villainCallFrequency * 100).toFixed(0)}% of the time (user-supplied estimate).`,
        'Does not model raises back from the villain.',
        'For illustration only — fold frequency cannot be measured, only estimated.'
      ]
    };
  }

  return { evCall, evBetScenario };
}));
