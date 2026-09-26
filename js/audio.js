/**
 * audio.js — Optional voice guidance + subtle UI sounds
 * ----------------------------------------------------------
 * Uses the Web Speech API (speechSynthesis) when available. Completely
 * inert unless the user explicitly enables it in Settings. If speech
 * synthesis isn't supported, speak() is a silent no-op (never throws).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AudioEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  let enabled = false;
  let rate = 1.0;
  let volume = 1.0;
  let style = 'normal';
  let muted = false;

  function configure(opts) {
    if (!opts) return;
    if (typeof opts.enabled === 'boolean') enabled = opts.enabled;
    if (typeof opts.rate === 'number') rate = opts.rate;
    if (typeof opts.volume === 'number') volume = opts.volume;
    if (typeof opts.style === 'string') style = opts.style;
    if (typeof opts.muted === 'boolean') muted = opts.muted;
  }

  function buildSentence({ action, equityPct, requiredEquityPct }) {
    const act = action.charAt(0) + action.slice(1).toLowerCase();
    if (style === 'short') {
      return `${act}.`;
    }
    if (style === 'detailed') {
      const reqPart = (requiredEquityPct !== null && requiredEquityPct !== undefined)
        ? ` Required equity ${Math.round(requiredEquityPct)} percent.`
        : '';
      return `Estimated equity ${Math.round(equityPct)} percent.${reqPart} Recommended action: ${act}. This is a probability-based estimate, not a guarantee.`;
    }
    // normal
    const reqPart = (requiredEquityPct !== null && requiredEquityPct !== undefined)
      ? ` Required ${Math.round(requiredEquityPct)} percent.`
      : '';
    return `Equity ${Math.round(equityPct)} percent.${reqPart} ${act}.`;
  }

  function speakResult(resultSummary) {
    if (!enabled || muted || !supported) return false;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(buildSentence(resultSummary));
      utter.rate = rate;
      utter.volume = volume;
      window.speechSynthesis.speak(utter);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- Subtle non-verbal sounds via WebAudio, generated (no audio files) ----
  let ctx = null;
  function getCtx() {
    if (!enabled || muted) return null;
    if (typeof window === 'undefined' || !(window.AudioContext || window.webkitAudioContext)) return null;
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function tone(freq, durationMs, type) {
    const c = getCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.06 * volume;
      osc.connect(gain).connect(c.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000);
      osc.stop(c.currentTime + durationMs / 1000 + 0.02);
    } catch (e) { /* ignore */ }
  }

  const sounds = {
    calculationComplete: () => { tone(660, 90); setTimeout(() => tone(880, 120), 90); },
    inputAccepted: () => tone(520, 45),
    invalidCard: () => tone(180, 140, 'square'),
    actionReady: () => { tone(740, 70); setTimeout(() => tone(990, 90), 70); }
  };

  return { supported, configure, speakResult, sounds, buildSentence };
}));
