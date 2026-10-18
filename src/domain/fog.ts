// Fog of war: one bit per surface tile, row-major, 256x256 (wraps at the edges).
export const FOG_SIZE = 256
export const FOG_BYTES = (FOG_SIZE * FOG_SIZE) / 8
export const FOG_RADIUS = 5

export const emptyFog = (): Uint8Array => new Uint8Array(FOG_BYTES)

const wrap = (n: number): number => ((n % FOG_SIZE) + FOG_SIZE) % FOG_SIZE

export function isExplored(bits: Uint8Array, x: number, y: number): boolean {
  const i = wrap(y) * FOG_SIZE + wrap(x)
  return (bits[i >> 3]! & (1 << (i & 7))) !== 0
}

/** Mark the square (2*radius+1)^2 around (x, y) explored; returns true when any bit changed. */
export function reveal(bits: Uint8Array, x: number, y: number, radius = FOG_RADIUS): boolean {
  let changed = false
  for (let dy = -radius; dy <= radius; dy++) {
    const row = wrap(y + dy) * FOG_SIZE
    for (let dx = -radius; dx <= radius; dx++) {
      const i = row + wrap(x + dx)
      const mask = 1 << (i & 7)
      if ((bits[i >> 3]! & mask) === 0) {
        bits[i >> 3]! |= mask
        changed = true
      }
    }
  }
  return changed
}

const POP = Uint8Array.from({ length: 256 }, (_, n) => {
  let c = 0
  for (let v = n; v; v >>= 1) c += v & 1
  return c
})

export function exploredCount(bits: Uint8Array): number {
  let n = 0
  for (let i = 0; i < bits.length; i++) n += POP[bits[i]!]!
  return n
}

export const exploredPercent = (bits: Uint8Array): number => (exploredCount(bits) / (FOG_SIZE * FOG_SIZE)) * 100

/** A stored/IPC blob is usable only at the exact size. */
export const validFog = (raw: unknown): raw is Uint8Array => raw instanceof Uint8Array && raw.length === FOG_BYTES
