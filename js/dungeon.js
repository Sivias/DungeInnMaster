/* ═══════════════════════════════════════
   DUNGEON.JS — Party selection & expeditions
═══════════════════════════════════════ */

let applicants = [];
let partyIds   = [];
let applicantSort = 'default';
let _sortBarReady = false;

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
function showDungeonPage() {
  showPage('dungeon-page');
  _initSortBar();
  refreshDungeonPage();
}

/* ── Wire up sort bar once ── */
function _initSortBar() {
  if (_sortBarReady) return;
  _sortBarReady = true;
  const bar = document.getElementById('sort-bar');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    applicantSort = btn.dataset.sort;
    bar.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderApplicantGrid();
  });
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

    // Only generate a fresh roster if none exists yet
    if (applicants.length === 0) _generateApplicants();

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
  applicants    = Array.from({ length: count }, () => generateApplicant(guestLv));
  _updateApplicantLabel();
}

function _updateApplicantLabel() {
  const lbl = document.getElementById('applicant-label');
  if (!lbl) return;
  const guestLv  = state.locs.guestroom.level;
  const available = applicants.filter(a => !partyIds.includes(a.id)).length;
  lbl.textContent = `Adventurers seeking work — Guest Room Lv ${guestLv} (${available} available)`;
}

/* ── Re-roll cost scales with Guest Room level ── */
function _rerollCost() {
  return 10 + state.locs.guestroom.level * 5;
}

/* ── Spend gold to refresh the adventurer roster ── */
function rerollApplicants() {
  const cost = _rerollCost();
  if (state.gold < cost) {
    addLog(`❌ Not enough gold to re-roll! Need ${cost}g.`, 'dungeon');
    return;
  }
  setGold(state.gold - cost);
  partyIds = [];
  _generateApplicants();
  renderPartySlots();
  renderApplicantGrid();
  updateVentureBtn();
  addLog(`🎲 A new batch of adventurers arrives at the inn. (−${cost}g)`, 'gold');
}

/* ── Strip deployed members from pool after venturing ── */
function postDeploy() {
  applicants = applicants.filter(a => !partyIds.includes(a.id));
  partyIds   = [];
}

/* ── Active expeditions panel ── */
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
    card.className = 'run-card';

    const alive = run.party.filter(m => m.status !== 'incapacitated').length;
    const total = run.party.length;
    const icons = run.party.map(m =>
      `<span class="run-member-icon ${m.status==='incapacitated'?'dead':m.status==='wounded'?'wounded':''}">${m.cls.icon}</span>`
    ).join('');

    const enc = run.currentEnc >= 0 ? run.encounters[run.currentEnc] : null;
    const phaseIcons = { traveling:'🥾', returning:'🏠', done:'✅', fighting:'⚔️', discovering:'👁️', 'ability-window':'⚡' };
    const phaseIcon = phaseIcons[run.phase] ?? '🥾';
    const phaseText = enc && ['discovering','ability-window','fighting'].includes(run.phase)
      ? `${enc.icon} ${enc.name}` : { traveling:'Traveling', returning:'Returning', done:'Done' }[run.phase] ?? 'Traveling';

    // Elapsed mini-bar
    const elapsed = Date.now() - run.startTime;
    const bar = Math.min(100, (elapsed / TOTAL_RUN_MS * 100)).toFixed(0);

    card.innerHTML = `
      <div class="run-card-icons">${icons}</div>
      <div class="run-card-info">
        <div class="run-card-phase">${phaseIcon} ${phaseText}</div>
        <div class="run-card-stats">💛 ${alive}/${total} alive &nbsp;·&nbsp; 💰 ${run.goldEarned}g</div>
        <div class="run-mini-bar-bg"><div class="run-mini-bar-fill" style="width:${bar}%"></div></div>
      </div>
      <button class="watch-btn">👁 Watch</button>`;
    card.querySelector('.watch-btn').addEventListener('click', () => watchRun(run.id));
    container.appendChild(card);
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
  if (applicantSort === 'rarity') {
    sorted.sort((a, b) => RARITIES.findIndex(r => r.id === b.rarity.id) - RARITIES.findIndex(r => r.id === a.rarity.id));
  } else if (applicantSort === 'class') {
    sorted.sort((a, b) => a.cls.name.localeCompare(b.cls.name));
  } else if (applicantSort === 'power') {
    sorted.sort((a, b) => b.power - a.power);
  }

  sorted.forEach(app => {
    if (partyIds.includes(app.id)) return;   // already in party — hide from list
    const card = document.createElement('div');
    card.className = 'applicant-card';
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
      </div>`;
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
  partyIds = [];
  renderPartySlots();
  renderApplicantGrid();
  updateVentureBtn();
}

function toggleMember(id) {
  const idx = partyIds.indexOf(id);
  if (idx !== -1) { partyIds.splice(idx, 1); }
  else { if (partyIds.length >= 4) return; partyIds.push(id); }
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
    // Slot-to-slot with both filled: swap
    partyIds[fromSlot] = currentId;
    partyIds[slotIdx]  = draggedId;
  } else if (fromSlot !== -1) {
    // Slot-to-empty-slot: move, keep compact order
    partyIds.splice(fromSlot, 1);
    partyIds.splice(Math.min(slotIdx, partyIds.length), 0, draggedId);
  } else if (currentId !== undefined) {
    // Grid-to-filled-slot: replace (old member leaves the party)
    partyIds[slotIdx] = draggedId;
  } else {
    // Grid-to-empty-slot: add if there's room
    if (partyIds.length < 4) partyIds.push(draggedId);
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

  const remaining = 4 - partyIds.length;
  if (remaining === 0) {
    btn.disabled = false;
    const totalPower = partyIds.reduce((s, id) => s + (applicants.find(a => a.id === id)?.power ?? 0), 0);
    btn.textContent = `⚔️ Venture Forth!  (Party Power: ${totalPower})`;
    const ps = document.getElementById('party-status');
    if (ps) ps.textContent = 'Your party is ready. Steel yourselves!';
  } else {
    btn.disabled = true;
    btn.textContent = `Select ${remaining} more adventurer${remaining === 1 ? '' : 's'}`;
    const ps = document.getElementById('party-status');
    if (ps) ps.textContent = 'Choose 4 adventurers from the list below.';
  }
  _updateRerollBtn();
}

/* ── Keep re-roll button label and disabled state in sync ── */
function _updateRerollBtn() {
  const btn = document.getElementById('reroll-btn');
  if (!btn) return;
  const cost = _rerollCost();
  btn.textContent = `🎲 Re-roll (${cost}g)`;
  btn.disabled = state.gold < cost;
}

/* ── Get assembled party ── */
function getParty() {
  return partyIds.map(id => applicants.find(a => a.id === id));
}

