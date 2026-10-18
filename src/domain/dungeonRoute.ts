// Dungeon route-finding for the play-test driver. Dungeon levels are 8x8 and
// wrap; the party moves by turning and advancing (U4_DNG.C). Orientation 0-3 is
// west, north, east, south, and "turn right" adds one.
import { findRoute } from './pathfind'
import type { Dir } from './pathfind'

export const DNG_SIZE = 8

/**
 * Cost of advancing onto a raw dungeon cell, or null if blocked (C_88E8):
 * walls and energy fields block; rooms start a battle, so only use them as the
 * destination unless `throughRooms`.
 */
export function dungeonStepCost(raw: number, isGoal: boolean, throughRooms = false): number | null {
  const kind = raw & 0xf0
  if (kind === 0xf0 || raw === 0xa1) return null
  if (kind === 0xd0) return isGoal || throughRooms ? 20 : null // room
  if (kind === 0x80 || kind === 0xa0) return 10 // trap, field
  return 1
}

const DIRS: Record<Dir, number> = { left: 0, up: 1, right: 2, down: 3 }

/** Keys that turn from orientation `o` to face `d` (0-3) and step forward. */
export function stepKeys(o: number, d: number): ('up' | 'left' | 'right')[] {
  const turn = (d - o + 4) & 3
  return turn === 0 ? ['up'] : turn === 1 ? ['right', 'up'] : turn === 2 ? ['right', 'right', 'up'] : ['left', 'up']
}

/** Grid directions from (sx,sy) to (tx,ty) on a level (64 raw cells, row-major), or null. */
export function dungeonRoute(level: Uint8Array, sx: number, sy: number, tx: number, ty: number, throughRooms = false): number[] | null {
  const route = findRoute(
    { width: DNG_SIZE, height: DNG_SIZE, wrap: true, tileAt: (x, y) => level[y * DNG_SIZE + x]! },
    sx, sy, tx, ty,
    { cost: (t, goal) => dungeonStepCost(t, goal, throughRooms) }
  )
  return route?.map((d) => DIRS[d]) ?? null
}

/** Cells on a level (64 raw cells) whose raw value matches. */
export function findCells(level: Uint8Array, match: (raw: number) => boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < level.length; i++) if (match(level[i]!)) out.push({ x: i % DNG_SIZE, y: Math.floor(i / DNG_SIZE) })
  return out
}
