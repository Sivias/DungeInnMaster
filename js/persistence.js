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
                              .filter(r => r.phase !== 'done' || r.pendingReward !== null)
                              .map(_serializeRun),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[DungeInnMaster] Save failed:', e);
  }
}

/* ── Re-link cls/rarity on a member/applicant to the live CLASSES & RARITIES data.
   JSON round-trips strip any properties added to those arrays after the save was made. ── */
function _relinkMember(m) {
  const liveClass  = CLASSES.find(c => c.name === m.cls?.name);
  const liveRarity = RARITIES.find(r => r.id   === m.rarity?.id);
  if (liveClass)  m.cls    = liveClass;
  if (liveRarity) m.rarity = liveRarity;
  return m;
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
    restAbilitiesUsed: [...run.restAbilitiesUsed],
    startTime:       run.startTime,
    floorStartTime:  run.floorStartTime,
    phaseStartTime:  run.phaseStartTime,
    activeMs:        run.activeMs,
    returnStartTime: run.returnStartTime,
    returnDuration:  run.returnDuration,
    defeatedCount:   run.defeatedCount,
    pendingReward:   run.pendingReward ?? null,  // preserved so unclaimed rewards survive reload
  };
}

/* ── Rebuild a full run from a snapshot and re-wire its timers ── */
function _restoreRun(snap, savedAt) {
  const now = Date.now();

  // Build the shell (no live timers / renderer yet)
  const run = {
    id:               snap.id,
    party:            snap.party.map(_relinkMember),
    phase:            snap.phase,
    floor:            snap.floor,
    roomIdx:          snap.roomIdx,
    encRoomsCleared:  snap.encRoomsCleared,
    goldEarned:       snap.goldEarned,
    activeBuffs:      (snap.activeBuffs || []).filter(b => b.expiresAt > now),
    abilitiesUsed:    new Set(snap.abilitiesUsed || []),
    restAbilitiesUsed: new Set(snap.restAbilitiesUsed || []),
    startTime:        snap.startTime,
    floorStartTime:   snap.floorStartTime,
    phaseStartTime:   0,               // will be set when travel resumes
    activeMs:         snap.activeMs ?? 0,
    returnStartTime:  snap.returnStartTime,
    returnDuration:   snap.returnDuration,
    defeatedCount:    snap.defeatedCount,
    encounterActive:  false,
    currentEncounter: null,
    paused:           false,
    pendingReward:    snap.pendingReward ?? null,
    timers:           [],
    uiTickId:         null,
    renderer:         new DungeonRenderer(),
  };
  run.renderer.setup(run.party);

  // ── Roll back any partially-started room (encounterActive was not persisted).
  // If roomIdx > encRoomsCleared the save was captured after _triggerRoomEncounter
  // incremented roomIdx but before _resolveFightRoaming incremented encRoomsCleared.
  // Resetting roomIdx ensures the encounter loop advances to the correct room rather
  // than skipping ahead or creating a duplicate room entry.
  if (run.roomIdx > run.encRoomsCleared) {
    run.roomIdx = run.encRoomsCleared;
  }

  // ── Done run with an unclaimed reward — restore pill without any combat timers ──
  if (run.phase === 'done') {
    if (!run.pendingReward) return null;   // fully claimed; discard
    state.activeRuns.push(run);
    run.uiTickId = setInterval(() => {
      if (!run.pendingReward) { clearInterval(run.uiTickId); run.uiTickId = null; return; }
      refreshInnExpeditionStatus();
    }, 500);
    return run;
  }

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
      // Accumulate any un-snapshotted travel time then compute return duration
      if (snap.phaseStartTime) run.activeMs += Math.max(0, (savedAt || now) - snap.phaseStartTime);
      run.returnDuration = Math.max(20_000, Math.round(run.activeMs * 0.33));
    }
  }

  state.activeRuns.push(run);

  // ── Re-wire timers by phase ──
  if (run.phase === 'traveling') {
    // Don't auto-resume — mark as paused so the player is prompted on next watch.
    // Accumulate the travel time that elapsed up to when the save was made, then
    // freeze the clock (phaseStartTime = 0) until the player resumes.
    const traveledSincePhaseStart = snap.phaseStartTime
      ? Math.max(0, (savedAt || now) - snap.phaseStartTime)
      : 0;
    run.activeMs += traveledSincePhaseStart;
    run.paused = true;

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

/* ── Park a run that completed while the tab was away as a pending reward ── */
function _resolveReturnedRun(run) {
  const innBonus = Object.values(state.locs).reduce((s, l) => s + l.level, 0);
  const bonus    = Math.floor(12 + run.floor * 8 + innBonus * 2);
  const gold     = run.goldEarned + bonus;
  const survivors = run.party.filter(m => m.status !== 'incapacitated');
  const floorWord = run.floor > 1 ? `${run.floor} floors` : '1 floor';

  run.phase = 'done';
  run.pendingReward = {
    gold, result: 'victory', icon: '🏆',
    title: 'Returned While Away!',
    msg:   `Party cleared ${floorWord} while you were away! ` +
           `${run.defeatedCount} enemies slain. Claim ${gold} gold.`,
    survivors,
  };

  addLog(
    `🏆 [${_partyLabel(run)}] Returned while you were away! ` +
    `${run.defeatedCount} slain · ${gold}g waiting to be claimed.`,
    'gold'
  );

  state.activeRuns.push(run);
  run.uiTickId = setInterval(() => {
    if (!run.pendingReward) { clearInterval(run.uiTickId); run.uiTickId = null; return; }
    refreshInnExpeditionStatus();
  }, 500);
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
    applicants            = data.applicants.map(_relinkMember);
    _applicantRosterLevel = data.applicantRosterLevel ?? -1;
  }

  // Active runs (including done runs with unclaimed rewards)
  if (Array.isArray(data.activeRuns)) {
    data.activeRuns.forEach(snap => {
      if (!snap) return;
      if (snap.phase === 'done' && !snap.pendingReward) return;  // fully resolved
      _restoreRun(snap, data.savedAt);
    });
  }

  refreshInnExpeditionStatus();
  addLog('📂 Game restored from your last session.', '');
  // Persist immediately so resolved/stale runs are scrubbed from the save file
  scheduleSave();
  return true;
}

/* ── Flush any pending debounced save the moment the tab is hidden or closed.
      visibilitychange fires on tab-switch, app-switch, and most mobile cases.
      beforeunload covers explicit close/reload on desktop browsers.
      Named references are required so resetSave() can remove them.         ── */
function _onVisibilityHide() {
  if (document.visibilityState === 'hidden') saveState();
}
document.addEventListener('visibilitychange', _onVisibilityHide);
window.addEventListener('beforeunload', saveState);

/* ── Wipe the save and reload for a clean slate ── */
function resetSave() {
  if (!confirm('⚠️ Reset all progress and start fresh?')) return;
  // Remove the flush-on-unload handlers BEFORE reloading, otherwise beforeunload
  // fires during location.reload() and immediately re-writes the deleted save.
  window.removeEventListener('beforeunload', saveState);
  document.removeEventListener('visibilitychange', _onVisibilityHide);
  clearTimeout(_saveTimer);
  _saveTimer = null;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}


