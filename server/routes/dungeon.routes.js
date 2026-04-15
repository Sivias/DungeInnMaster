/**
 * dungeon.routes.js — Dungeon / party management API endpoints
 *
 * GET  /api/dungeon/applicants         → { applicants, partyIds, rosterLevel }
 * POST /api/dungeon/reroll             → { success, gold, applicants }
 * POST /api/dungeon/hire/:memberId     → { success, partyIds, gold }
 * POST /api/dungeon/clear              → { success, gold }
 * POST /api/dungeon/deploy             → { success, runId }
 */

const express = require('express');
const router  = express.Router();

// const { applicants, partyIds, _applicantRosterLevel,
//         rerollApplicants, toggleMember, clearParty,
//         getParty, postDeploy }        = require('../game/dungeon');
// const { startRun }                    = require('../game/adventure');
// const { state, maxParties }           = require('../game/state');

/* ── GET /api/dungeon/applicants ── */
router.get('/applicants', (req, res) => {
  // res.json({ applicants, partyIds, rosterLevel: _applicantRosterLevel });
  res.json({ applicants: [], partyIds: [], rosterLevel: 0 });
});

/* ── POST /api/dungeon/reroll ── */
router.post('/reroll', (req, res) => {
  // res.json(rerollApplicants());
  res.json({ success: false, reason: 'not_implemented' });
});

/* ── POST /api/dungeon/hire/:memberId ── */
router.post('/hire/:memberId', (req, res) => {
  // res.json(toggleMember(req.params.memberId));
  res.json({ success: false, reason: 'not_implemented' });
});

/* ── POST /api/dungeon/clear ── */
router.post('/clear', (req, res) => {
  // res.json(clearParty());
  res.json({ success: false, reason: 'not_implemented' });
});

/* ── POST /api/dungeon/deploy ── */
router.post('/deploy', (req, res) => {
  // const party = getParty();
  // postDeploy();
  // const run = startRun(party);
  // res.json({ success: true, runId: run.id });
  res.json({ success: false, reason: 'not_implemented' });
});

module.exports = router;

