// Dungeon extras for the map: orb attributes, stone altars, level-8 altar rooms and the party arrow.
// Orb effects are from the xu4 docs; altar coordinates are xu4 maps.b labels (x, y, level, all 0-based).
import type { DungeonCell } from '@parsers/dungeon'
import { ABYSS_ID } from './dungeonGlyphs'

export type Attr = 'STR' | 'DEX' | 'INT'

const ATTR_NAMES: Record<Attr, string> = { STR: 'Strength', DEX: 'Dexterity', INT: 'Intelligence' }

/** What touching a magic orb raises (by 5), per dungeon id. The Abyss has none. */
export const ORB_ATTRS: Record<number, Attr[]> = {
  17: ['INT'], // Deceit
  18: ['DEX'], // Despise
  19: ['STR'], // Destard
  20: ['INT', 'DEX'], // Wrong
  21: ['DEX', 'STR'], // Covetous
  22: ['INT', 'STR'], // Shame
  23: ['STR', 'DEX', 'INT'] // Hythloth
}

/** Tooltip text for an orb in this dungeon, or null when its orbs do nothing known. */
export function orbLabel(dungeonId: number): string | null {
  const a = ORB_ATTRS[dungeonId]
  return a ? `Magic orb: +5 ${a.map((x) => ATTR_NAMES[x]).join(' and ')}` : null
}

export interface StoneAltar { x: number; y: number; level: number; stone: string }

/** Where each coloured stone sits on its altar. Spoilers: show only at spoiler level 'full'. */
export const STONE_ALTARS: Record<number, StoneAltar> = {
  17: { x: 1, y: 7, level: 6, stone: 'Blue stone' },
  18: { x: 3, y: 5, level: 4, stone: 'Yellow stone' },
  19: { x: 3, y: 7, level: 6, stone: 'Red stone' },
  20: { x: 6, y: 3, level: 7, stone: 'Green stone' },
  21: { x: 7, y: 1, level: 6, stone: 'Orange stone' },
  22: { x: 7, y: 7, level: 1, stone: 'Purple stone' }
}

export function stoneAltarAt(dungeonId: number, level: number, x: number, y: number): StoneAltar | null {
  const a = STONE_ALTARS[dungeonId]
  return a && a.level === level && a.x === x && a.y === y ? a : null
}

/** Level-8 room cells (room 15) that lead to the three altar rooms, keyed "x,y". */
const ALTAR_ROOMS: Record<string, string> = { '1,1': 'Truth', '3,3': 'Love', '7,7': 'Courage' }
const ALTAR_LEVEL = 7
const ALTAR_ROOM = 15

/** "Truth altar" etc. for a room cell on level 8 of one of the seven dungeons; null elsewhere (never the Abyss). */
export function altarRoomLabel(dungeonId: number, level: number, x: number, y: number, cell: DungeonCell): string | null {
  if (dungeonId === ABYSS_ID || !(dungeonId in ORB_ATTRS) || level !== ALTAR_LEVEL) return null
  if (cell.feature !== 'room' || cell.variant !== ALTAR_ROOM) return null
  const name = ALTAR_ROOMS[`${x},${y}`]
  return name ? `${name} altar` : null
}

/** Rotation in degrees for an upward-pointing arrow, from the party orientation (0 W, 1 N, 2 E, 3 S). */
export const arrowAngle = (orientation: number): number => (((orientation | 0) - 1) % 4 + 4) % 4 * 90

/** Live monsters from the DNGMAP.SAV cells of one level: cell index -> monster name. */
export function liveMonsters(level: Uint8Array, decode: (raw: number) => DungeonCell): Map<number, string> {
  const out = new Map<number, string>()
  level.forEach((raw, i) => {
    const m = decode(raw).monster
    if (m) out.set(i, m)
  })
  return out
}
