/* ═══════════════════════════════════════════════════════
   UI-HELPERS.JS — DOM bridges for game state changes
   Loaded BEFORE server/game/*.js so those files can call
   these as unguarded globals in the browser.
   On a real Node.js server these are replaced by WebSocket
   broadcast / REST response helpers — never loaded here.
═══════════════════════════════════════════════════════ */

/* ── Update gold amount and all gold displays ── */
function setGold(n) {
  state.gold = n;
  ['gold-amount', 'gold-amount-d', 'gold-amount-a'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  });
  // Sync dungeon affordability indicators without a full grid re-render
  if (document.getElementById('reroll-btn') && typeof _updateRerollBtn === 'function') {
    _updateRerollBtn();
  }
}

/* ── Append a message to all general event logs ── */
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

/* ── Append a message to the battle log of the watched run only ── */
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

/* ── Show a named page, hide all others ── */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

