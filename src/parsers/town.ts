// *.ULT settlement files: 32x32 map followed by 32-slot NPC tables.
import { expectSize } from './bytes'

export const TOWN_SIZE = 32

export interface TownNpc {
  slot: number
  tile: number
  x: number
  y: number
  movement: 'fixed' | 'wander' | 'follow' | 'attack' | 'unknown'
  talkIndex: number // 1-based index into the matching .TLK; 0 = none
}

export interface Town {
  tiles: Uint8Array // tiles[y * 32 + x]
  npcs: TownNpc[]
}

const MOVEMENT: Record<number, TownNpc['movement']> = { 0x00: 'fixed', 0x01: 'wander', 0x80: 'follow', 0xff: 'attack' }

export function parseUlt(buf: Uint8Array): Town {
  expectSize(buf, 0x500, '.ULT')
  const npcs: TownNpc[] = []
  for (let i = 0; i < 32; i++) {
    const tile = buf[0x400 + i]!
    if (tile === 0) continue
    npcs.push({
      slot: i,
      tile,
      x: buf[0x420 + i]!,
      y: buf[0x440 + i]!,
      movement: MOVEMENT[buf[0x4c0 + i]!] ?? 'unknown',
      talkIndex: buf[0x4e0 + i]!
    })
  }
  return { tiles: buf.slice(0, TOWN_SIZE * TOWN_SIZE), npcs }
}
