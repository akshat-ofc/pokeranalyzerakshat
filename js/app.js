/**
 * app.js — application state, event wiring, calculation orchestration.
 */
(function () {
  'use strict';

  const settings = Storage.getSettings();

  const state = {
    players: settings.defaultPlayers || 6,
    position: 'BTN',
    stack: 100,
    pot: 12,
    bet: 4,
    call: 4,
    hero: [null, null],
    board: [null, null, null, null, null],
    dead: [],
    opponents: [],
    mode: settings.fastMode === false ? 'advanced' : 'fast',
    streetHistory: [],
    lastResult: null
  };

  function makeOpponent() { return { mode: 'random', cards: [null, null], rangeKeys: new Set() }; }
  function syncOpponents() {
    const needed = state.players - 1;
    while (state.opponents.length < needed) state.opponents.push(makeOpponent());
    while (state.opponents.length > needed) state.opponents.pop();
  }
  syncOpponents();

  // ---------------- Slot / card-assignment bookkeeping ----------------
  function allAssignedCardIds() {
    const ids = [];
    state.hero.forEach((c) => { if (c !== null) ids.push(c); });
    state.board.forEach((c) => { if (c !== null) ids.push(c); });
    state.dead.forEach((c) => ids.push(c));
    state.opponents.forEach((o) => { if (o.mode === 'exact') o.cards.forEach((c) => { if (c !== null) ids.push(c); }); });
    return ids;
  }

  function getSlotEl(slotId) {
    if (slotId.startsWith('hero-')) return document.querySelectorAll('#heroSlots .card-slot')[+slotId.split('-')[1]];
    if (slotId.startsWith('board-')) return document.querySelectorAll('#boardSlots .card-slot')[+slotId.split('-')[1]];
    if (slotId.startsWith('opp-')) {
      const [, i, k] = slotId.split('-');
      return document.querySelectorAll(`#opp-cards-${i} .card-slot`)[+k];
    }
    return null;
  }

  function getSlotValue(slotId) {
    if (slotId.startsWith('hero-')) return state.hero[+slotId.split('-')[1]];
    if (slotId.startsWith('board-')) return state.board[+slotId.split('-')[1]];
    if (slotId.startsWith('opp-')) { const [, i, k] = slotId.split('-'); return state.opponents[+i].cards[+k]; }
    return null;
  }
  function setSlotValue(slotId, cardId) {
    if (slotId.startsWith('hero-')) state.hero[+slotId.split('-')[1]] = cardId;
    else if (slotId.startsWith('board-')) state.board[+slotId.split('-')[1]] = cardId;
    else if (slotId.startsWith('opp-')) { const [, i, k] = slotId.split('-'); state.opponents[+i].cards[+k] = cardId; }
  }

  function refreshSlotDOM(slotId) {
    const elx = getSlotEl(slotId);
    if (!elx) return;
    const val = getSlotValue(slotId);
    if (val === null || val === undefined) UI.clearSlot(elx); else UI.setSlotCard(elx, val);
  }

  const MAIN_SEQUENCE = ['hero-0', 'hero-1', 'board-0', 'board-1', 'board-2', 'board-3', 'board-4'];

  function sequenceFor(slotId) {
    if (slotId.startsWith('opp-')) {
      const [, i] = slotId.split('-');
      return [`opp-${i}-0`, `opp-${i}-1`];
    }
    return MAIN_SEQUENCE;
  }

  // ---------------- Card picker overlay ----------------
  let pickerSequence = [];
  let pickerIndex = 0;
  let recentCards = [];

  function openPicker(originSlotId) {
    pickerSequence = sequenceFor(originSlotId);
    pickerIndex = pickerSequence.indexOf(originSlotId);
    if (pickerIndex === -1) pickerIndex = 0;
    UI.$('pickerTitle').textContent = titleForSequence(pickerSequence);
    renderPickerGrid();
    renderRecentCards();
    UI.$('cardPickerOverlay').classList.remove('hidden');
  }

  function titleForSequence(seq) {
    if (seq === MAIN_SEQUENCE) return 'Select card — My hand & board';
    return 'Select opponent cards';
  }

  function closePicker() { UI.$('cardPickerOverlay').classList.add('hidden'); }

  function renderPickerGrid() {
    const blocked = new Set(allAssignedCardIds());
    UI.renderCardGrid(UI.$('cardGrid'), blocked, (cardId) => pickCard(cardId));
  }

  function renderRecentCards() {
    const wrap = UI.$('recentCards');
    wrap.innerHTML = '';
    recentCards.slice(0, 6).forEach((cardId) => {
      const parts = Cards.idToSymbolParts(cardId);
      const chip = UI.el('div', 'recent-card-chip' + (UI.isRed(parts.suit) ? ' red' : ''), parts.rank + parts.symbol);
      wrap.appendChild(chip);
    });
  }

  function pickCard(cardId) {
    if (pickerIndex >= pickerSequence.length) return;
    const slotId = pickerSequence[pickerIndex];
    setSlotValue(slotId, cardId);
    refreshSlotDOM(slotId);
    recentCards.unshift(cardId);
    recentCards = recentCards.slice(0, 8);
    playSound('inputAccepted');
    updateStreetBadge();
    // advance to next empty slot in the sequence
    let next = pickerIndex + 1;
    while (next < pickerSequence.length && getSlotValue(pickerSequence[next]) !== null) next++;
    if (next < pickerSequence.length) {
      pickerIndex = next;
      renderPickerGrid();
      renderRecentCards();
    } else {
      closePicker();
    }
  }

  function undoPicker() {
    // clear the most recently filled slot in this sequence
    for (let i = pickerSequence.length - 1; i >= 0; i--) {
      if (getSlotValue(pickerSequence[i]) !== null) {
        setSlotValue(pickerSequence[i], null);
        refreshSlotDOM(pickerSequence[i]);
        pickerIndex = i;
        renderPickerGrid();
        updateStreetBadge();
        return;
      }
    }
  }
  function clearPicker() {
    pickerSequence.forEach((s) => { setSlotValue(s, null); refreshSlotDOM(s); });
    pickerIndex = 0;
    renderPickerGrid();
    updateStreetBadge();
  }
  function randomizePicker() {
    const blocked = new Set(allAssignedCardIds());
    pickerSequence.forEach((s) => {
      if (getSlotValue(s) !== null) return;
      const avail = Cards.FULL_DECK.filter((id) => !blocked.has(id));
      if (!avail.length) return;
      const pick = avail[Math.floor(Math.random() * avail.length)];
      setSlotValue(s, pick);
      refreshSlotDOM(s);
      blocked.add(pick);
    });
    updateStreetBadge();
    closePicker();
  }

  function updateStreetBadge() {
    const knownBoard = state.board.filter((c) => c !== null).length;
    const label = knownBoard === 0 ? 'PREFLOP' : knownBoard === 3 ? 'FLOP' : knownBoard === 4 ? 'TURN' : knownBoard === 5 ? 'RIVER' : 'PREFLOP';
    UI.$('streetBadge').textContent = label;
  }

  // ---------------- Opponents UI ----------------
  function renderOpponentsList() {
    const wrap = UI.$('opponentsList');
    wrap.innerHTML = '';
    state.opponents.forEach((opp, i) => {
      const row = UI.el('div', 'opponent-row');
      row.appendChild(UI.el('div', 'opp-name', 'Player ' + (i + 1)));

      const select = document.createElement('select');
      ['random', 'range', 'exact'].forEach((m) => {
        const o = document.createElement('option');
        o.value = m; o.textContent = m === 'random' ? 'Random' : m === 'range' ? 'Range' : 'Exact hand';
        if (opp.mode === m) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', () => { opp.mode = select.value; renderOpponentsList(); });
      row.appendChild(select);

      const actionWrap = UI.el('div');
      if (opp.mode === 'exact') {
        const btn = UI.el('button', 'opp-cards-btn', 'Set cards');
        btn.type = 'button';
        btn.addEventListener('click', () => openPicker(`opp-${i}-0`));
        actionWrap.appendChild(btn);
      } else if (opp.mode === 'range') {
        const btn = UI.el('button', 'opp-range-btn', 'Set range');
        btn.type = 'button';
        btn.addEventListener('click', () => openRangeEditor(i));
        actionWrap.appendChild(btn);
      }
      row.appendChild(actionWrap);

      const detail = UI.el('div', 'opp-detail');
      if (opp.mode === 'exact') {
        const shown = opp.cards.map((c) => c === null ? '?' : Cards.idToString(c)).join(' ');
        detail.textContent = shown;
        // inline mini slots for direct tapping too
        const slotsWrap = UI.el('div', 'card-slots');
        slotsWrap.id = `opp-cards-${i}`;
        slotsWrap.style.marginTop = '8px';
        [0, 1].forEach((k) => {
          const s = UI.el('button', 'card-slot ' + (opp.cards[k] === null ? 'empty' : 'filled'));
          s.type = 'button';
          s.dataset.slot = `opp-${i}-${k}`;
          if (opp.cards[k] !== null) UI.setSlotCard(s, opp.cards[k]); else s.textContent = '?';
          s.addEventListener('click', () => openPicker(`opp-${i}-${k}`));
          slotsWrap.appendChild(s);
        });
        row.appendChild(slotsWrap);
      } else if (opp.mode === 'range') {
        const count = Ranges.combosFromKeys(Array.from(opp.rangeKeys), []).length;
        detail.textContent = `${opp.rangeKeys.size} hands selected — ${count} / 1326 combinations`;
      } else {
        detail.textContent = 'Any two cards (no assumption about opponent tendencies)';
      }
      row.appendChild(detail);

      wrap.appendChild(row);
    });

    // combos summary line
    let anyWide = state.opponents.some((o) => o.mode === 'random');
    UI.$('opponentCombosSummary').textContent = anyWide ? 'Includes RANDOM opponent(s)' : '';
  }

  // ---------------- Range editor overlay ----------------
  let rangeEditingIndex = null;
  function openRangeEditor(i) {
    rangeEditingIndex = i;
    UI.$('rangeTitle').textContent = `Player ${i + 1} — range`;
    renderRangeMatrixUI();
    UI.$('rangeText').value = Ranges.keysToText(Array.from(state.opponents[i].rangeKeys));
    UI.$('rangeTextError').textContent = '';
    UI.$('rangeOverlay').classList.remove('hidden');
  }
  function closeRangeEditor() { UI.$('rangeOverlay').classList.add('hidden'); renderOpponentsList(); }

  function renderRangeMatrixUI() {
    const opp = state.opponents[rangeEditingIndex];
    UI.renderRangeMatrix(UI.$('rangeMatrix'), opp.rangeKeys, (key) => {
      if (opp.rangeKeys.has(key)) opp.rangeKeys.delete(key); else opp.rangeKeys.add(key);
      UI.updateRangeMatrixSelection(UI.$('rangeMatrix'), opp.rangeKeys);
      updateComboCount();
    });
    updateComboCount();
  }
  function updateComboCount() {
    const opp = state.opponents[rangeEditingIndex];
    const count = Ranges.combosFromKeys(Array.from(opp.rangeKeys), []).length;
    UI.$('rangeComboCount').textContent = `Selected combinations: ${count} / 1326`;
  }

  // ---------------- Calculation ----------------
  function buildEquityState() {
    if (state.hero.includes(null)) return { error: 'Select both of your hole cards first.' };
    const board = state.board.filter((c) => c !== null);
    if (board.length === 1 || board.length === 2) {
      return { error: 'The board must have 0 (preflop), 3 (flop), 4 (turn) or 5 (river) cards — finish dealing the current street.' };
    }
    const dead = state.dead.slice();
    const opponents = [];
    for (let i = 0; i < state.opponents.length; i++) {
      const opp = state.opponents[i];
      if (opp.mode === 'exact') {
        if (opp.cards.includes(null)) return { error: `Player ${i + 1}: select both cards, or switch to Random/Range.` };
        opponents.push({ type: 'exact', cards: opp.cards.slice() });
      } else if (opp.mode === 'range') {
        if (opp.rangeKeys.size === 0) return { error: `Player ${i + 1}: range is empty — add hands or switch to Random.` };
        const combos = Ranges.combosFromKeys(Array.from(opp.rangeKeys), []);
        opponents.push({ type: 'range', combos });
      } else {
        opponents.push({ type: 'random' });
      }
    }
    return { hero: state.hero.slice(), board, dead, opponents };
  }

  let calculating = false;
  async function calculate(silent) {
    if (calculating) return;
    const eqState = buildEquityState();
    if (eqState.error) { if (!silent) UI.showToast(eqState.error); return; }

    calculating = true;
    const btn = UI.$('calculateBtn');
    btn.disabled = true;
    btn.textContent = 'CALCULATING…';
    UI.$('calcMeta').textContent = '';

    const method = Equity.canEnumerateExact(eqState) ? 'exact' : 'montecarlo';
    const iterations = Number(settings.simIterations) || 100000;

    try {
      const r = await SimulationRunner.run(method, eqState, {
        iterations,
        seed: Math.floor(Math.random() * 1e9),
        onProgress: (done, total) => { btn.textContent = `CALCULATING… ${done.toLocaleString()} / ${total.toLocaleString()}`; }
      });
      renderFullResult(eqState, r);
      playSound('calculationComplete');
      if (!silent) speakIfEnabled(r);
      saveHistoryEntry(eqState, r);
    } catch (err) {
      UI.showToast('Calculation error: ' + err.message);
    } finally {
      calculating = false;
      btn.disabled = false;
      btn.textContent = 'CALCULATE';
    }
  }

  function confidenceFor(eqState, r) {
    if (r.method === 'exact') return 'HIGH';
    const wideCount = eqState.opponents.filter((o) => o.type === 'random').length;
    const rangeCount = eqState.opponents.filter((o) => o.type === 'range').length;
    if (wideCount > 0 && eqState.opponents.length > 2) return 'LOW';
    if (wideCount > 0 || rangeCount > 1) return 'MEDIUM';
    if (r.iterations && r.iterations < 50000) return 'MEDIUM';
    return 'HIGH';
  }

  function renderFullResult(eqState, r) {
    const win = r.win / r.total, tie = r.tie / r.total, lose = r.lose / r.total;
    const equity = r.equity;

    const moe = r.method === 'montecarlo' ? Equity.marginOfError(equity, r.total) : 0;
    const equityRangeText = r.method === 'montecarlo'
      ? `Monte Carlo estimate — approx. ±${(moe * 100).toFixed(1)} points (95% range: ${UI.pct(Math.max(0, equity - moe))}–${UI.pct(Math.min(1, equity + moe))})`
      : 'Exact enumeration over all remaining card combinations.';

    const po = PotOdds.calculate({ pot: state.pot, bet: state.bet, call: state.call });
    const evResult = EVCalc.evCall({ equity, pot: state.pot, bet: state.bet, call: state.call });

    const confidence = confidenceFor(eqState, r);
    const opponentRangeIsRandomOrWide = eqState.opponents.some((o) => o.type === 'random');

    const decision = Decision.decide({
      equityPct: equity * 100,
      requiredEquityPct: po.requiredEquityPct,
      callAmount: state.call,
      betAmount: state.bet,
      pot: state.pot,
      effectiveStack: state.stack,
      ev: evResult.ev,
      opponentRangeIsRandomOrWide,
      confidence
    });

    const edgeText = decision.edge === null ? '—' : `${decision.edge >= 0 ? '+' : ''}${decision.edge.toFixed(1)} pp`;

    UI.renderResults({
      equity, win, tie, lose,
      equityRangeText,
      action: decision.action,
      confidence,
      potOddsText: po.requiredEquity > 0 ? `${po.requiredEquityPct.toFixed(1)}%` : '—',
      requiredEquityText: state.call > 0 ? `${po.requiredEquityPct.toFixed(1)}%` : 'n/a (no bet)',
      evText: state.call > 0 ? `${evResult.ev >= 0 ? '+' : ''}${evResult.ev.toFixed(2)} ${settingsUnit()}` : '—',
      edgeText,
      reasons: decision.reasons,
      calcMetaText: `${r.method === 'exact' ? 'Exact enumeration' : 'Monte Carlo simulation'} — ${r.total.toLocaleString()} ${r.method === 'exact' ? 'board combinations' : 'trials'}${r.timeMs ? ` — ${r.timeMs.toFixed(0)} ms` : ''}`
    });

    // advanced panels
    renderCalcQualityGrid(eqState, r, confidence);
    renderOutsAndTexture();
    UI.renderCategoryDistribution(UI.$('categoryDistPanel'), r.categoryCounts);
    recordStreetHistory(equity);

    state.lastResult = { eqState, r, decision, po, evResult, confidence };
  }

  function settingsUnit() { return settings.currency === 'currency' ? '₹' : settings.currency === 'chips' ? 'chips' : 'BB'; }

  function renderCalcQualityGrid(eqState, r, confidence) {
    const rows = [
      ['Method', r.method === 'exact' ? 'Exact enumeration' : 'Monte Carlo'],
      ['Sample size', r.total.toLocaleString() + (r.method === 'exact' ? ' board combos' : ' trials')],
      ['Calculation time', (r.timeMs || 0).toFixed(0) + ' ms'],
      ['Confidence', confidence],
      ['Opponent modeling', eqState.opponents.map((o, idx) => `P${idx + 1}: ${o.type}`).join(', ')]
    ];
    if (r.method === 'montecarlo') {
      rows.push(['Estimated MC error', '≈ ±' + (Equity.marginOfError(r.equity, r.total) * 100).toFixed(2) + ' points (95%)']);
    }
    UI.renderCalcQuality(UI.$('calcQualityGrid'), rows);
  }

  function renderOutsAndTexture() {
    const board = state.board.filter((c) => c !== null);
    if (board.length === 3 || board.length === 4) {
      const outsResult = Outs.computeOuts(state.hero, board, state.dead);
      UI.renderOuts(UI.$('outsPanel'), outsResult);
    } else {
      UI.$('outsPanel').textContent = 'Requires a flop or turn board.';
    }
    if (board.length >= 3) {
      const texture = BoardTexture.analyze(board);
      UI.renderBoardTexture(UI.$('boardTexturePanel'), texture);
    } else {
      UI.$('boardTexturePanel').textContent = 'Requires at least 3 board cards.';
    }
  }

  function recordStreetHistory(equity) {
    const board = state.board.filter((c) => c !== null);
    const street = board.length === 0 ? 'Preflop' : board.length === 3 ? 'Flop' : board.length === 4 ? 'Turn' : 'River';
    const existingIdx = state.streetHistory.findIndex((s) => s.street === street);
    const entry = { street, equity: equity * 100 };
    if (existingIdx >= 0) state.streetHistory[existingIdx] = entry; else state.streetHistory.push(entry);
    const order = ['Preflop', 'Flop', 'Turn', 'River'];
    state.streetHistory.sort((a, b) => order.indexOf(a.street) - order.indexOf(b.street));
    const panel = UI.$('streetHistoryPanel');
    if (state.streetHistory.length < 1) { panel.textContent = 'Calculate at each street to build this chart.'; return; }
    panel.innerHTML = state.streetHistory.map((s) => `<div class="category-bar-row"><span class="category-bar-label">${s.street}</span><span class="category-bar-track"><span class="category-bar-fill" style="width:${s.equity.toFixed(1)}%"></span></span><span class="category-bar-pct">${s.equity.toFixed(1)}%</span></div>`).join('');
  }

  // ---------------- Next-card analysis ----------------
  async function runNextCardAnalysis() {
    const board = state.board.filter((c) => c !== null);
    if (board.length !== 3 && board.length !== 4) {
      UI.showToast('Next-card analysis needs exactly a flop (3) or turn (4) board.');
      return;
    }
    const eqState = buildEquityState();
    if (eqState.error) { UI.showToast(eqState.error); return; }

    const blocked = new Set([...state.hero, ...board, ...state.dead]);
    eqState.opponents.forEach((o) => { if (o.type === 'exact') { blocked.add(o.cards[0]); blocked.add(o.cards[1]); } });
    const candidates = Cards.FULL_DECK.filter((id) => !blocked.has(id));

    UI.$('nextCardBtn').disabled = true;
    UI.$('nextCardBtn').textContent = 'Analyzing…';
    const results = [];
    const iterations = eqState.opponents.every((o) => o.type === 'exact') ? null : Math.min(20000, Number(settings.simIterations) || 20000);

    for (const card of candidates) {
      const newBoard = board.concat([card]);
      const subState = Object.assign({}, eqState, { board: newBoard });
      const method = Equity.canEnumerateExact(subState) ? 'exact' : 'montecarlo';
      const r = await SimulationRunner.run(method, subState, { iterations: iterations || 20000, seed: 777 });
      results.push({ card, equity: r.equity });
    }
    results.sort((a, b) => b.equity - a.equity);
    const baseline = state.lastResult ? state.lastResult.r.equity : 0.5;
    results.forEach((r) => { r.delta = r.equity - baseline; });
    UI.renderNextCardAnalysis(UI.$('nextCardPanel'), results);
    UI.$('nextCardBtn').disabled = false;
    UI.$('nextCardBtn').textContent = 'Analyze next card';
  }

  // ---------------- History ----------------
  function saveHistoryEntry(eqState, r) {
    const heroText = eqState.hero.map((c) => Cards.idToString(c)).join(' ');
    const entry = {
      date: Date.now(),
      heroText,
      board: eqState.board.map((c) => Cards.idToString(c)).join(' '),
      playersCount: state.players,
      equity: r.equity * 100,
      action: state.lastResult ? state.lastResult.decision.action : (UI.$('actionValue').textContent),
      pot: state.pot, bet: state.bet, call: state.call
    };
    Storage.addHistoryEntry(entry);
  }

  function openHistory() {
    UI.renderHistory(UI.$('historyList'), Storage.getHistory(), {
      onView: (entry) => { UI.showToast(`${entry.heroText} — equity ${entry.equity.toFixed(1)}% — ${entry.action}`); },
      onDelete: (id) => { Storage.deleteHistoryEntry(id); openHistory(); }
    });
    UI.$('historyOverlay').classList.remove('hidden');
  }

  // ---------------- Audio ----------------
  function playSound(name) { if (settings.soundEnabled) AudioEngine.sounds[name] && AudioEngine.sounds[name](); }
  function speakIfEnabled(r) {
    if (!settings.voiceEnabled) return;
    const po = state.lastResult ? state.lastResult.po : null;
    AudioEngine.configure({ enabled: true, rate: Number(settings.voiceSpeed), volume: Number(settings.voiceVolume), style: settings.voiceStyle });
    AudioEngine.speakResult({
      action: state.lastResult.decision.action,
      equityPct: r.equity * 100,
      requiredEquityPct: state.call > 0 && po ? po.requiredEquityPct : null
    });
  }

  // ---------------- Mode toggle (Fast / Advanced) ----------------
  function setMode(mode) {
    state.mode = mode;
    UI.$('modeFastBtn').classList.toggle('active', mode === 'fast');
    UI.$('modeAdvancedBtn').classList.toggle('active', mode === 'advanced');
    UI.$('advancedPanels').style.display = mode === 'advanced' ? 'block' : 'none';
    settings.fastMode = mode === 'fast';
    Storage.saveSettings(settings);
  }

  // ---------------- Settings overlay ----------------
  function loadSettingsIntoUI() {
    UI.$('setSound').checked = !!settings.soundEnabled;
    UI.$('setVoice').checked = !!settings.voiceEnabled;
    UI.$('setVoiceStyle').value = settings.voiceStyle;
    UI.$('setVoiceSpeed').value = settings.voiceSpeed;
    UI.$('setVoiceVolume').value = settings.voiceVolume;
    UI.$('setSimIterations').value = String(settings.simIterations);
    UI.$('setCurrency').value = settings.currency;
    UI.$('setAnimations').checked = !!settings.animationsEnabled;
  }
  function bindSettingsEvents() {
    UI.$('setSound').addEventListener('change', (e) => { settings.soundEnabled = e.target.checked; Storage.saveSettings(settings); });
    UI.$('setVoice').addEventListener('change', (e) => {
      settings.voiceEnabled = e.target.checked; Storage.saveSettings(settings);
      if (settings.voiceEnabled && !AudioEngine.supported) UI.showToast('Speech synthesis is not supported in this browser.');
    });
    UI.$('setVoiceStyle').addEventListener('change', (e) => { settings.voiceStyle = e.target.value; Storage.saveSettings(settings); });
    UI.$('setVoiceSpeed').addEventListener('input', (e) => { settings.voiceSpeed = Number(e.target.value); Storage.saveSettings(settings); });
    UI.$('setVoiceVolume').addEventListener('input', (e) => { settings.voiceVolume = Number(e.target.value); Storage.saveSettings(settings); });
    UI.$('setSimIterations').addEventListener('change', (e) => { settings.simIterations = Number(e.target.value); Storage.saveSettings(settings); });
    UI.$('setCurrency').addEventListener('change', (e) => { settings.currency = e.target.value; Storage.saveSettings(settings); });
    UI.$('setAnimations').addEventListener('change', (e) => {
      settings.animationsEnabled = e.target.checked; Storage.saveSettings(settings);
      document.body.style.setProperty('--transition-fast', settings.animationsEnabled ? '120ms ease' : '0ms');
    });
    UI.$('shareScenarioBtn').addEventListener('click', shareScenario);
  }

  // ---------------- Share scenario ----------------
  function encodeScenario() {
    const payload = {
      p: state.players, pos: state.position, st: state.stack, po: state.pot, bt: state.bet, cl: state.call,
      h: state.hero, b: state.board,
      o: state.opponents.map((o) => ({ m: o.mode, c: o.cards, r: Array.from(o.rangeKeys) }))
    };
    return btoa(encodeURIComponent(JSON.stringify(payload)));
  }
  function decodeScenario(str) {
    try { return JSON.parse(decodeURIComponent(atob(str))); } catch (e) { return null; }
  }
  function shareScenario() {
    const encoded = encodeScenario();
    const url = `${location.origin}${location.pathname}#s=${encoded}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => { UI.$('shareStatus').textContent = 'Link copied to clipboard.'; }).catch(() => { UI.$('shareStatus').textContent = url; });
    } else {
      UI.$('shareStatus').textContent = url;
    }
  }
  function loadScenarioFromHash() {
    const m = location.hash.match(/s=([^&]+)/);
    if (!m) return;
    const data = decodeScenario(m[1]);
    if (!data) return;
    state.players = data.p; state.position = data.pos; state.stack = data.st;
    state.pot = data.po; state.bet = data.bt; state.call = data.cl;
    state.hero = data.h; state.board = data.b;
    syncOpponents();
    (data.o || []).forEach((o, i) => {
      if (!state.opponents[i]) return;
      state.opponents[i].mode = o.m;
      state.opponents[i].cards = o.c;
      state.opponents[i].rangeKeys = new Set(o.r || []);
    });
    reflectStateToUI();
  }

  function reflectStateToUI() {
    UI.$('playersCount').textContent = state.players;
    UI.$('positionSelect').value = state.position;
    UI.$('stackInput').value = state.stack;
    UI.$('potInput').value = state.pot;
    UI.$('betInput').value = state.bet;
    UI.$('callInput').value = state.call;
    MAIN_SEQUENCE.forEach((s) => refreshSlotDOM(s));
    updateStreetBadge();
    renderOpponentsList();
  }

  // ---------------- Event wiring ----------------
  function wireEvents() {
    document.querySelectorAll('#heroSlots .card-slot, #boardSlots .card-slot').forEach((slotEl) => {
      slotEl.addEventListener('click', () => openPicker(slotEl.dataset.slot));
    });

    UI.$('pickerClose').addEventListener('click', closePicker);
    UI.$('pickerUndo').addEventListener('click', undoPicker);
    UI.$('pickerClear').addEventListener('click', clearPicker);
    UI.$('pickerRandom').addEventListener('click', randomizePicker);

    UI.$('playersMinus').addEventListener('click', () => { if (state.players > 2) { state.players--; syncOpponents(); UI.$('playersCount').textContent = state.players; renderOpponentsList(); } });
    UI.$('playersPlus').addEventListener('click', () => { if (state.players < 9) { state.players++; syncOpponents(); UI.$('playersCount').textContent = state.players; renderOpponentsList(); } });
    UI.$('positionSelect').addEventListener('change', (e) => { state.position = e.target.value; });
    UI.$('stackInput').addEventListener('input', (e) => { state.stack = Number(e.target.value) || 0; });
    UI.$('potInput').addEventListener('input', (e) => { state.pot = Number(e.target.value) || 0; });
    UI.$('betInput').addEventListener('input', (e) => { state.bet = Number(e.target.value) || 0; if (Number(UI.$('callInput').value) === 0) { UI.$('callInput').value = e.target.value; state.call = state.bet; } });
    UI.$('callInput').addEventListener('input', (e) => { state.call = Number(e.target.value) || 0; });

    UI.$('calculateBtn').addEventListener('click', () => calculate(false));

    UI.$('btnHistory').addEventListener('click', openHistory);
    UI.$('historyClose').addEventListener('click', () => UI.$('historyOverlay').classList.add('hidden'));
    UI.$('historyClearAll').addEventListener('click', () => { Storage.clearHistory(); openHistory(); });

    UI.$('btnSettings').addEventListener('click', () => { loadSettingsIntoUI(); UI.$('settingsOverlay').classList.remove('hidden'); });
    UI.$('settingsClose').addEventListener('click', () => UI.$('settingsOverlay').classList.add('hidden'));

    UI.$('btnHelp').addEventListener('click', () => UI.$('helpOverlay').classList.remove('hidden'));
    UI.$('helpClose').addEventListener('click', () => UI.$('helpOverlay').classList.add('hidden'));

    UI.$('modeFastBtn').addEventListener('click', () => setMode('fast'));
    UI.$('modeAdvancedBtn').addEventListener('click', () => setMode('advanced'));

    UI.$('rangeClose').addEventListener('click', closeRangeEditor);
    UI.$('rangeDone').addEventListener('click', closeRangeEditor);
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const opp = state.opponents[rangeEditingIndex];
        const pct = Number(btn.dataset.pct);
        opp.rangeKeys = new Set(Ranges.topPercentKeys(pct));
        renderRangeMatrixUI();
        UI.$('rangeText').value = Ranges.keysToText(Array.from(opp.rangeKeys));
      });
    });
    UI.$('rangeSelectAll').addEventListener('click', () => {
      const opp = state.opponents[rangeEditingIndex];
      opp.rangeKeys = new Set(Ranges.ALL_HANDS);
      renderRangeMatrixUI();
      UI.$('rangeText').value = Ranges.keysToText(Array.from(opp.rangeKeys));
    });
    UI.$('rangeClear').addEventListener('click', () => {
      const opp = state.opponents[rangeEditingIndex];
      opp.rangeKeys = new Set();
      renderRangeMatrixUI();
      UI.$('rangeText').value = '';
    });
    UI.$('rangeTextApply').addEventListener('click', () => {
      const opp = state.opponents[rangeEditingIndex];
      const parsed = Ranges.parseRangeText(UI.$('rangeText').value);
      if (parsed.errors.length) { UI.$('rangeTextError').textContent = 'Could not parse: ' + parsed.errors.join('; '); }
      else UI.$('rangeTextError').textContent = '';
      opp.rangeKeys = new Set(parsed.keys);
      renderRangeMatrixUI();
    });

    UI.$('nextCardBtn').addEventListener('click', runNextCardAnalysis);

    document.querySelectorAll('.qbtn').forEach((btn) => {
      btn.addEventListener('click', () => UI.showToast(btn.dataset.tip));
    });

    bindSettingsEvents();

    // close overlays by clicking backdrop
    document.querySelectorAll('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.add('hidden'); });
    });

    // keyboard: Escape closes any open overlay
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.overlay:not(.hidden)').forEach((ov) => ov.classList.add('hidden'));
    });
  }

  function init() {
    wireEvents();
    renderOpponentsList();
    updateStreetBadge();
    setMode(state.mode);
    loadScenarioFromHash();
    if (!AudioEngine.supported) {
      // silently degrade; voice checkbox will show a toast only if the user enables it
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { init(); } catch (e) { console.error('Poker Analyzer failed to initialize:', e); }
  });
})();
