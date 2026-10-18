// WORLD.MAP: 256x256 tiles stored as 8x8 chunks of 32x32. Chunks run left to
// right, then top to bottom (verified: LB castle entrance tile 14 at 86,107).
import { expectSize } from './bytes'

export const WORLD_SIZE = 256
const CHUNK = 32
const CHUNKS_PER_ROW = WORLD_SIZE / CHUNK

/** Returns tiles in plain row-major order: tiles[y * 256 + x]. */
export function parseWorldMap(buf: Uint8Array): Uint8Array {
  expectSize(buf, WORLD_SIZE * WORLD_SIZE, 'WORLD.MAP')
  const tiles = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  for (let y = 0; y < WORLD_SIZE; y++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const chunk = Math.floor(y / CHUNK) * CHUNKS_PER_ROW + Math.floor(x / CHUNK)
      tiles[y * WORLD_SIZE + x] = buf[chunk * CHUNK * CHUNK + (y % CHUNK) * CHUNK + (x % CHUNK)]!
    }
  }
  return tiles
}
