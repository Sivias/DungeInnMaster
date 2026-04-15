/* ═══════════════════════════════════════════════════════
   COMBAT-TABLES.JS — Static flavor-text & encounter data
   All entries are keyed by encounter or class name so new
   encounters / classes can be added here without touching
   any combat logic.
   Load order: before combat.js and adventure.js
═══════════════════════════════════════════════════════ */

/* ── Body parts referenced in enemy attack descriptions ── */
const COMBAT_LIMBS = ['arm', 'leg', 'shoulder', 'ribs', 'knee', 'shin', 'side', 'forearm'];

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

/* ── Per-encounter attack flavor text  {p} = target name, {limb} = body part ── */
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

/* ── Per-class attack flavor text  {e} = enemy name ── */
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

