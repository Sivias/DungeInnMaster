/* ═══════════════════════════════════════════════════════
   ADVENTURE.UI.JS — Adventure page DOM rendering and
   overlay management.  Also exposes watchRun / stopWatching
   which the game engine calls via typeof guard.
═══════════════════════════════════════════════════════ */

/* ── Attach the renderer canvas and switch to the adventure page ── */
function watchRun(runId) {
  if (state.watchingRunId && state.watchingRunId !== runId) {
    const prev = state.activeRuns.find(r => r.id === state.watchingRunId);
    if (prev) prev.renderer?.detach();
  }
  state.watchingRunId = runId;
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run) return;
  run.renderer?.attach(document.getElementById('dungeon-canvas'));
  showPage('adventure-page');
  document.getElementById('outcome-overlay').classList.add('hidden');
  const restOverlay = document.getElementById('rest-overlay');
  if (restOverlay) {
    if (run.phase === 'resting') _showRestOverlay(run);
    else restOverlay.classList.add('hidden');
  }
  updateAdventureUI(run);
}

/* ── Detach renderer and return to the inn page ── */
function stopWatching() {
  if (state.watchingRunId) {
    const run = state.activeRuns.find(r => r.id === state.watchingRunId);
    if (run) run.renderer?.detach();
  }
  state.watchingRunId = null;
  _hideRestOverlay();
  showPage('inn-page');
  refreshInfoPanel();
  refreshInnExpeditionStatus();
}

/* ── Populate and show the rest-room overlay ── */
function _showRestOverlay(run) {
  const overlay = document.getElementById('rest-overlay');
  if (!overlay || state.watchingRunId !== run.id) return;
  const el = id => document.getElementById(id);
  if (el('rest-floor-num'))      el('rest-floor-num').textContent      = run.floor;
  if (el('rest-next-floor'))     el('rest-next-floor').textContent     = run.floor + 1;
  const fmtReturn = _fmtMs(run.returnDuration);
  if (el('rest-return-time'))     el('rest-return-time').textContent     = fmtReturn;
  if (el('rest-return-time-btn')) el('rest-return-time-btn').textContent = fmtReturn;
  overlay.classList.remove('hidden');
}

/* ── Hide the rest-room overlay ── */
function _hideRestOverlay() {
  document.getElementById('rest-overlay')?.classList.add('hidden');
}

/* ── Populate and show the outcome overlay ── */
function _showOutcomeOverlay(icon, title, msg) {
  document.getElementById('outcome-icon').textContent  = icon;
  document.getElementById('outcome-title').textContent = title;
  document.getElementById('outcome-msg').textContent   = msg;
  document.getElementById('outcome-overlay').classList.remove('hidden');
}

/* ── Full adventure-page refresh for the currently watched run ── */
function updateAdventureUI(run) {
  if (!run || state.watchingRunId !== run.id) return;
  if (document.getElementById('adventure-page').classList.contains('hidden')) return;

  const now = Date.now();
  let pct = 0, floorLabelText = '', timeText = '';

  if (run.phase === 'returning') {
    if (run.returnDuration > 0) {
      pct = Math.min(100, ((now - run.returnStartTime) / run.returnDuration) * 100);
      timeText = '↩ ' + _fmtMs(Math.max(0, run.returnDuration - (now - run.returnStartTime)));
    } else { pct = 100; timeText = '↩ …'; }
    floorLabelText = `Floor ${run.floor} — Returning`;
  } else if (run.phase === 'resting') {
    pct = 100;
    floorLabelText = `Floor ${run.floor} Complete! 🏕️`;
    timeText = '🏕️ Rest';
  } else {
    pct = Math.min(100, (run.encRoomsCleared / ROOMS_PER_FLOOR) * 100);
    floorLabelText = run.encRoomsCleared >= ROOMS_PER_FLOOR
      ? `Floor ${run.floor} Complete! 🏕️`
      : `Floor ${run.floor} — Room ${run.encRoomsCleared + 1}/${ROOMS_PER_FLOOR}`;
    timeText = _fmtMs(now - run.floorStartTime);
  }

  const fillEl = document.getElementById('floor-progress-fill');
  if (fillEl) fillEl.style.width = pct.toFixed(1) + '%';
  const floorLabelEl = document.getElementById('floor-label');
  if (floorLabelEl) floorLabelEl.textContent = floorLabelText;
  const timeEl = document.getElementById('floor-time-left');
  if (timeEl) timeEl.textContent = timeText;

  const cntEl = document.getElementById('enc-count');
  if (cntEl) cntEl.textContent = run.defeatedCount;

  const enc = run.encounterActive ? run.currentEncounter : null;
  if (enc) {
    document.getElementById('enc-icon').textContent = enc.icon;
    document.getElementById('enc-name').textContent = enc.name;
    document.getElementById('enc-diff').textContent = 'Difficulty: '+'★'.repeat(Math.ceil(enc.difficulty/5));
    document.getElementById('enc-desc').textContent = enc.desc;
  } else {
    const icons = { returning:'🏠', done:'✅', traveling:'🗺️', resting:'🏕️' };
    document.getElementById('enc-icon').textContent = icons[run.phase] ?? '🗺️';
    document.getElementById('enc-name').textContent = _phaseTitle(run);
    document.getElementById('enc-diff').textContent = '';
    document.getElementById('enc-desc').textContent = _phaseDesc(run);
  }

  renderAdvParty(run);
  document.getElementById('run-gold-earned').textContent = run.goldEarned;
  document.getElementById('adv-status').textContent = _phaseDesc(run);
  const recallBtn = document.getElementById('recall-btn');
  if (recallBtn) {
    recallBtn.disabled = run.phase === 'done' || run.phase === 'returning' || run.phase === 'resting';
  }
}

/* ── Party member cards in the adventure page ── */
function renderAdvParty(run) {
  const container = document.getElementById('adv-party');
  if (!container) return;
  const now = Date.now();

  run.party.forEach((m, idx) => {
    const hpPct   = Math.max(0, Math.round((m.hp/m.maxHp)*100));
    const hpColor = hpPct>55?'#4ac96a':hpPct>28?'#e9c84a':'#e94560';
    const used    = run.abilitiesUsed.has(m.id);
    const incap   = m.status === 'incapacitated';
    const canUse  = !used && !incap && run.phase !== 'returning' && run.phase !== 'done';
    const buff    = run.activeBuffs.find(b => b.memberId===m.id && b.expiresAt>now);

    let card = container.children[idx];
    if (!card || card.dataset.memberId !== m.id) {
      card = document.createElement('div');
      card.dataset.memberId = m.id;
      card.innerHTML = `
        <div class="adv-member-icon">${m.cls.icon}</div>
        <div class="adv-member-name">${m.name.split(' ')[0]}</div>
        <span class="rarity-badge ${m.rarity.cls}">${m.rarity.label}</span>
        <div class="hp-row">
          <div class="hp-bar-bg"><div class="hp-bar-fill"></div></div>
          <span class="hp-value"></span>
        </div>
        <div class="buff-timer" style="display:none">
          <div class="buff-bar-bg"><div class="buff-bar-fill"></div></div>
          <span class="buff-label"></span>
        </div>
        <button class="ability-btn" title="${m.cls.ability.desc}">
          ✦ ${m.cls.ability.name}
        </button>`;
      card.querySelector('.ability-btn').addEventListener('click', () => useAbility(run.id, m.id));
      if (container.children[idx]) {
        container.replaceChild(card, container.children[idx]);
      } else {
        container.appendChild(card);
      }
    }

    card.className = `adv-member ${m.status}`;

    const hpFill = card.querySelector('.hp-bar-fill');
    if (hpFill) { hpFill.style.width = hpPct + '%'; hpFill.style.background = hpColor; }
    const hpVal = card.querySelector('.hp-value');
    if (hpVal) hpVal.textContent = `${Math.max(0,m.hp)}/${m.maxHp}`;

    const buffTimer = card.querySelector('.buff-timer');
    if (buffTimer) {
      if (buff) {
        const dur = ABILITY_DURATION_MS[m.rarity.id] ?? ABILITY_DURATION_MS.common;
        const bp  = Math.max(0, ((buff.expiresAt-now)/dur)*100).toFixed(1);
        buffTimer.style.display = '';
        const bFill = buffTimer.querySelector('.buff-bar-fill');
        if (bFill) bFill.style.width = bp + '%';
        const bLbl = buffTimer.querySelector('.buff-label');
        if (bLbl) bLbl.textContent = `${buff.label} ${_fmtMs(buff.expiresAt-now)}`;
      } else {
        buffTimer.style.display = 'none';
      }
    }

    const btn = card.querySelector('.ability-btn');
    if (btn) btn.disabled = !canUse;
  });

  while (container.children.length > run.party.length) {
    container.removeChild(container.lastChild);
  }
}

/* ── Called by adventure.js when dungeon page needs a refresh ── */
function _updateDungeonPageIfVisible() {
  if (!document.getElementById('dungeon-page').classList.contains('hidden')) {
    renderActiveRuns();
    updateVentureBtn();
  }
}

/* ── Called by adventure.js to push UI updates for the watched run ── */
function _updateAdventureUIIfWatching(run) {
  if (state.watchingRunId === run.id) updateAdventureUI(run);
}

/* ── Sub-second UI refresh for smooth progress bars and timers ── */
setInterval(() => {
  if (!state.watchingRunId) return;
  const run = state.activeRuns.find(r => r.id === state.watchingRunId);
  if (run && !document.getElementById('adventure-page').classList.contains('hidden'))
    updateAdventureUI(run);
}, 500);

