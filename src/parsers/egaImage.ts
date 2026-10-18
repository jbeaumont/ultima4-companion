// Ultima IV full-screen .EGA images: 320x200, 4 bits per pixel (high nibble =
// left pixel), compressed with either RLE or the game's LZW variant.
// Format notes from xu4 (doc/FileFormats.md, src/rle.cpp, src/lzw/*); this is an
// independent implementation.
import { unpack4bpp } from './shapes'

export const IMAGE_WIDTH = 320
export const IMAGE_HEIGHT = 200
const PACKED_SIZE = (IMAGE_WIDTH * IMAGE_HEIGHT) / 2

/** Which files use which compression (xu4 FileFormats.md). */
export const RLE_IMAGES = [
  'START.EGA', 'KEY7.EGA', 'RUNE_0.EGA', 'RUNE_1.EGA', 'RUNE_2.EGA', 'RUNE_3.EGA', 'RUNE_4.EGA', 'RUNE_5.EGA',
  'STONCRCL.EGA', 'HONESTY.EGA', 'COMPASSN.EGA', 'VALOR.EGA', 'JUSTICE.EGA', 'SACRIFIC.EGA', 'HONOR.EGA',
  'SPIRIT.EGA', 'HUMILITY.EGA', 'TRUTH.EGA', 'LOVE.EGA', 'COURAGE.EGA'
] as const
export const LZW_IMAGES = [
  'ABACUS.EGA', 'ANIMATE.EGA', 'GYPSY.EGA', 'INSIDE.EGA', 'OUTSIDE.EGA', 'PORTAL.EGA', 'TREE.EGA', 'WAGON.EGA',
  'HONCOM.EGA', 'SACHONOR.EGA', 'SPIRHUM.EGA', 'VALJUS.EGA', 'TITLE.EGA'
] as const

/** RLE: 0x02 <count> <value> is a run; every other byte is a literal. */
export function decodeRle(src: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < src.length; ) {
    const b = src[i++]!
    if (b === 0x02) {
      const count = src[i++] ?? 0
      const value = src[i++] ?? 0
      for (let k = 0; k < count; k++) out.push(value)
    } else {
      out.push(b)
    }
  }
  return Uint8Array.from(out)
}

// --- LZW: fixed 12-bit codes, dictionary stored as a hash table (as in the game) ---

const DICT_SIZE = 0x1000
const MAX_ENTRIES = 0xccc // the game wipes the dictionary past this many entries

const probe1 = (root: number, code: number) => ((root << 4) ^ code) & 0xfff

/** Second probe: emulates the original's `mul ax` followed by two `rcl` through DX:AX. */
function probe2(root: number, code: number): number {
  const ax0 = (((root << 1) + code) | 0x800) & 0xffff
  const product = ax0 * ax0 // < 2^32 since ax0 < 2^16
  let ax = product % 0x10000
  let dx = Math.floor(product / 0x10000)
  let carry = dx !== 0 ? 1 : 0
  for (let n = 0; n < 2; n++) {
    const outAx = (ax >> 15) & 1
    ax = ((ax << 1) | carry) & 0xffff
    carry = outAx
    const outDx = (dx >> 15) & 1
    dx = ((dx << 1) | carry) & 0xffff
    carry = outDx
  }
  return ((ax >> 8) | (dx << 8)) & 0xfff
}

const probe3 = (hash: number) => (hash + 0x1fd) & 0xfff

export function decodeLzw(src: Uint8Array): Uint8Array {
  const used = new Uint8Array(DICT_SIZE)
  const roots = new Uint8Array(DICT_SIZE)
  const prefix = new Int32Array(DICT_SIZE)
  const reset = () => {
    used.fill(0)
    used.fill(1, 0, 0x100)
  }
  reset()

  const totalBits = src.length * 8
  let bit = 0
  const next = (): number => {
    const byte = bit >> 3
    const word = ((src[byte] ?? 0) << 8) | (src[byte + 1] ?? 0)
    const code = (word >> (4 - (bit & 7))) & 0xfff
    bit += 12
    return code
  }
  const free = (h: number, root: number, code: number) =>
    h > 0xff && (!used[h] || (roots[h] === root && prefix[h] === code))
  const slotFor = (root: number, code: number): number => {
    let h = probe1(root, code)
    if (free(h, root, code)) return h
    h = probe2(root, code)
    if (free(h, root, code)) return h
    for (let guard = 0; guard < DICT_SIZE; guard++) {
      h = probe3(h)
      if (free(h, root, code)) return h
    }
    throw new Error('LZW: dictionary full')
  }

  const out: number[] = []
  const stack: number[] = []
  const pushString = (code: number) => {
    let c = code
    while (c > 0xff) {
      stack.push(roots[c]!)
      c = prefix[c]!
    }
    stack.push(c)
  }

  if (totalBits < 12) return new Uint8Array()
  let old = next()
  let ch = old & 0xff
  out.push(ch)
  let entries = 0
  while (bit + 12 <= totalBits) {
    const code = next()
    const known = used[code] === 1
    if (known) {
      pushString(code)
    } else {
      stack.push(ch)
      pushString(old)
    }
    ch = stack[stack.length - 1]!
    while (stack.length) out.push(stack.pop()!)

    const slot = slotFor(ch, old)
    roots[slot] = ch
    prefix[slot] = old
    used[slot] = 1
    entries++
    if (!known && slot !== code) throw new Error('LZW: corrupt data')

    if (entries > MAX_ENTRIES) {
      entries = 0
      reset()
      if (bit + 12 > totalBits) break
      const restart = next()
      ch = restart & 0xff
      out.push(ch)
      old = restart
      continue
    }
    old = code
  }
  return Uint8Array.from(out)
}

export interface EgaImage {
  width: number
  height: number
  /** One EGA palette index per pixel, row-major. */
  pixels: Uint8Array
}

/** Decode a full-screen image by file name; returns null for unknown names or bad data. */
export function decodeEgaImage(name: string, bytes: Uint8Array): EgaImage | null {
  const upper = name.toUpperCase()
  let packed: Uint8Array
  try {
    if ((RLE_IMAGES as readonly string[]).includes(upper)) packed = decodeRle(bytes)
    else if ((LZW_IMAGES as readonly string[]).includes(upper)) packed = decodeLzw(bytes)
    else return null
  } catch {
    return null
  }
  if (packed.length < PACKED_SIZE) return null
  return { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, pixels: unpack4bpp(packed.subarray(0, PACKED_SIZE)) }
}
