// Grid route-finding for the play-test driver (Dijkstra; maps are small).
// The world wraps at its edges; town maps can be left by walking off an edge.
import { DESTINATION_ONLY, stepCost } from './walkable'

export type Dir = 'up' | 'down' | 'left' | 'right'
const STEPS: [Dir, number, number][] = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]

export interface Grid {
  width: number
  height: number
  wrap: boolean
  tileAt: (x: number, y: number) => number
}

export interface RouteOptions {
  /** Cells to treat as impassable (e.g. where an NPC or monster blocked us). */
  blocked?: Set<string>
  /** Extra cost per step, keeps routes compact on open ground. */
  stepPenalty?: number
  /** Override the on-foot step cost (null = impassable); `isGoal` is true for the destination cell. */
  cost?: (tile: number, isGoal: boolean) => number | null
}

const key = (x: number, y: number) => `${x},${y}`

/** Directions from (sx,sy) to (tx,ty), or null if unreachable. */
export function findRoute(grid: Grid, sx: number, sy: number, tx: number, ty: number, opts: RouteOptions = {}): Dir[] | null {
  const { width: w, height: h } = grid
  const norm = (x: number, y: number): [number, number] | null => {
    if (grid.wrap) return [((x % w) + w) % w, ((y % h) + h) % h]
    return x < 0 || y < 0 || x >= w || y >= h ? null : [x, y]
  }
  const dist = new Map<string, number>([[key(sx, sy), 0]])
  const prev = new Map<string, [string, Dir]>()
  const open: [number, number, number][] = [[0, sx, sy]]
  const goal = key(tx, ty)
  while (open.length) {
    // small maps: a sorted array is plenty fast
    let bi = 0
    for (let i = 1; i < open.length; i++) if (open[i]![0] < open[bi]![0]) bi = i
    const [d, x, y] = open.splice(bi, 1)[0]!
    const k = key(x, y)
    if (k === goal) break
    if (d > (dist.get(k) ?? Infinity)) continue
    for (const [dir, dx, dy] of STEPS) {
      const n = norm(x + dx, y + dy)
      if (!n) continue
      const nk = key(n[0], n[1])
      if (opts.blocked?.has(nk)) continue
      const tile = grid.tileAt(n[0], n[1])
      const c = opts.cost ? opts.cost(tile, nk === goal) : DESTINATION_ONLY.has(tile) && nk !== goal ? null : stepCost(tile)
      if (c === null) continue
      const nd = d + c + (opts.stepPenalty ?? 0)
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd)
        prev.set(nk, [k, dir])
        open.push([nd, n[0], n[1]])
      }
    }
  }
  if (!dist.has(goal)) return null
  const path: Dir[] = []
  for (let k = goal; k !== key(sx, sy); ) {
    const [pk, dir] = prev.get(k)!
    path.push(dir)
    k = pk
  }
  return path.reverse()
}
