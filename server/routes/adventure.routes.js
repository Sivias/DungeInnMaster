/**
 * adventure.routes.js — Active expedition API endpoints
 *
 * GET  /api/adventure/runs                       → serialisable run snapshots[]
 * POST /api/adventure/recall/:runId              → { success }
 * POST /api/adventure/descend/:runId             → { success }
 * POST /api/adventure/return/:runId              → { success }
 * POST /api/adventure/ability/:runId/:memberId   → { success }
 *
 * Note: real-time run state should be pushed via WebSocket rather than
 * polled — these REST endpoints cover discrete player actions only.
 */

const express = require('express');
const router  = express.Router();

// const { state }                                          = require('../game/state');
// const { recallParty, descendFloor, returnFromRest,
//         useAbility }                                     = require('../game/adventure');

/* ── GET /api/adventure/runs ── */
router.get('/runs', (req, res) => {
  // const runs = state.activeRuns.map(r => ({
  //   id: r.id, phase: r.phase, floor: r.floor,
  //   goldEarned: r.goldEarned, defeatedCount: r.defeatedCount,
  //   party: r.party.map(m => ({ id: m.id, name: m.name, status: m.status, hp: m.hp, maxHp: m.maxHp })),
  // }));
  // res.json(runs);
  res.json([]);
});

/* ── POST /api/adventure/recall/:runId ── */
router.post('/recall/:runId', (req, res) => {
  // recallParty(req.params.runId);
  // res.json({ success: true });
  res.json({ success: false, reason: 'not_implemented' });
});

/* ── POST /api/adventure/descend/:runId ── */
router.post('/descend/:runId', (req, res) => {
  // descendFloor(req.params.runId);
  // res.json({ success: true });
  res.json({ success: false, reason: 'not_implemented' });
});

/* ── POST /api/adventure/return/:runId ── */
router.post('/return/:runId', (req, res) => {
  // returnFromRest(req.params.runId);
  // res.json({ success: true });
  res.json({ success: false, reason: 'not_implemented' });
});

/* ── POST /api/adventure/ability/:runId/:memberId ── */
router.post('/ability/:runId/:memberId', (req, res) => {
  // useAbility(req.params.runId, req.params.memberId);
  // res.json({ success: true });
  res.json({ success: false, reason: 'not_implemented' });
});

module.exports = router;

