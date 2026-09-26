/**
 * simulation.js — Web Worker orchestration
 * ---------------------------------------------
 * Runs equity calculations off the main thread so the UI never freezes,
 * even at 1,000,000 Monte Carlo iterations. The worker is built from an
 * inline source string (via Blob) rather than a separate file URL, so it
 * works identically whether the app is opened via file:// or http(s)://.
 *
 * The worker source intentionally re-implements the minimal subset of
 * cards.js / evaluator.js / equity.js logic it needs (kept in sync by
 * hand) so no cross-origin script loading is required inside the worker.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SimulationRunner = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WORKER_SOURCE = `
    'use strict';
    const FULL_DECK = (() => { const d=[]; for(let r=0;r<13;r++) for(let s=0;s<4;s++) d.push(r*4+s); return d; })();
    function rankValue(id){ return (id>>2)+2; }
    function suitIndex(id){ return id&3; }
    const BASE=15;
    function packScore(category, tb){ let s=category; for(let i=0;i<5;i++) s = s*BASE + (tb[i]||0); return s; }
    function bestStraightHigh(uniqueDescRanks){
      const present = new Set(uniqueDescRanks);
      const hasAce = present.has(14);
      for (let high=14; high>=5; high--){
        let ok=true;
        for (let k=0;k<5;k++){
          const need = high-k;
          if (need===1){ if(!hasAce){ok=false;break;} }
          else if (!present.has(need)){ ok=false; break; }
        }
        if (ok) return high===5?5:high;
      }
      return 0;
    }
    function evaluate5(cardIds){
      const ranks = cardIds.map(rankValue).sort((a,b)=>b-a);
      const suits = cardIds.map(suitIndex);
      const isFlush = suits.every((s)=>s===suits[0]);
      const uniqueRanks = Array.from(new Set(ranks)).sort((a,b)=>b-a);
      const straightHigh = bestStraightHigh(uniqueRanks);
      const countMap = new Map();
      for (const r of ranks) countMap.set(r, (countMap.get(r)||0)+1);
      const groups = Array.from(countMap.entries()).map(([rank,count])=>({rank,count}))
        .sort((a,b)=>(b.count-a.count)||(b.rank-a.rank));
      const shape = groups.map((g)=>g.count).join('');
      if (isFlush && straightHigh) return { category:8, score: packScore(8,[straightHigh]) };
      if (shape==='41'){ const q=groups[0].rank,k=groups[1].rank; return {category:7, score:packScore(7,[q,k])}; }
      if (shape==='32'){ const t=groups[0].rank,p=groups[1].rank; return {category:6, score:packScore(6,[t,p])}; }
      if (isFlush) return { category:5, score: packScore(5, ranks) };
      if (straightHigh) return { category:4, score: packScore(4,[straightHigh]) };
      if (shape==='311'){ const t=groups[0].rank; const k=groups.slice(1).map((g)=>g.rank); return {category:3, score:packScore(3,[t,...k])}; }
      if (shape==='221'){ const pr=[groups[0].rank, groups[1].rank].sort((a,b)=>b-a); const k=groups[2].rank; return {category:2, score:packScore(2,[pr[0],pr[1],k])}; }
      if (shape==='2111'){ const p=groups[0].rank; const k=groups.slice(1).map((g)=>g.rank); return {category:1, score:packScore(1,[p,...k])}; }
      return { category:0, score: packScore(0, ranks) };
    }
    const COMBOS_7_5 = (() => {
      const idx=[0,1,2,3,4,5,6]; const out=[];
      (function combo(start,chosen){ if(chosen.length===5){ out.push(chosen.slice()); return;} for(let i=start;i<7;i++){ chosen.push(idx[i]); combo(i+1,chosen); chosen.pop(); } })(0,[]);
      return out;
    })();
    function evaluateBest(cardIds){
      if (cardIds.length===5) return evaluate5(cardIds);
      let best=null;
      if (cardIds.length===7){
        for (const combo of COMBOS_7_5){ const hand=combo.map((i)=>cardIds[i]); const res=evaluate5(hand); if(!best||res.score>best.score) best=res; }
        return best;
      }
      const n=cardIds.length; const chosen=[];
      (function rec(start){ if(chosen.length===5){ const hand=chosen.map((i)=>cardIds[i]); const res=evaluate5(hand); if(!best||res.score>best.score) best=res; return;} for(let i=start;i<n;i++){ chosen.push(i); rec(i+1); chosen.pop(); } })(0);
      return best;
    }
    function shuffleArray(arr, rng){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); const t=arr[i]; arr[i]=arr[j]; arr[j]=t; } }
    function mulberry32(seed){ let a=seed>>>0; return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

    function permanentlyBlocked(state){
      const blocked = new Set([...state.hero, ...state.board, ...(state.dead||[])]);
      for (const opp of state.opponents) if (opp.type==='exact'){ blocked.add(opp.cards[0]); blocked.add(opp.cards[1]); }
      return blocked;
    }
    function fullShowdown(heroCards, oppHandsArr, board){
      const heroEval = evaluateBest(heroCards.concat(board));
      const scores=[heroEval.score];
      for (const oc of oppHandsArr) scores.push(evaluateBest(oc.concat(board)).score);
      const maxScore = Math.max(...scores);
      const winners = scores.reduce((acc,s,i)=>{ if(s===maxScore) acc.push(i); return acc; },[]);
      const heroWins = winners.includes(0);
      return { heroWins, isTie: heroWins && winners.length>1, share: heroWins? 1/winners.length : 0, heroCategory: heroEval.category };
    }
    function kCombinations(arr,k){
      const results=[]; const n=arr.length; const combo=[];
      (function rec(start){ if(combo.length===k){ results.push(combo.slice()); return;} for(let i=start;i<n;i++){ combo.push(arr[i]); rec(i+1); combo.pop(); } })(0);
      return results;
    }
    function exactEnumerate(state){
      const blocked = permanentlyBlocked(state);
      const deck = FULL_DECK.filter((id)=>!blocked.has(id));
      const unknownCount = 5-state.board.length;
      const oppHands = state.opponents.map((o)=>o.cards);
      let win=0,tie=0,lose=0,total=0,equitySum=0;
      if (unknownCount===0){
        const r = fullShowdown(state.hero, oppHands, state.board);
        total=1; equitySum+=r.share; if(r.isTie)tie++; else if(r.heroWins)win++; else lose++;
        const cc=new Array(9).fill(0); cc[r.heroCategory]=1;
        return {win,tie,lose,total,equity:equitySum/total,method:'exact',categoryCounts:cc};
      }
      const combos = kCombinations(deck, unknownCount);
      const categoryCounts = new Array(9).fill(0);
      for (const extra of combos){
        const board = state.board.concat(extra);
        const r = fullShowdown(state.hero, oppHands, board);
        equitySum += r.share;
        categoryCounts[r.heroCategory]++;
        if (r.isTie) tie++; else if (r.heroWins) win++; else lose++;
        total++;
      }
      return {win,tie,lose,total,equity: total>0? equitySum/total : 0, method:'exact', categoryCounts};
    }
    function monteCarlo(state, iterations, seed, chunkSize){
      const rng = mulberry32(seed>>>0);
      chunkSize = chunkSize||2000;
      const blocked = permanentlyBlocked(state);
      const baseDeck = FULL_DECK.filter((id)=>!blocked.has(id));
      const opponents = state.opponents.map((o)=>{
        if (o.type==='range'){ const filtered=o.combos.filter(([a,b])=>!blocked.has(a)&&!blocked.has(b)); return {type:'range', combos:filtered}; }
        return o;
      });
      let win=0,tie=0,lose=0,equitySum=0;
      const categoryCounts = new Array(9).fill(0);
      for (let done=0; done<iterations; done++){
        const usedThisIter = new Set();
        const oppHands=[]; let valid=true;
        const deck = baseDeck.slice();
        shuffleArray(deck, rng);
        let ptr=0;
        for (const opp of opponents){
          if (opp.type==='exact'){ oppHands.push(opp.cards); continue; }
          if (opp.type==='range'){
            const candidates = opp.combos.filter(([a,b])=>!usedThisIter.has(a)&&!usedThisIter.has(b));
            if (candidates.length===0){ valid=false; break; }
            const pick = candidates[Math.floor(rng()*candidates.length)];
            usedThisIter.add(pick[0]); usedThisIter.add(pick[1]); oppHands.push(pick);
            continue;
          }
          const hand=[];
          while(hand.length<2 && ptr<deck.length){ const c=deck[ptr++]; if(usedThisIter.has(c)) continue; hand.push(c); usedThisIter.add(c); }
          if (hand.length<2){ valid=false; break; }
          oppHands.push(hand);
        }
        if (!valid) continue;
        const neededBoard = 5-state.board.length;
        const extra=[];
        while(extra.length<neededBoard && ptr<deck.length){ const c=deck[ptr++]; if(usedThisIter.has(c)) continue; extra.push(c); usedThisIter.add(c); }
        if (extra.length<neededBoard) continue;
        const board = state.board.concat(extra);
        const res = fullShowdown(state.hero, oppHands, board);
        equitySum += res.share;
        categoryCounts[res.heroCategory]++;
        if (res.isTie) tie++; else if (res.heroWins) win++; else lose++;
        if ((done+1) % chunkSize === 0) postMessage({ type:'progress', done: done+1, total: iterations });
      }
      const total = win+tie+lose;
      return { win, tie, lose, total, equity: total>0? equitySum/total : 0, method:'montecarlo', iterations, categoryCounts };
    }

    self.onmessage = function(e){
      const msg = e.data;
      if (msg.cmd === 'run'){
        const t0 = performance.now ? performance.now() : Date.now();
        let result;
        try {
          if (msg.method === 'exact') {
            result = exactEnumerate(msg.state);
          } else {
            result = monteCarlo(msg.state, msg.iterations, msg.seed || 12345, msg.chunkSize);
          }
          const t1 = performance.now ? performance.now() : Date.now();
          result.timeMs = t1 - t0;
          postMessage({ type:'result', requestId: msg.requestId, result });
        } catch (err) {
          postMessage({ type:'error', requestId: msg.requestId, message: String(err && err.message || err) });
        }
      }
    };
  `;

  let worker = null;
  let requestSeq = 0;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    worker = new Worker(url);
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        const cb = pending.get(msg.requestId || -1);
        // progress broadcast has no requestId per-message in this simple impl;
        // instead we track the "current" active request.
        if (activeProgressHandler) activeProgressHandler(msg.done, msg.total);
        return;
      }
      const entry = pending.get(msg.requestId);
      if (!entry) return;
      pending.delete(msg.requestId);
      if (msg.type === 'result') entry.resolve(msg.result);
      else entry.reject(new Error(msg.message));
    };
    return worker;
  }

  let activeProgressHandler = null;

  /**
   * Run a calculation in the worker.
   * @param {'exact'|'montecarlo'} method
   * @param {Object} state
   * @param {Object} opts { iterations, seed, onProgress, chunkSize }
   */
  function run(method, state, opts) {
    opts = opts || {};
    const w = ensureWorker();
    const requestId = ++requestSeq;
    activeProgressHandler = opts.onProgress || null;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      w.postMessage({
        cmd: 'run', requestId,
        method,
        state,
        iterations: opts.iterations || 100000,
        seed: opts.seed,
        chunkSize: opts.chunkSize
      });
    });
  }

  function terminate() {
    if (worker) { worker.terminate(); worker = null; }
  }

  return { run, terminate };
}));
