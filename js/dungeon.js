/* ═══════════════════════════════════════
   DUNGEON.JS — Party selection & expeditions
═══════════════════════════════════════ */

let applicants = [];
let partyIds   = [];
let applicantSort     = 'default';
let applicantSortReversed = false;
let _sortBarReady     = false;
let _applicantRosterLevel = -1;  // guest room level at last full generation

/* ── Hire cost: rarity base + power × 2  (returning survivors are always free) ── */
function _hireCost(app) {
  if (app.returning) return 0;
  const base = { common: 5, uncommon: 15, rare: 35, epic: 65, legendary: 110 };
  return (base[app.rarity.id] ?? 5) + app.power * 2;
}

/* ── Add run survivors back to the front of the applicant pool at zero cost ── */
function addReturningAdventurers(survivors) {
  const returnees = survivors.map(m => ({
    id:        m.id,
    name:      m.name,
    cls:       m.cls,
    rarity:    m.rarity,
    power:     m.power,
    maxHp:     m.maxHp,
    returning: true,
  }));
  // Remove stale copies of these IDs first (handles multi-run edge cases)
  applicants = applicants.filter(a => !returnees.some(r => r.id === a.id));
  // Prepend so they appear first in the default sort
  applicants = [...returnees, ...applicants];
  renderApplicantGrid();
  _updateApplicantLabel();
  scheduleSave();
}

/* ── Rarity picker ── */
function pickRarity(guestLv) {
  const w = RARITY_WEIGHTS[Math.min(guestLv, 5)];
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return RARITIES[i]; }
  return RARITIES[0];
}

/* ── Applicant generator ── */
function generateApplicant(guestLv) {
  const rarity = pickRarity(guestLv);
  const cls    = CLASSES[Math.floor(Math.random() * CLASSES.length)];
  const name   = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${EPITHETS[Math.floor(Math.random() * EPITHETS.length)]}`;
  const power  = Math.floor(Math.random() * (rarity.range[1] - rarity.range[0] + 1)) + rarity.range[0];
  const maxHp  = Math.floor(cls.baseHp * rarity.hpMult + power * 3);
  return { id: Math.random().toString(36).slice(2, 9), name, cls, rarity, power, maxHp };
}

/* ── Open dungeon gate ── */
let _dungeonTickId = null;

function showDungeonPage() {
  showPage('dungeon-page');
  _initSortBar();
  refreshDungeonPage();
  // Start lightweight bar-only tick; clear any previous one first
  if (_dungeonTickId) clearInterval(_dungeonTickId);
  _dungeonTickId = setInterval(_tickRunBars, 500);
}

function hideDungeonPage() {
  if (_dungeonTickId) { clearInterval(_dungeonTickId); _dungeonTickId = null; }
}

/* ── Wire up sort bar once ── */
function _initSortBar() {
  if (_sortBarReady) return;
  _sortBarReady = true;
  const bar = document.getElementById('sort-bar');
  if (bar) {
    bar.addEventListener('click', e => {
      const btn = e.target.closest('.sort-btn');
      if (!btn) return;
      const newSort = btn.dataset.sort;
      if (newSort === applicantSort) {
        applicantSortReversed = !applicantSortReversed;
      } else {
        applicantSort = newSort;
        applicantSortReversed = false;
      }
      bar.querySelectorAll('.sort-btn').forEach(b => {
        b.classList.toggle('active', b === btn && !applicantSortReversed);
        b.classList.toggle('active-reversed', b === btn && applicantSortReversed);
      });
      renderApplicantGrid();
    });
  }

  // One-time: allow dropping party members back into the applicant grid to remove them
  const grid = document.getElementById('applicant-grid');
  if (grid) {
    grid.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    grid.addEventListener('dragenter', e => { e.preventDefault(); grid.classList.add('drag-over-grid'); });
    grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) grid.classList.remove('drag-over-grid'); });
    grid.addEventListener('drop', e => {
      e.preventDefault();
      grid.classList.remove('drag-over-grid');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId && partyIds.includes(draggedId)) toggleMember(draggedId);
    });
  }

}

/* ── Full dungeon page refresh ── */
function refreshDungeonPage() {
  renderActiveRuns();

  const canDeploy = state.activeRuns.length < maxParties();
  const deploySection = document.getElementById('deploy-section');
  const limitMsg = document.getElementById('hearth-limit-msg');

  if (canDeploy) {
    if (deploySection) deploySection.style.display = '';
    if (limitMsg) limitMsg.textContent = '';

    // Generate fresh roster on first visit; top up if Guest Room was upgraded
    if (applicants.length === 0) {
      _generateApplicants();
    } else {
      _topUpApplicants();
    }

    renderPartySlots();
    renderApplicantGrid();
    updateVentureBtn();
  } else {
    if (deploySection) deploySection.style.display = 'none';
    if (limitMsg) limitMsg.textContent =
      `🔥 Hearth limit reached (${state.activeRuns.length}/${maxParties()} parties). Upgrade the Hearth to deploy more.`;
  }
}

/* ── Generate (or regenerate) the applicant pool ── */
function _generateApplicants() {
  const guestLv = state.locs.guestroom.level;
  const count   = 4 + guestLv * 2;
  applicants            = Array.from({ length: count }, () => generateApplicant(guestLv));
  _applicantRosterLevel = guestLv;
  _updateApplicantLabel();
}

/* ── Top up the roster when Guest Room has been upgraded since last generation ── */
function _topUpApplicants() {
  const guestLv = state.locs.guestroom.level;
  if (guestLv <= _applicantRosterLevel) return;          // no change needed
  const levelsGained = guestLv - _applicantRosterLevel;
  const toAdd        = levelsGained * 2;                 // 2 extra slots per level
  for (let i = 0; i < toAdd; i++) applicants.push(generateApplicant(guestLv));
  _applicantRosterLevel = guestLv;
  _updateApplicantLabel();
}

function _updateApplicantLabel() {
  const lbl = document.getElementById('applicant-label');
  if (!lbl) return;
  const available = applicants.filter(a => !partyIds.includes(a.id)).length;
  lbl.textContent = `Adventurers seeking work — Guest Room Lv ${_applicantRosterLevel} (${available} available)`;
}

/* ── Re-roll cost: per new adventurer generated, scales with Guest Room level ── */
function _rerollCostPer() {
  return 2 + state.locs.guestroom.level;
}

/* ── How many adventurers would a re-roll generate right now ── */
function _rerollNewCount() {
  const guestLv   = state.locs.guestroom.level;
  const targetTotal = 4 + guestLv * 2;
  // Keep returning veterans and any currently-hired party members
  const kept = applicants.filter(a => a.returning || partyIds.includes(a.id));
  return Math.max(0, targetTotal - kept.length);
}

/* ── Spend gold to refresh non-returning applicants ── */
function rerollApplicants() {
  const newCount = _rerollNewCount();
  const rollCost = newCount * _rerollCostPer();

  if (newCount === 0) {
    addLog(`🎲 No new adventurers needed — your returning veterans fill the roster!`, 'dungeon');
    return;
  }
  if (state.gold < rollCost) {
    addLog(`❌ Not enough gold to re-roll! Need ${rollCost}g (${newCount} × ${_rerollCostPer()}g).`, 'dungeon');
    return;
  }

  setGold(state.gold - rollCost);

  // Keep returning veterans and hired party members; replace everyone else
  const guestLv = state.locs.guestroom.level;
  applicants = applicants.filter(a => a.returning || partyIds.includes(a.id));
  for (let i = 0; i < newCount; i++) applicants.push(generateApplicant(guestLv));

  renderPartySlots();
  renderApplicantGrid();
  updateVentureBtn();
  addLog(`🎲 ${newCount} new adventurer${newCount > 1 ? 's' : ''} arrive${newCount === 1 ? 's' : ''} at the inn. (−${rollCost}g)`, 'gold');
  scheduleSave();
}

/* ── Strip deployed members from pool after venturing ── */
function postDeploy() {
  applicants = applicants.filter(a => !partyIds.includes(a.id));
  partyIds   = [];
  scheduleSave();
}

/* ── Compute bar % for a run (shared by full render + tick) ── */
function _runBarPct(run) {
  if (run.pendingReward) return 100;
  if (run.phase === 'returning' && run.returnDuration > 0)
    return Math.max(0, 100 - ((Date.now() - run.returnStartTime) / run.returnDuration) * 100);
  if (run.encRoomsCleared >= ROOMS_PER_FLOOR) return 100;
  return Math.min(99, ((Date.now() - run.floorStartTime) / FLOOR_ESTIMATED_MS) * 100);
}

/* ── Phase label text for a run card ── */
function _runPhaseText(run) {
  if (run.paused) return { icon: '⏸️', text: `F${run.floor} — Paused · Tap to resume` };
  if (run.pendingReward) return { icon: run.pendingReward.icon, text: run.pendingReward.title };
  const enc = run.currentEncounter;
  if (enc && run.encounterActive) return { icon: enc.icon, text: enc.name };
  const phaseIcons = { traveling:'🥾', returning:'🏠', done:'✅', resting:'🏕️' };
  const icon = phaseIcons[run.phase] ?? '🥾';
  const text = { traveling: run.encRoomsCleared >= ROOMS_PER_FLOOR
                               ? `F${run.floor} cleared`
                               : `F${run.floor} · Rm ${run.encRoomsCleared + 1}/${ROOMS_PER_FLOOR}`,
                 resting:   `F${run.floor} cleared`,
                 returning: 'Returning',
                 done:      'Done' }[run.phase] ?? `Floor ${run.floor}`;
  return { icon, text };
}

/* ── Active expeditions panel — full DOM build, called when run list changes ── */
function renderActiveRuns() {
  const container = document.getElementById('active-runs-container');
  if (!container) return;

  if (state.activeRuns.length === 0) {
    container.innerHTML = '<p class="no-runs-msg">No active expeditions — deploy a party to begin!</p>';
    return;
  }

  container.innerHTML = '';
  state.activeRuns.forEach(run => {
    const card = document.createElement('div');
    card.dataset.runId = run.id;

    const alive = run.party.filter(m => m.status !== 'incapacitated').length;
    const total = run.party.length;
    const icons = run.party.map(m =>
      `<span class="run-member-icon ${m.status==='incapacitated'?'dead':m.status==='wounded'?'wounded':''}">${m.cls.icon}</span>`
    ).join('');

    const isPending = !!run.pendingReward;
    const health = run.party.some(m => m.status === 'incapacitated') ? 'card-danger'
                 : run.party.some(m => m.status === 'wounded')       ? 'card-wounded'
                 : 'card-healthy';
    card.className = `run-card ${health}${isPending ? ' card-pending' : ''}`;

    const { icon: phaseIcon, text: phaseText } = _runPhaseText(run);
    const bar = _runBarPct(run).toFixed(1);
    const watchLabel = isPending ? '📬 Claim' : '👁 Watch';

    card.innerHTML = `
      <div class="run-card-icons">${icons}</div>
      <div class="run-card-info">
        <div class="run-card-phase">${phaseIcon} ${phaseText}</div>
        <div class="run-card-stats">💛 ${alive}/${total} alive &nbsp;·&nbsp; 💰 ${isPending ? run.pendingReward.gold : run.goldEarned}g</div>
        <div class="run-mini-bar-bg"><div class="run-mini-bar-fill" style="width:${bar}%"></div></div>
      </div>
      <button class="watch-btn">${watchLabel}</button>`;
    card.querySelector('.watch-btn').addEventListener('click', () => watchRun(run.id));
    container.appendChild(card);
  });
}

/* ── Lightweight tick: only update bar widths on existing cards ── */
function _tickRunBars() {
  const container = document.getElementById('active-runs-container');
  if (!container) return;
  state.activeRuns.forEach(run => {
    const card = container.querySelector(`[data-run-id="${run.id}"]`);
    if (!card) return;
    const fill = card.querySelector('.run-mini-bar-fill');
    if (fill) fill.style.width = _runBarPct(run).toFixed(1) + '%';
  });
}

/* ── Applicant card grid ── */
function renderApplicantGrid() {
  const grid = document.getElementById('applicant-grid');
  if (!grid) return;
  grid.innerHTML = '';

  _updateApplicantLabel();

  // Sort a shallow copy — never mutate the source array
  const sorted = [...applicants];
  if (applicantSort === 'cost') {
    sorted.sort((a, b) => _hireCost(a) - _hireCost(b));
  } else if (applicantSort === 'class') {
    sorted.sort((a, b) => a.cls.name.localeCompare(b.cls.name));
  } else if (applicantSort === 'power') {
    sorted.sort((a, b) => b.power - a.power);
  } else {
    // Default: returning veterans always first, then original insertion order
    sorted.sort((a, b) => (b.returning ? 1 : 0) - (a.returning ? 1 : 0));
  }
  if (applicantSortReversed) sorted.reverse();

  sorted.forEach(app => {
    if (partyIds.includes(app.id)) return;   // already in party — hide from list
    const cost       = _hireCost(app);       // 0 for returning veterans
    const affordable = app.returning || state.gold >= cost;
    const card = document.createElement('div');
    card.className = `applicant-card${affordable ? '' : ' unaffordable'}${app.returning ? ' returning-veteran' : ''}`;
    const pct = Math.round((app.power / 25) * 100);
    card.innerHTML = `
      <div class="app-icon">${app.cls.icon}</div>
      <div class="app-name">${app.name}</div>
      <div class="app-class">${app.cls.name}</div>
      <span class="rarity-badge ${app.rarity.cls}">${app.rarity.label}</span>
      <div class="app-ability" title="${app.cls.ability.desc}">✦ ${app.cls.ability.name}</div>
      <div class="power-row">
        <span class="power-label">PWR</span>
        <div class="power-bar-bg"><div class="power-bar-fill" style="width:${pct}%"></div></div>
        <span class="power-value">${app.power}</span>
      </div>
      <div class="app-cost${affordable ? '' : ' unaffordable'}">${app.returning ? '🔄 Free' : `💰 ${cost}g`}</div>`;
    card.addEventListener('click', () => toggleMember(app.id));
    // Drag from grid
    card.draggable = true;
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', app.id);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    grid.appendChild(card);
  });
}

/* ── Party slot row ── */
function renderPartySlots() {
  const slotsEl = document.getElementById('party-slots');
  if (!slotsEl) return;
  slotsEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const memberId = partyIds[i];
    const member   = memberId ? applicants.find(a => a.id === memberId) : null;
    const slot     = document.createElement('div');
    slot.className = `party-slot ${member ? 'filled' : 'empty'}`;
    if (member) {
      slot.style.borderColor = member.rarity.color;
      slot.innerHTML = `
        <span class="slot-remove" title="Remove">✕</span>
        <div class="slot-icon">${member.cls.icon}</div>
        <div class="slot-name">${member.name.split(' ')[0]}</div>
        <span class="rarity-badge ${member.rarity.cls}" style="font-size:0.5rem">${member.rarity.label}</span>`;
      slot.querySelector('.slot-remove').addEventListener('click', e => {
        e.stopPropagation(); toggleMember(memberId);
      });
      // Drag filled slot for reordering
      slot.draggable = true;
      slot.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', memberId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => slot.classList.add('dragging'), 0);
      });
      slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
    } else {
      slot.innerHTML = `<div class="slot-empty">Drop here</div>`;
    }
    // All slots accept drops
    slot.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    slot.addEventListener('dragenter', e => { e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', e => { if (!slot.contains(e.relatedTarget)) slot.classList.remove('drag-over'); });
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId) _dropOnSlot(draggedId, i);
    });
    slotsEl.appendChild(slot);
  }
  const pc = document.getElementById('party-count');
  if (pc) pc.textContent = partyIds.length;
}

/* ── Clear entire party ── */
function clearParty() {
  if (partyIds.length === 0) return;
  const refund = partyIds.reduce((s, id) => {
    const app = applicants.find(a => a.id === id);
    return s + (app ? _hireCost(app) : 0);
  }, 0);
  if (refund > 0) setGold(state.gold + refund);
  partyIds = [];
  renderPartySlots();
  renderApplicantGrid();
  updateVentureBtn();
}

function toggleMember(id) {
  const idx = partyIds.indexOf(id);
  if (idx !== -1) {
    // Remove — refund hire cost
    partyIds.splice(idx, 1);
    const app = applicants.find(a => a.id === id);
    if (app) setGold(state.gold + _hireCost(app));
  } else {
    if (partyIds.length >= 4) return;
    const app = applicants.find(a => a.id === id);
    if (!app) return;
    const cost = _hireCost(app);
    if (state.gold < cost) {
      addLog(`❌ Not enough gold to hire ${app.name.split(' ')[0]}! (Need ${cost}g)`, 'dungeon');
      return;
    }
    partyIds.push(id);
    setGold(state.gold - cost);
  }
  renderPartySlots();
  renderApplicantGrid();
  updateVentureBtn();
}

/* ── Handle a drop onto party slot slotIdx ── */
function _dropOnSlot(draggedId, slotIdx) {
  const currentId = partyIds[slotIdx];
  if (currentId === draggedId) return;          // no-op: same member

  const fromSlot = partyIds.indexOf(draggedId);

  if (fromSlot !== -1 && currentId !== undefined) {
    // Slot-to-slot with both filled: swap — both already hired, no gold change
    partyIds[fromSlot] = currentId;
    partyIds[slotIdx]  = draggedId;
  } else if (fromSlot !== -1) {
    // Slot-to-empty-slot: reorder — no gold change
    partyIds.splice(fromSlot, 1);
    partyIds.splice(Math.min(slotIdx, partyIds.length), 0, draggedId);
  } else if (currentId !== undefined) {
    // Grid-to-filled-slot: swap member — refund old, charge new
    const newApp = applicants.find(a => a.id === draggedId);
    const oldApp = applicants.find(a => a.id === currentId);
    if (!newApp) return;
    const netCost = _hireCost(newApp) - (oldApp ? _hireCost(oldApp) : 0);
    if (netCost > state.gold) {
      addLog(`❌ Not enough gold to hire ${newApp.name.split(' ')[0]}! (Need ${_hireCost(newApp)}g)`, 'dungeon');
      return;
    }
    if (netCost !== 0) setGold(state.gold - netCost);
    partyIds[slotIdx] = draggedId;
  } else {
    // Grid-to-empty-slot: hire new member
    if (partyIds.length >= 4) return;
    const app = applicants.find(a => a.id === draggedId);
    if (!app) return;
    const cost = _hireCost(app);
    if (state.gold < cost) {
      addLog(`❌ Not enough gold to hire ${app.name.split(' ')[0]}! (Need ${cost}g)`, 'dungeon');
      return;
    }
    setGold(state.gold - cost);
    partyIds.push(draggedId);
  }

  renderPartySlots();
  renderApplicantGrid();
  updateVentureBtn();
}

/* ── Venture button state ── */
function updateVentureBtn() {
  const btn = document.getElementById('venture-btn');
  if (!btn) return;

  if (state.activeRuns.length >= maxParties()) {
    btn.disabled = true;
    btn.textContent = `🔥 Hearth limit (${state.activeRuns.length}/${maxParties()})`;
    _updateRerollBtn();
    return;
  }

  const count = partyIds.length;
  const ps    = document.getElementById('party-status');
  if (count >= 1) {
    btn.disabled = false;
    const totalPower = partyIds.reduce((s, id) => s + (applicants.find(a => a.id === id)?.power ?? 0), 0);
    const slots = count === 4 ? 'full party' : `${count} member${count > 1 ? 's' : ''}`;
    btn.textContent = `⚔️ Venture Forth! (${slots} · Power: ${totalPower})`;
    if (ps) ps.textContent = count < 4
      ? `Ready! You may add up to ${4 - count} more member${4 - count > 1 ? 's' : ''}, or venture now.`
      : 'Your party is ready. Steel yourselves!';
  } else {
    btn.disabled = true;
    btn.textContent = 'Select 1–4 Adventurers';
    if (ps) ps.textContent = 'Choose 1–4 adventurers from the list below.';
  }
  _updateRerollBtn();
}

/* ── Keep re-roll button label and disabled state in sync ── */
function _updateRerollBtn() {
  const btn = document.getElementById('reroll-btn');
  if (!btn) return;
  const newCount = _rerollNewCount();
  const cost     = newCount * _rerollCostPer();
  btn.textContent = newCount > 0 ? `🎲 Re-roll ${newCount} (${cost}g)` : `🎲 Re-roll (full)`;
  btn.disabled = newCount === 0 ? false : state.gold < cost;
}

/* ── Get assembled party ── */
function getParty() {
  return partyIds.map(id => applicants.find(a => a.id === id));
}

