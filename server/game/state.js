/* ═══════════════════════════════════════════════════════
   STATE.JS — Game state object and shared timing constants
   No DOM references — safe to run on Node.js unchanged.
   DOM helpers (setGold, addLog, showPage) live in
   client/js/ui-helpers.js and are loaded separately.
═══════════════════════════════════════════════════════ */

/* ── Node.js: load DEFS from data module if not available as a global ── */
if (typeof require !== 'undefined' && typeof DEFS === 'undefined') {
  var { DEFS } = require('./data'); // eslint-disable-line no-var
}

const MAX_LVL = 5;
const TICK_MS = 180_000;  // 3 minutes — passive income interval

/* ── Floor / encounter timing ── */
const ROOMS_PER_FLOOR        = 3;
const REST_HP_RECOVERY_PCT   = 0.30;
const ENCOUNTER_INTERVAL_MIN = 12 * 1000;   // 12 s between rooms
const ENCOUNTER_INTERVAL_MAX = 20 * 1000;   // 20 s between rooms

/* ── Ability buff duration by rarity ── */
const ABILITY_DURATION_MS = {
  common:    60  * 1000,
  uncommon:  75  * 1000,
  rare:      90  * 1000,
  epic:      105 * 1000,
  legendary: 120 * 1000,
};

/* ── Central game state ── */
const state = {
  gold: 50,
  selected: null,
  locs: Object.fromEntries(Object.keys(DEFS).map(k => [k, { level: 0 }])),
  activeRuns:    [],    // array of live run objects
  watchingRunId: null,  // id of run currently displayed on adventure-page
};

/* ── Max simultaneous parties based on Hearth level ── */
function maxParties() {
  return [1, 1, 2, 2, 3, 4][state.locs.hearth.level] ?? 1;
}

/* ── Node.js export ── */
if (typeof module !== 'undefined') {
  module.exports = {
    state, maxParties,
    MAX_LVL, TICK_MS,
    ROOMS_PER_FLOOR, REST_HP_RECOVERY_PCT,
    ENCOUNTER_INTERVAL_MIN, ENCOUNTER_INTERVAL_MAX,
    ABILITY_DURATION_MS,
  };
}

