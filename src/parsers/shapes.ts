// SHAPES.EGA: 256 tiles of 16x16, 4 bits per pixel (high nibble = left pixel).
import { expectSize } from './bytes'

export const TILE_SIZE = 16
export const TILE_COUNT = 256
const BYTES_PER_TILE = (TILE_SIZE * TILE_SIZE) / 2

/** Standard 16-colour EGA palette as [r, g, b]. */
export const EGA_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0x00, 0x00, 0x00], [0x00, 0x00, 0xaa], [0x00, 0xaa, 0x00], [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00], [0xaa, 0x00, 0xaa], [0xaa, 0x55, 0x00], [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55], [0x55, 0x55, 0xff], [0x55, 0xff, 0x55], [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55], [0xff, 0x55, 0xff], [0xff, 0xff, 0x55], [0xff, 0xff, 0xff]
]

/** Unpack 4bpp EGA pixels into one palette index per byte. */
export function unpack4bpp(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length * 2)
  for (let i = 0; i < src.length; i++) {
    const b = src[i]!
    out[i * 2] = b >> 4
    out[i * 2 + 1] = b & 0x0f
  }
  return out
}

/** Returns 256 tiles, each 256 palette indices in row-major order. */
export function parseShapes(buf: Uint8Array): Uint8Array[] {
  expectSize(buf, TILE_COUNT * BYTES_PER_TILE, 'SHAPES.EGA')
  return Array.from({ length: TILE_COUNT }, (_, t) =>
    unpack4bpp(buf.subarray(t * BYTES_PER_TILE, (t + 1) * BYTES_PER_TILE))
  )
}

/** Render palette indices to RGBA (for canvas ImageData or PNG export). */
export function indicesToRgba(indices: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(indices.length * 4)
  indices.forEach((p, i) => {
    const [r, g, b] = EGA_PALETTE[p]!
    out.set([r, g, b, 255], i * 4)
  })
  return out
}
