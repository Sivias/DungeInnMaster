/* ═══════════════════════════════════════════════════════
   PERSISTENCE.JS — localStorage save / load
   Load order: data → state → persistence → inn → dungeon
               → renderer → adventure → main
   (loaded early so scheduleSave is available everywhere)
═══════════════════════════════════════════════════════ */

const SAVE_KEY     = 'dungeinn_save';
const SAVE_VERSION = 1;

/* ── Debounced save: collapses rapid bursts into one write ── */
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 800);
}

/* ── Immediate save ── */
function saveState() {
  clearTimeout(_saveTimer);
  _saveTimer = null;
  try {
    const payload = {
      version:              SAVE_VERSION,
      savedAt:              Date.now(),
      gold:                 state.gold,
      locs:                 state.locs,
      applicants:           applicants,
      applicantRosterLevel: _applicantRosterLevel,
      activeRuns:           state.activeRuns
                              .filter(r => r.phase !== 'done')
                              .map(_serializeRun),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[DungeInnMaster] Save failed:', e);
  }
}

/* ── Strip non-serialisable run fields (timers, renderer, Set → array) ── */
function _serializeRun(run) {
  return {
    id:              run.id,
    party:           run.party,
    phase:           run.phase,
    floor:           run.floor,
    roomIdx:         run.roomIdx,
    encRoomsCleared: run.encRoomsCleared,
    goldEarned:      run.goldEarned,
    activeBuffs:     run.activeBuffs,
    abilitiesUsed:   [...run.abilitiesUsed],   // Set → plain array
    startTime:       run.startTime,
    floorStartTime:  run.floorStartTime,
    returnStartTime: run.returnStartTime,
    returnDuration:  run.returnDuration,
    defeatedCount:   run.defeatedCount,
  };
}

/* ── Rebuild a full run from a snapshot and re-wire its timers ── */
function _restoreRun(snap, savedAt) {
  const now = Date.now();

  // Build the shell (no live timers / renderer yet)
  const run = {
    id:               snap.id,
    party:            snap.party,
    phase:            snap.phase,
    floor:            snap.floor,
    roomIdx:          snap.roomIdx,
    encRoomsCleared:  snap.encRoomsCleared,
    goldEarned:       snap.goldEarned,
    activeBuffs:      (snap.activeBuffs || []).filter(b => b.expiresAt > now),
    abilitiesUsed:    new Set(snap.abilitiesUsed || []),
    startTime:        snap.startTime,
    floorStartTime:   snap.floorStartTime,
    returnStartTime:  snap.returnStartTime,
    returnDuration:   snap.returnDuration,
    defeatedCount:    snap.defeatedCount,
    encounterActive:  false,
    currentEncounter: null,
    timers:           [],
    uiTickId:         null,
    renderer:         new DungeonRenderer(),
  };
  run.renderer.setup(run.party);

  // ── Returning run that finished while the page was closed ──
  if (run.phase === 'returning') {
    const elapsed = now - run.returnStartTime;
    if (elapsed >= run.returnDuration) {
      _resolveReturnedRun(run);
      return null;
    }
  }

  // ── Travelling run where all rooms were already cleared ──
  // (Rare: save occurred in the brief window before _enterRestRoom ran)
  if (run.phase === 'traveling' && run.encRoomsCleared >= ROOMS_PER_FLOOR) {
    run.phase = 'resting';
    if (!run.returnDuration) {
      const floorElapsed = (savedAt || now) - run.floorStartTime;
      run.returnDuration = Math.max(30_000, Math.round(floorElapsed * 0.5));
    }
  }

  state.activeRuns.push(run);

  // ── Re-wire timers by phase ──
  if (run.phase === 'traveling') {
    // Resume encounter loop after a short orientation delay
    _pushTimer(run, () => _runEncounterLoop(run), 3000 + Math.random() * 2000);

  } else if (run.phase === 'resting') {
    // No timer needed — resting waits for player input.
    // If the player is watching this run the rest overlay is shown in watchRun().

  } else if (run.phase === 'returning') {
    run.renderer.onRetreat(null);
    const remaining = Math.max(500, run.returnDuration - (now - run.returnStartTime));
    _pushTimer(run, () => _endRun(run, 'victory'), remaining);
  }

  // UI refresh ticker (mirrors the one set up in _scheduleRunTimeline)
  run.uiTickId = setInterval(() => {
    if (run.phase === 'done') { clearInterval(run.uiTickId); run.uiTickId = null; return; }
    refreshInnExpeditionStatus();
  }, 500);

  return run;
}

/* ── Award gold + survivors for a run that completed while the tab was away ── */
function _resolveReturnedRun(run) {
  const innBonus = Object.values(state.locs).reduce((s, l) => s + l.level, 0);
  const bonus    = Math.floor(12 + run.floor * 8 + innBonus * 2);
  const gold     = run.goldEarned + bonus;
  setGold(state.gold + gold);
  addLog(
    `🏆 [${_partyLabel(run)}] Returned while you were away! ` +
    `${run.defeatedCount} slain · ${gold}g earned.`,
    'gold'
  );
  const survivors = run.party.filter(m => m.status !== 'incapacitated');
  if (survivors.length > 0) addReturningAdventurers(survivors);
}

/* ── Restore full game state from localStorage; returns true on success ── */
function loadState() {
  let data;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (e) {
    console.warn('[DungeInnMaster] Could not parse save data:', e);
    return false;
  }
  if (!data || data.version !== SAVE_VERSION) return false;

  // Gold
  setGold(data.gold ?? 50);

  // Inn locations
  if (data.locs) {
    for (const id of Object.keys(state.locs)) {
      if (data.locs[id]) {
        state.locs[id] = data.locs[id];
        refreshLocation(id);
      }
    }
  }

  // Applicant pool (including returning veterans)
  if (Array.isArray(data.applicants)) {
    applicants            = data.applicants;
    _applicantRosterLevel = data.applicantRosterLevel ?? -1;
  }

  // Active runs
  if (Array.isArray(data.activeRuns)) {
    data.activeRuns.forEach(snap => {
      if (!snap || snap.phase === 'done') return;
      _restoreRun(snap, data.savedAt);
    });
  }

  refreshInnExpeditionStatus();
  addLog('📂 Game restored from your last session.', '');
  // Persist immediately so resolved/stale runs are scrubbed from the save file
  scheduleSave();
  return true;
}

/* ── Wipe the save and reload for a clean slate ── */
function resetSave() {
  if (!confirm('⚠️ Reset all progress and start fresh?')) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

