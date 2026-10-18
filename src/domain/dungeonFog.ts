// Which dungeon cells the party has seen: 8 dungeons x 8 levels x 64 cells, one bit
// each (512 bytes). Pure, so main (tracking) and renderer (drawing) share it.
export const DUNGEON_FOG_SIZE = 8 * 8 * 64 / 8

/** Bit index for dungeon location id 17..24, level 0..7, cell x,y 0..7. */
const index = (dungeonId: number, level: number, x: number, y: number) =>
  ((dungeonId - 17) * 8 + level) * 64 + (y & 7) * 8 + (x & 7)

export const emptyDungeonFog = (): Uint8Array => new Uint8Array(DUNGEON_FOG_SIZE)
export const validDungeonFog = (b: Uint8Array): boolean => b.length === DUNGEON_FOG_SIZE

export function isDungeonCellSeen(bits: Uint8Array, dungeonId: number, level: number, x: number, y: number): boolean {
  if (dungeonId < 17 || dungeonId > 24 || level < 0 || level > 7) return false
  const i = index(dungeonId, level, x, y)
  return (bits[i >> 3]! & (1 << (i & 7))) !== 0
}

/** Mark the party's cell and its 4 neighbours (dungeons wrap at the edges). Returns whether anything changed. */
export function revealDungeon(bits: Uint8Array, dungeonId: number, level: number, x: number, y: number): boolean {
  if (dungeonId < 17 || dungeonId > 24 || level < 0 || level > 7) return false
  let changed = false
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const i = index(dungeonId, level, (x + dx + 8) & 7, (y + dy + 8) & 7)
    const mask = 1 << (i & 7)
    if (!(bits[i >> 3]! & mask)) {
      bits[i >> 3]! |= mask
      changed = true
    }
  }
  return changed
}
