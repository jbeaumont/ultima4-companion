// Draws the app icon (a gold ankh on a dark background) to build/icon.png.
// Usage: npx tsx scripts/make-icon.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const SIZE = 256

// --- Minimal PNG encoder (RGBA, no filtering), as in scripts/extract.ts ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array())
  ])
}

// --- Shapes as distance tests, evaluated with 4x4 supersampling for smooth edges ---
const GOLD = [217, 164, 65]
const DARK = [11, 11, 20]
const RIM = [58, 51, 80]

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Ankh: a ring (loop) on top of a vertical stem with a crossbar. */
function ankh(x: number, y: number): boolean {
  const w = 15 // half stroke width
  const ringDist = Math.abs(Math.hypot((x - 128) / 0.8, y - 80) - 42) // slightly narrow ellipse
  const stem = segDist(x, y, 128, 122, 128, 224)
  const bar = segDist(x, y, 74, 150, 182, 150)
  return ringDist < w || stem < w || bar < w
}

function pixel(x: number, y: number): number[] {
  // rounded-square plate with a faint rim
  const r = 44
  const cx = Math.max(r, Math.min(SIZE - r, x))
  const cy = Math.max(r, Math.min(SIZE - r, y))
  const d = Math.hypot(x - cx, y - cy)
  if (d > r) return [0, 0, 0, 0]
  if (d > r - 5) return [...RIM, 255]
  return ankh(x, y) ? [...GOLD, 255] : [...DARK, 255]
}

const rgba = new Uint8ClampedArray(SIZE * SIZE * 4)
const N = 4
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0, 0]
    for (let sy = 0; sy < N; sy++) {
      for (let sx = 0; sx < N; sx++) {
        const p = pixel(x + (sx + 0.5) / N, y + (sy + 0.5) / N)
        const a = p[3]! / 255
        acc[0]! += p[0]! * a
        acc[1]! += p[1]! * a
        acc[2]! += p[2]! * a
        acc[3]! += a
      }
    }
    const o = (y * SIZE + x) * 4
    const cov = acc[3]!
    if (cov > 0) rgba.set([acc[0]! / cov, acc[1]! / cov, acc[2]! / cov, (cov / (N * N)) * 255], o)
  }
}

const out = resolve('build', 'icon.png')
mkdirSync(resolve('build'), { recursive: true })
writeFileSync(out, encodePng(SIZE, SIZE, rgba))
console.log(`Wrote ${out}`)
