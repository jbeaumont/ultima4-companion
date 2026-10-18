import { describe, expect, it } from 'vitest'
import { findRoute } from '@domain/pathfind'
import type { Grid } from '@domain/pathfind'
import { parseUlt } from '@parsers/town'
import { parseWorldMap, WORLD_SIZE } from '@parsers/worldMap'
import { gameFile, hasGame } from './gameFiles'

// 4 = grass, 8 = mountains, 10 = town
const grid = (rows: string[], wrap = false): Grid => ({
  width: rows[0]!.length,
  height: rows.length,
  wrap,
  tileAt: (x, y) => ({ '.': 4, '#': 8, T: 10 })[rows[y]![x]!]!
})

describe('findRoute', () => {
  it('walks around obstacles', () => {
    const g = grid(['....', '.##.', '....'])
    expect(findRoute(g, 0, 1, 3, 1)).toHaveLength(5)
    expect(findRoute(g, 0, 0, 0, 0)).toEqual([])
  })

  it('wraps on the world map', () => {
    const g = grid(['....', '....'], true)
    expect(findRoute(g, 0, 0, 3, 0)).toEqual(['left'])
  })

  it('treats towns as destinations only and honours blocked cells', () => {
    const g = grid(['.T.', '...'])
    expect(findRoute(g, 0, 0, 2, 0)).toEqual(['down', 'right', 'right', 'up'])
    expect(findRoute(g, 0, 0, 1, 0)).toEqual(['right'])
    expect(findRoute(g, 0, 0, 2, 0, { blocked: new Set(['1,1']) })).toBeNull()
  })
})

describe.skipIf(!hasGame)('routes on the real maps', () => {
  it('reaches Moonglow from where Danny starts', () => {
    const world = parseWorldMap(gameFile('WORLD.MAP'))
    const g: Grid = { width: WORLD_SIZE, height: WORLD_SIZE, wrap: true, tileAt: (x, y) => world[y * WORLD_SIZE + x]! }
    const r = findRoute(g, 229, 131, 232, 135)
    expect(r).not.toBeNull()
    expect(r!.length).toBeLessThan(15)
  })

  it('reaches the Rune of Honesty spot inside Moonglow', () => {
    const town = parseUlt(gameFile('MOONGLOW.ULT'))
    const g: Grid = { width: 32, height: 32, wrap: false, tileAt: (x, y) => town.tiles[y * 32 + x]! }
    const r = findRoute(g, 1, 15, 8, 6)
    expect(r).not.toBeNull()
  })
})
