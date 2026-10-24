import { describe, expect, it } from 'vitest'
import { COMBAT_SIZE, planCombatTurn, weaponReach } from '../src/domain/combatPlan'
import type { CombatView } from '../src/domain/combatPlan'
import { dungeonPlan, dungeonRoute, dungeonStepCost, stepKeys } from '../src/domain/dungeonRoute'
import { parseDng } from '../src/parsers/dungeon'
import { gameFile, hasGame } from './gameFiles'

const GRASS = 0x04
const WALL = 0x7f
const BRICK = 0x3e

function view(over: Partial<CombatView> = {}, fill = GRASS): CombatView {
  return {
    map: new Uint8Array(COMBAT_SIZE * COMBAT_SIZE).fill(fill),
    monsters: [],
    party: [{ x: 5, y: 5 }],
    me: 0,
    reach: [1, 1],
    room: false,
    exit: null,
    ...over
  }
}

describe('planCombatTurn', () => {
  it('attacks an adjacent monster', () => {
    expect(planCombatTurn(view({ monsters: [{ x: 6, y: 5 }] }))).toEqual({ kind: 'attack', dir: 'right' })
    expect(planCombatTurn(view({ monsters: [{ x: 5, y: 4 }] }))).toEqual({ kind: 'attack', dir: 'up' })
  })

  it('closes in on a distant monster', () => {
    expect(planCombatTurn(view({ monsters: [{ x: 5, y: 9 }] }))).toEqual({ kind: 'move', dir: 'down' })
  })

  it('shoots along a line with a ranged weapon, but not through walls', () => {
    const v = view({ monsters: [{ x: 9, y: 5 }], reach: weaponReach(7) })
    expect(planCombatTurn(v)).toEqual({ kind: 'attack', dir: 'right' })
    v.map[5 * COMBAT_SIZE + 7] = WALL
    expect(planCombatTurn(v).kind).toBe('move')
  })

  it('routes around other party members and walls', () => {
    const v = view({ monsters: [{ x: 5, y: 2 }], party: [{ x: 5, y: 5 }, { x: 5, y: 4 }] })
    const a = planCombatTurn(v)
    expect(a.kind).toBe('move')
    expect(a.kind === 'move' && a.dir).not.toBe('up')
  })

  it('a halberd hits two cells away, not adjacent', () => {
    expect(weaponReach(10)).toEqual([2, 2])
    expect(planCombatTurn(view({ monsters: [{ x: 7, y: 5 }], reach: [2, 2] }))).toEqual({ kind: 'attack', dir: 'right' })
  })

  it('leaves by the nearest edge when fleeing or when no monsters remain', () => {
    expect(planCombatTurn(view({ party: [{ x: 0, y: 5 }] }))).toEqual({ kind: 'move', dir: 'left' })
    expect(planCombatTurn(view({ party: [{ x: 9, y: 5 }], monsters: [{ x: 1, y: 1 }] }), 'flee')).toEqual({ kind: 'move', dir: 'right' })
  })

  it('in a room, follows the side the first member left by', () => {
    // room walls all round except an opening at the bottom middle and one on the left
    const v = view({ room: true, party: [{ x: 5, y: 9 }], exit: { x: -1 } }, BRICK)
    for (let i = 0; i < COMBAT_SIZE; i++) {
      v.map[i] = WALL
      v.map[(COMBAT_SIZE - 1) * COMBAT_SIZE + i] = WALL
      v.map[i * COMBAT_SIZE] = WALL
      v.map[i * COMBAT_SIZE + COMBAT_SIZE - 1] = WALL
    }
    v.map[(COMBAT_SIZE - 1) * COMBAT_SIZE + 5] = BRICK
    v.map[5 * COMBAT_SIZE] = BRICK
    const a = planCombatTurn(v)
    expect(a.kind).toBe('move')
    expect(a.kind === 'move' && a.dir).not.toBe('down') // not out through the bottom opening
    expect(planCombatTurn({ ...v, exit: null })).toEqual({ kind: 'move', dir: 'down' })
    // free to choose: a preferred side wins over the nearer one
    expect(planCombatTurn({ ...v, exit: null, prefer: 'left' }).kind === 'move').toBe(true)
    expect(planCombatTurn({ ...v, exit: null, prefer: 'left' })).not.toEqual({ kind: 'move', dir: 'down' })
  })
})

describe('room triggers', () => {
  it('dispels an energy field between the party and the trigger or exit it needs', () => {
    const mix = Array.from({ length: 26 }, (_, i) => (i === 3 ? 1 : 0))
    // a corridor at row 5 to the west edge, blocked by an energy field at 3,5
    const v = view({ room: true, party: [{ x: 4, y: 5 }], prefer: 'left', support: { members: [{ hp: 200, hpMax: 200, status: 'G' }], mp: 30, mixtures: mix } }, 0x7f)
    for (let x = 0; x <= 4; x++) v.map[5 * COMBAT_SIZE + x] = 0x16
    v.map[5 * COMBAT_SIZE + 3] = 0x45
    expect(planCombatTurn(v)).toEqual({ kind: 'cast', spell: 'dispel', dir: 'left' })
    // without the mixture it can only wait
    expect(planCombatTurn({ ...v, support: { ...v.support!, mixtures: mix.map(() => 0) } }).kind).not.toBe('cast')
  })

  it('waits for a party member on a one-wide way out instead of taking another side', () => {
    // a corridor at x=5 leads north; Danny stands in it, Iolo waits below
    const v = view({ room: true, party: [{ x: 5, y: 3 }, { x: 5, y: 6 }], me: 1, prefer: 'up' }, 0x7f)
    for (let y = 0; y <= 10; y++) v.map[y * COMBAT_SIZE + 5] = 0x16
    for (let x = 0; x <= 10; x++) v.map[6 * COMBAT_SIZE + x] = 0x16 // an open row to the west and east edges
    expect(planCombatTurn(v)).toEqual({ kind: 'pass' })
  })

  it('steps on a trigger when the preferred side is closed', () => {
    const v = view({ room: true, party: [{ x: 5, y: 8 }], prefer: 'up', triggers: [{ x: 3, y: 8 }] }, 0x16)
    for (let x = 0; x < COMBAT_SIZE; x++) v.map[x] = 0x7f // north edge closed
    expect(planCombatTurn(v)).toEqual({ kind: 'move', dir: 'left' })
  })
})

describe('battle spells', () => {
  const party = (over: Partial<{ hp: number; hpMax: number; status: string }>[]) => over.map((m) => ({ hp: 200, hpMax: 200, status: 'G', ...m }))
  const mixtures = (spells: Record<number, number>) => Array.from({ length: 26 }, (_, i) => spells[i] ?? 0)

  it('cures a poisoned member when the Cure mixture and the magic are there', () => {
    const v = view({ monsters: [{ x: 6, y: 5 }], support: { members: party([{}, { status: 'P' }]), mp: 20, mixtures: mixtures({ 2: 1 }) } })
    expect(planCombatTurn(v)).toEqual({ kind: 'cast', spell: 'cure', who: 1 })
  })

  it('heals first, and never casts without enough magic or a mixture', () => {
    const members = party([{ hp: 50 }, { status: 'P' }])
    expect(planCombatTurn(view({ support: { members, mp: 20, mixtures: mixtures({ 2: 1, 7: 1 }) } }))).toEqual({ kind: 'cast', spell: 'heal', who: 0 })
    expect(planCombatTurn(view({ monsters: [{ x: 6, y: 5 }], support: { members, mp: 4, mixtures: mixtures({ 2: 1, 7: 1 }) } })).kind).toBe('attack')
    expect(planCombatTurn(view({ monsters: [{ x: 6, y: 5 }], support: { members, mp: 50, mixtures: mixtures({}) } })).kind).toBe('attack')
  })

  it('fires a magic missile at a foe in line that weapons cannot reach', () => {
    const v = view({ monsters: [{ x: 5, y: 1 }], support: { members: party([{}]), mp: 10, mixtures: mixtures({ 12: 1 }) } })
    expect(planCombatTurn(v)).toEqual({ kind: 'cast', spell: 'missile', dir: 'up' })
  })
})

describe('dungeon routing', () => {
  it('walls and energy fields block; rooms only as the goal', () => {
    expect(dungeonStepCost(0xf0, false)).toBeNull()
    expect(dungeonStepCost(0xa1, false)).toBeNull()
    expect(dungeonStepCost(0xd3, false)).toBeNull()
    expect(dungeonStepCost(0xd3, true)).not.toBeNull()
    expect(dungeonStepCost(0x20, false)).toBe(1)
  })

  it('turns toward the next cell, then advances', () => {
    expect(stepKeys(1, 1)).toEqual(['up'])
    expect(stepKeys(1, 2)).toEqual(['right', 'up'])
    expect(stepKeys(1, 0)).toEqual(['left', 'up'])
    expect(stepKeys(0, 3)).toEqual(['left', 'up'])
    expect(stepKeys(1, 3)).toEqual(['right', 'right', 'up'])
  })

  it('wraps around the level edges', () => {
    const level = new Uint8Array(64).fill(0xf0)
    for (const x of [0, 6, 7]) level[3 * 8 + x] = 0x00
    expect(dungeonRoute(level, 6, 3, 0, 3)).toEqual([2, 2]) // east twice, wrapping
  })
})

describe('dungeon plans across levels', () => {
  const walls = () => new Uint8Array(64).fill(0xf0)
  it('takes a ladder down and walks to the target', () => {
    const l1 = walls(), l2 = walls()
    l1[0] = 0x10; l1[1] = 0x00; l1[2] = 0x20 // up-ladder (entrance), floor, ladder down at 2,0
    l2[2] = 0x10; l2[3] = 0x00; l2[4] = 0x00
    expect(dungeonPlan([l1, l2], { z: 0, x: 0, y: 0 }, { z: 1, x: 4, y: 0 })).toEqual([
      { z: 0, x: 2, y: 0, then: 'down' },
      { z: 1, x: 4, y: 0, then: null }
    ])
  })
  it('crosses an energy field only when allowed', () => {
    const l = walls()
    l[0] = 0x00; l[1] = 0xa1; l[2] = 0x00
    expect(dungeonPlan([l], { z: 0, x: 0, y: 0 }, { z: 0, x: 2, y: 0 })).toBeNull()
    expect(dungeonPlan([l], { z: 0, x: 0, y: 0 }, { z: 0, x: 2, y: 0 }, true)).toEqual([{ z: 0, x: 2, y: 0, then: null }])
  })
  it.skipIf(!hasGame)('Despise: the altar needs a Dispel (real install)', () => {
    const levels = parseDng(gameFile('DESPISE.DNG')).levels
    expect(dungeonPlan(levels, { z: 0, x: 1, y: 1 }, { z: 4, x: 3, y: 5 })).toBeNull()
    expect(dungeonPlan(levels, { z: 0, x: 1, y: 1 }, { z: 4, x: 3, y: 5 }, true)?.at(-1)).toEqual({ z: 4, x: 3, y: 5, then: null })
  })
})
