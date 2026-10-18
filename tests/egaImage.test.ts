import { describe, expect, it } from 'vitest'
import { LZW_IMAGES, RLE_IMAGES, decodeEgaImage, decodeLzw, decodeRle } from '@parsers/egaImage'
import { gameFile, hasGame } from './gameFiles'

/** Pack 12-bit codes big-endian, as the game stores them. */
function pack12(codes: number[]): Uint8Array {
  const bits = codes.map((c) => c.toString(2).padStart(12, '0')).join('')
  const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0')
  return Uint8Array.from(padded.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
}

describe('decodeRle', () => {
  it('expands runs and keeps literals (xu4 doc examples)', () => {
    expect([...decodeRle(Uint8Array.from([0x02, 0x04, 0x28]))]).toEqual([0x28, 0x28, 0x28, 0x28])
    expect([...decodeRle(Uint8Array.from([0x11, 0x02, 0x01, 0x02, 0x33]))]).toEqual([0x11, 0x02, 0x33])
  })
})

describe('decodeLzw', () => {
  it('decodes roots and the KwKwK case', () => {
    expect(String.fromCharCode(...decodeLzw(pack12([65, 66, 67])))).toBe('ABC')
    // "AAA": root A, then a code not yet in the dictionary (A + A), placed where probe 1 puts it
    const slot = ((65 << 4) ^ 65) & 0xfff
    expect(String.fromCharCode(...decodeLzw(pack12([65, slot])))).toBe('AAA')
  })

  it('rejects corrupt streams', () => {
    expect(() => decodeLzw(pack12([65, 0x0ff0]))).toThrow(/corrupt/)
  })
})

describe.skipIf(!hasGame)('every full-screen image in the install', () => {
  it.each([...RLE_IMAGES, ...LZW_IMAGES])('%s decodes to 320x200', (name) => {
    const img = decodeEgaImage(name, gameFile(name))
    expect(img).not.toBeNull()
    expect(img!.pixels).toHaveLength(320 * 200)
    expect(img!.pixels.every((p) => p < 16)).toBe(true)
    expect(img!.pixels.some((p) => p !== 0)).toBe(true)
  })

  it('returns null for unknown names', () => {
    expect(decodeEgaImage('SHAPES.EGA', new Uint8Array(10))).toBeNull()
  })
})
