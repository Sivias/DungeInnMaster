/* ═══════════════════════════════════════════════════════
   API.JS — Game action abstraction layer
   All game mutations flow through this object.

   API_MODE = 'local'  → calls server/game functions directly
                         (current browser-only mode)
   API_MODE = 'remote' → replaces each call with fetch() to
                         the Express endpoints in server/routes/

   Switch to 'remote' once server/app.js is running.
═══════════════════════════════════════════════════════ */

const API_MODE = 'local'; // 'local' | 'remote'

const API = (() => {

  /* ── Shared fetch helper for the remote path ── */
  async function _post(path, body = {}) {
    const res = await fetch(path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
    return res.json();
  }
  async function _get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
    return res.json();
  }

  /* ══════════════════════════════
     INN
  ══════════════════════════════ */
  const inn = {
    /** Upgrade a location. Returns { success, locationId, level, gold } */
    upgrade(locationId) {
      if (API_MODE === 'local') {
        const result = doUpgrade(locationId);
        if (result.success) {
          refreshLocation(result.locationId);
          refreshInfoPanel();
        }
        return Promise.resolve(result);
      }
      return _post(`/api/inn/upgrade/${locationId}`)
        .then(result => {
          if (result.success) { refreshLocation(result.locationId); refreshInfoPanel(); }
          return result;
        });
    },

    /** Current inn state snapshot { gold, locs } */
    getState() {
      if (API_MODE === 'local') return Promise.resolve({ gold: state.gold, locs: state.locs });
      return _get('/api/inn/state');
    },

    /** Projected income per tick */
    getIncome() {
      if (API_MODE === 'local') return Promise.resolve({ income: getInnIncome() });
      return _get('/api/inn/income');
    },
  };

  /* ══════════════════════════════
     DUNGEON
  ══════════════════════════════ */
  const dungeon = {
    /** Current applicants and party { applicants, partyIds, rosterLevel } */
    getApplicants() {
      if (API_MODE === 'local') return Promise.resolve({ applicants, partyIds, rosterLevel: _applicantRosterLevel });
      return _get('/api/dungeon/applicants');
    },

    /** Re-roll the applicant roster */
    reroll() {
      if (API_MODE === 'local') return Promise.resolve(rerollApplicants());
      return _post('/api/dungeon/reroll');
    },

    /** Hire or remove a member (toggles) */
    hire(memberId) {
      if (API_MODE === 'local') return Promise.resolve(toggleMember(memberId));
      return _post(`/api/dungeon/hire/${memberId}`);
    },

    /** Remove all members from the party */
    clearParty() {
      if (API_MODE === 'local') return Promise.resolve(clearParty());
      return _post('/api/dungeon/clear');
    },

    /** Deploy the current party into the dungeon */
    deploy() {
      if (API_MODE === 'local') {
        if (partyIds.length < 1) return Promise.resolve({ success: false, reason: 'empty_party' });
        if (state.activeRuns.length >= maxParties()) return Promise.resolve({ success: false, reason: 'hearth_full' });
        const party = getParty();
        postDeploy();
        const run = startRun(party);
        return Promise.resolve({ success: true, runId: run.id });
      }
      return _post('/api/dungeon/deploy');
    },
  };

  /* ══════════════════════════════
     ADVENTURE
  ══════════════════════════════ */
  const adventure = {
    /** Serialisable snapshot of all active runs */
    getRuns() {
      if (API_MODE === 'local') return Promise.resolve(state.activeRuns.map(r => ({
        id: r.id, phase: r.phase, floor: r.floor,
        goldEarned: r.goldEarned, defeatedCount: r.defeatedCount,
        party: r.party.map(m => ({ id: m.id, name: m.name, status: m.status, hp: m.hp, maxHp: m.maxHp })),
      })));
      return _get('/api/adventure/runs');
    },

    /** Recall the party of the given run */
    recall(runId) {
      if (API_MODE === 'local') { recallParty(); return Promise.resolve({ success: true }); }
      return _post(`/api/adventure/recall/${runId}`);
    },

    /** Descend to the next floor */
    descend(runId) {
      if (API_MODE === 'local') { descendFloor(runId); return Promise.resolve({ success: true }); }
      return _post(`/api/adventure/descend/${runId}`);
    },

    /** Return to the inn from the rest room */
    returnToInn(runId) {
      if (API_MODE === 'local') { returnFromRest(runId); return Promise.resolve({ success: true }); }
      return _post(`/api/adventure/return/${runId}`);
    },

    /** Activate a member's ability */
    useAbility(runId, memberId) {
      if (API_MODE === 'local') { useAbility(runId, memberId); return Promise.resolve({ success: true }); }
      return _post(`/api/adventure/ability/${runId}/${memberId}`);
    },
  };

  return { inn, dungeon, adventure };
})();

