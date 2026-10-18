// Spoiler gating for the Map view: what a town or dungeon cell may show. Pure, so it is testable.
import { isDungeonCellSeen } from './dungeonFog'

export type SpoilerLevel = string | null | undefined

/** Towns and castles (ids 1-16) show once visited, with spoilers on full, or when revealed for the session. */
export function townVisible(id: number, visited: readonly number[], level: SpoilerLevel, override: boolean): boolean {
  return override || level === 'full' || visited.includes(id)
}

/** A dungeon cell shows when seen, or when spoilers are full or the whole dungeon is revealed. */
export function cellVisible(
  bits: Uint8Array | null, id: number, level: number, x: number, y: number, spoiler: SpoilerLevel, reveal: boolean
): boolean {
  if (reveal || spoiler === 'full') return true
  return !!bits && isDungeonCellSeen(bits, id, level, x, y)
}

/** How many of a level's 64 cells have been seen. */
export function seenCount(bits: Uint8Array | null, id: number, level: number): number {
  if (!bits) return 0
  let n = 0
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (isDungeonCellSeen(bits, id, level, x, y)) n++
  return n
}
