/* ═══════════════════════════════════════════════════════
   COMBAT.JS — Turn-by-turn fight simulation
   Builds a flat turn list, executes it asynchronously via
   _pushTimer, then resolves the encounter outcome.
   Depends on: combat-tables.js, adventure.js (helpers)
═══════════════════════════════════════════════════════ */

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

