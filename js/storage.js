/**
 * storage.js — localStorage-backed settings & history
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Storage = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SETTINGS_KEY = 'poker_analyzer_settings_v1';
  const HISTORY_KEY = 'poker_analyzer_history_v1';
  const MAX_HISTORY = 100;

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    soundEnabled: false,
    voiceEnabled: false,
    voiceStyle: 'normal', // short | normal | detailed
    voiceSpeed: 1.0,
    voiceVolume: 1.0,
    simIterations: 100000,
    defaultPlayers: 6,
    currency: 'BB', // 'BB' or a currency symbol
    animationsEnabled: true,
    fastMode: true
  };

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  // Some browsers/environments (opaque file:// origins, privacy modes, or
  // storage explicitly disabled) throw a SecurityError just by *touching*
  // localStorage. We never want that to break app startup, so every access
  // goes through this guarded getter and all storage functions degrade to
  // in-memory-only behavior if it's unavailable.
  let memoryFallback = { settings: null, history: [] };
  let storageOK = null;
  function getLS() {
    if (storageOK === false) return null;
    try {
      if (typeof localStorage === 'undefined') { storageOK = false; return null; }
      const testKey = '__poker_analyzer_probe__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      storageOK = true;
      return localStorage;
    } catch (e) {
      storageOK = false;
      return null;
    }
  }

  function getSettings() {
    const ls = getLS();
    if (!ls) return Object.assign({}, DEFAULT_SETTINGS, memoryFallback.settings || {});
    try {
      const raw = ls.getItem(SETTINGS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, safeParse(raw, {}));
    } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }

  function saveSettings(settings) {
    memoryFallback.settings = settings;
    const ls = getLS();
    if (!ls) return;
    try { ls.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  function getHistory() {
    const ls = getLS();
    if (!ls) return memoryFallback.history.slice();
    try {
      const raw = ls.getItem(HISTORY_KEY);
      return raw ? safeParse(raw, []) : [];
    } catch (e) { return memoryFallback.history.slice(); }
  }

  function addHistoryEntry(entry) {
    const list = getHistory();
    list.unshift(Object.assign({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 8) }, entry));
    if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
    memoryFallback.history = list;
    const ls = getLS();
    if (ls) { try { ls.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }
    return list;
  }

  function deleteHistoryEntry(id) {
    const list = getHistory().filter((e) => e.id !== id);
    memoryFallback.history = list;
    const ls = getLS();
    if (ls) { try { ls.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }
    return list;
  }

  function clearHistory() {
    memoryFallback.history = [];
    const ls = getLS();
    if (ls) { try { ls.setItem(HISTORY_KEY, JSON.stringify([])); } catch (e) { /* ignore */ } }
  }

  return {
    DEFAULT_SETTINGS,
    getSettings, saveSettings,
    getHistory, addHistoryEntry, deleteHistoryEntry, clearHistory
  };
}));
