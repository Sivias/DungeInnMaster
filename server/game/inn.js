/* ═══════════════════════════════════════════════════════
   INN.JS — Inn upgrade logic and passive income engine
   Pure game logic — UI calls are typeof-guarded so this
   module is safe to require() on a Node.js server.
═══════════════════════════════════════════════════════ */

/* ── Node.js: load dependencies if not available as globals ── */
if (typeof require !== 'undefined' && typeof state === 'undefined') {
  var { DEFS }                    = require('./data');   // eslint-disable-line no-var
  var { state, MAX_LVL, TICK_MS } = require('./state');  // eslint-disable-line no-var
}

/* ── Upgrade cost at the next level ── */
function upgradeCost(id) {
  return DEFS[id].baseCost * (state.locs[id].level + 1);
}

/* ── Apply an upgrade and return a result object ── */
function doUpgrade(id) {
  const cost = upgradeCost(id);
  if (state.gold < cost || state.locs[id].level >= MAX_LVL) {
    return { success: false, reason: 'insufficient_gold_or_maxed' };
  }
  state.gold -= cost;
  typeof setGold === 'function' && setGold(state.gold); // sync DOM in browser
  state.locs[id].level++;
  const level = state.locs[id].level;
  typeof addLog === 'function' && addLog(`🔨 ${DEFS[id].name} upgraded to Level ${level}!`, 'upgrade');
  return { success: true, locationId: id, level, gold: state.gold };
}

/* ── Sum passive income from all locations ── */
function getInnIncome() {
  return Object.entries(state.locs)
    .reduce((sum, [id, loc]) => sum + DEFS[id].income * loc.level, 0);
}

/* ── Passive income tick (server-side: replace with a scheduled job) ── */
setInterval(() => {
  const income = getInnIncome();
  if (income > 0) {
    typeof setGold === 'function' && setGold(state.gold + income);
    typeof addLog  === 'function' && addLog(`💰 The inn earned ${income} gold from patrons.`, 'gold');
    typeof refreshInfoPanel === 'function' && refreshInfoPanel();
  }
  typeof refreshInnExpeditionStatus === 'function' && refreshInnExpeditionStatus();
}, TICK_MS);

/* ── Node.js export ── */
if (typeof module !== 'undefined') {
  module.exports = { upgradeCost, doUpgrade, getInnIncome };
}

