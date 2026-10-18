import { describe, expect, it } from 'vitest'
import { COMBAT_SIZE, planCombatTurn, weaponReach } from '../src/domain/combatPlan'
import type { CombatView } from '../src/domain/combatPlan'
import { dungeonRoute, dungeonStepCost, stepKeys } from '../src/domain/dungeonRoute'

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
