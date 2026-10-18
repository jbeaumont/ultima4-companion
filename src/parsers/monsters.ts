// MONSTERS.SAV / OUTMONST.SAV: 8 parallel 32-byte tables (one entry per slot).
import { expectSize } from './bytes'

export interface MonsterSlot {
  slot: number
  tile: number
  x: number
  y: number
  prevTile: number
  prevX: number
  prevY: number
  /** Surface: unused. Dungeon: level. Settlement: movement behaviour. */
  extra: number
  /** Settlement only: conversation index. */
  talkIndex: number
}

export function parseMonstersSav(buf: Uint8Array): MonsterSlot[] {
  expectSize(buf, 256, 'MONSTERS.SAV')
  const out: MonsterSlot[] = []
  for (let i = 0; i < 32; i++) {
    const slot: MonsterSlot = {
      slot: i,
      tile: buf[i]!,
      x: buf[0x20 + i]!,
      y: buf[0x40 + i]!,
      prevTile: buf[0x60 + i]!,
      prevX: buf[0x80 + i]!,
      prevY: buf[0xa0 + i]!,
      extra: buf[0xc0 + i]!,
      talkIndex: buf[0xe0 + i]!
    }
    if (slot.tile || slot.prevTile) out.push(slot)
  }
  return out
}
