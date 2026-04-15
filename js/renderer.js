/* ═══════════════════════════════════════════════════════
   RENDERER.JS — Pixel-art top-down dungeon renderer
   16-bit orthographic view with sprite animation
   Load order: after data.js and state.js
═══════════════════════════════════════════════════════ */

const TS  = 16;          // tile size (logical px)
const RW  = 55, RH = 9;  // map grid dimensions (55 wide gives room 3 proper camera headroom)
const CVW = 320, CVH = 144; // canvas logical size (2× CSS)

/* ── Tile types ── */
const RT = { WALL:0, FLOOR:1, CORRIDOR:2, TORCH:3, STAIRS:4 };

/* ── Class color palettes ── */
const CPAL = {
  'Fighter': { h:'#8090c8', b:'#4a6ab8', leg:'#2a3a70', acc:'#c8c8d8' },
  'Rogue':   { h:'#3a2848', b:'#5a3a70', leg:'#1a1028', acc:'#d0c080' },
  'Mage':    { h:'#1a2878', b:'#2030a0', leg:'#180838', acc:'#f0e050' },
  'Cleric':  { h:'#d8d080', b:'#e0d898', leg:'#a09050', acc:'#f8d840' },
  'Ranger':  { h:'#2a5820', b:'#3a6830', leg:'#1a3810', acc:'#c09040' },
  'Paladin': { h:'#c8a030', b:'#d0b040', leg:'#786010', acc:'#f0f0c0' },
  'Bard':    { h:'#8020b0', b:'#a030d0', leg:'#501080', acc:'#f8d030' },
  'Druid':   { h:'#4a6820', b:'#3a5818', leg:'#2a3810', acc:'#50a030' },
  'Warlock': { h:'#100820', b:'#1a1028', leg:'#080410', acc:'#9030e8' },
  'Monk':    { h:'#c05820', b:'#d07030', leg:'#804020', acc:'#f8f0d0' },
};

/* ── Enemy color/shape presets ── */
const EPAL = {
  /* original encounters */
  'Goblin Ambush':     { body:'#2a7a18', dark:'#183a08', eye:'#f8f000', type:'small' },
  'Skeleton Warriors': { body:'#d8d0b0', dark:'#888060', eye:'#f80000', type:'mid'   },
  'Giant Spider':      { body:'#0a0a0a', dark:'#050505', eye:'#f82020', type:'wide'  },
  'Orc Warband':       { body:'#3a5a18', dark:'#1a3008', eye:'#f8c000', type:'large' },
  'Dark Mage':         { body:'#18082a', dark:'#0a0418', eye:'#c000f8', type:'mid'   },
  'Dragon Hatchling':  { body:'#c83010', dark:'#681808', eye:'#f8c000', type:'large' },
  'Cursed Tomb':       { body:'#606050', dark:'#303028', eye:'#50f050', type:'mid'   },
  'Troll Bridge':      { body:'#506028', dark:'#283018', eye:'#f8c000', type:'large' },
  'Vampire Lair':      { body:'#280a40', dark:'#180528', eye:'#f80030', type:'mid'   },
  'Bandit Camp':       { body:'#7a4a18', dark:'#3a2008', eye:'#a06030', type:'mid'   },
  'Mimic Chest':       { body:'#8b6534', dark:'#4a3010', eye:'#f8a000', type:'box'   },
  'Stone Golem':       { body:'#6a6870', dark:'#383640', eye:'#50c8f8', type:'large' },
  'Wraith Swarm':      { body:'#3050a0', dark:'#182040', eye:'#80c8ff', type:'ghost' },
  'Demon Portal':      { body:'#c02010', dark:'#601008', eye:'#f8f000', type:'large' },
  /* new tier-1 */
  'Cave Rat Swarm':    { body:'#5a3a18', dark:'#2a1a08', eye:'#f8c050', type:'wide'  },
  'Goblin Lookout':    { body:'#2a7a18', dark:'#183a08', eye:'#f8f000', type:'small' },
  'Animated Bones':    { body:'#c8c0a0', dark:'#888060', eye:'#e82020', type:'small' },
  'Startled Bats':     { body:'#1a0828', dark:'#08040e', eye:'#f0d040', type:'ghost' },
  'Dungeon Ooze':      { body:'#204a10', dark:'#102408', eye:'#b0f020', type:'blob'  },
  'Kobold Trapper':    { body:'#406018', dark:'#202c08', eye:'#f8e040', type:'small' },
  'Feral Shroom':      { body:'#3a6820', dark:'#1a3410', eye:'#f8f840', type:'small' },
  'Tomb Worm':         { body:'#8a8060', dark:'#4a4030', eye:'#f8d030', type:'wide'  },
  'Dungeon Pixie':     { body:'#a020c0', dark:'#501060', eye:'#f8f8a0', type:'ghost' },
  'Crypt Spider':      { body:'#1a1a20', dark:'#0a0a10', eye:'#f02020', type:'wide'  },
  /* new tier-2 */
  'Bandit Scouts':     { body:'#7a4a18', dark:'#3a2008', eye:'#a06030', type:'mid'   },
  'Sludge Cube':       { body:'#284a10', dark:'#102408', eye:'#90e030', type:'blob'  },
  'Ghoul Pack':        { body:'#3a4a28', dark:'#1a2810', eye:'#80f080', type:'mid'   },
  'Shadow Wisp':       { body:'#0a0820', dark:'#040410', eye:'#c0a0f8', type:'ghost' },
  'Hobgoblin Grunt':   { body:'#5a2a18', dark:'#2a1008', eye:'#f8a030', type:'large' },
  'Cursed Armor':      { body:'#5a5870', dark:'#2a2840', eye:'#50f0f8', type:'large' },
};

/* ════════════════════════════════════════
   DungeonRenderer class
════════════════════════════════════════ */
class DungeonRenderer {
  constructor() {
    this.canvas = null;
    this.ctx    = null;
    this.map    = null;
    this.rooms  = null;
    this.fog    = null;
    this.camera = { x: 0, tx: 0 };
    this.party  = [];       // sprite state for each party member
    this.enemy  = null;     // current enemy sprite
    this.effects = [];
    this.fi     = 0;        // frame index
    this.lastTs = 0;
    this.rafId  = null;
    this.onArrival = null;  // callback when all entities reach targets
    this._ticket   = 0;     // invalidation token for callbacks
    this.shakeX    = 0;
  }

  /* ── Public: setup state without a canvas (call before attach) ── */
  setup(party) {
    this._buildMap();
    const r0 = this.rooms[0];
    this.party = party.map((m, i) => {
      const pos = this._formPos(r0, i);
      return { ...m, wx: pos.x, wy: pos.y, twx: pos.x, twy: pos.y, facing: 1 };
    });
    this.enemy   = null;
    this.effects = [];
    this.camera  = { x: 0, tx: 0 };
    this.shakeX  = 0;
    this._fog0();
    this._revealRoom(0);
    // RAF starts in attach()
  }

  /* ── Public: attach to a canvas and start rendering ── */
  attach(canvasEl) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    // Snap entities to their logical targets so they appear at the right position
    this.party.forEach(p => { p.wx = p.twx; p.wy = p.twy; });
    if (this.enemy) { this.enemy.wx = this.enemy.twx; this.enemy.wy = this.enemy.twy; }
    this.camera.x = this.camera.tx;
    if (!this.rafId) this._startLoop();
  }

  /* ── Public: detach from canvas, pause RAF but keep all state ── */
  detach() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.canvas = null;
    this.ctx    = null;
  }

  /* ── Public: initialize canvas (legacy, use setup+attach instead) ── */
  init(canvasEl) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this._buildMap();
  }

  /* ── Public: begin a run (legacy) ── */
  show(party) {
    const r0 = this.rooms[0];
    this.party = party.map((m, i) => {
      const pos = this._formPos(r0, i);
      return { ...m, wx: pos.x, wy: pos.y, twx: pos.x, twy: pos.y, facing: 1 };
    });
    this.enemy   = null;
    this.effects = [];
    this.camera  = { x: 0, tx: 0 };
    this.shakeX  = 0;
    this._fog0();
    this._revealRoom(0);
    this._startLoop();
  }

  /* ── Public: stop renderer ── */
  hide() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  /* ── Public: move party to encounter room & spawn enemy ── */
  onEncounterStart(encIdx, encounter, onReady) {
    const room = this.rooms[encIdx + 1];
    this._movePartyTo(room, () => {
      this._revealRoom(encIdx + 1);
      // Spawn enemy walking in from the right
      this.enemy = {
        wx: room.cx + 5, wy: room.cy,
        twx: room.cx + 2.5, twy: room.cy,
        facing: -1, encounter, alpha: 0, flash: false,
      };
      // Fade enemy in
      const fadeIn = setInterval(() => {
        if (!this.enemy) { clearInterval(fadeIn); return; }
        this.enemy.alpha = Math.min(1, (this.enemy.alpha || 0) + 0.12);
        if (this.enemy.alpha >= 1) clearInterval(fadeIn);
      }, 30);
      // Wait for enemy to arrive
      this._moveTo(onReady, 1200);
    });
  }

  /* ── Public: play fight animation, then call back ── */
  onFight(success, callback) {
    if (!this.party.length) { setTimeout(callback, 300); return; }
    const dir = (this.enemy ? this.enemy.wx - this.party[0].wx : 1) > 0 ? 1 : -1;
    const origTwx = this.party.map(p => p.twx);
    // Lunge
    this.party.forEach(p => {
      if (p.status !== 'incapacitated') p.twx = p.wx + dir * 1.8;
    });
    setTimeout(() => {
      const ex = this.enemy?.wx ?? 5;
      const ey = this.enemy?.wy ?? 4;
      const pc = this._centroid();
      if (success) {
        this.effects.push({ type:'slash', x:ex, y:ey, col:'#f8f8d0', age:0, max:0.38 });
        this.effects.push({ type:'num',   x:ex, y:ey - 0.6, val: 15 + (Math.random()*20|0), age:0, max:0.85 });
        if (this.enemy) { this.enemy.flash = true; setTimeout(() => { if (this.enemy) this.enemy.flash = false; }, 180); }
      } else {
        this.effects.push({ type:'slash', x:pc.x, y:pc.y, col:'#f83030', age:0, max:0.38 });
        this.effects.push({ type:'num',   x:pc.x, y:pc.y - 0.6, val: -(8 + (Math.random()*12|0)), age:0, max:0.85 });
        this.shakeX = 3;
      }
      // Snap back
      this.party.forEach((p, i) => { p.twx = origTwx[i]; });
      setTimeout(callback, 580);
    }, 300);
  }

  /* ── Public: despawn current enemy ── */
  despawnEnemy(callback) {
    if (!this.enemy) { if (callback) setTimeout(callback, 150); return; }
    this.enemy.twx = this.enemy.wx + 6;
    const fade = setInterval(() => {
      if (!this.enemy) { clearInterval(fade); return; }
      this.enemy.alpha = Math.max(0, (this.enemy.alpha ?? 1) - 0.14);
    }, 30);
    setTimeout(() => { clearInterval(fade); this.enemy = null; if (callback) callback(); }, 650);
  }

  /* ── Public: play ability visual ── */
  onAbility(member, type) {
    const sp = this.party.find(p => p.id === member.id);
    if (!sp) return;
    const cols = { powerBoost:'#e0a030', rollBoost:'#40e0ff', selfDouble:'#c040ff',
                   heal:'#4ac96a', shield:'#4a8ae0', runBoost:'#f8d040', autoWin:'#ffffff' };
    this.effects.push({ type:'ability', x: sp.wx, y: sp.wy, col: cols[type] || '#f8f8f8', age:0, max:0.65 });
  }

  /* ── Public: party retreat animation ── */
  onRetreat(callback) {
    this._movePartyTo(this.rooms[0], callback);
  }

  /* ── Public: sync HP/status after fight ── */
  updatePartyStatus(partyData) {
    this.party.forEach((sp, i) => { if (partyData[i]) sp.status = partyData[i].status; });
  }

  /* ── Public: silently advance party to next room (no enemy) ── */
  advanceToRoom(roomIdx, callback) {
    const room = this.rooms[roomIdx];
    if (!room) { if (callback) callback(); return; }
    this._movePartyTo(room, () => {
      this._revealRoom(roomIdx);
      if (callback) callback();
    });
  }

  /* ── Public: move party to a room index, then spawn an enemy there ── */
  moveToRoomAndSpawn(roomIdx, encounter, onReady) {
    const room = this.rooms[Math.min(roomIdx, this.rooms.length - 1)];
    if (!room) { if (onReady) setTimeout(onReady, 100); return; }
    this._movePartyTo(room, () => {
      this._revealRoom(Math.min(roomIdx, this.rooms.length - 1));
      this.enemy = {
        wx: room.cx + 5, wy: room.cy,
        twx: room.cx + 2.5, twy: room.cy,
        facing: -1, encounter, alpha: 0, flash: false,
      };
      const fadeIn = setInterval(() => {
        if (!this.enemy) { clearInterval(fadeIn); return; }
        this.enemy.alpha = Math.min(1, (this.enemy.alpha || 0) + 0.12);
        if (this.enemy.alpha >= 1) clearInterval(fadeIn);
      }, 30);
      this._moveTo(onReady, 1200);
    });
  }

  /* ── Public: reset map to room 0 for a new floor ── */
  startNewFloor(callback) {
    this._fog0();
    this._revealRoom(0);
    const r0 = this.rooms[0];
    this.enemy = null;
    this.effects = [];
    this.party.forEach((p, i) => {
      if (p.status !== 'incapacitated') {
        const pos = this._formPos(r0, i);
        p.wx = pos.x; p.wy = pos.y;
        p.twx = pos.x; p.twy = pos.y;
        p.facing = 1;
      }
    });
    this.camera.x = 0; this.camera.tx = 0;
    setTimeout(() => { if (callback) callback(); }, 600);
  }

  /* ── Public: spawn a roaming encounter near the party's current position ── */
  spawnRoamingEncounter(enc, onReady) {
    const c = this._centroid();
    const ex = Math.min(c.x + 5, RW - 4);
    this.enemy = {
      wx: ex + 4, wy: c.y,
      twx: ex,    twy: c.y,
      facing: -1, encounter: enc, alpha: 0, flash: false,
    };
    const fadeIn = setInterval(() => {
      if (!this.enemy) { clearInterval(fadeIn); return; }
      this.enemy.alpha = Math.min(1, (this.enemy.alpha || 0) + 0.18);
      if (this.enemy.alpha >= 1) clearInterval(fadeIn);
    }, 25);
    this._moveTo(onReady, 1500);
  }

  /* ══════════════════════════════════════
     INTERNALS
  ══════════════════════════════════════ */

  _buildMap() {
    const map = Array.from({length: RH}, () => new Uint8Array(RW).fill(RT.WALL));
    this.rooms = [
      {x:1,  y:1, w:8, h:7, cx:5,  cy:4},
      {x:13, y:1, w:8, h:7, cx:17, cy:4},
      {x:25, y:1, w:8, h:7, cx:29, cy:4},
      {x:37, y:1, w:8, h:7, cx:41, cy:4},
    ];
    // Carve rooms
    for (const r of this.rooms)
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          map[y][x] = RT.FLOOR;
    // Carve corridors (3 tiles wide, center rows)
    for (let ci = 0; ci < 3; ci++) {
      const x0 = this.rooms[ci].x + this.rooms[ci].w;
      const x1 = this.rooms[ci + 1].x;
      for (let x = x0; x < x1; x++)
        for (let y = 3; y <= 5; y++)
          map[y][x] = RT.CORRIDOR;
    }
    // Torches
    for (const r of this.rooms) {
      map[r.y + 1][r.x + 1]         = RT.TORCH;
      map[r.y + 1][r.x + r.w - 2]   = RT.TORCH;
    }
    // Stairs in last room
    map[this.rooms[3].cy][this.rooms[3].cx] = RT.STAIRS;
    this.map = map;
  }

  _fog0() {
    this.fog = Array.from({length: RH}, () => new Uint8Array(RW).fill(0));
  }

  _revealRoom(idx) {
    const r = this.rooms[idx];
    if (!r) return;
    // Demote previously lit tiles to "explored"
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < RW; x++)
        if (this.fog[y][x] === 2) this.fog[y][x] = 1;
    // Light current room
    for (let y = r.y - 1; y <= r.y + r.h; y++)
      for (let x = r.x - 1; x <= r.x + r.w; x++)
        if (y >= 0 && y < RH && x >= 0 && x < RW) this.fog[y][x] = 2;
    // Also light the connecting corridor
    if (idx > 0) {
      const pr = this.rooms[idx - 1];
      for (let x = pr.x + pr.w; x < r.x; x++)
        for (let y = 2; y <= 6; y++)
          if (y >= 0 && y < RH && x >= 0 && x < RW) this.fog[y][x] = 2;
    }
  }

  _startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.lastTs = performance.now();
    const loop = (ts) => {
      const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
      this.lastTs = ts;
      this.fi++;
      this._update(dt);
      this._draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  _centroid() {
    const active = this.party.filter(p => p.status !== 'incapacitated');
    const src = active.length ? active : this.party;
    if (!src.length) return {x:5, y:4};
    return { x: src.reduce((s,p) => s + p.wx, 0) / src.length,
             y: src.reduce((s,p) => s + p.wy, 0) / src.length };
  }

  _formPos(room, i) {
    const offsets = [{x:-1.5,y:-0.5},{x:-0.5,y:-0.5},{x:-1.5,y:0.5},{x:-0.5,y:0.5}];
    return { x: room.cx + offsets[i].x, y: room.cy + offsets[i].y };
  }

  _update(dt) {
    const speed = 2.5;
    let allAt = true;
    const move = (e) => {
      const dx = e.twx - e.wx, dy = e.twy - e.wy;
      const d = Math.hypot(dx, dy);
      if (d > 0.06) {
        allAt = false;
        const step = Math.min(d, speed * dt);
        e.wx += (dx / d) * step;
        e.wy += (dy / d) * step;
        if (Math.abs(dx) > 0.1) e.facing = dx > 0 ? 1 : -1;
      } else { e.wx = e.twx; e.wy = e.twy; }
    };
    this.party.forEach(move);
    if (this.enemy) move(this.enemy);

    // Camera follow (horizontal only)
    const cx = this._centroid().x;
    this.camera.tx = Math.max(0, Math.min(cx * TS - CVW / 2, (RW - CVW / TS) * TS));
    this.camera.x += (this.camera.tx - this.camera.x) * 0.09;

    // Shake decay
    if (this.shakeX > 0.1) this.shakeX *= 0.72; else this.shakeX = 0;

    // Age effects
    this.effects = this.effects.filter(e => { e.age += dt; return e.age < e.max; });

    // Arrival callback
    if (allAt && this.onArrival) {
      const cb = this.onArrival; this.onArrival = null; cb();
    }
  }

  _draw() {
    if (!this.ctx) return;  // detached — skip rendering
    const ctx = this.ctx;
    const shk = this.shakeX > 0 ? Math.round(Math.sin(this.fi * 1.4) * this.shakeX) : 0;
    ctx.save();
    ctx.translate(shk, 0);
    ctx.fillStyle = '#0d0b14';
    ctx.fillRect(-4, 0, CVW + 8, CVH);
    this._drawTiles();
    this._drawFog();
    // Draw in depth order: rightmost entity is deepest in the dungeon → render behind
    const enemyX = this.enemy?.wx ?? -Infinity;
    const partyX = this._centroid().x;
    if (enemyX >= partyX) {
      if (this.enemy) this._drawEnemy();
      this._drawParty();
    } else {
      this._drawParty();
      if (this.enemy) this._drawEnemy();
    }
    this._drawFX();
    ctx.restore();
  }

  _ws(wx, wy) {
    return { sx: Math.round(wx * TS - this.camera.x), sy: Math.round(wy * TS) };
  }

  /* ── Tile rendering ── */
  _drawTiles() {
    const ctx = this.ctx;
    const sx0 = Math.floor(this.camera.x / TS) - 1;
    const sx1 = sx0 + Math.ceil(CVW / TS) + 2;
    for (let ty = 0; ty < RH; ty++) {
      for (let tx = Math.max(0, sx0); tx <= Math.min(RW - 1, sx1); tx++) {
        const t = this.map[ty][tx];
        if (t === RT.WALL) continue;
        const {sx, sy} = this._ws(tx, ty);
        this._drawTile(t, sx, sy, tx, ty);
      }
    }
  }

  _drawTile(t, sx, sy, tx, ty) {
    const c = this.ctx;
    switch (t) {
      case RT.FLOOR: {
        c.fillStyle = '#3a3320'; c.fillRect(sx, sy, TS, TS);
        c.fillStyle = '#2e2a1a'; c.fillRect(sx, sy, TS, 1); c.fillRect(sx, sy, 1, TS);
        if ((tx*7+ty*13)%7===0) { c.fillStyle='#464030'; c.fillRect(sx+4+(tx*3%6), sy+4+(ty*5%6), 2, 2); }
        break;
      }
      case RT.CORRIDOR: {
        c.fillStyle = '#282215'; c.fillRect(sx, sy, TS, TS);
        c.fillStyle = '#201c12';
        c.fillRect(sx, sy, TS, 2);
        c.fillRect(sx, sy + TS - 2, TS, 2);
        break;
      }
      case RT.TORCH: {
        // Floor base
        c.fillStyle = '#3a3320'; c.fillRect(sx, sy, TS, TS);
        c.fillStyle = '#2e2a1a'; c.fillRect(sx, sy, TS, 1); c.fillRect(sx, sy, 1, TS);
        // Bracket
        c.fillStyle = '#5a4020'; c.fillRect(sx+6, sy+2, 4, 2);
        c.fillStyle = '#6a5030'; c.fillRect(sx+7, sy+4, 2, 4);
        // Flame (2-frame)
        const f2 = this.fi % 20 < 10;
        c.fillStyle = f2 ? '#d85010' : '#e06010'; c.fillRect(sx+6, sy+1, 4, 3);
        c.fillStyle = '#f8e040'; c.fillRect(sx+7, sy+0, 2, f2 ? 2 : 3);
        // Glow
        c.globalAlpha = 0.10 + (f2 ? 0.04 : 0);
        c.fillStyle = '#ff9020'; c.fillRect(sx-5, sy-5, TS+10, TS+10);
        c.globalAlpha = 1;
        break;
      }
      case RT.STAIRS: {
        c.fillStyle = '#3a3320'; c.fillRect(sx, sy, TS, TS);
        c.fillStyle = '#4a4535'; c.fillRect(sx+2, sy+2, 12, 3);
        c.fillStyle = '#545070'; c.fillRect(sx+3, sy+5, 10, 3);
        c.fillStyle = '#6060a0'; c.fillRect(sx+4, sy+8, 8, 3);
        c.fillStyle = '#c9a84c';
        c.fillRect(sx+7, sy+3, 2, 4); c.fillRect(sx+5, sy+6, 6, 2); c.fillRect(sx+6, sy+8, 4, 2);
        break;
      }
    }
  }

  /* ── Fog of war ── */
  _drawFog() {
    const c = this.ctx;
    const sx0 = Math.floor(this.camera.x / TS) - 1;
    const sx1 = sx0 + Math.ceil(CVW / TS) + 2;
    for (let ty = 0; ty < RH; ty++) {
      for (let tx = Math.max(0, sx0); tx <= Math.min(RW - 1, sx1); tx++) {
        const v = this.fog[ty][tx];
        const {sx, sy} = this._ws(tx, ty);
        if (v === 0) {
          c.fillStyle = '#0d0b14'; c.fillRect(sx, sy, TS, TS);
        } else if (v === 1) {
          c.globalAlpha = 0.62; c.fillStyle = '#0d0b14'; c.fillRect(sx, sy, TS, TS); c.globalAlpha = 1;
        }
      }
    }
  }

  /* ── Party sprites ── */
  _drawParty() {
    for (let i = this.party.length - 1; i >= 0; i--) {
      const p = this.party[i];
      const {sx, sy} = this._ws(p.wx, p.wy);
      if (sx < -TS*2 || sx > CVW + TS) continue;
      this.ctx.save();
      if (p.facing === -1) { this.ctx.translate(sx + TS, sy); this.ctx.scale(-1, 1); this._charSprite(0, 0, p); }
      else this._charSprite(sx, sy, p);
      this.ctx.restore();
      // Wounded marker
      if (p.status === 'wounded') {
        this.ctx.globalAlpha = 0.7;
        this.ctx.fillStyle = '#e9a84c';
        this.ctx.fillRect(sx+5, sy-3, 6, 2);
        this.ctx.globalAlpha = 1;
      }
    }
  }

  _charSprite(sx, sy, p) {
    if (p.status === 'incapacitated') return;
    const c = this.ctx;
    const C = CPAL[p.cls.name] || CPAL['Fighter'];
    const wk = Math.floor(this.fi / 14) % 2;
    const bob = wk ? -1 : 0;
    const skin = '#d4a870';
    // Shadow
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(sx+2, sy+14, 12, 2);
    // Head
    c.fillStyle = skin; c.fillRect(sx+5, sy+2+bob, 6, 4);
    // Eyes
    c.fillStyle = '#1a120a'; c.fillRect(sx+6, sy+4+bob, 1, 1); c.fillRect(sx+9, sy+4+bob, 1, 1);
    // Helmet
    c.fillStyle = C.h; c.fillRect(sx+4, sy+1+bob, 8, 3); c.fillRect(sx+5, sy+bob, 6, 2);
    // Body
    c.fillStyle = C.b; c.fillRect(sx+3, sy+6, 10, 5);
    c.fillStyle = C.acc; c.fillRect(sx+4, sy+7, 8, 1);
    c.fillStyle = C.leg; c.fillRect(sx+3, sy+11, 10, 1);
    // Legs
    const l1 = wk ? 1 : 0, l2 = wk ? 0 : 1;
    c.fillStyle = C.leg;
    c.fillRect(sx+4, sy+12-l1, 3, 3+l1);
    c.fillRect(sx+9, sy+12-l2, 3, 3+l2);
    // Boots
    c.fillStyle = '#2a1a08';
    c.fillRect(sx+3, sy+14, 5, 2); c.fillRect(sx+8, sy+14, 5, 2);
    // Class accessory
    this._classAccent(c, sx, sy+bob, p.cls.name, C);
  }

  _classAccent(c, sx, sy, cls, C) {
    switch (cls) {
      case 'Fighter':
        c.fillStyle='#d8d8e8'; c.fillRect(sx+14,sy+3,2,9);
        c.fillStyle=C.acc;     c.fillRect(sx+13,sy+7,4,2);
        c.fillStyle='#6a4020'; c.fillRect(sx+14,sy+9,2,4); break;
      case 'Rogue':
        c.fillStyle='#1a0820'; c.fillRect(sx+3,sy+1,10,3);
        c.fillStyle='#d8d8d8'; c.fillRect(sx+13,sy+5,2,6); break;
      case 'Mage':
        c.fillStyle='#6a4a18'; c.fillRect(sx-1,sy+1,2,13);
        c.fillStyle=C.acc;     c.fillRect(sx-2,sy,4,4);
        c.fillStyle='#f8f8f8'; c.fillRect(sx-1,sy,2,2); break;
      case 'Cleric':
        c.fillStyle=C.acc; c.fillRect(sx+7,sy+7,2,4); c.fillRect(sx+5,sy+8,6,2); break;
      case 'Ranger':
        c.fillStyle='#8b5a1a'; c.fillRect(sx+14,sy+2,2,10);
        c.fillStyle='#e0d890'; c.fillRect(sx+14,sy+2,1,10); break;
      case 'Paladin':
        c.fillStyle='#2a2a8a'; c.fillRect(sx-2,sy+5,4,6);
        c.fillStyle=C.acc;     c.fillRect(sx-1,sy+7,2,1); c.fillRect(sx-2,sy+6,1,3);
        c.fillStyle='#d8d8f0'; c.fillRect(sx+14,sy+2,2,9); break;
      case 'Bard':
        c.fillStyle=C.acc;     c.fillRect(sx+3,sy,10,2);
        c.fillStyle='#f8a830'; c.fillRect(sx+12,sy-2,2,4); break;
      case 'Druid':
        c.fillStyle='#5a3010'; c.fillRect(sx-1,sy+2,2,12);
        c.fillStyle=C.acc;     c.fillRect(sx-2,sy+1,4,3); break;
      case 'Warlock':
        c.fillStyle=C.acc;     c.fillRect(sx+14,sy+5,3,3);
        c.fillStyle='#e0c0ff'; c.fillRect(sx+15,sy+6,1,1);
        c.globalAlpha=0.45; c.fillStyle=C.b; c.fillRect(sx+1,sy+5,2,9); c.fillRect(sx+13,sy+5,2,9); c.globalAlpha=1; break;
      case 'Monk':
        c.fillStyle='#f8f8e0'; c.fillRect(sx+2,sy+6,3,3); c.fillRect(sx+11,sy+6,3,3); break;
    }
  }

  /* ── Enemy sprite ── */
  _drawEnemy() {
    const e = this.enemy;
    if (!e) return;
    const {sx, sy} = this._ws(e.wx, e.wy);
    if (sx < -TS*2 || sx > CVW + TS) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, e.alpha ?? 1));
    if (e.flash) {
      c.globalAlpha = 0.55;
      c.fillStyle = '#ffffff';
      c.fillRect(sx, sy, TS, TS);
      c.globalAlpha = Math.max(0, Math.min(1, e.alpha ?? 1));
    }
    if (e.facing === -1) { c.translate(sx + TS, sy); c.scale(-1, 1); this._enemyShape(0, 0, e.encounter?.name||''); }
    else { c.translate(sx, sy); this._enemyShape(0, 0, e.encounter?.name||''); }
    c.globalAlpha = 1;
    c.restore();
  }

  _enemyShape(sx, sy, name) {
    const c = this.ctx;
    const E = EPAL[name] || { body:'#8a3a20', dark:'#4a1a08', eye:'#f8c000', type:'mid' };
    const bob = this.fi % 30 < 15 ? 0 : -1;
    // Shadow
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(sx+1, sy+14, 14, 2);

    switch (E.type) {
      case 'small': {
        c.fillStyle=E.body;  c.fillRect(sx+3,sy+2+bob,4,4); c.fillRect(sx+9,sy+2+bob,4,4); // ears
        c.fillRect(sx+4,sy+3+bob,8,5);
        c.fillStyle=E.dark;  c.fillRect(sx+4,sy+3+bob,8,3);
        c.fillStyle=E.eye;   c.fillRect(sx+5,sy+3+bob,2,2); c.fillRect(sx+9,sy+3+bob,2,2);
        c.fillStyle=E.body;  c.fillRect(sx+4,sy+8,8,6);
        c.fillStyle='#5a3010'; c.fillRect(sx+13,sy+5+bob,2,8); c.fillStyle=E.dark; c.fillRect(sx+12,sy+4+bob,4,3);
        break;
      }
      case 'large': {
        c.fillStyle=E.body;  c.fillRect(sx+1,sy+1+bob,14,6);
        c.fillStyle=E.dark;  c.fillRect(sx+2,sy+2+bob,12,4);
        c.fillStyle=E.eye;   c.fillRect(sx+2,sy+2+bob,4,4); c.fillRect(sx+10,sy+2+bob,4,4);
        c.fillStyle='#ff0000'; c.fillRect(sx+3,sy+3+bob,2,2); c.fillRect(sx+11,sy+3+bob,2,2);
        c.fillStyle=E.body;  c.fillRect(sx+2,sy+7,12,7);
        c.fillStyle=E.dark;  c.fillRect(sx,sy+6,4,8); c.fillRect(sx+12,sy+6,4,8); // arms
        break;
      }
      case 'wide': { // spider
        c.fillStyle=E.body;  c.fillRect(sx+5,sy+4+bob,6,5); c.fillRect(sx+4,sy+8+bob,8,5);
        c.fillStyle=E.eye;
        for (let i=0; i<3; i++) { c.fillRect(sx+5+i*2,sy+4+bob,1,1); c.fillRect(sx+5+i*2,sy+6+bob,1,1); }
        c.fillStyle=E.dark;
        for (let i=0; i<4; i++) {
          const lo = Math.sin(this.fi*0.15 + i) > 0 ? 1 : 0;
          c.fillRect(sx-2+i,sy+6+lo,4+i,2); c.fillRect(sx+TS-2-i,sy+6-lo,4+i,2);
        }
        break;
      }
      case 'ghost': {
        c.globalAlpha = 0.65 + Math.sin(this.fi*0.08)*0.2;
        c.fillStyle=E.body; c.fillRect(sx+3,sy+1+bob,10,11);
        c.fillStyle=E.dark; c.fillRect(sx+4,sy+2+bob,8,7);
        c.fillStyle=E.eye; c.fillRect(sx+5,sy+4+bob,2,2); c.fillRect(sx+9,sy+4+bob,2,2);
        for (let i=0; i<4; i++) {
          c.fillStyle=E.body;
          c.fillRect(sx+2+i*3, sy+10+bob, 3, Math.sin(this.fi*0.1+i)>0?3:2);
        }
        c.globalAlpha=1; break;
      }
      case 'box': { // mimic
        c.fillStyle=E.dark;  c.fillRect(sx+2,sy+8,12,8);
        c.fillStyle=E.body;  c.fillRect(sx+2,sy+3+bob,12,5);
        c.fillStyle='#c9a84c'; c.fillRect(sx+2,sy+8,12,1);
        c.fillStyle='#f8f0d8'; // teeth
        for (let i=0; i<4; i++) { c.fillRect(sx+2+i*3,sy+8,2,2+bob); c.fillRect(sx+3+i*3,sy+8-2+bob,2,2); }
        c.fillStyle=E.eye; c.fillRect(sx+5,sy+4+bob,4,3);
        c.fillStyle='#1a1000'; c.fillRect(sx+6,sy+5+bob,2,1);
        break;
      }
      default: { // mid
        c.fillStyle=E.body; c.fillRect(sx+3,sy+1+bob,10,5);
        c.fillStyle=E.dark; c.fillRect(sx+4,sy+2+bob,8,3);
        c.fillStyle=E.eye;  c.fillRect(sx+4,sy+2+bob,3,2); c.fillRect(sx+9,sy+2+bob,3,2);
        c.fillStyle=E.body; c.fillRect(sx+2,sy+6,12,8);
        c.fillStyle=E.dark; c.fillRect(sx+2,sy+6,12,2); c.fillRect(sx+2,sy+12,5,3); c.fillRect(sx+9,sy+12,5,3);
        break;
      }
      case 'blob': { // ooze / sludge
        const q = this.fi % 8 < 4 ? 0 : 1;
        c.fillStyle=E.body; c.fillRect(sx+1,sy+5+bob,14,7+q);
        c.fillStyle=E.dark; c.fillRect(sx+3,sy+7+bob,4,3); c.fillRect(sx+9,sy+8+bob,3,2);
        c.fillStyle=E.eye;  c.fillRect(sx+4,sy+6+bob,2,2); c.fillRect(sx+9,sy+6+bob,2,2);
        c.fillStyle=E.body; c.fillRect(sx,sy+8,3,4); c.fillRect(sx+13,sy+8,3,4);
        c.fillStyle=E.dark; c.fillRect(sx+1,sy+4+bob-q,14,2);
        break;
      }
    }
  }

  /* ── Visual effects ── */
  _drawFX() {
    const c = this.ctx;
    this.effects.forEach(e => {
      const t = e.age / e.max;
      const a = 1 - t;
      const {sx, sy} = this._ws(e.x, e.y - t * 1.1);
      c.globalAlpha = a;
      if (e.type === 'slash') {
        c.fillStyle = e.col || '#f8f8d0';
        c.fillRect(sx-5, sy, 10, 2); c.fillRect(sx-1, sy-5, 2, 10);
        c.fillRect(sx-4, sy-4, 3, 3); c.fillRect(sx+1, sy+1, 3, 3);
      } else if (e.type === 'num') {
        c.fillStyle = e.val > 0 ? '#f83030' : '#50c850';
        this._pxText((e.val > 0 ? '-' : '+') + Math.abs(e.val), sx, sy - Math.round(t*10));
      } else if (e.type === 'ability') {
        const r = Math.round((1 - t) * 14);
        c.fillStyle = e.col;
        c.fillRect(sx-r, sy, r*2, 2); c.fillRect(sx-1, sy-r, 2, r);
        c.fillRect(sx-r, sy-r, r*2, 2);
      }
      c.globalAlpha = 1;
    });
  }

  /* ── Minimal pixel font (3×5) ── */
  _pxText(text, x, y) {
    const c = this.ctx;
    const G = {'0':'111 101 101 101 111','1':'010 110 010 010 111','2':'111 001 011 100 111',
               '3':'111 001 011 001 111','4':'101 101 111 001 001','5':'111 100 110 001 111',
               '6':'111 100 111 101 111','7':'111 001 001 001 001','8':'111 101 111 101 111',
               '9':'111 101 111 001 111','-':'000 000 111 000 000','+':'000 010 111 010 000'};
    let cx = x;
    for (const ch of String(text)) {
      const g = G[ch]; if (!g) { cx += 4; continue; }
      const rows = g.split(' ');
      for (let ry = 0; ry < 5; ry++)
        for (let rx = 0; rx < 3; rx++)
          if (rows[ry][rx]==='1') c.fillRect(cx+rx, y+ry, 1, 1);
      cx += 4;
    }
  }

  /* ── Move party to a room, fire callback on arrival ── */
  _movePartyTo(room, callback) {
    this.party.forEach((p, i) => {
      if (p.status !== 'incapacitated') {
        const pos = this._formPos(room, i);
        p.twx = pos.x; p.twy = pos.y;
        p.facing = p.twx > p.wx ? 1 : -1;
      }
    });
    this._moveTo(callback, 2200);
  }

  /* ── Set an arrival callback with a timeout fallback ── */
  _moveTo(callback, timeoutMs) {
    const token = ++this._ticket;
    this.onArrival = () => {
      if (this._ticket === token) { this.onArrival = null; if (callback) callback(); }
    };
    setTimeout(() => {
      if (this._ticket === token && this.onArrival) {
        const cb = this.onArrival; this.onArrival = null; if (cb) cb();
      }
    }, timeoutMs);
  }
}

// Each run creates its own DungeonRenderer instance — no shared singleton.

