import { describe, expect, it } from 'vitest'
import { parseWorldMap, WORLD_SIZE } from '@parsers/worldMap'
import { parseShapes, TILE_COUNT, indicesToRgba } from '@parsers/shapes'
import { parseUlt } from '@parsers/town'
import { parseTlk } from '@parsers/talk'
import { decodeDungeonCell, parseCon, parseDng, parseDngMapSav } from '@parsers/dungeon'
import { parseMonstersSav } from '@parsers/monsters'
import { LOCATIONS } from '@domain/constants'
import { gameFile, hasGame } from './gameFiles'

describe('parseWorldMap (synthetic)', () => {
  it('reassembles row-major chunks', () => {
    const buf = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
    buf[1 * 1024 + 5 * 32 + 3] = 42 // chunk 1 = second chunk in the top row
    buf[8 * 1024] = 7 // chunk 8 = first chunk of the second row
    const tiles = parseWorldMap(buf)
    expect(tiles[5 * WORLD_SIZE + 32 + 3]).toBe(42)
    expect(tiles[32 * WORLD_SIZE]).toBe(7)
  })
})

describe('decodeDungeonCell', () => {
  it('splits feature and monster nibbles', () => {
    expect(decodeDungeonCell(0x40 | 0x6)).toMatchObject({ feature: 'chest', monster: 'Troll' })
    expect(decodeDungeonCell(0xd3)).toMatchObject({ feature: 'room', variant: 3, monster: null })
    expect(decodeDungeonCell(0xf0)).toMatchObject({ feature: 'wall', monster: null })
  })
})

describe.skipIf(!hasGame)('map files (real install)', () => {
  it('places towns and castles on the right world tiles', () => {
    const world = parseWorldMap(gameFile('WORLD.MAP'))
    const at = (x: number, y: number) => world[y * WORLD_SIZE + x]
    expect(at(86, 107)).toBe(14) // Lord British's castle entrance
    expect(at(82, 106)).toBe(10) // Britain
    expect(at(232, 135)).toBe(10) // Moonglow
  })

  it('decodes all 256 tiles', () => {
    const tiles = parseShapes(gameFile('SHAPES.EGA'))
    expect(tiles).toHaveLength(TILE_COUNT)
    expect(tiles.every((t) => t.length === 256 && t.every((p) => p < 16))).toBe(true)
    expect(indicesToRgba(tiles[31]!)).toHaveLength(256 * 4)
  })

  it('parses every settlement and links NPCs to dialogue', () => {
    for (const loc of Object.values(LOCATIONS)) {
      if (!loc.file?.endsWith('.ULT') || !loc.talk) continue
      const town = parseUlt(gameFile(loc.file))
      const talk = parseTlk(gameFile(loc.talk))
      expect(town.tiles).toHaveLength(1024)
      expect(town.npcs.length).toBeGreaterThan(0)
      expect(talk.length).toBeGreaterThan(0)
      const indices = new Set(talk.map((c) => c.index))
      for (const npc of town.npcs) {
        if (npc.talkIndex > 0 && npc.talkIndex <= 16) {
          expect(indices.has(npc.talkIndex), `${loc.file} slot ${npc.slot}`).toBe(true)
        }
      }
    }
  })

  it('reads Britain dialogue', () => {
    const talk = parseTlk(gameFile('BRITAIN.TLK'))
    const iolo = talk.find((c) => c.name === 'Iolo')
    expect(iolo).toBeDefined()
    expect(iolo!.pronoun).toBe('He')
    expect(iolo!.keyword1.length).toBeGreaterThan(0)
  })

  it('parses dungeons, rooms, dungeon state and battle maps', () => {
    const deceit = parseDng(gameFile('DECEIT.DNG'))
    expect(deceit.levels).toHaveLength(8)
    expect(deceit.rooms).toHaveLength(16)
    expect(deceit.levels.flatMap((l) => [...l]).some((c) => decodeDungeonCell(c).feature === 'ladderDown')).toBe(true)
    expect(parseDng(gameFile('ABYSS.DNG')).rooms).toHaveLength(64)
    expect(parseDngMapSav(gameFile('DNGMAP.SAV'))).toHaveLength(8)
    expect(parseCon(gameFile('GRASS.CON')).tiles).toHaveLength(121)
    expect(Array.isArray(parseMonstersSav(gameFile('MONSTERS.SAV')))).toBe(true)
  })
})
