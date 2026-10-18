// Locating Ultima IV's party block in DOSBox's emulated RAM. The game keeps
// PARTY.SAV byte-for-byte in memory (u4-decompiled U4.H: struct tParty, 0x1F6
// bytes), so a candidate is checked with the same layout. Pure: no Win32 here.
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { PartySave } from '@parsers/party'

const NAME_OFF = 0x08 + 0x14
const RECORD = 39

/** Plausibility checks on a 0x1F6-byte window, independent of any reference save. */
export function looksLikeParty(buf: Uint8Array, off = 0): boolean {
  if (off + PARTY_SAV_SIZE > buf.length) return false
  const u16 = (o: number) => buf[off + o]! | (buf[off + o + 1]! << 8)
  const members = u16(0x1d8)
  if (members < 1 || members > 8) return false
  if (u16(0x1f4) > 32 || u16(0x1de) > 7 || u16(0x1e0) > 7) return false
  for (let i = 0; i < members; i++) {
    const rec = off + 0x08 + i * RECORD
    const hp = buf[rec]! | (buf[rec + 1]! << 8)
    const hpMax = buf[rec + 2]! | (buf[rec + 3]! << 8)
    if (hpMax === 0 || hpMax > 800 || hp > hpMax) return false
    if (buf[rec + 0x24] !== 0x0b && buf[rec + 0x24] !== 0x0c) return false
    if (buf[rec + 0x25]! > 7) return false
    if (!'GPSD'.includes(String.fromCharCode(buf[rec + 0x26]!))) return false
    const first = buf[rec + 0x14]!
    if (first < 0x20 || first > 0x7e) return false
  }
  return true
}

/** Name bytes of the first `count` records, used as a fast search key. */
export function nameKey(save: PartySave, count = save.memberCount || 1): string[] {
  return save.allRecords.slice(0, Math.max(1, count)).map((r) => r.name)
}

const encode = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)

/**
 * Offsets in `buf` where a party block starts. With `names`, the first name is
 * searched directly and the rest are confirmed at their record offsets; otherwise
 * any position whose record 0 looks valid is tested with looksLikeParty.
 */
export function findPartyBlocks(buf: Uint8Array, names?: string[]): number[] {
  const hits: number[] = []
  if (names?.length && names[0]) {
    const first = encode(names[0] + '\0')
    let i = buf.indexOf(first[0]!)
    while (i !== -1) {
      const base = i - NAME_OFF
      if (base >= 0 && matchesAt(buf, i, first) && names.every((n, r) => matchesAt(buf, base + NAME_OFF + r * RECORD, encode(n + '\0'))) && looksLikeParty(buf, base)) {
        hits.push(base)
      }
      i = buf.indexOf(first[0]!, i + 1)
    }
    return hits
  }
  // Without a reference save: look for a plausible record 0 by its sex/class/status triple.
  for (let i = NAME_OFF + 16; i + 3 <= buf.length; i++) {
    if ((buf[i] === 0x0b || buf[i] === 0x0c) && buf[i + 1]! <= 7 && 'GPSD'.includes(String.fromCharCode(buf[i + 2]!))) {
      const base = i - 0x08 - 0x24
      if (base >= 0 && looksLikeParty(buf, base)) hits.push(base)
    }
  }
  return hits
}

function matchesAt(buf: Uint8Array, off: number, bytes: Uint8Array): boolean {
  if (off < 0 || off + bytes.length > buf.length) return false
  for (let k = 0; k < bytes.length; k++) if (buf[off + k] !== bytes[k]) return false
  return true
}

/**
 * DOSBox RAM can hold stale copies (e.g. DOS file buffers of PARTY.SAV). The live
 * struct has advanced furthest, so prefer the candidate with the most moves.
 */
export function pickLive(blocks: { address: bigint; bytes: Uint8Array }[]): { address: bigint; save: PartySave } | null {
  let best: { address: bigint; save: PartySave } | null = null
  for (const b of blocks) {
    const save = parsePartySav(b.bytes)
    if (!best || save.moves > best.save.moves) best = { address: b.address, save }
  }
  return best
}
