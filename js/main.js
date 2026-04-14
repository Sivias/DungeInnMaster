/* ═══════════════════════════════════════
   MAIN.JS — Event listeners & wiring
   Load order: data → state → inn → dungeon → adventure → main
═══════════════════════════════════════ */

/* ── Inn page ── */
document.getElementById('dungeon-btn').addEventListener('click', showDungeonPage);

/* ── Log expand / collapse ── */
document.querySelectorAll('.log-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const log = document.getElementById(btn.dataset.target);
    if (!log) return;
    const expanded = log.classList.toggle('expanded');
    btn.classList.toggle('active', expanded);
    if (expanded) {
      btn.textContent = btn.textContent.replace('▾', '▴').replace('expand', 'collapse');
      log.scrollTop = log.scrollHeight;
    } else {
      btn.textContent = btn.textContent.replace('▴', '▾').replace('collapse', 'expand');
    }
  });
});

/* ── Combat log filters ── */
document.querySelectorAll('.log-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    const log = document.getElementById(btn.dataset.log);
    if (!log) return;
    const nowActive = btn.classList.toggle('active');
    log.classList.toggle(btn.dataset.hide, !nowActive);
  });
});

/* ── Dungeon / party selection page ── */
document.getElementById('back-btn').addEventListener('click', () => {
  showPage('inn-page');
  refreshInfoPanel();
  refreshInnExpeditionStatus();
});

document.getElementById('venture-btn').addEventListener('click', () => {
  if (partyIds.length < 4) return;
  if (state.activeRuns.length >= maxParties()) return;
  const party = getParty();   // capture before postDeploy clears partyIds
  postDeploy();               // remove deployed members from persistent pool
  startRun(party);
});

/* ── Adventure page ── */
document.getElementById('watch-inn-btn').addEventListener('click', stopWatching);
document.getElementById('recall-btn').addEventListener('click', recallParty);

document.getElementById('return-btn').addEventListener('click', () => {
  document.getElementById('outcome-overlay').classList.add('hidden');
  stopWatching();
});
