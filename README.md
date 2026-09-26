# Poker Analyzer — Texas Hold'em Equity & Decision Engine

An educational, client-side Texas Hold'em equity and decision-analysis tool.
Everything runs in the browser — no backend, no account, no data leaves
your device (localStorage only). Every number you see comes from an actual
combinatorial or Monte Carlo calculation over the cards you select; nothing
is hardcoded or faked.

**This is a probability tool, not a guarantee.** Every win/tie/lose
percentage, equity figure, EV number, and action recommendation is an
*estimate under the assumptions you selected* — especially your assumptions
about opponents' hole cards. Change the opponent range and the numbers
change. Please treat it as decision support, not certainty, and only use it
somewhere poker analysis tools are legal for you to use.

## Running it

Just open `index.html` in a modern browser (Chrome, Firefox, Edge, Safari).
No build step, no server, no install. It works whether you open it via
`file://` directly or serve it over `http(s)://`.

To run the automated test suite (pure Node.js, zero dependencies):

```
node tests/run-all.js
```

## Project layout

```
index.html            Single-page app shell
css/styles.css         Core dark "fintech + poker analytics" theme
css/responsive.css     Tablet/mobile breakpoints
js/cards.js             Card & deck primitives (int-encoded cards, seeded RNG)
js/evaluator.js         7-card hand evaluator (all 10 categories)
js/ranges.js             13x13 range matrix, combo math, text-notation parser
js/equity.js             Exact enumeration + Monte Carlo core (pure, worker-safe)
js/outs.js               Outs & draw probabilities (exact hypergeometric math)
js/boardTexture.js       Descriptive board-texture analysis
js/potOdds.js            Pot odds / required equity
js/ev.js                 Expected value, assumptions always disclosed
js/decision.js           Transparent, labeled action recommendation
js/simulation.js         Web Worker orchestration (Blob-based — works under file://)
js/audio.js              Optional Web Speech API voice guidance + UI tones
js/storage.js            localStorage-backed settings & history (fails safe)
js/ui.js                 DOM rendering helpers
js/app.js                Application state & event wiring
tests/*.test.js          Automated tests (66 assertions, zero dependencies)
```

## How the engine works

### Card representation
Every card is an integer `0..51`: `id = rankIndex*4 + suitIndex`. This keeps
comparisons, Set membership checks, and deck math fast and simple, and
avoids ever comparing strings during a hot simulation loop.

### Hand evaluation
`evaluator.js` scores a 5-card hand into a `{category, tiebreak[], score}`
where `category` is 0 (High Card) through 8 (Straight Flush). For 7 cards
(hole cards + board), it checks all `C(7,5) = 21` five-card subsets and
keeps the best. The wheel (A-2-3-4-5) is handled as a special case so it's
correctly recognized as the *lowest* straight. All 10 categories, kicker
selection, and split-pot detection are covered by `tests/evaluator.test.js`.

### Equity: two methods, chosen automatically

**Exact enumeration** (`Equity.canEnumerateExact`) is used whenever every
opponent has fully-specified hole cards (not a range, not "random") *and*
there are 3 or fewer unknown board cards. In that case the engine literally
enumerates every possible remaining board (e.g. all `C(44,2)` turn+river
combinations on the flop) and tallies the exact win/tie/lose outcome for
each one. This is not a simulation — it is the true, deterministic answer
given the known cards, verified against known reference numbers (e.g. a
9-out flush draw = 35.0% by the river; AKs vs 99 on a specific flop ≈ 63.5%).

**Monte Carlo simulation** is used whenever any opponent is modeled as a
range or "random" (since that adds a combinatorial dimension too large to
exhaustively enumerate at interactive speed), or preflop with many unknown
board cards. It runs entirely inside a **Web Worker** so the UI thread never
blocks, even at 1,000,000 iterations. Each trial: opponents with a range
sample uniformly from their filtered, still-legal combos; "random"
opponents get two uniformly random remaining cards; the board is completed
with the remaining unknown cards; the showdown is scored; win/tie/share are
tallied. A 95% margin-of-error is reported (`Equity.marginOfError`, a
standard proportion confidence interval) so the app never implies false
precision — this is shown as "Estimated Monte Carlo error: ≈ ±X points."

The Worker is built from an inline source string via a `Blob` URL rather
than a separate script file, specifically so the app keeps working when
opened directly via `file://`, where browsers commonly block
cross-origin/worker script loading from local files. The worker's logic is
a byte-for-byte mirror of the pure-function engine in `equity.js` — verified
identical in testing.

### Win % vs. Equity — not the same thing
- **Win %** — the fraction of outcomes where you win the *entire* pot.
- **Tie %** — the fraction where the pot is split.
- **Equity** — your *expected share* of the pot, i.e. `win% + tie%/N` where N
  is however many ways the pot got split in that outcome. A 3-way chop
  contributes 1/3 to your equity, not a full tie.

The app always shows all three, never conflates them, and never says a
probability "guarantees" anything.

### Outs
`outs.js` defines an "out" as a remaining unseen card that upgrades your
best 5-card **category** (e.g. one pair → two pair, four-to-a-flush →
flush). Pairing an over-card from no-pair is deliberately *not* counted —
it's too unreliable an "improvement" to call a real out. Probabilities use
exact hypergeometric combinatorics:
- 1 card to come: `outs / unseen`
- 2 cards to come: `1 − C(unseen−outs, 2) / C(unseen, 2)`

This avoids the classic "outs × 2" / "outs × 4" shortcut, which is only an
approximation — the app computes the real number instead.

### Pot odds & EV
`potOdds.js`: `requiredEquity = call / (pot + bet + call)`, where `pot` is
the pot *before* the opponent's current bet. `ev.js`:
`EV(call) = equity*(pot+bet) − (1−equity)*call`. This is a **single-street,
no-fold-equity model** — it does not know about future betting rounds or
whether your opponent might fold to a raise. Every EV figure the UI shows
lists these assumptions right next to the number rather than hiding them.

### Decision engine
`decision.js` compares your equity to the required equity (when facing a
bet) and returns an action plus a list of labeled reasons:
- `fact` — a directly-computed mathematical fact (pot odds, EV)
- `heuristic` — a style/sizing judgment call, not a hard rule (e.g. whether
  to raise for value)
- `uncertain` — flags when an opponent was modeled as "random" or a very
  wide range, which materially widens the real-world error bars
- `disclaimer` — every single recommendation ends with an explicit
  "this is an estimate, not a guarantee" statement

### Ranges
`ranges.js` implements the standard 169-hand / 1,326-combo range matrix
(13 pairs × 6 combos, 78 suited × 4 combos, 78 offsuit × 12 combos — this
identity is asserted in `tests/ranges.test.js`). It supports clicking
individual cells, Top-X% presets (a simple, clearly-labeled heuristic
ordering — not a claim of GTO correctness), and standard text notation
(`AA,KK,QQ,AKs,AQs,JJ-TT,88+`).

## Audio
Off by default. When enabled in Settings, `audio.js` uses the browser's
built-in `SpeechSynthesis` API to read out equity/required-equity/action in
one of three verbosity levels (Short/Normal/Detailed), plus a few short
generated UI tones (no audio files). If speech synthesis isn't available,
voice guidance silently does nothing rather than throwing errors.

## History & Share
`storage.js` saves up to 100 past calculations to `localStorage` (view/
delete/clear all, no account, nothing leaves your device). It's written to
**fail safe**: if `localStorage` is unavailable or throws (some browsers
restrict it for `file://` pages), the app falls back to in-memory state for
that session instead of crashing.

"Copy shareable link" in Settings base64-encodes your current scenario
(cards, board, table setup, opponent settings) into a URL fragment
(`#s=...`) — nothing is sent to a server; opening the link just re-parses
that fragment client-side.

## Known limitations
- EV modeling is single-street and assumes no fold equity — it will not
  tell you the "correct" bluff-raise size, because that depends on your
  opponent's real fold frequency, which cannot be measured from cards alone.
- "Top X%" range presets and the position dropdown are simple, editable
  heuristics for convenience, not a claim that any specific range is
  optimal or universally correct for a given position.
- Very large Monte Carlo runs (500k–1,000,000 iterations) with several
  range-based opponents can take a few seconds even off the main thread,
  since the evaluator favors clarity/correctness over maximum raw
  throughput (no bitwise lookup tables). Lower the simulation count in
  Settings if you want faster iteration.
- Dead-card marking is supported in the underlying engine (`state.dead`)
  but does not yet have a dedicated picker UI — a natural place to extend
  the app.

## Modifying the code
Every module is a small, dependency-free UMD file (works via `<script>` tag
in the browser and via `require()` in Node for testing) exporting a plain
object of functions — there's no framework, build step, or bundler to fight
with. To change hand-ranking or equity logic, edit `js/evaluator.js` /
`js/equity.js` **and** the matching inline copy inside the
`WORKER_SOURCE` template string in `js/simulation.js` (kept in sync by
hand — this is called out at the top of that file), then re-run
`node tests/run-all.js` to confirm nothing regressed.
