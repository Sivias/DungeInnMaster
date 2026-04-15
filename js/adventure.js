/* ═══════════════════════════════════════════════════════
   ADVENTURE.JS — Real-time autonomous dungeon exploration
   Continuous random encounters every 12–20 s · 5-min runs
   Abilities usable once per run · last up to 2 min
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
    startTime:        Date.now(),
    floorStartTime:   Date.now(),
    returnStartTime:  0,
    returnDuration:   0,
    encounterActive:  false,
    defeatedCount:    0,
    currentEncounter: null,
    paused:           false,        // true only when restored mid-expedition
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

/* ── Auto-resolve fight: build per-combatant turn list then execute ── */
function _autoFightRoaming(run, enc) {
  if (run.phase === 'done') { run.encounterActive = false; return; }
  const now = Date.now();
  const liveBuff = b => b.expiresAt > now;

  const buffPower = run.activeBuffs
    .filter(b => liveBuff(b) && ['powerBoost','selfDouble','runBoost'].includes(b.type))
    .reduce((s, b) => s + b.value, 0);
  const rollBuff  = run.activeBuffs.filter(b => liveBuff(b) && b.type === 'rollBoost').reduce((s,b)=>s+b.value,0);
  const autoWin   = run.activeBuffs.some(b => liveBuff(b) && b.type === 'autoWin');
  const shieldOn  = run.activeBuffs.some(b => liveBuff(b) && b.type === 'shield');
  const activePow = run.party.filter(m=>m.status!=='incapacitated').reduce((s,m)=>s+m.power,0);

  const success     = autoWin || (activePow + buffPower + Math.floor(Math.random()*15) + rollBuff) >= enc.difficulty * 2.2;
  const totalRounds = enc.difficulty <= 7 ? 2 : enc.difficulty <= 14 ? 3 : 4;

  const cfg   = ENCOUNTER_ENEMIES[enc.name] || { count: 1, singular: enc.name };
  const alive = run.party.filter(m => m.status !== 'incapacitated');
  const rnd   = arr => arr[Math.floor(Math.random() * arr.length)];

  // Give enemies HP — low enough to die on success, high enough to survive on failure
  const hpEach = success
    ? Math.ceil(enc.difficulty * 3.5 / cfg.count) + Math.floor(Math.random() * 5)
    : Math.ceil(enc.difficulty * 9   / cfg.count) + Math.floor(Math.random() * 5);

  const enemies = Array.from({ length: cfg.count }, (_, i) => ({
    name: cfg.count > 1 ? `${cfg.singular} #${i + 1}` : cfg.singular,
    hp: hpEach, maxHp: hpEach, alive: true,
  }));

  // Party damage budget — spread across all enemy turns
  const dmgMultiplier  = shieldOn ? 0.5 : 1;
  const totalPartyDmg  = success
    ? Math.floor(enc.damage * 0.20 * dmgMultiplier)   // grazing hits on a win
    : Math.floor(enc.damage       * dmgMultiplier);    // full damage on a loss
  const enemyTurnCount = success
    ? (totalRounds - 1) * cfg.count                   // no enemy attacks in final win-round
    : totalRounds       * cfg.count;

  // Mutable combat state shared across all turns
  const cs = {
    enemies, success,
    remainingPartyDmg: totalPartyDmg,
    turnsLeft: Math.max(1, enemyTurnCount),
  };

  // Build flat turn list
  const turns = [];
  for (let r = 0; r < totalRounds; r++) {
    const isLastRound = r === totalRounds - 1;

    turns.push({ type: 'header', text: `── Round ${r + 1} ──` });

    // Each alive party member attacks a (random) enemy
    alive.forEach(m => {
      turns.push({ type: 'party', member: m, enemy: rnd(enemies) });
    });

    // Collective lunge animation
    turns.push({ type: 'animation', animSuccess: isLastRound ? success : true });

    // Each enemy attacks a (random) party member (skip in the final winning round)
    if (!isLastRound || !success) {
      enemies.forEach(en => {
        turns.push({ type: 'enemy', enemy: en, targetMember: rnd(alive) });
      });
    }

    if (!isLastRound) turns.push({ type: 'pause' });
  }
  turns.push({ type: 'resolve' });

  _executeTurn(run, enc, shieldOn, cs, turns, 0);
  _updateAdventureUIIfWatching(run);
}

/* ── Process one turn, apply real damage, then schedule the next ── */
function _executeTurn(run, enc, shieldOn, cs, turns, idx) {
  if (run.phase === 'done') { run.encounterActive = false; return; }
  if (idx >= turns.length) return;

  const turn = turns[idx];
  const rnd  = arr => arr[Math.floor(Math.random() * arr.length)];
  const fill = (t, v) => t.replace(/\{(\w+)}/g, (_, k) => v[k] ?? k);
  const next = () => _executeTurn(run, enc, shieldOn, cs, turns, idx + 1);

  switch (turn.type) {

    case 'header':
      addCombatLog(run, turn.text, 'dungeon', 'log-round');
      _pushTimer(run, next, 80);
      break;

    case 'party': {
      const m = turn.member;
      if (m.status === 'incapacitated') { next(); return; }

      // Redirect to a live enemy if the pre-assigned target already fell
      let targetEnemy = turn.enemy;
      if (!targetEnemy.alive) {
        const live = cs.enemies.filter(e => e.alive);
        if (!live.length) { next(); return; }   // all enemies already dead
        targetEnemy = rnd(live);
      }

      const mname = m.name.split(' ')[0];
      const tmpl  = rnd(PARTY_ATTACKS[m.cls.name] || ['attacks the {e}']);
      const dmg   = 2 + Math.floor(Math.random() * 7) + Math.floor(m.power / 3);

      // Apply damage to enemy — prevent death on failure
      targetEnemy.hp -= dmg;
      let suffix = '';
      if (targetEnemy.hp <= 0) {
        if (cs.success) {
          targetEnemy.hp = 0; targetEnemy.alive = false;
          suffix = ` ${targetEnemy.name} is slain!`;
        } else {
          targetEnemy.hp = 1;   // enemies cling to life on failure
        }
      }
      addCombatLog(run, `⚔️ ${mname} ${fill(tmpl, { e: targetEnemy.name })}. The ${targetEnemy.name} takes ${dmg} damage.${suffix}`, 'dungeon', 'log-party');
      _pushTimer(run, next, 430);
      break;
    }

    case 'animation':
      run.renderer.onFight(turn.animSuccess, next);
      break;

    case 'enemy': {
      const attacker = turn.enemy;
      if (!attacker.alive) { next(); return; }   // dead enemy skips turn

      const partyAlive = run.party.filter(m => m.status !== 'incapacitated');
      if (!partyAlive.length) { next(); return; }

      // Redirect if pre-assigned target was already incapacitated
      const target = turn.targetMember.status !== 'incapacitated'
        ? turn.targetMember : rnd(partyAlive);

      const tname = target.name.split(' ')[0];
      const limb  = rnd(COMBAT_LIMBS);
      const tmpl  = rnd(ENEMY_ATTACKS[enc.name] || ['strikes at {p}']);

      // Draw this hit's damage from the shared budget
      const avg    = cs.remainingPartyDmg / cs.turnsLeft;
      const dmg    = Math.max(0, Math.round(avg + (Math.random() * avg * 0.6) - (avg * 0.3)));
      const actual = Math.min(dmg, cs.remainingPartyDmg);
      cs.remainingPartyDmg = Math.max(0, cs.remainingPartyDmg - actual);
      cs.turnsLeft         = Math.max(1, cs.turnsLeft - 1);

      // Apply real damage to party member
      if (actual > 0) {
        target.hp -= actual;
        if (target.hp <= 0) { target.hp = 0; target.status = 'incapacitated'; }
        else if (target.hp < target.maxHp * 0.35) target.status = 'wounded';
        run.renderer.updatePartyStatus(run.party);
        _updateAdventureUIIfWatching(run);
      }

      addCombatLog(run, `${enc.icon} ${attacker.name} ${fill(tmpl, { p: tname, limb })}. ${tname} takes ${actual} damage.`, 'dungeon', 'log-enemy');

      // Check for mid-combat party wipe
      if (run.party.every(m => m.status === 'incapacitated')) {
        _pushTimer(run, () => _resolveFightRoaming(run, enc, false, shieldOn, true), 500);
        return;
      }

      _pushTimer(run, next, 430);
      break;
    }

    case 'pause':
      _pushTimer(run, next, 350);
      break;

    case 'resolve':
      _resolveFightRoaming(run, enc, cs.success, shieldOn, true);
      break;
  }
}

/* ── Apply fight result (dmgApplied = damage was already tracked turn-by-turn) ── */
function _resolveFightRoaming(run, enc, success, shieldOn, dmgApplied = false) {
  if (run.phase === 'done') { run.encounterActive = false; return; }

  const floorMult = 1 + (run.floor - 1) * 0.5;   // +50% gold per extra floor

  if (success) {
    const reward = Math.round(enc.reward * floorMult);
    run.goldEarned += reward;
    run.defeatedCount++;
    addLog(`⚔️ [${_partyLabel(run)}] ${enc.name} defeated! +${reward}g`, 'gold');
  } else {
    const partial = Math.floor(enc.reward * 0.4 * floorMult);
    run.goldEarned += partial;
    if (dmgApplied) {
      const fallen = run.party.filter(m => m.status === 'incapacitated').map(m => m.name.split(' ')[0]);
      addLog(`💀 The party is driven back by ${enc.name}!${fallen.length ? ` ${fallen.join(' & ')} fell!` : ''} +${partial}g`, 'dungeon');
    } else {
      const active = run.party.filter(m => m.status !== 'incapacitated');
      const dmgEach = Math.floor(shieldOn ? (enc.damage/active.length)*0.5 : enc.damage/active.length);
      const fallen = [];
      active.forEach(m => {
        m.hp -= dmgEach;
        if (m.hp <= 0) { m.hp=0; m.status='incapacitated'; fallen.push(m.name.split(' ')[0]); }
        else if (m.hp < m.maxHp*0.35) m.status='wounded';
      });
      addLog(`💀 ${enc.name} hit the party!${fallen.length?` ${fallen.join(' & ')} fell!`:''} +${partial}g`, 'dungeon');
    }
  }

  run.renderer.updatePartyStatus(run.party);
  run.renderer.despawnEnemy(null);
  run.encounterActive = false;
  run.currentEncounter = null;
  run.encRoomsCleared++;   // count this room regardless of win/loss

  if (run.party.every(m => m.status === 'incapacitated')) {
    _cancelRunTimers(run);
    _endRun(run, 'wipe');
    return;
  }

  // Short delay after the final room → rest prompt; longer delay between regular rooms
  const delay = run.encRoomsCleared >= ROOMS_PER_FLOOR
    ? 1500 + Math.random() * 1000   // ~1.5–2.5 s → show rest overlay quickly
    : ENCOUNTER_INTERVAL_MIN + Math.random() * (ENCOUNTER_INTERVAL_MAX - ENCOUNTER_INTERVAL_MIN);
  _pushTimer(run, () => _runEncounterLoop(run), delay);

  scheduleSave();
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

  // Lock the return duration NOW (33% of active dungeon time) so waiting on this
  // overlay never inflates it — reused by _doReturnFromRest and the overlay display.
  const elapsedMs = Date.now() - run.startTime;
  run.returnDuration = Math.max(30_000, Math.round(elapsedMs * 0.33));

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
    summaryEl.innerHTML = run.party.map(m => {
      const hpPct  = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
      const cls    = m.status === 'incapacitated' ? 'dead' : m.status === 'wounded' ? 'wounded' : '';
      return `<span class="pause-member ${cls}">${m.cls.icon} ${m.name.split(' ')[0]} ${hpPct}%</span>`;
    }).join('');
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
  if (el('rest-return-time-btn')) el('rest-return-time-btn').textContent = fmtReturn;

  overlay.classList.remove('hidden');
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

/* ── Finalize run ── */
function _endRun(run, result) {
  if (run.phase === 'done') return;
  run.phase = 'done';
  _cancelRunTimers(run);
  if (run.uiTickId) { clearInterval(run.uiTickId); run.uiTickId = null; }
  document.getElementById('rest-overlay')?.classList.add('hidden');

  let gold = run.goldEarned;
  let icon, title, msg;

  if (result === 'victory') {
    const innBonus = Object.values(state.locs).reduce((s,l)=>s+l.level,0);
    const bonus = Math.floor(12 + run.floor * 8 + innBonus * 2);
    gold += bonus;
    icon='🏆'; title='Dungeon Cleared!';
    const floorWord = run.floor > 1 ? `${run.floor} floors` : '1 floor';
    msg=`Party returned from ${floorWord}! ${run.defeatedCount} enemies slain. Earned ${gold} gold (includes +${bonus} completion bonus).`;
    addLog(`🏆 [${_partyLabel(run)}] Cleared ${floorWord}! ${run.defeatedCount} slain · ${gold}g total.`,'gold');
  } else if (result === 'wipe') {
    gold=0; icon='💀'; title='Party Wiped!';
    msg='Every adventurer fell. No gold recovered.';
    addLog(`💀 [${_partyLabel(run)}] Party wiped.`,'dungeon');
  } else {
    const kept=Math.floor(gold*0.5);
    addLog(`📯 [${_partyLabel(run)}] Recalled! Kept ${kept}g.`,'dungeon');
    gold=kept; icon='📯'; title='Party Recalled';
    msg=`Party recalled with ${gold} gold. (Half lost in hasty retreat.)`;
  }

  setGold(state.gold + gold);
  scheduleSave();   // run.phase is 'done' so it's filtered out of the save

  if (state.watchingRunId === run.id) {
    document.getElementById('outcome-icon').textContent  = icon;
    document.getElementById('outcome-title').textContent = title;
    document.getElementById('outcome-msg').textContent   = msg;
    document.getElementById('outcome-overlay').classList.remove('hidden');
    _updateAdventureUIIfWatching(run);
  }
  refreshInnExpeditionStatus();
  _updateDungeonPageIfVisible();

  setTimeout(() => {
    const idx = state.activeRuns.indexOf(run);
    if (idx !== -1) state.activeRuns.splice(idx, 1);
    run.renderer.hide();
    if (state.watchingRunId === run.id) state.watchingRunId = null;

    // Return survivors to the adventurer pool (free of charge) after victory/recall
    if (result !== 'wipe') {
      const survivors = run.party.filter(m => m.status !== 'incapacitated');
      if (survivors.length > 0) addReturningAdventurers(survivors);
    }

    _updateDungeonPageIfVisible();
    refreshInnExpeditionStatus();
  }, 5000);
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
  document.getElementById('outcome-overlay').classList.add('hidden');

  // Pause overlay — shown when session resumes on a mid-expedition traveling run
  const pauseOverlay = document.getElementById('pause-overlay');
  if (pauseOverlay) {
    if (run.paused) _showPauseOverlay(run);
    else pauseOverlay.classList.add('hidden');
  }

  // Rest overlay — shown when party is at the dungeon stairs
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
  document.getElementById('rest-overlay')?.classList.add('hidden');
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
   UI RENDERING
══════════════════════════════ */

function updateAdventureUI(run) {
  if (!run || state.watchingRunId !== run.id) return;
  if (document.getElementById('adventure-page').classList.contains('hidden')) return;

  const now = Date.now();

  // ── Floor progress bar & labels ──────────────────────────────────────────
  let pct = 0;
  let floorLabelText = '';
  let timeText = '';

  if (run.phase === 'returning') {
    // Show return walk progress
    if (run.returnDuration > 0) {
      pct = Math.min(100, ((now - run.returnStartTime) / run.returnDuration) * 100);
      const msLeft = Math.max(0, run.returnDuration - (now - run.returnStartTime));
      timeText = '↩ ' + _fmtMs(msLeft);
    } else {
      pct = 100;
      timeText = '↩ …';
    }
    floorLabelText = `Floor ${run.floor} — Returning`;
  } else if (run.phase === 'resting') {
    pct = 100;
    floorLabelText = `Floor ${run.floor} Complete! 🏕️`;
    timeText = '🏕️ Rest';
  } else {
    // Traveling: show room progress on this floor
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

  // Encounter counter
  const cntEl = document.getElementById('enc-count');
  if (cntEl) cntEl.textContent = run.defeatedCount;

  // Encounter badge
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
    recallBtn.disabled = run.paused || run.phase === 'done' || run.phase === 'returning' || run.phase === 'resting';
  }
}

function renderAdvParty(run) {
  const container = document.getElementById('adv-party');
  if (!container) return;
  const now = Date.now();

  run.party.forEach((m, idx) => {
    const hpPct   = Math.max(0, Math.round((m.hp/m.maxHp)*100));
    const hpColor = hpPct>55?'#4ac96a':hpPct>28?'#e9c84a':'#e94560';
    const used    = run.abilitiesUsed.has(m.id);
    const incap   = m.status === 'incapacitated';
    // Abilities usable any time except returning/done/paused
    const canUse  = !used && !incap && !run.paused && run.phase !== 'returning' && run.phase !== 'done';
    const buff    = run.activeBuffs.find(b => b.memberId===m.id && b.expiresAt>now);

    // Reuse existing card to prevent hover flicker and missed clicks
    let card = container.children[idx];
    if (!card || card.dataset.memberId !== m.id) {
      // Build card once (first render or member change)
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
      // Attach click listener once — useAbility validates canUse internally
      card.querySelector('.ability-btn').addEventListener('click', () => useAbility(run.id, m.id));
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

  // Remove stale cards if party shrinks
  while (container.children.length > run.party.length) {
    container.removeChild(container.lastChild);
  }
}

/* ══════════════════════════════
   HELPERS
══════════════════════════════ */

/* ── Combat flavor-text tables ── */
const COMBAT_LIMBS = ['arm', 'leg', 'shoulder', 'ribs', 'knee', 'shin', 'side', 'forearm'];

/* ── Enemy roster: how many combatants each encounter spawns ── */
const ENCOUNTER_ENEMIES = {
  'Cave Rat Swarm':    { count: 4, singular: 'Cave Rat' },
  'Goblin Lookout':    { count: 1, singular: 'Goblin Lookout' },
  'Animated Bones':    { count: 3, singular: 'Skeleton' },
  'Startled Bats':     { count: 3, singular: 'Bat' },
  'Dungeon Ooze':      { count: 1, singular: 'Dungeon Ooze' },
  'Kobold Trapper':    { count: 1, singular: 'Kobold' },
  'Feral Shroom':      { count: 2, singular: 'Feral Shroom' },
  'Tomb Worm':         { count: 1, singular: 'Tomb Worm' },
  'Dungeon Pixie':     { count: 1, singular: 'Dungeon Pixie' },
  'Crypt Spider':      { count: 1, singular: 'Crypt Spider' },
  'Goblin Ambush':     { count: 3, singular: 'Goblin' },
  'Skeleton Warriors': { count: 3, singular: 'Skeleton' },
  'Giant Spider':      { count: 1, singular: 'Giant Spider' },
  'Bandit Scouts':     { count: 2, singular: 'Bandit Scout' },
  'Mimic Chest':       { count: 1, singular: 'Mimic' },
  'Wraith Swarm':      { count: 3, singular: 'Wraith' },
  'Sludge Cube':       { count: 1, singular: 'Sludge Cube' },
  'Ghoul Pack':        { count: 3, singular: 'Ghoul' },
  'Shadow Wisp':       { count: 2, singular: 'Shadow Wisp' },
  'Hobgoblin Grunt':   { count: 1, singular: 'Hobgoblin' },
  'Cursed Armor':      { count: 1, singular: 'Cursed Armor' },
  'Orc Warband':       { count: 3, singular: 'Orc' },
  'Dark Mage':         { count: 1, singular: 'Dark Mage' },
  'Dragon Hatchling':  { count: 1, singular: 'Dragon Hatchling' },
  'Troll Bridge':      { count: 1, singular: 'Troll' },
  'Vampire Lair':      { count: 2, singular: 'Vampire' },
  'Stone Golem':       { count: 1, singular: 'Stone Golem' },
  'Demon Portal':      { count: 2, singular: 'Demon' },
  'Bandit Camp':       { count: 3, singular: 'Bandit' },
};

const ENEMY_ATTACKS = {
  'Cave Rat Swarm':    ['gnaws at {p}\'s {limb}', 'swarms over {p} with biting teeth', 'scratches {p}\'s {limb} with tiny claws'],
  'Goblin Lookout':    ['hacks at {p}\'s {limb} with a dull scimitar', 'jabs {p} in the ribs with a rusty spear', 'kicks {p} hard in the {limb}'],
  'Animated Bones':    ['claws at {p} with bony fingers', 'rakes across {p}\'s {limb} with a skeletal hand', 'swings a cracked femur at {p}\'s head'],
  'Startled Bats':     ['scratches and bites at {p}\'s face', 'rakes {p}\'s {limb} with tiny claws', 'slams leathery wings into {p}\'s face'],
  'Dungeon Ooze':      ['engulfs {p}\'s {limb} with acidic slime', 'slaps a pseudopod across {p}\'s chest', 'drenches {p}\'s {limb} in corrosive goo'],
  'Kobold Trapper':    ['jabs {p} with a sharpened bone', 'snaps a crude trap on {p}\'s {limb}', 'flings a fistful of caltrops at {p}'],
  'Feral Shroom':      ['lashes {p} with a spore-covered tendril', 'spits a jet of corrosive slime at {p}', 'slams a thick stalk into {p}\'s {limb}'],
  'Tomb Worm':         ['thrashes its bulk into {p}', 'sinks mandibles into {p}\'s {limb}', 'sweeps {p} off balance with its tail'],
  'Dungeon Pixie':     ['flings a razor-sharp pebble at {p}\'s {limb}', 'scratches {p} with tiny barbed claws', 'douses {p} with a vial of burning acid'],
  'Crypt Spider':      ['bites {p}\'s {limb} with venomous fangs', 'wraps {p}\'s {limb} in sticky webbing then bites', 'drops onto {p}\'s shoulder and sinks in its fangs'],
  'Goblin Ambush':     ['hacks at {p}\'s {limb} with a notched blade', 'hurls a stone that cracks off {p}\'s {limb}', 'lunges at {p} with a crude spear'],
  'Skeleton Warriors': ['drives a rusted sword at {p}\'s chest', 'rakes at {p}\'s throat with bony fingers', 'swings a blade across {p}\'s {limb}'],
  'Giant Spider':      ['sinks enormous fangs into {p}\'s {limb}', 'wraps {p} in thick webbing then bites hard', 'stabs {p} with a barbed leg'],
  'Bandit Scouts':     ['slashes at {p}\'s {limb}', 'fires a crossbow bolt that grazes {p}\'s shoulder', 'lands a dirty punch on {p}\'s ribs'],
  'Mimic Chest':       ['bites down hard on {p}\'s hand', 'slams its heavy lid into {p}\'s face', 'locks its jaws on {p}\'s {limb} and shakes'],
  'Wraith Swarm':      ['rakes cold spectral claws through {p}\'s chest', 'drains the warmth from {p}\'s {limb}', 'passes through {p}, leaving icy agony behind'],
  'Sludge Cube':       ['engulfs {p}\'s {limb} in acidic goo', 'slams its gelatinous mass into {p}', 'dissolves part of {p}\'s armour with a tendril'],
  'Ghoul Pack':        ['rakes rotting claws across {p}\'s {limb}', 'bites into {p}\'s shoulder with yellowed teeth', 'slams {p} to the ground and claws at them'],
  'Shadow Wisp':       ['tears through {p}\'s {limb} like cold mist', 'wraps a shadow-tendril around {p}\'s throat', 'blasts {p} with a pulse of necrotic cold'],
  'Hobgoblin Grunt':   ['drives a heavy blade into {p}\'s {limb}', 'headbutts {p} with an iron helmet', 'shoves {p} into the wall then strikes'],
  'Cursed Armor':      ['brings a rusted halberd down on {p}\'s {limb}', 'backhands {p} with an armored gauntlet', 'slams a heavy shield into {p}\'s chest'],
  'Orc Warband':       ['buries an axe into {p}\'s {limb}', 'shoulder-charges {p} with a battle roar', 'drives a war spear at {p}\'s chest'],
  'Dark Mage':         ['blasts {p} with a bolt of dark energy', 'fires a necrotic ray at {p}\'s chest', 'curses {p}\'s {limb} with withering magic'],
  'Dragon Hatchling':  ['breathes a cone of fire over {p}', 'rakes {p} with razor-sharp claws', 'slams {p} with its heavy tail'],
  'Troll Bridge':      ['swings a massive club at {p}\'s {limb}', 'hurls {p} against the stone wall', 'stomps on {p}\'s foot with a boulder-like heel'],
  'Vampire Lair':      ['sinks fangs into {p}\'s neck, draining vitality', 'claws across {p}\'s {limb} in a pale blur', 'wraps cold hands around {p}\'s throat'],
  'Stone Golem':       ['slams a granite fist into {p}\'s chest', 'grinds a rocky heel onto {p}\'s foot', 'backhands {p} with a blow like a falling stone'],
  'Demon Portal':      ['lashes {p} with a barbed tail', 'blasts {p} with a bolt of hellfire', 'rakes {p}\'s {limb} with infernal claws'],
  'Bandit Camp':       ['slashes at {p}\'s {limb} with a worn shortsword', 'shoves {p} and follows with a stab', 'fires a crossbow bolt at {p}\'s chest'],
};

const PARTY_ATTACKS = {
  'Fighter':  ['drives their sword deep into the {e}', 'slashes the {e} with a powerful overhead strike', 'charges the {e} with a shield bash then thrusts'],
  'Rogue':    ['darts behind the {e} and drives a dagger between its ribs', 'slips from the shadows and slashes the {e}', 'delivers a precise backstab to the {e}'],
  'Mage':     ['hurls a magic missile at the {e}', 'blasts the {e} with a lance of arcane fire', 'gestures sharply and a bolt of force strikes the {e}'],
  'Cleric':   ['calls down divine light upon the {e}', 'smites the {e} with a glowing mace strike', 'channels holy energy into a crushing blow on the {e}'],
  'Ranger':   ['looses a precise arrow into the {e}', 'fires two quick shots at the {e}', 'draws back and releases a well-aimed shot at the {e}'],
  'Paladin':  ['charges the {e} with a blessed warhammer', 'smites the {e} with a burst of divine radiance', 'drives a holy-edged blade into the {e}'],
  'Bard':     ['distracts the {e} with a mocking verse, then slashes it', 'strums a dissonant chord that staggers the {e}', 'performs a quick blade flourish across the {e}'],
  'Druid':    ['calls thorny vines to lash the {e}', 'summons a gust of wind that sends the {e} reeling', 'claws the {e} with briefly shapeshifted hands'],
  'Warlock':  ['blasts the {e} with crackling eldritch energy', 'fires a hex bolt that tears through the {e}', 'points a cursed finger and looses a dark beam at the {e}'],
  'Monk':     ['delivers a rapid flurry of blows to the {e}', 'lands a flying kick squarely on the {e}', 'strikes three precise pressure points on the {e}'],
};

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

function _phaseTitle(run) {
  if (run.phase === 'resting')   return `Floor ${run.floor} Cleared — Resting`;
  if (run.phase === 'returning') return 'Returning to Inn';
  if (run.phase === 'done')      return 'Expedition Complete';
  return `Floor ${run.floor} — Room ${run.roomIdx}/${ROOMS_PER_FLOOR}`;
}

function _phaseDesc(run) {
  if (run.paused) return '⏸️ Session resumed — continue the expedition or return to the inn.';
  switch (run.phase) {
    case 'traveling':  return '🥾 Your party pushes deeper into the dungeon…';
    case 'resting':    return '🏕️ The party rests at the dungeon stairs. Descend or return to the inn?';
    case 'returning':  return '🏠 Your party makes the long walk back…';
    case 'done':       return '✅ Expedition complete.';
    default:           return '';
  }
}

/* Sub-second UI refresh for smooth timers */
setInterval(() => {
  if (!state.watchingRunId) return;
  const run = state.activeRuns.find(r=>r.id===state.watchingRunId);
  if (run && !document.getElementById('adventure-page').classList.contains('hidden'))
    updateAdventureUI(run);
}, 500);
