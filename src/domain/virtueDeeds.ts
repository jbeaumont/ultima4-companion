// What raises and lowers each virtue, from every karma change in the game
// (u4-decompiled karma_inc / karma_dec calls), in our own words. Karma tops out
// at 99; losing any in a virtue you are already a partial Avatar of drops it
// back below 99 ("Thou hast lost an Eighth!", U4_UTIL.C karma_dec).
import { VIRTUES } from './constants'

export interface Deed {
  /** Virtue indexes affected. */
  virtues: number[]
  /** Change, e.g. "+2" or "−5". */
  change: string
  deed: string
  good: boolean
  /** Only shown at full spoilers (quest items and late-game secrets). */
  spoiler?: boolean
  source: string
}

const HON = 0, COM = 1, VAL = 2, JUS = 3, SAC = 4, HNR = 5, SPI = 6, HUM = 7
const ALL = [0, 1, 2, 3, 4, 5, 6, 7]

/** Creatures that are not evil (U4_UTIL.C C_0AFE): people and a few animals. */
export const NOT_EVIL = 'people, seahorses, rats, bats, giant spiders, insect swarms and pythons'

export const DEEDS: Deed[] = [
  { virtues: [HON, JUS, HNR], change: '+2', good: true, deed: 'Buy reagents and pay the full price', source: 'U4_SHOPS.C SHP_reagent' },
  { virtues: [HON, JUS, HNR], change: '−4 or more', good: false, deed: 'Pay a reagent seller less than the price', source: 'U4_SHOPS.C SHP_reagent' },
  { virtues: [HON, JUS, HNR], change: '−1', good: false, deed: 'Take from a chest in a town or castle (it belongs to someone)', source: 'U4_GET.C' },
  { virtues: [COM], change: '+2', good: true, deed: 'Give gold to a beggar (counts once every 16 moves)', source: 'U4_TALK.C TLK_give' },
  { virtues: [COM, JUS], change: '+1', good: true, deed: 'Let a creature that is not evil flee', source: 'U4_AI.C' },
  { virtues: [COM, JUS], change: '+2', good: true, deed: 'Walk away from a fight with creatures that are not evil', source: 'U4_COMBC.C' },
  { virtues: [COM, JUS, HNR], change: '−5', good: false, deed: 'Attack anyone in a town, or a creature that is not evil', source: 'U4_COMBA.C CMD_Attack' },
  { virtues: [VAL], change: '+0 to 1', good: true, deed: 'Win a battle against evil creatures', source: 'U4_COMBC.C' },
  { virtues: [VAL], change: '−2', good: false, deed: 'Lose a battle against evil creatures (everyone flees)', source: 'U4_COMBC.C' },
  { virtues: [VAL, SAC], change: '−2', good: false, deed: 'Flee from evil creatures while unhurt', source: 'U4_COMBB.C' },
  { virtues: [SAC], change: '+5', good: true, deed: 'Give blood at a healer when asked (costs 100 HP)', source: 'U4_SHOPS.C' },
  { virtues: [SAC], change: '−5', good: false, deed: 'Refuse to give blood at a healer', source: 'U4_SHOPS.C' },
  { virtues: [SAC], change: '+1', good: true, deed: 'A party member falls in battle', source: 'U4_AI.C' },
  { virtues: [HNR], change: '+5', good: true, deed: 'Find a hidden item or a stone by searching', source: 'U4_SRCH.C, U4_SRCH2.C' },
  { virtues: [SPI], change: '+3 a cycle', good: true, deed: 'Meditate at a shrine with the right mantra', source: 'U4_SHRIN.C' },
  { virtues: [SPI], change: '−3', good: false, deed: 'Meditate with the wrong mantra', source: 'U4_SHRIN.C' },
  { virtues: [SPI], change: '+3', good: true, deed: 'Consult Hawkwind (once per hundred moves, shared with meditation)', source: 'U4_SHOPS.C SHP_hawkwind' },
  { virtues: [HUM], change: '+10', good: true, deed: 'Answer "no" when someone tempts you to boast (counts once every 16 moves)', source: 'U4_TALK.C' },
  { virtues: [HUM], change: '−5', good: false, deed: 'Answer "yes" and boast', source: 'U4_TALK.C' },
  { virtues: ALL, change: '−5', good: false, spoiler: true, deed: 'Use the Skull of Mondain anywhere but the Abyss', source: 'U4_USE.C' },
  { virtues: ALL, change: '+10', good: true, spoiler: true, deed: 'Cast the Skull of Mondain into the Abyss', source: 'U4_USE.C' }
]

/** Deeds affecting one virtue, good ones first; spoilers only when allowed. */
export function deedsFor(virtue: number, spoilers: boolean): Deed[] {
  return DEEDS.filter((d) => d.virtues.includes(virtue) && (spoilers || !d.spoiler)).sort((a, b) => Number(b.good) - Number(a.good))
}

export const virtueName = (i: number): string => VIRTUES[i] ?? `#${i}`
