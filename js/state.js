/* ═══════════════════════════════════════
   STATE.JS — Shared game state & helpers
═══════════════════════════════════════ */

const MAX_LVL = 5;
const TICK_MS = 180_000;  // 3 minutes

/* ── Floor / encounter timing ── */
const ROOMS_PER_FLOOR        = 3;               // encounter rooms per floor (matches renderer rooms 1-3)
const REST_HP_RECOVERY_PCT   = 0.30;            // fraction of missing HP recovered at rest
const ENCOUNTER_INTERVAL_MIN = 12 * 1000;       // min 12 s between room encounters
const ENCOUNTER_INTERVAL_MAX = 20 * 1000;       // max 20 s between room encounters
// Estimated ms for one floor: intro walk (avg 10.5s) + 3 rooms × (avg encounter interval 16s + ~4s combat/walk)
const FLOOR_ESTIMATED_MS = 10_500 + ROOMS_PER_FLOOR * ((ENCOUNTER_INTERVAL_MIN + ENCOUNTER_INTERVAL_MAX) / 2 + 4_000); // ≈ 70 500 ms

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
  goldExpanded: false,  // true when user has manually expanded the collapsed gold pill
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
let _goldAutoCollapseTimer = null;

function setGold(n) {
  const delta = n - state.gold;
  const wasCollapsed = !state.goldExpanded;

  state.gold = n;
  ['gold-amount', 'gold-amount-d', 'gold-amount-a'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });

  // If gold actually changed (not initial render), auto-expand and animate
  if (delta !== 0) {
    // Temporarily expand
    state.goldExpanded = true;

    // Show floating delta text on all visible gold displays
    document.querySelectorAll('.gold-display').forEach(el => {
      // Skip buttons inside a hidden page (offsetParent is always null for fixed elements)
      if (!el.closest('.hidden')) {
        _spawnGoldDelta(el, delta);
      }
    });

    // Reset any existing auto-collapse timer
    if (_goldAutoCollapseTimer) clearTimeout(_goldAutoCollapseTimer);

    // If it was collapsed before, auto-collapse after 2.5 s
    if (wasCollapsed) {
      _goldAutoCollapseTimer = setTimeout(() => {
        state.goldExpanded = false;
        document.querySelectorAll('.gold-display').forEach(el => {
          el.classList.add('gold-collapsed');
        });
        _goldAutoCollapseTimer = null;
      }, 2500);
    }
  }

  const shouldCollapse = !state.goldExpanded;
  document.querySelectorAll('.gold-display').forEach(el => {
    el.classList.toggle('gold-collapsed', shouldCollapse);
    el.setAttribute('aria-label', `Gold: ${n}`);
  });
  // Keep lightweight dungeon affordability UI in sync without forcing a full grid re-render.
  if (document.getElementById('reroll-btn')) _updateRerollBtn();
}

/* ── Spawn a floating +/- delta label near a gold display button ── */
function _spawnGoldDelta(anchorEl, delta) {
  const label = document.createElement('span');
  label.className = 'gold-delta-pop' + (delta > 0 ? ' gold-delta-gain' : ' gold-delta-loss');
  label.textContent = (delta > 0 ? '+' : '') + delta;
  // Anchor to the button's right edge so the label always sits to the left of it,
  // even as the pill expands leftward from its fixed right position.
  const rect = anchorEl.getBoundingClientRect();
  label.style.top   = (rect.top + window.scrollY + rect.height / 2) + 'px';
  label.style.right = (window.innerWidth - rect.left + 8) + 'px';
  document.body.appendChild(label);
  label.addEventListener('animationend', () => label.remove());
}

/* ── Toggle the gold pill between collapsed (circle) and expanded ── */
function toggleGoldDisplay() {
  state.goldExpanded = !state.goldExpanded;
  setGold(state.gold);
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
  // Stop the dungeon tick whenever we leave that page
  if (id !== 'dungeon-page' && typeof hideDungeonPage === 'function') hideDungeonPage();
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

