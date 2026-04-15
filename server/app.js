/**
 * app.js — Express server entry point
 *
 * Run: node server/app.js
 * Then set API_MODE = 'remote' in client/js/api.js
 * and open http://localhost:3000
 */

const express = require('express');
const path    = require('path');

const innRoutes       = require('./routes/inn.routes');
const dungeonRoutes   = require('./routes/dungeon.routes');
const adventureRoutes = require('./routes/adventure.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ── */
app.use(express.json());

/* ── Serve static client files ── */
app.use(express.static(path.join(__dirname, '..')));

/* ── API routes ── */
app.use('/api/inn',       innRoutes);
app.use('/api/dungeon',   dungeonRoutes);
app.use('/api/adventure', adventureRoutes);

/* ── Fallback: serve index.html for any unmatched route ── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DungeInnMaster server running on http://localhost:${PORT}`);
});

module.exports = app;

