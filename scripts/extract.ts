// Extracts derived data from the Ultima IV install into data/.
// Usage: npm run extract [-- "<game dir>"]   (defaults to the GOG install path)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { parseShapes, indicesToRgba, TILE_SIZE } from '../src/parsers/shapes'
import { parseUlt } from '../src/parsers/town'
import { parseTlk } from '../src/parsers/talk'
import { LOCATIONS } from '../src/domain/constants'

const gameDir = process.argv[2] ?? process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const outDir = resolve('data')
const read = (name: string) => new Uint8Array(readFileSync(join(gameDir, name)))

// --- Minimal PNG encoder (RGBA, no filtering) ---
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

mkdirSync(outDir, { recursive: true })

// Tile atlas: 16x16 grid of the 256 tiles.
const tiles = parseShapes(read('SHAPES.EGA'))
const atlasSize = 16 * TILE_SIZE
const atlas = new Uint8ClampedArray(atlasSize * atlasSize * 4)
tiles.forEach((tile, t) => {
  const rgba = indicesToRgba(tile)
  const ox = (t % 16) * TILE_SIZE
  const oy = Math.floor(t / 16) * TILE_SIZE
  for (let row = 0; row < TILE_SIZE; row++) {
    atlas.set(rgba.subarray(row * TILE_SIZE * 4, (row + 1) * TILE_SIZE * 4), ((oy + row) * atlasSize + ox) * 4)
  }
})
writeFileSync(join(outDir, 'tiles.png'), encodePng(atlasSize, atlasSize, atlas))

// Dialogue: every settlement's NPCs joined with their conversation and start position.
const dialogue = Object.entries(LOCATIONS)
  .filter(([, loc]) => loc.file?.endsWith('.ULT') && loc.talk)
  .map(([id, loc]) => {
    const floors = [loc.file!, ...(loc.upperFloor ? [loc.upperFloor] : [])].map((f) => parseUlt(read(f)))
    const talk = parseTlk(read(loc.talk!))
    return {
      locationId: Number(id),
      location: loc.name,
      npcs: talk.map((c) => {
        const floor = floors.findIndex((t) => t.npcs.some((n) => n.talkIndex === c.index))
        const placed = floors[floor]?.npcs.find((n) => n.talkIndex === c.index)
        return {
          ...c,
          position: placed ? { x: placed.x, y: placed.y, floor } : null,
          tile: placed?.tile ?? null
        }
      })
    }
  })
writeFileSync(join(outDir, 'dialogue.json'), JSON.stringify(dialogue, null, 2) + '\n')

const npcCount = dialogue.reduce((n, d) => n + d.npcs.length, 0)
console.log(`Wrote data/tiles.png (256 tiles) and data/dialogue.json (${dialogue.length} settlements, ${npcCount} NPCs)`)
