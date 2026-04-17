/* ═══════════════════════════════════════════════════════
   ADVENTURE-UI.JS — Adventure page rendering
   All DOM updates for the active-run view: party cards,
   floor progress, encounter badge, and the three overlays
   (pause / rest-room / outcome).
   Depends on: adventure.js (helpers: _fmtMs, _fmtDur,
               _partyLabel, _pushTimer, _cancelRunTimers)
               data.js (ABILITY_DURATION_MS, ROOMS_PER_FLOOR)
═══════════════════════════════════════════════════════ */

/* ── Main adventure-page refresh ── */
function updateAdventureUI(run) {
  if (!run || state.watchingRunId !== run.id) return;
  if (document.getElementById('adventure-page').classList.contains('hidden')) return;

  const now = Date.now();

  // ── Floor progress bar & labels ──────────────────────────────────────────
  let pct;
  let floorLabelText;
  let timeText;

  if (run.phase === 'returning') {
    if (run.returnDuration > 0) {
      const elapsed = now - run.returnStartTime;
      pct = Math.max(0, 100 - (elapsed / run.returnDuration) * 100);
      const msLeft = Math.max(0, run.returnDuration - elapsed);
      timeText = '↩ ' + _fmtMs(msLeft);
    } else {
      pct = 0;
      timeText = '↩ …';
    }
    floorLabelText = `Floor ${run.floor} — Returning`;
  } else if (run.phase === 'resting') {
    pct = 100;
    floorLabelText = `Floor ${run.floor} Complete! 🏕️`;
    timeText = '🏕️ Rest';
  } else {
    const floorElapsed = now - run.floorStartTime;
    if (run.encRoomsCleared >= ROOMS_PER_FLOOR) {
      pct = 100;
      floorLabelText = `Floor ${run.floor} Complete! 🏕️`;
    } else {
      pct = Math.min(99, (floorElapsed / FLOOR_ESTIMATED_MS) * 100);
      floorLabelText = `Floor ${run.floor} — Room ${run.encRoomsCleared + 1}/${ROOMS_PER_FLOOR}`;
    }
    timeText = _fmtMs(floorElapsed);
  }

  const fillEl = document.getElementById('floor-progress-fill');
  if (fillEl) fillEl.style.width = pct.toFixed(1) + '%';
  const floorLabelEl = document.getElementById('floor-label');
  if (floorLabelEl) floorLabelEl.textContent = floorLabelText;
  const timeEl = document.getElementById('floor-time-left');
  if (timeEl) timeEl.textContent = timeText;

  // ── Encounter counter ──
  const cntEl = document.getElementById('enc-count');
  if (cntEl) cntEl.textContent = run.defeatedCount;

  // ── Encounter badge ──
  const enc = run.encounterActive ? run.currentEncounter : null;
  if (enc) {
    document.getElementById('enc-icon').textContent = enc.icon;
    document.getElementById('enc-name').textContent = enc.name;
    document.getElementById('enc-diff').textContent = 'Difficulty: ' + '★'.repeat(Math.ceil(enc.difficulty / 5));
    document.getElementById('enc-desc').textContent = enc.desc;
  } else {
    const icons = { returning: '🏠', done: '✅', traveling: '🗺️', resting: '🏕️' };
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
    recallBtn.disabled = run.paused || run.phase === 'done' || run.phase === 'returning' || run.phase === 'resting';
  }
}

/* ── Party HP strip — reuses existing cards to avoid hover flicker ── */
function renderAdvParty(run) {
  const container = document.getElementById('adv-party');
  if (!container) return;
  const now = Date.now();

  run.party.forEach((m, idx) => {
    const hpPct   = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
    const hpColor = hpPct > 55 ? '#4ac96a' : hpPct > 28 ? '#e9c84a' : '#e94560';
    const used    = run.abilitiesUsed.has(m.id);
    const incap   = m.status === 'incapacitated';
    // Abilities usable any time except returning/done/paused
    const canUse  = !used && !incap && !run.paused && run.phase !== 'returning' && run.phase !== 'done';
    const buff    = run.activeBuffs.find(b => b.memberId === m.id && b.expiresAt > now);

    let card = container.children[idx];
    if (!card || card.dataset.memberId !== m.id) {
      // Build card once (first render or member change)
      card = document.createElement('div');
      card.dataset.memberId = m.id;

      const iconDiv = document.createElement('div');
      iconDiv.className = 'adv-member-icon';
      iconDiv.textContent = m.cls.icon;

      const nameDiv = document.createElement('div');
      nameDiv.className = 'adv-member-name';
      nameDiv.textContent = m.name.split(' ')[0];

      const raritySpan = document.createElement('span');
      raritySpan.className = `rarity-badge ${m.rarity.cls}`;
      raritySpan.textContent = m.rarity.label;

      // Static structural markup — no persisted data, safe to use innerHTML
      const hpRow = document.createElement('div');
      hpRow.className = 'hp-row';
      hpRow.innerHTML = '<div class="hp-bar-bg"><div class="hp-bar-fill"></div></div><span class="hp-value"></span>';

      const buffTimerDiv = document.createElement('div');
      buffTimerDiv.className = 'buff-timer';
      buffTimerDiv.style.display = 'none';
      buffTimerDiv.innerHTML = '<div class="buff-bar-bg"><div class="buff-bar-fill"></div></div><span class="buff-label"></span>';

      const abilityBtn = document.createElement('button');
      abilityBtn.className = 'ability-btn';
      abilityBtn.title = m.cls.ability.desc;
      abilityBtn.dataset.tooltip = m.cls.ability.desc;
      abilityBtn.textContent = `✦ ${m.cls.ability.name}`;

      card.appendChild(iconDiv);
      card.appendChild(nameDiv);
      card.appendChild(raritySpan);
      card.appendChild(hpRow);
      card.appendChild(buffTimerDiv);
      card.appendChild(abilityBtn);
      // Attach click listener once — useAbility validates canUse internally
      card.querySelector('.ability-btn').addEventListener('click', e => {
        e.currentTarget.blur();
        useAbility(run.id, m.id);
      });
      if (container.children[idx]) {
        container.replaceChild(card, container.children[idx]);
      } else {
        container.appendChild(card);
      }
    }

    // Update only the dynamic parts in-place
    card.className = `adv-member ${m.status}`;

    const hpFill = card.querySelector('.hp-bar-fill');
    if (hpFill) { hpFill.style.width = hpPct + '%'; hpFill.style.background = hpColor; }
    const hpVal = card.querySelector('.hp-value');
    if (hpVal) hpVal.textContent = `${Math.max(0, m.hp)}/${m.maxHp}`;

    const buffTimer = card.querySelector('.buff-timer');
    if (buffTimer) {
      if (buff) {
        const dur = ABILITY_DURATION_MS[m.rarity.id] ?? ABILITY_DURATION_MS.common;
        const bp  = Math.max(0, ((buff.expiresAt - now) / dur) * 100).toFixed(1);
        buffTimer.style.display = '';
        const bFill = buffTimer.querySelector('.buff-bar-fill');
        if (bFill) bFill.style.width = bp + '%';
        const bLbl = buffTimer.querySelector('.buff-label');
        if (bLbl) bLbl.textContent = `${buff.label} ${_fmtMs(buff.expiresAt - now)}`;
      } else {
        buffTimer.style.display = 'none';
      }
    }

    const btn = card.querySelector('.ability-btn');
    if (btn) btn.disabled = !canUse;
  });

  // Remove stale cards if party shrinks
  while (container.children.length > run.party.length) {
    container.removeChild(container.lastChild);
  }
}

/* ── Populate and display the pause overlay (session-resumed prompt) ── */
function _showPauseOverlay(run) {
  const overlay = document.getElementById('pause-overlay');
  if (!overlay || state.watchingRunId !== run.id) return;

  const summaryEl = document.getElementById('pause-party-summary');
  if (summaryEl) {
    summaryEl.textContent = '';
    run.party.forEach(m => {
      const hpPct     = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
      const statusCls = m.status === 'incapacitated' ? 'dead' : m.status === 'wounded' ? 'wounded' : '';
      const span      = document.createElement('span');
      span.className  = `pause-member ${statusCls}`;
      span.textContent = `${m.cls.icon} ${m.name.split(' ')[0]} ${hpPct}%`;
      summaryEl.appendChild(span);
    });
  }

  const infoEl = document.getElementById('pause-info');
  if (infoEl) {
    const alive = run.party.filter(m => m.status !== 'incapacitated').length;
    infoEl.textContent =
      `Floor ${run.floor} · Room ${run.encRoomsCleared + 1}/${ROOMS_PER_FLOOR}` +
      ` · 💰 ${run.goldEarned}g earned · 💛 ${alive}/${run.party.length} alive`;
  }

  overlay.classList.remove('hidden');
}

/* ── Populate and show the outcome overlay for a completed pending-reward run ── */
function _showPendingRewardOverlay(run) {
  if (!run || !run.pendingReward || state.watchingRunId !== run.id) return;
  const pr = run.pendingReward;
  document.getElementById('outcome-icon').textContent  = pr.icon;
  document.getElementById('outcome-title').textContent = pr.title;
  document.getElementById('outcome-msg').textContent   = pr.msg;
  const btn = document.getElementById('return-btn');
  if (btn) {
    btn.textContent = pr.result === 'wipe'
      ? '💔 Mourn & Return to Inn'
      : `✅ Claim ${pr.gold}g & Return to Inn`;
  }
  document.getElementById('outcome-overlay').classList.remove('hidden');
}

/* ── Populate and display the rest-room overlay ── */
function _showRestOverlay(run) {
  const overlay = document.getElementById('rest-overlay');
  if (!overlay || state.watchingRunId !== run.id) return;

  const el = id => document.getElementById(id);
  if (el('rest-floor-num'))      el('rest-floor-num').textContent      = run.floor;
  if (el('rest-next-floor'))     el('rest-next-floor').textContent     = run.floor + 1;

  // Use the duration locked in _enterRestRoom — never recalculate from Date.now()
  const fmtReturn = _fmtMs(run.returnDuration);
  if (el('rest-return-time'))     el('rest-return-time').textContent     = fmtReturn;
  if (el('rest-return-gold-btn')) el('rest-return-gold-btn').textContent = run.goldEarned;

  overlay.classList.remove('hidden');
}

/* ── Phase label for the encounter badge title ── */
function _phaseTitle(run) {
  if (run.phase === 'resting')   return `Floor ${run.floor} Cleared — Resting`;
  if (run.phase === 'returning') return 'Returning to Inn';
  if (run.phase === 'done')      return 'Expedition Complete';
  return `Floor ${run.floor} — Room ${run.roomIdx}/${ROOMS_PER_FLOOR}`;
}

/* ── One-line status text shown below the party strip ── */
function _phaseDesc(run) {
  if (run.paused) return '⏸️ Session resumed — continue the expedition or return to the inn.';
  if (run.phase === 'done' && run.pendingReward)
    return `${run.pendingReward.icon} ${run.pendingReward.title} — claim your reward.`;
  switch (run.phase) {
    case 'traveling':  return '🥾 Your party pushes deeper into the dungeon…';
    case 'resting':    return '🏕️ The party rests at the dungeon stairs. Descend or return to the inn?';
    case 'returning':  return '🏠 Your party makes the long walk back…';
    case 'done':       return '✅ Expedition complete.';
    default:           return '';
  }
}

/* ── Sub-second UI refresh for smooth progress bars and buff timers ── */
setInterval(() => {
  if (!state.watchingRunId) return;
  const run = state.activeRuns.find(r => r.id === state.watchingRunId);
  if (run && !document.getElementById('adventure-page').classList.contains('hidden'))
    updateAdventureUI(run);
}, 500);

