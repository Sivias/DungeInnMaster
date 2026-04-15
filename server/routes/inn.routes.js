/**
 * inn.routes.js — Inn API endpoints
 *
 * GET  /api/inn/state          → { gold, locs }
 * POST /api/inn/upgrade/:id    → { success, locationId, level, gold }
 * GET  /api/inn/income         → { income }
 *
 * On the server, game state is imported from ../game/state and
 * the functions from ../game/inn are called directly.
 */

const express = require('express');
const router  = express.Router();

const { state, maxParties } = require('../game/state');
const { doUpgrade, getInnIncome, upgradeCost } = require('../game/inn');

/* ── GET /api/inn/state ── */
router.get('/state', (req, res) => {
  res.json({ gold: state.gold, locs: state.locs });
});

/* ── POST /api/inn/upgrade/:id ── */
router.post('/upgrade/:id', (req, res) => {
  const { id } = req.params;
  const result = doUpgrade(id);
  res.json(result);
});

/* ── GET /api/inn/income ── */
router.get('/income', (req, res) => {
  const income = getInnIncome();
  res.json({ income });
});

module.exports = router;

