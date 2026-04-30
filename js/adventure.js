/* ═══════════════════════════════════════════════════════
   ADVENTURE.JS — Run lifecycle, player actions & helpers
   Orchestrates run creation, the encounter loop, floor
   transitions, and all player-driven actions.
   Depends on: combat-tables.js, combat.js, adventure-ui.js
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════
   RUN CREATION
══════════════════════════════ */

function createRun(party) {
  const id = Math.random().toString(36).slice(2, 9);
  const run = {
    id,
    party: party.map(m => {
      const maxHp = Math.floor(m.cls.baseHp * m.rarity.hpMult + m.power * 3);
      return { ...m, hp: maxHp, maxHp, status: 'active' };
    }),
    phase:            'traveling',  // traveling | resting | returning | done
    floor:            1,
    roomIdx:          0,
    encRoomsCleared:  0,
    goldEarned:       0,
    activeBuffs:      [],
    abilitiesUsed:    new Set(),
    restAbilitiesUsed: new Set(),
    startTime:        Date.now(),
    floorStartTime:   Date.now(),
    phaseStartTime:   Date.now(),   // when the current active-travel phase began
    activeMs:         0,            // cumulative ms of active travel (excludes resting/paused)
    returnStartTime:  0,
    returnDuration:   0,
    encounterActive:  false,
    defeatedCount:    0,
    currentEncounter: null,
    paused:           false,        // true only when restored mid-expedition
    pendingReward:    null,         // { gold, result, icon, title, msg, survivors } — awaiting player claim
    timers:           [],
    uiTickId:         null,
    renderer:         new DungeonRenderer(),
  };
  run.renderer.setup(run.party);
  return run;
}

function startRun(party) {
  const run = createRun(party);
  state.activeRuns.push(run);
  _scheduleRunTimeline(run);
  addLog(`⚔️ ${_partyLabel(run)} ventures into the dungeon!`, 'dungeon');
  watchRun(run.id);
  _updateDungeonPageIfVisible();
  refreshInnExpeditionStatus();
  return run;
}

/* ══════════════════════════════
   RUN TIMELINE
══════════════════════════════ */

function _scheduleRunTimeline(run) {
  // Start encounter loop after a short intro walk (8–13 s)
  const firstDelay = 8000 + Math.random() * 5000;
  _pushTimer(run, () => _runEncounterLoop(run), firstDelay);

  // Separate ticker for inn-pill refreshes (not in run.timers so _cancelRunTimers won't kill it)
  run.uiTickId = setInterval(() => {
    if (run.phase === 'done') { clearInterval(run.uiTickId); run.uiTickId = null; return; }
    refreshInnExpeditionStatus();
  }, 500);
}

/* ── Recursive encounter loop: fires every 12–20 s ── */
function _runEncounterLoop(run) {
  if (run.phase === 'done' || run.phase === 'returning' || run.phase === 'resting') return;
  if (run.encounterActive) return;

  // All rooms on this floor cleared → rest at the stairs
  if (run.encRoomsCleared >= ROOMS_PER_FLOOR) {
    _enterRestRoom(run);
    return;
  }

  _triggerRoomEncounter(run);
}

/* ── Move party to the next room, then spawn the encounter there ── */
function _triggerRoomEncounter(run) {
  if (run.phase === 'done' || run.phase !== 'traveling' || run.encounterActive) return;
  run.encounterActive = true;
  run.roomIdx++;          // advance to next encounter room (1, 2, or 3)

  const enc = _pickEncounter(run);
  run.currentEncounter = enc;

  addLog(`👁️ [${_partyLabel(run)}] Room ${run.roomIdx}… ${enc.icon} ${enc.name}!`, 'dungeon');

  // Move party into the room, then spawn enemy
  run.renderer.moveToRoomAndSpawn(run.roomIdx, enc, () => {
    if (run.phase === 'done') { run.encounterActive = false; return; }
    _pushTimer(run, () => _autoFightRoaming(run, enc), 1200 + Math.random() * 800);
    _updateAdventureUIIfWatching(run);
  });

  _updateAdventureUIIfWatching(run);
  refreshInnExpeditionStatus();
}

/* ── Weighted encounter selection — scales with floor number & room position ── */
function _pickEncounter(run) {
  const roomProgress = run.roomIdx / ROOMS_PER_FLOOR;   // 0.33 → 0.67 → 1.0
  const floorBonus   = (run.floor - 1) * 10;            // +10 difficulty per extra floor
  const activePow    = run.party.filter(m => m.status !== 'incapacitated').reduce((s,m) => s+m.power, 0);
  const innBonus     = Math.floor(Object.values(state.locs).reduce((s,l)=>s+l.level,0) * 0.4);
  const powerBonus   = Math.floor(activePow / 5);
  const maxDiff      = Math.round(3 + roomProgress * 13 + floorBonus) + innBonus + powerBonus;
  const minDiff      = Math.max(1, maxDiff - 9);
  let pool = ENCOUNTERS.filter(e => e.difficulty >= minDiff && e.difficulty <= maxDiff);
  if (!pool.length) pool = ENCOUNTERS.filter(e => e.difficulty <= maxDiff + 3);
  if (!pool.length) pool = ENCOUNTERS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ── Begin return walk ── */
function _beginReturn(run) {
  if (run.phase === 'done') return;
  run.phase = 'returning';
  run.renderer.onRetreat(null);
  addLog(`🏠 [${_partyLabel(run)}] Returning to the inn…`, 'dungeon');
  _updateAdventureUIIfWatching(run);
  refreshInnExpeditionStatus();
}

/* ── Party reaches the last room — rest, recover HP, then offer choice ── */
function _enterRestRoom(run) {
  if (run.phase !== 'traveling') return;
  run.phase = 'resting';

  // Freeze the active-travel clock: add this floor's travel time to the cumulative total.
  // This excludes time spent waiting on rest/pause overlays, giving an accurate return estimate.
  if (run.phaseStartTime) {
    run.activeMs += Date.now() - run.phaseStartTime;
    run.phaseStartTime = 0;
  }

  // Lock the return duration NOW (33% of cumulative active travel time) so waiting on this
  // overlay never inflates it — reused by returnFromRest and the overlay display.
  run.returnDuration = Math.max(20_000, Math.round(run.activeMs * 0.33));

  // Partial HP recovery at rest
  const recovered = [];
  run.party.forEach(m => {
    if (m.status !== 'incapacitated') {
      const heal = Math.floor((m.maxHp - m.hp) * REST_HP_RECOVERY_PCT);
      if (heal > 0) {
        m.hp = Math.min(m.maxHp, m.hp + heal);
        if (m.hp >= m.maxHp * 0.35) m.status = m.hp < m.maxHp * 0.55 ? 'wounded' : 'active';
        recovered.push(`${m.name.split(' ')[0]} +${heal}HP`);
      }
    }
  });
  run.renderer.updatePartyStatus(run.party);

  const healMsg = recovered.length ? ` Rest: ${recovered.join(', ')}.` : '';
  addLog(`🏕️ [${_partyLabel(run)}] Floor ${run.floor} cleared!${healMsg}`, 'dungeon');

  scheduleSave();
  if (state.watchingRunId === run.id) _showRestOverlay(run);
  _updateAdventureUIIfWatching(run);
  refreshInnExpeditionStatus();
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

/* ── Player resumes a paused run — starts the encounter loop ── */
function resumePausedRun(runId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || !run.paused) return;
  document.getElementById('pause-overlay')?.classList.add('hidden');
  run.paused = false;
  run.phaseStartTime = Date.now();   // restart active-travel clock after pause
  _pushTimer(run, () => _runEncounterLoop(run), 3000 + Math.random() * 2000);
  addLog(`▶ [${_partyLabel(run)}] Expedition resumed on Floor ${run.floor}.`, 'dungeon');
  updateAdventureUI(run);
  scheduleSave();
}

/* ── Player chooses to return to the inn from the pause prompt ── */
function returnFromPause(runId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || !run.paused) return;
  document.getElementById('pause-overlay')?.classList.add('hidden');
  run.paused = false;
  _cancelRunTimers(run);
  run.renderer.onRetreat(null);
  _endRun(run, 'recall');
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

/* ── Player claims a finished run's reward ── */
function receiveRun(runId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || !run.pendingReward) return;

  const { gold, result, survivors } = run.pendingReward;
  run.pendingReward = null;
  if (run.uiTickId) { clearInterval(run.uiTickId); run.uiTickId = null; }

  setGold(state.gold + gold);

  // Log the result
  const floorWord = run.floor > 1 ? `${run.floor} floors` : '1 floor';
  if (result === 'victory') {
    addLog(`🏆 [${_partyLabel(run)}] Cleared ${floorWord}! ${run.defeatedCount} slain · ${gold}g received.`, 'gold');
  } else if (result === 'wipe') {
    addLog(`💀 [${_partyLabel(run)}] Party wiped. No gold recovered.`, 'dungeon');
  } else {
    addLog(`📯 [${_partyLabel(run)}] Recalled! ${gold}g received.`, 'dungeon');
  }

  // Return survivors to the applicant pool
  if (survivors && survivors.length > 0) addReturningAdventurers(survivors);

  // Remove run from active list and clean up renderer
  const idx = state.activeRuns.indexOf(run);
  if (idx !== -1) state.activeRuns.splice(idx, 1);
  run.renderer.hide();

  // Navigate back to inn
  document.getElementById('outcome-overlay').classList.add('hidden');
  if (state.watchingRunId === run.id) state.watchingRunId = null;
  showPage('inn-page');
  refreshInfoPanel();
  _updateDungeonPageIfVisible();
  refreshInnExpeditionStatus();
  saveState();   // irreversible claim — bypass debounce
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

  // ── Party summary ──────────────────────────────────────────────────────────
  const summaryEl = el('rest-party-summary');
  if (summaryEl) {
    summaryEl.innerHTML = '';
    run.party.forEach(m => {
      const hpPct    = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
      const hpColor  = hpPct > 55 ? '#4ac96a' : hpPct > 28 ? '#e9c84a' : '#e94560';
      const incap    = m.status === 'incapacitated';
      const wounded  = m.status === 'wounded';
      const rab        = m.cls.restAbility;
      const restUsed   = run.restAbilitiesUsed.has(m.id);
      const canRest    = rab && !restUsed && !incap;

      const ab         = m.cls.ability;
      const abUsed     = run.abilitiesUsed.has(m.id);
      const canAbility = ab?.restUsable && !abUsed && !incap;

      const card = document.createElement('div');
      card.className = `rest-member-card${incap ? ' rest-member-incap' : wounded ? ' rest-member-wounded' : ''}`;

      card.innerHTML = `
        <div class="rest-member-icon">${m.cls.icon}</div>
        <div class="rest-member-info">
          <div class="rest-member-name">${m.name.split(' ')[0]}</div>
          <div class="rest-hp-row">
            <div class="rest-hp-bg"><div class="rest-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
            <span class="rest-hp-val">${incap ? '💀' : `${m.hp}/${m.maxHp}`}</span>
          </div>
          ${canRest
            ? `<button class="rest-ability-btn" data-tooltip="${rab.desc}" title="${rab.desc}" aria-describedby="rest-tip-${m.id}">${rab.name}</button><span class="rest-tip-sr" id="rest-tip-${m.id}" role="tooltip">${rab.desc}</span>`
            : rab && restUsed
              ? `<span class="rest-ability-used">${rab.name} (used)</span>`
              : rab && incap
                ? `<span class="rest-ability-used">${rab.name}</span>`
                : ''}
          ${canAbility
            ? `<button class="rest-ability-btn rest-ability-combat" data-tooltip="${ab.desc}" title="${ab.desc}" aria-describedby="rest-abtip-${m.id}">✦ ${ab.name}</button><span class="rest-tip-sr" id="rest-abtip-${m.id}" role="tooltip">${ab.desc}</span>`
            : ab?.restUsable && abUsed
              ? `<span class="rest-ability-used">✦ ${ab.name} (used)</span>`
              : ''}
        </div>`;

      if (canRest) {
        card.querySelector('.rest-ability-btn').addEventListener('click', () => {
          useRestAbility(run.id, m.id);
        });
      }
      if (canAbility) {
        card.querySelector('.rest-ability-combat').addEventListener('click', () => {
          useAbility(run.id, m.id);
          _showRestOverlay(run);
        });
      }
      summaryEl.appendChild(card);
    });
  }

  overlay.classList.remove('hidden');
}

/* ── Use a rest ability — only during the resting phase, once per run ── */
function useRestAbility(runId, memberId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || run.phase !== 'resting') return;
  if (run.restAbilitiesUsed.has(memberId)) return;

  const m = run.party.find(p => p.id === memberId);
  if (!m || m.status === 'incapacitated') return;

  const rab  = m.cls.restAbility;
  if (!rab) return;

  run.restAbilitiesUsed.add(memberId);

  const who  = m.name.split(' ')[0];
  let result = '';

  switch (rab.type) {
    case 'healAll': {
      const healed = [];
      run.party.forEach(p => {
        if (p.status !== 'incapacitated') {
          const gain = Math.min(rab.value, p.maxHp - p.hp);
          if (gain > 0) { p.hp += gain; if (p.hp >= p.maxHp * 0.55) p.status = 'active'; else if (p.hp >= p.maxHp * 0.35) p.status = 'wounded'; healed.push(`${p.name.split(' ')[0]} +${gain}`); }
        }
      });
      result = healed.length ? `Each ally is mended — ${healed.join(', ')}.` : 'Everyone is already at full health.';
      break;
    }
    case 'healLowest': {
      const target = [...run.party].filter(p => p.status !== 'incapacitated').sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (target) {
        const gain = Math.min(rab.value, target.maxHp - target.hp);
        if (gain === 0) {
          run.restAbilitiesUsed.delete(memberId);   // refund — no effect
          addLog(`🏕️ ${who} reaches for ${rab.name}, but everyone is already at full health.`, 'dungeon');
          _showRestOverlay(run);
          return;
        }
        target.hp += gain;
        if (target.hp >= target.maxHp * 0.55) target.status = 'active'; else if (target.hp >= target.maxHp * 0.35) target.status = 'wounded';
        result = `${target.name.split(' ')[0]} recovers ${gain} HP.`;
      }
      break;
    }
    case 'healSelf': {
      const gain = Math.min(rab.value, m.maxHp - m.hp);
      if (gain === 0) {
        run.restAbilitiesUsed.delete(memberId);   // refund — no effect
        addLog(`🏕️ ${who} begins to meditate, but is already at full health.`, 'dungeon');
        _showRestOverlay(run);
        return;
      }
      m.hp += gain;
      if (m.hp >= m.maxHp * 0.55) m.status = 'active'; else if (m.hp >= m.maxHp * 0.35) m.status = 'wounded';
      result = `${who} recovers ${gain} HP.`;
      break;
    }
    case 'runBoost': {
      const expiresAt = run.startTime + 99 * 60 * 1000;  // effectively permanent for the run
      run.activeBuffs.push({ memberId, type: 'runBoost', value: rab.value, expiresAt, label: rab.name });
      result = `The whole party gains +${rab.value} power for the rest of the run.`;
      break;
    }
    case 'gainGold': {
      setGold(state.gold + rab.value);
      result = `Found ${rab.value}g tucked away in the dungeon cracks.`;
      break;
    }
    case 'soulSiphon': {
      // Warlock sacrifices own HP to heal lowest ally
      const target = [...run.party].filter(p => p.id !== memberId && p.status !== 'incapacitated').sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      const dmg = Math.min(rab.selfDmg ?? 15, m.hp - 1);
      m.hp = Math.max(1, m.hp - dmg);
      if (m.hp < m.maxHp * 0.35) m.status = 'wounded';
      if (target) {
        const gain = Math.min(rab.value, target.maxHp - target.hp);
        target.hp += gain;
        if (target.hp >= target.maxHp * 0.55) target.status = 'active'; else if (target.hp >= target.maxHp * 0.35) target.status = 'wounded';
        result = `${who} loses ${dmg} HP — ${target.name.split(' ')[0]} gains ${gain} HP.`;
      } else {
        result = `${who} bleeds into the dark… but there is no ally to receive the gift.`;
      }
      break;
    }
  }

  addLog(`🏕️ ${who} uses ${rab.name}! ${rab.flavor} ${result}`, 'dungeon');

  run.renderer.updatePartyStatus(run.party);
  scheduleSave();
  _showRestOverlay(run);   // re-render cards to reflect new HP / used state
  updateAdventureUI(run);
}

/* ── Player chooses to descend to the next floor ── */
function descendFloor(runId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || run.phase !== 'resting') return;

  document.getElementById('rest-overlay')?.classList.add('hidden');

  run.floor++;
  run.roomIdx         = 0;
  run.encRoomsCleared = 0;
  run.floorStartTime  = Date.now();
  run.phaseStartTime  = Date.now();   // restart active-travel clock for the new floor
  run.phase           = 'traveling';

  addLog(`⬇️ [${_partyLabel(run)}] Descending to Floor ${run.floor}!`, 'dungeon');

  scheduleSave();
  run.renderer.startNewFloor(() => {
    if (run.phase !== 'traveling') return;
    const delay = 6000 + Math.random() * 4000;
    _pushTimer(run, () => _runEncounterLoop(run), delay);
    _updateAdventureUIIfWatching(run);
  });

  _updateAdventureUIIfWatching(run);
  refreshInnExpeditionStatus();
}

/* ── Player chooses to return to the inn from the rest room ── */
function returnFromRest(runId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || run.phase !== 'resting') return;

  document.getElementById('rest-overlay')?.classList.add('hidden');
  _cancelRunTimers(run);  // clear any stray timers

  // returnDuration was locked when the rest overlay first appeared — use it as-is
  run.returnStartTime = Date.now();

  _beginReturn(run);   // sets phase to 'returning', plays retreat animation

  _pushTimer(run, () => _endRun(run, 'victory'), run.returnDuration);
  scheduleSave();
}

/* ── Finalize run — gold held in pendingReward until player claims it ── */
function _endRun(run, result) {
  if (run.phase === 'done') return;
  run.phase = 'done';
  _cancelRunTimers(run);
  if (run.uiTickId) { clearInterval(run.uiTickId); run.uiTickId = null; }
  document.getElementById('rest-overlay')?.classList.add('hidden');
  document.getElementById('pause-overlay')?.classList.add('hidden');

  let gold = run.goldEarned;
  let icon, title, msg;

  if (result === 'victory') {
    const innBonus = Object.values(state.locs).reduce((s,l)=>s+l.level,0);
    const bonus = Math.floor(12 + run.floor * 8 + innBonus * 2);
    gold += bonus;
    icon='🏆'; title='Dungeon Cleared!';
    const floorWord = run.floor > 1 ? `${run.floor} floors` : '1 floor';
    msg=`Party returned from ${floorWord}! ${run.defeatedCount} enemies slain. Earned ${gold} gold (includes +${bonus} completion bonus).`;
  } else if (result === 'wipe') {
    gold=0; icon='💀'; title='Party Wiped!';
    msg='Every adventurer fell. No gold recovered.';
  } else {
    gold=Math.floor(gold*0.5); icon='📯'; title='Party Recalled';
    msg=`Party recalled with ${gold} gold. (Half lost in hasty retreat.)`;
  }

  const survivors = result !== 'wipe' ? run.party.filter(m => m.status !== 'incapacitated') : [];
  run.pendingReward = { gold, result, icon, title, msg, survivors };

  // Keep the pill refreshing while waiting for the player to claim
  run.uiTickId = setInterval(() => {
    if (!run.pendingReward) { clearInterval(run.uiTickId); run.uiTickId = null; return; }
    refreshInnExpeditionStatus();
  }, 500);

  if (state.watchingRunId === run.id) {
    _showPendingRewardOverlay(run);
    _updateAdventureUIIfWatching(run);
  }
  refreshInnExpeditionStatus();
  _updateDungeonPageIfVisible();
  scheduleSave();
}

/* ══════════════════════════════
   PLAYER ACTIONS
══════════════════════════════ */

function watchRun(runId) {
  if (state.watchingRunId && state.watchingRunId !== runId) {
    const prev = state.activeRuns.find(r => r.id === state.watchingRunId);
    if (prev) prev.renderer.detach();
  }
  state.watchingRunId = runId;
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run) return;
  run.renderer.attach(document.getElementById('dungeon-canvas'));
  showPage('adventure-page');

  // Outcome overlay: pending reward from a completed run
  if (run.pendingReward) _showPendingRewardOverlay(run);
  else document.getElementById('outcome-overlay').classList.add('hidden');

  // Pause overlay: session resumed on a mid-expedition traveling run
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) {
    if (run.paused) _showPauseOverlay(run);
    else pauseOverlay.classList.add('hidden');
  }

  // Rest overlay: party at the dungeon stairs
  const restOverlay = document.getElementById('rest-overlay');
  if (restOverlay) {
    if (run.phase === 'resting') _showRestOverlay(run);
    else restOverlay.classList.add('hidden');
  }
  updateAdventureUI(run);
}

function stopWatching() {
  if (state.watchingRunId) {
    const run = state.activeRuns.find(r => r.id === state.watchingRunId);
    if (run) run.renderer.detach();
  }
  state.watchingRunId = null;
  ['rest-overlay', 'pause-overlay', 'outcome-overlay'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden'));
  showPage('inn-page');
  refreshInfoPanel();
  refreshInnExpeditionStatus();
}

function recallParty() {
  const run = state.activeRuns.find(r => r.id === state.watchingRunId);
  if (!run || run.phase === 'done' || run.phase === 'returning') return;
  if (run.paused) return;   // handled by the pause overlay
  // At the rest room: treat recall as "Return to Inn" (full gold)
  if (run.phase === 'resting') { returnFromRest(run.id); return; }
  _cancelRunTimers(run);
  run.renderer.onRetreat(null);
  _endRun(run, 'recall');
}

/* ── Use an ability — usable any time except when returning/done ── */
function useAbility(runId, memberId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run) return;
  if (run.phase === 'returning' || run.phase === 'done') return;
  if (run.abilitiesUsed.has(memberId)) return;
  const m = run.party.find(p => p.id === memberId);
  if (!m || m.status === 'incapacitated') return;
  run.abilitiesUsed.add(memberId);

  const ab = m.cls.ability;
  const who = m.name.split(' ')[0];
  const duration = ABILITY_DURATION_MS[m.rarity.id] ?? ABILITY_DURATION_MS.common;
  const expiresAt = Date.now() + duration;
  let msg = '';

  switch (ab.type) {
    case 'autoWin':
      if (ab.hpCost) { m.hp=Math.max(1,m.hp-ab.hpCost); if(m.hp<m.maxHp*0.35)m.status='wounded'; }
      run.activeBuffs.push({ memberId, type:'autoWin', value:1, expiresAt, label:ab.name });
      msg=`✦ ${who} uses ${ab.name}! Next encounter guaranteed (${_fmtDur(duration)}).`; break;
    case 'powerBoost':
      run.activeBuffs.push({ memberId, type:'powerBoost', value:ab.value, expiresAt, label:ab.name });
      msg=`✦ ${who} uses ${ab.name}! +${ab.value} power for ${_fmtDur(duration)}.`; break;
    case 'rollBoost':
      run.activeBuffs.push({ memberId, type:'rollBoost', value:ab.value, expiresAt, label:ab.name });
      msg=`✦ ${who} uses ${ab.name}! +${ab.value} to rolls for ${_fmtDur(duration)}.`; break;
    case 'selfDouble':
      run.activeBuffs.push({ memberId, type:'selfDouble', value:m.power, expiresAt, label:ab.name });
      msg=`✦ ${who} uses ${ab.name}! Power doubled for ${_fmtDur(duration)}.`; break;
    case 'heal': {
      const t=[...run.party].filter(p=>p.status!=='incapacitated').sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
      if(t){ t.hp=Math.min(t.maxHp,t.hp+ab.value); if(t.hp>=t.maxHp*0.35)t.status=t.hp<t.maxHp*0.55?'wounded':'active'; msg=`✦ ${who} casts ${ab.name}! Healed ${t.name.split(' ')[0]} for ${ab.value} HP.`; }
      break;
    }
    case 'shield':
      run.activeBuffs.push({ memberId, type:'shield', value:1, expiresAt, label:ab.name });
      msg=`✦ ${who} raises ${ab.name}! Damage halved for ${_fmtDur(duration)}.`; break;
    case 'runBoost':
      run.activeBuffs.push({ memberId, type:'runBoost', value:ab.value, expiresAt, label:ab.name });
      msg=`✦ ${who} inspires! +${ab.value} power for ${_fmtDur(duration)}.`; break;
  }

  run.activeBuffs = run.activeBuffs.filter(b => b.expiresAt > Date.now());
  addLog(msg, 'dungeon');
  scheduleSave();
  run.renderer.onAbility(m, ab.type);
  run.renderer.updatePartyStatus(run.party);
  updateAdventureUI(run);
}

/* ══════════════════════════════
   HELPERS
══════════════════════════════ */


function _updateAdventureUIIfWatching(run) {
  if (state.watchingRunId === run.id) updateAdventureUI(run);
}

function _updateDungeonPageIfVisible() {
  if (!document.getElementById('dungeon-page').classList.contains('hidden')) {
    renderActiveRuns();
    updateVentureBtn();
  }
}

function _cancelRunTimers(run) {
  run.timers.forEach(t => { clearTimeout(t); clearInterval(t); });
  run.timers = [];
}

/* ── One-shot timer that removes itself from run.timers once it fires ── */
function _pushTimer(run, fn, delay) {
  let id;
  id = setTimeout(() => {
    const i = run.timers.indexOf(id);
    if (i !== -1) run.timers.splice(i, 1);
    fn();
  }, delay);
  run.timers.push(id);
  return id;
}

function _fmtMs(ms) {
  const s = Math.max(0, Math.ceil(ms/1000));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

function _fmtDur(ms) {
  const m = ms/60000;
  return (m===Math.floor(m)?m:m.toFixed(1))+'min';
}

function _partyLabel(run) {
  return (run.party[0]?.name.split(' ')[0]??'Party')+"'s party";
}

