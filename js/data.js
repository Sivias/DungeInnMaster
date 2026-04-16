/* ═══════════════════════════════════════
   DATA.JS — All game constants & tables
═══════════════════════════════════════ */

/* ── Inn location definitions ── */
const DEFS = {
  bar:      { name: 'Bar',        icon: '🍺', desc: 'Pours drinks and draws in thirsty patrons.',      baseCost: 15, income: 2 },
  kitchen:  { name: 'Kitchen',    icon: '🍖', desc: 'Hot meals keep guests coming back for more.',     baseCost: 20, income: 3 },
  cellar:   { name: 'Cellar',     icon: '🪣', desc: 'Ages your finest ales and stores supplies.',      baseCost: 10, income: 1 },
  hearth:   { name: 'Hearth',     icon: '🔥', desc: 'A warm hearth lets you shelter more parties at once. Lv 2 → 2 parties, Lv 4 → 3, Lv 5 → 4 simultaneous expeditions.', baseCost: 12, income: 2 },
  guestroom:{ name: 'Guest Room', icon: '🛏️', desc: 'Comfortable quarters. Higher levels attract more & better adventurers.', baseCost: 25, income: 4 },
  stable:   { name: 'Stable',     icon: '🐴', desc: 'Safe lodging for mounts — adventurers approve.', baseCost: 18, income: 3 },
};

/* ── Adventurer classes ── */
const CLASSES = [
  {
    name: 'Fighter', icon: '⚔️', basePower: 4, baseHp: 30,
    ability:     { name: 'Rally Cry',     desc: 'Boosts the whole party\'s effective power by +8 this encounter.', type: 'powerBoost', value: 8 },
    restAbility: { name: 'Iron Will',     type: 'healAll',    value: 10,
      flavor: 'slams a gauntlet on the cold stone and bellows a warrior\'s oath into the dark. The echo stirs something in every weary soul.' }
  },
  {
    name: 'Rogue', icon: '🗡️', basePower: 3, baseHp: 22,
    ability:     { name: 'Backstab',      desc: 'Doubles this member\'s power contribution for this encounter.',   type: 'selfDouble' },
    restAbility: { name: 'Scavenge',      type: 'gainGold',   value: 15,
      flavor: 'slips into every shadow and returns with pockets full of coins pried from cracks in forgotten flagstones.' }
  },
  {
    name: 'Mage', icon: '🔮', basePower: 5, baseHp: 20,
    ability:     { name: 'Fireball',      desc: 'Guaranteed success this encounter — costs 12 HP.',               type: 'autoWin', hpCost: 12 },
    restAbility: { name: 'Arcane Infusion', type: 'runBoost', value: 4,
      flavor: 'traces glowing sigils in the air above each ally\'s weapon. The light fades, but the enchantment lingers into the next floor.' }
  },
  {
    name: 'Cleric', icon: '✨', basePower: 3, baseHp: 26,
    ability:     { name: 'Mend',          desc: 'Heals the most wounded party member for 25 HP.',                 type: 'heal', value: 25, restUsable: true },
    restAbility: { name: 'Sacred Blessing', type: 'healLowest', value: 35,
      flavor: 'kneels in quiet prayer, golden light pooling beneath trembling hands. The wounds of the most grievously hurt begin to close.' }
  },
  {
    name: 'Ranger', icon: '🏹', basePower: 3, baseHp: 25,
    ability:     { name: 'Aimed Shot',    desc: 'Adds +10 to the success roll for this encounter.',               type: 'rollBoost', value: 10 },
    restAbility: { name: 'Herbal Remedy', type: 'healAll',    value: 12,
      flavor: 'gathers roots and dark-veined bark from the dungeon walls and steeps them in a tin cup. The bitter tonic smells of pine and mud — but it works.' }
  },
  {
    name: 'Paladin', icon: '🛡️', basePower: 4, baseHp: 32,
    ability:     { name: 'Holy Shield',   desc: 'Halves all damage taken if this encounter is failed.',           type: 'shield' },
    restAbility: { name: 'Lay on Hands',  type: 'healLowest', value: 40,
      flavor: 'removes a gauntlet and places a bare palm on the most battered companion. Divine warmth flows through cracked ribs and tired muscle.' }
  },
  {
    name: 'Bard', icon: '🎵', basePower: 2, baseHp: 20,
    ability:     { name: 'Inspire',       desc: 'Grants every party member +3 power for the rest of this floor.',  type: 'runBoost', value: 3 },
    restAbility: { name: 'Rousing Ballad', type: 'runBoost',  value: 4,
      flavor: 'unslings the lute and plays a rollicking tune that echoes off the stone walls. Even the shadows seem to dance. Blades feel lighter, hearts grow bold.' }
  },
  {
    name: 'Druid', icon: '🌿', basePower: 3, baseHp: 24,
    ability:     { name: 'Entangle',      desc: 'Roots the enemy — guaranteed success, no HP cost.',             type: 'autoWin' },
    restAbility: { name: 'Herbal Poultice', type: 'healLowest', value: 15,
      flavor: 'grinds a pale flower and a fistful of bat guano into a thick green paste, humming softly. The smell is awful. The healing is not.' }
  },
  {
    name: 'Warlock', icon: '💀', basePower: 5, baseHp: 20,
    ability:     { name: 'Dark Pact',     desc: 'Guaranteed success — costs 15 HP (paid in blood).',             type: 'autoWin', hpCost: 15 },
    restAbility: { name: 'Blood Tithe',   type: 'soulSiphon', value: 30, selfDmg: 10,
      flavor: 'whispers a bargain into the dark, and the dark whispers back. Life drains from their own veins, flowing into the wounds of a struggling ally.' }
  },
  {
    name: 'Monk', icon: '👊', basePower: 3, baseHp: 25,
    ability:     { name: 'Flurry',        desc: 'A rapid flurry of blows — adds +12 to the success roll.',       type: 'rollBoost', value: 12 },
    restAbility: { name: 'Focused Breathing', type: 'healSelf', value: 25,
      flavor: 'sits cross-legged on the cold stone, eyes closed, breathing slow and deliberate. Ki flows inward, mending bruised ribs and tired muscles.' }
  },
];

/* ── Rarity tiers ── */
const RARITIES = [
  { id: 'common',    label: 'Common',    cls: 'rarity-common',    range: [2,  6],  color: '#6a6a7a', hpMult: 1.0 },
  { id: 'uncommon',  label: 'Uncommon',  cls: 'rarity-uncommon',  range: [5,  10], color: '#2a8a4a', hpMult: 1.3 },
  { id: 'rare',      label: 'Rare',      cls: 'rarity-rare',      range: [9,  15], color: '#2a5ab0', hpMult: 1.6 },
  { id: 'epic',      label: 'Epic',      cls: 'rarity-epic',      range: [14, 20], color: '#803ab0', hpMult: 2.0 },
  { id: 'legendary', label: 'Legendary', cls: 'rarity-legendary', range: [19, 25], color: '#b09030', hpMult: 2.5 },
];

/* ── Rarity weights by Guest Room level [common, uncommon, rare, epic, legendary] ── */
const RARITY_WEIGHTS = [
  [72, 23, 5,  0,  0],
  [58, 28, 12, 2,  0],
  [44, 32, 18, 5,  1],
  [32, 32, 23, 11, 2],
  [22, 30, 27, 17, 4],
  [14, 26, 30, 22, 8],
];

/* ── Adventurer name pools ── */
const FIRST_NAMES = [
  'Aldric','Brynn','Calder','Danika','Edric','Faye','Gorin','Hilde',
  'Isolde','Jorik','Kira','Lorne','Mira','Nolan','Oryn','Petra',
  'Quinn','Ragnar','Sable','Theron','Ulf','Vesper','Wren','Xander',
  'Yara','Zephyr','Bael','Cressa','Dorin','Elara','Fyra','Galt',
];
const EPITHETS = [
  'the Bold','Ironhand','Swiftfoot','the Cursed','Brighteye','Stoneheart',
  'the Lost','Flamebane','the Wise','Darkblade','the Wanderer','Grimtooth',
  'the Fair','Coldfire','the Lucky','Greycloak','Ashfall','Thornback',
  'Duskmantle','Voidborn','the Scarred','Nightwhisper',
];

/* ── Dungeon encounter table ──
   difficulty 3-7 = minor nuisances   difficulty 8-14 = standard fights
   difficulty 15-22 = serious threats
─────────────────────────────────── */
const ENCOUNTERS = [
  /* ── Tier 1 · minor — difficulty 3-7 ── */
  { name:'Cave Rat Swarm',    icon:'🐀', difficulty:4,  reward:6,  damage:6,  desc:'Startled rats scatter from a kicked barrel — and go straight for the party!' },
  { name:'Goblin Lookout',    icon:'👺', difficulty:5,  reward:8,  damage:7,  desc:'A lone goblin sentry spills his watch-post and scrambles to attack!' },
  { name:'Animated Bones',    icon:'🦴', difficulty:4,  reward:7,  damage:6,  desc:'Scattered bones on the floor rattle and reassemble into something awful!' },
  { name:'Startled Bats',     icon:'🦇', difficulty:3,  reward:5,  damage:5,  desc:'The torch flame disturbs a colony of bats clinging to the ceiling!' },
  { name:'Dungeon Ooze',      icon:'🫧', difficulty:6,  reward:10, damage:9,  desc:'A quivering puddle on the floor rises into a hungry gelatinous blob!' },
  { name:'Kobold Trapper',    icon:'🪤', difficulty:6,  reward:10, damage:9,  desc:'A kobold springs a crude wire trap — then leaps out for the kill!' },
  { name:'Feral Shroom',      icon:'🍄', difficulty:5,  reward:8,  damage:8,  desc:'A clump of phosphorescent fungi releases a cloud of maddening spores!' },
  { name:'Tomb Worm',         icon:'🪱', difficulty:4,  reward:6,  damage:6,  desc:'Something long and pale wriggles out from a crack in the stonework!' },
  { name:'Dungeon Pixie',     icon:'🧚', difficulty:5,  reward:9,  damage:7,  desc:'A malicious little fae darts out from a jar on a dusty shelf!' },
  { name:'Crypt Spider',      icon:'🕷️', difficulty:7,  reward:11, damage:10, desc:'A spider the size of a fist drops silently from the ceiling!' },
  /* ── Tier 2 · standard — difficulty 8-14 ── */
  { name:'Goblin Ambush',     icon:'👺', difficulty:8,  reward:18, damage:14, desc:'A shrieking pack of goblins leaps from behind broken barrels!' },
  { name:'Skeleton Warriors', icon:'💀', difficulty:12, reward:24, damage:18, desc:'Animated skeletons rattle their bones and charge!' },
  { name:'Giant Spider',      icon:'🕷️', difficulty:10, reward:20, damage:15, desc:'A massive spider drops from the ceiling on thick silken threads!' },
  { name:'Bandit Scouts',     icon:'🏕️', difficulty:9,  reward:20, damage:13, desc:'Road bandits lurking in an alcove draw steel at your approach!' },
  { name:'Mimic Chest',       icon:'📦', difficulty:11, reward:25, damage:16, desc:'That glittering treasure chest has very sharp teeth!' },
  { name:'Wraith Swarm',      icon:'👻', difficulty:13, reward:28, damage:18, desc:'Pale wraiths swarm the corridor, chilling your very bones!' },
  { name:'Sludge Cube',       icon:'⚰️', difficulty:10, reward:20, damage:14, desc:'The crypt lid scrapes open and a cube of living sludge oozes out!' },
  { name:'Ghoul Pack',        icon:'🧟', difficulty:12, reward:22, damage:17, desc:'Three ghouls scramble out of a floor crevice, clawing hungrily!' },
  { name:'Shadow Wisp',       icon:'🌑', difficulty:11, reward:20, damage:15, desc:'A tendril of living darkness peels off the wall and lunges!' },
  { name:'Hobgoblin Grunt',   icon:'🪖', difficulty:13, reward:26, damage:19, desc:'A well-armed hobgoblin steps out from behind a pillar, sword raised!' },
  { name:'Cursed Armor',      icon:'🛡️', difficulty:14, reward:28, damage:18, desc:'A suit of ancient plate lurches upright and raises its rusted sword!' },
  /* ── Tier 3 · serious — difficulty 15-22 ── */
  { name:'Orc Warband',       icon:'🪓', difficulty:15, reward:32, damage:22, desc:'A warband of armored orcs bars your path with axes raised!' },
  { name:'Dark Mage',         icon:'🧙', difficulty:18, reward:40, damage:26, desc:'A robed figure crackles with dark energy and raises their staff!' },
  { name:'Dragon Hatchling',  icon:'🐉', difficulty:22, reward:58, damage:32, desc:'A young dragon rears up, guarding its glittering hoard!' },
  { name:'Troll Bridge',      icon:'🪨', difficulty:16, reward:34, damage:22, desc:'A hulking troll demands toll — or blood!' },
  { name:'Vampire Lair',      icon:'🧛', difficulty:20, reward:50, damage:28, desc:'Coffin lids explode open as a pale vampire rises to feed!' },
  { name:'Stone Golem',       icon:'🗿', difficulty:17, reward:36, damage:20, desc:'Ancient stone grinds as a colossal golem steps into your path!' },
  { name:'Demon Portal',      icon:'🔥', difficulty:21, reward:54, damage:30, desc:'A crackling portal tears open, spitting forth a lesser demon!' },
];

