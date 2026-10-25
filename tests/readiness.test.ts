// Readiness steps (#72): recommended levels, supplies and ships for the next goals.
import { describe, expect, it } from 'vitest'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { PartySave } from '@parsers/party'
import { parseWorldMap, WORLD_SIZE } from '@parsers/worldMap'
import { HINTS } from '@domain/hints'
import { ENTRANCES, SECRET_SPOTS } from '@domain/places'
import { stepCost } from '@domain/walkable'
import { gameFile, hasGame } from './gameFiles'
import { NOT_ON_FOOT_PLACES, needsShip, readinessSteps, recommendedLevel } from '@domain/readiness'

const topic = (id: string) => HINTS.find((h) => h.id === id)!

function party(level: number, extra: Partial<PartySave> = {}): PartySave {
  const blank = parsePartySav(new Uint8Array(PARTY_SAV_SIZE))
  const me = { ...blank.allRecords[0]!, name: 'Avatar', hp: level * 100, hpMax: level * 100, status: 'G' }
  const mixtures = blank.mixtures.map(() => 0)
  mixtures[2] = 3; mixtures[7] = 3; mixtures[3] = 2 // Cure, Heal, Dispel
  return { ...blank, allRecords: [me, ...blank.allRecords.slice(1)], members: [me], memberCount: 1, torches: 5, transport: 0x1f, mixtures, ...extra }
}

describe('readiness', () => {
  it('recommends the levels the test parties managed', () => {
    expect(recommendedLevel(5)).toBe(2) // Despise, level 2 party
    expect(recommendedLevel(7)).toBe(3) // Destard, level 3 party
  })

  it('says to grow stronger before a deep stone, naming the dungeon only at Full', () => {
    const red = topic('stone-red') // Destard, altar on level 7
    const nudge = readinessSteps(party(2), 'nudges', [red])
    expect(nudge.map((s) => s.id)).toEqual(['readiness-strength'])
    expect(nudge[0]!.detail).not.toMatch(/Destard|level 7/)
    expect(readinessSteps(party(2), 'full', [red])[0]!.detail).toMatch(/level 7 of Destard/)
    expect(readinessSteps(party(3), 'nudges', [red])).toEqual([])
  })

  it('asks for supplies before a dungeon when healing or light runs short', () => {
    const p = party(3)
    p.mixtures[2] = 0
    p.mixtures[7] = 1
    expect(readinessSteps(p, 'nudges', [topic('stone-red')])[0]).toMatchObject({ id: 'readiness-supplies' })
  })

  it('says a ship is needed for goals out of reach on foot, unless aboard one', () => {
    expect(needsShip(topic('item-bell'))).toBe(true)
    expect(needsShip(topic('rune-honesty'))).toBe(false) // Moonglow: a moongate reaches it
    expect(readinessSteps(party(3), 'nudges', [topic('item-bell')]).map((s) => s.id)).toEqual(['readiness-ship'])
    expect(readinessSteps(party(3, { transport: 0x10 }), 'nudges', [topic('item-bell')])).toEqual([])
    expect(readinessSteps(party(3), 'nudges', [topic('item-bell')])[0]!.detail).not.toMatch(/pirate/) // how to get one: Full only
  })
})

describe.skipIf(!hasGame)('places out of reach on foot, from the world map (real install)', () => {
  it('matches a walk from Britain plus the moongates', () => {
    const map = parseWorldMap(gameFile('WORLD.MAP'))
    const at = (x: number, y: number) => map[((y + 256) % 256) * WORLD_SIZE + ((x + 256) % 256)]!
    const gates = [[224, 133], [96, 102], [38, 224], [50, 37], [166, 19], [104, 194], [23, 126], [187, 167]]
    const seen = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
    const q = [[ENTRANCES[1]!.x, ENTRANCES[1]!.y], ...gates] as [number, number][]
    for (const [x, y] of q) seen[y * WORLD_SIZE + x] = 1
    while (q.length) {
      const [x, y] = q.pop()!
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = (x + dx + 256) % 256, ny = (y + dy + 256) % 256
        if (seen[ny * WORLD_SIZE + nx] || stepCost(at(nx, ny)) === null) continue
        seen[ny * WORLD_SIZE + nx] = 1
        q.push([nx, ny])
      }
    }
    const reached = (x: number, y: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[(y + dy!) * WORLD_SIZE + x + dx!])
    const cutOff = Object.entries(ENTRANCES).filter(([, e]) => !reached(e.x, e.y)).map(([id]) => Number(id)).sort((a, b) => a - b)
    expect(cutOff).toEqual([...NOT_ON_FOOT_PLACES].sort((a, b) => a - b))
    for (const k of ['bell', 'wheel', 'skull', 'horn', 'whiteStone'] as const) expect(reached(SECRET_SPOTS[k].x, SECRET_SPOTS[k].y), k).toBe(false)
  })
})
