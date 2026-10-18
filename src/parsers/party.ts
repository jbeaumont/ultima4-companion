// PARTY.SAV parser. Layout per xu4 doc/FileFormats.md.
import { Reader, expectSize } from './bytes'

export const PARTY_SAV_SIZE = 0x1f6
const RECORD_SIZE = 39

export interface CharacterRecord {
  hp: number
  hpMax: number
  xp: number
  str: number
  dex: number
  int: number
  mp: number
  weapon: number
  armor: number
  name: string
  sex: 'male' | 'female' | 'unknown'
  classIndex: number
  status: string // 'G' | 'P' | 'S' | 'D'
}

export interface PartySave {
  counter: number
  moves: number
  members: CharacterRecord[] // only the first `memberCount` records
  allRecords: CharacterRecord[] // all 8 slots as stored
  memberCount: number
  food: number // in hundredths, as stored
  gold: number
  karma: number[] // 8 virtues, 0 = partial Avatarhood
  torches: number
  gems: number
  keys: number
  sextants: number
  armorCounts: number[] // 8
  weaponCounts: number[] // 16
  reagents: number[] // 8
  mixtures: number[] // 26
  items: number // 16-bit flag word, see ITEM_FLAGS
  x: number // surface, settlement or dungeon position depending on location
  y: number
  stones: number // bitfield
  runes: number // bitfield
  transport: number
  balloonOrTorch: number
  trammel: number
  felucca: number
  hull: number
  lbIntro: boolean
  lastCamp: number
  lastReagent: number
  lastMeditation: number
  lastVirtueTalk: number
  /** Surface position to return to when inside a town or dungeon (u4-decompiled out_x/out_y). */
  outX: number
  outY: number
  orientation: number
  dungeonLevel: number // 0xFFFF on the surface
  location: number // see LOCATIONS; 0 = surface
}

function parseRecord(r: Reader, off: number): CharacterRecord {
  const sexByte = r.u8(off + 0x24)
  return {
    hp: r.u16(off + 0x00),
    hpMax: r.u16(off + 0x02),
    xp: r.u16(off + 0x04),
    str: r.u16(off + 0x06),
    dex: r.u16(off + 0x08),
    int: r.u16(off + 0x0a),
    mp: r.u16(off + 0x0c),
    weapon: r.u16(off + 0x10),
    armor: r.u16(off + 0x12),
    name: r.fixedString(off + 0x14, 16),
    sex: sexByte === 0x0b ? 'male' : sexByte === 0x0c ? 'female' : 'unknown',
    classIndex: r.u8(off + 0x25),
    status: String.fromCharCode(r.u8(off + 0x26))
  }
}

const words = (r: Reader, off: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => r.u16(off + i * 2))

export function parsePartySav(buf: Uint8Array): PartySave {
  expectSize(buf, PARTY_SAV_SIZE, 'PARTY.SAV')
  const r = new Reader(buf)
  const allRecords = Array.from({ length: 8 }, (_, i) => parseRecord(r, 0x08 + i * RECORD_SIZE))
  const memberCount = Math.min(8, r.u16(0x1d8))
  return {
    counter: r.u32(0x000),
    moves: r.u32(0x004),
    allRecords,
    members: allRecords.slice(0, memberCount),
    memberCount,
    food: r.u32(0x140),
    gold: r.u16(0x144),
    karma: words(r, 0x146, 8),
    torches: r.u16(0x156),
    gems: r.u16(0x158),
    keys: r.u16(0x15a),
    sextants: r.u16(0x15c),
    armorCounts: words(r, 0x15e, 8),
    weaponCounts: words(r, 0x16e, 16),
    reagents: words(r, 0x18e, 8),
    mixtures: words(r, 0x19e, 26),
    items: r.u16(0x1d2),
    x: r.u8(0x1d4),
    y: r.u8(0x1d5),
    stones: r.u8(0x1d6),
    runes: r.u8(0x1d7),
    transport: r.u16(0x1da),
    balloonOrTorch: r.u16(0x1dc),
    trammel: r.u16(0x1de),
    felucca: r.u16(0x1e0),
    hull: r.u16(0x1e2),
    lbIntro: r.u16(0x1e4) !== 0,
    lastCamp: r.u16(0x1e6),
    lastReagent: r.u16(0x1e8),
    lastMeditation: r.u16(0x1ea),
    lastVirtueTalk: r.u16(0x1ec),
    outX: r.u8(0x1ee),
    outY: r.u8(0x1ef),
    orientation: r.u16(0x1f0),
    dungeonLevel: r.u16(0x1f2),
    location: r.u16(0x1f4)
  }
}
