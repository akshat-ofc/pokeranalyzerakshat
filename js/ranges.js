/**
 * ranges.js — Starting-hand range representation & parsing
 * ----------------------------------------------------------
 * A "range" is a set of 169 canonical starting hands (13 pairs,
 * 78 suited, 78 offsuit). We expand a selected set of canonical
 * hands into concrete card-id combinations (accounting for cards
 * already in use elsewhere: hero hand, board, dead cards, other
 * opponents' exact cards).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'));
  } else {
    root.Ranges = factory(root.Cards);
  }
}(typeof self !== 'undefined' ? self : this, function (Cards) {
  'use strict';

  const RANKS = Cards.RANK_CHARS; // ['2'...'A'] low->high
  const RANKS_HIGH_FIRST = RANKS.slice().reverse(); // ['A','K',...'2']

  /** Canonical hand key, e.g. "AKs", "AKo", "AA" */
  function cellKey(r1, r2, suited) {
    // r1, r2 are rank chars, high-first ordering enforced by caller
    if (r1 === r2) return r1 + r2;
    return r1 + r2 + (suited ? 's' : 'o');
  }

  /** Build the 13x13 grid metadata: rows/cols high->low, each cell's key */
  function buildGridMeta() {
    const grid = [];
    for (let i = 0; i < 13; i++) {
      const row = [];
      for (let j = 0; j < 13; j++) {
        const rHigh = RANKS_HIGH_FIRST[Math.min(i, j)];
        const rLow = RANKS_HIGH_FIRST[Math.max(i, j)];
        let key, type;
        if (i === j) { key = rHigh + rHigh; type = 'pair'; }
        else if (i < j) { key = rHigh + rLow + 's'; type = 'suited'; } // above diagonal
        else { key = rHigh + rLow + 'o'; type = 'offsuit'; } // below diagonal
        row.push({ key, type });
      }
      grid.push(row);
    }
    return grid;
  }

  const GRID_META = buildGridMeta();

  /** All 169 canonical keys */
  const ALL_HANDS = (() => {
    const set = new Set();
    GRID_META.forEach((row) => row.forEach((c) => set.add(c.key)));
    return Array.from(set);
  })();

  /** Number of concrete combinations represented by a canonical key */
  function comboCountForKey(key) {
    if (key.length === 2) return 6; // pocket pair: C(4,2)
    return key.endsWith('s') ? 4 : 12;
  }

  const TOTAL_COMBOS = ALL_HANDS.reduce((s, k) => s + comboCountForKey(k), 0); // 1326

  /**
   * Expand a canonical key into concrete [id1,id2] pairs (before removing
   * blocked cards).
   */
  function expandKeyToCombos(key) {
    const combos = [];
    const r1 = key[0], r2 = key[1];
    const rank1 = RANKS.indexOf(r1); // low-based index 0..12
    const rank2 = RANKS.indexOf(r2);
    if (key.length === 2) {
      // pocket pair: all C(4,2) suit combos of same rank
      for (let s1 = 0; s1 < 4; s1++) {
        for (let s2 = s1 + 1; s2 < 4; s2++) {
          combos.push([rank1 * 4 + s1, rank1 * 4 + s2]);
        }
      }
      return combos;
    }
    const suited = key[2] === 's';
    if (suited) {
      for (let s = 0; s < 4; s++) combos.push([rank1 * 4 + s, rank2 * 4 + s]);
    } else {
      for (let s1 = 0; s1 < 4; s1++) {
        for (let s2 = 0; s2 < 4; s2++) {
          if (s1 === s2) continue;
          combos.push([rank1 * 4 + s1, rank2 * 4 + s2]);
        }
      }
    }
    return combos;
  }

  /**
   * Given a set of selected canonical keys, produce all concrete combos,
   * excluding any combo that uses a blocked card id.
   */
  function combosFromKeys(keys, blockedIds) {
    const blocked = new Set(blockedIds || []);
    const out = [];
    for (const key of keys) {
      for (const combo of expandKeyToCombos(key)) {
        if (blocked.has(combo[0]) || blocked.has(combo[1])) continue;
        out.push(combo);
      }
    }
    return out;
  }

  // ---- Hand-strength ordering used for "Top X%" presets ----
  // A widely used rough preordering (not a claim of GTO correctness),
  // combining high-card strength, pairs, suitedness and connectivity.
  function handStrengthOrder() {
    const rankVal = (c) => RANKS.indexOf(c) + 2;
    const score = (key) => {
      const r1 = rankVal(key[0]), r2 = rankVal(key[1]);
      const hi = Math.max(r1, r2), lo = Math.min(r1, r2);
      let s = hi * 10 + lo;
      if (key.length === 2) s += 200 + hi * 5; // pairs are strong, scale with rank
      if (key.endsWith('s')) s += 12; // suited bonus
      const gap = hi - lo;
      if (gap === 1) s += 8; // connectors
      else if (gap === 2) s += 4;
      else if (gap === 0) s += 0;
      else s -= gap; // penalize big gaps
      if (hi === 14) s += 6; // ace-high bonus
      return s;
    };
    return ALL_HANDS.slice().sort((a, b) => score(b) - score(a));
  }

  const STRENGTH_ORDER = handStrengthOrder();

  /** Return the set of canonical keys forming the top `pct` percent of combos */
  function topPercentKeys(pct) {
    const targetCombos = TOTAL_COMBOS * (pct / 100);
    const chosen = [];
    let running = 0;
    for (const key of STRENGTH_ORDER) {
      if (running >= targetCombos) break;
      chosen.push(key);
      running += comboCountForKey(key);
    }
    return chosen;
  }

  // ---- Text notation parsing: "AA,KK,QQ,AKs,AQs,JJ-TT,T9s+" ----
  function parseRangeText(text) {
    if (!text || !text.trim()) return { keys: [], errors: [] };
    const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
    const keys = new Set();
    const errors = [];
    for (const part of parts) {
      try {
        expandToken(part).forEach((k) => keys.add(k));
      } catch (e) {
        errors.push(`"${part}": ${e.message}`);
      }
    }
    return { keys: Array.from(keys), errors };
  }

  function isValidRank(c) { return RANKS.indexOf(c) !== -1; }

  function expandToken(tok) {
    tok = tok.trim();
    const plus = tok.endsWith('+');
    const base = plus ? tok.slice(0, -1) : tok;

    // Range form like "JJ-TT" or "AKs-AJs"
    if (base.includes('-')) {
      const [a, b] = base.split('-');
      return expandDashRange(a.trim(), b.trim());
    }

    if (base.length === 2) {
      // pocket pair, e.g. "QQ"
      const [r1, r2] = base;
      if (!isValidRank(r1) || !isValidRank(r2) || r1 !== r2) throw new Error('invalid pair');
      if (!plus) return [r1 + r2];
      return pairsFrom(r1);
    }

    if (base.length === 3) {
      const [r1, r2, suf] = base;
      if (!isValidRank(r1) || !isValidRank(r2)) throw new Error('invalid ranks');
      if (suf !== 's' && suf !== 'o') throw new Error('suffix must be s or o');
      const hi = RANKS.indexOf(r1) > RANKS.indexOf(r2) ? r1 : r2;
      const lo = hi === r1 ? r2 : r1;
      if (!plus) return [hi + lo + suf];
      return suitedOffsuitFrom(hi, lo, suf);
    }
    throw new Error('unrecognized token');
  }

  function pairsFrom(minRankChar) {
    const minIdx = RANKS.indexOf(minRankChar);
    const out = [];
    for (let i = minIdx; i < 13; i++) out.push(RANKS[i] + RANKS[i]);
    return out;
  }

  /** e.g. hi='A', lo='J', suf='s' -> AJs, AQs, AKs (lo rank increasing towards hi) */
  function suitedOffsuitFrom(hi, lo, suf) {
    const hiIdx = RANKS.indexOf(hi);
    const loIdx = RANKS.indexOf(lo);
    const out = [];
    for (let i = loIdx; i < hiIdx; i++) {
      out.push(hi + RANKS[i] + suf);
    }
    return out;
  }

  function expandDashRange(a, b) {
    // Pocket pair range: "JJ-TT" (both length 2, same chars)
    if (a.length === 2 && b.length === 2 && a[0] === a[1] && b[0] === b[1]) {
      const hi = Math.max(RANKS.indexOf(a[0]), RANKS.indexOf(b[0]));
      const lo = Math.min(RANKS.indexOf(a[0]), RANKS.indexOf(b[0]));
      const out = [];
      for (let i = lo; i <= hi; i++) out.push(RANKS[i] + RANKS[i]);
      return out;
    }
    // Suited/offsuit range with same high card: "AJs-AQs" (varies low card)
    if (a.length === 3 && b.length === 3 && a[2] === b[2] && a[0] === b[0]) {
      const suf = a[2];
      const hi = a[0];
      const loA = RANKS.indexOf(a[1]);
      const loB = RANKS.indexOf(b[1]);
      const lo = Math.min(loA, loB), top = Math.max(loA, loB);
      const out = [];
      for (let i = lo; i <= top; i++) {
        if (RANKS[i] === hi) continue;
        out.push(hi + RANKS[i] + suf);
      }
      return out;
    }
    throw new Error('unsupported range syntax');
  }

  function keysToText(keys) {
    return keys.join(',');
  }

  return {
    GRID_META, ALL_HANDS, TOTAL_COMBOS, RANKS, RANKS_HIGH_FIRST,
    comboCountForKey, expandKeyToCombos, combosFromKeys,
    topPercentKeys, parseRangeText, keysToText, STRENGTH_ORDER
  };
}));
