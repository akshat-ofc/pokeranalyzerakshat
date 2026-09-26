/**
 * potOdds.js — Pot odds & required equity
 * ------------------------------------------
 * pot   = the pot BEFORE the opponent's current bet is added
 * bet   = amount the opponent has bet that hero must respond to
 * call  = amount hero must put in to continue (usually === bet, but kept
 *         separate to support side-pot / all-in-for-less situations)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PotOdds = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function calculate({ pot, bet, call }) {
    pot = Math.max(0, Number(pot) || 0);
    bet = Math.max(0, Number(bet) || 0);
    call = Math.max(0, Number(call) || 0);

    const finalPot = pot + bet + call; // pot size after hero calls
    const requiredEquity = finalPot > 0 ? call / finalPot : 0;
    // classic "X : Y" odds notation, call : (pot + bet)
    const denom = pot + bet;
    const ratio = call > 0 && denom > 0 ? denom / call : null;

    return {
      pot, bet, call, finalPot,
      requiredEquity, // 0..1
      requiredEquityPct: requiredEquity * 100,
      ratioToOne: ratio, // e.g. 3 means "3 : 1"
    };
  }

  function stackToPotRatio(effectiveStack, pot) {
    if (!pot || pot <= 0) return null;
    return effectiveStack / pot;
  }

  return { calculate, stackToPotRatio };
}));
