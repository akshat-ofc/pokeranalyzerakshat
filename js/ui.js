/**
 * ui.js — DOM rendering helpers. No app-state lives here; app.js owns state
 * and calls into these functions with plain data.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UI = factory(root.Cards, root.Ranges);
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Cards = (typeof module === 'object' && module.exports) ? require('./cards.js') : window.Cards;
  const Ranges = (typeof module === 'object' && module.exports) ? require('./ranges.js') : window.Ranges;

  const RANKS_HIGH_FIRST = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  const SUITS = [
    { char: 's', symbol: '♠', red: false, label: 'SPADES' },
    { char: 'h', symbol: '♥', red: true, label: 'HEARTS' },
    { char: 'd', symbol: '♦', red: true, label: 'DIAMONDS' },
    { char: 'c', symbol: '♣', red: false, label: 'CLUBS' }
  ];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function isRed(suitChar) { return suitChar === 'h' || suitChar === 'd'; }

  // ---------------- Card slot (hero/board/opponent) rendering ----------------
  function setSlotCard(slotEl, cardId) {
    slotEl.classList.remove('empty');
    slotEl.classList.add('filled');
    const parts = Cards.idToSymbolParts(cardId);
    if (isRed(parts.suit)) slotEl.classList.add('red'); else slotEl.classList.remove('red');
    slotEl.innerHTML = '';
    const rankSpan = el('span', 'rank', parts.rank);
    const suitSpan = el('span', 'suit', parts.symbol);
    slotEl.appendChild(rankSpan);
    slotEl.appendChild(suitSpan);
    slotEl.dataset.cardId = cardId;
  }

  function clearSlot(slotEl) {
    slotEl.classList.remove('filled', 'red');
    slotEl.classList.add('empty');
    slotEl.innerHTML = '?';
    delete slotEl.dataset.cardId;
  }

  // ---------------- Card picker grid ----------------
  function renderCardGrid(container, blockedSet, onPick) {
    container.innerHTML = '';
    SUITS.forEach((suit) => {
      const row = el('div', 'suit-row');
      row.appendChild(el('div', 'suit-row-label', suit.label));
      RANKS_HIGH_FIRST.forEach((rankChar) => {
        const cardId = Cards.stringToId(rankChar + suit.char);
        const btn = el('button', 'pick-card' + (suit.red ? ' red' : ''));
        btn.type = 'button';
        btn.textContent = rankChar + suit.symbol;
        btn.dataset.cardId = cardId;
        if (blockedSet.has(cardId)) btn.disabled = true;
        btn.addEventListener('click', () => onPick(cardId));
        row.appendChild(btn);
      });
      container.appendChild(row);
    });
  }

  // ---------------- Range matrix ----------------
  function renderRangeMatrix(container, selectedKeySet, onToggle) {
    container.innerHTML = '';
    const grid = Ranges.GRID_META;
    for (let i = 0; i < 13; i++) {
      for (let j = 0; j < 13; j++) {
        const meta = grid[i][j];
        const cell = el('div', 'range-cell ' + meta.type, meta.key);
        cell.dataset.key = meta.key;
        if (selectedKeySet.has(meta.key)) cell.classList.add('selected');
        cell.addEventListener('pointerdown', (e) => { e.preventDefault(); onToggle(meta.key, cell); });
        container.appendChild(cell);
      }
    }
  }

  function updateRangeMatrixSelection(container, selectedKeySet) {
    container.querySelectorAll('.range-cell').forEach((cell) => {
      cell.classList.toggle('selected', selectedKeySet.has(cell.dataset.key));
    });
  }

  // ---------------- Results rendering ----------------
  function pct(x, digits) { return (x * 100).toFixed(digits === undefined ? 1 : digits) + '%'; }

  function renderResults(data) {
    $('equityValue').textContent = pct(data.equity);
    $('equityRange').textContent = data.equityRangeText || '';
    $('winVal').textContent = pct(data.win);
    $('tieVal').textContent = pct(data.tie);
    $('loseVal').textContent = pct(data.lose);

    const bar = $('wtlBar');
    bar.querySelector('.wtl-bar-win').style.flexBasis = (data.win * 100) + '%';
    bar.querySelector('.wtl-bar-tie').style.flexBasis = (data.tie * 100) + '%';
    bar.querySelector('.wtl-bar-lose').style.flexBasis = (data.lose * 100) + '%';
    bar.style.display = 'flex';
    bar.querySelectorAll('div').forEach((d) => { d.style.flexGrow = '0'; d.style.flexShrink = '0'; });

    const actionEl = $('actionValue');
    actionEl.textContent = data.action;
    actionEl.dataset.action = data.action;

    const confEl = $('confidenceBadge');
    confEl.textContent = data.confidence;
    confEl.dataset.level = data.confidence;

    $('qsPotOdds').textContent = data.potOddsText;
    $('qsRequired').textContent = data.requiredEquityText;
    $('qsEV').textContent = data.evText;
    $('qsEdge').textContent = data.edgeText;

    const reasonBox = $('reasonBox');
    reasonBox.innerHTML = '';
    data.reasons.forEach((r) => {
      const item = el('div', 'reason-item');
      item.dataset.type = r.type;
      const label = el('span', 'reason-label', r.label);
      item.appendChild(label);
      item.appendChild(document.createTextNode(r.text));
      reasonBox.appendChild(item);
    });

    $('calcMeta').textContent = data.calcMetaText || '';
  }

  function renderCalcQuality(container, rows) {
    container.innerHTML = '';
    rows.forEach(([label, value]) => {
      const f = el('div', 'field');
      f.appendChild(el('label', null, label));
      f.appendChild(el('div', null, value));
      container.appendChild(f);
    });
  }

  function renderOuts(container, outsResult) {
    container.innerHTML = '';
    if (!outsResult || outsResult.count === undefined) {
      container.textContent = 'Requires a flop or turn board.';
      return;
    }
    const top = el('div');
    top.innerHTML = `<div style="font-size:22px;font-weight:800;color:var(--primary)">${outsResult.count} clean outs</div>
      <div class="muted small" style="margin-top:4px">Current best hand: ${outsResult.currentCategoryName}</div>`;
    container.appendChild(top);

    const stats = el('div', 'quick-stats');
    stats.style.marginTop = '14px';
    const s1 = el('div', 'qstat');
    s1.innerHTML = `<span class="qstat-label">Next-card probability</span><span class="qstat-val">${outsResult.probNext !== null ? pct(outsResult.probNext) : '—'}</span>`;
    const s2 = el('div', 'qstat');
    s2.innerHTML = `<span class="qstat-label">By-river probability</span><span class="qstat-val">${outsResult.probByRiver !== null ? pct(outsResult.probByRiver) : '—'}</span>`;
    stats.appendChild(s1); stats.appendChild(s2);
    container.appendChild(stats);

    if (outsResult.breakdown && outsResult.breakdown.length) {
      const grid = el('div', 'next-card-grid');
      grid.style.marginTop = '14px';
      outsResult.breakdown.forEach((b) => {
        const cell = el('div', 'next-card-cell up');
        const parts = Cards.idToSymbolParts(b.card);
        cell.innerHTML = `<div class="nc-card" style="color:${isRed(parts.suit) ? '#ff8080' : 'inherit'}">${parts.rank}${parts.symbol}</div><div class="nc-eq">${b.categoryName}</div>`;
        grid.appendChild(cell);
      });
      container.appendChild(grid);
    }
  }

  function renderBoardTexture(container, texture) {
    container.innerHTML = '';
    if (!texture) { container.textContent = 'Requires at least 3 board cards.'; return; }
    const summary = el('div', 'texture-summary', texture.summary);
    container.appendChild(summary);
    const tags = el('div', 'texture-tags');
    texture.descriptors.forEach((d) => tags.appendChild(el('span', 'texture-tag', d)));
    container.appendChild(tags);
    const heading = el('div', 'muted small', 'What this board makes possible for opponents:');
    heading.style.marginBottom = '4px';
    container.appendChild(heading);
    const list = el('ul', 'texture-list');
    texture.opponentPossibilities.forEach((p) => list.appendChild(el('li', null, p)));
    container.appendChild(list);
  }

  function renderNextCardAnalysis(container, results) {
    container.innerHTML = '';
    if (!results || !results.length) { container.textContent = 'Not available for this board state / opponent setup.'; return; }
    const grid = el('div', 'next-card-grid');
    results.forEach((r) => {
      const parts = Cards.idToSymbolParts(r.card);
      const cell = el('div', 'next-card-cell ' + (r.delta >= 0 ? 'up' : 'down'));
      cell.innerHTML = `<div class="nc-card" style="color:${isRed(parts.suit) ? '#ff8080' : '#fff'}">${parts.rank}${parts.symbol}</div><div class="nc-eq">${pct(r.equity)}</div>`;
      grid.appendChild(cell);
    });
    container.appendChild(grid);
  }

  function renderCategoryDistribution(container, dist) {
    container.innerHTML = '';
    if (!dist) { container.textContent = 'Available after a Monte Carlo calculation.'; return; }
    const names = ['High Card', 'One Pair', 'Two Pair', 'Trips', 'Straight', 'Flush', 'Full House', 'Quads', 'Straight Flush'];
    const total = dist.reduce((a, b) => a + b, 0) || 1;
    names.forEach((name, i) => {
      const frac = (dist[i] || 0) / total;
      const row = el('div', 'category-bar-row');
      row.innerHTML = `<span class="category-bar-label">${name}</span><span class="category-bar-track"><span class="category-bar-fill" style="width:${(frac * 100).toFixed(1)}%"></span></span><span class="category-bar-pct">${pct(frac)}</span>`;
      container.appendChild(row);
    });
  }

  function renderHistory(container, entries, callbacks) {
    container.innerHTML = '';
    if (!entries.length) { container.textContent = 'No saved calculations yet.'; return; }
    entries.forEach((entry) => {
      const item = el('div', 'history-item');
      const info = el('div', 'history-info');
      info.innerHTML = `<div class="h-cards">${entry.heroText} vs ${entry.playersCount - 1} opp.</div>
        <div class="h-meta">${new Date(entry.date).toLocaleString()} — Equity ${entry.equity.toFixed(1)}% — ${entry.action}</div>`;
      const actions = el('div', 'history-actions');
      const viewBtn = el('button', null, 'View');
      viewBtn.addEventListener('click', () => callbacks.onView(entry));
      const delBtn = el('button', null, 'Delete');
      delBtn.addEventListener('click', () => callbacks.onDelete(entry.id));
      actions.appendChild(viewBtn); actions.appendChild(delBtn);
      item.appendChild(info); item.appendChild(actions);
      container.appendChild(item);
    });
  }

  let toastTimer = null;
  function showToast(message) {
    const t = $('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  return {
    $, el, isRed, SUITS, RANKS_HIGH_FIRST,
    setSlotCard, clearSlot,
    renderCardGrid, renderRangeMatrix, updateRangeMatrixSelection,
    renderResults, renderCalcQuality, renderOuts, renderBoardTexture,
    renderNextCardAnalysis, renderCategoryDistribution, renderHistory,
    showToast, pct
  };
}));
