// Turn planning for the play-test driver's battles, on the game's 11x11 combat
// map. Rules follow the decompiled AVATAR.EXE (u4-decompiled U4_COMBA.C/U4_COMBB.C):
// moving off the map edge leaves the battle, and in a dungeon room every member
// must leave by the same side the first one used.
import type { Dir } from './pathfind'

export const COMBAT_SIZE = 11

/** Tiles a fighter can stand on (D_0904 in U4_MAP.C). */
const WALKABLE = new Set([
  0x03, 0x04, 0x05, 0x06, 0x07, 0x09, 0x0a, 0x0b, 0x0c, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x3c, 0x3e, 0x3f, 0x43, 0x44, 0x46, 0x47, 0x49, 0x4a, 0x4c, 0x8e, 0x8f
])
export const combatWalkable = (tile: number): boolean => WALKABLE.has(tile)

/** Whether a blow or missile passes over `tile` (COM_CheckHitable). */
const hitable = (t: number): boolean =>
  t !== 0x49 && !(t <= 0x80 && t > 0x02 && t !== 0x48 && (t < 0x31 || t > 0x34) && !WALKABLE.has(t))

/** Weapons that fire along a line (D_2468 in U4_COMBC.C); the halberd hits two cells away. */
const RANGED = new Set([3, 7, 8, 9, 11, 13, 14])
export const weaponReach = (weapon: number): [number, number] => (RANGED.has(weapon) ? [1, 10] : weapon === 10 ? [2, 2] : [1, 1])

export interface Point {
  x: number
  y: number
}

export interface CombatView {
  /** 11x11 tiles, row-major. */
  map: Uint8Array
  monsters: Point[]
  /** Positions of the party members still on the field (index = party slot). */
  party: (Point | null)[]
  /** Slot whose turn it is. */
  me: number
  /** Distances (min, max) along a line at which the active member's weapon hits. */
  reach: [number, number]
  /** A dungeon room: leaving needs everyone out by one side. */
  room: boolean
  /** Side already used to leave a room (-1/11 on that axis), if any. */
  exit: { x?: number; y?: number } | null
  /** Side to leave by when free to choose (e.g. onward along a dungeon route). */
  prefer?: Dir
  /** Room trigger cells not yet stepped on: stepping on one can open a closed side (U4_COMBB.C C_7A15). */
  triggers?: Point[]
  /** Party health and the caster's magic, to cast Cure, Heal or Magic Missile (omit to only fight). */
  support?: {
    members: { hp: number; hpMax: number; status: string }[]
    /** The active member's magic points. */
    mp: number
    /** Mixtures carried, by spell letter index (A = 0). */
    mixtures: number[]
  }
}

export type CombatAction =
  | { kind: 'attack'; dir: Dir }
  | { kind: 'move'; dir: Dir }
  | { kind: 'pass' }
  /** C, the spell letter, then the member's number (Cure, Heal) or a direction (Magic Missile). */
  | { kind: 'cast'; spell: 'cure' | 'heal' | 'missile'; who?: number; dir?: Dir }

// spell letters and magic point costs (U4_SPELL.C D_208C)
export const SPELL_CAST = {
  cure: { letter: 'c', index: 2, mp: 5 },
  heal: { letter: 'h', index: 7, mp: 10 },
  missile: { letter: 'm', index: 12, mp: 5 }
} as const

const STEPS: [Dir, number, number][] = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COMBAT_SIZE && y < COMBAT_SIZE
const tileAt = (v: CombatView, x: number, y: number) => v.map[y * COMBAT_SIZE + x]!

/** The direction to attack in from `from`, if a monster can be hit from there. */
function attackDir(v: CombatView, from: Point): Dir | null {
  for (const [dir, dx, dy] of STEPS) {
    for (let r = 1; r <= v.reach[1]; r++) {
      const x = from.x + dx * r
      const y = from.y + dy * r
      if (!inside(x, y) || !hitable(tileAt(v, x, y))) break
      if (r >= v.reach[0] && v.monsters.some((m) => m.x === x && m.y === y)) return dir
    }
  }
  return null
}

/** Breadth-first search from the active member; returns the first step towards the nearest cell satisfying `goal`. */
function firstStep(v: CombatView, goal: (x: number, y: number) => Dir | null): Dir | null {
  const me = v.party[v.me]!
  const occupied = new Set([...v.monsters, ...v.party.filter((p): p is Point => !!p)].map((p) => `${p.x},${p.y}`))
  const seen = new Map<string, Dir | null>([[`${me.x},${me.y}`, null]])
  const queue: Point[] = [me]
  while (queue.length) {
    const p = queue.shift()!
    const first = seen.get(`${p.x},${p.y}`) ?? null
    const done = goal(p.x, p.y)
    if (done && !(p.x === me.x && p.y === me.y)) return first
    for (const [dir, dx, dy] of STEPS) {
      const x = p.x + dx
      const y = p.y + dy
      const k = `${x},${y}`
      if (!inside(x, y) || seen.has(k) || occupied.has(k) || !combatWalkable(tileAt(v, x, y))) continue
      seen.set(k, first ?? dir)
      queue.push({ x, y })
    }
  }
  return null
}

/**
 * A spell worth casting this turn, if the party carries the mixture and the
 * caster has the magic (a cast without enough MP still uses up the mixture):
 * Cure a poisoned member, Heal one below a third of their HP, or fire a Magic
 * Missile at a foe in line when nothing is in weapon reach.
 */
function supportSpell(v: CombatView, me: Point): CombatAction | null {
  const s = v.support!
  const can = (spell: keyof typeof SPELL_CAST) => (s.mixtures[SPELL_CAST[spell].index] ?? 0) > 0 && s.mp >= SPELL_CAST[spell].mp
  const alive = (i: number) => s.members[i] && s.members[i]!.status !== 'D'
  if (can('heal')) {
    const hurt = s.members.findIndex((m, i) => alive(i) && m.hpMax > 0 && m.hp * 3 < m.hpMax)
    if (hurt >= 0) return { kind: 'cast', spell: 'heal', who: hurt }
  }
  if (can('cure')) {
    const sick = s.members.findIndex((m, i) => alive(i) && m.status === 'P')
    if (sick >= 0) return { kind: 'cast', spell: 'cure', who: sick }
  }
  if (can('missile') && v.monsters.length && !attackDir(v, me)) {
    const dir = attackDir({ ...v, reach: [1, 10] }, me)
    if (dir) return { kind: 'cast', spell: 'missile', dir }
  }
  return null
}

/** The step that leaves the map from (x, y), if leaving that way is allowed. */
function exitDir(v: CombatView, x: number, y: number): Dir | null {
  const ok = (ex: number | undefined, ey: number | undefined) => {
    if (!v.room || !v.exit) return true
    if (v.exit.x !== undefined) return ex === v.exit.x
    return ey === v.exit.y
  }
  if (x === 0 && ok(-1, undefined)) return 'left'
  if (x === COMBAT_SIZE - 1 && ok(COMBAT_SIZE, undefined)) return 'right'
  if (y === 0 && ok(undefined, -1)) return 'up'
  if (y === COMBAT_SIZE - 1 && ok(undefined, COMBAT_SIZE)) return 'down'
  return null
}

/**
 * Plan the active member's turn. With `goal` 'fight' it attacks anything in
 * reach, otherwise closes in; once no monsters remain (or with 'flee') it heads
 * for the edge and steps off.
 */
export function planCombatTurn(v: CombatView, goal: 'fight' | 'flee' = 'fight'): CombatAction {
  const me = v.party[v.me]
  if (!me) return { kind: 'pass' }
  const support = v.support ? supportSpell(v, me) : null
  if (support) return support
  if (goal === 'fight' && v.monsters.length) {
    const dir = attackDir(v, me)
    if (dir) return { kind: 'attack', dir }
    const step = firstStep(v, (x, y) => attackDir(v, { x, y }))
    return step ? { kind: 'move', dir: step } : { kind: 'pass' }
  }
  if (v.prefer && !v.exit) {
    const want = (x: number, y: number) => (exitDir(v, x, y) === v.prefer ? v.prefer : null)
    if (want(me.x, me.y)) return { kind: 'move', dir: v.prefer }
    const step = firstStep(v, want)
    if (step) return { kind: 'move', dir: step }
    // the side we want is closed: a trigger may open it
    if (v.triggers?.length) {
      const toTrigger = firstStep(v, (x, y) => (v.triggers!.some((t) => t.x === x && t.y === y) ? 'up' : null))
      if (toTrigger) return { kind: 'move', dir: toTrigger }
    }
  }
  const out = exitDir(v, me.x, me.y)
  if (out) return { kind: 'move', dir: out }
  const step = firstStep(v, (x, y) => exitDir(v, x, y))
  return step ? { kind: 'move', dir: step } : { kind: 'pass' }
}
