/* ═══════════════════════════════════════════════════════
   DUNGEON.UI.JS — Dungeon / party-selection page rendering
   Depends on: server/game/dungeon.js, server/game/state.js
═══════════════════════════════════════════════════════ */

/* ── Sort preference lives in UI state, not game state ── */
let applicantSort = 'default';
let _sortBarReady = false;

/* ── Navigate to the dungeon gate page ── */
function showDungeonPage() {
  showPage('dungeon-page');
  _initSortBar();
  refreshDungeonPage();
}

/* ── Wire sort buttons once ── */
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

  const canDeploy     = state.activeRuns.length < maxParties();
  const deploySection = document.getElementById('deploy-section');
  const limitMsg      = document.getElementById('hearth-limit-msg');

  if (canDeploy) {
    if (deploySection) deploySection.style.display = '';
    if (limitMsg) limitMsg.textContent = '';

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

    const enc        = run.currentEncounter;
    const phaseIcons = { traveling:'🥾', returning:'🏠', done:'✅', resting:'🏕️' };
    const phaseIcon  = phaseIcons[run.phase] ?? '🥾';
    const phaseText  = enc && run.encounterActive
      ? `${enc.icon} ${enc.name}`
      : ({ traveling: run.encRoomsCleared >= ROOMS_PER_FLOOR
                        ? `🏕️ F${run.floor} cleared`
                        : `F${run.floor} · Rm ${run.encRoomsCleared + 1}/${ROOMS_PER_FLOOR}`,
           resting:   `🏕️ F${run.floor} cleared`,
           returning: 'Returning',
           done:      'Done' }[run.phase] ?? `Floor ${run.floor}`);

    const bar = run.phase === 'returning' && run.returnDuration > 0
      ? Math.min(100, ((Date.now() - run.returnStartTime) / run.returnDuration) * 100).toFixed(0)
      : Math.min(100, (run.encRoomsCleared / ROOMS_PER_FLOOR) * 100).toFixed(0);

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

  const sorted = [...applicants];
  if (applicantSort === 'rarity') {
    sorted.sort((a, b) => RARITIES.findIndex(r => r.id === b.rarity.id) - RARITIES.findIndex(r => r.id === a.rarity.id));
  } else if (applicantSort === 'class') {
    sorted.sort((a, b) => a.cls.name.localeCompare(b.cls.name));
  } else if (applicantSort === 'power') {
    sorted.sort((a, b) => b.power - a.power);
  } else {
    sorted.sort((a, b) => (b.returning ? 1 : 0) - (a.returning ? 1 : 0));
  }

  sorted.forEach(app => {
    if (partyIds.includes(app.id)) return;
    const cost       = _hireCost(app);
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

/* ── Update the applicant count label ── */
function _updateApplicantLabel() {
  const lbl = document.getElementById('applicant-label');
  if (!lbl) return;
  const available = applicants.filter(a => !partyIds.includes(a.id)).length;
  lbl.textContent = `Adventurers seeking work — Guest Room Lv ${_applicantRosterLevel} (${available} available)`;
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

/* ── Re-roll button label and affordability ── */
function _updateRerollBtn() {
  const btn = document.getElementById('reroll-btn');
  if (!btn) return;
  const cost          = _rerollCost();
  const affordableGold = state.gold + _partyRefundTotal();
  btn.textContent = `🎲 Re-roll (${cost}g)`;
  btn.disabled    = affordableGold < cost;
}

