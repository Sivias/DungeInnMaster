/* ═══════════════════════════════════════════════════════
   ADVENTURE.JS — Real-time dungeon exploration engine
   Game logic and run timers live here.
   All DOM / renderer calls are typeof-guarded or use
   optional chaining so this file is Node.js-safe.
   On the server, replace timer callbacks with WebSocket
   state-push events and strip renderer references.
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════
   RUN CREATION
══════════════════════════════ */

function createRun(party) {
  const id  = Math.random().toString(36).slice(2, 9);
  const run = {
    id,
    party: party.map(m => {
      const maxHp = Math.floor(m.cls.baseHp * m.rarity.hpMult + m.power * 3);
      return { ...m, hp: maxHp, maxHp, status: 'active' };
    }),
    phase:            'traveling',
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
    timers:           [],
    uiTickId:         null,
    // Renderer is a client-only dependency — null when running on the server
    renderer: typeof DungeonRenderer !== 'undefined' ? new DungeonRenderer() : null,
  };
  run.renderer?.setup(run.party);
  return run;
}

function startRun(party) {
  const run = createRun(party);
  state.activeRuns.push(run);
  _scheduleRunTimeline(run);
  typeof addLog === 'function' && addLog(`⚔️ ${_partyLabel(run)} ventures into the dungeon!`, 'dungeon');
  typeof watchRun === 'function' && watchRun(run.id);
  typeof _updateDungeonPageIfVisible  === 'function' && _updateDungeonPageIfVisible();
  typeof refreshInnExpeditionStatus   === 'function' && refreshInnExpeditionStatus();
  return run;
}

/* ══════════════════════════════
   RUN TIMELINE
══════════════════════════════ */

function _scheduleRunTimeline(run) {
  const firstDelay = 8000 + Math.random() * 5000;
  _pushTimer(run, () => _runEncounterLoop(run), firstDelay);

  // UI ticker — fires every 500 ms to refresh inn pills (client only)
  run.uiTickId = setInterval(() => {
    if (run.phase === 'done') { clearInterval(run.uiTickId); run.uiTickId = null; return; }
    typeof refreshInnExpeditionStatus === 'function' && refreshInnExpeditionStatus();
  }, 500);
}

/* ── Recursive encounter loop ── */
function _runEncounterLoop(run) {
  if (run.phase === 'done' || run.phase === 'returning' || run.phase === 'resting') return;
  if (run.encounterActive) return;
  if (run.encRoomsCleared >= ROOMS_PER_FLOOR) {
    _enterRestRoom(run);
    return;
  }
  _triggerRoomEncounter(run);
}

/* ── Advance to the next room and spawn an encounter ── */
function _triggerRoomEncounter(run) {
  if (run.phase === 'done' || run.phase !== 'traveling' || run.encounterActive) return;
  run.encounterActive = true;
  run.roomIdx++;

  const enc = _pickEncounter(run);
  run.currentEncounter = enc;

  typeof addLog === 'function' && addLog(`👁️ [${_partyLabel(run)}] Room ${run.roomIdx}… ${enc.icon} ${enc.name}!`, 'dungeon');

  const afterSpawnCb = () => {
    if (run.phase === 'done') { run.encounterActive = false; return; }
    _pushTimer(run, () => _autoFightRoaming(run, enc), 1200 + Math.random() * 800);
    typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  };

  if (run.renderer) {
    run.renderer.moveToRoomAndSpawn(run.roomIdx, enc, afterSpawnCb);
  } else {
    _pushTimer(run, afterSpawnCb, 500);
  }

  typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  typeof refreshInnExpeditionStatus   === 'function' && refreshInnExpeditionStatus();
}

/* ── Build a per-combatant turn list and execute it ── */
function _autoFightRoaming(run, enc) {
  if (run.phase === 'done') { run.encounterActive = false; return; }
  const now = Date.now();
  const liveBuff = b => b.expiresAt > now;

  const buffPower = run.activeBuffs
    .filter(b => liveBuff(b) && ['powerBoost','selfDouble','runBoost'].includes(b.type))
    .reduce((s, b) => s + b.value, 0);
  const rollBuff  = run.activeBuffs.filter(b => liveBuff(b) && b.type === 'rollBoost').reduce((s,b)=>s+b.value, 0);
  const autoWin   = run.activeBuffs.some(b => liveBuff(b) && b.type === 'autoWin');
  const shieldOn  = run.activeBuffs.some(b => liveBuff(b) && b.type === 'shield');
  const activePow = run.party.filter(m=>m.status!=='incapacitated').reduce((s,m)=>s+m.power, 0);

  const success     = autoWin || (activePow + buffPower + Math.floor(Math.random()*15) + rollBuff) >= enc.difficulty * 2.2;
  const totalRounds = enc.difficulty <= 7 ? 2 : enc.difficulty <= 14 ? 3 : 4;

  const cfg   = ENCOUNTER_ENEMIES[enc.name] || { count: 1, singular: enc.name };
  const alive = run.party.filter(m => m.status !== 'incapacitated');
  const rnd   = arr => arr[Math.floor(Math.random() * arr.length)];

  const hpEach = success
    ? Math.ceil(enc.difficulty * 3.5 / cfg.count) + Math.floor(Math.random() * 5)
    : Math.ceil(enc.difficulty * 9   / cfg.count) + Math.floor(Math.random() * 5);

  const enemies = Array.from({ length: cfg.count }, (_, i) => ({
    name: cfg.count > 1 ? `${cfg.singular} #${i + 1}` : cfg.singular,
    hp: hpEach, maxHp: hpEach, alive: true,
  }));

  const dmgMultiplier  = shieldOn ? 0.5 : 1;
  const totalPartyDmg  = success
    ? Math.floor(enc.damage * 0.20 * dmgMultiplier)
    : Math.floor(enc.damage       * dmgMultiplier);
  const enemyTurnCount = success
    ? (totalRounds - 1) * cfg.count
    : totalRounds       * cfg.count;

  const cs = {
    enemies, success,
    remainingPartyDmg: totalPartyDmg,
    turnsLeft: Math.max(1, enemyTurnCount),
  };

  const turns = [];
  for (let r = 0; r < totalRounds; r++) {
    const isLastRound = r === totalRounds - 1;
    turns.push({ type: 'header', text: `── Round ${r + 1} ──` });
    alive.forEach(m => { turns.push({ type: 'party', member: m, enemy: rnd(enemies) }); });
    turns.push({ type: 'animation', animSuccess: isLastRound ? success : true });
    if (!isLastRound || !success) {
      enemies.forEach(en => { turns.push({ type: 'enemy', enemy: en, targetMember: rnd(alive) }); });
    }
    if (!isLastRound) turns.push({ type: 'pause' });
  }
  turns.push({ type: 'resolve' });

  _executeTurn(run, enc, shieldOn, cs, turns, 0);
  typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
}

/* ── Process one turn, then schedule the next ── */
function _executeTurn(run, enc, shieldOn, cs, turns, idx) {
  if (run.phase === 'done') { run.encounterActive = false; return; }
  if (idx >= turns.length) return;

  const turn = turns[idx];
  const rnd  = arr => arr[Math.floor(Math.random() * arr.length)];
  const fill = (t, v) => t.replace(/\{(\w+)}/g, (_, k) => v[k] ?? k);
  const next = () => _executeTurn(run, enc, shieldOn, cs, turns, idx + 1);

  switch (turn.type) {

    case 'header':
      typeof addCombatLog === 'function' && addCombatLog(run, turn.text, 'dungeon', 'log-round');
      _pushTimer(run, next, 80);
      break;

    case 'party': {
      const m = turn.member;
      if (m.status === 'incapacitated') { next(); return; }
      let targetEnemy = turn.enemy;
      if (!targetEnemy.alive) {
        const live = cs.enemies.filter(e => e.alive);
        if (!live.length) { next(); return; }
        targetEnemy = rnd(live);
      }
      const mname = m.name.split(' ')[0];
      const tmpl  = rnd(PARTY_ATTACKS[m.cls.name] || ['attacks the {e}']);
      const dmg   = 2 + Math.floor(Math.random() * 7) + Math.floor(m.power / 3);
      targetEnemy.hp -= dmg;
      let suffix = '';
      if (targetEnemy.hp <= 0) {
        if (cs.success) { targetEnemy.hp = 0; targetEnemy.alive = false; suffix = ` ${targetEnemy.name} is slain!`; }
        else            { targetEnemy.hp = 1; }
      }
      typeof addCombatLog === 'function' && addCombatLog(run, `⚔️ ${mname} ${fill(tmpl, { e: targetEnemy.name })}. The ${targetEnemy.name} takes ${dmg} damage.${suffix}`, 'dungeon', 'log-party');
      _pushTimer(run, next, 430);
      break;
    }

    case 'animation':
      if (run.renderer) {
        run.renderer.onFight(turn.animSuccess, next);
      } else {
        _pushTimer(run, next, 200);
      }
      break;

    case 'enemy': {
      const attacker = turn.enemy;
      if (!attacker.alive) { next(); return; }
      const partyAlive = run.party.filter(m => m.status !== 'incapacitated');
      if (!partyAlive.length) { next(); return; }
      const target = turn.targetMember.status !== 'incapacitated' ? turn.targetMember : rnd(partyAlive);
      const tname  = target.name.split(' ')[0];
      const limb   = rnd(COMBAT_LIMBS);
      const tmpl   = rnd(ENEMY_ATTACKS[enc.name] || ['strikes at {p}']);

      const avg    = cs.remainingPartyDmg / cs.turnsLeft;
      const dmg    = Math.max(0, Math.round(avg + (Math.random() * avg * 0.6) - (avg * 0.3)));
      const actual = Math.min(dmg, cs.remainingPartyDmg);
      cs.remainingPartyDmg = Math.max(0, cs.remainingPartyDmg - actual);
      cs.turnsLeft         = Math.max(1, cs.turnsLeft - 1);

      if (actual > 0) {
        target.hp -= actual;
        if (target.hp <= 0) { target.hp = 0; target.status = 'incapacitated'; }
        else if (target.hp < target.maxHp * 0.35) target.status = 'wounded';
        run.renderer?.updatePartyStatus(run.party);
        typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
      }

      typeof addCombatLog === 'function' && addCombatLog(run, `${enc.icon} ${attacker.name} ${fill(tmpl, { p: tname, limb })}. ${tname} takes ${actual} damage.`, 'dungeon', 'log-enemy');

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

/* ── Apply fight result ── */
function _resolveFightRoaming(run, enc, success, shieldOn, dmgApplied = false) {
  if (run.phase === 'done') { run.encounterActive = false; return; }

  const floorMult = 1 + (run.floor - 1) * 0.5;

  if (success) {
    const reward = Math.round(enc.reward * floorMult);
    run.goldEarned += reward;
    run.defeatedCount++;
    typeof addLog === 'function' && addLog(`⚔️ [${_partyLabel(run)}] ${enc.name} defeated! +${reward}g`, 'gold');
  } else {
    const partial = Math.floor(enc.reward * 0.4 * floorMult);
    run.goldEarned += partial;
    if (dmgApplied) {
      const fallen = run.party.filter(m => m.status === 'incapacitated').map(m => m.name.split(' ')[0]);
      typeof addLog === 'function' && addLog(`💀 The party is driven back by ${enc.name}!${fallen.length ? ` ${fallen.join(' & ')} fell!` : ''} +${partial}g`, 'dungeon');
    } else {
      const active = run.party.filter(m => m.status !== 'incapacitated');
      const dmgEach = Math.floor(shieldOn ? (enc.damage/active.length)*0.5 : enc.damage/active.length);
      const fallen  = [];
      active.forEach(m => {
        m.hp -= dmgEach;
        if (m.hp <= 0) { m.hp=0; m.status='incapacitated'; fallen.push(m.name.split(' ')[0]); }
        else if (m.hp < m.maxHp*0.35) m.status='wounded';
      });
      typeof addLog === 'function' && addLog(`💀 ${enc.name} hit the party!${fallen.length?` ${fallen.join(' & ')} fell!`:''} +${partial}g`, 'dungeon');
    }
  }

  run.renderer?.updatePartyStatus(run.party);
  run.renderer?.despawnEnemy(null);
  run.encounterActive  = false;
  run.currentEncounter = null;
  run.encRoomsCleared++;

  if (run.party.every(m => m.status === 'incapacitated')) {
    _cancelRunTimers(run);
    _endRun(run, 'wipe');
    return;
  }

  const delay = run.encRoomsCleared >= ROOMS_PER_FLOOR
    ? 1500 + Math.random() * 1000
    : ENCOUNTER_INTERVAL_MIN + Math.random() * (ENCOUNTER_INTERVAL_MAX - ENCOUNTER_INTERVAL_MIN);
  _pushTimer(run, () => _runEncounterLoop(run), delay);

  typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  typeof refreshInnExpeditionStatus   === 'function' && refreshInnExpeditionStatus();
}

/* ── Weighted encounter selection scaled by floor and party power ── */
function _pickEncounter(run) {
  const roomProgress = run.roomIdx / ROOMS_PER_FLOOR;
  const floorBonus   = (run.floor - 1) * 10;
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

/* ── Begin the return walk to the inn ── */
function _beginReturn(run) {
  if (run.phase === 'done') return;
  run.phase = 'returning';
  run.renderer?.onRetreat(null);
  typeof addLog === 'function' && addLog(`🏠 [${_partyLabel(run)}] Returning to the inn…`, 'dungeon');
  typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  typeof refreshInnExpeditionStatus   === 'function' && refreshInnExpeditionStatus();
}

/* ── Party reaches the floor exit — rest, heal, offer descent/return ── */
function _enterRestRoom(run) {
  if (run.phase !== 'traveling') return;
  run.phase = 'resting';

  // Lock return duration now so it stays fixed while the player deliberates
  const elapsedMs = Date.now() - run.startTime;
  run.returnDuration = Math.max(30_000, Math.round(elapsedMs * 0.33));

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
  run.renderer?.updatePartyStatus(run.party);

  const healMsg = recovered.length ? ` Rest: ${recovered.join(', ')}.` : '';
  typeof addLog === 'function' && addLog(`🏕️ [${_partyLabel(run)}] Floor ${run.floor} cleared!${healMsg}`, 'dungeon');

  if (state.watchingRunId === run.id && typeof _showRestOverlay === 'function') _showRestOverlay(run);
  typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  typeof refreshInnExpeditionStatus   === 'function' && refreshInnExpeditionStatus();
}

/* ── Player chooses to descend to the next floor ── */
function descendFloor(runId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || run.phase !== 'resting') return;

  typeof _hideRestOverlay === 'function' && _hideRestOverlay();

  run.floor++;
  run.roomIdx         = 0;
  run.encRoomsCleared = 0;
  run.floorStartTime  = Date.now();
  run.phase           = 'traveling';

  typeof addLog === 'function' && addLog(`⬇️ [${_partyLabel(run)}] Descending to Floor ${run.floor}!`, 'dungeon');

  const afterFloorReset = () => {
    if (run.phase !== 'traveling') return;
    const delay = 6000 + Math.random() * 4000;
    _pushTimer(run, () => _runEncounterLoop(run), delay);
    typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  };

  if (run.renderer) {
    run.renderer.startNewFloor(afterFloorReset);
  } else {
    _pushTimer(run, afterFloorReset, 100);
  }

  typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  typeof refreshInnExpeditionStatus   === 'function' && refreshInnExpeditionStatus();
}

/* ── Player chooses to return to the inn from the rest room ── */
function returnFromRest(runId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run || run.phase !== 'resting') return;

  typeof _hideRestOverlay === 'function' && _hideRestOverlay();
  _cancelRunTimers(run);

  run.returnStartTime = Date.now();
  _beginReturn(run);
  _pushTimer(run, () => _endRun(run, 'victory'), run.returnDuration);
}

/* ── Finalize a run with a result ── */
function _endRun(run, result) {
  if (run.phase === 'done') return;
  run.phase = 'done';
  _cancelRunTimers(run);
  if (run.uiTickId) { clearInterval(run.uiTickId); run.uiTickId = null; }
  typeof _hideRestOverlay === 'function' && _hideRestOverlay();

  let gold = run.goldEarned;
  let icon, title, msg;

  if (result === 'victory') {
    const innBonus = Object.values(state.locs).reduce((s,l)=>s+l.level, 0);
    const bonus    = Math.floor(12 + run.floor * 8 + innBonus * 2);
    gold += bonus;
    icon='🏆'; title='Dungeon Cleared!';
    const floorWord = run.floor > 1 ? `${run.floor} floors` : '1 floor';
    msg = `Party returned from ${floorWord}! ${run.defeatedCount} enemies slain. Earned ${gold} gold (includes +${bonus} completion bonus).`;
    typeof addLog === 'function' && addLog(`🏆 [${_partyLabel(run)}] Cleared ${floorWord}! ${run.defeatedCount} slain · ${gold}g total.`, 'gold');
  } else if (result === 'wipe') {
    gold=0; icon='💀'; title='Party Wiped!';
    msg='Every adventurer fell. No gold recovered.';
    typeof addLog === 'function' && addLog(`💀 [${_partyLabel(run)}] Party wiped.`, 'dungeon');
  } else {
    const kept = Math.floor(gold * 0.5);
    typeof addLog === 'function' && addLog(`📯 [${_partyLabel(run)}] Recalled! Kept ${kept}g.`, 'dungeon');
    gold=kept; icon='📯'; title='Party Recalled';
    msg=`Party recalled with ${gold} gold. (Half lost in hasty retreat.)`;
  }

  typeof setGold === 'function' && setGold(state.gold + gold);

  if (state.watchingRunId === run.id) {
    typeof _showOutcomeOverlay === 'function' && _showOutcomeOverlay(icon, title, msg);
    typeof _updateAdventureUIIfWatching === 'function' && _updateAdventureUIIfWatching(run);
  }
  typeof refreshInnExpeditionStatus  === 'function' && refreshInnExpeditionStatus();
  typeof _updateDungeonPageIfVisible === 'function' && _updateDungeonPageIfVisible();

  setTimeout(() => {
    const idx = state.activeRuns.indexOf(run);
    if (idx !== -1) state.activeRuns.splice(idx, 1);
    run.renderer?.hide();
    if (state.watchingRunId === run.id) state.watchingRunId = null;

    if (result !== 'wipe') {
      const survivors = run.party.filter(m => m.status !== 'incapacitated');
      if (survivors.length > 0) addReturningAdventurers(survivors);
    }

    typeof _updateDungeonPageIfVisible === 'function' && _updateDungeonPageIfVisible();
    typeof refreshInnExpeditionStatus  === 'function' && refreshInnExpeditionStatus();
  }, 5000);
}

/* ══════════════════════════════
   PLAYER ACTIONS
══════════════════════════════ */

/* ── Recall the currently watched party ── */
function recallParty() {
  const run = state.activeRuns.find(r => r.id === state.watchingRunId);
  if (!run || run.phase === 'done' || run.phase === 'returning') return;
  if (run.phase === 'resting') { returnFromRest(run.id); return; }
  _cancelRunTimers(run);
  run.renderer?.onRetreat(null);
  _endRun(run, 'recall');
}

/* ── Activate an adventurer ability mid-run ── */
function useAbility(runId, memberId) {
  const run = state.activeRuns.find(r => r.id === runId);
  if (!run) return;
  if (run.phase === 'returning' || run.phase === 'done') return;
  if (run.abilitiesUsed.has(memberId)) return;
  const m = run.party.find(p => p.id === memberId);
  if (!m || m.status === 'incapacitated') return;
  run.abilitiesUsed.add(memberId);

  const ab       = m.cls.ability;
  const who      = m.name.split(' ')[0];
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
  typeof addLog === 'function' && addLog(msg, 'dungeon');
  run.renderer?.onAbility(m, ab.type);
  run.renderer?.updatePartyStatus(run.party);
  typeof updateAdventureUI === 'function' && updateAdventureUI(run);
}

/* ══════════════════════════════
   HELPERS
══════════════════════════════ */

function _cancelRunTimers(run) {
  run.timers.forEach(t => { clearTimeout(t); clearInterval(t); });
  run.timers = [];
}

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
  switch (run.phase) {
    case 'traveling':  return '🥾 Your party pushes deeper into the dungeon…';
    case 'resting':    return '🏕️ The party rests at the dungeon stairs. Descend or return to the inn?';
    case 'returning':  return '🏠 Your party makes the long walk back…';
    case 'done':       return '✅ Expedition complete.';
    default:           return '';
  }
}

