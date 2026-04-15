/* ═══════════════════════════════════════
   INN.JS — Inn management & upgrades
═══════════════════════════════════════ */

function upgradeCost(id) {
  return DEFS[id].baseCost * (state.locs[id].level + 1);
}

function refreshLocation(id) {
  const el = document.querySelector(`.location[data-id="${id}"]`);
  const lvl = state.locs[id].level;
  for (let i = 0; i <= MAX_LVL; i++) el.classList.remove(`lv${i}`);
  if (lvl > 0) el.classList.add(`lv${lvl}`);
  el.querySelector('.loc-level').textContent = `Lv ${lvl}${lvl === MAX_LVL ? ' ★' : ''}`;
}

function refreshInfoPanel() {
  const infoEl = document.getElementById('info-panel');
  const id = state.selected;
  if (!id) {
    infoEl.innerHTML = '<p class="welcome-msg">Welcome, Inn Keeper! Select a location to manage it, or venture into the dungeon for gold.</p>';
    return;
  }
  const def = DEFS[id], lvl = state.locs[id].level;
  const cost = upgradeCost(id), maxed = lvl >= MAX_LVL;
  const pips = Array.from({ length: MAX_LVL }, (_, i) =>
    `<div class="level-pip ${i < lvl ? 'filled' : ''}"></div>`).join('');
  infoEl.innerHTML = `
    <div class="info-content">
      <div class="info-title">${def.icon} ${def.name}</div>
      <div class="info-desc">${def.desc}</div>
      <div class="info-stats">Level ${lvl} / ${MAX_LVL} &nbsp;·&nbsp; Earns ${def.income * lvl} gold / tick</div>
      <div class="level-bar">${pips}</div>
    </div>
    <button class="upgrade-btn" id="upgrade-btn" ${maxed || state.gold < cost ? 'disabled' : ''}>
      ${maxed ? '★ Maxed Out' : `Upgrade<br><small>${cost} Gold</small>`}
    </button>`;
  if (!maxed) {
    document.getElementById('upgrade-btn').addEventListener('click', () => doUpgrade(id));
  }
}

function doUpgrade(id) {
  const cost = upgradeCost(id);
  if (state.gold < cost || state.locs[id].level >= MAX_LVL) return;
  setGold(state.gold - cost);
  state.locs[id].level++;
  refreshLocation(id);
  refreshInfoPanel();
  addLog(`🔨 ${DEFS[id].name} upgraded to Level ${state.locs[id].level}!`, 'upgrade');
  scheduleSave();
}

function selectLocation(id) {
  document.querySelectorAll('.location').forEach(el => el.classList.remove('selected'));
  state.selected = (state.selected === id) ? null : id;
  if (state.selected) document.querySelector(`.location[data-id="${id}"]`).classList.add('selected');
  refreshInfoPanel();
}

/* ── Wire location clicks ── */
document.querySelectorAll('.location').forEach(el =>
  el.addEventListener('click', () => selectLocation(el.dataset.id)));

/* ── Active expedition pills on the inn page ── */
function refreshInnExpeditionStatus() {
  const el = document.getElementById('inn-expedition-status');
  if (!el) return;

  if (!state.activeRuns || state.activeRuns.length === 0) {
    el.innerHTML = '';
    return;
  }

  // Remove pills whose runs have ended — never touch pills that still exist
  const liveIds = new Set(state.activeRuns.map(r => r.id));
  el.querySelectorAll('.inn-run-pill').forEach(p => {
    if (!liveIds.has(p.dataset.runId)) p.remove();
  });

  state.activeRuns.forEach(run => {
    const alive = run.party.filter(m => m.status !== 'incapacitated').length;
    const phaseIcons = { traveling:'🥾', returning:'🏠', done:'✅', resting:'🏕️' };
    const pIcon = run.paused ? '⏸️' : (phaseIcons[run.phase] ?? '🥾');
    const label = (run.party[0]?.name.split(' ')[0] ?? 'Party') + "'s party";

    // Reuse the existing pill element so click listeners are never destroyed
    let pill = el.querySelector(`.inn-run-pill[data-run-id="${run.id}"]`);
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'inn-run-pill';
      pill.dataset.runId = run.id;
      pill.title = 'Click to watch this expedition';
      pill.addEventListener('click', () => watchRun(run.id));
      el.appendChild(pill);
    }
    // Only update the text — the element itself stays in the DOM
    pill.innerHTML = `${pIcon} ${label} F${run.floor} &nbsp;💛${alive} &nbsp;💰${run.goldEarned}g`;
  });
}

/* ── Passive income tick ── */
setInterval(() => {
  const income = Object.entries(state.locs)
    .reduce((sum, [id, loc]) => sum + DEFS[id].income * loc.level, 0);
  if (income > 0) {
    setGold(state.gold + income);
    addLog(`💰 The inn earned ${income} gold from patrons.`, 'gold');
    refreshInfoPanel();
    scheduleSave();
  }
  refreshInnExpeditionStatus();
}, TICK_MS);

