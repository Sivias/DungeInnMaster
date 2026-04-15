/* ═══════════════════════════════════════════════════════
   DATA.JS — All game constants, tables, and combat text
   (Runs in browser via <script> and on Node.js unchanged)
═══════════════════════════════════════════════════════ */

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
    ability: { name: 'Rally Cry',     desc: 'Boosts the whole party\'s effective power by +8 this encounter.', type: 'powerBoost', value: 8 }
  },
  {
    name: 'Rogue', icon: '🗡️', basePower: 3, baseHp: 22,
    ability: { name: 'Backstab',      desc: 'Doubles this member\'s power contribution for this encounter.',   type: 'selfDouble' }
  },
  {
    name: 'Mage', icon: '🔮', basePower: 5, baseHp: 20,
    ability: { name: 'Fireball',      desc: 'Guaranteed success this encounter — costs 12 HP.',               type: 'autoWin', hpCost: 12 }
  },
  {
    name: 'Cleric', icon: '✨', basePower: 3, baseHp: 26,
    ability: { name: 'Mend',          desc: 'Heals the most wounded party member for 25 HP.',                 type: 'heal', value: 25 }
  },
  {
    name: 'Ranger', icon: '🏹', basePower: 3, baseHp: 25,
    ability: { name: 'Aimed Shot',    desc: 'Adds +10 to the success roll for this encounter.',               type: 'rollBoost', value: 10 }
  },
  {
    name: 'Paladin', icon: '🛡️', basePower: 4, baseHp: 32,
    ability: { name: 'Holy Shield',   desc: 'Halves all damage taken if this encounter is failed.',           type: 'shield' }
  },
  {
    name: 'Bard', icon: '🎵', basePower: 2, baseHp: 20,
    ability: { name: 'Inspire',       desc: 'Grants every party member +3 power for the rest of this run.',  type: 'runBoost', value: 3 }
  },
  {
    name: 'Druid', icon: '🌿', basePower: 3, baseHp: 24,
    ability: { name: 'Entangle',      desc: 'Roots the enemy — guaranteed success, no HP cost.',             type: 'autoWin' }
  },
  {
    name: 'Warlock', icon: '💀', basePower: 5, baseHp: 20,
    ability: { name: 'Dark Pact',     desc: 'Guaranteed success — costs 15 HP (paid in blood).',             type: 'autoWin', hpCost: 15 }
  },
  {
    name: 'Monk', icon: '👊', basePower: 3, baseHp: 25,
    ability: { name: 'Flurry',        desc: 'A rapid flurry of blows — adds +12 to the success roll.',       type: 'rollBoost', value: 12 }
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

/* ── Dungeon encounter table ── */
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

/* ── Enemy roster: how many combatants each encounter spawns ── */
const ENCOUNTER_ENEMIES = {
  'Cave Rat Swarm':    { count: 4, singular: 'Cave Rat' },
  'Goblin Lookout':    { count: 1, singular: 'Goblin Lookout' },
  'Animated Bones':    { count: 3, singular: 'Skeleton' },
  'Startled Bats':     { count: 3, singular: 'Bat' },
  'Dungeon Ooze':      { count: 1, singular: 'Dungeon Ooze' },
  'Kobold Trapper':    { count: 1, singular: 'Kobold' },
  'Feral Shroom':      { count: 2, singular: 'Feral Shroom' },
  'Tomb Worm':         { count: 1, singular: 'Tomb Worm' },
  'Dungeon Pixie':     { count: 1, singular: 'Dungeon Pixie' },
  'Crypt Spider':      { count: 1, singular: 'Crypt Spider' },
  'Goblin Ambush':     { count: 3, singular: 'Goblin' },
  'Skeleton Warriors': { count: 3, singular: 'Skeleton' },
  'Giant Spider':      { count: 1, singular: 'Giant Spider' },
  'Bandit Scouts':     { count: 2, singular: 'Bandit Scout' },
  'Mimic Chest':       { count: 1, singular: 'Mimic' },
  'Wraith Swarm':      { count: 3, singular: 'Wraith' },
  'Sludge Cube':       { count: 1, singular: 'Sludge Cube' },
  'Ghoul Pack':        { count: 3, singular: 'Ghoul' },
  'Shadow Wisp':       { count: 2, singular: 'Shadow Wisp' },
  'Hobgoblin Grunt':   { count: 1, singular: 'Hobgoblin' },
  'Cursed Armor':      { count: 1, singular: 'Cursed Armor' },
  'Orc Warband':       { count: 3, singular: 'Orc' },
  'Dark Mage':         { count: 1, singular: 'Dark Mage' },
  'Dragon Hatchling':  { count: 1, singular: 'Dragon Hatchling' },
  'Troll Bridge':      { count: 1, singular: 'Troll' },
  'Vampire Lair':      { count: 2, singular: 'Vampire' },
  'Stone Golem':       { count: 1, singular: 'Stone Golem' },
  'Demon Portal':      { count: 2, singular: 'Demon' },
  'Bandit Camp':       { count: 3, singular: 'Bandit' },
};

/* ── Combat flavor text ── */
const COMBAT_LIMBS = ['arm', 'leg', 'shoulder', 'ribs', 'knee', 'shin', 'side', 'forearm'];

const ENEMY_ATTACKS = {
  'Cave Rat Swarm':    ['gnaws at {p}\'s {limb}', 'swarms over {p} with biting teeth', 'scratches {p}\'s {limb} with tiny claws'],
  'Goblin Lookout':    ['hacks at {p}\'s {limb} with a dull scimitar', 'jabs {p} in the ribs with a rusty spear', 'kicks {p} hard in the {limb}'],
  'Animated Bones':    ['claws at {p} with bony fingers', 'rakes across {p}\'s {limb} with a skeletal hand', 'swings a cracked femur at {p}\'s head'],
  'Startled Bats':     ['scratches and bites at {p}\'s face', 'rakes {p}\'s {limb} with tiny claws', 'slams leathery wings into {p}\'s face'],
  'Dungeon Ooze':      ['engulfs {p}\'s {limb} with acidic slime', 'slaps a pseudopod across {p}\'s chest', 'drenches {p}\'s {limb} in corrosive goo'],
  'Kobold Trapper':    ['jabs {p} with a sharpened bone', 'snaps a crude trap on {p}\'s {limb}', 'flings a fistful of caltrops at {p}'],
  'Feral Shroom':      ['lashes {p} with a spore-covered tendril', 'spits a jet of corrosive slime at {p}', 'slams a thick stalk into {p}\'s {limb}'],
  'Tomb Worm':         ['thrashes its bulk into {p}', 'sinks mandibles into {p}\'s {limb}', 'sweeps {p} off balance with its tail'],
  'Dungeon Pixie':     ['flings a razor-sharp pebble at {p}\'s {limb}', 'scratches {p} with tiny barbed claws', 'douses {p} with a vial of burning acid'],
  'Crypt Spider':      ['bites {p}\'s {limb} with venomous fangs', 'wraps {p}\'s {limb} in sticky webbing then bites', 'drops onto {p}\'s shoulder and sinks in its fangs'],
  'Goblin Ambush':     ['hacks at {p}\'s {limb} with a notched blade', 'hurls a stone that cracks off {p}\'s {limb}', 'lunges at {p} with a crude spear'],
  'Skeleton Warriors': ['drives a rusted sword at {p}\'s chest', 'rakes at {p}\'s throat with bony fingers', 'swings a blade across {p}\'s {limb}'],
  'Giant Spider':      ['sinks enormous fangs into {p}\'s {limb}', 'wraps {p} in thick webbing then bites hard', 'stabs {p} with a barbed leg'],
  'Bandit Scouts':     ['slashes at {p}\'s {limb}', 'fires a crossbow bolt that grazes {p}\'s shoulder', 'lands a dirty punch on {p}\'s ribs'],
  'Mimic Chest':       ['bites down hard on {p}\'s hand', 'slams its heavy lid into {p}\'s face', 'locks its jaws on {p}\'s {limb} and shakes'],
  'Wraith Swarm':      ['rakes cold spectral claws through {p}\'s chest', 'drains the warmth from {p}\'s {limb}', 'passes through {p}, leaving icy agony behind'],
  'Sludge Cube':       ['engulfs {p}\'s {limb} in acidic goo', 'slams its gelatinous mass into {p}', 'dissolves part of {p}\'s armour with a tendril'],
  'Ghoul Pack':        ['rakes rotting claws across {p}\'s {limb}', 'bites into {p}\'s shoulder with yellowed teeth', 'slams {p} to the ground and claws at them'],
  'Shadow Wisp':       ['tears through {p}\'s {limb} like cold mist', 'wraps a shadow-tendril around {p}\'s throat', 'blasts {p} with a pulse of necrotic cold'],
  'Hobgoblin Grunt':   ['drives a heavy blade into {p}\'s {limb}', 'headbutts {p} with an iron helmet', 'shoves {p} into the wall then strikes'],
  'Cursed Armor':      ['brings a rusted halberd down on {p}\'s {limb}', 'backhands {p} with an armored gauntlet', 'slams a heavy shield into {p}\'s chest'],
  'Orc Warband':       ['buries an axe into {p}\'s {limb}', 'shoulder-charges {p} with a battle roar', 'drives a war spear at {p}\'s chest'],
  'Dark Mage':         ['blasts {p} with a bolt of dark energy', 'fires a necrotic ray at {p}\'s chest', 'curses {p}\'s {limb} with withering magic'],
  'Dragon Hatchling':  ['breathes a cone of fire over {p}', 'rakes {p} with razor-sharp claws', 'slams {p} with its heavy tail'],
  'Troll Bridge':      ['swings a massive club at {p}\'s {limb}', 'hurls {p} against the stone wall', 'stomps on {p}\'s foot with a boulder-like heel'],
  'Vampire Lair':      ['sinks fangs into {p}\'s neck, draining vitality', 'claws across {p}\'s {limb} in a pale blur', 'wraps cold hands around {p}\'s throat'],
  'Stone Golem':       ['slams a granite fist into {p}\'s chest', 'grinds a rocky heel onto {p}\'s foot', 'backhands {p} with a blow like a falling stone'],
  'Demon Portal':      ['lashes {p} with a barbed tail', 'blasts {p} with a bolt of hellfire', 'rakes {p}\'s {limb} with infernal claws'],
  'Bandit Camp':       ['slashes at {p}\'s {limb} with a worn shortsword', 'shoves {p} and follows with a stab', 'fires a crossbow bolt at {p}\'s chest'],
};

const PARTY_ATTACKS = {
  'Fighter':  ['drives their sword deep into the {e}', 'slashes the {e} with a powerful overhead strike', 'charges the {e} with a shield bash then thrusts'],
  'Rogue':    ['darts behind the {e} and drives a dagger between its ribs', 'slips from the shadows and slashes the {e}', 'delivers a precise backstab to the {e}'],
  'Mage':     ['hurls a magic missile at the {e}', 'blasts the {e} with a lance of arcane fire', 'gestures sharply and a bolt of force strikes the {e}'],
  'Cleric':   ['calls down divine light upon the {e}', 'smites the {e} with a glowing mace strike', 'channels holy energy into a crushing blow on the {e}'],
  'Ranger':   ['looses a precise arrow into the {e}', 'fires two quick shots at the {e}', 'draws back and releases a well-aimed shot at the {e}'],
  'Paladin':  ['charges the {e} with a blessed warhammer', 'smites the {e} with a burst of divine radiance', 'drives a holy-edged blade into the {e}'],
  'Bard':     ['distracts the {e} with a mocking verse, then slashes it', 'strums a dissonant chord that staggers the {e}', 'performs a quick blade flourish across the {e}'],
  'Druid':    ['calls thorny vines to lash the {e}', 'summons a gust of wind that sends the {e} reeling', 'claws the {e} with briefly shapeshifted hands'],
  'Warlock':  ['blasts the {e} with crackling eldritch energy', 'fires a hex bolt that tears through the {e}', 'points a cursed finger and looses a dark beam at the {e}'],
  'Monk':     ['delivers a rapid flurry of blows to the {e}', 'lands a flying kick squarely on the {e}', 'strikes three precise pressure points on the {e}'],
};

/* ── Node.js export (browser loads this as a plain <script>, so guard it) ── */
if (typeof module !== 'undefined') {
  module.exports = {
    DEFS, CLASSES, RARITIES, RARITY_WEIGHTS,
    FIRST_NAMES, EPITHETS, ENCOUNTERS, ENCOUNTER_ENEMIES,
    COMBAT_LIMBS, ENEMY_ATTACKS, PARTY_ATTACKS,
  };
}

