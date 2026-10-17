// *.DNG dungeon layouts, DNGMAP.SAV live dungeon state, and *.CON battle maps.
import { expectSize } from './bytes'

export const DUNGEON_SIZE = 8
export const DUNGEON_LEVELS = 8
export const ROOM_SIZE = 11

export const DUNGEON_MONSTERS = [
  null, 'Rat', 'Bat', 'Spider', 'Ghost', 'Slime', 'Troll', 'Gremlin',
  'Mimic', 'Reaper', 'Insects', 'Gazer', 'Phantom', 'Orc', 'Skeleton', 'Rogue'
] as const

export type DungeonFeature =
  | 'empty' | 'ladderUp' | 'ladderDown' | 'ladderUpDown' | 'chest' | 'ceilingHole' | 'floorHole'
  | 'orb' | 'trap' | 'fountain' | 'field' | 'altar' | 'door' | 'room' | 'secretDoor' | 'wall'

const FEATURES: DungeonFeature[] = [
  'empty', 'ladderUp', 'ladderDown', 'ladderUpDown', 'chest', 'ceilingHole', 'floorHole', 'orb',
  'trap', 'fountain', 'field', 'altar', 'door', 'room', 'secretDoor', 'wall'
]

export interface DungeonCell {
  raw: number
  feature: DungeonFeature
  /** Sub-type for trap/fountain/field, room number for 'room'. */
  variant: number
  /** Monster from the low nibble (only meaningful in DNGMAP.SAV, and not for the special tiles). */
  monster: string | null
}

const SPECIAL = new Set<DungeonFeature>(['trap', 'fountain', 'field', 'room'])

export function decodeDungeonCell(raw: number): DungeonCell {
  const feature = FEATURES[raw >> 4]!
  const low = raw & 0x0f
  const special = SPECIAL.has(feature)
  return { raw, feature, variant: special ? low : 0, monster: special ? null : (DUNGEON_MONSTERS[low] ?? null) }
}

export interface Trigger {
  tile: number
  x: number
  y: number
  change1: { x: number; y: number }
  change2: { x: number; y: number }
}

export interface DungeonRoom {
  triggers: Trigger[]
  monsters: { tile: number; x: number; y: number }[]
  /** Party start positions keyed by entry direction. */
  partyStart: Record<'north' | 'east' | 'south' | 'west', { x: number; y: number }[]>
  tiles: Uint8Array // 11x11
}

export interface Dungeon {
  levels: Uint8Array[] // 8 levels of 64 raw cells
  rooms: DungeonRoom[]
}

const nib = (b: number) => ({ x: b >> 4, y: b & 0x0f })

function parseRoom(buf: Uint8Array, off: number): DungeonRoom {
  const triggers: Trigger[] = []
  for (let i = 0; i < 4; i++) {
    const t = off + i * 4
    if (buf[t] === 0) continue
    triggers.push({ tile: buf[t]!, ...nib(buf[t + 1]!), change1: nib(buf[t + 2]!), change2: nib(buf[t + 3]!) })
  }
  const monsters: DungeonRoom['monsters'] = []
  for (let i = 0; i < 16; i++) {
    const tile = buf[off + 0x10 + i]!
    if (tile) monsters.push({ tile, x: buf[off + 0x20 + i]!, y: buf[off + 0x30 + i]! })
  }
  const starts = (xOff: number) =>
    Array.from({ length: 8 }, (_, i) => ({ x: buf[off + xOff + i]!, y: buf[off + xOff + 8 + i]! }))
  return {
    triggers,
    monsters,
    partyStart: { north: starts(0x40), east: starts(0x50), south: starts(0x60), west: starts(0x70) },
    tiles: buf.slice(off + 0x80, off + 0x80 + ROOM_SIZE * ROOM_SIZE)
  }
}

export function parseDng(buf: Uint8Array): Dungeon {
  expectSize(buf, 0x200, '.DNG')
  const levels = Array.from({ length: DUNGEON_LEVELS }, (_, l) => buf.slice(l * 64, (l + 1) * 64))
  const rooms: DungeonRoom[] = []
  for (let off = 0x200; off + 0x100 <= buf.length; off += 0x100) rooms.push(parseRoom(buf, off))
  return { levels, rooms }
}

/** DNGMAP.SAV: 8 levels x 64 cells of the dungeon currently being explored. */
export function parseDngMapSav(buf: Uint8Array): Uint8Array[] {
  expectSize(buf, 512, 'DNGMAP.SAV')
  return Array.from({ length: DUNGEON_LEVELS }, (_, l) => buf.slice(l * 64, (l + 1) * 64))
}

export interface BattleMap {
  monsterStarts: { x: number; y: number }[]
  partyStarts: { x: number; y: number }[]
  tiles: Uint8Array // 11x11
}

export function parseCon(buf: Uint8Array): BattleMap {
  expectSize(buf, 0xc0, '.CON')
  return {
    monsterStarts: Array.from({ length: 16 }, (_, i) => ({ x: buf[i]!, y: buf[0x10 + i]! })),
    partyStarts: Array.from({ length: 8 }, (_, i) => ({ x: buf[0x20 + i]!, y: buf[0x28 + i]! })),
    tiles: buf.slice(0x40, 0x40 + ROOM_SIZE * ROOM_SIZE)
  }
}
