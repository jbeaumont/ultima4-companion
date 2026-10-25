// The spellbook (#79): every spell's cost, recipe and where it works, from
// u4-decompiled U4_SPELL.C (D_208C costs, each SPL_ handler's checks) and
// U4_MIX.C (D_277E reagent masks). The game only checks WHICH reagents went in,
// so one of each is enough; extra portions are wasted (several townsfolk say so).
import type { PartySave } from '../parsers/party'
import { REAGENTS, SPELLS } from './constants'
import type { SpoilerLevel } from './hints'
import { disclosure } from './spoilers'

/** Where a spell can be cast (the handler's checks). */
export type SpellWhere = 'anywhere' | 'combat' | 'dungeon' | 'outdoors' | 'notCombat' | 'dungeonOrCombat'

export const WHERE_TEXT: Record<SpellWhere, string> = {
  anywhere: 'Anywhere',
  combat: 'Combat only',
  dungeon: 'Dungeons only',
  outdoors: 'Outdoors only',
  notCombat: 'Not in combat',
  dungeonOrCombat: 'Dungeons and combat'
}

export interface Spell {
  letter: string
  name: (typeof SPELLS)[number]
  mp: number
  /** Reagent bit mask as the game stores it: 0x80 >> i for REAGENTS[i]. */
  mask: number
  where: SpellWhere
  effect: string
  /** The game's manual gives the recipe; otherwise it is learned in play. */
  inManual: boolean
  /** Who teaches a recipe the manual withholds (a spoiler). */
  learnedFrom?: string
}

const R = (...names: (typeof REAGENTS)[number][]): number => names.reduce((m, n) => m | (0x80 >> REAGENTS.indexOf(n)), 0)
const ASH = 'Sulfurous Ash', GIN = 'Ginseng', GAR = 'Garlic', SILK = 'Spider Silk', MOSS = 'Blood Moss', PEARL = 'Black Pearl', SHADE = 'Nightshade', MAN = 'Mandrake Root'

export const SPELLBOOK: Spell[] = [
  { letter: 'A', name: 'Awaken', mp: 5, mask: R(GIN, GAR), where: 'anywhere', effect: 'Wakes a party member from magical sleep.', inManual: true },
  { letter: 'B', name: 'Blink', mp: 15, mask: R(SILK, MOSS), where: 'outdoors', effect: 'Jumps the party a long way in a direction. On foot or horseback, not aboard a ship or balloon.', inManual: true },
  { letter: 'C', name: 'Cure', mp: 5, mask: R(GIN, GAR), where: 'anywhere', effect: 'Cures a poisoned party member.', inManual: true },
  { letter: 'D', name: 'Dispel', mp: 20, mask: R(ASH, GAR, PEARL), where: 'anywhere', effect: 'Removes an energy field: the one ahead in a dungeon, or in a direction elsewhere.', inManual: true },
  { letter: 'E', name: 'Energy Field', mp: 10, mask: R(ASH, SILK, PEARL), where: 'dungeonOrCombat', effect: 'Raises a poison, lightning, fire or sleep field ahead (dungeon) or in a direction (combat).', inManual: true },
  { letter: 'F', name: 'Fireball', mp: 15, mask: R(ASH, PEARL), where: 'combat', effect: 'A missile of fire: strong damage to the first foe in a direction.', inManual: true },
  { letter: 'G', name: 'Gate', mp: 40, mask: R(ASH, PEARL, MAN), where: 'outdoors', effect: 'Carries the party to the moongate of a chosen phase (1 to 8). On foot or horseback.', inManual: false, learnedFrom: 'Mentorian in Cove (ask about GATE)' },
  { letter: 'H', name: 'Heal', mp: 10, mask: R(GIN, SILK), where: 'anywhere', effect: 'Restores 75 to 99 HP to a party member.', inManual: true },
  { letter: 'I', name: 'Iceball', mp: 20, mask: R(PEARL, MAN), where: 'combat', effect: 'A missile of ice: heavy damage to the first foe in a direction.', inManual: true },
  { letter: 'J', name: 'Jinx', mp: 30, mask: R(PEARL, SHADE, MAN), where: 'anywhere', effect: 'Foes turn on each other for 10 turns.', inManual: true },
  { letter: 'K', name: 'Kill', mp: 25, mask: R(PEARL, SHADE), where: 'combat', effect: 'A deadly missile: usually slays the first foe in a direction.', inManual: true },
  { letter: 'L', name: 'Light', mp: 5, mask: R(ASH), where: 'dungeon', effect: 'Lights the dungeon for 100 turns, like a long-lasting torch.', inManual: true },
  { letter: 'M', name: 'Magic Missile', mp: 5, mask: R(ASH, PEARL), where: 'combat', effect: 'A small missile: light damage to the first foe in a direction.', inManual: true },
  { letter: 'N', name: 'Negate', mp: 20, mask: R(ASH, GAR, MAN), where: 'anywhere', effect: 'Stops all spellcasting, foes and friends alike, for 10 turns.', inManual: true },
  { letter: 'O', name: 'Open', mp: 5, mask: R(ASH, MOSS), where: 'anywhere', effect: 'Opens a chest without setting off its trap.', inManual: true },
  { letter: 'P', name: 'Protection', mp: 15, mask: R(ASH, GIN, GAR), where: 'anywhere', effect: 'Shields the party from attacks for 10 turns.', inManual: true },
  { letter: 'Q', name: 'Quickness', mp: 20, mask: R(ASH, GIN, MOSS), where: 'anywhere', effect: 'The party acts faster in battle for 10 turns.', inManual: true },
  { letter: 'R', name: 'Resurrect', mp: 45, mask: R(ASH, GIN, GAR, SILK, MOSS, MAN), where: 'notCombat', effect: 'Brings a dead party member back to life.', inManual: false, learnedFrom: 'Nigel in the Lycaeum' },
  { letter: 'S', name: 'Sleep', mp: 15, mask: R(GIN, SILK), where: 'combat', effect: 'Puts weaker living foes to sleep (not the undead).', inManual: true },
  { letter: 'T', name: 'Tremor', mp: 30, mask: R(ASH, MOSS, MAN), where: 'combat', effect: 'Shakes the ground: damages or routs weaker foes.', inManual: true },
  { letter: 'U', name: 'Undead', mp: 15, mask: R(ASH, GAR), where: 'combat', effect: 'Weakens undead foes to the brink of destruction.', inManual: false, learnedFrom: 'no one: the manual leaves it as a puzzle of two reagents' },
  { letter: 'V', name: 'View', mp: 15, mask: R(SHADE, MAN), where: 'anywhere', effect: 'Shows the map around the party, like peering at a gem.', inManual: true },
  { letter: 'W', name: 'Winds', mp: 10, mask: R(ASH, MOSS), where: 'outdoors', effect: 'Sets the wind direction, for sailing.', inManual: true },
  { letter: 'X', name: 'X-it', mp: 15, mask: R(ASH, SILK, MOSS), where: 'dungeon', effect: 'Returns the party from a dungeon to the surface.', inManual: true },
  { letter: 'Y', name: 'Y-up', mp: 10, mask: R(SILK, MOSS), where: 'dungeon', effect: 'Lifts the party one dungeon level (not in the Abyss).', inManual: true },
  { letter: 'Z', name: 'Z-down', mp: 5, mask: R(SILK, MOSS), where: 'dungeon', effect: 'Drops the party one dungeon level (not in the Abyss or from level 8).', inManual: true }
]

/** Reagent indexes (into REAGENTS) in a recipe mask. */
export const reagentsOf = (mask: number): number[] => REAGENTS.map((_, i) => i).filter((i) => (mask & (0x80 >> i)) !== 0)

/** How many more of this spell the party's reagents can make (one of each reagent per mixture). */
export const canMix = (p: PartySave, s: Spell): number => Math.min(...reagentsOf(s.mask).map((i) => p.reagents[i] ?? 0))

/** Party members awake and alive with the MP for this spell now. */
export const castersOf = (p: PartySave, s: Spell): string[] =>
  p.members.filter((m) => m.status !== 'D' && m.status !== 'S' && m.mp >= s.mp).map((m) => m.name)

/** Whether the recipe may be shown: from the manual always; learned-in-play ones at Full, or once mixed. */
export function recipeShown(s: Spell, level: SpoilerLevel, p: PartySave | null): boolean {
  if (s.inManual) return true
  if (p && (p.mixtures[SPELLBOOK.indexOf(s)] ?? 0) > 0) return true
  return disclosure(level).hintTiers >= 3
}

export type Place = 'combat' | 'dungeon' | 'outdoors' | 'town'

/** Whether a spell can be cast where the party is now. */
export function worksIn(s: Spell, place: Place): boolean {
  switch (s.where) {
    case 'anywhere': return true
    case 'combat': return place === 'combat'
    case 'dungeon': return place === 'dungeon'
    case 'outdoors': return place === 'outdoors'
    case 'notCombat': return place !== 'combat'
    case 'dungeonOrCombat': return place === 'dungeon' || place === 'combat'
  }
}

/** The party's place from the save: dungeons are locations 17 and up. */
export const placeOf = (p: PartySave, inBattle: boolean): Place =>
  inBattle ? 'combat' : p.location === 0 ? 'outdoors' : p.location >= 17 ? 'dungeon' : 'town'
