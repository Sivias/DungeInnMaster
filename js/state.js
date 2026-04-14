/* ═══════════════════════════════════════
   STATE.JS — Shared game state & helpers
═══════════════════════════════════════ */

const MAX_LVL = 5;
const TICK_MS = 180_000;  // 3 minutes

/* ── Floor timing (ms) ── */
const TOTAL_RUN_MS           = 5 * 60 * 1000;  // 5 minute run
const RETURN_WALK_MS         = 28 * 1000;       // 28 sec return walk at end
const ENCOUNTER_INTERVAL_MIN = 12 * 1000;       // min 12 s between encounters
const ENCOUNTER_INTERVAL_MAX = 20 * 1000;       // max 20 s between encounters

/* ── Ability buff duration by rarity (up to 2 min) ── */
const ABILITY_DURATION_MS = {
  common:    60  * 1000,   // 1 min
  uncommon:  75  * 1000,   // 1.25 min
  rare:      90  * 1000,   // 1.5 min
  epic:      105 * 1000,   // 1.75 min
  legendary: 120 * 1000,   // 2 min
};

const state = {
  gold: 50,
  selected: null,
  locs: Object.fromEntries(Object.keys(DEFS).map(k => [k, { level: 0 }])),
  activeRuns:    [],    // array of live run objects
  watchingRunId: null,  // id of the run currently shown in adventure-page
};

/* ── Max simultaneous parties based on Hearth level ── */
function maxParties() {
  return [1, 1, 2, 2, 3, 4][state.locs.hearth.level] ?? 1;
}

/* ── Update gold across all displays ── */
function setGold(n) {
  state.gold = n;
  ['gold-amount', 'gold-amount-d', 'gold-amount-a'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });
  // Keep lightweight dungeon affordability UI in sync without forcing a full grid re-render.
  if (document.getElementById('reroll-btn')) _updateRerollBtn();
}

/* ── Append to all visible event logs (general/global events) ── */
function addLog(msg, type = '') {
  ['event-log', 'event-log-d', 'event-log-a'].forEach(id => {
    const log = document.getElementById(id);
    if (!log) return;
    const div = document.createElement('div');
    div.className = 'log-entry' + (type ? ' ' + type : '');
    div.textContent = msg;
    log.prepend(div);
    while (log.children.length > 25) log.removeChild(log.lastChild);
  });
}

/* ── Append ONLY to the battle log, and ONLY for the currently watched run ── */
function addCombatLog(run, msg, type = '', subtype = '') {
  if (!run || run.id !== state.watchingRunId) return;
  const log = document.getElementById('event-log-a');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'log-entry' + (type ? ' ' + type : '') + (subtype ? ' ' + subtype : '');
  div.textContent = msg;
  log.prepend(div);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

/* ── Page navigation ── */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

