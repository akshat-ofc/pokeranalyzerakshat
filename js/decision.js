/**
 * decision.js — Transparent rules-based decision layer
 * ---------------------------------------------------------
 * Produces an action recommendation PLUS a structured, labeled
 * explanation of exactly which facts drove it. Every recommendation is
 * a probabilistic, assumption-dependent suggestion — never a guarantee.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Decision = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {Object} p
   * @param {number} p.equityPct         hero's equity 0..100
   * @param {number} p.requiredEquityPct required equity to call, 0..100 (only if facing a bet)
   * @param {number} p.callAmount
   * @param {number} p.betAmount         current bet facing hero (0 if none)
   * @param {number} p.pot
   * @param {number} p.effectiveStack
   * @param {number} p.ev
   * @param {boolean} p.opponentRangeIsRandomOrWide  true if any opponent uses RANDOM/very wide assumption
   * @param {string} p.confidence  'HIGH' | 'MEDIUM' | 'LOW'
   */
  function decide(p) {
    const facingBet = p.callAmount > 0;
    const edge = facingBet ? (p.equityPct - p.requiredEquityPct) : null;
    const isAllInCall = facingBet && p.callAmount >= p.effectiveStack;

    const reasons = [];
    let action;

    if (!facingBet) {
      // No bet to respond to. Suggest CHECK by default; suggest BET when
      // equity is comfortably ahead, clearly labeled as a heuristic/style
      // choice rather than a pot-odds fact (there is no "required equity"
      // when nobody has bet).
      if (p.equityPct >= 65) {
        action = 'BET';
        reasons.push({ label: 'Equity edge', type: 'fact', text: `Estimated equity is ${p.equityPct.toFixed(1)}%, comfortably ahead of a 50% baseline.` });
        reasons.push({ label: 'Sizing & timing', type: 'heuristic', text: 'Betting for value is a style choice, not a pot-odds requirement — there is no bet to call yet.' });
      } else {
        action = 'CHECK';
        reasons.push({ label: 'No bet facing you', type: 'fact', text: 'There is nothing to call, so a mathematical pot-odds comparison does not apply.' });
        reasons.push({ label: 'Equity', type: 'fact', text: `Estimated equity is ${p.equityPct.toFixed(1)}%.` });
      }
    } else if (isAllInCall) {
      if (edge > 0) {
        action = 'ALL-IN';
        reasons.push({ label: 'Pot odds', type: 'fact', text: `Calling puts your whole stack in. Required equity ${p.requiredEquityPct.toFixed(1)}% vs. estimated equity ${p.equityPct.toFixed(1)}% — a ${edge >= 0 ? '+' : ''}${edge.toFixed(1)} point edge.` });
      } else {
        action = 'FOLD';
        reasons.push({ label: 'Pot odds', type: 'fact', text: `An all-in call needs ${p.requiredEquityPct.toFixed(1)}% equity; you have an estimated ${p.equityPct.toFixed(1)}% — a ${edge.toFixed(1)} point shortfall.` });
      }
    } else if (edge > 15) {
      action = 'RAISE';
      reasons.push({ label: 'Pot odds', type: 'fact', text: `Calling is already favorable: required equity ${p.requiredEquityPct.toFixed(1)}%, estimated equity ${p.equityPct.toFixed(1)}% (+${edge.toFixed(1)} points).` });
      reasons.push({ label: 'Raise sizing', type: 'heuristic', text: 'A large equity edge is often a candidate to raise for value/protection, but sizing and frequency depend on stack depth, position and opponent tendencies that this calculator does not fully model.' });
    } else if (edge > 0) {
      action = 'CALL';
      reasons.push({ label: 'Pot odds', type: 'fact', text: `Required equity ${p.requiredEquityPct.toFixed(1)}%, estimated equity ${p.equityPct.toFixed(1)}% — a +${edge.toFixed(1)} point edge.` });
      reasons.push({ label: 'EV', type: 'fact', text: `Estimated EV of calling: ${p.ev >= 0 ? '+' : ''}${p.ev.toFixed(2)} (single-street model; see assumptions).` });
    } else {
      action = 'FOLD';
      reasons.push({ label: 'Pot odds', type: 'fact', text: `Required equity ${p.requiredEquityPct.toFixed(1)}%, estimated equity ${p.equityPct.toFixed(1)}% — a ${edge.toFixed(1)} point shortfall.` });
      reasons.push({ label: 'EV', type: 'fact', text: `Estimated EV of calling: ${p.ev >= 0 ? '+' : ''}${p.ev.toFixed(2)} under this model.` });
    }

    if (p.opponentRangeIsRandomOrWide) {
      reasons.push({ label: 'Opponent range uncertainty', type: 'uncertain', text: 'One or more opponents were modeled as RANDOM or a wide range. Real opponents rarely play every hand — narrowing the range would change this estimate, possibly substantially.' });
    }
    reasons.push({ label: 'Confidence', type: 'meta', text: `Calculation quality: ${p.confidence}.` });
    reasons.push({ label: 'Not certainty', type: 'disclaimer', text: 'This is a probabilistic estimate under the stated assumptions, not a guaranteed outcome.' });

    return { action, edge, reasons };
  }

  return { decide };
}));
