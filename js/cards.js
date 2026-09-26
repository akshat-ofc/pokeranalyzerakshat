/**
 * cards.js — Card & Deck primitives
 * ----------------------------------
 * A card is encoded as an integer 0..51:
 *    id = rankIndex * 4 + suitIndex
 * rankIndex: 0=2, 1=3, ... 8=T(10), 9=J, 10=Q, 11=K, 12=A
 * suitIndex: 0=spades(s), 1=hearts(h), 2=diamonds(d), 3=clubs(c)
 *
 * We also expose a human string form like "As", "Td", "2c".
 * All modules should use the integer id internally for speed and
 * only convert to/from strings at the UI boundary.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Cards = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANK_CHARS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const SUIT_CHARS = ['s', 'h', 'd', 'c'];
  const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const RANK_NAMES = {
    2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
    9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace'
  };

  const FULL_DECK = (() => {
    const d = [];
    for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) d.push(r * 4 + s);
    return d;
  })();

  function rankIndex(id) { return id >> 2; }
  function suitIndex(id) { return id & 3; }
  /** 2..14 (Ace high) */
  function rankValue(id) { return rankIndex(id) + 2; }

  function idToString(id) {
    return RANK_CHARS[rankIndex(id)] + SUIT_CHARS[suitIndex(id)];
  }

  function idToSymbolParts(id) {
    return { rank: RANK_CHARS[rankIndex(id)], suit: SUIT_CHARS[suitIndex(id)], symbol: SUIT_SYMBOLS[SUIT_CHARS[suitIndex(id)]] };
  }

  function stringToId(str) {
    if (!str || str.length < 2) return null;
    const rankChar = str[0].toUpperCase();
    const suitChar = str[1].toLowerCase();
    const r = RANK_CHARS.indexOf(rankChar);
    const s = SUIT_CHARS.indexOf(suitChar);
    if (r === -1 || s === -1) return null;
    return r * 4 + s;
  }

  function makeDeck() { return FULL_DECK.slice(); }

  /** Remove a list of used card ids from a deck array (returns new array) */
  function remainingDeck(usedIds) {
    const used = new Set(usedIds);
    return FULL_DECK.filter((id) => !used.has(id));
  }

  // Fisher-Yates shuffle with pluggable RNG (for deterministic tests)
  function shuffle(arr, rng) {
    const a = arr.slice();
    const rand = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Simple seedable PRNG (mulberry32) for deterministic tests
  function seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    RANK_CHARS, SUIT_CHARS, SUIT_SYMBOLS, RANK_NAMES, FULL_DECK,
    rankIndex, suitIndex, rankValue,
    idToString, idToSymbolParts, stringToId,
    makeDeck, remainingDeck, shuffle, seededRng
  };
}));
