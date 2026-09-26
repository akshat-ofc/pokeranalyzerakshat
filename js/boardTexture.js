/**
 * boardTexture.js — Descriptive board-texture analysis
 * --------------------------------------------------------
 * Purely descriptive (rule-based), not a claim about any specific
 * opponent's actual holdings — only about what the board itself makes
 * possible.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'));
  } else {
    root.BoardTexture = factory(root.Cards);
  }
}(typeof self !== 'undefined' ? self : this, function (Cards) {
  'use strict';

  function analyze(boardIds) {
    if (!boardIds || boardIds.length < 3) return null;
    const ranks = boardIds.map(Cards.rankValue).sort((a, b) => b - a);
    const suits = boardIds.map(Cards.suitIndex);

    const suitCounts = {};
    suits.forEach((s) => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuitCount = Math.max(...Object.values(suitCounts));

    const rankCounts = {};
    ranks.forEach((r) => { rankCounts[r] = (rankCounts[r] || 0) + 1; });
    const paired = Object.values(rankCounts).some((c) => c >= 2);
    const trips = Object.values(rankCounts).some((c) => c >= 3);

    const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);
    let maxGapSpan = 0; // widest span among any 3 that could combine into straight potential
    let connected = false;
    for (let i = 0; i < uniqueRanks.length - 1; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 1] <= 2) connected = true;
    }
    const span = uniqueRanks[0] - uniqueRanks[uniqueRanks.length - 1];

    const highCardBoard = uniqueRanks[0] >= 12; // Q or higher present as top card
    const lowCardBoard = uniqueRanks[0] <= 9;

    let flushness = 'rainbow';
    if (maxSuitCount === boardIds.length) flushness = 'monotone';
    else if (maxSuitCount >= 2) flushness = 'two-tone';

    const straightPossible = span <= 4 && uniqueRanks.length >= 3;
    const flushPossible = maxSuitCount >= 3;
    const fullHousePossible = paired;

    const descriptors = [];
    if (flushness === 'monotone') descriptors.push('monotone');
    else if (flushness === 'two-tone') descriptors.push('two-tone');
    else descriptors.push('rainbow');

    if (paired) descriptors.push(trips ? 'trips-on-board' : 'paired');
    if (connected && span <= 4) descriptors.push('highly connected');
    else if (connected) descriptors.push('connected');
    if (highCardBoard) descriptors.push('high-card');
    else if (lowCardBoard) descriptors.push('low-card');

    const summary = describeSummary(descriptors);

    return {
      descriptors,
      summary,
      paired, trips,
      flushness, straightPossible, flushPossible, fullHousePossible,
      highCardBoard, lowCardBoard,
      opponentPossibilities: buildOpponentPossibilities({ paired, flushPossible, straightPossible, connected })
    };
  }

  function describeSummary(descriptors) {
    if (descriptors.length === 0) return 'Dry, disconnected board';
    const parts = descriptors.filter((d) => d !== 'rainbow');
    if (parts.length === 0) return 'Dry, rainbow board with little draw potential';
    return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(', ') + ' board';
  }

  function buildOpponentPossibilities({ paired, flushPossible, straightPossible, connected }) {
    const list = [];
    if (paired) list.push('Two pair or better (trips/full house) via the paired board card');
    if (flushPossible) list.push('Flush draws, or a made flush on later streets');
    if (straightPossible || connected) list.push('Straight draws or a made straight');
    if (!paired && !flushPossible && !straightPossible) list.push('Mostly one-pair / high-card type holdings');
    return list;
  }

  return { analyze };
}));
