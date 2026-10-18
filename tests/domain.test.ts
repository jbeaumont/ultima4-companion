import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { PartySave } from '@parsers/party'
import { parseWorldMap, WORLD_SIZE } from '@parsers/worldMap'
import { bucketTimer, cooldowns, reagentTimer } from '@domain/cooldowns'
import { MOONGATES, MOON_STEPS, cycleStep, gateState, phasesAt, stepsUntilRoute, upcomingGates } from '@domain/moongates'
import { ENTRANCES } from '@domain/places'
import { progress } from '@domain/progress'
import { ITEM_FLAGS, LOCATIONS } from '@domain/constants'
import { gameFile, hasGame } from './gameFiles'

const blank = (): PartySave => parsePartySav(new Uint8Array(PARTY_SAV_SIZE))

describe('cooldowns', () => {
  it('bucket timers become ready when the bucket changes', () => {
    expect(bucketTimer(250, 100, 2)).toEqual({ ready: false, movesLeft: 50 })
    expect(bucketTimer(300, 100, 2)).toEqual({ ready: true, movesLeft: 0 })
    expect(bucketTimer(0x10000 * 100, 100, 0)).toMatchObject({ ready: true }) // overflow always ready
    expect(bucketTimer(33, 16, 2)).toEqual({ ready: false, movesLeft: 15 })
  })

  it('reagent window uses moves & 0xF0', () => {
    expect(reagentTimer(0x125, 0x20)).toEqual({ ready: false, movesLeft: 11 })
    expect(reagentTimer(0x130, 0x20)).toEqual({ ready: true, movesLeft: 0 })
  })

  it('reagent search also needs both moons new', () => {
    const p = { ...blank(), moves: 0x130, lastReagent: 0x20, trammel: 0, felucca: 0 }
    expect(cooldowns(p).reagent.canSearch).toBe(true)
    expect(cooldowns({ ...p, felucca: 1 }).reagent).toMatchObject({ ready: true, newMoons: false, canSearch: false })
  })
})

describe('moongates', () => {
  it('maps every step of the 24-step cycle to a unique phase pair', () => {
    const seen = new Set<string>()
    for (let s = 0; s < MOON_STEPS; s++) {
      const { trammel, felucca } = phasesAt(s)
      expect(cycleStep(trammel, felucca)).toBe(s)
      seen.add(`${trammel},${felucca}`)
    }
    expect(seen.size).toBe(MOON_STEPS)
    expect(cycleStep(0, 5)).toBeNull() // never happens
  })

  it('Trammel picks the open gate, Felucca the destination', () => {
    const g = gateState(1, 3)
    expect(g.open.near).toBe('Britain')
    expect(g.destination.near).toBe('Yew')
    expect(gateState(4, 4).spirituality).toBe(true)
  })

  it('looks ahead and finds routes', () => {
    const next = upcomingGates(0, 0, 3)
    expect(next.map((n) => [n.trammel, n.felucca])).toEqual([[0, 1], [0, 2], [1, 3]])
    expect(stepsUntilRoute(0, 0, 0, 0)).toBe(0)
    expect(stepsUntilRoute(0, 0, 4, 4)).toBe(12)
    expect(stepsUntilRoute(0, 0, 0, 7)).toBeNull()
  })
})

describe('progress', () => {
  it('counts avatarhood, runes, stones and Abyss readiness', () => {
    const p = blank()
    p.karma = [0, 0, 0, 0, 0, 0, 0, 0]
    p.runes = 0xff
    p.stones = 0xff
    p.items = ITEM_FLAGS.keyC | ITEM_FLAGS.keyL | ITEM_FLAGS.keyT | ITEM_FLAGS.bell | ITEM_FLAGS.book | ITEM_FLAGS.candleUsed
    const r = progress(p)
    expect(r.avatarCount).toBe(8)
    expect(r.abyssReady).toBe(true)
    expect(r.requiredDone).toBe(r.requiredTotal)

    p.stones = 0x7f
    expect(progress(p).abyssReady).toBe(false)
  })

  it('a fresh party has no partial Avatarhoods', () => {
    const p = { ...blank(), karma: [50, 50, 50, 50, 50, 50, 50, 50] }
    expect(progress(p).avatarCount).toBe(0)
    expect(progress(p).abyssReady).toBe(false)
  })
})

describe.skipIf(!hasGame)('places vs WORLD.MAP (real install)', () => {
  // the block body still runs when skipped, so only read the install when it exists
  const world = hasGame ? parseWorldMap(gameFile('WORLD.MAP')) : new Uint8Array(0)
  const at = (x: number, y: number) => world[y * WORLD_SIZE + x]!

  it('every entrance sits on a matching terrain tile', () => {
    for (const [id, { x, y }] of Object.entries(ENTRANCES)) {
      const kind = LOCATIONS[Number(id)]!.kind
      const tile = at(x, y)
      if (kind === 'dungeon' && Number(id) !== 24) expect(tile, `${id}`).toBe(9)
      if (kind === 'town') expect([10, 12, 29], `${id}`).toContain(tile) // 29 = ruins (Magincia)
      if (kind === 'castle') expect([11, 14], `${id}`).toContain(tile)
    }
  })

  it('moongates stand on walkable ground, not water or mountains', () => {
    for (const g of MOONGATES) expect([0, 1, 2, 8], g.near).not.toContain(at(g.x, g.y))
  })
})
