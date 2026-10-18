// Dungeon route-finding for the play-test driver. Dungeon levels are 8x8 and
// wrap; the party moves by turning and advancing (U4_DNG.C). Orientation 0-3 is
// west, north, east, south, and "turn right" adds one.
import { findRoute } from './pathfind'
import type { Dir } from './pathfind'

export const DNG_SIZE = 8

export const ENERGY_FIELD = 0xa1

/**
 * Cost of advancing onto a raw dungeon cell, or null if blocked (C_88E8):
 * walls and energy fields block; rooms start a battle, so only use them as the
 * destination unless `throughRooms`. With `throughEnergy`, an energy field
 * counts as passable at a high cost (the party must Dispel it first).
 */
export function dungeonStepCost(raw: number, isGoal: boolean, throughRooms = false, throughEnergy = false): number | null {
  const kind = raw & 0xf0
  if (raw === ENERGY_FIELD) return throughEnergy ? 40 : null
  if (kind === 0xf0) return null
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
export function dungeonRoute(level: Uint8Array, sx: number, sy: number, tx: number, ty: number, throughRooms = false, throughEnergy = false): number[] | null {
  const route = findRoute(
    { width: DNG_SIZE, height: DNG_SIZE, wrap: true, tileAt: (x, y) => level[y * DNG_SIZE + x]! },
    sx, sy, tx, ty,
    { cost: (t, goal) => dungeonStepCost(t, goal, throughRooms, throughEnergy) }
  )
  return route?.map((d) => DIRS[d]) ?? null
}

/** Cells on a level (64 raw cells) whose raw value matches. */
export function findCells(level: Uint8Array, match: (raw: number) => boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < level.length; i++) if (match(level[i]!)) out.push({ x: i % DNG_SIZE, y: Math.floor(i / DNG_SIZE) })
  return out
}

/** Sides a room can be left by (0-3 = W, N, E, S): edge openings, plus edges a trigger turns into floor. */
export function roomExits(room: { tiles: Uint8Array; triggers: { change1: { x: number; y: number }; change2: { x: number; y: number } }[] }, walkable: (t: number) => boolean): Set<number> {
  const out = new Set<number>()
  const edge = (side: number, x: number, y: number) => (side === 0 ? x === 0 : side === 1 ? y === 0 : side === 2 ? x === 10 : y === 10)
  for (let i = 0; i < 11; i++) {
    if (walkable(room.tiles[i * 11]!)) out.add(0)
    if (walkable(room.tiles[i]!)) out.add(1)
    if (walkable(room.tiles[i * 11 + 10]!)) out.add(2)
    if (walkable(room.tiles[110 + i]!)) out.add(3)
  }
  for (const t of room.triggers) for (const c of [t.change1, t.change2]) for (let side = 0; side < 4; side++) if ((c.x || c.y) && edge(side, c.x, c.y)) out.add(side)
  return out
}

export interface DungeonPoint {
  z: number
  x: number
  y: number
}

/** One level's worth of a plan: walk to (x, y) on level z, then take the ladder there (or stop). */
export interface DungeonLeg extends DungeonPoint {
  then: 'down' | 'up' | null
}

const LADDER_COST = 5

/**
 * Plan a trip across dungeon levels (8 levels of 64 raw cells) by walking and
 * ladders: 0x20 goes down, 0x10 up, 0x30 both. Rooms are allowed at a cost (a
 * battle each); energy fields only with `throughEnergy`. Returns the legs, or
 * null if the target can't be reached.
 */
export function dungeonPlan(
  levels: Uint8Array[], from: DungeonPoint, to: DungeonPoint, throughEnergy = false,
  /** Sides each room (by number, the cell's low nibble) can be left by; without it rooms are open on every side. */
  roomSides?: (room: number) => Set<number>
): DungeonLeg[] | null {
  const path = dungeonPath(levels, from, to, throughEnergy, roomSides)
  if (!path) return null
  // cut the path into legs at each ladder
  const legs: DungeonLeg[] = []
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!
    if (b.z !== a.z) legs.push({ ...a, then: b.z > a.z ? 'down' : 'up' })
  }
  legs.push({ ...to, then: null })
  return legs
}

/** The cheapest sequence of cells (walking and ladders) from `from` to `to`, both included, or null. */
export function dungeonPath(
  levels: Uint8Array[], from: DungeonPoint, to: DungeonPoint, throughEnergy = false, roomSides?: (room: number) => Set<number>
): DungeonPoint[] | null {
  const key = (p: DungeonPoint) => (p.z * 8 + p.y) * 8 + p.x
  const cell = (p: DungeonPoint) => levels[p.z]![p.y * 8 + p.x]!
  const dist = new Map<number, number>([[key(from), 0]])
  const prev = new Map<number, DungeonPoint>()
  const open: [number, DungeonPoint][] = [[0, from]]
  while (open.length) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i]![0] < open[bi]![0]) bi = i
    const [d, p] = open.splice(bi, 1)[0]!
    if (p.z === to.z && p.x === to.x && p.y === to.y) break
    if (d > (dist.get(key(p)) ?? Infinity)) continue
    const steps: [DungeonPoint, number | null][] = []
    const here = cell(p)
    for (const [dx, dy, side] of [[1, 0, 2], [-1, 0, 0], [0, 1, 3], [0, -1, 1]] as const) {
      // a room is left only by its open sides (dungeon rooms: U4_COMBC.C)
      if ((here & 0xf0) === 0xd0 && roomSides && !roomSides(here & 0x0f).has(side)) continue
      const n = { z: p.z, x: (p.x + dx + 8) % 8, y: (p.y + dy + 8) % 8 }
      steps.push([n, dungeonStepCost(cell(n), n.z === to.z && n.x === to.x && n.y === to.y, true, throughEnergy)])
    }
    const k = here & 0xf0
    if ((k === 0x20 || k === 0x30) && p.z < levels.length - 1) steps.push([{ ...p, z: p.z + 1 }, LADDER_COST])
    if ((k === 0x10 || k === 0x30) && p.z > 0) steps.push([{ ...p, z: p.z - 1 }, LADDER_COST])
    for (const [n, c] of steps) {
      if (c === null) continue
      const nd = d + c
      if (nd < (dist.get(key(n)) ?? Infinity)) {
        dist.set(key(n), nd)
        prev.set(key(n), p)
        open.push([nd, n])
      }
    }
  }
  if (!dist.has(key(to))) return null
  const path: DungeonPoint[] = [to]
  for (let p = to; prev.has(key(p)); ) path.unshift((p = prev.get(key(p))!))
  return path
}

/** Direction index (0-3 = W, N, E, S) from one cell to an adjacent one, with wrapping. */
export const stepDir = (a: DungeonPoint, b: DungeonPoint): number =>
  b.x === (a.x + 7) % 8 && b.y === a.y ? 0 : b.y === (a.y + 7) % 8 ? 1 : b.x === (a.x + 1) % 8 ? 2 : 3
