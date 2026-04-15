/* ═══════════════════════════════════════════════════════
   DUNGEON.JS — Applicant generation and party management
   Pure game logic — UI refresh calls are typeof-guarded.
═══════════════════════════════════════════════════════ */

let applicants            = [];
let partyIds              = [];
let _applicantRosterLevel = -1;  // guest-room level at last full generation

/* ── Hire cost: rarity base + power × 2 (returning survivors are always free) ── */
function _hireCost(app) {
  if (app.returning) return 0;
  const base = { common: 5, uncommon: 15, rare: 35, epic: 65, legendary: 110 };
  return (base[app.rarity.id] ?? 5) + app.power * 2;
}

/* ── Return survivors to the front of the applicant pool at zero cost ── */
function addReturningAdventurers(survivors) {
  const returnees = survivors.map(m => ({
    id:        m.id,
    name:      m.name,
    cls:       m.cls,
    rarity:    m.rarity,
    power:     m.power,
    maxHp:     m.maxHp,
    returning: true,
  }));
  applicants = applicants.filter(a => !returnees.some(r => r.id === a.id));
  applicants = [...returnees, ...applicants];
  typeof renderApplicantGrid  === 'function' && renderApplicantGrid();
  typeof _updateApplicantLabel === 'function' && _updateApplicantLabel();
}

/* ── Weighted rarity picker ── */
function pickRarity(guestLv) {
  const w = RARITY_WEIGHTS[Math.min(guestLv, 5)];
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return RARITIES[i]; }
  return RARITIES[0];
}

/* ── Generate a single random applicant ── */
function generateApplicant(guestLv) {
  const rarity = pickRarity(guestLv);
  const cls    = CLASSES[Math.floor(Math.random() * CLASSES.length)];
  const name   = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${EPITHETS[Math.floor(Math.random() * EPITHETS.length)]}`;
  const power  = Math.floor(Math.random() * (rarity.range[1] - rarity.range[0] + 1)) + rarity.range[0];
  const maxHp  = Math.floor(cls.baseHp * rarity.hpMult + power * 3);
  return { id: Math.random().toString(36).slice(2, 9), name, cls, rarity, power, maxHp };
}

/* ── (Re)generate the full applicant pool ── */
function _generateApplicants() {
  const guestLv = state.locs.guestroom.level;
  const count   = 4 + guestLv * 2;
  applicants            = Array.from({ length: count }, () => generateApplicant(guestLv));
  _applicantRosterLevel = guestLv;
  typeof _updateApplicantLabel === 'function' && _updateApplicantLabel();
}

/* ── Add extra applicants when Guest Room is upgraded ── */
function _topUpApplicants() {
  const guestLv = state.locs.guestroom.level;
  if (guestLv <= _applicantRosterLevel) return;
  const levelsGained = guestLv - _applicantRosterLevel;
  const toAdd        = levelsGained * 2;
  for (let i = 0; i < toAdd; i++) applicants.push(generateApplicant(guestLv));
  _applicantRosterLevel = guestLv;
  typeof _updateApplicantLabel === 'function' && _updateApplicantLabel();
}

/* ── Re-roll cost scales with Guest Room level ── */
function _rerollCost() {
  return 10 + state.locs.guestroom.level * 5;
}

/* ── Spend gold to refresh the adventurer roster ── */
function rerollApplicants() {
  const rollCost = _rerollCost();
  const partyRefund = _partyRefundTotal();
  if (state.gold + partyRefund < rollCost) {
    typeof addLog === 'function' && addLog(`❌ Not enough gold to re-roll! Need ${rollCost}g.`, 'dungeon');
    return { success: false };
  }
  typeof setGold === 'function' && setGold(state.gold + partyRefund - rollCost);
  partyIds = [];
  _generateApplicants();
  typeof renderPartySlots    === 'function' && renderPartySlots();
  typeof renderApplicantGrid === 'function' && renderApplicantGrid();
  typeof updateVentureBtn    === 'function' && updateVentureBtn();
  typeof addLog === 'function' && addLog(`🎲 A new batch of adventurers arrives at the inn. (−${rollCost}g)`, 'gold');
  return { success: true, gold: state.gold, applicants };
}

/* ── Remove deployed members from pool after venturing ── */
function postDeploy() {
  applicants = applicants.filter(a => !partyIds.includes(a.id));
  partyIds   = [];
}

/* ── Remove all members from the party (refund hire costs) ── */
function clearParty() {
  if (partyIds.length === 0) return { success: false };
  const refund = _partyRefundTotal();
  if (refund > 0) typeof setGold === 'function' && setGold(state.gold + refund);
  partyIds = [];
  typeof renderPartySlots    === 'function' && renderPartySlots();
  typeof renderApplicantGrid === 'function' && renderApplicantGrid();
  typeof updateVentureBtn    === 'function' && updateVentureBtn();
  return { success: true, gold: state.gold };
}

/* ── Toggle a member in/out of the party ── */
function toggleMember(id) {
  const idx = partyIds.indexOf(id);
  if (idx !== -1) {
    partyIds.splice(idx, 1);
    const app = applicants.find(a => a.id === id);
    if (app) typeof setGold === 'function' && setGold(state.gold + _hireCost(app));
  } else {
    if (partyIds.length >= 4) return { success: false, reason: 'party_full' };
    const app = applicants.find(a => a.id === id);
    if (!app) return { success: false, reason: 'not_found' };
    const cost = _hireCost(app);
    if (state.gold < cost) {
      typeof addLog === 'function' && addLog(`❌ Not enough gold to hire ${app.name.split(' ')[0]}! (Need ${cost}g)`, 'dungeon');
      return { success: false, reason: 'insufficient_gold' };
    }
    partyIds.push(id);
    typeof setGold === 'function' && setGold(state.gold - cost);
  }
  typeof renderPartySlots    === 'function' && renderPartySlots();
  typeof renderApplicantGrid === 'function' && renderApplicantGrid();
  typeof updateVentureBtn    === 'function' && updateVentureBtn();
  return { success: true, partyIds: [...partyIds], gold: state.gold };
}

/* ── Handle a drag-drop onto a party slot ── */
function _dropOnSlot(draggedId, slotIdx) {
  const currentId = partyIds[slotIdx];
  if (currentId === draggedId) return;

  const fromSlot = partyIds.indexOf(draggedId);

  if (fromSlot !== -1 && currentId !== undefined) {
    // Swap two filled slots — no gold change
    partyIds[fromSlot] = currentId;
    partyIds[slotIdx]  = draggedId;
  } else if (fromSlot !== -1) {
    // Reorder within party — no gold change
    partyIds.splice(fromSlot, 1);
    partyIds.splice(Math.min(slotIdx, partyIds.length), 0, draggedId);
  } else if (currentId !== undefined) {
    // Grid-to-filled-slot: swap, adjust cost delta
    const newApp = applicants.find(a => a.id === draggedId);
    const oldApp = applicants.find(a => a.id === currentId);
    if (!newApp) return;
    const netCost = _hireCost(newApp) - (oldApp ? _hireCost(oldApp) : 0);
    if (netCost > state.gold) {
      typeof addLog === 'function' && addLog(`❌ Not enough gold to hire ${newApp.name.split(' ')[0]}! (Need ${_hireCost(newApp)}g)`, 'dungeon');
      return;
    }
    if (netCost !== 0) typeof setGold === 'function' && setGold(state.gold - netCost);
    partyIds[slotIdx] = draggedId;
  } else {
    // Grid-to-empty-slot: hire
    if (partyIds.length >= 4) return;
    const app = applicants.find(a => a.id === draggedId);
    if (!app) return;
    const cost = _hireCost(app);
    if (state.gold < cost) {
      typeof addLog === 'function' && addLog(`❌ Not enough gold to hire ${app.name.split(' ')[0]}! (Need ${cost}g)`, 'dungeon');
      return;
    }
    typeof setGold === 'function' && setGold(state.gold - cost);
    partyIds.push(draggedId);
  }

  typeof renderPartySlots    === 'function' && renderPartySlots();
  typeof renderApplicantGrid === 'function' && renderApplicantGrid();
  typeof updateVentureBtn    === 'function' && updateVentureBtn();
}

/* ── Sum refund value of current party members ── */
function _partyRefundTotal() {
  return partyIds.reduce((sum, id) => {
    const app = applicants.find(a => a.id === id);
    return sum + (app ? _hireCost(app) : 0);
  }, 0);
}

/* ── Return current party members ── */
function getParty() {
  return partyIds.map(id => applicants.find(a => a.id === id));
}

